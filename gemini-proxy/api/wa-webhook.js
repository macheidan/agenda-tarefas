// Webhook do WhatsApp Cloud API — é a Meta que chama, não a intranet.
// Faz três coisas: acompanha o status de cada mensagem (enviado → entregue →
// lido, ou falhou), registra resposta de cliente e processa descadastro.
//
// Envs (Vercel): FIREBASE_SERVICE_ACCOUNT, WA_VERIFY_TOKEN, WA_APP_SECRET
//   (+ WA_APP_SECRET_LOV quando a segunda WABA roda sob outro app)
//   (+ WA_TOKEN_*/WA_PHONE_ID_* e WA_ATENDIMENTO_* para a resposta automática)
//
// Configurar na Meta (Webhooks do produto WhatsApp):
//   URL: https://<projeto>.vercel.app/api/wa-webhook
//   Verify token: o mesmo valor de WA_VERIFY_TOKEN
//   Campos: messages
import crypto from 'node:crypto';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { app } from '../lib/auth.js';

// A assinatura é conferida sobre o corpo CRU: qualquer reserialização muda o
// HMAC e derruba requisição legítima.
export const config = { api: { bodyParser: false } };

const PALAVRAS_SAIR = ['sair', 'parar', 'pare', 'cancelar', 'descadastrar', 'stop', 'remover'];

const GRAPH = 'https://graph.facebook.com/v21.0';

// Espelho de todos os descadastros num doc só, para a tela ler de uma vez.
// Teto prático: são ~13 bytes por telefone, então o limite de 1 MB do Firestore
// só apertaria perto de 70 mil descadastros — ordens de grandeza acima da base.
const INDICE_OPTOUT = 'clientesMeta/optOut';

/**
 * Número que de fato ATENDE, por loja — em E.164, só dígitos (ex.: 555133322440).
 *
 * A conta que dispara campanha é um chip que não está aberto em aparelho nenhum:
 * é condição para ele registrar na Cloud API. Ninguém lê o que chega ali. O
 * template leva um botão de URL para o número de atendimento, mas quem digita
 * em vez de clicar falaria com uma parede — é esse buraco que a resposta
 * automática tapa. Sem a env configurada, nada é respondido.
 */
const ATENDIMENTO = { dame: 'WA_ATENDIMENTO_DAME', lov: 'WA_ATENDIMENTO_LOV' };

// Vai no `?text=` do link: quem chega ao número de atendimento com essa frase
// veio da campanha. É a única atribuição que sobra, já que o clique acontece
// numa conversa e não numa página com pixel.
const FRASE_ATRIBUICAO = 'Quero saber das novidades';

// Quebra de linha literal, isolada para o texto padrão ficar legível acima.
const QUEBRA = '\n';

// Uma resposta automática por número a cada 24h: sem isso, cliente que manda
// três mensagens seguidas recebe três vezes a mesma coisa.
const JANELA_AUTO_MS = 24 * 60 * 60 * 1000;

// Avanço de status: a Meta reentrega webhook, e sem essa ordem o mesmo evento
// contaria duas vezes nos totais.
const RANK = { enviado: 1, entregue: 2, lido: 3 };
const DE_META = { sent: 'enviado', delivered: 'entregue', read: 'lido', failed: 'erro' };
const CAMPO_TOTAL = { entregue: 'entregues', lido: 'lidos', erro: 'falhas' };

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

/**
 * Query string lida da URL, não de `req.query`.
 *
 * Com `bodyParser: false` o runtime da Vercel não monta os helpers da
 * requisição, e `req.query` chega vazio — o handshake do webhook comparava
 * `undefined` com o verify token e devolvia 403 para a Meta em qualquer
 * tentativa. Ler de `req.url` funciona nos dois casos.
 */
function query(req) {
  try {
    return new URL(req.url, 'http://localhost').searchParams;
  } catch {
    return new URLSearchParams();
  }
}

