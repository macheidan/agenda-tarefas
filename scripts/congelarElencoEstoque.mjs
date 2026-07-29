/**
 * Congela o elenco (estoqueContagens/{mes}_{loja}.catalogo) nas contagens que
 * foram gravadas antes disso existir — as importadas da planilha, por exemplo.
 *
 * O elenco é a lista de Compras como estava quando o mês começou a ser contado:
 * nome, marca, unidade, fornecedor e Produto (planilha) de cada item. É por ele
 * que as telas montam o mês, então produto que sai (ou entra) no catálogo
 * depois não mexe em nenhum mês já contado. Para os meses importados, o elenco
 * possível é o catálogo de hoje.
 *
 * Uso:
 *   node scripts/congelarElencoEstoque.mjs --dry
 *   node scripts/congelarElencoEstoque.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

function initFirestore() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(readFileSync(credPath, 'utf8'))) });
  return getFirestore();
}

async function main() {
  const dry = process.argv.includes('--dry');
  const db = initFirestore();

  const [itensSnap, fornecSnap, contagensSnap] = await Promise.all([
    db.collection('comprasItens').get(),
    db.collection('comprasFornecedores').get(),
    db.collection('estoqueContagens').get(),
  ]);

  const fornecNome = {};
  fornecSnap.docs.forEach((d) => { fornecNome[d.id] = d.data().name || ''; });

  const catalogo = itensSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((i) => ({
      id: i.id,
      produto: i.produto || '',
      marca: i.marca || '',
      unid: i.unid || '',
      fornecedorId: i.fornecedorId || '',
      fornecedor: fornecNome[i.fornecedorId] || '',
      planilha: i.planilhaNome || '',
    }));

  let docsTocados = 0;
  for (const doc of contagensSnap.docs) {
    const dados = doc.data();
    if (dados.catalogo?.length) continue;   // já congelado: não sobrescreve
    docsTocados++;
    console.log(`${doc.id}: elenco de ${catalogo.length} produtos`);
    if (!dry) {
      await doc.ref.set({
        catalogo,
        catalogoEm: Timestamp.now(),
        // retrato por item: virou o elenco, então sai do doc.
        itens: FieldValue.delete(),
      }, { merge: true });
    }
  }

  console.log(`\n${docsTocados} contagens atualizadas${dry ? ' (--dry: nada gravado)' : ''}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
