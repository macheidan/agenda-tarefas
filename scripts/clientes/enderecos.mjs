// Parser dos endereços do Saipos, compartilhado pelo importador diário
// (importar_clientes.mjs) e pelo backfill do arquivo (backfill_enderecos.mjs).
//
// POR QUE EM JS E NÃO NO COLETOR
// ------------------------------
// O parse podia morar no Python, junto do resto da coleta. Mas o backfill lê o
// JSONL do backup e é Node — é quem fala com o Firestore. Parser no Python
// significaria escrever o mesmo parser duas vezes e testar os dois, com a
// garantia de que um dia eles divergem. O coletor manda a linha CRUA
// (`enderecosCrus`) e o parse acontece uma vez só, aqui.
//
// O FORMATO DO SAIPOS
// -------------------
// `address` não é uma string: é a lista INTEIRA de endereços do cadastro,
// colada com `<br>`. Cada linha é
//
//   Cidade, Bairro - Logradouro, Número, Complemento
//
// Medido nos 18.463 endereços do backup (dame + lov, 2026-09-01):
//
//   - 100% das linhas têm ` - ` e uma vírgula antes dele. O formato é firme.
//   - o ` - ` aparece 2+ vezes em 353 linhas, mas NUNCA dentro do bairro
//     (0 dos 662+572 bairros distintos contém ` - `): as ocorrências extras
//     estão no logradouro ("Rua Fernandes Vieira - lado par") ou no complemento
//     ("Deixar o pedido no portão da casa/prédio - 703"). Cortar no PRIMEIRO
//     ` - ` está certo sempre.
//   - depois do ` - ` vêm 1 a 7 campos: 7 linhas só com logradouro, 1.577 sem
//     complemento, ~16.400 com os três e ~430 em que o complemento tem vírgula
//     dentro ("503, Em frente da empresa STV") — por isso o complemento é o
//     RESTO da linha, não o terceiro campo.
//   - deduplicar por lugar (cidade+bairro+logradouro+número) tira 7% das
//     linhas: são o mesmo apartamento escrito de jeitos diferentes.
//
// O CAMPO `complement` É REDUNDANTE — NÃO USAR
// --------------------------------------------
// O Saipos manda um `complement` separado, também colado com `<br>`. Ele é o
// conjunto ordenado dos complementos que já estão no fim de cada linha do
// `address`: 6.773 dos 6.896 cadastros que têm os dois batem exatamente, e os
// 120 "parciais" são todos o mesmo artefato — a linha do address traz o número
// zero ("..., 0, Apto 302") e o `complement` traz só "Apto 302". Não existe
// informação em `complement` que não esteja no `address`. Um único cadastro em
// 7 mil (lov/594990) tem complemento sem endereço correspondente. Ler os dois
// só criaria endereço duplicado.

/** Texto sem acento, sem pontuação, minúsculo. Espelha `normalizar()` de
 *  coletar_clientes.py — as chaves precisam bater entre as duas pontas. */
