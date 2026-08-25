import { useEffect, useMemo, useState } from 'react';
import { Tooltip } from 'recharts';
import { useMarcaMes } from '../hooks/useMarcaMes';
import { useVendasItens } from '../hooks/useVendasItens';
import { useCheckpoints } from '../hooks/useCheckpoints';
import MarcaMesPicker from './gestao/MarcaMesPicker';
import SyncSheetButton from './gestao/SyncSheetButton';
import { ChartTypeMenu } from './gestao/ChartTypeMenu';
import { useChartType } from '../hooks/useChartType';
import { DistribFlexChart, SeriesFlexChart } from './gestao/charts';
import { CheckpointTooltip } from './gestao/checkpointUtils';
import { makeCheckpointDot } from './gestao/checkpointDot';
import {
  DISTRIB_CHART_OPTIONS, SERIES_CHART_OPTIONS,
  formatAnoMes, formatAnoMesLong, formatNumber, formatPercent, marcaInfo,
  vendasSyncConfigured, syncVendasFromSheet,
} from '../lib/gestao';
import gStyles from '../styles/Gestao.module.css';
import styles from '../styles/VendasView.module.css';

// Vendas (Gestão): ranking de itens do mês por categoria, mix (rosca etc.) e
// evolução mensal dos itens selecionados. Dados de vendas_itens (Apps Script
// da planilha VENDAS LOJAS); clique no ranking/legenda alterna o item no gráfico.
const CATEGORIAS = [
  { key: 'sabor', label: 'Sabores' },
  { key: 'borda', label: 'Bordas' },
  { key: 'combo_pizza_p', label: 'Combos pizza P' },
  { key: 'tamanho', label: 'Tamanhos' },
];

export default function VendasView() {
  const { marca, setMarca, anoMes, setAnoMes } = useMarcaMes();
  const info = marcaInfo(marca);

  // Categoria ativa espelhada no ?sub= (padrão Preços): F5 volta na mesma aba.
  const [subPage, setSubPage] = useState(() => {
    try {
      const sub = new URLSearchParams(window.location.search).get('sub');
      return CATEGORIAS.some((c) => c.key === sub) ? sub : 'sabor';
    } catch { return 'sabor'; }
  });

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('sub') === subPage) return;
      url.searchParams.set('sub', subPage);
      window.history.replaceState(null, '', url);
    } catch { /* URL malformada: navegação por estado segue funcionando */ }
  }, [subPage]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Vendas</h2>
        <div className={styles.headerActions}>
          {vendasSyncConfigured && (
            <SyncSheetButton
              onSync={syncVendasFromSheet}
              title="Puxa DADOS + ITENS da planilha VENDAS LOJAS agora (ela também sincroniza sozinha ~1 min após cada edição)"
            />
          )}
          <MarcaMesPicker marca={marca} setMarca={setMarca} anoMes={anoMes} setAnoMes={setAnoMes} />
        </div>
      </div>
      <p className={styles.subtitle}>
        <span className={styles.subtitleMarca} style={{ color: info.cor }}>{info.nome}</span>
        {' '}· {formatAnoMesLong(anoMes)}
      </p>

      <div className={styles.sectionTabs}>
        {CATEGORIAS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`${styles.sectionTab} ${subPage === c.key ? styles.sectionTabActive : ''}`}
            onClick={() => setSubPage(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <CategoriaPanel key={subPage} categoria={subPage} marca={marca} anoMes={anoMes} />
    </div>
  );
}

