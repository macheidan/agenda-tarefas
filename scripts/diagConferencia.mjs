/**
 * DIAGNÓSTICO (só leitura) da futura sub-seção "Conferir Pedidos".
 *
 * Responde, com dado real e antes de escrever a tela, três perguntas:
 *
 *   1. Fornecedor  — quantos fornecedores de Compras casam sozinhos com o
 *                    fornecedor que assina a nota (o de-para que seria manual)?
 *   2. Produto     — quantos itens do catálogo têm vínculo com a base de Preços
 *                    (comprasItens.planilhaNome)? Sem ele a linha nunca acha a
 *                    nota.
 *   3. Unidade     — de todas as linhas de nota reais dos últimos N dias que
 *                    casam com um item do catálogo, em quantas a tela saberia
 *                    converter a quantidade para a unidade em que o gerente
 *                    pediu ("2 cx", não "25 KG")? É a pergunta que decide se a
 *                    conferência funciona sozinha ou cai no preenchimento
 *                    manual.
 *
 * Uso:
 *   node scripts/diagConferencia.mjs
 *   node scripts/diagConferencia.mjs --dias 120
 *
 * Não escreve nada, em lugar nenhum. Precisa da service account do Firebase
 * (serviceAccount.json) e da credencial do Supabase (store central em
 * C:/claude_project/Hub/_credenciais/supabase.env).
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SUPABASE_ENV = process.env.SUPABASE_ENV || 'C:/claude_project/Hub/_credenciais/supabase.env';

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
};
const DIAS = Number(arg('dias', 90));

const norm = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function lerEnv(path) {
  const out = {};
  for (const linha of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = lerEnv(SUPABASE_ENV);
const KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;

async function sb(path) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error(`supabase ${path}: ${JSON.stringify(data)}`);
  return data;
}

// PostgREST devolve no máximo 1000 por vez.
async function sbTudo(path) {
  const todos = [];
  for (let offset = 0; ; offset += 1000) {
    const pagina = await sb(`${path}&limit=1000&offset=${offset}`);
    todos.push(...pagina);
    if (pagina.length < 1000) return todos;
  }
}

// ---------------------------------------------------------------- unidades

// Embalagem: o que o gerente conta ("2 cx"). Sinônimos que aparecem no
// catálogo e na nota apontam para o mesmo código.
const EMB = {
  cx: 'CX', caixa: 'CX', caixas: 'CX', c: 'CX',
  pct: 'PCT', pc: 'PCT', pacote: 'PCT', pacotes: 'PCT', pack: 'PCT',
  fd: 'FD', fardo: 'FD', fardos: 'FD',
  sc: 'SC', saco: 'SC', sacos: 'SC', sca: 'SC',
  bd: 'BD', balde: 'BD', baldes: 'BD',
  gl: 'GL', galao: 'GL', bombona: 'GL',
  lt: 'LT', lata: 'LT', latas: 'LT',
  bj: 'BJ', bandeja: 'BJ', bandejas: 'BJ',
  dz: 'DZ', duzia: 'DZ',
  pt: 'PT', pote: 'PT', potes: 'PT',
  pente: 'PENTE', pentes: 'PENTE',
  bg: 'BG', bag: 'BG',
  un: 'UN', und: 'UN', uni: 'UN', unid: 'UN', unidade: 'UN', unidades: 'UN', pe: 'UN', peca: 'UN', pç: 'UN',
};

// Medida: o que se pesa/mede. Fator para a unidade base da família.
const MED = {
  kg: ['KG', 1], quilo: ['KG', 1], quilos: ['KG', 1], k: ['KG', 1],
  g: ['KG', 0.001], gr: ['KG', 0.001], grama: ['KG', 0.001], gramas: ['KG', 0.001],
  l: ['L', 1], lt: ['L', 1], litro: ['L', 1], litros: ['L', 1],
  ml: ['L', 0.001],
};

/** Lê o campo `unid` do catálogo (texto livre: 'cx 12,5kg', 'kg', 'un', 'sc 25kg'). */
function parseUnid(bruto) {
  const s = norm(bruto);
  if (!s) return null;
  const toks = s.split(' ').filter(Boolean);

  let emb = null;
  let conteudo = null; // { qtd, med, fator } — o que cabe DENTRO de uma embalagem
  let med = null;      // pedido medido direto (kg, l)

  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];

    // '12,5kg' ou '12' seguido de 'kg' — quantidade + medida grudadas ou não.
    const m = t.match(/^(\d+(?:[.,]\d+)?)([a-z]*)$/);
    if (m) {
      const qtd = Number(m[1].replace(',', '.'));
      const sufixo = m[2] || toks[i + 1] || '';
      const info = MED[sufixo] || null;
      if (info && qtd > 0) {
        conteudo = { qtd, med: info[0], fator: info[1] };
        if (!m[2]) i += 1;
        continue;
      }
      if (EMB[sufixo] && qtd > 0) { conteudo = { qtd, med: EMB[sufixo], fator: 1 }; if (!m[2]) i += 1; }
      continue;
    }

    if (!emb && EMB[t] && !MED[t]) { emb = EMB[t]; continue; }
    if (!med && MED[t]) { med = MED[t]; continue; }
    // 'lt' é ambíguo (lata × litro): sem número junto, vale litro.
    if (!emb && EMB[t]) emb = EMB[t];
  }

  if (!emb && !med && !conteudo) return null;
  return { emb, med, conteudo, bruto };
}

