import { useMemo, useState } from 'react';
import { Tooltip } from 'recharts';
import { useMarcaMes } from '../hooks/useMarcaMes';
import { useFechamentos } from '../hooks/useFechamentos';
import { useCheckpoints } from '../hooks/useCheckpoints';
import { useDashFeed } from '../hooks/useDashFeed';
import MarcaMesPicker from './gestao/MarcaMesPicker';
import { KpiCard, DeltaChip } from './gestao/KpiCard';
import { ChartTypeMenu } from './gestao/ChartTypeMenu';
import { useChartType } from '../hooks/useChartType';
import { SeriesFlexChart } from './gestao/charts';
import { CheckpointTooltip } from './gestao/checkpointUtils';
import { makeCheckpointDot } from './gestao/checkpointDot';
import {
  MES_LABELS, SERIES_CHART_OPTIONS, calcularMoM, calcularYoY, formatAnoMes, formatAnoMesLong,
  formatCompactCurrency, formatCurrency, formatNumber, formatPercent,
  marcaInfo, nextAnoMes, projetarMes, shortMonthAndYearToAnoMes,
} from '../lib/gestao';
import gStyles from '../styles/Gestao.module.css';
import styles from '../styles/MesaDonoView.module.css';

// Mesa do Dono (Gestão): visão executiva do mês — vendas por dia ao vivo
// (coletor Saipos via JSON), KPIs com MoM/YoY e projeção sazonal, mix por
// canal e gráficos históricos. Fechamentos vêm de fechamentos_mensais.
const CANAIS_INFO = [
  { id: 'ifood', label: 'iFood', cor: '#EA1D2C' },
  { id: 'site', label: 'Site (DD)', cor: '#1a8f52' },
  { id: 'saipos', label: 'Balcão/Tel (Saipos)', cor: '#465FFF' },
];

const DAME_COR = '#A50000';
const LOV_COR = '#EC4899';

const totDia = (d) => [d.dame[0] + d.lov[0], d.dame[1] + d.lov[1], d.dame[2] + d.lov[2]];
const brl = (n) => formatNumber(Math.round(n || 0));