/**
 * Confere o HMAC contra TODOS os app secrets configurados.
 *
 * A assinatura é do APP que entregou o webhook, não da loja. Como cada BM só
 * pode reivindicar um app, a WABA do BM da Lov roda sob um app próprio, com
 * outro segredo — e as duas mandam para a mesma URL. Conferir só o
 * `WA_APP_SECRET` faria todo webhook do segundo app voltar 401, e o status de
 * entrega pararia em "enviado" sem nenhum erro visível.
 */
function assinaturaConfere(bruto, cabecalho) {
  const segredos = [process.env.WA_APP_SECRET, process.env.WA_APP_SECRET_LOV].filter(Boolean);
  if (!segredos.length) return false;
  const b = Buffer.from(String(cabecalho || ''));
  // Sem short-circuit: todos os segredos são conferidos, para o tempo de
  // resposta não dizer qual app assinou.
  return segredos.reduce((ok, segredo) => {
    const a = Buffer.from('sha256=' + crypto.createHmac('sha256', segredo).update(bruto).digest('hex'));
    return (a.length === b.length && crypto.timingSafeEqual(a, b)) || ok;
  }, false);
}

/**
 * Formas locais possíveis de um número que veio da Meta.
 *
 * Celular brasileiro antigo volta sem o 9 ("5551988887777" vira 5188887777),
 * e a base guarda com o 9. Sem cobrir as duas formas, um "SAIR" seria ignorado
 * justamente por quem pediu para sair.
 */
function variantesLocais(e164) {
  const so = String(e164 || '').replace(/\D/g, '');
  const local = so.startsWith('55') && so.length >= 12 ? so.slice(2) : so;
  const formas = new Set([local]);
  if (local.length === 10 && /[6-9]/.test(local[2])) formas.add(`${local.slice(0, 2)}9${local.slice(2)}`);
  if (local.length === 11 && local[2] === '9') formas.add(local.slice(0, 2) + local.slice(3));
  return [...formas];
}

function slotDoPhoneId(phoneId) {
  const alvo = String(phoneId || '');
  if (!alvo) return null;
  return ['dame', 'lov'].find((l) => process.env[`WA_PHONE_ID_${l.toUpperCase()}`] === alvo) || null;
}

/** Texto livre na janela de 24h: só vale porque o cliente acabou de escrever. */
async function enviarTexto(loja, para, texto) {
  const token = process.env[`WA_TOKEN_${loja.toUpperCase()}`];
  const phoneId = process.env[`WA_PHONE_ID_${loja.toUpperCase()}`];
  if (!token || !phoneId) return false;
  const resp = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: para,
      type: 'text',
      // preview_url falso de propósito: o cartão do wa.me rouba a atenção do texto.
      text: { preview_url: false, body: texto },
    }),
  });
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}));
    console.error('wa-webhook auto-resposta:', e?.error?.message || resp.status);
    return false;
  }
  return true;
}

/**
 * Textos das respostas automáticas, como o marketing os escreveu.
 *
 * Vivem em `campanhaConfig/mensagens` (a tela de Campanhas edita) e não no
 * código: trocar uma vírgula não pode exigir publicar o proxy. O que está aqui
 * é só o fallback de quando o documento ainda não existe.
 */
const PADRAO_MSG = {
  clicou:
    'Que bom que você quer saber! 🍕' + QUEBRA + QUEBRA +
    'Chama a gente aqui que a gente te conta tudo: {link}',
  digitou:
    'Oi! Este número só envia novidades e não é atendido por aqui 🙂' + QUEBRA + QUEBRA +
    'Para falar com a gente, chama no nosso WhatsApp: {link}' + QUEBRA + QUEBRA +
    'Se não quiser mais receber, responda SAIR.',
  saiu: 'Pronto! Você não vai mais receber nossas mensagens. 👋',
};

async function carregarMensagens(db) {
  try {
    const snap = await db.doc('campanhaConfig/mensagens').get();
    return snap.exists ? { ...PADRAO_MSG, ...snap.data() } : PADRAO_MSG;
  } catch (e) {
    // Falha de leitura não pode calar a resposta: melhor o texto padrão do
    // que deixar o cliente sem retorno nenhum.
    console.error('wa-webhook mensagens:', e);
    return PADRAO_MSG;
  }
}

