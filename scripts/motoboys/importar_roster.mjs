// Mescla o cadastro de entregadores do Saipos (JSON do coletar_cadastro.py)
// no roster da intranet (motoboyConfig/{loja}.roster).
//
// - Nome novo (ativo no Saipos)  → entra no roster como ativo
// - Nome já existente             → mantém o mid e o estado atual
// - Inativo no Saipos e ausente   → não entra
//
// Uso: node scripts/motoboys/importar_roster.mjs data/cadastro.json [--dry]

import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const LOJAS = ['dame', 'lov'];

function initFirestore() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  const svc = JSON.parse(readFileSync(credPath, 'utf8'));
  if (!getApps().length) initializeApp({ credential: cert(svc) });
  return getFirestore();
}

function normalizar(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function novoMid(i) {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${i.toString(36)}`;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const dry = args.includes('--dry');
  if (!file) {
    console.error('uso: node scripts/motoboys/importar_roster.mjs <cadastro.json> [--dry]');
    process.exit(1);
  }
  const dados = JSON.parse(readFileSync(file, 'utf8'));
  const db = initFirestore();

  for (const loja of LOJAS) {
    const lista = dados.lojas?.[loja] || [];
    const ref = db.collection('motoboyConfig').doc(loja);
    const snap = await ref.get();
    const roster = snap.exists ? snap.data().roster || {} : {};
    const existentes = new Set(Object.values(roster).map((r) => normalizar(r.nome)));
    let ordem = Object.keys(roster).length;

    const novos = {};
    for (const r of lista) {
      const norm = normalizar(r.nome);
      if (!norm || existentes.has(norm)) continue;
      if (!r.ativo) continue; // inativo no Saipos e não existe aqui: ignora
      novos[novoMid(ordem)] = { nome: r.nome.trim(), ativo: true, ordem: ordem++ };
      existentes.add(norm);
    }

    console.log(`\n== ${loja.toUpperCase()} ==`);
    console.log(`  Saipos: ${lista.length} cadastrados · roster atual: ${Object.keys(roster).length}`);
    if (!Object.keys(novos).length) {
      console.log('  nada novo a adicionar');
      continue;
    }
    Object.values(novos).forEach((n) => console.log(`  + ${n.nome}`));
    if (dry) {
      console.log('  [dry] nada gravado');
      continue;
    }
    await ref.set({ roster: novos }, { merge: true });
    console.log(`  ${Object.keys(novos).length} adicionados ao roster`);
  }
  console.log('\nOK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
