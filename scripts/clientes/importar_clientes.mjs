// Importa a coleta de clientes do Saipos (JSON do coletar_clientes.py) para o
// Firestore, na coleção `clientes` lida pela seção Clientes da intranet.
//
// Formato no Firestore — a lista NÃO é um doc por cliente. São milhares de
// clientes e a tela carrega todos de uma vez: um doc por cliente custaria
// milhares de leituras por acesso. Cada doc guarda um bloco de até
// CHUNK_SIZE clientes:
//
//   clientes/{loja}_{n}     { loja, chunk, atualizadoEm, itens: [...] }
//   clientes/{loja}_meta    { loja, meta: true, total, comTelefone, chunks, ... }
//
// Campos de cada item (nomes curtos porque multiplicam por milhares de linhas):
//
//   k = chave de identidade   t = telefone (só dígitos, '' quando não tem)
//   h = hash do CPF           n = nome
//   p = qtd de pedidos        v = valor total comprado (R$)
//   u = última compra (YYYY-MM-DD)   b = bairro   c = cidade
//   x = pedidos cancelados    o = origem do telefone quando emprestado
//   a = aniversário (MM-DD)   e = e-mail
//   hm = pedidos por mês, últimos 12 ({"2026-08": 3})   pc = primeira compra
//   vm = receita por mês, últimos 12 ({"2026-08": 224.8})
//
// `vm` existe porque `v` é o histórico inteiro do cliente: sem ele, a receita de
// um mês só sairia como ticket × pedidos, que erra sempre que o cliente varia o
// tamanho do pedido.
//
// O ticket médio não é gravado: é v/p, calculado na tela.
//
// Entra TODO mundo que comprou na janela, com telefone ou sem — quem veio do
// marketplace não recebe campanha, mas conta em faturamento, recência, bairro e
// ticket. O CPF nunca sobe em claro: o que sobe é `h`, o hash que o coletor usa
// para reconhecer o mesmo cliente entre cadastros.
//
// A importação é um MERGE que nunca remove ninguém por tempo: a coleta só
// enxerga quem comprou nos últimos 90 dias, e é justamente o envelhecimento de
// quem já está na base que forma as faixas de 91+ dias sem pedir.
//
// Uso: node scripts/clientes/importar_clientes.mjs data/clientes-2026-08-18.json [--dry]

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Medido em 2026-08-19, já com `hm` e `vm`: 283 bytes por cliente, ou ~220 KB
// por bloco de 800 — bem longe do teto de 1 MB do doc. Subir o bloco economiza
// leitura a cada abertura da tela, e a quota do Firestore é o gargalo aqui.
const CHUNK_SIZE = 800;
const LOJAS = ['dame', 'lov'];

function initFirestore() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  const svc = JSON.parse(readFileSync(credPath, 'utf8'));
  if (!getApps().length) initializeApp({ credential: cert(svc) });
  return getFirestore();
}

/** Clientes já gravados de uma loja. Itens do formato antigo (só t/n/p/u) ainda
 *  aparecem aqui — a chave deles é o próprio telefone. */
async function carregarExistentes(db, loja) {
  const snap = await db.collection('clientes').where('loja', '==', loja).get();
  const itens = [];
  let chunks = 0;
  let metaAntiga = null;
  snap.forEach((doc) => {
    const data = doc.data();
    if (data.meta === true) {
      metaAntiga = data;
      return;
    }
    chunks += 1;
    for (const item of data.itens || []) {
      if (!item) continue;
      itens.push({ ...item, k: item.k || (item.t ? `t:${item.t}` : `i:${itens.length}`) });
    }
  });
  return { itens, chunks, metaAntiga };
}

/** Texto sem acento e sem pontuação, em minúsculo. Espelha `normalizar()` de
 *  coletar_clientes.py — as duas pontas precisam gerar a MESMA chave. */
