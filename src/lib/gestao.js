// Base compartilhada da categoria Gestão (Mesa do Dono, Dash, Vendas, DRE,
// Anotações) — portada do projeto dashboard_pizzarias. Datas em "YYYY-MM"
// (ano_mes), dinheiro em número puro; formatação sempre pt-BR.

// ── Marcas ────────────────────────────────────────────────────────────────
// 'consolidado' = Dáme + Lov somadas no cliente (não existe doc consolidado).
export const MARCAS = [
  { id: 'dame', nome: 'Dáme', cor: '#A50000' },
  { id: 'lov', nome: 'Lov', cor: '#EC4899' },
  { id: 'consolidado', nome: 'Ambas', cor: '#465FFF' },
];

export const marcaInfo = (id) => MARCAS.find((m) => m.id === id) || MARCAS[2];

// ── Checkpoints (Anotações) ───────────────────────────────────────────────
export const ESCOPO_LABELS = { dame: 'Dáme', lov: 'Lov', consolidado: 'Ambas' };
export const ESCOPO_CORES = { dame: '#A50000', lov: '#EC4899', consolidado: '#465FFF' };
export const ESCOPO_OPTIONS = ['consolidado', 'dame', 'lov'];

export const TIPO_LABELS = {
  cardapio: 'Cardápio', preco: 'Preço', promocao: 'Promoção', ads_ifood: 'Ads iFood',
  ads_meta: 'Ads Meta', conteudo: 'Conteúdo', crm: 'CRM/Push', operacao: 'Operação',
  externo: 'Externo',
};
export const TIPO_OPTIONS = Object.keys(TIPO_LABELS);

// ── Datas (ano_mes "YYYY-MM") ─────────────────────────────────────────────
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const MES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** "2026-05" → "mai/2026" */
export function formatAnoMes(anoMes) {
  const [y, m] = String(anoMes).split('-').map(Number);
  return `${MESES_CURTOS[(m || 1) - 1]}/${y}`;
}

/** "2026-05" → "maio de 2026" */
export function formatAnoMesLong(anoMes) {
  const [y, m] = String(anoMes).split('-').map(Number);
  return `${MESES_LONGOS[(m || 1) - 1]} de ${y}`;
}

