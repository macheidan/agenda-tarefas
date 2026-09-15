// Envio de campanha pelo WhatsApp Cloud API (Meta), sem BSP no meio.
// O token permanente e o phone_number_id de cada loja vivem SÓ aqui, em env —
// o browser nunca os vê. Quem chama precisa de ID token do Firebase e da flag
// `clientesEnviar` em settings/{uid}.
//
// Envs (Vercel): FIREBASE_SERVICE_ACCOUNT, ADMIN_EMAIL,
//   WA_TOKEN_DAME, WA_PHONE_ID_DAME, WA_TOKEN_LOV, WA_PHONE_ID_LOV
//
// A tela dispara em LOTES (o navegador chama este endpoint várias vezes): uma
// função serverless não aguenta 500 envios numa requisição só, e em lote o
// progresso aparece na tela e a campanha pode ser retomada de onde parou.
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { cors, autenticar, app } from '../lib/auth.js';

const GRAPH = 'https://graph.facebook.com/v21.0';
const LOTE_MAX = 20;
const CONCORRENCIA = 5;

// Nome de template do WhatsApp: minúsculas, número e underscore.
const TEMPLATE_OK = /^[a-z0-9_]{1,512}$/;

function credenciais(loja) {
  const sufixo = loja.toUpperCase();
  const token = process.env[`WA_TOKEN_${sufixo}`];
  const phoneId = process.env[`WA_PHONE_ID_${sufixo}`];
  const waba = process.env[`WA_WABA_${sufixo}`];
  return token && phoneId ? { token, phoneId, waba } : null;
}

/**
 * O que o template exige além do nome do cliente.
 *
 * Um botão "copiar código da oferta" (COPY_CODE) é parâmetro OBRIGATÓRIO no
 * envio: sem ele a Meta recusa a mensagem inteira com
 * `(#131008) Required parameter is missing` — sem dizer qual parâmetro, o que
 * torna o erro difícil de ligar ao botão que alguém adicionou no painel horas
 * antes. Por isso o servidor lê o template e monta sozinho o que falta, em vez
 * de confiar que quem dispara sabe o que tem lá dentro.
 *
 * O índice do botão importa e é posicional: o COPY_CODE do template do cupom é
 * o segundo botão, depois do de URL.
 *
 * Cache no escopo do módulo: a função serverless reaproveita entre os lotes de
 * uma mesma campanha, então uma consulta serve para as 800 mensagens.
 */
const cacheTemplate = new Map();

async function lerTemplate({ token, waba }, nome, idioma) {
  if (!waba) return null;
  const chave = `${waba}/${nome}/${idioma}`;
  if (cacheTemplate.has(chave)) return cacheTemplate.get(chave);
  try {
    const url = `${GRAPH}/${waba}/message_templates?fields=name,language,components&name=${encodeURIComponent(nome)}&limit=20`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await resp.json().catch(() => ({}));
    const achado =
      (data?.data || []).find((t) => t.name === nome && t.language === idioma) ||
      (data?.data || []).find((t) => t.name === nome) ||
      null;
    cacheTemplate.set(chave, achado);
    return achado;
  } catch (e) {
    // Sem o template, seguimos com o envio simples: pior falhar como falhava
    // antes do que não enviar nada por causa de uma consulta.
    console.error('wa-send lerTemplate:', e);
    return null;
  }
}

/**
 * Componentes que o template exige além do corpo: a mídia do cabeçalho e o
 * código do cupom.
 *
 * Cabeçalho de IMAGEM/VÍDEO/DOCUMENTO também é parâmetro obrigatório no envio,
 * e a falta dele volta como `(#132012) Parameter format does not match format
 * in the created template` — de novo sem apontar o cabeçalho. Aconteceu no
 * `diadocliente_lov` em 15/09. A mídia é a de exemplo aprovada com o template
 * (a mesma que o revisor viu).
 *
 * Ela NÃO vai como `link`: o exemplo é URL assinada do CDN da Meta, que baixa
 * normalmente de fora, mas o WhatsApp recusa buscar — a Meta aceita o envio e
 * o webhook volta "Media upload error" segundos depois (medido em 15/09). Por
 * isso o servidor baixa a mídia e sobe em `/{phoneId}/media`, mandando só o
 * `id`. O id vale 30 dias e fica em cache no módulo: um upload por campanha.
 */
