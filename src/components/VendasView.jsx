import { useEffect, useMemo, useState } from 'react';
import { Tooltip } from 'recharts';
import { useMarcaMes } from '../hooks/useMarcaMes';
import { useVendasItens } from '../hooks/useVendasItens';
import { useVendasBairros, chaveBairro } from '../hooks/useVendasBairros';
import { useVendasDiario, mediasPorDiaSemana, DIAS_SEMANA } from '../hooks/useVendasDiario';
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
  formatAnoMes, formatAnoMesLong, formatCompactCurrency, formatCurrency,
  formatNumber, formatPercent, marcaInfo,
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

// "Por Bairro" não vem da planilha VENDAS LOJAS como as outras sub-abas: vem do
// relatório sales-by-store-district do Saipos (coleção `vendas_bairros`), por
// isso é uma aba à parte e não mais uma categoria de `vendas_itens`.
const SUB_BAIRRO = { key: 'bairro', label: 'Por Bairro' };
// "Por Dia da Semana" também é à parte: vem do relatório Faturamento por dia do
// Saipos (coleção `vendas_diario`).
const SUB_DIA_SEMANA = { key: 'dia_semana', label: 'Por Dia da Semana' };
const SUB_PAGES = [...CATEGORIAS, SUB_BAIRRO, SUB_DIA_SEMANA];