export function currentAnoMes() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function previousAnoMes(anoMes) {
  const [y, m] = anoMes.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function nextAnoMes(anoMes) {
  const [y, m] = anoMes.split('-').map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "mai/2026" → "2026-05" (labels dos eixos dos gráficos). */
export function labelToAnoMes(label) {
  const m = /^(\w{3})\/(\d{4})$/i.exec(String(label));
  if (!m) return null;
  const idx = MESES_CURTOS.indexOf(m[1].toLowerCase());
  if (idx === -1) return null;
  return `${m[2]}-${String(idx + 1).padStart(2, '0')}`;
}

/** "Mai" + 2026 → "2026-05" (EvolucaoAnual: série é o ano, eixo é o mês). */
export function shortMonthAndYearToAnoMes(month, ano) {
  const idx = MESES_CURTOS.indexOf(String(month).toLowerCase().slice(0, 3));
  if (idx === -1) return null;
  return `${ano}-${String(idx + 1).padStart(2, '0')}`;
}

// ── Formatação ────────────────────────────────────────────────────────────
export function formatCurrency(value, decimals = 2) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCompactCurrency(value) {
  if (Math.abs(value) >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `R$ ${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  }
  return formatCurrency(value, 0);
}

export function formatPercent(value, decimals = 1) {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  })}%`;
}

export function formatNumber(value, decimals = 0) {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
}

/** 237220 → "237k", 1500000 → "1,5M" (células da tabela DRE). */
export function compactBR(v) {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  }
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${Math.round(abs)}`;
}

// ── Consolidação Dáme + Lov ───────────────────────────────────────────────
const SUM_KEYS = [
  'faturamento', 'pizzas', 'tributos', 'vendas_liquidas', 'insumos', 'bebidas',
  'comissoes', 'taxas_cartao', 'motoboy', 'margem_contribuicao', 'despesas_adm',
  'despesas_marketing', 'despesas_pessoal', 'resultado_operacional',
  'resultado_op_liquido', 'distribuicao_lucros', 'divisao_socios', 'resultado_final',
];

/** Soma fechamentos das duas marcas por ano_mes e recalcula ticket/percentuais. */
export function consolidarFechamentos(dame, lov) {
  const map = new Map();
  for (const list of [dame, lov]) {
    for (const f of list) {
      const existing = map.get(f.ano_mes);
      if (!existing) {
        const novo = { marca: 'consolidado', ano_mes: f.ano_mes, ticket: 0, origem: [...(f.origem || [])] };
        for (const k of SUM_KEYS) if (typeof f[k] === 'number') novo[k] = f[k];
        novo.faturamento = novo.faturamento ?? 0;
        novo.pizzas = novo.pizzas ?? 0;
        if (f.canais) novo.canais = { ...f.canais };
        map.set(f.ano_mes, novo);
      } else {
        for (const k of SUM_KEYS) {
          if (typeof f[k] === 'number') existing[k] = (typeof existing[k] === 'number' ? existing[k] : 0) + f[k];
        }
        if (f.canais) {
          const cur = existing.canais;
          existing.canais = {
            ifood: (cur?.ifood ?? 0) + f.canais.ifood,
            site: (cur?.site ?? 0) + f.canais.site,
            saipos: (cur?.saipos ?? 0) + f.canais.saipos,
          };
        }
      }
    }
  }
  for (const f of map.values()) {
    f.ticket = f.pizzas > 0 ? f.faturamento / f.pizzas : 0;
    if (f.faturamento > 0) {
      const cmv = (f.insumos ?? 0) + (f.bebidas ?? 0);
      if (cmv > 0) f.cmv_perc = cmv / f.faturamento;
      if (f.despesas_pessoal !== undefined) f.pessoal_perc = f.despesas_pessoal / f.faturamento;
      if (f.resultado_operacional !== undefined) f.resultado_op_perc = f.resultado_operacional / f.faturamento;
    }
  }
  return [...map.values()].sort((a, b) => a.ano_mes.localeCompare(b.ano_mes));
}

/** Soma qtd por (ano_mes, categoria, item) e re-rankeia dentro de cada mês. */
export function consolidarItens(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = `${r.ano_mes}_${r.categoria}_${r.item}`;
    const e = map.get(k);
    if (!e) map.set(k, { ...r, marca: 'consolidado', rank: 0 });
    else e.qtd += r.qtd;
  }
  const arr = [...map.values()];
  const groups = new Map();
  for (const r of arr) {
    const k = `${r.ano_mes}_${r.categoria}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => b.qtd - a.qtd);
    list.forEach((r, i) => { r.rank = i + 1; });
  }
  return arr.sort((a, b) => {
    if (a.ano_mes !== b.ano_mes) return a.ano_mes.localeCompare(b.ano_mes);
    if (a.categoria !== b.categoria) return a.categoria.localeCompare(b.categoria);
    return a.rank - b.rank;
  });
}

// ── Projeção / variações ──────────────────────────────────────────────────
const KPIS = ['faturamento', 'pizzas', 'ticket'];

/**
 * Projeção sazonal: média do mesmo mês nos últimos 3 anos × fator de tendência
 * YoY (soma dos últimos 12 meses ÷ 12 anteriores, limitado a [0.5, 2]).
 */
export function projetarMes(historico, target) {
  const sorted = [...historico].sort((a, b) => a.ano_mes.localeCompare(b.ano_mes));
  const before = sorted.filter((f) => f.ano_mes < target);
  const out = { ano_mes: target };
  for (const kpi of KPIS) out[kpi] = projetarKpi(before, target, kpi);
  return out;
}

function projetarKpi(historico, target, kpi) {
  const [y, m] = target.split('-').map(Number);
  const samples = [];
  for (let i = 1; i <= 3; i++) {
    const ref = `${y - i}-${String(m).padStart(2, '0')}`;
    const v = historico.find((f) => f.ano_mes === ref)?.[kpi];
    if (typeof v === 'number' && v > 0) samples.push(v);
  }
  if (samples.length === 0) return { projecao: 0, min: 0, max: 0, amostras: 0 };
  const media = samples.reduce((a, b) => a + b, 0) / samples.length;
  const fator = fatorYoY(historico, target, kpi);
  return {
    projecao: media * fator,
    min: Math.min(...samples) * fator,
    max: Math.max(...samples) * fator,
    amostras: samples.length,
  };
}

