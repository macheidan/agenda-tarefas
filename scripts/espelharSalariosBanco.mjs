#!/usr/bin/env node
/**
 * espelharSalariosBanco.mjs — (re)constrói o espelho `dpSalariosBanco` a partir
 * de `dpSalarios`: mesmo id, mesmo cabeçalho (employeeId/store/year/month) e,
 * em cada linha dia5/dia20/extra, SÓ os campos `banco` e `flash`.
 *
 * É o que a subseção Salários Folha lê (liberável a outros usuários sem expor o
 * resto do salário). Idempotente: pode rodar quantas vezes quiser. As duas telas
 * e o importFolha.mjs mantêm o espelho em dupla escrita; este script é o
 * backfill inicial e o conserto se algum dia divergir.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/espelharSalariosBanco.mjs [--dry]
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const LINES = ['dia5', 'dia20', 'extra'];
const dry = process.argv.includes('--dry');

function initDb() {
  if (!getApps().length) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
    const svc = JSON.parse(readFileSync(credPath, 'utf8'));
    initializeApp({ credential: cert(svc) });
  }
  return getFirestore();
}

async function main() {
  const db = initDb();
  const snap = await db.collection('dpSalarios').get();
  let n = 0;
  let batch = db.batch();
  let inBatch = 0;
  for (const d of snap.docs) {
    const s = d.data();
    const out = {
      employeeId: s.employeeId ?? null,
      store: s.store ?? null,
      year: s.year ?? null,
      month: s.month ?? null,
      updatedAt: new Date(),
      updatedBy: 'espelharSalariosBanco',
    };
    for (const line of LINES) {
      if (s[line] && typeof s[line] === 'object') {
        out[line] = { banco: s[line].banco ?? null, flash: s[line].flash ?? null };
      }
    }
    n++;
    if (dry) { console.log(d.id, out); continue; }
    // set sem merge: o espelho é derivado, então uma linha apagada no original some aqui também.
    batch.set(db.collection('dpSalariosBanco').doc(d.id), out);
    if (++inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
  }
  if (!dry && inBatch) await batch.commit();
  console.log(`${dry ? '(dry-run) ' : ''}espelhados: ${n} docs`);
}

main().catch((e) => { console.error(e); process.exit(1); });
