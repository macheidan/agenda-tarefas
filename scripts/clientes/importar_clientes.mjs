// Importa a coleta de clientes do Saipos (JSON do coletar_clientes.py) para o
// Firestore, na coleção `clientes` lida pela seção Clientes da intranet.
//
// Formato no Firestore — a lista NÃO é um doc por cliente. São milhares de
// clientes e a tela carrega todos de uma vez: um doc por cliente custaria
// milhares de leituras por acesso. Cada doc guarda um bloco de até
// CHUNK_SIZE clientes:
//
//   clientes/{loja}_{n}     { loja, chunk, atualizadoEm, itens: [{t,n,p,u}] }
//   clientes/{loja}_meta    { loja, meta: true, total, chunks, coletadoEm, ... }
//
//   t = telefone (só dígitos)   n = nome   p = qtd de pedidos
//   u = última compra (YYYY-MM-DD)
//
// A importação é um MERGE que nunca remove ninguém: a coleta só enxerga quem
// comprou nos últimos 90 dias, e é justamente o envelhecimento de quem já está
// na base que forma as faixas de 91+ dias sem pedir.
//
// Uso: node scripts/clientes/importar_clientes.mjs data/clientes-2026-08-18.json [--dry]

import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const CHUNK_SIZE = 800;
const LOJAS = ['dame', 'lov'];

function initFirestore() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  const svc = JSON.parse(readFileSync(credPath, 'utf8'));
  if (!getApps().length) initializeApp({ credential: cert(svc) });
  return getFirestore();
}

/** Clientes já gravados de uma loja, indexados por telefone. */
async function carregarExistentes(db, loja) {
  const snap = await db.collection('clientes').where('loja', '==', loja).get();
  const porTel = new Map();
  let chunks = 0;
  snap.forEach((doc) => {
    const data = doc.data();
    if (data.meta === true) return;
    chunks += 1;
    for (const item of data.itens || []) {
      if (item?.t) porTel.set(item.t, item);
    }
  });
  return { porTel, chunks };
}

/**
 * Funde a coleta de hoje no que já existe.
 *
 * `p` (pedidos) só cresce: o Saipos conta pedidos por cadastro, e o mesmo
 * telefone costuma ter vários. Quando um cadastro antigo sai da janela de 90
 * dias ele some da coleta, e o total do telefone cairia sozinho — o que na
 * vida real não acontece.
 */
function fundir(existentes, novos) {
  const mapa = new Map(existentes);
  let inseridos = 0;
  let atualizados = 0;
  for (const c of novos) {
    const tel = String(c.telefone || '');
    // Sem telefone ou sem data de última compra o registro não serve para nada
    // na tela (o "dias sem pedir" é a espinha da seção).
    if (!tel || !c.ultimaCompra) continue;
    const antigo = mapa.get(tel);
    if (!antigo) {
      mapa.set(tel, { t: tel, n: c.nome || '', p: c.pedidos || 0, u: c.ultimaCompra || '' });
      inseridos += 1;
      continue;
    }
    const fundido = {
      t: tel,
      n: c.nome || antigo.n || '',
      p: Math.max(antigo.p || 0, c.pedidos || 0),
      u: (c.ultimaCompra || '') > (antigo.u || '') ? c.ultimaCompra : antigo.u || '',
    };
    if (fundido.n !== antigo.n || fundido.p !== antigo.p || fundido.u !== antigo.u) atualizados += 1;
    mapa.set(tel, fundido);
  }
  // Mais recente primeiro: a tela mostra "dias sem pedir" e a leitura natural
  // é do topo, então o bloco 0 já traz quem comprou agora.
  const itens = [...mapa.values()].sort((a, b) => (b.u || '').localeCompare(a.u || ''));
  return { itens, inseridos, atualizados };
}

async function gravar(db, loja, itens, meta, chunksAntigos) {
  const blocos = [];
  for (let i = 0; i < itens.length; i += CHUNK_SIZE) blocos.push(itens.slice(i, i + CHUNK_SIZE));

  const batch = db.batch();
  blocos.forEach((bloco, i) => {
    batch.set(db.collection('clientes').doc(`${loja}_${i}`), {
      loja,
      chunk: i,
      itens: bloco,
      atualizadoEm: FieldValue.serverTimestamp(),
    });
  });
  // Base encolheu (não deve acontecer, mas se acontecer não pode sobrar bloco
  // órfão duplicando clientes na tela).
  for (let i = blocos.length; i < chunksAntigos; i += 1) {
    batch.delete(db.collection('clientes').doc(`${loja}_${i}`));
  }
  batch.set(db.collection('clientes').doc(`${loja}_meta`), {
    loja,
    meta: true,
    total: itens.length,
    chunks: blocos.length,
    janelaDias: meta.janelaDias || null,
    coletadoEm: meta.geradoEm || null,
    atualizadoEm: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return blocos.length;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const dry = args.includes('--dry');
  if (!file) {
    console.error('uso: node scripts/clientes/importar_clientes.mjs <clientes-*.json> [--dry]');
    process.exit(1);
  }
  const dados = JSON.parse(readFileSync(file, 'utf8'));
  const db = initFirestore();

  for (const loja of LOJAS) {
    const novos = dados.lojas?.[loja];
    if (!novos) {
      console.log(`\n== ${loja.toUpperCase()} ==\n  ausente no JSON, pulando`);
      continue;
    }
    const { porTel, chunks } = await carregarExistentes(db, loja);
    const { itens, inseridos, atualizados } = fundir(porTel, novos);
    console.log(`\n== ${loja.toUpperCase()} ==`);
    console.log(`  base atual: ${porTel.size} · coleta: ${novos.length} · novos: ${inseridos} · atualizados: ${atualizados}`);
    console.log(`  base final: ${itens.length} clientes`);
    if (dry) {
      console.log('  [dry] nada gravado');
      continue;
    }
    const blocos = await gravar(db, loja, itens, dados, chunks);
    console.log(`  gravado em ${blocos} bloco(s)`);
  }
  console.log('\nOK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
