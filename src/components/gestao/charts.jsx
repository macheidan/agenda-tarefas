import { cloneElement } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Funnel, FunnelChart,
  LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, Treemap,
  XAxis, YAxis,
} from 'recharts';

// Gráficos flexíveis da Gestão (port do dashboard_pizzarias, recharts).
// Cores estruturais vêm das vars do tema — var() funciona em atributos de
// apresentação SVG nos browsers atuais (mesmo truque do app original).
const GRID = 'var(--border)';
const TICK = { fontSize: 11, fill: 'var(--text-muted)' };
const CARD = 'var(--card)';

/**
 * Séries temporais (eixo X = mês) no tipo escolhido via ChartTypeMenu.
 * `series`: [{ key, name, color, strokeWidth, dot, hide }].
 * `tooltip`: elemento <Tooltip> do recharts com content do chamador.
 */
export function SeriesFlexChart({
  type, data, xKey, series, yTickFormatter, xInterval, yWidth,
  margin = { top: 10, right: 10, bottom: 0, left: 10 }, connectNulls, tooltip, extras,
}) {
  const common = [
    <CartesianGrid key="grid" stroke={GRID} strokeDasharray="3 3" />,
    <XAxis key="x" dataKey={xKey} tick={TICK} interval={xInterval} />,
    <YAxis
      key="y"
      tick={TICK}
      tickFormatter={yTickFormatter ? (v) => yTickFormatter(Number(v)) : undefined}
      width={yWidth}
    />,
    tooltip ? cloneElement(tooltip, { key: 'tooltip' }) : null,
  ];

  if (type === 'barras' || type === 'barras_emp') {
    const stacked = type === 'barras_emp';
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={margin}>
          {common}
          {extras}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name ?? s.key}
              fill={s.color}
              hide={s.hide}
              stackId={stacked ? 'stack' : undefined}
              radius={stacked ? undefined : [4, 4, 0, 0]}
              maxBarSize={48}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'area' || type === 'area_emp') {
    const stacked = type === 'area_emp';
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={margin}>
          {common}
          {extras}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name ?? s.key}
              stroke={s.color}
              strokeWidth={s.strokeWidth ?? 2}
              fill={s.color}
              fillOpacity={stacked ? 0.55 : 0.15}
              stackId={stacked ? 'stack' : undefined}
              hide={s.hide}
              connectNulls={connectNulls}
              activeDot={{ r: 5 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={margin}>
        {common}
        {extras}
        {series.map((s) => (
          <Line
            key={s.key}
            type={type === 'degrau' ? 'stepAfter' : 'monotone'}
            dataKey={s.key}
            name={s.name ?? s.key}
            stroke={s.color}
            strokeWidth={s.strokeWidth ?? 2}
            dot={s.dot}
            activeDot={{ r: 5 }}
            hide={s.hide}
            connectNulls={connectNulls}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function truncate(s, max) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Distribuição categórica (mix/ranking); `data` já ordenado do maior pro menor. */
export function DistribFlexChart({ type, data, tooltip }) {
  const tooltipEl = tooltip ? cloneElement(tooltip, { key: 'tooltip' }) : null;
  const cells = data.map((d, i) => <Cell key={i} fill={d.fill} stroke={CARD} />);

  if (type === 'rosca' || type === 'pizza') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={type === 'rosca' ? '55%' : 0}
            outerRadius="90%"
            paddingAngle={type === 'rosca' ? 1 : 0}
          >
            {cells}
          </Pie>
          {tooltipEl}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'barras') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ ...TICK, fontSize: 10 }}
            tickFormatter={(v) => truncate(String(v), 10)}
            interval={0}
            angle={-35}
            textAnchor="end"
            height={58}
          />
          <YAxis tick={TICK} />
          {tooltipEl}
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {cells}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'barras_h') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={TICK} />
          <YAxis
            type="category"
            dataKey="name"
            width={118}
            interval={0}
            tick={TICK}
            tickFormatter={(v) => truncate(String(v), 16)}
          />
          {tooltipEl}
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {cells}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'treemap') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <Treemap data={data} dataKey="value" nameKey="name" isAnimationActive={false} content={<TreemapCell />}>
          {tooltipEl}
        </Treemap>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <FunnelChart margin={{ top: 4, right: 110, bottom: 4, left: 8 }}>
        {tooltipEl}
        <Funnel dataKey="value" nameKey="name" data={data} isAnimationActive={false}>
          {cells}
          <LabelList
            dataKey="name"
            position="right"
            fill="var(--text-muted)"
            fontSize={11}
            formatter={(v) => truncate(String(v), 16)}
          />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}

function TreemapCell({ x = 0, y = 0, width = 0, height = 0, name, fill }) {
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill ?? 'var(--badge-bg)'} stroke={CARD} strokeWidth={2} rx={4} />
      {width > 56 && height > 24 && name && (
        <text x={x + 6} y={y + 16} fill="#fff" fontSize={11} fontWeight={500}>
          {truncate(name, Math.max(3, Math.floor(width / 7)))}
        </text>
      )}
    </g>
  );
}