/**
 * Tamanho da embalagem escondido no NOME do produto — 'Água c/ Gás 500ml',
 * 'Coloreti Tradicional 1kg', 'Presunto Parma (100g)'. É a informação que
 * permite converter quando o campo Unid. diz só 'un' e a nota vem em ML/KG.
 */
function tamanhoNoNome(nome) {
  const s = norm(nome);
  const achados = [...s.matchAll(/(\d+(?:[.,]\d+)?)\s?(kg|gr|g|ml|lt|l)(?:\s|$)/g)];
  if (!achados.length) return null;
  const ultimo = achados[achados.length - 1];
  const qtd = Number(ultimo[1].replace(',', '.'));
  const info = MED[ultimo[2]];
  if (!info || !qtd) return null;
  return { qtd, med: info[0], fator: info[1] };
}

/** Unidade comercial da nota ('CX', 'KG', 'UN', 'PC'...) num código comparável. */
function parseUnidNota(bruto) {
  const s = norm(bruto);
  if (!s) return null;
  if (MED[s]) return { tipo: 'med', cod: MED[s][0], fator: MED[s][1] };
  if (EMB[s]) return { tipo: 'emb', cod: EMB[s] };
  return null;
}

/**
 * Converte a quantidade da nota para a unidade em que o gerente pediu.
 * Devolve { qtd, regra } ou null quando não souber — e NÃO SABER NUNCA VIRA
 * ZERO: a tela mostra os dois lados crus e pede confirmação humana.
 */
function converter(pedido, qtdNota, unidNotaBruta) {
  const nota = parseUnidNota(unidNotaBruta);
  if (!pedido || !nota) return null;

  // 1. A nota conta a mesma embalagem que o gerente ('CX' × 'cx 12,5kg').
  if (pedido.emb && nota.tipo === 'emb' && nota.cod === pedido.emb) {
    return { qtd: qtdNota, regra: 1 };
  }
  // 2. A nota conta o CONTEÚDO da embalagem ('25 KG' × 'cx 12,5kg' = 2 cx).
  if (pedido.conteudo && nota.tipo === 'med' && nota.cod === pedido.conteudo.med) {
    const emBase = qtdNota * nota.fator;
    return { qtd: emBase / (pedido.conteudo.qtd * pedido.conteudo.fator), regra: 2 };
  }
  if (pedido.conteudo && nota.tipo === 'emb' && nota.cod === pedido.conteudo.med) {
    return { qtd: qtdNota / pedido.conteudo.qtd, regra: 2 };
  }
  // 3. Pedido medido direto, mesma família ('KG' × 'kg', 'G' × 'kg').
  if (pedido.med && nota.tipo === 'med' && nota.cod === pedido.med[0]) {
    return { qtd: (qtdNota * nota.fator) / pedido.med[1], regra: 3 };
  }
  // 3b. Pedido em unidade avulsa e nota também ('UN' × 'un').
  if (pedido.emb && nota.tipo === 'emb' && pedido.emb === 'UN' && nota.cod === 'UN') {
    return { qtd: qtdNota, regra: 3 };
  }
  // 4. O tamanho não está no campo Unid., está no nome ('Água 500ml' pedida em
  //    'un', nota em ML).
  if (pedido.nome && nota.tipo === 'med' && nota.cod === pedido.nome.med) {
    const emBase = qtdNota * nota.fator;
    return { qtd: emBase / (pedido.nome.qtd * pedido.nome.fator), regra: 4 };
  }
  return null;
}