function normalizar(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** "marisiana battistella|petropolis", ou '' quando o nome não identifica
 *  ninguém. Nome de uma palavra só ("Amanda") não vale: são mil clientes por
 *  bairro. */
function chaveNomeBairro(nome, bairro) {
  const n = normalizar(nome);
  if (n.split(' ').filter(Boolean).length < 2) return '';
  return `${n}|${normalizar(bairro)}`;
}

/** Índice de busca por telefone, hash de CPF, chave e nome+bairro — as quatro
 *  formas de reconhecer que o cliente da coleta já está na base.
 *
 *  O nome+bairro existe porque o `religar` do coletor só enxerga a janela de 90
 *  dias: quem comprou no balcão há cinco meses e agora pede pelo iFood não tem
 *  com quem casar lá. Aqui a comparação é contra a base INTEIRA, que nunca
 *  esquece ninguém — e é o que faz o reconhecimento continuar valendo à medida
 *  que a base envelhece. */
function indexar(itens) {
  const porTel = new Map();
  const porHash = new Map();
  const porChave = new Map();
  const porNomeBairro = new Map();
  // Homônimos no mesmo bairro: não dá para saber de quem é o telefone, então a
  // chave inteira é descartada. Mesma trava do coletor — dar a uma pessoa o
  // telefone de outra é o único erro grave possível aqui.
  const ambiguos = new Set();
  for (const it of itens) {
    if (it.t) porTel.set(it.t, it);
    if (it.h) porHash.set(it.h, it);
    porChave.set(it.k, it);
    if (!it.t) continue;
    const k = chaveNomeBairro(it.n, it.b);
    if (!k) continue;
    const ja = porNomeBairro.get(k);
    if (ja && ja.t !== it.t) ambiguos.add(k);
    else porNomeBairro.set(k, it);
  }
  for (const k of ambiguos) porNomeBairro.delete(k);
  return { porTel, porHash, porChave, porNomeBairro };
}

/**
 * Funde dois registros do mesmo cliente.
 *
 * `p` e `v` ficam com o MAIOR dos dois, nunca com o da coleta de hoje: o Saipos
 * conta por cadastro e a coleta só enxerga a janela de 90 dias — quando um
 * cadastro antigo sai da janela o total cairia sozinho, o que na vida real não
 * acontece. Os demais campos preferem o dado mais novo e caem no antigo quando
 * a coleta veio vazia.
 */
function fundirItem(antigo, novo) {
  const recente = (novo.u || '') >= (antigo.u || '') ? novo : antigo;
  // A chave segue o telefone do registro fundido: quem entrou sem telefone
  // (chave de CPF) e depois foi religado passa a ser identificado pelo telefone,
  // que é a chave mais forte — e a mesma que a coleta vai mandar amanhã.
  const telefone = novo.t || antigo.t || '';
  const out = {
    k: telefone ? `t:${telefone}` : novo.k || antigo.k,
    t: telefone,
    h: novo.h || antigo.h || '',
    n: recente.n || antigo.n || novo.n || '',
    p: Math.max(antigo.p || 0, novo.p || 0),
    v: Math.max(antigo.v || 0, novo.v || 0),
    u: (novo.u || '') > (antigo.u || '') ? novo.u : antigo.u || '',
    b: recente.b || antigo.b || novo.b || '',
    c: recente.c || antigo.c || novo.c || '',
    x: Math.max(antigo.x || 0, novo.x || 0),
    o: novo.t ? novo.o || '' : antigo.o || '',
    a: novo.a || antigo.a || '',
    e: novo.e || antigo.e || '',
    // O histórico vem recalculado inteiro pelo coletar_historico.py; quando a
    // rodada não o trouxe (script pulado, cliente sem mudança), fica o que havia.
    hm: novo.hm || antigo.hm || null,
    vm: novo.vm || antigo.vm || null,
    pc: menorData(novo.pc, antigo.pc),
  };
  return limpar(out);
}

/** A mais antiga das duas datas — data vazia não conta como "mais antiga". */
function menorData(a, b) {
  if (!a) return b || '';
  if (!b) return a;
  return a < b ? a : b;
}

/** Tira os campos vazios: multiplicados por milhares de linhas, eles pesam no
 *  doc (que tem teto de 1 MB) sem dizer nada. */
function limpar(it) {
  const out = {};
  for (const [campo, valor] of Object.entries(it)) {
    if (valor !== '' && valor !== 0 && valor != null) out[campo] = valor;
  }
  out.k = it.k;
  return out;
}

function daColeta(c) {
  return limpar({
    k: c.chave,
    t: c.telefone || '',
    h: c.cpfHash || '',
    n: c.nome || '',
    p: c.pedidos || 0,
    v: c.valorTotal || 0,
    u: c.ultimaCompra || '',
    b: c.bairro || '',
    c: c.cidade || '',
    x: c.cancelados || 0,
    o: c.telefoneOrigem && c.telefoneOrigem !== 'cadastro' ? c.telefoneOrigem : '',
    a: c.aniversario || '',
    e: c.email || '',
    hm: c.meses && Object.keys(c.meses).length ? c.meses : null,
    vm: c.valorMeses && Object.keys(c.valorMeses).length ? c.valorMeses : null,
    pc: c.primeiraCompra || '',
  });
}

/**
 * Funde a coleta de hoje no que já existe.
 *
 * A identidade de um cliente pode MUDAR de um dia para o outro: quem entrou sem
 * telefone (chave pelo CPF) passa a ter chave de telefone no dia em que a
 * coleta consegue religá-lo. Por isso o casamento tenta telefone, hash de CPF e
 * chave — e quando dois registros da base se revelam a mesma pessoa, eles são
 * fundidos num só em vez de conviverem duplicados na tela.
 */
/** Mantém o índice de nome+bairro em dia conforme a fusão anda. Chave que passa
 *  a apontar para dois telefones diferentes é apagada, não sobrescrita. */
function indexarNomeBairro(idx, item) {
  if (!item.t) return;
  const k = chaveNomeBairro(item.n, item.b);
  if (!k) return;
  const ja = idx.porNomeBairro.get(k);
  if (ja && ja !== item && ja.t !== item.t) idx.porNomeBairro.delete(k);
  else idx.porNomeBairro.set(k, item);
}

function fundir(existentes, novos) {
  const vivos = new Set(existentes);
  const idx = indexar(existentes);
  let inseridos = 0;
  let atualizados = 0;
  let unificados = 0;

  for (const c of novos) {
    // Sem data de última compra não dá para calcular "dias sem pedir", que é a
    // espinha da seção — é cadastro solto do Saipos, não cliente.
    if (!c.ultimaCompra) continue;
    const novo = daColeta(c);
    const achados = [];
    for (const cand of [
      novo.t ? idx.porTel.get(novo.t) : null,
      novo.h ? idx.porHash.get(novo.h) : null,
      idx.porChave.get(novo.k),
      // Identidade que o cadastro tinha ANTES de o coletor lhe emprestar um
      // telefone. Sem isto o registro velho (chaveado pelo nome+endereço)
      // sobreviveria ao lado do novo, e a mesma pessoa apareceria duas vezes na
      // tela — uma delas congelada no dia em que foi religada.
      ...(c.chavesAntigas || []).map((k) => idx.porChave.get(k)),
      // Só para quem chega SEM telefone: é o cadastro de marketplace de alguém
      // que a base já conhece de outro canal, mas que saiu da janela de 90 dias
      // e por isso o coletor não teve com o que casar.
      novo.t ? null : idx.porNomeBairro.get(chaveNomeBairro(novo.n, novo.b)),
    ]) {
      if (cand && vivos.has(cand) && !achados.includes(cand)) achados.push(cand);
    }

    if (!achados.length) {
      const item = limpar(novo);
      vivos.add(item);
      if (item.t) idx.porTel.set(item.t, item);
      if (item.h) idx.porHash.set(item.h, item);
      idx.porChave.set(item.k, item);
      indexarNomeBairro(idx, item);
      inseridos += 1;
      continue;
    }

    // Dois registros antigos que casam com o mesmo cliente eram a mesma pessoa
    // vista por chaves diferentes: viram um só.
    let base = achados[0];
    for (const outro of achados.slice(1)) {
      base = fundirItem(base, outro);
      vivos.delete(outro);
      unificados += 1;
    }
    const fundido = fundirItem(base, novo);
    // Telefone que veio da base, não do cadastro que chegou: a tela marca com
    // asterisco, como faz com o que o coletor religa.
    if (!novo.t && fundido.t && !fundido.o) fundido.o = 'base_nome_bairro';
    for (const antigo of achados) vivos.delete(antigo);
    vivos.add(fundido);
    if (fundido.t) idx.porTel.set(fundido.t, fundido);
    if (fundido.h) idx.porHash.set(fundido.h, fundido);
    idx.porChave.set(fundido.k, fundido);
    indexarNomeBairro(idx, fundido);
    for (const antigo of achados) {
      if (antigo.k !== fundido.k) idx.porChave.set(antigo.k, fundido);
    }
    atualizados += 1;
  }

  // Mais recente primeiro: a tela mostra "dias sem pedir" e a leitura natural
  // é do topo, então o bloco 0 já traz quem comprou agora.
  const itens = [...vivos].sort((a, b) => (b.u || '').localeCompare(a.u || ''));
  return { itens, inseridos, atualizados, unificados };
}

async function gravar(db, loja, itens, meta, chunksAntigos, metaAntiga) {
  // A data a partir da qual a base é COMPLETA. A coleta enxerga 90 dias para
  // trás, então a primeira importação já cobre esse retrovisor; daí em diante a
  // base só cresce. Nunca anda para a frente — é o que permite ao relatório de
  // coorte dizer "esta turma está inflada: dela só sobrou quem voltou".
  const coberturaDesde = menorData(metaAntiga?.coberturaDesde || '', meta.inicio || '');
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
    comTelefone: itens.filter((i) => i.t).length,
    comHistorico: itens.filter((i) => i.hm).length,
    comReceitaMensal: itens.filter((i) => i.vm).length,
    chunks: blocos.length,
    janelaDias: meta.janelaDias || null,
    coberturaDesde: coberturaDesde || null,
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
    const { itens: existentes, chunks, metaAntiga } = await carregarExistentes(db, loja);
    const { itens, inseridos, atualizados, unificados } = fundir(existentes, novos);
    const comTel = itens.filter((i) => i.t).length;
    console.log(`\n== ${loja.toUpperCase()} ==`);
    console.log(
      `  base atual: ${existentes.length} · coleta: ${novos.length} · novos: ${inseridos} · ` +
        `atualizados: ${atualizados} · duplicados unificados: ${unificados}`
    );
    console.log(`  base final: ${itens.length} clientes (${comTel} com telefone)`);
    if (dry) {
      console.log('  [dry] nada gravado');
      continue;
    }
    const blocos = await gravar(db, loja, itens, dados, chunks, metaAntiga);
    console.log(`  gravado em ${blocos} bloco(s)`);
  }
  console.log('\nOK');
}

// O merge é a parte delicada deste script; exportar as funções puras deixa
// testá-lo sem Firestore (scripts/clientes/importar_clientes.test.mjs).
export { fundir, fundirItem, daColeta };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
