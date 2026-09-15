// Preenche `loja` nas respostas (campanhaRespostas) e `loja`/`lojas` nos
// descadastros (clientesOptOut) gravados antes de 15/09/2026, quando o webhook
// ainda não registrava de qual número — e portanto de qual equipe — veio a
// mensagem.
//
// A loja é deduzida de quem mandou mensagem para aquele telefone:
//   resposta     → a loja do envio mais recente ANTES da resposta
//                  (campanhaEnvios), ou da resposta automática (campanhaAutoRespostas);
//   descadastro  → as lojas das respostas de SAIR daquele telefone; sem elas,
//                  a loja que mandou mensagem, se foi uma só.
// Telefone que recebeu das duas lojas sem nada que desempate fica sem loja e é
// listado no fim — aparece só em "Todas as lojas".
//
// Uso (na raiz do repo): node scripts/clientes/backfill_loja_respostas.mjs [--dry]
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DRY = process.argv.includes('--dry');
const PALAVRAS_SAIR = ['sair', 'parar', 'pare', 'cancelar', 'descadastrar', 'stop', 'remover'];

function initFirestore() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  const svc = JSON.parse(readFileSync(credPath, 'utf8'));
  if (!getApps().length) initializeApp({ credential: cert(svc) });
  return getFirestore();
}

/** Mesmas formas do webhook: com e sem o 9 do celular. */
function variantes(tel) {
  const so = String(tel || '').replace(/\D/g, '');
  const local = so.startsWith('55') && so.length >= 12 ? so.slice(2) : so;
  const formas = new Set([local]);
  if (local.length === 10 && /[6-9]/.test(local[2])) formas.add(`${local.slice(0, 2)}9${local.slice(2)}`);
  if (local.length === 11 && local[2] === '9') formas.add(local.slice(0, 2) + local.slice(3));
  return [...formas];
}

const ehSair = (texto) => PALAVRAS_SAIR.includes(String(texto || '').toLowerCase().replace(/[^a-zà-ÿ]/gi, ''));
const ms = (ts) => ts?.toMillis?.() || 0;

async function main() {
  const db = initFirestore();

  // Mensagens que cada telefone recebeu: [{loja, em}]. Uma consulta por forma
  // de telefone, só dos telefones que importam — varrer campanhaEnvios inteira
  // custaria uma leitura por mensagem já enviada.
  const cache = new Map();
  async function recebidas(tel) {
    const chave = variantes(tel).sort().join('|');
    if (cache.has(chave)) return cache.get(chave);
    const lista = [];
    for (const f of variantes(tel)) {
      const [envios, auto] = await Promise.all([
        db.collection('campanhaEnvios').where('telefone', '==', f).get(),
        db.doc(`campanhaAutoRespostas/${f}`).get(),
      ]);
      envios.forEach((d) => {
        const x = d.data();
        if (x.loja) lista.push({ loja: x.loja, em: ms(x.criadoEm) });
      });
      if (auto.exists && auto.data()?.loja) lista.push({ loja: auto.data().loja, em: ms(auto.data().em) });
    }
    cache.set(chave, lista);
    return lista;
  }

  const semLoja = [];
  const escritas = [];

  // 1) Respostas
  const respostas = await db.collection('campanhaRespostas').get();
  const lojaDasRespostas = []; // {formas, loja, sair}
  for (const d of respostas.docs) {
    const r = d.data();
    let loja = r.loja || null;
    if (!loja) {
      const lista = await recebidas(r.telefone);
      const quando = ms(r.recebidoEm) || Infinity;
      const antes = lista.filter((x) => x.em <= quando).sort((a, b) => b.em - a.em);
      const lojas = new Set(lista.map((x) => x.loja));
      loja = antes[0]?.loja || (lojas.size === 1 ? [...lojas][0] : null);
      if (loja) escritas.push({ ref: d.ref, dados: { loja }, desc: `resposta ${r.telefone} → ${loja}` });
      else semLoja.push(`resposta ${d.id} (${r.telefone})`);
    }
    if (loja) lojaDasRespostas.push({ formas: variantes(r.telefone), loja, sair: ehSair(r.texto) });
  }

  // 2) Descadastros
  const optOuts = await db.collection('clientesOptOut').get();
  for (const d of optOuts.docs) {
    const o = d.data();
    if (o.lojas?.length) continue;
    const doTel = lojaDasRespostas.filter((x) => x.formas.includes(o.telefone || d.id));
    let lojas = [...new Set(doTel.filter((x) => x.sair).map((x) => x.loja))];
    if (!lojas.length) lojas = [...new Set(doTel.map((x) => x.loja))];
    if (!lojas.length) lojas = [...new Set((await recebidas(o.telefone || d.id)).map((x) => x.loja))];
    if (lojas.length === 1 || (lojas.length > 1 && doTel.some((x) => x.sair))) {
      escritas.push({
        ref: d.ref,
        dados: { lojas, loja: o.loja || lojas[0] },
        desc: `descadastro ${d.id} → ${lojas.join('+')}`,
      });
    } else {
      semLoja.push(`descadastro ${d.id}${lojas.length ? ` (recebeu de ${lojas.join(' e ')})` : ''}`);
    }
  }

  console.log(`${respostas.size} respostas, ${optOuts.size} descadastros lidos`);
  escritas.forEach((e) => console.log(`  ${e.desc}`));
  console.log(`${escritas.length} a gravar${DRY ? ' (--dry: nada gravado)' : ''}`);
  if (semLoja.length) {
    console.log(`${semLoja.length} sem loja deduzível:`);
    semLoja.forEach((s) => console.log(`  ${s}`));
  }
  if (DRY) return;

  for (let i = 0; i < escritas.length; i += 400) {
    const lote = db.batch();
    escritas.slice(i, i + 400).forEach((e) => lote.update(e.ref, e.dados));
    await lote.commit();
  }
  console.log('gravado.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
