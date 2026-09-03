/**
 * backfillAdiantamento.mjs — Salário do Dia 20 → Adiantamento (negativo) do
 * Dia 5 do mês seguinte, para meses já lançados antes da cópia automática
 * existir na tela (SalariosView, 2026-09-03). Idempotente: só grava quando o
 * Adiantamento do dia 5 seguinte está vazio ou diferente do esperado.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *   node scripts/backfillAdiantamento.mjs --de 2026-08 [--ate 2026-08] [--dry]
 *
 * --de/--ate são o mês do DIA 20 (origem); o destino é sempre o mês seguinte.
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const [k, v] = argv[i].slice(2).split('=');
  if (v != null) args[k] = v;
  else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[k] = argv[++i];
  else args[k] = true;
}
const de = args.de || '2026-08';
const ate = args.ate || de;
const dry = !!args.dry;
if (!/^\d{4}-\d{2}$/.test(de) || !/^\d{4}-\d{2}$/.test(ate)) {
  console.error('use --de AAAA-MM [--ate AAAA-MM]');
  process.exit(1);
}

if (!getApps().length) {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  initializeApp({ credential: cert(JSON.parse(readFileSync(credPath, 'utf8'))) });
}
const db = getFirestore();
const pad = (n) => String(n).padStart(2, '0');

const emps = Object.fromEntries((await db.collection('dpEmployees').get()).docs.map((d) => [d.id, d.data()]));
const snap = await db.collection('dpSalarios').get();
const byId = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));

let gravados = 0, iguais = 0, semSalario = 0;
for (const [id, s] of Object.entries(byId)) {
  const key = `${s.year}-${pad(s.month + 1)}`;
  if (key < de || key > ate) continue;
  const salario20 = Number(s.dia20?.salario);
  if (!s.dia20 || !salario20) { semSalario++; continue; }
  const esperado = -Math.abs(salario20);

  const ny = s.month === 11 ? s.year + 1 : s.year;
  const nm = (s.month + 1) % 12;
  const nextId = `${s.employeeId}_${ny}-${pad(nm + 1)}`;
  const next = byId[nextId];
  const atual = next?.dia5?.adianta;
  const name = emps[s.employeeId]?.name || s.employeeId;
  if (Number(atual) === esperado) { iguais++; continue; }

  console.log(`${dry ? '[dry] ' : ''}${name}: ${key} dia20 salário ${salario20} → ${nextId}.dia5.adianta ${esperado}${atual != null && atual !== '' ? ` (era ${atual})` : ''}`);
  if (!dry) {
    await db.collection('dpSalarios').doc(nextId).set(
      {
        employeeId: s.employeeId,
        store: s.store,
        year: ny,
        month: nm,
        dia5: { ...(next?.dia5 || {}), adianta: esperado },
        updatedAt: new Date(),
        updatedBy: 'backfillAdiantamento',
      },
      { merge: true }
    );
  }
  gravados++;
}
console.log(`\n${dry ? 'a gravar' : 'gravados'}: ${gravados} · já iguais: ${iguais} · sem salário no dia 20: ${semSalario}`);