export default function MesaDonoView() {
  const { marca, setMarca, anoMes, setAnoMes } = useMarcaMes();
  const info = marcaInfo(marca);
  const { fechamentos, loading, error } = useFechamentos(marca);
  const { byMes: checkpointsByMes } = useCheckpoints(marca);
  const { data: dashData } = useDashFeed();

  // Totais do mês corrente a partir das vendas diárias, só dias fechados (até
  // ontem) — alimentam os KPIs mesmo sem fechamento na planilha.
  const liveMes = useMemo(() => {
    const mes = dashData?.sales_month?.mes;
    if (!mes) return null;
    const hoje = new Date();
    const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const dias = (dashData?.sales_days ?? []).filter((d) => d.data < hojeIso);
    if (!dias.length) return null;
    let faturamento = 0;
    let pizzas = 0;
    for (const d of dias) {
      if (marca !== 'lov') { faturamento += d.dame[0]; pizzas += d.dame[1]; }
      if (marca !== 'dame') { faturamento += d.lov[0]; pizzas += d.lov[1]; }
    }
    return {
      ano_mes: mes,
      faturamento,
      pizzas,
      ticket: pizzas > 0 ? faturamento / pizzas : 0,
      ateDia: dias[dias.length - 1].dia,
    };
  }, [dashData, marca]);

  // Fechamentos com o mês corrente sobreposto pelos números diários.
  const fechamentosView = useMemo(() => {
    if (!liveMes) return fechamentos;
    const idx = fechamentos.findIndex((f) => f.ano_mes === liveMes.ano_mes);
    if (idx >= 0) {
      const merged = [...fechamentos];
      merged[idx] = {
        ...merged[idx],
        faturamento: liveMes.faturamento,
        pizzas: liveMes.pizzas,
        ticket: liveMes.ticket,
      };
      return merged;
    }
    const virtual = {
      marca, ano_mes: liveMes.ano_mes, faturamento: liveMes.faturamento,
      pizzas: liveMes.pizzas, ticket: liveMes.ticket, origem: [],
    };
    return [...fechamentos, virtual].sort((a, b) => a.ano_mes.localeCompare(b.ano_mes));
  }, [fechamentos, liveMes, marca]);

  const current = useMemo(
    () => fechamentosView.find((f) => f.ano_mes === anoMes),
    [fechamentosView, anoMes]
  );

  const mesCorrente = !!liveMes && anoMes === liveMes.ano_mes;

  const projecao = useMemo(
    () => projetarMes(fechamentosView, nextAnoMes(anoMes)),
    [fechamentosView, anoMes]
  );

  const chartData = useMemo(
    () => fechamentos.slice(-24).map((f) => ({
      mes: formatAnoMes(f.ano_mes),
      ano_mes: f.ano_mes,
      faturamento: f.faturamento,
      pizzas: f.pizzas,
    })),
    [fechamentos]
  );

  const salesDays = dashData?.sales_days ?? [];
  const [fatType, setFatType] = useChartType('dash-faturamento', SERIES_CHART_OPTIONS, 'linha');

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Mesa do Dono</h2>
        <MarcaMesPicker marca={marca} setMarca={setMarca} anoMes={anoMes} setAnoMes={setAnoMes} />
      </div>
      <p className={styles.subtitle}>
        <span className={styles.subtitleMarca} style={{ color: info.cor }}>{info.nome}</span>
        {' '}· {formatAnoMesLong(anoMes)}
        {fechamentos.length > 0 && ` · ${fechamentos.length} meses históricos`}
      </p>

      {error && <div className={styles.erro}>Erro ao carregar fechamentos: {error}</div>}

      {salesDays.length > 0 && (
        <VendasMesCard
          dias={salesDays}
          month={dashData?.sales_month}
          mesLabel={dashData?.sales_month?.mes ? formatAnoMesLong(dashData.sales_month.mes) : undefined}
        />
      )}

      {loading ? (
        <div className={styles.loading}>Carregando…</div>
      ) : !current ? (
        <div className={gStyles.empty}>
          {fechamentos.length === 0
            ? 'Sem dados ainda. Sincronize as planilhas DRE + VENDAS LOJAS pra começar.'
            : `Sem dados pra ${formatAnoMesLong(anoMes)}. Histórico disponível: ${formatAnoMes(fechamentos[0].ano_mes)} a ${formatAnoMes(fechamentos[fechamentos.length - 1].ano_mes)}.`}
        </div>
      ) : (
        <>
          <div className={gStyles.kpiGrid}>
            <KpiCard
              icon={<IconRecibo />}
              iconColor={info.cor}
              label="Faturamento"
              value={formatCurrency(current.faturamento, 0)}
              deltas={(
                <>
                  <DeltaChip label="MoM" value={calcularMoM(fechamentosView, anoMes, 'faturamento')?.deltaPerc} />
                  <DeltaChip label="YoY" value={calcularYoY(fechamentosView, anoMes, 'faturamento')?.deltaPerc} />
                </>
              )}
              footer={`${mesCorrente ? `até dia ${liveMes.ateDia} · ` : ''}Projeção ${formatAnoMes(projecao.ano_mes)}: ${formatCompactCurrency(projecao.faturamento.projecao)}`}
            />
            <KpiCard
              icon={<IconPizza />}
              iconColor={info.cor}
              label="Pizzas vendidas"
              value={formatNumber(current.pizzas)}
              deltas={(
                <>
                  <DeltaChip label="MoM" value={calcularMoM(fechamentosView, anoMes, 'pizzas')?.deltaPerc} />
                  <DeltaChip label="YoY" value={calcularYoY(fechamentosView, anoMes, 'pizzas')?.deltaPerc} />
                </>
              )}
              footer={`${mesCorrente ? `até dia ${liveMes.ateDia} · ` : ''}Projeção: ${formatNumber(projecao.pizzas.projecao)}`}
            />
            <KpiCard
              icon={<IconTrend />}
              iconColor={info.cor}
              label="Ticket médio"
              value={formatCurrency(current.ticket)}
              deltas={(
                <>
                  <DeltaChip label="MoM" value={calcularMoM(fechamentosView, anoMes, 'ticket')?.deltaPerc} />
                  <DeltaChip label="YoY" value={calcularYoY(fechamentosView, anoMes, 'ticket')?.deltaPerc} />
                </>
              )}
              footer={`${mesCorrente ? `até dia ${liveMes.ateDia} · ` : ''}Projeção: ${formatCurrency(projecao.ticket.projecao)}`}
            />
          </div>

          <CanaisMesCards
            marca={marca}
            canais={current.canais}
            totalPizzas={current.pizzas}
            salesMonth={dashData?.sales_month}
            mesCorrente={mesCorrente}
          />

          <div className={gStyles.panel}>
            <div className={gStyles.panelHeader}>
              <h3 className={gStyles.panelTitle}>Faturamento — últimos 24 meses</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={gStyles.panelHint}>{chartData.length} pontos</span>
                <ChartTypeMenu options={SERIES_CHART_OPTIONS} value={fatType} onChange={setFatType} />
              </div>
            </div>
            <div className={gStyles.chartBox}>
              <SeriesFlexChart
                type={fatType}
                data={chartData}
                xKey="mes"
                xInterval={Math.max(0, Math.floor(chartData.length / 12) - 1)}
                yTickFormatter={(v) => formatCompactCurrency(v)}
                tooltip={(
                  <Tooltip
                    content={(props) => (
                      <CheckpointTooltip
                        {...props}
                        byMes={checkpointsByMes}
                        formatValue={(v) => formatCurrency(v, 0)}
                        resolveAnoMes={(_, item) => item.payload?.ano_mes ?? null}
                      />
                    )}
                  />
                )}
                series={[{
                  key: 'faturamento',
                  name: 'Faturamento',
                  color: info.cor,
                  strokeWidth: 2.5,
                  dot: makeCheckpointDot({
                    byMes: checkpointsByMes,
                    baseColor: info.cor,
                    resolve: (payload) => payload.ano_mes ?? null,
                  }),
                }]}
              />
            </div>
          </div>

          <EvolucaoAnual
            title="Faturamento — ano a ano"
            fechamentos={fechamentos}
            kpi="faturamento"
            checkpointsByMes={checkpointsByMes}
            formatValue={(v) => formatCurrency(v, 0)}
            formatTick={(v) => formatCompactCurrency(v)}
          />

          <EvolucaoAnual
            title="Pizzas vendidas — ano a ano"
            fechamentos={fechamentos}
            kpi="pizzas"
            checkpointsByMes={checkpointsByMes}
            formatValue={(v) => formatNumber(v)}
            formatTick={(v) => formatNumber(v)}
          />
        </>
      )}
    </div>
  );
}

