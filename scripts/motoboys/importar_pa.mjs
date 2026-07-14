// Importa as entregas por motoboy do Saipos (JSON do coletar_saipos.py) para o
// Firestore da intranet (motoboySemanas.{loja}_{segunda}.pa), casando os nomes
// do Saipos com o roster da seção Motoboys.
//
// Casamento de nomes, em cascata:
//   1. alias salvo (motoboyConfig.aliases — aprendido em rodadas anteriores ou
//      via "Atribuir a…" na tela Adm)
//   2. nome normalizado idêntico
//   3. fuzzy determinístico (similaridade de Levenshtein >= 0.85, ou primeiro
//      nome igual + sobrenome com inicial igual)
//   4. LLM local (`claude -p`) para nomes digitados errado/muito parecidos
//   5. o que sobrar vai para pa.naoCasados (a tela Adm permite atribuir à mão)
//
// Uso:
//   node scripts/motoboys/importar_pa.mjs data/pa-2026-07-06.json --fonte 3h
//   node scripts/motoboys/importar_pa.mjs --check-done --semana 2026-07-06
//     (exit 0 se as duas lojas já têm pa importado para a semana; senão exit 1)

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const LOJAS = ['dame', 'lov'];

const DEFAULT_CONFIG = {
  taxas: [
    { label: 'Taxa 1', valor: 10.5, faixa: 'até 3km' },
    { label: 'Taxa 2', valor: 13, faixa: 'até 4km' },
    { label: 'Taxa 3', valor: 15, faixa: 'até 5km' },
    { label: 'Taxa 4', valor: 18, faixa: 'até 8km' },
    { label: 'Taxa 5', valor: null, faixa: '' },
    { label: 'Taxa 6', valor: null, faixa: '' },
  ],
  garantia: 100,
  taxaCoop: 20,
};

function parseArgs(argv) {
  const args = { fonte: 'manual' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fonte') args.fonte = argv[++i];
    else if (a === '--semana') args.semana = argv[++i];
    else if (a === '--check-done') args.checkDone = true;
    else if (a === '--dry') args.dry = true;
    else if (!a.startsWith('--')) args.file = a;
  }
  return args;
}

function initFirestore() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  const svc = JSON.parse(readFileSync(credPath, 'utf8'));
  if (!getApps().length) initializeApp({ credential: cert(svc) });
  return getFirestore();
}

export function normalizar(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Distância de Levenshtein (para o fuzzy determinístico).
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function similaridade(a, b) {
  const d = levenshtein(a, b);
  const max = Math.max(a.length, b.length) || 1;
  return 1 - d / max;
}

// Fuzzy determinístico: melhor candidato do roster ou null.
function fuzzyMatch(nomeSaipos, roster) {
  const alvo = normalizar(nomeSaipos);
  let melhor = null;
  let melhorScore = 0;
  for (const [mid, r] of Object.entries(roster)) {
    const cand = normalizar(r.nome);
    let score = similaridade(alvo, cand);
    // Primeiro nome idêntico + inicial do sobrenome igual conta muito.
    const [a0, ...aResto] = alvo.split(' ');
    const [c0, ...cResto] = cand.split(' ');
    if (a0 === c0 && aResto[0]?.[0] && aResto[0][0] === cResto[0]?.[0]) {
      score = Math.max(score, 0.86);
    }
    if (score > melhorScore) {
      melhorScore = score;
      melhor = mid;
    }
  }
  return melhorScore >= 0.85 ? melhor : null;
}

// LLM local via claude CLI: casa nomes restantes com o roster.
function llmMatch(pendentes, roster) {
  if (!pendentes.length || !Object.keys(roster).length) return {};
  const rosterList = Object.entries(roster).map(([mid, r]) => `${mid}: ${r.nome}`).join('\n');
  const prompt = [
    'Você casa nomes de motoboys digitados com erros/variações. Cadastro (id: nome):',
    rosterList,
    '',
    'Nomes vindos do Saipos para casar:',
    pendentes.map((n) => `- ${n}`).join('\n'),
    '',
    'Responda SOMENTE um JSON: {"NOME DO SAIPOS": "id do cadastro" ou null}.',
    'Use null quando não houver correspondência clara (não chute entre pessoas diferentes).',
    'Apelidos, abreviações, erros de digitação e sobrenomes trocados de posição contam como a mesma pessoa.',
  ].join('\n');
  try {
    const out = execFileSync('claude', ['-p', prompt], {
      encoding: 'utf8',
      timeout: 180000,
      shell: true,
      windowsHide: true,
    });
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) return {};
    const mapa = JSON.parse(m[0]);
    const valido = {};
    for (const [nome, mid] of Object.entries(mapa)) {
      if (mid && roster[mid]) valido[nome] = mid;
    }
    return valido;
  } catch (e) {
    console.warn(`  [aviso] matching via LLM indisponível (${e.message?.slice(0, 120)}); nomes ficam como não casados`);
    return {};
  }
}

