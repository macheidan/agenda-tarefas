// Importa as vendas por área de entrega (JSON do coletar_bairros.py) para o
// Firestore, na coleção `vendas_bairros` lida pela sub-aba "Por Bairro" de
// Vendas (Gestão).
//
// Formato no Firestore — NÃO é um doc por bairro. São ~60 bairros × 32 meses ×
// 2 lojas, e a tela precisa do histórico inteiro pra desenhar a linha mês a
// mês: um doc por bairro custaria ~2 mil leituras por abertura, e a quota do
// Firestore (free tier) já é o gargalo do projeto. Cada doc é um MÊS de uma
// loja, com a lista de bairros dentro:
//
//   vendas_bairros/{ano_mes}_{marca}
//     { marca, ano_mes, total_qtd, total_valor, atualizado_em,
//       bairros: [{ b: bairro, q: pedidos, v: valor }] }
//
// Assim o histórico das duas lojas sai em ~64 leituras.
//
// A escrita é por mês: rodar de novo um mês já importado SUBSTITUI o doc (o
// relatório do Saipos é a fonte da verdade e pode mudar retroativamente —
// pedido cancelado, endereço corrigido). Mês que não veio na coleta fica como
// está: coleta parcial nunca apaga histórico bom.
//
// Uso: node scripts/vendas/importar_bairros.mjs scripts/vendas/data/bairros-2026-09-09.json [--dry]

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const LOTE = 400; // teto do batch do Firestore é 500

function initFirestore() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  const svc = JSON.parse(readFileSync(credPath, 'utf8'));
  if (!getApps().length) initializeApp({ credential: cert(svc) });
  return getFirestore();
}

/** Chave de agrupamento de bairro — espelha `chaveBairro` do front
 *  (`hooks/useVendasBairros.js`) e `chave_bairro` do coletor. */
const CONECTIVOS = new Set(['da', 'de', 'do', 'das', 'dos', 'd', 'e']);

export function chaveBairro(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((p) => p && !CONECTIVOS.has(p))
    .join(' ');
}

/** Junta grafias diferentes do mesmo bairro ("Passo D'Areia" × "Passo da
 *  Areia") numa linha só, exibindo a grafia mais frequente em pedidos. */
export function agrupar(bairros) {
  const porChave = new Map();
  for (const b of bairros || []) {
    const chave = chaveBairro(b.bairro) || 'sem bairro';
    const q = Number(b.pedidos) || 0;
    const v = Number(b.valor) || 0;
    const ja = porChave.get(chave);
    if (!ja) {
      porChave.set(chave, { b: b.bairro || 'Sem bairro', q, v });
      continue;
    }
    if (q > ja.q) ja.b = b.bairro || ja.b;
    ja.q += q;
    ja.v += v;
  }
  return [...porChave.values()].sort((a, b) => b.q - a.q || b.v - a.v);
}

function docsDoArquivo(coleta) {
  const docs = [];
  for (const registro of coleta.meses || []) {
    const bairros = agrupar(registro.bairros);
    // Mês sem nenhuma entrega não vira doc: a loja pode simplesmente não
    // existir ainda (a Lov abriu depois da Dáme) e um doc vazio faria a tela
    // desenhar um mês zerado que nunca aconteceu.
    if (bairros.length === 0) continue;
    docs.push({
      id: `${registro.ano_mes}_${registro.marca}`,
      data: {
        marca: registro.marca,
        ano_mes: registro.ano_mes,
        bairros,
        total_qtd: bairros.reduce((s, b) => s + b.q, 0),
        total_valor: Number(bairros.reduce((s, b) => s + b.v, 0).toFixed(2)),
        atualizado_em: new Date().toISOString(),
      },
    });
  }
  return docs;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const arquivo = args.find((a) => !a.startsWith('--'));
  if (!arquivo) {
    console.error('uso: node scripts/vendas/importar_bairros.mjs <arquivo.json> [--dry]');
    process.exit(1);
  }

  const coleta = JSON.parse(readFileSync(arquivo, 'utf8'));
  const docs = docsDoArquivo(coleta);
  const porMarca = docs.reduce((acc, d) => {
    acc[d.data.marca] = (acc[d.data.marca] || 0) + 1;
    return acc;
  }, {});
  const maior = docs.reduce((m, d) => Math.max(m, JSON.stringify(d.data).length), 0);
  console.log(
    `${docs.length} meses (${Object.entries(porMarca).map(([m, n]) => `${m}: ${n}`).join(', ')})` +
    ` · maior doc ${(maior / 1024).toFixed(1)} KB`
  );
  if (docs.length === 0) return;
  console.log(`  ${docs[0].id} … ${docs[docs.length - 1].id}`);

  if (dry) {
    const amostra = docs[docs.length - 1];
    console.log('  amostra:', JSON.stringify(amostra.data.bairros.slice(0, 5)));
    console.log('DRY RUN — nada foi gravado');
    return;
  }

  const db = initFirestore();
  for (let i = 0; i < docs.length; i += LOTE) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + LOTE)) {
      batch.set(db.collection('vendas_bairros').doc(d.id), d.data);
    }
    await batch.commit();
    console.log(`  gravados ${Math.min(i + LOTE, docs.length)}/${docs.length}`);
  }
  console.log('OK');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
