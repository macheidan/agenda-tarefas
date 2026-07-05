#!/usr/bin/env node
/**
 * importFolha.mjs — grava lançamentos de folha no Firestore da intranet a partir
 * do JSON extraído pela skill `salarios-preencher` (extract_holerite.py).
 *
 * Ponte PDF → Firestore. Roda no Claude Desktop / máquina do Fábio, usa o
 * Firebase Admin SDK (ignora as firestore.rules), e faz UPSERT idempotente em
 * `dpSalarios` — o mesmo schema que a SalariosView lê.
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *   node scripts/importFolha.mjs <holerite.json> --line dia5|dia20 [--dry]
 *
 *   --line dia5  → salário  (grava no mês SEGUINTE ao do holerite)
 *   --line dia20 → adiantamento (grava no mês CORRENTE do holerite)
 *   --dry        → mostra o que faria, sem escrever
 *   --flash-dias N → força os dias de transporte do Flash (senão calcula pela Escala)
 *
 * Pré-requisito: `npm i -D firebase-admin` e uma service account com acesso ao
 * Firestore (arquivo serviceAccount.json na raiz, ou GOOGLE_APPLICATION_CREDENTIALS).
 * serviceAccount*.json está no .gitignore — NUNCA commitar.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transporteDiasNoMes } from '../src/utils/transporte.js';

const require = createRequire(import.meta.url);

const MONTHS_PT = {
  janeiro: 0, fevereiro: 1, 'março': 2, marco: 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};
const VALE_DIA = 12;
const pad = (n) => String(n).padStart(2, '0');
const norm = (s) =>
  (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
const firstName = (s) => norm(s).split(/\s+/)[0] || '';

// loja do PDF (por CNPJ) → id da loja no Firestore (seed default).
const LOJA_TO_STORE = { LOV: 'lov', DAME: 'dame' };

// Divergências conhecidas (casar por LOCAL de trabalho, não pelo CNPJ do PDF).
// Chave = trecho do nome completo (normalizado). Valor = { store, first }.
const OVERRIDES = [
  { match: 'birkheuer', store: 'lov', first: 'sergio' }, // Sergio: PDF Dame → aba Lov
  { match: 'trenntini', store: 'lov', first: 'julio' },  // Julio Trenntini → Lov
  { match: 'medina', store: 'dame', first: 'julio' },    // Julio Medina → Dame
];

function parseArgs(argv) {
  const args = { line: null, dry: false, flashDias: null, file: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--line') args.line = argv[++i];
    else if (a === '--dry') args.dry = true;
    else if (a === '--flash-dias') args.flashDias = Number(argv[++i]);
    else if (!a.startsWith('--')) args.file = a;
  }
  return args;
}

function initFirestore() {
  const admin = require('firebase-admin');
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  const svc = JSON.parse(readFileSync(credPath, 'utf8'));
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(svc) });
  }
  return admin.firestore();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file || !['dia5', 'dia20'].includes(args.line)) {
    console.error('uso: node scripts/importFolha.mjs <holerite.json> --line dia5|dia20 [--dry] [--flash-dias N]');
    process.exit(1);
  }

  const rows = JSON.parse(readFileSync(args.file, 'utf8'));
  const db = initFirestore();

  // Carrega funcionários e faltas uma vez (pra casar nomes e calcular Flash).
  const [empSnap, absSnap] = await Promise.all([
    db.collection('dpEmployees').get(),
    db.collection('dpAbsences').get(),
  ]);
  const employees = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const absences = absSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  let ok = 0, skipped = 0;
  for (const r of rows) {
    if (r.socio || r.rescisao) { console.log(`skip ${r.nome} (socio/rescisao)`); skipped++; continue; }

    // Resolve loja + primeiro nome (aplica overrides).
    let store = LOJA_TO_STORE[r.loja] || null;
    let fname = firstName(r.nome);
    const ov = OVERRIDES.find((o) => norm(r.nome).includes(o.match));
    if (ov) { store = ov.store; fname = ov.first; }
    if (!store) { console.warn(`skip ${r.nome}: loja desconhecida (${r.loja})`); skipped++; continue; }

    // Casa com o funcionário (store + primeiro nome).
    const cands = employees.filter((e) => e.store === store && firstName(e.name) === fname && e.active !== false);
    if (cands.length !== 1) {
      console.warn(`skip ${r.nome}: ${cands.length} match(es) em ${store}/${fname}`);
      skipped++;
      continue;
    }
    const emp = cands[0];

    // Mês/ano alvo pela regra da folha.
    const hm = MONTHS_PT[norm(r.mes)];
    if (hm == null || !r.ano) { console.warn(`skip ${r.nome}: mês/ano inválido (${r.mes}/${r.ano})`); skipped++; continue; }
    let year = r.ano;
    let month = hm;
    if (args.line === 'dia5') {
      month = (hm + 1) % 12;
      if (hm === 11) year += 1;
    }

    // Monta o patch da linha.
    const mode = emp.salaryMode === 'fora' ? 'fora' : 'folha';
    const patch = {};
    patch.banco = r.liquido ?? 0;               // Banco = líquido do PDF
    patch.liquidoFolha = r.liquido ?? 0;        // referência oficial (guard-rail)
    if (r.empres) patch.empres = r.empres;      // empréstimo (estorno − desc)

    // Salário (B): folha → líquido; por fora → base − adiantamento (dia5) / adiantamento (dia20).
    if (mode === 'folha') {
      patch.salario = r.liquido ?? 0;
    } else {
      const base = Number(emp.salaryBase) || 0;
      const adi = Number(emp.adiantamento) || 0;
      patch.salario = args.line === 'dia5' ? base - adi : adi;
    }

    // Flash (J): só no dia 5. Dias = flag ou cálculo da Escala.
    if (args.line === 'dia5') {
      const dias = args.flashDias != null ? args.flashDias : transporteDiasNoMes(emp, absences, year, month);
      patch.flash = dias * VALE_DIA;
    }

    const id = `${emp.id}_${year}-${pad(month + 1)}`;
    console.log(`${args.dry ? '[dry] ' : ''}${store}/${emp.name} → ${id}.${args.line}`, patch);
    if (!args.dry) {
      await db.collection('dpSalarios').doc(id).set(
        {
          employeeId: emp.id,
          store,
          year,
          month,
          [args.line]: patch,
          updatedAt: new Date(),
          updatedBy: 'importFolha',
        },
        { merge: true }
      );
    }
    ok++;
  }

  console.log(`\n${args.dry ? '(dry-run) ' : ''}gravados: ${ok} · pulados: ${skipped}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