function novoMid() {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Índice da taxa da intranet com valor mais próximo do valor do Saipos
// (ex.: R$10,00 do Saipos → Taxa 1 R$10,50). Valores <= 0 não mapeiam.
function taxaMaisProxima(valor, taxas) {
  if (!(valor > 0)) return null;
  let melhor = null;
  let melhorDiff = Infinity;
  (taxas || []).forEach((t, i) => {
    const tv = Number(t?.valor);
    if (!(tv > 0)) return;
    const diff = Math.abs(tv - valor);
    if (diff < melhorDiff) {
      melhorDiff = diff;
      melhor = i;
    }
  });
  return melhor;
}

// Detalhe por taxa de um nome do Saipos ({dia: {'10.00': qtd}}) →
// {dia: {taxaIdx: qtd}} usando a config da semana. Loga o mapa de valores.
function mapearTaxas(taxasNome, taxasConfig, mapaLog) {
  const out = {};
  for (const [dia, porValor] of Object.entries(taxasNome || {})) {
    for (const [valStr, qtd] of Object.entries(porValor)) {
      const valor = Number(valStr);
      const ti = taxaMaisProxima(valor, taxasConfig);
      if (ti == null) {
        mapaLog.set(valStr, 'sem taxa (ignorado)');
        continue;
      }
      const tv = Number(taxasConfig[ti]?.valor);
      mapaLog.set(valStr, `${taxasConfig[ti]?.label || `Taxa ${ti + 1}`} (R$ ${tv})${Math.abs(tv - valor) > 3 ? ' [DIFERENCA GRANDE]' : ''}`);
      if (!out[dia]) out[dia] = {};
      out[dia][ti] = (out[dia][ti] || 0) + Number(qtd);
    }
  }
  return out;
}

async function importarLoja(db, loja, semana, diasLoja, fonte, dry) {
  const docId = `${loja}_${semana}`;
  const semanaRef = db.collection('motoboySemanas').doc(docId);
  const configRef = db.collection('motoboyConfig').doc(loja);

  const [semanaSnap, configSnap] = await Promise.all([semanaRef.get(), configRef.get()]);
  const configDoc = configSnap.exists ? configSnap.data() : {};
  let roster = configDoc.roster || {};
  const aliases = configDoc.aliases || {};
  let rosterNovo = false;

  // Agrega nomes do Saipos na semana: { nome: { diaIdx: qtd } }.
  const porNome = {};
  for (const [dia, contagem] of Object.entries(diasLoja?.dias || {})) {
    for (const [nome, qtd] of Object.entries(contagem)) {
      const key = nome.trim();
      if (!porNome[key]) porNome[key] = {};
      porNome[key][dia] = (porNome[key][dia] || 0) + Number(qtd);
    }
  }
  const nomes = Object.keys(porNome);
  console.log(`\n== ${loja.toUpperCase()} (${nomes.length} nomes no Saipos) ==`);

  // Primeiro uso (roster vazio): o próprio Saipos vira o cadastro inicial —
  // só entram nomes que fizeram entrega na semana.
  if (!Object.keys(roster).length && nomes.length) {
    roster = {};
    nomes.forEach((nome, i) => {
      roster[novoMid() + i.toString(36)] = { nome, ativo: true, ordem: i };
    });
    rosterNovo = true;
    console.log(`  roster vazio: criando ${nomes.length} motoboys a partir do Saipos`);
  }

  // Índice do roster por nome normalizado.
  const porNorm = {};
  for (const [mid, r] of Object.entries(roster)) porNorm[normalizar(r.nome)] = mid;

  const casados = {}; // nome saipos -> mid
  const pendentes = [];
  for (const nome of nomes) {
    const norm = normalizar(nome);
    if (aliases[norm] && roster[aliases[norm]]) casados[nome] = aliases[norm];
    else if (porNorm[norm]) casados[nome] = porNorm[norm];
    else {
      const f = fuzzyMatch(nome, roster);
      if (f) casados[nome] = f;
      else pendentes.push(nome);
    }
  }

  // LLM só para o resto (nomes muito tortos).
  if (pendentes.length) {
    console.log(`  fuzzy não resolveu ${pendentes.length}: ${pendentes.join(', ')} — tentando LLM...`);
    const viaLlm = llmMatch(pendentes, roster);
    for (const [nome, mid] of Object.entries(viaLlm)) {
      casados[nome] = mid;
      console.log(`  LLM casou: ${nome} → ${roster[mid].nome}`);
    }
  }

  // Config de taxas usada no mapeamento (mesma prioridade da view:
  // config da semana > default da loja > default fixo).
  const taxasConfig =
    (semanaSnap.exists && semanaSnap.data()?.config?.taxas) ||
    configDoc.config?.taxas ||
    DEFAULT_CONFIG.taxas;
  const detalheTaxas = diasLoja?.taxas || {};
  const mapaLog = new Map();

  const naoCasados = nomes
    .filter((n) => !casados[n])
    .map((n) => {
      const item = { nome: n, dias: porNome[n] };
      const t = mapearTaxas(detalheTaxas[n], taxasConfig, mapaLog);
      if (Object.keys(t).length) item.taxas = t;
      return item;
    });

  // Monta pa.entregas e pa.taxas por mid (somando se dois nomes casarem no mesmo mid).
  const entregas = {};
  const taxas = {};
  for (const [nome, mid] of Object.entries(casados)) {
    if (!entregas[mid]) entregas[mid] = {};
    for (const [dia, qtd] of Object.entries(porNome[nome])) {
      entregas[mid][dia] = (entregas[mid][dia] || 0) + qtd;
    }
    const t = mapearTaxas(detalheTaxas[nome], taxasConfig, mapaLog);
    for (const [dia, porTaxa] of Object.entries(t)) {
      if (!taxas[mid]) taxas[mid] = {};
      if (!taxas[mid][dia]) taxas[mid][dia] = {};
      for (const [ti, qtd] of Object.entries(porTaxa)) {
        taxas[mid][dia][ti] = (taxas[mid][dia][ti] || 0) + qtd;
      }
    }
  }
  if (mapaLog.size) {
    console.log(`  taxas Saipos → intranet: ${[...mapaLog.entries()].map(([v, t]) => `R$ ${v} → ${t}`).join(' · ')}`);
  }

  // Aliases aprendidos nesta rodada (fuzzy/LLM) para as próximas.
  const novosAliases = {};
  for (const [nome, mid] of Object.entries(casados)) {
    const norm = normalizar(nome);
    if (!aliases[norm] && !porNorm[norm]) novosAliases[norm] = mid;
  }

  console.log(`  casados: ${Object.keys(casados).length} · não casados: ${naoCasados.length}`);
  if (dry) {
    console.log('  [dry] nada gravado');
    return;
  }

  if (rosterNovo) {
    await configRef.set({ roster, config: configDoc.config || DEFAULT_CONFIG }, { merge: true });
  }

  // Garante o doc da semana (se a gerente ainda não iniciou, cria com o roster ativo).
  if (!semanaSnap.exists) {
    const motoboys = {};
    Object.entries(roster)
      .filter(([, r]) => r.ativo !== false)
      .sort((a, b) => (a[1].ordem ?? 0) - (b[1].ordem ?? 0))
      .forEach(([mid, r], i) => {
        motoboys[mid] = { nome: r.nome, ordem: i, dias: {} };
      });
    await semanaRef.set({
      loja,
      semana,
      config: configDoc.config || DEFAULT_CONFIG,
      motoboys,
      criadoEm: Timestamp.now(),
      criadoPor: 'importador-saipos',
    });
  }

  // pa é substituído por completo a cada importação (update de campo inteiro,
  // para remover chaves antigas de entregas de rodadas anteriores).
  await semanaRef.update({
    pa: { entregas, taxas, naoCasados, importadoEm: new Date().toISOString(), fonte },
    atualizadoEm: Timestamp.now(),
  });

  if (Object.keys(novosAliases).length) {
    await configRef.set({ aliases: novosAliases }, { merge: true });
    console.log(`  aliases novos salvos: ${Object.keys(novosAliases).length}`);
  }
  console.log(`  gravado em motoboySemanas/${docId}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = initFirestore();

  if (args.checkDone) {
    if (!args.semana) {
      console.error('--check-done exige --semana YYYY-MM-DD');
      process.exit(2);
    }
    for (const loja of LOJAS) {
      const snap = await db.collection('motoboySemanas').doc(`${loja}_${args.semana}`).get();
      if (!snap.exists || !snap.data()?.pa?.importadoEm) {
        console.log(`pendente: ${loja}_${args.semana}`);
        process.exit(1);
      }
    }
    console.log('importação já concluída para as duas lojas');
    process.exit(0);
  }

  if (!args.file) {
    console.error('uso: node scripts/motoboys/importar_pa.mjs <pa-YYYY-MM-DD.json> [--fonte 3h|9h|manual] [--dry]');
    process.exit(1);
  }
  const dados = JSON.parse(readFileSync(args.file, 'utf8'));
  const semana = dados.semana;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana)) {
    console.error(`semana inválida no JSON: ${semana}`);
    process.exit(2);
  }
  for (const loja of LOJAS) {
    await importarLoja(db, loja, semana, dados.lojas?.[loja], args.fonte, args.dry);
  }
  console.log('\nOK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
