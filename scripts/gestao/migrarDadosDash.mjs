#!/usr/bin/env node
/**
 * migrarDadosDash.mjs — cópia única das coleções da Gestão do projeto
 * dash-pizzarias (dashboard antigo) pro Firestore da intranet
 * (agenda-tarefas-76ef8), preservando os IDs dos documentos.
 *
 * Coleções: fechamentos_mensais, dre_detalhes, vendas_itens, checkpoints.
 *
 * Uso:
 *   node scripts/gestao/migrarDadosDash.mjs [--dry]
 *
 * Credenciais (fora do git):
 *   - origem:  C:\claude_project\Pizzarias\dashboard_pizzarias\.firebase-admin-key.json
 *   - destino: serviceAccount.json na raiz da intranet
 *
 * É upsert idempotente (set com merge desligado, id a id) — rodar de novo só
 * sobrescreve com o mesmo conteúdo. Depois da migração, quem mantém as
 * coleções em dia são os Apps Scripts em dual-write (ver docs/gestao-migracao.md).
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ORIGEM_KEY = 'C:/claude_project/Pizzarias/dashboard_pizzarias/.firebase-admin-key.json';
const DESTINO_KEY = new URL('../../serviceAccount.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const COLECOES = ['fechamentos_mensais', 'dre_detalhes', 'vendas_itens', 'checkpoints'];

const dry = process.argv.includes('--dry');

const origemApp = initializeApp(
  { credential: cert(JSON.parse(readFileSync(ORIGEM_KEY, 'utf8'))) },
  'origem'
);
const destinoApp = initializeApp(
  { credential: cert(JSON.parse(readFileSync(DESTINO_KEY, 'utf8'))) },
  'destino'
);

const origem = getFirestore(origemApp);
const destino = getFirestore(destinoApp);

for (const col of COLECOES) {
  const snap = await origem.collection(col).get();
  console.log(`${col}: ${snap.size} docs na origem`);
  if (dry) continue;

  let batch = destino.batch();
  let pend = 0;
  let total = 0;
  for (const doc of snap.docs) {
    batch.set(destino.collection(col).doc(doc.id), doc.data());
    pend++;
    total++;
    if (pend >= 400) {
      await batch.commit();
      batch = destino.batch();
      pend = 0;
      process.stdout.write(`  ${total}/${snap.size}\r`);
    }
  }
  if (pend > 0) await batch.commit();
  console.log(`  ${total}/${snap.size} gravados no destino`);
}

console.log(dry ? '\n--dry: nada gravado.' : '\nMigração concluída.');
