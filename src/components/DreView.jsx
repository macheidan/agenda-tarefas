import { Fragment, useMemo, useState } from 'react';
import { useMarcaMes } from '../hooks/useMarcaMes';
import { useFechamentos } from '../hooks/useFechamentos';
import { useDreDetalhes } from '../hooks/useDreDetalhes';
import MarcaMesPicker from './gestao/MarcaMesPicker';
import SyncSheetButton from './gestao/SyncSheetButton';
import { KpiCard } from './gestao/KpiCard';
import {
  CONTAS_COM_DETALHE, compactBR, formatCurrency, formatPercent, marcaInfo,
  dreSyncConfigured, syncDreFromSheet,
} from '../lib/gestao';
import styles from '../styles/DreView.module.css';

// DRE anual (Gestão): 18 contas × 12 meses + Total, valores compactos com o
// % sobre faturamento embaixo. Clicar numa conta expansível abre as sub-linhas
// por favorecido (dre_detalhes, carregado só no primeiro clique).
const LINHAS = [
  { key: 'faturamento', label: '(=) Faturamento', tipo: 'soma' },
  { key: 'tributos', label: '(-) Tributos', tipo: 'menos', indent: true },
  { key: 'vendas_liquidas', label: '(=) Vendas Líquidas', tipo: 'soma' },
  { key: 'insumos', label: '(-) Insumos', tipo: 'menos', indent: true },
  { key: 'bebidas', label: '(-) Bebidas', tipo: 'menos', indent: true },
  { key: 'comissoes', label: '(-) Comissões', tipo: 'menos', indent: true },
  { key: 'taxas_cartao', label: '(-) Taxas cartão', tipo: 'menos', indent: true },
  { key: 'motoboy', label: '(-) Motoboy', tipo: 'menos', indent: true },
  { key: 'margem_contribuicao', label: '(=) Margem Contribuição', tipo: 'soma' },
  { key: 'despesas_adm', label: '(-) Desp. Administrativas', tipo: 'menos', indent: true },
  { key: 'despesas_marketing', label: '(-) Desp. Marketing', tipo: 'menos', indent: true },
  { key: 'despesas_pessoal', label: '(-) Desp. Pessoal', tipo: 'menos', indent: true },
  { key: 'resultado_operacional', label: '(=) Resultado Operacional', tipo: 'soma' },
  { key: 'resultado_op_liquido', label: '(=) Result. Op. Líquido', tipo: 'soma' },
  // Linhas 21 e 22 da planilha: depósito no CPF do sócio × o resto (cartão,
  // Flash, pró-labore, terceiros). O KPI "Lucro médio" soma as duas.
  { key: 'distribuicao_lucros', label: '(-) Distribuição de Lucros (Depósito)', tipo: 'menos', indent: true },
  { key: 'distribuicao_lucros_fora', label: '(-) Distribuição de Lucros (Fora)', tipo: 'menos', indent: true },
  { key: 'divisao_socios', label: '(-) Divisão Sócio Investidores', tipo: 'menos', indent: true },
  { key: 'resultado_final', label: '(=) Resultado Final', tipo: 'soma' },
];

// Lucro distribuído no mês = linha 21 (Depósito) + linha 22 (Fora). Anos
// anteriores a 2026 só têm a 21; mês sem nenhuma das duas fica fora da média.
function lucroDistribuido(f) {
  const a = f.distribuicao_lucros;
  const b = f.distribuicao_lucros_fora;
  if (typeof a !== 'number' && typeof b !== 'number') return null;
  return (typeof a === 'number' ? a : 0) + (typeof b === 'number' ? b : 0);
}

