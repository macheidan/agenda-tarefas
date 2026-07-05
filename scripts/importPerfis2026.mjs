#!/usr/bin/env node
/**
 * importPerfis2026.mjs — grava o perfil salarial (resumo O1:P4) em dpEmployees,
 * a partir do JSON do lerPerfis2026.py.
 *
 * Uso: node scripts/importPerfis2026.mjs <perfis2026.json> [--dry]
 *
 * Campos gravados por funcionário: salaryMode, salaryBase, transporteRef,
 * feriadoUnit, adiantamento — só os que vierem como valor válido. adiantamento
 * = "folha" é ignorado (não é valor por fora).
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const norm = (s) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
const firstName = (s) => norm(s).split(/\s+/)[0] || '';
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
  if (!file) { console.error('uso: node scripts/importPerfis2026.mjs <perfis2026.json> [--dry]'); process.exit(1); }
  const perfis = JSON.parse(readFileSync(file, 'utf8'));
  const db = initFirestore();

  const [empSnap, storeSnap] = await Promise.all([
    db.collection('dpEmployees').get(),
    db.collection('dpStores').get(),
  ]);
  const employees = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const storeByName = {};
  storeSnap.docs.forEach((d) => { storeByName[norm(d.data().name)] = d.id; });

  let ok = 0;
  const skipped = [];
  const plan = [];
  for (const p of perfis) {
    const store = storeByName[norm(p.loja)];
    const fn = ALIAS[firstName(p.aba)] || firstName(p.aba);
    const cands = employees.filter((e) => e.store === store && firstName(e.name) === fn && e.active !== false);
    const updates = {};
    if (p.salaryMode) updates.salaryMode = p.salaryMode;
    if (typeof p.salaryBase === 'number') updates.salaryBase = p.salaryBase;
    if (typeof p.transporteRef === 'number') updates.transporteRef = p.transporteRef;
    if (typeof p.feriadoUnit === 'number') updates.feriadoUnit = p.feriadoUnit;
    if (typeof p.adiantamento === 'number') updates.adiantamento = p.adiantamento;
    if (!Object.keys(updates).length) continue; // nada a gravar (ex.: Dame vazia)
    if (cands.length !== 1) { skipped.push(`${p.loja}/${p.aba}`); continue; }
    plan.push({ emp: cands[0], updates });
  }

  console.log('=== PERFIS A GRAVAR ===');
  plan.forEach(({ emp, updates }) => console.log('  ✓', emp.name, JSON.stringify(updates)));
  if (skipped.length) { console.log('=== com dados mas sem cadastro (pulados) ==='); skipped.forEach((s) => console.log('  ✗', s)); }
  console.log(`=== ${plan.length} funcionários (${dry ? 'DRY' : 'GRAVANDO'}) ===`);

  if (!dry) {
    for (const { emp, updates } of plan) {
      await db.collection('dpEmployees').doc(emp.id).set(updates, { merge: true });
      ok++;
    }
  }
  console.log(dry ? '(dry-run, nada gravado)' : `gravados: ${ok}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