/**
 * Preenche os marcadores do texto escolhido.
 *
 * `{link}` é o WhatsApp que de fato atende — ele mora aqui e não no template
 * porque a Meta RECUSA botão com link de WhatsApp dentro de um template
 * (medido em 10/09). Mensagem de sessão pode.
 */
function montarTexto(bruto, loja, nome) {
  if (!bruto) return '';
  const numero = String(process.env[ATENDIMENTO[loja]] || '').replace(/\D/g, '');
  const link = numero
    ? `https://wa.me/${numero}?text=${encodeURIComponent(FRASE_ATRIBUICAO)}`
    : '';
  // Sem número configurado, um texto que promete link viraria frase quebrada.
  if (!link && bruto.includes('{link}')) return '';
  return bruto.replace(/\{link\}/g, link).replace(/\{nome\}/g, nome || '').trim();
}

/**
 * Responde uma vez, e só quando há o que dizer.
 *
 * Quem pediu SAIR recebe a confirmação (uma única vez, na hora em que o
 * descadastro é criado) e nunca o convite para conversar — mandar link para
 * quem acabou de pedir para sair é o caminho curto para o bloqueio, e bloqueio
 * derruba a nota de qualidade do número.
 */
async function autoResposta(db, msg, valor, { saiu, optOutNovo }) {
  const loja = slotDoPhoneId(valor?.metadata?.phone_number_id);
  if (!loja) return;
  const para = String(msg.from || '').replace(/\D/g, '');
  if (!para) return;

  const msgs = await carregarMensagens(db);
  const nome = (valor?.contacts?.[0]?.profile?.name || '').trim().split(/\s+/)[0] || '';

  if (saiu) {
    if (!optOutNovo) return;
    const confirmacao = montarTexto(msgs.saiu, loja, nome);
    if (confirmacao) await enviarTexto(loja, para, confirmacao);
    return;
  }

  // `button` é o clique no Quick Reply do template; `text` é quem digitou.
  const texto = montarTexto(msg.type === 'button' ? msgs.clicou : msgs.digitou, loja, nome);
  if (!texto) return;

  const ref = db.doc(`campanhaAutoRespostas/${para}`);
  const snap = await ref.get();
  const ultimo = snap.exists ? snap.data()?.em?.toMillis?.() || 0 : 0;
  if (Date.now() - ultimo < JANELA_AUTO_MS) return;

  if (await enviarTexto(loja, para, texto)) {
    await ref.set({ telefone: para, loja, em: FieldValue.serverTimestamp() });
  }
}

async function tratarStatus(db, st) {
  const novo = DE_META[st.status];
  if (!novo) return;
  const achados = await db.collection('campanhaEnvios').where('wamid', '==', st.id).limit(1).get();
  if (achados.empty) return;
  const doc = achados.docs[0];
  const atual = doc.data().status;
  // 'erro' é terminal; os demais só andam pra frente.
  if (atual === 'erro') return;
  if (novo !== 'erro' && (RANK[novo] || 0) <= (RANK[atual] || 0)) return;

  await doc.ref.update({
    status: novo,
    atualizadoEm: FieldValue.serverTimestamp(),
    ...(novo === 'erro' ? { erro: st.errors?.[0]?.title || 'falha na entrega' } : {}),
  });
  const campo = CAMPO_TOTAL[novo];
  if (campo && doc.data().campanhaId) {
    await db.doc(`campanhas/${doc.data().campanhaId}`).set(
      { [campo]: FieldValue.increment(1) },
      { merge: true }
    );
  }
}