// ------------------------------------------------------------------- main

function initFirestore() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './serviceAccount.json';
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(readFileSync(credPath, 'utf8'))) });
  return getFirestore();
}

const pct = (n, total) => (total ? `${((n / total) * 100).toFixed(0)}%` : '—');
const titulo = (t) => console.log(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`);

async function main() {
  const desde = new Date(Date.now() - DIAS * 864e5).toISOString().slice(0, 10);
  const db = initFirestore();

  const [fornecSnap, itensSnap] = await Promise.all([
    db.collection('comprasFornecedores').get(),
    db.collection('comprasItens').get(),
  ]);
  const fornecedoresCompras = fornecSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const itens = itensSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const [fornecedoresNota, precos] = await Promise.all([
    sbTudo('fornecedores?select=id,nome,nome_curto&order=id'),
    sbTudo(`precos?select=id,data,loja,qtd_embalagem,unidade_embalagem,preco_bruto,nfe_id,produtos(nome,nome_padrao),fornecedores(nome,nome_curto)&data=gte.${desde}&order=data.desc`),
  ]);

  console.log(`janela: últimos ${DIAS} dias (desde ${desde})`);
  console.log(`Compras: ${fornecedoresCompras.length} fornecedores · ${itens.length} itens`);
  console.log(`Notas:   ${precos.length} linhas de nota · ${fornecedoresNota.length} fornecedores cadastrados`);

  // ---------------------------------------------------------- 1. fornecedor
  titulo('1. FORNECEDOR — o de-para casaria sozinho?');
  const notaPorNorm = new Map();
  for (const f of fornecedoresNota) {
    for (const chave of [f.nome, f.nome_curto]) {
      if (chave) notaPorNorm.set(norm(chave), f);
    }
  }
  // Fornecedores que de fato emitiram nota na janela (os que importam).
  const ativos = new Map();
  for (const p of precos) {
    const nome = p.fornecedores?.nome;
    if (nome) ativos.set(norm(nome), (ativos.get(norm(nome)) || 0) + 1);
  }

  let casamExato = 0; let casamPrefixo = 0; const semCasar = [];
  for (const f of fornecedoresCompras) {
    const k = norm(f.name);
    if (notaPorNorm.has(k)) { casamExato += 1; continue; }
    // "Distrimar" dentro de "DISTRIMAR INDUSTRIA E DISTRIBUICAO..."
    const parcial = fornecedoresNota.find((n) => {
      const alvo = norm(n.nome);
      return k.length >= 4 && (alvo.startsWith(k) || alvo.includes(` ${k} `) || norm(n.nome_curto || '') === k);
    });
    if (parcial) { casamPrefixo += 1; console.log(`  ~ ${f.name}  ->  ${parcial.nome}`); continue; }
    semCasar.push(f.name);
  }
  console.log(`\nexato: ${casamExato}/${fornecedoresCompras.length} · por prefixo: ${casamPrefixo} · sem casar: ${semCasar.length}`);
  if (semCasar.length) {
    console.log('sem candidato automático (precisariam do dropdown manual):');
    semCasar.sort().forEach((n) => console.log(`  - ${n}`));
  }
  const emitiramNota = fornecedoresCompras.filter((f) => {
    const k = norm(f.name);
    return [...ativos.keys()].some((a) => a === k || a.startsWith(k) || a.includes(` ${k} `));
  }).length;
  console.log(`\nfornecedores de Compras com nota na janela: ${emitiramNota}/${fornecedoresCompras.length}`);

  // ------------------------------------------------------------- 2. produto
  titulo('2. PRODUTO — o item do pedido acha a linha da nota?');
  const comVinculo = itens.filter((i) => (i.planilhaNome || '').trim());
  console.log(`itens com planilhaNome: ${comVinculo.length}/${itens.length}  (${pct(comVinculo.length, itens.length)})`);

  // Índice dos produtos que aparecem nas notas da janela.
  const produtoDaNota = new Map(); // norm(nome canônico) -> nome exibido
  for (const p of precos) {
    const canon = p.produtos?.nome_padrao || p.produtos?.nome;
    if (canon) produtoDaNota.set(norm(canon), canon);
    if (p.produtos?.nome) produtoDaNota.set(norm(p.produtos.nome), canon || p.produtos.nome);
  }

  const itemParaNota = new Map(); // itemId -> nome canônico do produto na nota
  const semAchar = [];
  for (const i of itens) {
    const alvo = produtoDaNota.get(norm(i.planilhaNome)) || produtoDaNota.get(norm(i.produto));
    if (alvo) itemParaNota.set(i.id, alvo); else semAchar.push(i);
  }
  console.log(`itens que aparecem em alguma nota da janela: ${itemParaNota.size}/${itens.length}  (${pct(itemParaNota.size, itens.length)})`);
  const semVinculoNemNome = semAchar.filter((i) => !(i.planilhaNome || '').trim());
  console.log(`itens sem vínculo E sem nota na janela: ${semVinculoNemNome.length}`);
  console.log('(item sem nota na janela pode ser só sazonal — não é necessariamente erro)');

  // ------------------------------------------------------------- 3. unidade
  titulo('3. UNIDADE — a tela sabe converter para a unidade do gerente?');
  const parsed = new Map();
  const unidIlegivel = [];
  for (const i of itens) {
    const p = parseUnid(i.unid);
    if (p) p.nome = p.conteudo ? null : tamanhoNoNome(i.produto);
    parsed.set(i.id, p);
    if (!p) unidIlegivel.push(i);
  }
  const legiveis = itens.length - unidIlegivel.length;
  console.log(`campo "Unid." legível: ${legiveis}/${itens.length}  (${pct(legiveis, itens.length)})`);
  if (unidIlegivel.length) {
    console.log('\nitens cuja unidade o parser NÃO entende:');
    unidIlegivel.slice(0, 40).forEach((i) => console.log(`  - ${i.produto}  [unid: "${i.unid || '(vazio)'}"]`));
    if (unidIlegivel.length > 40) console.log(`  ... e mais ${unidIlegivel.length - 40}`);
  }

  // Simulação sobre as linhas de nota REAIS que casam com um item do catálogo.
  const porCanon = new Map(); // norm(canônico) -> item do catálogo
  for (const [itemId, canon] of itemParaNota) {
    const item = itens.find((i) => i.id === itemId);
    if (!porCanon.has(norm(canon))) porCanon.set(norm(canon), item);
  }

  const stats = { total: 0, r1: 0, r2: 0, r3: 0, r4: 0, falha: 0 };
  const falhas = new Map();
  const itensComFalha = new Map(); // item -> quantas linhas de nota ele derruba
  const exemplos = [];
  for (const p of precos) {
    const canon = p.produtos?.nome_padrao || p.produtos?.nome;
    const item = porCanon.get(norm(canon || '')) || porCanon.get(norm(p.produtos?.nome || ''));
    if (!item) continue;
    stats.total += 1;
    const r = converter(parsed.get(item.id), Number(p.qtd_embalagem) || 0, p.unidade_embalagem);
    if (!r) {
      stats.falha += 1;
      const k = `"${item.unid || '(vazio)'}"  ×  nota "${p.unidade_embalagem}"`;
      const reg = falhas.get(k) || { n: 0, ex: new Set() };
      reg.n += 1;
      if (reg.ex.size < 3) reg.ex.add(`${item.produto} [${Number(p.qtd_embalagem)}]`);
      falhas.set(k, reg);
      const chaveItem = `${item.produto} (pede em "${item.unid || '?'}")`;
      const f = itensComFalha.get(chaveItem) || { n: 0, unids: new Set() };
      f.n += 1; f.unids.add(p.unidade_embalagem);
      itensComFalha.set(chaveItem, f);
      continue;
    }
    stats[`r${r.regra}`] += 1;
    if (exemplos.length < 12) {
      const q = Number(r.qtd.toFixed(3));
      exemplos.push(`  ${item.produto.padEnd(28).slice(0, 28)} nota ${String(p.qtd_embalagem).padStart(6)} ${String(p.unidade_embalagem).padEnd(4)} ->  ${q} ${item.unid || ''}  [regra ${r.regra}]`);
    }
  }

  console.log(`\nlinhas de nota que casam com um item do catálogo: ${stats.total}`);
  if (stats.total) {
    console.log(`  regra 1 (mesma embalagem):        ${stats.r1}  ${pct(stats.r1, stats.total)}`);
    console.log(`  regra 2 (conteúdo da embalagem):  ${stats.r2}  ${pct(stats.r2, stats.total)}`);
    console.log(`  regra 3 (medida direta):          ${stats.r3}  ${pct(stats.r3, stats.total)}`);
    console.log(`  regra 4 (tamanho no nome):        ${stats.r4}  ${pct(stats.r4, stats.total)}`);
    console.log(`  NÃO CONVERTEU (entrada manual):   ${stats.falha}  ${pct(stats.falha, stats.total)}`);
    const ok = stats.r1 + stats.r2 + stats.r3 + stats.r4;
    console.log(`\n  >>> conferência automática: ${pct(ok, stats.total)} das linhas <<<`);
  }
  if (exemplos.length) {
    console.log('\nexemplos convertidos:');
    exemplos.forEach((e) => console.log(e));
  }
  if (falhas.size) {
    console.log('\npares que o parser não converteu (mais frequentes primeiro):');
    [...falhas.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15)
      .forEach(([k, r]) => {
        console.log(`  ${String(r.n).padStart(4)}×  pedido ${k}`);
        [...r.ex].forEach((e) => console.log(`          ${e}`));
      });
  }

  // Quantos itens distintos precisariam de uma equivalência declarada à mão
  // ("1 fardo = 6 un") para a conversão passar a funcionar sozinha.
  if (itensComFalha.size) {
    const ordenados = [...itensComFalha.entries()].sort((a, b) => b[1].n - a[1].n);
    console.log(`\nitens distintos que respondem por essas ${stats.falha} linhas: ${itensComFalha.size}`);
    let acum = 0; let precisa20 = 0;
    ordenados.forEach(([, r], idx) => { if (idx < 20) { acum += r.n; precisa20 = idx + 1; } });
    console.log(`os ${precisa20} piores cobrem ${acum} linhas (${pct(acum, stats.falha)} das falhas)`);
    console.log('\nitens que precisariam de equivalência declarada (top 20):');
    ordenados.slice(0, 20).forEach(([nome, r]) =>
      console.log(`  ${String(r.n).padStart(4)}×  ${nome}  ->  nota vem em ${[...r.unids].join('/')}`));
  }

  // ------------------------------------------------------------------ loja
  titulo('4. LOJA — dá pra separar Dáme de Lov na nota?');
  const porLoja = {};
  for (const p of precos) porLoja[p.loja || '(vazio)'] = (porLoja[p.loja || '(vazio)'] || 0) + 1;
  Object.entries(porLoja).sort((a, b) => b[1] - a[1])
    .forEach(([l, n]) => console.log(`  ${l.padEnd(10)} ${n}  ${pct(n, precos.length)}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