const MES_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default function DreView() {
  const { marca, setMarca, anoMes, setAnoMes } = useMarcaMes();
  const info = marcaInfo(marca);
  const { fechamentos, loading } = useFechamentos(marca);

  const [expanded, setExpanded] = useState(new Set());
  const [detalheOn, setDetalheOn] = useState(false);
  const { detalhes, loading: loadingDetalhes } = useDreDetalhes(marca, detalheOn);

  const toggleLinha = (key) => {
    if (!CONTAS_COM_DETALHE.has(key)) return;
    setDetalheOn(true);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const anoAtivo = parseInt(anoMes.split('-')[0], 10);
  const janela = useMemo(
    () => MES_LABELS.map((_, i) => `${anoAtivo}-${String(i + 1).padStart(2, '0')}`),
    [anoAtivo]
  );

  const fechMap = useMemo(() => {
    const m = new Map();
    for (const f of fechamentos) m.set(f.ano_mes, f);
    return m;
  }, [fechamentos]);

  const anosDisponiveis = useMemo(() => {
    const set = new Set();
    for (const f of fechamentos) set.add(parseInt(f.ano_mes.split('-')[0], 10));
    return [...set].sort((a, b) => a - b);
  }, [fechamentos]);

  // conta -> sub-linhas (favorecidos × meses do ano ativo); consolidado soma as marcas
  const subRowsPorConta = useMemo(() => {
    const out = new Map();
    const prefixo = `${anoAtivo}-`;
    const porConta = new Map();
    for (const det of detalhes) {
      if (!det.ano_mes.startsWith(prefixo)) continue;
      for (const [conta, itens] of Object.entries(det.itens ?? {})) {
        let favs = porConta.get(conta);
        if (!favs) { favs = new Map(); porConta.set(conta, favs); }
        for (const it of itens) {
          let row = favs.get(it.n);
          if (!row) { row = { nome: it.n, porMes: {}, total: 0 }; favs.set(it.n, row); }
          row.porMes[det.ano_mes] = (row.porMes[det.ano_mes] ?? 0) + it.v;
          row.total += it.v;
        }
      }
    }
    for (const [conta, favs] of porConta.entries()) {
      out.set(conta, [...favs.values()].sort((a, b) => b.total - a.total));
    }
    return out;
  }, [detalhes, anoAtivo]);

  // KPIs do ano: médias de faturamento e lucro, comparadas com o MESMO período
  // (mesmos meses preenchidos) do ano anterior.
  const kpis = useMemo(() => {
    const preenchidos = janela
      .map((m) => fechMap.get(m))
      .filter((f) => !!f && f.faturamento > 0);
    if (preenchidos.length === 0) return null;

    const mediaFrom = (rows, pick) => {
      const vals = rows.map(pick).filter((v) => typeof v === 'number');
      if (vals.length === 0) return null;
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };

    const mediaFat = mediaFrom(preenchidos, (f) => f.faturamento) ?? 0;
    const mediaLucro = mediaFrom(preenchidos, lucroDistribuido);
    const margemMedia = mediaLucro !== null && mediaFat > 0 ? (mediaLucro / mediaFat) * 100 : null;

    const mesesPreenchidos = preenchidos.map((f) => parseInt(f.ano_mes.split('-')[1], 10));
    const anoAnterior = anoAtivo - 1;
    const referencia = mesesPreenchidos
      .map((m) => fechMap.get(`${anoAnterior}-${String(m).padStart(2, '0')}`))
      .filter((f) => !!f && f.faturamento > 0);

    const refMediaFat = referencia.length > 0 ? mediaFrom(referencia, (f) => f.faturamento) : null;
    const refMediaLucro = referencia.length > 0 ? mediaFrom(referencia, lucroDistribuido) : null;

    const deltaFat = refMediaFat !== null && refMediaFat > 0 ? (mediaFat - refMediaFat) / refMediaFat : null;
    const deltaLucro = refMediaLucro !== null && refMediaLucro !== 0 && mediaLucro !== null
      ? (mediaLucro - refMediaLucro) / Math.abs(refMediaLucro)
      : null;

    return {
      mesesContados: preenchidos.length, mediaFat, mediaLucro, margemMedia,
      anoAnterior, refMesesContados: referencia.length, refMediaFat, refMediaLucro,
      deltaFat, deltaLucro,
    };
  }, [janela, fechMap, anoAtivo]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>DRE</h2>
        <div className={styles.headerActions}>
          {dreSyncConfigured && (
            <SyncSheetButton
              onSync={syncDreFromSheet}
              title="Puxa os dados da planilha DRE agora (ela também sincroniza sozinha ~1 min após cada edição)"
            />
          )}
          <div className={styles.anoBtns}>
            {anosDisponiveis.map((y) => (
              <button
                key={y}
                type="button"
                className={`${styles.anoBtn} ${y === anoAtivo ? styles.anoBtnActive : ''}`}
                onClick={() => setAnoMes(`${y}-${anoMes.split('-')[1]}`)}
              >
                {y}
              </button>
            ))}
          </div>
          <MarcaMesPicker marca={marca} setMarca={setMarca} anoMes={anoMes} setAnoMes={setAnoMes} showMes={false} />
        </div>
      </div>
      <p className={styles.subtitle}>
        <span className={styles.subtitleMarca} style={{ color: info.cor }}>{info.nome}</span>
        {' '}· ano {anoAtivo}
        {kpis && ` (${kpis.mesesContados} meses)`}
      </p>

      {loading ? (
        <div className={styles.loading}>Carregando…</div>
      ) : (
        <>
          {kpis && (
            <div className={styles.kpis}>
              <DreKpi
                label="Faturamento médio mensal"
                value={formatCurrency(kpis.mediaFat, 0)}
                sub={`Total ano: ${formatCurrency(kpis.mediaFat * kpis.mesesContados, 0)}`}
                yoyDelta={kpis.deltaFat}
                yoyValue={kpis.refMediaFat}
                yoyAno={kpis.anoAnterior}
                yoyMeses={kpis.refMesesContados}
                cor={info.cor}
              />
              <DreKpi
                label="Lucro médio mensal"
                value={kpis.mediaLucro !== null ? formatCurrency(kpis.mediaLucro, 0) : '—'}
                sub={kpis.margemMedia !== null
                  ? `Margem média: ${formatPercent(kpis.margemMedia, 1)}`
                  : 'sem dados de Distribuição de Lucros'}
                yoyDelta={kpis.deltaLucro}
                yoyValue={kpis.refMediaLucro}
                yoyAno={kpis.anoAnterior}
                yoyMeses={kpis.refMesesContados}
                cor={info.cor}
                negative={kpis.mediaLucro !== null && kpis.mediaLucro < 0}
              />
            </div>
          )}

          {fechamentos.length === 0 ? (
            <div className={styles.loading}>
              Sem dados de DRE ainda. Sincronize a planilha DRE pra começar.
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <colgroup>
                  <col className={styles.colConta} />
                  {janela.map((m) => <col key={m} />)}
                  <col className={styles.colTotal} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={styles.thConta}>Conta</th>
                    {janela.map((m, i) => (
                      <th key={m} className={m === anoMes ? styles.thAtivo : ''}>{MES_LABELS[i]}</th>
                    ))}
                    <th className={styles.thTotal}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {LINHAS.map((linha) => {
                    const expandable = CONTAS_COM_DETALHE.has(linha.key);
                    const isOpen = expanded.has(linha.key);
                    const subRows = subRowsPorConta.get(linha.key) ?? [];
                    return (
                      <Fragment key={linha.key}>
                        <LinhaDre
                          linha={linha}
                          janela={janela}
                          fechMap={fechMap}
                          anoMesAtivo={anoMes}
                          expandable={expandable}
                          expanded={isOpen}
                          onToggle={() => toggleLinha(linha.key)}
                        />
                        {isOpen && loadingDetalhes && (
                          <tr><td colSpan={janela.length + 2} className={styles.aviso}>carregando extratos…</td></tr>
                        )}
                        {isOpen && !loadingDetalhes && subRows.length === 0 && (
                          <tr>
                            <td colSpan={janela.length + 2} className={styles.aviso}>
                              Sem lançamentos de extrato pra esta conta em {anoAtivo}.
                            </td>
                          </tr>
                        )}
                        {isOpen && !loadingDetalhes && subRows.map((sub) => (
                          <SubLinhaDre key={sub.nome} sub={sub} janela={janela} anoMesAtivo={anoMes} />
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DreKpi({ label, value, sub, yoyDelta, yoyValue, yoyAno, yoyMeses, cor, negative }) {
  const temYoy = yoyDelta !== null && yoyDelta !== undefined && yoyValue !== null && yoyValue !== undefined;
  return (
    <KpiCard
      icon={(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 2h16v20l-2-1.5L16 22l-2-1.5L12 22l-2-1.5L8 22l-2-1.5L4 22V2z" /><path d="M8 7h8M8 11h8M8 15h5" />
        </svg>
      )}
      iconColor={cor}
      label={label}
      value={value}
      negative={negative}
      footer={(
        <>
          {sub && <div className={styles.kpiSub}>{sub}</div>}
          {temYoy ? (
            <div className={styles.kpiYoy}>
              <span style={{ color: yoyDelta >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                {yoyDelta >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(yoyDelta) * 100, 1)}
              </span>
              <span>
                vs {formatCurrency(yoyValue, 0)} (mesmo período {yoyAno}{yoyMeses ? ` · ${yoyMeses}m` : ''})
              </span>
            </div>
          ) : (
            yoyAno !== undefined && <div className={styles.kpiYoy}>Sem dados em {yoyAno} pra comparar</div>
          )}
        </>
      )}
    />
  );
}

function LinhaDre({ linha, janela, fechMap, anoMesAtivo, expandable, expanded, onToggle }) {
  const isSoma = linha.tipo === 'soma';

  let totalValor = 0;
  let totalFat = 0;
  let count = 0;
  for (const m of janela) {
    const f = fechMap.get(m);
    if (!f) continue;
    const v = f[linha.key];
    if (typeof v === 'number') { totalValor += v; count++; }
    if (typeof f.faturamento === 'number') totalFat += f.faturamento;
  }
  const totalPct = totalFat > 0 ? (totalValor / totalFat) * 100 : null;

  return (
    <tr
      className={`${styles.linha} ${isSoma ? styles.linhaSoma : ''} ${expandable ? styles.linhaExpandable : ''}`}
      onClick={expandable ? onToggle : undefined}
    >
      <td
        className={`${styles.tdConta} ${linha.indent ? styles.tdContaIndent : ''}`}
        title={expandable ? `${linha.label} — clique pra ver os lançamentos` : linha.label}
      >
        {expandable && (
          <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}>›</span>
        )}
        {linha.label}
      </td>
      {janela.map((m) => {
        const f = fechMap.get(m);
        const valor = f ? f[linha.key] : undefined;
        const fat = f?.faturamento;
        const pct = typeof valor === 'number' && fat && fat > 0 ? (valor / fat) * 100 : null;
        const isNeg = typeof valor === 'number' && valor < 0 && isSoma;
        return (
          <td key={m} className={m === anoMesAtivo ? styles.tdMesAtivo : ''}>
            {typeof valor === 'number' ? (
              <span className={styles.celValor}>
                <span className={isNeg ? styles.celNeg : ''}>{compactBR(valor)}</span>
                {pct !== null && <span className={styles.celPct}>{formatPercent(pct, 0)}</span>}
              </span>
            ) : (
              <span className={styles.celPct}>—</span>
            )}
          </td>
        );
      })}
      <td className={styles.tdTotal}>
        {count > 0 ? (
          <span className={styles.celValor}>
            <span className={totalValor < 0 && isSoma ? styles.celNeg : ''}>{compactBR(totalValor)}</span>
            {totalPct !== null && <span className={styles.celPct}>{formatPercent(totalPct, 0)}</span>}
          </span>
        ) : (
          <span className={styles.celPct}>—</span>
        )}
      </td>
    </tr>
  );
}

/** Sub-linha do detalhe: um favorecido do extrato, valores por mês. */
function SubLinhaDre({ sub, janela, anoMesAtivo }) {
  return (
    <tr className={styles.subLinha}>
      <td className={styles.subNome} title={sub.nome}>{sub.nome}</td>
      {janela.map((m) => {
        const v = sub.porMes[m];
        return (
          <td key={m} className={m === anoMesAtivo ? styles.tdMesAtivo : ''}>
            {typeof v === 'number' ? compactBR(v) : ''}
          </td>
        );
      })}
      <td className={styles.tdTotal}>{compactBR(sub.total)}</td>
    </tr>
  );
}
