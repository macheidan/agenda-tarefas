/**
 * Importa a contagem do Estoque Mensal que estava nas abas ESTOQUE MENSAL DAME
 * e ESTOQUE MENSAL LOV da planilha PREÇOS PRODUTOS para o Firestore
 * (estoqueContagens/{YYYY-MM}_{loja}).
 *
 * Os dados vêm de scripts/data/estoqueMensalPlanilha.json — extraído da
 * planilha, um registro por loja/mês/produto. O casamento com o catálogo
 * (comprasItens) é por nome normalizado, com o mapa de apelidos abaixo para os
 * casos em que planilha e catálogo escrevem o mesmo produto de formas
 * diferentes ("Camarão (G)" x "Camarão Grande").
 *
 * Uso:
 *   node scripts/importEstoquePlanilha.mjs --dry     # só relatório, não grava
 *   node scripts/importEstoquePlanilha.mjs
 *
 * Precisa de credencial de service account do Firebase (serviceAccount.json na
 * raiz ou GOOGLE_APPLICATION_CREDENTIALS). serviceAccount*.json está no
 * .gitignore — NUNCA commitar.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { PLANILHA_PARA_CATALOGO as APELIDOS } from './data/apelidosEstoque.mjs';

const DADOS = './scripts/data/estoqueMensalPlanilha.json';

const norm = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function initFirestore() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  const svc = JSON.parse(readFileSync(credPath, 'utf8'));
  if (!getApps().length) initializeApp({ credential: cert(svc) });
  return getFirestore();
}

async function main() {
  const dry = process.argv.includes('--dry');
  const db = initFirestore();

  const registros = JSON.parse(readFileSync(DADOS, 'utf8'));

  const snap = await db.collection('comprasItens').get();
  const itens = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // nome normalizado -> itens do catálogo com aquele nome (o mesmo produto
  // aparece uma vez por fornecedor que o vende).
  const porNome = new Map();
  for (const i of itens) {
    const k = norm(i.produto);
    if (!porNome.has(k)) porNome.set(k, []);
    porNome.get(k).push(i);
  }

  const naoCasados = new Map();   // nome da planilha -> nº de registros
  const ambiguos = new Map();     // nome -> itens candidatos
  // docId -> { mes, loja, qtys }
  const docs = new Map();

  for (const r of registros) {
    const apelido = APELIDOS[r.produto];
    const alvo = typeof apelido === 'string' ? apelido : (apelido?.produto || r.produto);
    const marca = typeof apelido === 'object' ? apelido.marca : null;
    let cands = porNome.get(norm(alvo));
    if (marca && cands) cands = cands.filter((c) => norm(c.marca) === norm(marca));
    if (!cands || !cands.length) {
      naoCasados.set(r.produto, (naoCasados.get(r.produto) || 0) + 1);
      continue;
    }
    // Produto vendido por mais de um fornecedor sem marca no apelido: a planilha
    // conta o produto, não o fornecedor, então a quantidade vai para o PRIMEIRO
    // item do catálogo — somar nos dois duplicaria o estoque.
    if (cands.length > 1) ambiguos.set(r.produto, cands.map((c) => c.id));
    const item = cands[0];

    const id = `${r.mes}_${r.loja}`;
    if (!docs.has(id)) docs.set(id, { mes: r.mes, loja: r.loja, qtys: {} });
    docs.get(id).qtys[item.id] = r.qtd;
  }

  console.log(`catálogo: ${itens.length} itens · planilha: ${registros.length} registros`);
  for (const [id, d] of [...docs].sort()) {
    console.log(`  ${id}: ${Object.keys(d.qtys).length} itens`);
  }
  if (ambiguos.size) {
    console.log(`\nprodutos em mais de um fornecedor (contagem foi pro primeiro): ${ambiguos.size}`);
    for (const [nome, ids] of ambiguos) console.log(`  ${nome} (${ids.length} itens)`);
  }
  if (naoCasados.size) {
    const total = [...naoCasados.values()].reduce((a, b) => a + b, 0);
    console.log(`\nSEM item no catálogo: ${naoCasados.size} produtos, ${total} contagens perdidas`);
    for (const [nome, n] of [...naoCasados].sort()) console.log(`  ${nome} (${n})`);
  }

  if (dry) {
    console.log('\n--dry: nada gravado.');
    return;
  }

  for (const [id, d] of docs) {
    await db.collection('estoqueContagens').doc(id).set({
      mes: d.mes,
      loja: d.loja,
      qtys: d.qtys,
      origem: 'planilha PREÇOS PRODUTOS (abas ESTOQUE MENSAL)',
      updatedAt: Timestamp.now(),
    }, { merge: true });
    console.log(`gravado ${id} (${Object.keys(d.qtys).length} itens)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
