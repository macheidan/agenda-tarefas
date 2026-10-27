// Desce a base de clientes da intranet (Firestore `clientes`, montada pela coleta
// diária do Saipos: balcão, site e iFood cruzados) para o sistema de pedidos
// (tabela Supabase `pdv_clientes`, que os PCs das lojas puxam sozinhos). É o
// caminho inverso do subir_pdv.mjs. Pedido do Fábio, 2026-10-27: "a intranet é
// o banco mais atualizado; o sistema tem de usar".
//
// Regra: o cadastro da LOJA manda. Quem já existe no sistema só ganha o que está
// em branco (nome, endereço, e-mail); nada que a loja digitou é trocado. Quem não
// existe entra com nome, endereço, e-mail e o total/última compra da Saipos.
//
// Quem fica de fora:
//   - sem telefone (iFood mascara): o sistema acha cliente pelo telefone;
//   - nascidos no próprio sistema (f = 'pdv'): já estão lá.
//
// Endereço: o sistema só aceita rua do catálogo de Porto Alegre (ruas-poa.json).
// O logradouro da Saipos vira o nome oficial do catálogo quando casa sem
// ambiguidade; quando não casa, o cliente desce sem endereço e a loja escolhe a
// rua na lista no primeiro pedido (mesma regra de sempre). CPF não desce: a
// intranet só guarda o hash. Aniversário também não: vem sem o ano.
//
// Uso: node scripts/clientes/descer_pdv.mjs [--loja dame|lov] [--dry] [--como teste]
//   --como teste: grava na marca `teste` do Supabase (ensaio com a versão de testes)
// Quem chama: run_clientes.cmd, logo depois da importação diária.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { carregarExistentes, initFirestore, LOJAS } from './importar_clientes.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const PDV = 'C:/claude_project/Pizzarias/pedidos dame lov';
const require = createRequire(import.meta.url);
const { norm, chaveRua } = require(`${PDV}/cep.js`);
const RUAS = require(`${PDV}/ruas-poa.js`);

const args = process.argv.slice(2);
const opt = (nome, padrao) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};
const dry = args.includes('--dry');
const como = opt('--como', '');
const lojas = opt('--loja', '') ? [opt('--loja', '')] : LOJAS;
if (lojas.some((l) => !LOJAS.includes(l))) {
  console.error('uso: node scripts/clientes/descer_pdv.mjs [--loja dame|lov] [--dry]');
  process.exit(1);
}
process.env.GOOGLE_APPLICATION_CREDENTIALS ||= join(AQUI, '..', '..', 'serviceAccount.json');

