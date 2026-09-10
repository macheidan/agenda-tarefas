// Persiste o histórico diário de vendas (vendas_dias.json do runner.py) no
// Firestore, coleção `vendas_dias`, pra Mesa do Dono conseguir mostrar meses
// passados — o JSON local reseta ao virar o mês (atualizar_dias_mes() em
// runner.py), então sem isso o card "Vendas por dia" só enxergava o mês
// corrente.
//
// Formato: 1 doc por mês, com as duas lojas dentro (o feed do Saipos não
// separa por marca) — mesmo shape que o front já consome via useDashFeed
// (dashData.sales_days):
//
//   vendas_dias/{ano_mes}
//     { ano_mes, dias: [{ data, dia, dow, dame: [valor,pizzas,pedidos],
//                          lov: [valor,pizzas,pedidos] }], atualizado_em }
//
// Escrita é sempre substituição do doc inteiro: o acumulador local já vem
// completo até ontem, então rodar de novo no mesmo mês só avança o doc — e
// arquivo com 0 dias nunca sobrescreve um doc bom (coleta vazia acontece
// fora da madrugada, ver saipos_vendas.py).
//
// Uso: node scripts/dash/importar_vendas_dias.mjs scripts/dash/data/vendas_dias.json [--dry]

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DOW3 = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

function initFirestore() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  const svc = JSON.parse(readFileSync(credPath, 'utf8'));
  if (!getApps().length) initializeApp({ credential: cert(svc) });
  return getFirestore();
}

/** dow3 a partir da data (não do texto salvo no acumulador — o runner.py
 *  também recalcula do zero na hora de montar o sales_days do front). */
function dow3(dataIso) {
  const [y, m, d] = dataIso.split('-').map(Number);
  return DOW3[(new Date(y, m - 1, d).getDay() + 6) % 7];
}

function arr(loja) {
  return [Math.round(loja?.valor || 0), loja?.pizzas || 0, loja?.pedidos || 0];
}

export function transformar(acc) {
  const dias = Object.keys(acc.dias || {}).sort().map((data) => {
    const lojas = acc.dias[data].lojas || {};
    return {
      data,
      dia: Number(data.split('-')[2]),
      dow: dow3(data),
      dame: arr(lojas.DAME),
      lov: arr(lojas.LOV),
    };
  });
  return { ano_mes: acc.mes, dias };
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const arquivo = args.find((a) => !a.startsWith('--'));
  if (!arquivo) {
    console.error('uso: node scripts/dash/importar_vendas_dias.mjs <vendas_dias.json> [--dry]');
    process.exit(1);
  }

  const acc = JSON.parse(readFileSync(arquivo, 'utf8'));
  if (!acc.mes || !acc.dias) {
    console.error('arquivo sem "mes"/"dias" — nada a importar');
    process.exit(1);
  }
  const doc = transformar(acc);
  console.log(`${doc.ano_mes}: ${doc.dias.length} dia(s)`);

  if (doc.dias.length === 0) {
    console.log('  0 dias — nada gravado (evita sobrescrever um doc bom com vazio)');
    return;
  }

  if (dry) {
    console.log('  amostra:', JSON.stringify(doc.dias.slice(-3)));
    console.log('DRY RUN — nada foi gravado');
    return;
  }

  const db = initFirestore();
  await db.collection('vendas_dias').doc(doc.ano_mes).set({
    ano_mes: doc.ano_mes,
    dias: doc.dias,
    atualizado_em: new Date().toISOString(),
  });
  console.log('OK');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