async function tratarMensagem(db, msg, valor) {
  const texto = (msg.text?.body || msg.button?.text || '').trim();
  const formas = variantesLocais(msg.from);
  const nome = valor?.contacts?.[0]?.profile?.name || '';

  // A Meta reentrega o mesmo webhook quando não recebe 200 a tempo. Sem esta
  // saída, a reentrega dispararia a resposta automática de novo — e o cliente
  // receberia a mesma mensagem duas vezes por uma falha nossa.
  const refResposta = db.doc(`campanhaRespostas/${msg.id}`);
  if ((await refResposta.get()).exists) return;

  await refResposta.set({
    telefone: formas[0],
    nome,
    texto: texto.slice(0, 1000),
    tipo: msg.type || 'text',
    recebidoEm: FieldValue.serverTimestamp(),
  });

  // Descadastro: grava todas as formas do número, senão o 9 a mais ou a menos
  // faz o cliente continuar recebendo depois de ter pedido para sair.
  const saiu = PALAVRAS_SAIR.includes(texto.toLowerCase().replace(/[^a-zà-ÿ]/gi, ''));
  let optOutNovo = false;
  if (saiu) {
    const jaEstava = (await db.doc(`clientesOptOut/${formas[0]}`).get()).exists;
    optOutNovo = !jaEstava;
    await Promise.all([
      ...formas.map((t) =>
        db.doc(`clientesOptOut/${t}`).set({
          telefone: t,
          motivo: 'pediu no WhatsApp',
          texto: texto.slice(0, 200),
          criadoEm: FieldValue.serverTimestamp(),
        })
      ),
      // Índice de um documento só. A tela precisa saber QUEM saiu para não
      // oferecer essa gente na cópia nem no disparo, e assinar a coleção inteira
      // custaria uma leitura por descadastro toda vez que alguém abre a aba —
      // numa conta que já bateu no teto do plano gratuito. Aqui é 1 leitura,
      // não importa o tamanho. O doc individual continua existindo: é ele que
      // guarda quando e por quê, e é ele que o servidor confere no envio.
      db.doc(INDICE_OPTOUT).set(
        { telefones: FieldValue.arrayUnion(...formas), atualizadoEm: FieldValue.serverTimestamp() },
        { merge: true }
      ),
    ]);
  }

  await autoResposta(db, msg, valor, { saiu, optOutNovo });
}

export default async function handler(req, res) {
  // Handshake de configuração do webhook no painel da Meta.
  if (req.method === 'GET') {
    const q = query(req);
    // As três falhas são separadas de propósito: "403 genérico" no handshake da
    // Meta não diz se o problema é a query não ter chegado, a env não existir ou
    // o valor divergir — e sem isso a depuração vira tentativa e erro.
    if (!q.get('hub.mode')) return res.status(400).send('sem parametros de verificacao');
    if (!process.env.WA_VERIFY_TOKEN) return res.status(500).send('WA_VERIFY_TOKEN nao configurado');
    if (q.get('hub.verify_token') !== process.env.WA_VERIFY_TOKEN) {
      return res.status(403).send('verify token nao confere');
    }
    return res.status(200).send(q.get('hub.challenge'));
  }
  if (req.method !== 'POST') return res.status(405).end();

  // Se o runtime já tiver consumido o stream, `req.rawBody` guarda os bytes.
  // A assinatura é sobre os bytes originais — reserializar o JSON mudaria o HMAC.
  let bruto = await lerCorpo(req);
  if (!bruto.length && req.rawBody) bruto = Buffer.from(req.rawBody);
  if (!assinaturaConfere(bruto, req.headers['x-hub-signature-256'])) {
    return res.status(401).send('assinatura inválida');
  }

  let corpo;
  try {
    corpo = JSON.parse(bruto.toString('utf8'));
  } catch {
    return res.status(400).send('json inválido');
  }

  app();
  const db = getFirestore();
  try {
    for (const entrada of corpo.entry || []) {
      for (const mudanca of entrada.changes || []) {
        const valor = mudanca.value || {};
        for (const st of valor.statuses || []) await tratarStatus(db, st);
        for (const msg of valor.messages || []) await tratarMensagem(db, msg, valor);
      }
    }
  } catch (e) {
    // 200 mesmo assim: a Meta reentrega em cima de erro e uma falha nossa de
    // gravação viraria fila de reentrega (e webhook desativado por falha).
    console.error('wa-webhook:', e);
  }
  return res.status(200).send('ok');
}