export default function VendasView() {
  const { marca, setMarca, anoMes, setAnoMes } = useMarcaMes();
  const info = marcaInfo(marca);

  // Categoria ativa espelhada no ?sub= (padrão Preços): F5 volta na mesma aba.
  const [subPage, setSubPage] = useState(() => {
    try {
      const sub = new URLSearchParams(window.location.search).get('sub');
      return SUB_PAGES.some((c) => c.key === sub) ? sub : 'sabor';
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
        {SUB_PAGES.map((c) => (
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

      {subPage === SUB_BAIRRO.key ? (
        <BairrosPanel key={subPage} marca={marca} anoMes={anoMes} />
      ) : subPage === SUB_DIA_SEMANA.key ? (
        <DiaSemanaPanel key={subPage} marca={marca} anoMes={anoMes} />
      ) : (
        <CategoriaPanel key={subPage} categoria={subPage} marca={marca} anoMes={anoMes} />
      )}
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

// ── Por Bairro ─────────────────────────────────────────────────────────────
// Vendas por área de entrega. O mês escolhido vira ranking + barras
// horizontais; o histórico inteiro (jan/2024 em diante) vira a linha mês a mês
// dos bairros selecionados. Métrica alterna entre pedidos e faturamento — os
// dois números vêm juntos do relatório do Saipos.
const METRICAS = [
  { id: 'qtd', label: 'Pedidos' },
  { id: 'valor', label: 'Faturamento' },
];

function BairrosPanel({ marca, anoMes }) {
  const { meses, loading, error } = useVendasBairros(marca);
  const { byMes: checkpointsByMes } = useCheckpoints(marca);

  const [metrica, setMetrica] = useState('qtd');
  const [selected, setSelected] = useState(new Set());
  const [mixType, setMixType] = useChartType('vendas-bairros-mix', DISTRIB_CHART_OPTIONS, 'barras_h');
  const [evoType, setEvoType] = useChartType('vendas-bairros-evolucao', SERIES_CHART_OPTIONS, 'linha');

  const ehValor = metrica === 'valor';
  const valorDe = (b) => (ehValor ? b.v || 0 : b.q || 0);
  const formatMetrica = (v) => (ehValor ? formatCurrency(v, 2) : formatNumber(v));

  const doMes = useMemo(
    () => meses.find((m) => m.ano_mes === anoMes) ?? null,
    [meses, anoMes]
  );

  // Ranking do mês na métrica ativa. A chave normalizada é a identidade do
  // bairro (a grafia muda entre canais); o rótulo é a grafia do mês exibido.
  const ranking = useMemo(() => {
    const lista = (doMes?.bairros ?? []).map((b) => ({
      chave: chaveBairro(b.b) || 'sem bairro',
      nome: b.b || 'Sem bairro',
      qtd: b.q || 0,
      valor: b.v || 0,
    }));
    lista.sort((a, b) => (ehValor ? b.valor - a.valor : b.qtd - a.qtd));
    return lista.map((b, i) => ({ ...b, rank: i + 1 }));
  }, [doMes, ehValor]);

  const chaves = useMemo(() => ranking.map((b) => b.chave), [ranking]);
  const rotulos = useMemo(
    () => new Map(ranking.map((b) => [b.chave, b.nome])),
    [ranking]
  );

  // Auto-seleciona os 5 primeiros quando o mês carrega: um bairro só não conta
  // história nenhuma, e a linha com 60 séries não se lê.
  useEffect(() => {
    if (selected.size === 0 && chaves.length > 0) setSelected(new Set(chaves.slice(0, 5)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaves.length]);

  const toggleItem = (chave) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  };

  const allSelected = chaves.length > 0 && chaves.every((c) => selected.has(c));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(chaves));

  // Pivot do histórico → [{ mes, ano_mes, [chave]: valor }]. Meses sem o bairro
  // ficam sem a chave: `connectNulls` liga os pontos em vez de desenhar zero,
  // que faria parecer que o bairro parou de comprar quando ele só não existia.
  const evolucao = useMemo(() => {
    if (selected.size === 0) return [];
    return meses.map((m) => {
      const linha = { mes: formatAnoMes(m.ano_mes), ano_mes: m.ano_mes };
      for (const b of m.bairros || []) {
        const chave = chaveBairro(b.b) || 'sem bairro';
        if (!selected.has(chave)) continue;
        linha[chave] = (linha[chave] || 0) + valorDe(b);
      }
      return linha;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, meses, ehValor]);

  if (loading) return <div className={styles.loading}>Carregando…</div>;

  if (error) {
    return <div className={gStyles.empty}>Não deu pra carregar os bairros: {error}</div>;
  }

  if (meses.length === 0) {
    return (
      <div className={gStyles.empty}>
        Sem vendas por bairro ainda. Rode <code>scripts/vendas/run_bairros.cmd</code> pra
        coletar o histórico no Saipos.
      </div>
    );
  }

  const totalMes = ranking.reduce((acc, b) => acc + (ehValor ? b.valor : b.qtd), 0);
  const totalPedidos = ranking.reduce((acc, b) => acc + b.qtd, 0);
  const totalValor = ranking.reduce((acc, b) => acc + b.valor, 0);

  const colorFor = (chave) => {
    const idx = chaves.indexOf(chave);
    return `hsl(${(idx * 360) / Math.max(1, chaves.length)}, 65%, 55%)`;
  };

  const numCols = 3;
  const porColuna = Math.ceil(ranking.length / numCols);
  const colunasRanking = Array.from({ length: numCols }, (_, c) =>
    ranking.slice(c * porColuna, (c + 1) * porColuna)
  ).filter((chunk) => chunk.length > 0);

  return (
    <div className={styles.grid}>
      <div className={`${gStyles.panel} ${styles.gridFull}`}>
        <div className={gStyles.panelHeader}>
          <h3 className={gStyles.panelTitle}>Ranking de bairros</h3>
          <div className={styles.panelActions}>
            <span className={gStyles.panelHint}>
              {ranking.length} bairros · {formatNumber(totalPedidos)} pedidos ·{' '}
              {formatCurrency(totalValor, 0)} · clique pra alternar no gráfico
            </span>
            <div className={styles.metricaTabs}>
              {METRICAS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`${styles.sectionTab} ${metrica === m.id ? styles.sectionTabActive : ''}`}
                  onClick={() => setMetrica(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {ranking.length === 0 ? (
          <p className={gStyles.panelHint}>
            Sem entregas registradas em {formatAnoMesLong(anoMes)}.
          </p>
        ) : (
          <div className={styles.rankingCols}>
            {colunasRanking.map((chunk, ci) => (
              <table key={ci} className={styles.rankTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Bairro</th>
                    <th className={styles.num}>Pedidos</th>
                    <th className={styles.num}>Valor</th>
                    <th className={styles.num}>% mês</th>
                  </tr>
                </thead>
                <tbody>
                  {chunk.map((b) => {
                    const isSelected = selected.has(b.chave);
                    return (
                      <tr
                        key={b.chave}
                        className={`${styles.rankRow} ${isSelected ? styles.rankRowSelected : ''}`}
                        onClick={() => toggleItem(b.chave)}
                      >
                        <td className={styles.rankPos}>{b.rank}</td>
                        <td>
                          <span className={styles.rankItem}>
                            <span
                              className={styles.rankDot}
                              style={isSelected ? { background: colorFor(b.chave), border: 'none' } : undefined}
                            />
                            {b.nome}
                          </span>
                        </td>
                        <td className={styles.num}>{formatNumber(b.qtd)}</td>
                        <td className={styles.num}>{formatCompactCurrency(b.valor)}</td>
                        <td className={`${styles.num} ${styles.rankPct}`}>
                          {formatPercent((((ehValor ? b.valor : b.qtd) / (totalMes || 1)) * 100), 1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}
          </div>
        )}
      </div>

      <div className={gStyles.panel}>
        <div className={gStyles.panelHeader}>
          <h3 className={gStyles.panelTitle}>
            Evolução mês a mês{' '}
            <span className={gStyles.panelHint}>· {selected.size} bairro(s)</span>
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={gStyles.panelHint}>{meses.length} meses</span>
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
                xInterval={Math.max(0, Math.ceil(evolucao.length / 12) - 1)}
                yTickFormatter={ehValor ? formatCompactCurrency : formatNumber}
                yWidth={ehValor ? 62 : undefined}
                tooltip={(
                  <Tooltip
                    content={(props) => (
                      <CheckpointTooltip
                        {...props}
                        byMes={checkpointsByMes}
                        formatValue={formatMetrica}
                        resolveAnoMes={(_, item) => item.payload?.ano_mes ?? null}
                      />
                    )}
                  />
                )}
                series={[...selected].map((chave) => ({
                  key: chave,
                  name: rotulos.get(chave) ?? chave,
                  color: colorFor(chave),
                  strokeWidth: 2,
                  dot: makeCheckpointDot({
                    byMes: checkpointsByMes,
                    baseColor: colorFor(chave),
                    resolve: (payload) => payload.ano_mes ?? null,
                  }),
                }))}
              />
            </div>

            <div className={gStyles.legend}>
              <button type="button" className={gStyles.legendBtn} onClick={toggleAll}>
                {allSelected ? 'Nenhum' : 'Todos'}
              </button>
              {chaves.map((chave) => {
                const isSelected = selected.has(chave);
                return (
                  <button
                    key={chave}
                    type="button"
                    className={`${gStyles.legendBtn} ${!isSelected ? gStyles.legendBtnOff : ''}`}
                    onClick={() => toggleItem(chave)}
                  >
                    <span
                      className={gStyles.legendDot}
                      style={{ background: isSelected ? colorFor(chave) : 'var(--text-muted)' }}
                    />
                    {rotulos.get(chave) ?? chave}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className={gStyles.panelHint}>
            Selecione um ou mais bairros na tabela pra ver a evolução.
          </p>
        )}
      </div>

      <div className={gStyles.panel}>
        <div className={gStyles.panelHeader}>
          <h3 className={gStyles.panelTitle}>
            Mix do mês <span className={gStyles.panelHint}>· {ehValor ? 'faturamento' : 'pedidos'}</span>
          </h3>
          <ChartTypeMenu options={DISTRIB_CHART_OPTIONS} value={mixType} onChange={setMixType} />
        </div>
        <div className={gStyles.chartBox} style={{ height: Math.min(720, Math.max(256, ranking.length * 22)) }}>
          <DistribFlexChart
            type={mixType}
            data={ranking.map((b) => ({
              name: b.nome,
              value: ehValor ? b.valor : b.qtd,
              fill: colorFor(b.chave),
            }))}
            tooltip={(
              <Tooltip
                contentStyle={{
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 8, fontSize: 12,
                }}
                formatter={(v, name) => [
                  `${formatMetrica(v)} (${formatPercent((v / (totalMes || 1)) * 100, 1)})`,
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

// ── Por Dia da Semana ──────────────────────────────────────────────────────
// Média de cada dia da semana dentro do mês escolhido (só dias com venda
// entram na conta) + a mesma média mês a mês, de jan/2025 em diante. "vs mês"
// compara com a média de um dia qualquer do mês: 150% = esse dia vende 1,5×.
const METRICAS_DIA = [
  { id: 'valor', label: 'Faturamento' },
  { id: 'qtd', label: 'Pedidos' },
  { id: 'ticket', label: 'Ticket médio' },
];

const corDia = (dow) => {
  const idx = DIAS_SEMANA.findIndex((s) => s.dow === dow);
  return `hsl(${(idx * 360) / DIAS_SEMANA.length}, 65%, 55%)`;
};

function DiaSemanaPanel({ marca, anoMes }) {
  const { meses, loading, error } = useVendasDiario(marca);
  const { byMes: checkpointsByMes } = useCheckpoints(marca);

  const [metrica, setMetrica] = useState('valor');
  const [selected, setSelected] = useState(() => new Set(DIAS_SEMANA.map((s) => s.dow)));
  const [mixType, setMixType] = useChartType('vendas-dia-semana-mix', DISTRIB_CHART_OPTIONS, 'barras');
  const [evoType, setEvoType] = useChartType('vendas-dia-semana-evolucao', SERIES_CHART_OPTIONS, 'linha');

  const ehQtd = metrica === 'qtd';
  const metricaLabel = METRICAS_DIA.find((m) => m.id === metrica).label.toLowerCase();
  const formatMetrica = (v) => (v == null ? '—' : ehQtd ? formatNumber(v, 1) : formatCurrency(v, 2));

  const doMes = useMemo(() => meses.find((m) => m.ano_mes === anoMes) ?? null, [meses, anoMes]);
  const medias = useMemo(() => mediasPorDiaSemana(doMes), [doMes]);

  // Um dia qualquer do mês, pra coluna "vs mês".
  const mediaMes = useMemo(() => {
    const dias = medias.reduce((s, m) => s + m.dias, 0);
    const q = medias.reduce((s, m) => s + m.totalQtd, 0);
    const v = medias.reduce((s, m) => s + m.totalValor, 0);
    return { dias, q, v, qtd: dias ? q / dias : null, valor: dias ? v / dias : null, ticket: q ? v / q : null };
  }, [medias]);

  // [{ mes, ano_mes, d1: média de segunda, …, d0: domingo }] na métrica ativa.
  const evolucao = useMemo(
    () => meses.map((m) => {
      const linha = { mes: formatAnoMes(m.ano_mes), ano_mes: m.ano_mes };
      for (const s of mediasPorDiaSemana(m)) {
        if (s[metrica] != null) linha[`d${s.dow}`] = Number(s[metrica].toFixed(2));
      }
      return linha;
    }),
    [meses, metrica]
  );

  const toggleDia = (dow) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dow)) next.delete(dow);
      else next.add(dow);
      return next;
    });
  };
  const allSelected = selected.size === DIAS_SEMANA.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(DIAS_SEMANA.map((s) => s.dow)));

  if (loading) return <div className={styles.loading}>Carregando…</div>;

  if (error) {
    return <div className={gStyles.empty}>Não deu pra carregar as vendas por dia: {error}</div>;
  }

  if (meses.length === 0) {
    return (
      <div className={gStyles.empty}>
        Sem vendas dia a dia ainda. Rode <code>scripts/vendas/coletar_diario.py</code> pra
        coletar o histórico no Saipos.
      </div>
    );
  }

  const melhor = medias.reduce(
    (b, m) => (m[metrica] != null && (!b || m[metrica] > b[metrica]) ? m : b),
    null
  );

  return (
    <div className={styles.grid}>
      <div className={`${gStyles.panel} ${styles.gridFull}`}>
        <div className={gStyles.panelHeader}>
          <h3 className={gStyles.panelTitle}>Média por dia da semana</h3>
          <div className={styles.panelActions}>
            {doMes && (
              <span className={gStyles.panelHint}>
                {mediaMes.dias} dias com venda · {formatNumber(mediaMes.q)} pedidos ·{' '}
                {formatCurrency(mediaMes.v, 0)} · clique pra alternar no gráfico
              </span>
            )}
            <div className={styles.metricaTabs}>
              {METRICAS_DIA.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`${styles.sectionTab} ${metrica === m.id ? styles.sectionTabActive : ''}`}
                  onClick={() => setMetrica(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!doMes ? (
          <p className={gStyles.panelHint}>
            Sem dados de {formatAnoMesLong(anoMes)} ainda — o mês entra no dia 2 do mês
            seguinte, junto com os bairros.
          </p>
        ) : (
          <table className={styles.rankTable}>
            <thead>
              <tr>
                <th>Dia</th>
                <th className={styles.num}>Dias</th>
                <th className={styles.num}>Pedidos/dia</th>
                <th className={styles.num}>Faturamento/dia</th>
                <th className={styles.num}>Ticket médio</th>
                <th className={styles.num}>vs mês</th>
              </tr>
            </thead>
            <tbody>
              {medias.map((m) => {
                const isSelected = selected.has(m.dow);
                const vsMes = m[metrica] != null && mediaMes[metrica]
                  ? (m[metrica] / mediaMes[metrica]) * 100
                  : null;
                return (
                  <tr
                    key={m.dow}
                    className={`${styles.rankRow} ${isSelected ? styles.rankRowSelected : ''}`}
                    onClick={() => toggleDia(m.dow)}
                  >
                    <td>
                      <span className={styles.rankItem}>
                        <span
                          className={styles.rankDot}
                          style={isSelected ? { background: corDia(m.dow), border: 'none' } : undefined}
                        />
                        {m.nome}{melhor?.dow === m.dow ? ' ★' : ''}
                      </span>
                    </td>
                    <td className={styles.num}>{m.dias}</td>
                    <td className={styles.num}>{m.qtd == null ? '—' : formatNumber(m.qtd, 1)}</td>
                    <td className={styles.num}>{m.valor == null ? '—' : formatCurrency(m.valor, 0)}</td>
                    <td className={styles.num}>{m.ticket == null ? '—' : formatCurrency(m.ticket, 2)}</td>
                    <td className={`${styles.num} ${styles.rankPct}`}>
                      {vsMes == null ? '—' : formatPercent(vsMes, 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className={gStyles.panel}>
        <div className={gStyles.panelHeader}>
          <h3 className={gStyles.panelTitle}>
            Evolução mês a mês <span className={gStyles.panelHint}>· média de {metricaLabel}</span>
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={gStyles.panelHint}>{meses.length} meses</span>
            <ChartTypeMenu options={SERIES_CHART_OPTIONS} value={evoType} onChange={setEvoType} />
          </div>
        </div>

        <div className={gStyles.chartBox}>
          <SeriesFlexChart
            type={evoType}
            data={evolucao}
            xKey="mes"
            connectNulls
            xInterval={Math.max(0, Math.ceil(evolucao.length / 12) - 1)}
            yTickFormatter={ehQtd ? formatNumber : formatCompactCurrency}
            yWidth={ehQtd ? undefined : 62}
            tooltip={(
              <Tooltip
                content={(props) => (
                  <CheckpointTooltip
                    {...props}
                    byMes={checkpointsByMes}
                    formatValue={formatMetrica}
                    resolveAnoMes={(_, item) => item.payload?.ano_mes ?? null}
                  />
                )}
              />
            )}
            series={DIAS_SEMANA.filter((s) => selected.has(s.dow)).map((s) => ({
              key: `d${s.dow}`,
              name: s.nome,
              color: corDia(s.dow),
              strokeWidth: 2,
              dot: makeCheckpointDot({
                byMes: checkpointsByMes,
                baseColor: corDia(s.dow),
                resolve: (payload) => payload.ano_mes ?? null,
              }),
            }))}
          />
        </div>

        <div className={gStyles.legend}>
          <button type="button" className={gStyles.legendBtn} onClick={toggleAll}>
            {allSelected ? 'Nenhum' : 'Todos'}
          </button>
          {DIAS_SEMANA.map((s) => {
            const isSelected = selected.has(s.dow);
            return (
              <button
                key={s.dow}
                type="button"
                className={`${gStyles.legendBtn} ${!isSelected ? gStyles.legendBtnOff : ''}`}
                onClick={() => toggleDia(s.dow)}
              >
                <span
                  className={gStyles.legendDot}
                  style={{ background: isSelected ? corDia(s.dow) : 'var(--text-muted)' }}
                />
                {s.nome}
              </button>
            );
          })}
        </div>
      </div>

      <div className={gStyles.panel}>
        <div className={gStyles.panelHeader}>
          <h3 className={gStyles.panelTitle}>
            Semana do mês <span className={gStyles.panelHint}>· média de {metricaLabel}</span>
          </h3>
          <ChartTypeMenu options={DISTRIB_CHART_OPTIONS} value={mixType} onChange={setMixType} />
        </div>
        <div className={gStyles.chartBox} style={{ height: 256 }}>
          <DistribFlexChart
            type={mixType}
            data={medias.filter((m) => m[metrica] != null).map((m) => ({
              name: m.curto,
              value: Number(m[metrica].toFixed(2)),
              fill: corDia(m.dow),
            }))}
            tooltip={(
              <Tooltip
                contentStyle={{
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 8, fontSize: 12,
                }}
                formatter={(v, name) => [formatMetrica(v), name]}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}