const cacheMidia = new Map();

// Teto de imagem do WhatsApp é 5 MB; a folga cobre o multipart.
const LIMITE_IMAGEM = 4.8 * 1024 * 1024;

/** JPEG de até 1600 px no lado maior, baixando a qualidade até caber. */
async function reduzirImagem(buffer) {
  // Import sob demanda: o sharp é pesado e só entra quando a imagem estoura.
  const { default: sharp } = await import('sharp');
  for (const [lado, qualidade] of [[1600, 85], [1600, 72], [1280, 70], [1080, 60]]) {
    const saida = await sharp(buffer)
      .rotate()
      .resize({ width: lado, height: lado, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: qualidade, mozjpeg: true })
      .toBuffer();
    if (saida.length <= LIMITE_IMAGEM) return new Blob([saida], { type: 'image/jpeg' });
  }
  throw new Error('imagem do cabeçalho continua acima de 5 MB mesmo reduzida');
}

async function subirMidia({ token, phoneId }, link) {
  const chave = `${phoneId}/${link}`;
  if (cacheMidia.has(chave)) return cacheMidia.get(chave);
  const orig = await fetch(link);
  if (!orig.ok) throw new Error(`download da mídia: HTTP ${orig.status}`);
  let blob = await orig.blob();
  let tipo = blob.type || 'image/jpeg';
  // O WhatsApp recusa imagem acima de 5 MB ("Arquivo muito grande"), mas o
  // modelo aceita cadastrar maior: o `diadocliente_dame` subiu com 12 MB em
  // 15/09 e todo envio voltou "Media upload error". Reduz aqui em vez de
  // depender de quem monta o modelo lembrar do limite.
  if (tipo.startsWith('image/') && blob.size > LIMITE_IMAGEM) {
    blob = await reduzirImagem(Buffer.from(await blob.arrayBuffer()));
    tipo = 'image/jpeg';
  }
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', tipo);
  form.append('file', blob, `cabecalho.${tipo.split('/')[1] || 'jpg'}`);
  const resp = await fetch(`${GRAPH}/${phoneId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await resp.json().catch(() => ({}));
  if (!data?.id) throw new Error(data?.error?.message || `upload da mídia: HTTP ${resp.status}`);
  cacheMidia.set(chave, data.id);
  return data.id;
}

class ErroMidia extends Error {}

async function componentesExtras(cred, tpl, cupom, botaoUrl) {
  const extras = [];
  const header = (tpl?.components || []).find((c) => c.type === 'HEADER');
  const midia = { IMAGE: 'image', VIDEO: 'video', DOCUMENT: 'document' }[header?.format];
  const link = header?.example?.header_handle?.[0];
  if (midia && link) {
    // Upload falhou = para tudo, com o motivo. Já houve fallback para o `link`
    // aqui, mas ele NUNCA funciona (a Meta aceita e o webhook volta "Media
    // upload error" segundos depois): a tela mostrava "Enviado!" e o cliente
    // não recebia nada. Uma campanha inteira sairia assim.
    let id;
    try {
      id = await subirMidia(cred, link);
    } catch (e) {
      console.error('wa-send subirMidia:', e);
      throw new ErroMidia(`imagem do cabeçalho: ${e.message}`);
    }
    extras.push({ type: 'header', parameters: [{ type: midia, [midia]: { id } }] });
  }

  const botoes = (tpl?.components || []).find((c) => c.type === 'BUTTONS')?.buttons || [];
  botoes.forEach((b, i) => {
    // Botão "Acessar o site" com URL dinâmica (`…/{{1}}`): o sufixo também é
    // parâmetro obrigatório, e falta dele volta como o mesmo #131008 mudo.
    // Com URL fixa não há parâmetro — a Meta usa a do modelo e recusaria um.
    // Aceita a URL inteira (tira o prefixo do modelo) ou só o sufixo.
    if (b.type === 'URL') {
      if (!/\{\{\d+\}\}/.test(b.url || '')) return;
      const prefixo = b.url.split(/\{\{\d+\}\}/)[0];
      const sufixoDe = (u) => {
        const s = String(u || '').trim();
        return s.startsWith(prefixo) ? s.slice(prefixo.length) : s;
      };
      const sufixo = sufixoDe(botaoUrl) || sufixoDe(b.example?.[0]);
      if (!sufixo) return;
      extras.push({
        type: 'button',
        sub_type: 'url',
        index: String(i),
        parameters: [{ type: 'text', text: sufixo }],
      });
      return;
    }
    if (b.type !== 'COPY_CODE') return;
    // Sem cupom informado na tela, vale o exemplo aprovado com o template —
    // que é o código que o revisor da Meta viu.
    const codigo = String(cupom || b.example?.[0] || '').trim();
    if (!codigo) return;
    extras.push({
      type: 'button',
      sub_type: 'copy_code',
      index: String(i),
      parameters: [{ type: 'coupon_code', coupon_code: codigo }],
    });
  });
  return extras;
}

/** Manda um template e devolve o wamid, ou o erro que a Meta explicou. */
async function enviarUm({ token, phoneId }, telefone, template, idioma, nome, extras = []) {
  const componentes = [
    // {{1}} = primeiro nome. Template sem variável ignora componente vazio,
    // por isso só mandamos o body quando há nome.
    ...(nome ? [{ type: 'body', parameters: [{ type: 'text', text: nome }] }] : []),
    ...extras,
  ];
  const resp = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefone,
      type: 'template',
      template: {
        name: template,
        language: { code: idioma },
        ...(componentes.length ? { components: componentes } : {}),
      },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const e = data?.error || {};
    return { ok: false, erro: e.message || `HTTP ${resp.status}`, codigo: e.code ?? null };
  }
  return { ok: true, wamid: data?.messages?.[0]?.id || null };
}

/** Roda as tarefas com concorrência limitada, preservando a ordem do resultado. */
async function emParalelo(itens, limite, tarefa) {
  const saida = new Array(itens.length);
  let cursor = 0;
  const trabalhador = async () => {
    while (cursor < itens.length) {
      const i = cursor++;
      saida[i] = await tarefa(itens[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return saida;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'método não permitido' });

  const usuario = await autenticar(req, res, 'clientesEnviar');
  if (!usuario) return;

  const {
    campanhaId, loja, template, idioma = 'pt_BR', destinatarios, meta, cupom, botaoUrl,
  } = req.body || {};
  if (!campanhaId || typeof campanhaId !== 'string') {
    return res.status(400).json({ error: 'campanhaId ausente' });
  }
  if (!['dame', 'lov'].includes(loja)) return res.status(400).json({ error: 'loja inválida' });
  if (!TEMPLATE_OK.test(String(template || ''))) {
    return res.status(400).json({ error: 'nome de template inválido' });
  }
  if (!Array.isArray(destinatarios) || !destinatarios.length) {
    return res.status(400).json({ error: 'lote vazio' });
  }
  if (destinatarios.length > LOTE_MAX) {
    return res.status(400).json({ error: `lote acima de ${LOTE_MAX}` });
  }

  const cred = credenciais(loja);
  if (!cred) return res.status(503).json({ error: `WhatsApp da ${loja} não configurado` });

  app();
  const db = getFirestore();

  // Uma consulta por lote (cacheada entre lotes): descobre se o template exige
  // mídia no cabeçalho ou o código do cupom — parâmetros cuja falta a Meta
  // reporta com erros que não dizem qual parâmetro é.
  const tpl = await lerTemplate(cred, template, idioma);
  let extras;
  try {
    extras = await componentesExtras(cred, tpl, cupom, String(botaoUrl || '').slice(0, 2000));
  } catch (e) {
    if (e instanceof ErroMidia) return res.status(502).json({ error: e.message });
    throw e;
  }

  // Telefone é só dígitos com DDI: a base guarda DDD+número, o wa.me e a Meta
  // querem o 55 na frente.
  const lote = destinatarios
    .map((d) => ({
      telefone: String(d.telefone || '').replace(/\D/g, ''),
      nome: String(d.nome || '').slice(0, 60),
    }))
    .filter((d) => d.telefone.length >= 10)
    .map((d) => ({
      ...d,
      e164: d.telefone.startsWith('55') && d.telefone.length >= 12 ? d.telefone : `55${d.telefone}`,
    }));

  // Descadastrados e quem já recebeu esta campanha saem antes de gastar mensagem.
  const refsOptOut = lote.map((d) => db.doc(`clientesOptOut/${d.telefone}`));
  const refsEnvio = lote.map((d) => db.doc(`campanhaEnvios/${campanhaId}__${d.telefone}`));
  const [optOuts, envios] = await Promise.all([
    db.getAll(...refsOptOut),
    db.getAll(...refsEnvio),
  ]);

  const resultados = await emParalelo(lote, CONCORRENCIA, async (d, i) => {
    if (optOuts[i].exists) return { telefone: d.telefone, ok: false, pulado: 'optout' };
    const jaFoi = envios[i].exists && envios[i].data().status !== 'erro';
    if (jaFoi) return { telefone: d.telefone, ok: true, pulado: 'repetido' };

    const r = await enviarUm(cred, d.e164, template, idioma, d.nome, extras);
    await refsEnvio[i].set(
      {
        campanhaId,
        loja,
        telefone: d.telefone,
        nome: d.nome,
        status: r.ok ? 'enviado' : 'erro',
        wamid: r.wamid || null,
        erro: r.ok ? null : r.erro,
        codigoErro: r.ok ? null : r.codigo,
        criadoEm: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { telefone: d.telefone, ...r };
  });

  // Índice de quem já recebeu alguma coisa, num doc só: é o que a lista lê para
  // mostrar a coluna "Enviado" e para o filtro "sem envios". Um doc por cliente
  // custaria uma leitura por linha da tabela; aqui é uma leitura para a tela
  // inteira. Guarda milissegundos (número), não Timestamp, porque são milhares
  // de chaves no mesmo documento e cada byte conta contra o teto de 1 MB.
  const agora = Date.now();
  const marcados = Object.fromEntries(
    resultados.filter((r) => r.ok && !r.pulado).map((r) => [r.telefone, agora])
  );
  if (Object.keys(marcados).length) {
    await db.doc('clientesMeta/ultimoEnvio').set({ tel: marcados }, { merge: true });
  }

  const enviados = resultados.filter((r) => r.ok && !r.pulado).length;
  const falhas = resultados.filter((r) => !r.ok && !r.pulado).length;
  const pulados = resultados.filter((r) => r.pulado).length;
  // Alvo = telefones distintos que esta campanha já tentou. Soma só quem não
  // tinha envio registrado: a mesma campanha salva é disparada em vários dias
  // e recortes (e retomada depois de interrompida), e quem se repete entre
  // eles já foi contado na primeira vez.
  const novos = lote.filter((_, i) => !optOuts[i].exists && !envios[i].exists).length;

  // O cabeçalho da campanha: a campanha salva na tela (rules deixam o cliente
  // criar só o molde) já chega com título e `criadoEm`; o envio de teste e a
  // campanha antiga, sem doc prévio, nascem aqui. Cada campo só é gravado se
  // faltar — o `criadoEm` em especial: sem ele a campanha já ficou invisível
  // numa query ordenada (10/09, 47 envios), e assim o lote seguinte conserta
  // sozinho o que faltou no primeiro.
  const refCampanha = db.doc(`campanhas/${campanhaId}`);
  const atual = await refCampanha.get();
  const dados = (atual.exists && atual.data()) || {};
  const cabecalho = {
    ...(dados.criadoEm
      ? {}
      : { criadoEm: FieldValue.serverTimestamp(), criadoPor: usuario.email || usuario.uid }),
    ...(dados.titulo ? {} : { titulo: String(meta?.titulo || '').slice(0, 120) }),
    ...(dados.disparadaEm ? {} : { disparadaEm: FieldValue.serverTimestamp() }),
    // O recorte do disparo mais recente: é o que a lista mostra embaixo do nome.
    ...(meta?.filtro ? { filtro: String(meta.filtro).slice(0, 200) } : {}),
  };

  await refCampanha.set(
    {
      ...cabecalho,
      loja,
      template,
      idioma,
      totalAlvo: FieldValue.increment(novos),
      enviados: FieldValue.increment(enviados),
      falhas: FieldValue.increment(falhas),
      pulados: FieldValue.increment(pulados),
      ultimoEnvioEm: FieldValue.serverTimestamp(),
      ultimoEnvioPor: usuario.email || usuario.uid,
    },
    { merge: true }
  );

  return res.status(200).json({ resultados, enviados, falhas, pulados });
}
