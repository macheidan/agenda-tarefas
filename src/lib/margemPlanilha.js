// Margem por canal — parser da planilha CARDAPIOS (Google Sheets) e regras de
// cálculo. Mesmas regras do dashboard fabiomachado.com.br/pizzas/cmv:
//   preço  = base do tamanho (marca unificada) + adicional do sabor × multiplicador
//   margem = preço − custo (ficha CMV) − taxas do canal
// A planilha é lida DIRETO do Google (CSV público) a cada visita — editou a
// planilha, a intranet reflete no próximo carregamento (ou no botão Atualizar).

const SHEET_ID = '1M9kCQ0D0HWJ9N51GK-zfYCX-zMDt8sGx7QwLi48ajXA';
const GID = '685951063'; // aba SABORES (unificada Dáme + Lov)

export const PLANILHA_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${GID}`;
export const PLANILHA_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;

// Tamanhos: multiplicador do adicional (iFood/Site) e chave de custo no CMV.
export const TAMANHOS = [
  { id: 'pequena', label: 'Pequena', cm: '25cm', sizeKey: 'qtdP', mult: 1 },
  { id: 'media', label: 'Média', cm: '30cm', sizeKey: 'qtdM', mult: 2 },
  { id: 'grande', label: 'Grande', cm: '35cm', sizeKey: 'qtdG', mult: 3 },
  { id: 'super', label: 'Super', cm: '45cm', sizeKey: 'qtdS', mult: 4 },
];

export const CANAIS = [
  { id: 'ifood', label: 'iFood', cor: '#EA1D2C' },
  { id: 'site', label: 'Site', cor: '#3b82f6' },
  { id: 'saipos', label: 'Saipos', cor: '#10b981' },
];

// Taxas default por canal (mesmos valores do dashboard). Percentuais em fração
// (0.10 = 10%); entrega/outros em R$ por pedido/pizza.
export const DEFAULT_MARGEM_CONFIG = {
  pizzasPorPedido: 1.08, // divide a taxa de entrega (cobrada por pedido) entre as pizzas
  brindeSuper: 6, // custo do Fruki 2L que acompanha a Super (Lov) — soma ao custo
  canais: {
    ifood: { taxaVenda: 0.10, taxaPgtoOnline: 0.035, taxaEntrega: 11, taxaCartao: 0.015, outros: 0 },
    site: { taxaVenda: 0, taxaPgtoOnline: 0.03, taxaEntrega: 11, taxaCartao: 0.015, outros: 0 },
    saipos: { taxaVenda: 0, taxaPgtoOnline: 0, taxaEntrega: 0, taxaCartao: 0.015, outros: 0 },
  },
};

// Merge raso com os defaults — doc do Firestore pode vir de versão antiga sem
// algum campo; nunca deixa a conta quebrar por campo faltando.
export function mergeMargemConfig(d) {
  const out = {
    pizzasPorPedido: Number(d?.pizzasPorPedido) > 0 ? Number(d.pizzasPorPedido) : DEFAULT_MARGEM_CONFIG.pizzasPorPedido,
    brindeSuper: Number.isFinite(Number(d?.brindeSuper)) ? Number(d.brindeSuper) : DEFAULT_MARGEM_CONFIG.brindeSuper,
    canais: {},
  };
  for (const c of CANAIS) {
    const def = DEFAULT_MARGEM_CONFIG.canais[c.id];
    const cur = d?.canais?.[c.id] || {};
    out.canais[c.id] = {
      taxaVenda: num(cur.taxaVenda, def.taxaVenda),
      taxaPgtoOnline: num(cur.taxaPgtoOnline, def.taxaPgtoOnline),
      taxaEntrega: num(cur.taxaEntrega, def.taxaEntrega),
      taxaCartao: num(cur.taxaCartao, def.taxaCartao),
      outros: num(cur.outros, def.outros),
    };
  }
  return out;
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// "R$ 124,90" / "R$ 12" -> número. Vazio/inválido -> null.
function money(v) {
  if (v == null) return null;
  const s = String(v).replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Parser CSV mínimo (campos entre aspas com vírgula/aspas duplas escapadas).
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Normaliza nome de sabor pra casar planilha × fichas CMV (portado do dashboard,
// com tolerância extra gh/gue: Margherita = Marguerita).
export function normalizarSabor(nome) {
  let s = String(nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^\s*doce\s*[-–]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  s = s
    .replace(/([a-z])\1/g, '$1') // zz→z, ss→s, ll→l…
    .replace(/gh/g, 'g').replace(/gue/g, 'ge') // margherita = marguerita
    .replace(/z/g, 's') // calabreza = calabresa
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.replace(/ /g, '_');
}

// Nomes que divergem entre a planilha CARDAPIOS e as fichas do CMV
// (slug da planilha -> slug da ficha).
const ALIAS_CMV = {
  alho: 'alho_oleo',
  frango_com_catupiry: 'frango_com_requeijao',
  chocoduo: 'chocolate_due',
  chocolate_branco_morango: 'chocolate_branco_com_morango',
  chocolate_preto_morango: 'chocolate_preto_com_morango',
  m_ms: 'm_m_s',
};

// Busca o valor de um sabor da planilha num mapa indexado por slug de ficha CMV.
export function lookupCmv(map, slugPlanilha) {
  if (map[slugPlanilha] !== undefined) return map[slugPlanilha];
  const alias = ALIAS_CMV[slugPlanilha];
  return alias !== undefined ? map[alias] : undefined;
}

// Estrutura da aba SABORES:
//   topo — bases por tamanho: col0 iFood, col1 Site, col3 Saipos (M/G/S),
//          col4 Saipos (Pequena); col6 identifica o tamanho.
//   depois da linha com col6 = "Nome" — sabores: col0 adicional iFood (1×),
//          col1 adicional Site (1×), col3 adicional Saipos p/ M/G/S (fixo),
//          col4 adicional Saipos pequena, col6 nome, col8/9 códigos PDV
//          Dáme/Lov (presença do código = sabor vendido na marca).
export function parsePlanilha(text) {
  const grid = parseCsv(text);
  const bases = { ifood: {}, site: {}, saipos: {} };
  let headerRow = -1;

  for (let i = 0; i < grid.length; i++) {
    const nome = (grid[i][6] || '').trim();
    if (/^nome$/i.test(nome)) { headerRow = i; break; }
    let t = null;
    if (/^super/i.test(nome)) t = 'super';
    else if (/^grande/i.test(nome)) t = 'grande';
    else if (/^m[eé]dia/i.test(nome)) t = 'media';
    else if (/^pequena/i.test(nome)) t = 'pequena';
    if (t) {
      bases.ifood[t] = money(grid[i][0]);
      bases.site[t] = money(grid[i][1]);
      bases.saipos[t] = t === 'pequena' ? money(grid[i][4]) : money(grid[i][3]);
    }
  }
  if (headerRow < 0) throw new Error('Formato inesperado da planilha (linha "Nome" não encontrada)');

  const sabores = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const nome = (row[6] || '').trim();
    if (!nome) continue;
    if (/sairam|bebida|borda/i.test(nome)) break;
    const adicSite = money(row[1]) ?? 0;
    sabores.push({
      nome,
      slug: normalizarSabor(nome),
      adicIfood: money(row[0]) ?? 0,
      adicSite,
      adicSaiposMedio: money(row[3]) ?? adicSite * 3,
      adicSaiposPequena: money(row[4]) ?? adicSite,
      dame: !!(row[8] || '').trim(),
      lov: !!(row[9] || '').trim(),
    });
  }
  return { bases, sabores };
}

// Preço de venda: base do tamanho + adicional. iFood/Site multiplicam o
// adicional unitário pelo tamanho (1/2/3/4×); Saipos usa colunas próprias
// (valor fixo pra M/G/S e "Soma" pra pequena).
export function calcularPreco(sabor, canal, tamanhoId, bases) {
  const base = bases?.[canal]?.[tamanhoId];
  if (base == null) return null;
  if (canal === 'saipos') {
    return base + (tamanhoId === 'pequena' ? sabor.adicSaiposPequena : sabor.adicSaiposMedio);
  }
  const t = TAMANHOS.find((x) => x.id === tamanhoId);
  const adic = canal === 'ifood' ? sabor.adicIfood : sabor.adicSite;
  return base + (t?.mult || 1) * adic;
}

// Margem efetiva: preço − custo − taxas do canal (integral, como no dashboard).
export function calcularMargem(preco, custo, cfgCanal, pizzasPorPedido) {
  const taxaVenda = preco * (cfgCanal.taxaVenda || 0);
  const pgtoOnline = preco * (cfgCanal.taxaPgtoOnline || 0);
  const entrega = (cfgCanal.taxaEntrega || 0) / Math.max(pizzasPorPedido || 1, 0.0001);
  const cartao = preco * (cfgCanal.taxaCartao || 0);
  const outros = cfgCanal.outros || 0;
  const total = taxaVenda + pgtoOnline + entrega + cartao + outros;
  const margem = preco - custo - total;
  return {
    taxas: { taxaVenda, pgtoOnline, entrega, cartao, outros, total },
    margem,
    margemPerc: preco > 0 ? margem / preco : 0,
  };
}
