/**
 * Grava em cada item do catálogo de Compras (comprasItens.planilhaNome) o
 * "Produto (planilha)" correspondente na base de Preços. É esse vínculo que dá
 * preço ao item no Relatório Estoque.
 *
 * O vínculo aproveita o que JÁ existe na seção Preços → Produtos: lá cada
 * produto bruto (produtos.nome, o nome que vem na nota) aponta para um nome
 * padronizado (produtos.nome_padrao, o "Produto (planilha)"). Aqui a conta é:
 *
 *   item do catálogo -> nome do produto na base de Preços -> nome_padrao
 *
 * Quando o produto ainda não tem nome_padrao preenchido em Preços, o vínculo
 * usa o próprio nome do produto — é o mesmo produto e o mesmo preço, só sem o
 * nome padronizado. A tela mostra o que estiver aqui.
 *
 * Uso:
 *   node scripts/vincularItensPlanilha.mjs --dry
 *   node scripts/vincularItensPlanilha.mjs
 *
 * Precisa da service account do Firebase (serviceAccount.json) e da credencial
 * do Supabase (C:/claude_project/Hub/_credenciais/supabase.env — store central).
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  PLANILHA_PARA_CATALOGO, PLANILHA_PARA_PRODUTOS, CATALOGO_PARA_PRODUTOS,
} from './data/apelidosEstoque.mjs';

const SUPABASE_ENV = process.env.SUPABASE_ENV || 'C:/claude_project/Hub/_credenciais/supabase.env';

const norm = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function lerEnv(path) {
  const out = {};
  for (const linha of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function lerProdutos() {
  const env = lerEnv(SUPABASE_ENV);
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/produtos?select=nome,nome_padrao&limit=5000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error(`supabase: ${JSON.stringify(data)}`);
  return data;
}

function initFirestore() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(readFileSync(credPath, 'utf8'))) });
  return getFirestore();
}

async function main() {
  const dry = process.argv.includes('--dry');
  const produtos = await lerProdutos();
  const db = initFirestore();

  // Nome (bruto ou padronizado) -> nome canônico do Produto (planilha).
  // Quando o mesmo nome aparece duas vezes, ganha o registro que TEM
  // nome_padrao — é o vínculo já feito na seção Preços.
  const canonPorNome = new Map();
  for (const p of produtos) {
    const canon = p.nome_padrao || p.nome;
    for (const chave of [p.nome, p.nome_padrao]) {
      if (!chave) continue;
      const k = norm(chave);
      if (!canonPorNome.has(k) || p.nome_padrao) canonPorNome.set(k, canon);
    }
  }

  // Nome do item no catálogo -> nome do produto na base de Preços, para os
  // itens cujo nome não é igual em nenhum dos dois lados. Vem de inverter o
  // mapa da planilha: planilha -> catálogo, planilha -> produtos.
  const catalogoParaProduto = new Map();
  for (const [nomeCatalogo, nomeProduto] of Object.entries(CATALOGO_PARA_PRODUTOS)) {
    catalogoParaProduto.set(norm(nomeCatalogo), nomeProduto);
  }
  for (const [nomePlanilha, alvo] of Object.entries(PLANILHA_PARA_CATALOGO)) {
    const nomeCatalogo = typeof alvo === 'string' ? alvo : alvo.produto;
    const nomeProduto = PLANILHA_PARA_PRODUTOS[nomePlanilha] || nomePlanilha;
    if (!catalogoParaProduto.has(norm(nomeCatalogo))) {
      catalogoParaProduto.set(norm(nomeCatalogo), nomeProduto);
    }
  }

  const snap = await db.collection('comprasItens').get();
  const itens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const paraGravar = [];
  const semVinculo = [];
  for (const item of itens) {
    const viaApelido = catalogoParaProduto.get(norm(item.produto));
    const canon = canonPorNome.get(norm(item.produto))
      || (viaApelido ? canonPorNome.get(norm(viaApelido)) : null);
    if (!canon) { semVinculo.push(item.produto); continue; }
    if (item.planilhaNome === canon) continue;
    paraGravar.push({ item, canon });
  }

  console.log(`catálogo: ${itens.length} itens · produtos em Preços: ${produtos.length}`);
  console.log(`vínculos a gravar: ${paraGravar.length}`);
  for (const { item, canon } of paraGravar) console.log(`  ${item.produto}  ->  ${canon}`);
  if (semVinculo.length) {
    console.log(`\nSEM Produto (planilha): ${semVinculo.length}`);
    semVinculo.sort().forEach((n) => console.log(`  - ${n}`));
  }

  if (dry) { console.log('\n--dry: nada gravado.'); return; }

  for (const { item, canon } of paraGravar) {
    await db.collection('comprasItens').doc(item.id).update({ planilhaNome: canon });
  }
  console.log(`\ngravados ${paraGravar.length} vínculos.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