function normalizar(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// O tipo do logradouro é o que varia entre canais: o iFood manda "R. Barão de
// Ubá", o balcão manda "Rua Barão de Ubá". Fica fora da chave, senão o mesmo
// endereço entra duas vezes na lista do cliente. Mesma lista de
// coletar_clientes.py.
const TIPOS_LOGRADOURO = new Set([
  'r', 'rua', 'av', 'avenida', 'trav', 'travessa', 'tv', 'al', 'alameda',
  'pc', 'praca', 'estr', 'estrada', 'rod', 'rodovia', 'beco', 'largo',
  'vl', 'vila', 'acesso', 'esplanada', 'parque', 'pq',
]);

// Número que na verdade quer dizer "não tem". O zero é o mais comum: o Saipos
// grava 0 quando o canal não mandou número, e aí o complemento aparece como se
// fosse o terceiro campo ("..., 0, Apto 302").
const NUMERO_VAZIO = new Set(['', '0', '00', 'sn', 's n', 'n', 'sem numero', 'no', '.', '-']);

// Metadado de cadastro do Saipos; não faz parte do endereço que alguém fala.
const SUFIXO_LADO = /\s*-\s*lado\s+(par|impar|ímpar)\s*$/i;

/** Uma linha do `address` vira {logradouro, numero, complemento, bairro, cidade}.
 *  Devolve null quando a linha não tem endereço nenhum. */
export function parseEndereco(linha) {
  const s = String(linha || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;

  let cidade = '';
  let bairro = '';
  let resto = s;
  const sep = s.indexOf(' - ');
  if (sep >= 0) {
    const esq = s.slice(0, sep).trim();
    resto = s.slice(sep + 3).trim();
    const virg = esq.indexOf(',');
    if (virg >= 0) {
      cidade = esq.slice(0, virg).trim();
      bairro = esq.slice(virg + 1).trim();
    } else {
      // Sem vírgula não dá para saber se aquilo é cidade ou bairro. Zero casos
      // no backup, mas o Saipos não promete nada: fica como bairro, que é o
      // campo que a tela e os relatórios usam.
      bairro = esq;
    }
  }

  const campos = resto.split(',').map((x) => x.trim());
  // "null Rua Ramiro Barcelos 2350 - Hospital de Clínicas": o canal mandou o
  // literal `null` colado no nome da rua.
  const logradouro = (campos[0] || '')
    .replace(/^null\s+/i, '')
    .replace(SUFIXO_LADO, '')
    .trim();

  let numero = campos[1] || '';
  if (NUMERO_VAZIO.has(normalizar(numero))) numero = '';

  let complemento = campos.slice(2).join(', ').trim();
  // Segundo campo que não começa com dígito não é número de porta, é
  // complemento perdido ("Rua Y, casa E11"). Só vale quando não havia
  // complemento — senão viraria duplicata do que já veio depois.
  if (!complemento && numero && !/^\d/.test(numero)) {
    complemento = numero;
    numero = '';
  }
  complemento = complemento.replace(/^[,\s/]+|[,\s/]+$/g, '');

  const end = {};
  if (logradouro) end.logradouro = logradouro;
  if (numero) end.numero = numero;
  if (complemento) end.complemento = complemento;
  if (bairro) end.bairro = bairro;
  if (cidade) end.cidade = cidade;
  return Object.keys(end).length ? end : null;
}

/** Identidade do LUGAR: "porto alegre|chicago|272".
 *
 *  O tipo do logradouro sai fora (ver TIPOS_LOGRADOURO) e o número vira só os
 *  dígitos, senão "489" e "489 " viram lugares diferentes.
 *
 *  O BAIRRO TAMBÉM FICA DE FORA, e isso é uma decisão, não um esquecimento.
 *  Dentro de uma cidade, rua + número já é o lugar — o bairro é só como aquele
 *  canal resolveu chamá-lo. Medido no backup: pôr o bairro na chave parte 281
 *  endereços em dois (1,7%), e a amostra é toda ruído — "passo da areia" contra
 *  "passo d areia", "901petropolis" contra "petropolis", e ruas de divisa que
 *  cada canal atribui a um lado ("Coronel Lucas de Oliveira" entre Bela Vista e
 *  Petrópolis, "Protásio Alves" entre Rio Branco e Alto Petrópolis). Nenhum era
 *  endereço diferente de verdade. Para o bot, perguntar "é a Couto de Magalhães
 *  1234 em Higienópolis ou a Couto de Magalhães 1234 em São João?" é pior do
 *  que dizer um bairro talvez impreciso: o que entrega a pizza é rua + número. */
export function chaveEndereco(end) {
  if (!end) return '';
  const nome = normalizar(end.logradouro)
    .split(' ')
    .filter((w) => w && !TIPOS_LOGRADOURO.has(w))
    .join(' ');
  const num = String(end.numero || '').replace(/\D/g, '');
  return [normalizar(end.cidade), nome, num].join('|');
}

/** Dos dois registros do MESMO lugar, o melhor de cada campo.
 *
 *  O complemento fica com o mais CURTO não vazio de propósito: o Saipos guarda
 *  o mesmo apartamento escrito de três jeitos ("403", "403 / Padaria Dalmas",
 *  "403, Padaria Dalmas") e mistura instrução de entrega no meio ("Deixar o
 *  pedido no portão da casa/prédio - 703"). O curto é o apartamento. */
function melhorEndereco(a, b) {
  const maisLongo = (x, y) => ((y || '').length > (x || '').length ? y : x) || '';
  const maisCurto = (x, y) => {
    if (!x) return y || '';
    if (!y) return x;
    return y.length < x.length ? y : x;
  };
  const campos = {
    // O nome escrito por extenso ganha da abreviação: "Rua Barão de Ubá" é o
    // que o bot fala melhor que "R. Barão de Ubá".
    logradouro: maisLongo(a.logradouro, b.logradouro),
    numero: a.numero || b.numero || '',
    complemento: maisCurto(a.complemento, b.complemento),
    // Bairro e cidade ficam com o PRIMEIRO que apareceu, não com o "melhor":
    // quando dois canais discordam do bairro da mesma rua, não há critério que
    // acerte, e o que importa é o valor não ficar trocando a cada rodada. Como
    // `montarEnderecos` sempre passa a lista já gravada na frente, o bairro
    // congela na primeira gravação e o bloco não é reescrito à toa.
    bairro: a.bairro || b.bairro || '',
    cidade: a.cidade || b.cidade || '',
  };
  const end = {};
  for (const [k, v] of Object.entries(campos)) if (v) end[k] = v;
  return end;
}

/** Endereço que veio do Firestore (já é objeto) — passa pelos mesmos cortes que
 *  um endereço recém-parseado, senão um doc gravado por uma versão antiga do
 *  script geraria chave diferente para o mesmo lugar e a lista duplicaria. */
function normalizarObjeto(o) {
  if (!o || typeof o !== 'object') return null;
  const end = {};
  for (const campo of ['logradouro', 'numero', 'complemento', 'bairro', 'cidade']) {
    const v = String(o[campo] ?? '').trim();
    if (v) end[campo] = v;
  }
  if (end.numero && NUMERO_VAZIO.has(normalizar(end.numero))) delete end.numero;
  if (end.logradouro) {
    end.logradouro = end.logradouro.replace(SUFIXO_LADO, '').trim();
    if (!end.logradouro) delete end.logradouro;
  }
  return Object.keys(end).length ? end : null;
}

// Teto de endereços por cliente. O Saipos devolve no máximo 6 por cadastro, mas
// um cliente costuma ter vários cadastros e a fusão soma as listas. Oito cabe no
// orçamento do doc e é mais do que qualquer bot precisa ler em voz alta.
export const MAX_ENDERECOS = 8;

/**
 * Junta listas de endereços num só conjunto, sem repetir lugar.
 *
 * Aceita string crua (linha do `address`) ou objeto já parseado (o que veio do
 * Firestore), e é a operação que o merge diário e o backfill usam — daí a
 * exigência de ser IDEMPOTENTE: `unirEnderecos(x, x)` devolve `x`, então rodar
 * o backfill duas vezes não dobra a lista de ninguém.
 */
export function unirEnderecos(...listas) {
  const porChave = new Map();
  for (const lista of listas) {
    for (const bruto of lista || []) {
      const end = typeof bruto === 'string' ? parseEndereco(bruto) : normalizarObjeto(bruto);
      // Sem logradouro não dá para entregar nada, e o bairro sozinho o cliente
      // já tem no campo `b`. Entra na lista só o que localiza uma porta.
      if (!end || !end.logradouro) continue;
      const k = chaveEndereco(end);
      const ja = porChave.get(k);
      porChave.set(k, ja ? melhorEndereco(ja, end) : end);
    }
  }
  return [...porChave.values()];
}

/** A lista final que vai para o campo `d`: sem repetição, com o endereço do
 *  bairro do cliente na frente (para `d[0]` ser coerente com os campos `b` e `c`
 *  do topo) e cortada no teto. Lista vazia vira null, para que `limpar()` tire o
 *  campo do doc em vez de gravar `[]`. */
export function montarEnderecos(listas, { bairro = '', cidade = '' } = {}) {
  const todos = unirEnderecos(...listas);
  if (!todos.length) return null;
  const b = normalizar(bairro);
  const c = normalizar(cidade);
  const rank = (e) =>
    (b && normalizar(e.bairro) === b ? 2 : 0) + (c && normalizar(e.cidade) === c ? 1 : 0);
  return todos
    .map((e, i) => ({ e, i, r: rank(e) }))
    .sort((x, y) => y.r - x.r || x.i - y.i)
    .map((x) => x.e)
    .slice(0, MAX_ENDERECOS);
}

export { normalizar };
