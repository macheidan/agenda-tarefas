// Importa as vendas dia a dia (JSON do coletar_diario.py) para o Firestore, na
// coleção `vendas_diario` lida pela sub-aba "Por Dia da Semana" de Vendas.
//
// Guarda o DIA, não a média: a média por dia da semana é conta do front
// (useVendasDiario), e assim um critério novo (só dias abertos, sem feriado…)
// não pede recoleta no Saipos. Mesmo formato do vendas_bairros — um doc por
// MÊS de uma loja, ~42 leituras pro histórico das duas:
//
//   vendas_diario/{ano_mes}_{marca}
//     { marca, ano_mes, total_qtd, total_valor, atualizado_em,
//       dias: [{ d: 'AAAA-MM-DD', q: pedidos, v: valor }] }
//
// Não é o `vendas_dias` da Mesa do Dono: aquele junta as duas lojas num doc e
// traz pizzas, que o relatório Faturamento por dia não tem — gravar histórico
// lá faria o card "Vendas por dia" mostrar zero pizza nos meses antigos.
//
// Rodar de novo um mês SUBSTITUI o doc (o Saipos é a fonte da verdade e muda
// retroativamente com cancelamento). Mês sem nenhum dia não vira doc: coleta
// parcial nunca apaga histórico bom.
//
// Uso: node scripts/vendas/importar_diario.mjs scripts/vendas/data/diario-2026-11-02.json [--dry]

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

export function docsDoArquivo(coleta) {
  const docs = [];
  for (const registro of coleta.meses || []) {
    const dias = (registro.dias || [])
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.data) && d.data.startsWith(registro.ano_mes))
      .map((d) => ({ d: d.data, q: Number(d.pedidos) || 0, v: Number((Number(d.valor) || 0).toFixed(2)) }))
      .sort((a, b) => a.d.localeCompare(b.d));
    if (dias.length === 0) continue;
    docs.push({
      id: `${registro.ano_mes}_${registro.marca}`,
      data: {
        marca: registro.marca,
        ano_mes: registro.ano_mes,
        dias,
        total_qtd: dias.reduce((s, d) => s + d.q, 0),
        total_valor: Number(dias.reduce((s, d) => s + d.v, 0).toFixed(2)),
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
    console.error('uso: node scripts/vendas/importar_diario.mjs <arquivo.json> [--dry]');
    process.exit(1);
  }

  const coleta = JSON.parse(readFileSync(arquivo, 'utf8'));
  const docs = docsDoArquivo(coleta);
  const porMarca = docs.reduce((acc, d) => {
    acc[d.data.marca] = (acc[d.data.marca] || 0) + 1;
    return acc;
  }, {});
  console.log(`${docs.length} meses (${Object.entries(porMarca).map(([m, n]) => `${m}: ${n}`).join(', ')})`);
  if (docs.length === 0) return;
  console.log(`  ${docs[0].id} … ${docs[docs.length - 1].id}`);

  if (dry) {
    console.log('  amostra:', JSON.stringify(docs[docs.length - 1].data.dias.slice(0, 5)));
    console.log('DRY RUN — nada foi gravado');
    return;
  }

  const db = initFirestore();
  for (let i = 0; i < docs.length; i += LOTE) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + LOTE)) {
      batch.set(db.collection('vendas_diario').doc(d.id), d.data);
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