/**
 * Fatia do mês por canal, soma fecha 100%. Método do DRE: Site = Delivery
 * Direto, iFood = iFood, Saipos = resto. Mês corrente usa pedidos do coletor
 * (até ontem); meses fechados usam pizzas por canal da planilha (aba DADOS).
 * O % de margem por canal do dashboard antigo ficou de fora — o CMV da
 * intranet (Preços → Margem) já cobre essa conta.
 */
function calcularSplit(marca, mesCorrente, salesMonth, canais, totalPizzas) {
  if (mesCorrente && salesMonth?.canais) {
    const marcas = marca === 'consolidado' ? ['dame', 'lov'] : [marca];
    let total = 0;
    let ifood = 0;
    let site = 0;
    for (const m of marcas) {
      total += salesMonth[m][2];
      ifood += salesMonth.canais[m].ifood[1];
      site += salesMonth.canais[m].site[1];
    }
    if (total <= 0) return null;
    return { valores: { ifood, site, saipos: Math.max(0, total - ifood - site) }, total, unidade: 'pedidos' };
  }
  const total = totalPizzas ?? 0;
  if (!canais || total <= 0) return null;
  return {
    valores: { ifood: canais.ifood, site: canais.site, saipos: Math.max(0, total - canais.ifood - canais.site) },
    total,
    unidade: 'pizzas',
  };
}

