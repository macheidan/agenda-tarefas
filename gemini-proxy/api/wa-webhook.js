// Webhook do WhatsApp Cloud API — é a Meta que chama, não a intranet.
// Faz três coisas: acompanha o status de cada mensagem (enviado → entregue →
// lido, ou falhou), registra resposta de cliente e processa descadastro.
//
// Envs (Vercel): FIREBASE_SERVICE_ACCOUNT, WA_VERIFY_TOKEN, WA_APP_SECRET
//   (+ WA_APP_SECRET_LOV quando a segunda WABA roda sob outro app)
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

  await db.doc(`campanhaRespostas/${msg.id}`).set({
    telefone: formas[0],
    nome,
    texto: texto.slice(0, 1000),
    tipo: msg.type || 'text',
    recebidoEm: FieldValue.serverTimestamp(),
  });

  // Descadastro: grava todas as formas do número, senão o 9 a mais ou a menos
  // faz o cliente continuar recebendo depois de ter pedido para sair.
  if (PALAVRAS_SAIR.includes(texto.toLowerCase().replace(/[^a-zà-ÿ]/gi, ''))) {
    await Promise.all(
      formas.map((t) =>
        db.doc(`clientesOptOut/${t}`).set({
          telefone: t,
          motivo: 'pediu no WhatsApp',
          texto: texto.slice(0, 200),
          criadoEm: FieldValue.serverTimestamp(),
        })
      )
    );
  }
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