function CategoriaPanel({ categoria, marca, anoMes }) {
  const mesAtual = useVendasItens({ marca, anoMes, categoria });
  const historico = useVendasItens({ marca, categoria });
  const { byMes: checkpointsByMes } = useCheckpoints(marca);

  const [selected, setSelected] = useState(new Set());

  const itensTopo = mesAtual.itens;
  const itensTopoNomes = useMemo(() => itensTopo.map((i) => i.item), [itensTopo]);

  // Auto-seleciona o nº 1 do ranking quando a lista carrega pela primeira vez.
  useEffect(() => {
    if (selected.size === 0 && itensTopo.length > 0) {
      setSelected(new Set([itensTopo[0].item]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itensTopo.length]);

  const toggleItem = (item) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const allSelected = itensTopoNomes.length > 0 && itensTopoNomes.every((n) => selected.has(n));
  const noneSelected = selected.size === 0;
  const toggleAll = () => {
    if (noneSelected || !allSelected) setSelected(new Set(itensTopoNomes));
    else setSelected(new Set());
  };

  // Pivot do histórico → [{ mes, ano_mes, [item]: qtd }] pros itens selecionados.
  const evolucao = useMemo(() => {
    if (selected.size === 0) return [];
    const byMes = new Map();
    for (const i of historico.itens) {
      if (!selected.has(i.item)) continue;
      const e = byMes.get(i.ano_mes) ?? { mes: formatAnoMes(i.ano_mes), ano_mes: i.ano_mes };
      e[i.item] = i.qtd;
      byMes.set(i.ano_mes, e);
    }
    return [...byMes.values()].sort((a, b) => String(a.ano_mes).localeCompare(String(b.ano_mes)));
  }, [selected, historico.itens]);

  const [mixType, setMixType] = useChartType('vendas-mix', DISTRIB_CHART_OPTIONS, 'rosca');
  const [evoType, setEvoType] = useChartType('vendas-evolucao', SERIES_CHART_OPTIONS, 'linha');

  if (mesAtual.loading) {
    return <div className={styles.loading}>Carregando…</div>;
  }

  if (itensTopo.length === 0) {
    return (
      <div className={gStyles.empty}>
        Sem dados de {CATEGORIAS_LABEL[categoria]} para {formatAnoMesLong(anoMes)}.
      </div>
    );
  }

  const totalMes = itensTopo.reduce((acc, i) => acc + i.qtd, 0);

  // Cor por item: HSL distribuído pela posição no ranking.
  const colorFor = (item) => {
    const idx = itensTopoNomes.indexOf(item);
    return `hsl(${(idx * 360) / itensTopoNomes.length}, 65%, 55%)`;
  };

  // Ranking em 3 colunas verticais (1..N desce pela 1ª, segue na 2ª…).
  const numCols = 3;
  const porColuna = Math.ceil(itensTopo.length / numCols);
  const colunasRanking = Array.from({ length: numCols }, (_, c) =>
    itensTopo.slice(c * porColuna, (c + 1) * porColuna)
  ).filter((chunk) => chunk.length > 0);

  return (
    <div className={styles.grid}>
      <div className={`${gStyles.panel} ${styles.gridFull}`}>
        <div className={gStyles.panelHeader}>
          <h3 className={gStyles.panelTitle}>Ranking</h3>
          <span className={gStyles.panelHint}>
            {itensTopo.length} itens · total: {formatNumber(totalMes)} · clique pra alternar no gráfico
          </span>
        </div>
        <div className={styles.rankingCols}>
          {colunasRanking.map((chunk, ci) => (
            <table key={ci} className={styles.rankTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th className={styles.num}>Qtd</th>
                  <th className={styles.num}>% mês</th>
                </tr>
              </thead>
              <tbody>
                {chunk.map((i) => {
                  const isSelected = selected.has(i.item);
                  return (
                    <tr
                      key={`${i.ano_mes}_${i.item}`}
                      className={`${styles.rankRow} ${isSelected ? styles.rankRowSelected : ''}`}
                      onClick={() => toggleItem(i.item)}
                    >
                      <td className={styles.rankPos}>{i.rank}</td>
                      <td>
                        <span className={styles.rankItem}>
                          <span
                            className={styles.rankDot}
                            style={isSelected ? { background: colorFor(i.item), border: 'none' } : undefined}
                          />
                          {i.item}
                        </span>
                      </td>
                      <td className={styles.num}>{formatNumber(i.qtd)}</td>
                      <td className={`${styles.num} ${styles.rankPct}`}>
                        {formatPercent((i.qtd / totalMes) * 100, 1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))}
        </div>
      </div>

      <div className={gStyles.panel}>
        <div className={gStyles.panelHeader}>
          <h3 className={gStyles.panelTitle}>
            Evolução <span className={gStyles.panelHint}>· {selected.size} selecionado(s)</span>
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={gStyles.panelHint}>{evolucao.length} meses</span>
            <ChartTypeMenu options={SERIES_CHART_OPTIONS} value={evoType} onChange={setEvoType} />
          </div>
        </div>

        {evolucao.length > 0 ? (
          <>
            <div className={gStyles.chartBox}>
              <SeriesFlexChart
                type={evoType}
                data={evolucao}
                xKey="mes"
                connectNulls
                tooltip={(
                  <Tooltip
                    content={(props) => (
                      <CheckpointTooltip
                        {...props}
                        byMes={checkpointsByMes}
                        formatValue={formatNumber}
                        resolveAnoMes={(_, item) => item.payload?.ano_mes ?? null}
                      />
                    )}
                  />
                )}
                series={[...selected].map((item) => ({
                  key: item,
                  name: item,
                  color: colorFor(item),
                  strokeWidth: 2,
                  dot: makeCheckpointDot({
                    byMes: checkpointsByMes,
                    baseColor: colorFor(item),
                    resolve: (payload) => payload.ano_mes ?? null,
                  }),
                }))}
              />
            </div>

            <div className={gStyles.legend}>
              <button type="button" className={gStyles.legendBtn} onClick={toggleAll}>
                {allSelected ? 'Nenhum' : 'Todos'}
              </button>
              {itensTopoNomes.map((item) => {
                const isSelected = selected.has(item);
                return (
                  <button
                    key={item}
                    type="button"
                    className={`${gStyles.legendBtn} ${!isSelected ? gStyles.legendBtnOff : ''}`}
                    onClick={() => toggleItem(item)}
                  >
                    <span
                      className={gStyles.legendDot}
                      style={{ background: isSelected ? colorFor(item) : 'var(--text-muted)' }}
                    />
                    {item}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className={gStyles.panelHint}>
            Selecione um ou mais itens na tabela pra ver a evolução.
          </p>
        )}
      </div>

      <div className={gStyles.panel}>
        <div className={gStyles.panelHeader}>
          <h3 className={gStyles.panelTitle}>Mix do mês</h3>
          <ChartTypeMenu options={DISTRIB_CHART_OPTIONS} value={mixType} onChange={setMixType} />
        </div>
        <div className={gStyles.chartBox} style={{ height: 256 }}>
          <DistribFlexChart
            type={mixType}
            data={itensTopo.map((i, idx) => ({
              name: i.item,
              value: i.qtd,
              fill: `hsl(${(idx * 360) / itensTopo.length}, 65%, 55%)`,
            }))}
            tooltip={(
              <Tooltip
                contentStyle={{
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 8, fontSize: 12,
                }}
                formatter={(v, name) => [
                  `${formatNumber(v)} (${formatPercent((v / totalMes) * 100, 1)})`,
                  name,
                ]}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}

const CATEGORIAS_LABEL = {
  sabor: 'sabores', borda: 'bordas', combo_pizza_p: 'combos pizza P', tamanho: 'tamanhos',
};
