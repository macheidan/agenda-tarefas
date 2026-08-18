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
  return token && phoneId ? { token, phoneId } : null;
}

/** Manda um template e devolve o wamid, ou o erro que a Meta explicou. */
async function enviarUm({ token, phoneId }, telefone, template, idioma, nome) {
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
        // {{1}} = primeiro nome. Template sem variável ignora componente vazio,
        // por isso só mandamos o body quando há nome.
        ...(nome ? { components: [{ type: 'body', parameters: [{ type: 'text', text: nome }] }] } : {}),
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

  const { campanhaId, loja, template, idioma = 'pt_BR', destinatarios, meta } = req.body || {};
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

    const r = await enviarUm(cred, d.e164, template, idioma, d.nome);
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

  const enviados = resultados.filter((r) => r.ok && !r.pulado).length;
  const falhas = resultados.filter((r) => !r.ok && !r.pulado).length;
  const pulados = resultados.filter((r) => r.pulado).length;

  // A coleção `campanhas` é só de escrita do servidor (as rules barram o
  // cliente), então o cabeçalho da campanha entra aqui, no primeiro lote.
  const refCampanha = db.doc(`campanhas/${campanhaId}`);
  const cabecalho = (await refCampanha.get()).exists
    ? {}
    : {
        titulo: String(meta?.titulo || '').slice(0, 120),
        filtro: String(meta?.filtro || '').slice(0, 200),
        totalAlvo: Number(meta?.totalAlvo) || destinatarios.length,
        criadoEm: FieldValue.serverTimestamp(),
        criadoPor: usuario.email || usuario.uid,
      };

  await refCampanha.set(
    {
      ...cabecalho,
      loja,
      template,
      idioma,
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