function fatorYoY(historico, target, kpi) {
  const take12Before = (t) => historico.filter((f) => f.ano_mes < t).slice(-12);
  const offset12 = (anoMes) => {
    let cur = anoMes;
    for (let i = 0; i < 12; i++) cur = previousAnoMes(cur);
    return cur;
  };
  const ult12 = take12Before(target);
  const ant12 = take12Before(ult12.length === 12 ? offset12(target) : target);
  const sum = (list) => list.reduce((acc, f) => acc + (typeof f[kpi] === 'number' && f[kpi] > 0 ? f[kpi] : 0), 0);
  const sumUlt = sum(ult12);
  const sumAnt = sum(ant12);
  if (sumUlt === 0 || sumAnt === 0) return 1;
  const fator = sumUlt / sumAnt;
  if (!Number.isFinite(fator) || fator <= 0) return 1;
  return Math.max(0.5, Math.min(2, fator));
}

/** Variação vs mês anterior. */
export function calcularMoM(historico, target, kpi) {
  const cur = historico.find((f) => f.ano_mes === target);
  const prev = historico.find((f) => f.ano_mes === previousAnoMes(target));
  if (!cur || !prev) return null;
  const a = cur[kpi];
  const b = prev[kpi];
  if (typeof a !== 'number' || typeof b !== 'number' || b === 0) return null;
  return { current: a, previous: b, deltaPerc: (a - b) / b };
}

/** Variação vs mesmo mês do ano anterior. */
export function calcularYoY(historico, target, kpi) {
  const [y, m] = target.split('-').map(Number);
  const cur = historico.find((f) => f.ano_mes === target);
  const prev = historico.find((f) => f.ano_mes === `${y - 1}-${String(m).padStart(2, '0')}`);
  if (!cur || !prev) return null;
  const a = cur[kpi];
  const b = prev[kpi];
  if (typeof a !== 'number' || typeof b !== 'number' || b === 0) return null;
  return { current: a, previous: b, deltaPerc: (a - b) / b };
}

// ── DRE ───────────────────────────────────────────────────────────────────
/** Contas do DRE com detalhe por favorecido em dre_detalhes. */
export const CONTAS_COM_DETALHE = new Set([
  'tributos', 'insumos', 'bebidas', 'comissoes', 'taxas_cartao', 'motoboy',
  'despesas_adm', 'despesas_marketing', 'despesas_pessoal',
  'distribuicao_lucros', 'divisao_socios',
]);

// ── Tipos de gráfico (ChartTypeMenu + SeriesFlexChart/DistribFlexChart) ───
export const SERIES_CHART_OPTIONS = [
  { id: 'linha', label: 'Linha' },
  { id: 'degrau', label: 'Degrau' },
  { id: 'area', label: 'Área' },
  { id: 'area_emp', label: 'Área empilhada' },
  { id: 'barras', label: 'Barras' },
  { id: 'barras_emp', label: 'Barras empilhadas' },
];

export const DISTRIB_CHART_OPTIONS = [
  { id: 'rosca', label: 'Rosca' },
  { id: 'pizza', label: 'Pizza' },
  { id: 'barras', label: 'Barras' },
  { id: 'barras_h', label: 'Barras horizontais' },
  { id: 'treemap', label: 'Treemap' },
  { id: 'funil', label: 'Funil' },
];

// ── Sync Google Sheets → Firestore (Web Apps do Apps Script) ──────────────
// URLs/tokens fora do código porque o repo é público (.env → secret DOTENV).
const DRE_SYNC_URL = import.meta.env.VITE_SYNC_DRE_URL || '';
const DRE_SYNC_TOKEN = import.meta.env.VITE_SYNC_DRE_TOKEN || '';
const VENDAS_SYNC_URL = import.meta.env.VITE_SYNC_VENDAS_URL || '';
const VENDAS_SYNC_TOKEN = import.meta.env.VITE_SYNC_VENDAS_TOKEN || '';

export const dreSyncConfigured = DRE_SYNC_URL.length > 0;
export const vendasSyncConfigured = VENDAS_SYNC_URL.length > 0;

async function callSync(url, token) {
  if (!url) return false;
  try {
    const res = await fetch(`${url}?token=${token}`);
    const json = await res.json();
    return !!json.ok;
  } catch {
    return false;
  }
}

export const syncDreFromSheet = () => callSync(DRE_SYNC_URL, DRE_SYNC_TOKEN);
export const syncVendasFromSheet = () => callSync(VENDAS_SYNC_URL, VENDAS_SYNC_TOKEN);
