#!/usr/bin/env node
/**
 * importPlanilhas2026.mjs — grava no Firestore (dpSalarios) o histórico 2026 lido
 * das planilhas Google pelo lerPlanilhas2026.py.
 *
 * Uso:
 *   node scripts/importPlanilhas2026.mjs <planilhas2026.json> [--dry]
 *
 * Casa cada aba (funcionário) com dpEmployees por loja + primeiro nome (com
 * aliases conhecidos). Cada (funcionário, mês) vira 1 doc dpSalarios com as
 * linhas dia5/dia20/extra presentes. A planilha é a fonte da verdade (set full).
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const pad = (n) => String(n).padStart(2, '0');
const norm = (s) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
const firstName = (s) => norm(s).split(/\s+/)[0] || '';

// Aliases: primeiro nome da ABA (normalizado) → primeiro nome no app.
const ALIAS = { fabiana: 'fabi', patricia: 'paty' };

function initFirestore() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  const svc = JSON.parse(readFileSync(credPath, 'utf8'));
  if (!getApps().length) initializeApp({ credential: cert(svc) });
  return getFirestore();
}

async function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry');
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('uso: node scripts/importPlanilhas2026.mjs <planilhas2026.json> [--dry]');
    process.exit(1);
  }
  const records = JSON.parse(readFileSync(file, 'utf8'));
  const db = initFirestore();

  const [empSnap, storeSnap] = await Promise.all([
    db.collection('dpEmployees').get(),
    db.collection('dpStores').get(),
  ]);
  const employees = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const storeByName = {};
  storeSnap.docs.forEach((d) => { storeByName[norm(d.data().name)] = d.id; });

  let ok = 0;
  const unmatched = new Set();
  const matched = new Set();
  const byEmpMonth = new Map(); // dedup: um set por doc

  for (const r of records) {
    const store = storeByName[norm(r.loja)];
    if (!store) { unmatched.add(`${r.loja}/${r.aba} (loja?)`); continue; }
    const fn = ALIAS[firstName(r.aba)] || firstName(r.aba);
    const cands = employees.filter((e) => e.store === store && firstName(e.name) === fn && e.active !== false);
    if (cands.length !== 1) { unmatched.add(`${r.loja}/${r.aba}`); continue; }
    const emp = cands[0];
    matched.add(`${r.loja}/${r.aba} → ${emp.name}`);

    const lines = {};
    for (const line of ['dia5', 'dia20', 'extra']) {
      if (r[line] && Object.keys(r[line]).length) lines[line] = r[line];
    }
    if (!Object.keys(lines).length) continue;

    const id = `${emp.id}_${r.year}-${pad(r.month + 1)}`;
    byEmpMonth.set(id, {
      employeeId: emp.id, store, year: r.year, month: r.month,
      ...lines, updatedAt: new Date(), updatedBy: 'importPlanilhas2026',
    });
  }

  console.log('=== MATCH ===');
  [...matched].sort().forEach((m) => console.log('  ✓', m));
  if (unmatched.size) {
    console.log('=== SEM CADASTRO (pulados) ===');
    [...unmatched].sort().forEach((m) => console.log('  ✗', m));
  }
  console.log(`=== docs a gravar: ${byEmpMonth.size} (${dry ? 'DRY' : 'GRAVANDO'}) ===`);

  if (!dry) {
    // grava em lotes de 400
    const entries = [...byEmpMonth.entries()];
    for (let i = 0; i < entries.length; i += 400) {
      const batch = db.batch();
      for (const [id, data] of entries.slice(i, i + 400)) {
        batch.set(db.collection('dpSalarios').doc(id), data); // set full: planilha = fonte da verdade
      }
      await batch.commit();
      ok += Math.min(400, entries.length - i);
    }
  }
  console.log(dry ? '(dry-run, nada gravado)' : `gravados: ${ok}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