function CanaisMesCards({ marca, canais, totalPizzas, salesMonth, mesCorrente }) {
  const split = calcularSplit(marca, mesCorrente, salesMonth, canais, totalPizzas);
  return (
    <div className={styles.canaisGrid}>
      {CANAIS_INFO.map((c) => (
        <div key={c.id} className={styles.canalCard}>
          <div className={styles.canalLabel} style={{ color: c.cor }}>{c.label}</div>
          <div className={styles.canalValor}>
            {split ? formatPercent((split.valores[c.id] / split.total) * 100, 1) : '—'}
          </div>
          <div className={styles.canalSub}>
            {split
              ? `${formatNumber(split.valores[c.id])} dos ${formatNumber(split.total)} ${split.unidade} do mês${mesCorrente ? ' · até ontem' : ''}`
              : 'sem dados por canal no mês'}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Vendas por dia do mês corrente: herói do dia + blocos por marca + sparkline. */
function VendasMesCard({ dias, month, mesLabel }) {
  // null → dia mais recente. Clica na barra pra fixar.
  const [si, setSi] = useState(null);
  if (!dias.length) return null;

  const idx = si == null ? dias.length - 1 : Math.max(0, Math.min(dias.length - 1, si));
  const d = dias[idx];
  const tot = totDia(d);
  const prev = dias[idx - 1];
  const pct = prev ? ((tot[0] - totDia(prev)[0]) / (totDia(prev)[0] || 1)) * 100 : null;
  const up = (pct ?? 0) >= 0;
  const max = Math.max(...dias.map((x) => totDia(x)[0]), 1);

  // Esqueleto do mês inteiro: dias sem coleta/futuros ficam apagados.
  const [yy, mm] = (month?.mes ?? '').split('-').map(Number);
  const daysInMonth = yy && mm ? new Date(yy, mm, 0).getDate() : Math.max(...dias.map((x) => x.dia), 30);
  const now = new Date();
  const ehMesCorrente = !!yy && !!mm && mm === now.getMonth() + 1 && yy === now.getFullYear();
  const hojeDia = ehMesCorrente ? now.getDate() : daysInMonth;
  const idxPorDia = new Map();
  dias.forEach((x, i) => idxPorDia.set(x.dia, i));

  // Rodapé do mês: total/pedidos/pizzas/média-dia.
  let t;
  let mesIdx;
  let diasCount;
  if (month?.dame) {
    t = [month.dame[0] + month.lov[0], month.dame[1] + month.lov[1], month.dame[2] + month.lov[2]];
    mesIdx = month.mes ? Number(month.mes.split('-')[1]) - 1 : now.getMonth();
    try {
      diasCount = Math.round((new Date(month.ate).getTime() - new Date(month.de).getTime()) / 864e5) + 1;
    } catch { diasCount = 0; }
  } else {
    t = dias.reduce((a, x) => {
      const v = totDia(x);
      return [a[0] + v[0], a[1] + v[1], a[2] + v[2]];
    }, [0, 0, 0]);
    mesIdx = dias[0]?.data ? Number(dias[0].data.split('-')[1]) - 1 : now.getMonth();
    diasCount = dias.length;
  }
  const media = diasCount > 0 ? Math.round(t[0] / diasCount) : t[0];
  const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  return (
    <div className={gStyles.panel}>
      <div className={styles.vendasHead}>
        <div className={styles.vendasLabel}>
          <span>Vendas por dia</span>
          <span className={styles.vendasLabelDia}>
            {mesLabel ? `${mesLabel} · ` : ''}{d.dow} {d.dia}
          </span>
        </div>
        <div className={styles.vendasNav}>
          <button type="button" className={gStyles.miniBtn} onClick={() => setSi(Math.max(0, idx - 1))} disabled={idx === 0} aria-label="Dia anterior">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button type="button" className={gStyles.miniBtn} onClick={() => setSi(Math.min(dias.length - 1, idx + 1))} disabled={idx === dias.length - 1} aria-label="Próximo dia">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>

      <div className={styles.heroRow}>
        <div className={styles.heroValor}>
          <span className={styles.heroMoeda}>R$</span>
          {brl(tot[0])}
        </div>
        {pct !== null && (
          <span className={`${styles.heroPct} ${up ? styles.heroPctUp : styles.heroPctDown}`}>
            {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
            {prev && <span className={styles.heroPctVs}>vs {prev.dow} {prev.dia}</span>}
          </span>
        )}
      </div>
      <div className={styles.heroSub}>
        <b>{tot[2]}</b> pedidos · <b>{tot[1]}</b> pizzas
      </div>

      <div className={styles.marcasGrid}>
        {[{ nome: 'Dáme', cor: DAME_COR, v: d.dame }, { nome: 'Lov', cor: LOV_COR, v: d.lov }].map((b) => (
          <div key={b.nome} className={styles.marcaBox}>
            <div className={styles.marcaBoxLabel}>
              <span className={gStyles.legendDot} style={{ background: b.cor }} />
              {b.nome}
            </div>
            <div className={styles.marcaBoxValor}>R$ {brl(b.v[0])}</div>
            <div className={styles.marcaBoxSub}>{b.v[2]} ped · {b.v[1]} pz</div>
          </div>
        ))}
      </div>

      <div className={styles.sparkline}>
        {Array.from({ length: daysInMonth }, (_, k) => {
          const dia = k + 1;
          const di = idxPorDia.get(dia) ?? null;
          const futuro = dia > hojeDia;
          const dataDay = di != null ? dias[di] : null;
          const v = dataDay ? totDia(dataDay)[0] : 0;
          const hp = dataDay ? Math.max(6, Math.round((v / max) * 100)) : 10;
          const selected = di != null && di === idx;
          return (
            <button
              key={dia}
              type="button"
              onClick={() => di != null && setSi(di)}
              disabled={di == null}
              title={dataDay
                ? `${dataDay.dow} ${dia}: R$ ${brl(v)}`
                : futuro ? `dia ${dia} — ainda não` : `dia ${dia} — sem dados`}
              style={{ height: `${hp}%` }}
              className={`${styles.sparkBar} ${selected ? styles.sparkBarSelected : ''} ${!dataDay ? styles.sparkBarVazio : ''}`}
            >
              <span className={`${styles.sparkDia} ${futuro ? styles.sparkDiaFuturo : ''}`}>{dia}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.mesResumo}>
        <div>
          <div className={styles.mesResumoLabel}>{MESES_LONGOS[mesIdx] || 'mês'} · mês até hoje</div>
          <div className={styles.mesResumoSub}>
            {t[2]} pedidos · {t[1]} pizzas · R$ {brl(media)}/dia
          </div>
        </div>
        <div className={styles.mesResumoTotal}>
          <span className={styles.heroMoeda}>R$</span>
          {brl(t[0])}
        </div>
      </div>
    </div>
  );
}

/** Linhas por ano (Jan..Dez), toggle de anos na legenda. */
function EvolucaoAnual({ title, fechamentos, kpi, checkpointsByMes, formatValue, formatTick }) {
  const { data, anos } = useMemo(() => {
    const anosSet = new Set();
    const matrix = {};
    for (const f of fechamentos) {
      const [y, m] = f.ano_mes.split('-').map(Number);
      anosSet.add(y);
      if (!matrix[m]) matrix[m] = {};
      matrix[m][y] = f[kpi];
    }
    const anosArr = [...anosSet].sort((a, b) => a - b);
    const dataArr = MES_LABELS.map((mes, idx) => {
      const row = { mes };
      for (const ano of anosArr) {
        const v = matrix[idx + 1]?.[ano];
        if (typeof v === 'number') row[String(ano)] = v;
      }
      return row;
    });
    return { data: dataArr, anos: anosArr };
  }, [fechamentos, kpi]);

  const [hidden, setHidden] = useState(new Set());
  const toggleYear = (year) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };
  const noneHidden = hidden.size === 0;
  const toggleAll = () => {
    if (noneHidden) setHidden(new Set(anos.map(String)));
    else setHidden(new Set());
  };

  const [chartType, setChartType] = useChartType(`evolucao-anual-${kpi}`, SERIES_CHART_OPTIONS, 'linha');

  return (
    <div className={gStyles.panel}>
      <div className={gStyles.panelHeader}>
        <h3 className={gStyles.panelTitle}>{title}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className={gStyles.panelHint}>{anos.length} anos · clique pra alternar</span>
          <ChartTypeMenu options={SERIES_CHART_OPTIONS} value={chartType} onChange={setChartType} />
        </div>
      </div>
      <div className={gStyles.chartBox}>
        <SeriesFlexChart
          type={chartType}
          data={data}
          xKey="mes"
          connectNulls
          yTickFormatter={(v) => formatTick(v)}
          tooltip={(
            <Tooltip
              content={(props) => (
                <CheckpointTooltip
                  {...props}
                  byMes={checkpointsByMes}
                  formatValue={formatValue}
                  singleAnoMes={false}
                  resolveAnoMes={(label, item) => shortMonthAndYearToAnoMes(label, String(item.dataKey))}
                />
              )}
            />
          )}
          series={anos.map((ano) => ({
            key: String(ano),
            name: String(ano),
            color: colorForYear(ano, anos),
            strokeWidth: ano === anos[anos.length - 1] ? 2.5 : 1.8,
            hide: hidden.has(String(ano)),
            dot: makeCheckpointDot({
              byMes: checkpointsByMes,
              baseColor: colorForYear(ano, anos),
              resolve: (payload, dataKey) => shortMonthAndYearToAnoMes(String(payload.mes), String(dataKey)),
            }),
          }))}
        />
      </div>

      <div className={gStyles.legend}>
        <button type="button" className={gStyles.legendBtn} onClick={toggleAll}>
          {noneHidden ? 'Nenhum' : 'Todos'}
        </button>
        {anos.map((ano) => {
          const key = String(ano);
          const isHidden = hidden.has(key);
          const cor = colorForYear(ano, anos);
          return (
            <button
              key={ano}
              type="button"
              className={`${gStyles.legendBtn} ${isHidden ? gStyles.legendBtnOff : ''}`}
              onClick={() => toggleYear(key)}
            >
              <span className={gStyles.legendDot} style={{ background: isHidden ? 'var(--text-muted)' : cor }} />
              {ano}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Ano mais antigo azul-acinzentado claro → mais recente quente e escuro.
function colorForYear(year, allYears) {
  const min = Math.min(...allYears);
  const max = Math.max(...allYears);
  if (max === min) return DAME_COR;
  const t = (year - min) / (max - min);
  const h = 210 - 210 * t;
  const s = 30 + 50 * t;
  const l = 65 - 20 * t;
  return `hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`;
}

const IconRecibo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2h16v20l-2-1.5L16 22l-2-1.5L12 22l-2-1.5L8 22l-2-1.5L4 22V2z" /><path d="M8 7h8M8 11h8M8 15h5" />
  </svg>
);

const IconPizza = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a19 19 0 0 1 10 5L12 22 2 7a19 19 0 0 1 10-5z" /><path d="M12 2a19 19 0 0 1 10 5l-3 4.5A13 13 0 0 0 12 9a13 13 0 0 0-7 2.5L2 7a19 19 0 0 1 10-5z" opacity="0.4" /><circle cx="12" cy="13" r="1" fill="currentColor" stroke="none" /><circle cx="10" cy="17" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const IconTrend = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" />
  </svg>
);