// mesma chave de telefone do server.js (chaveTel): sem 55, com o nono dígito
function chaveTel(bruto) {
  let d = String(bruto || '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + '9' + d.slice(2);
  return d;
}

// ---------- rua da Saipos -> nome oficial do catálogo ----------
const TIPO = /^(rua|r|avenida|av|travessa|tv|trav|estrada|estr|alameda|al|praca|pca|largo|beco|acesso|viela|rodovia|rod)\b/;
const TIPO_CANON = { r: 'rua', av: 'avenida', tv: 'travessa', trav: 'travessa', estr: 'estrada', al: 'alameda', pca: 'praca', rod: 'rodovia' };
const tipoDe = (s) => {
  const m = norm(s).match(TIPO);
  return m ? TIPO_CANON[m[1]] || m[1] : '';
};
const CATALOGO = (() => {
  const mapa = new Map();
  const { ruas } = JSON.parse(readFileSync(`${PDV}/ruas-poa.json`, 'utf8'));
  for (const r of ruas) {
    const k = chaveRua(r.n);
    if (!k) continue;
    if (!mapa.has(k)) mapa.set(k, new Map());
    const nomes = mapa.get(k);
    if (!nomes.has(r.n)) nomes.set(r.n, new Set());
    if (r.b) nomes.get(r.n).add(r.b);
  }
  return mapa;
})();

function ruaOficial(logradouro, bairro) {
  const nomes = CATALOGO.get(chaveRua(logradouro || ''));
  if (!nomes) return '';
  // o mesmo nome escrito de dois jeitos no mapa ("Ac Pc"/"Ac PC") conta como um
  let cand = [...nomes.keys()];
  const so = (lista) => {
    const vistos = new Set();
    return lista.filter((n) => !vistos.has(norm(n)) && vistos.add(norm(n)));
  };
  cand = so(cand);
  if (cand.length > 1) {
    const t = tipoDe(logradouro);
    const doTipo = t ? cand.filter((n) => tipoDe(n) === t) : [];
    if (doTipo.length) cand = doTipo;
  }
  if (cand.length > 1 && bairro) {
    const doBairro = cand.filter((n) => [...nomes.get(n)].includes(bairro));
    if (doBairro.length) cand = doBairro;
  }
  return cand.length === 1 ? cand[0] : '';
}

// primeiro endereço de Porto Alegre que casa com o catálogo
function enderecoDoItem(it) {
  for (const e of it.d || []) {
    const cidade = norm(e.cidade || it.c || '');
    if (cidade && cidade !== 'porto alegre') continue;
    const bairroSaipos = RUAS.bairroOficial(e.bairro || '');
    const rua = ruaOficial(e.logradouro, bairroSaipos);
    if (!rua) continue;
    const daRua = RUAS.bairrosDaRua(rua);
    const bairro = bairroSaipos || (daRua.length === 1 ? daRua[0] : '');
    return { rua, numero: String(e.numero || '').trim(), complemento: String(e.complemento || '').trim(), bairro };
  }
  return null;
}

// ---------- Supabase ----------
const supa = JSON.parse(readFileSync(process.env.PDV_SUPABASE_JSON || `${PDV}/supabase.json`, 'utf8'));
const BASE = supa.url.replace(/\/+$/, '');
const HDR = { apikey: supa.key, Authorization: `Bearer ${supa.key}` };

async function clientesDoPdv(loja) {
  const out = [];
  for (let ini = 0; ; ini += 1000) {
    const r = await fetch(`${BASE}/rest/v1/pdv_clientes?marca=eq.${loja}&select=*&order=telefone`, {
      headers: { ...HDR, Range: `${ini}-${ini + 999}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const lote = await r.json();
    out.push(...lote);
    if (lote.length < 1000) return out;
  }
}

async function gravar(linhas) {
  for (let i = 0; i < linhas.length; i += 500) {
    const r = await fetch(`${BASE}/rest/v1/pdv_clientes`, {
      method: 'POST',
      headers: { ...HDR, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(linhas.slice(i, i + 500)),
      signal: AbortSignal.timeout(60000),
    });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
}

const vazio = (v) => !String(v ?? '').trim();

const db = initFirestore();
for (const loja of lojas) {
  const { itens } = await carregarExistentes(db, loja);
  const destino = como || loja;
  const linhasPdv = await clientesDoPdv(destino);
  const noPdv = new Map();
  for (const l of linhasPdv) {
    const k = chaveTel(l.telefone);
    // linha na chave canônica ganha da crua (antes da migração do server.js)
    if (!noPdv.has(k) || l.telefone === k) noPdv.set(k, l);
  }

  const novas = [];
  const completadas = [];
  let semTel = 0, doPdv = 0, semNome = 0, comEndereco = 0, semRuaNoCatalogo = 0;
  const vistos = new Set();
  for (const it of itens) {
    if (it.f === 'pdv') { doPdv++; continue; }
    const tel = chaveTel(it.t);
    // 0800 é o número mascarado do iFood: o mesmo para muita gente, não é de ninguém
    if (tel.length < 10 || tel.length > 11 || tel.startsWith('0')) { semTel++; continue; }
    if (vistos.has(tel)) continue;
    vistos.add(tel);
    const nome = String(it.n || '').trim();
    const end = enderecoDoItem(it);
    if (end) comEndereco++;
    else if ((it.d || []).length) semRuaNoCatalogo++;
    const email = String(it.e || '').trim();
    const atual = noPdv.get(tel);
    if (!atual) {
      if (!nome) { semNome++; continue; }
      novas.push({
        marca: destino, telefone: tel, nome,
        rua: end?.rua || '', numero: end?.numero || '', complemento: end?.complemento || '', bairro: end?.bairro || '',
        cpf_cnpj: '', nascimento: null, email, obs: '',
        total_pedidos: it.p || 0, ultimo_pedido: it.u || null,
      });
      continue;
    }
    // já existe: só preenche buraco; endereço entra inteiro ou não entra
    const linha = { ...atual };
    let mudou = false;
    if (vazio(linha.nome) && nome) { linha.nome = nome; mudou = true; }
    if (vazio(linha.rua) && end) {
      Object.assign(linha, { rua: end.rua, numero: end.numero, complemento: end.complemento, bairro: end.bairro });
      mudou = true;
    }
    if (vazio(linha.email) && email) { linha.email = email; mudou = true; }
    if (mudou) completadas.push(linha);
  }

  // Cada linha com seu próprio updated_at, 20 ms uma da outra: o PC puxa de 500
  // em 500 por updated_at com 2 s de folga; 500 linhas no mesmo instante fariam
  // o PC puxar sempre as mesmas 500.
  const todas = [...novas, ...completadas];
  const t0 = Date.now() - todas.length * 20;
  todas.forEach((l, i) => { l.updated_at = new Date(t0 + i * 20).toISOString(); });

  console.log(
    `== ${loja.toUpperCase()}${como ? ` -> ${como}` : ''} == intranet: ${itens.length} · no sistema: ${linhasPdv.length} · ` +
      `novos: ${novas.length} · completados: ${completadas.length} · ` +
      `sem telefone: ${semTel} · nascidos no sistema: ${doPdv} · sem nome: ${semNome} · ` +
      `endereço casado com o catálogo: ${comEndereco} · endereço fora do catálogo: ${semRuaNoCatalogo}`
  );
  if (!todas.length) { console.log('  nada a gravar'); continue; }
  if (dry) {
    for (const l of todas.slice(0, 8)) console.log(`  [dry] ${l.telefone} ${l.nome} | ${l.rua}, ${l.numero} ${l.complemento} - ${l.bairro}`);
    console.log('  [dry] nada gravado');
    continue;
  }
  // em chamadas separadas: o PostgREST exige as mesmas colunas em todo o lote, e a
  // linha completada vem com todas as da tabela
  await gravar(novas);
  await gravar(completadas);
  console.log(`  gravado: ${todas.length}`);
}
process.exit(0);
