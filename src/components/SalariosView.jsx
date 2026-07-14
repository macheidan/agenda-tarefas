import { useState, useMemo, Fragment } from 'react';
import { useAuth } from '../contexts/AuthContext';
import MoneyInput from './MoneyInput';
import { formatBRL } from '../utils/money';
import { transporteDetalhe } from '../utils/transporte';
import styles from '../styles/SalariosView.module.css';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const ALL_STORES = '__all__';
const VALE_DIA = 12; // R$ por dia de transporte (base do Flash/vale-alimentação).
const LINES = [['dia5', 'Dia 5'], ['dia20', 'Dia 20'], ['extra', 'Extra']];
// Campos editáveis (viram LINHAS na tabela transposta do mês).
const FIELDS = [
  ['salario', 'Salário'],
  ['transporte', 'Transporte'],
  ['feriado', 'Feriado'],
  ['entrada', 'Entrada'],
  ['adianta', 'Adianta'],
  ['empres', 'Empréstimo'],
  ['banco', 'Banco'],
  ['flash', 'Flash'],
  ['liquidoFolha', 'Líq. folha'],
];

// Cores espelhando o bg/fonte das planilhas: canal de pagamento (fundo) e
// natureza entra/sai (fonte). Banco=pêssego, Flash=rosa, Dinheiro=verde.
const ROW_BG = { banco: 'chBanco', flash: 'chFlash' };
// Entrada = entra (azul); Adianta/Empréstimo = sai (vermelho).
const ROW_FONT = { entrada: 'fontIn', adianta: 'fontOut', empres: 'fontOut' };

// Ícone "copiar" (feather copy), herda a cor via currentColor.
const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const num = (l, f) => Number(l?.[f]) || 0;
// Σ(B:G) = valor devido ao funcionário na linha.
const somaBG = (l) =>
  num(l, 'salario') + num(l, 'transporte') + num(l, 'feriado') +
  num(l, 'entrada') + num(l, 'adianta') + num(l, 'empres');
// Dinheiro (H) = Σ(B:G) − (Banco + Flash). Total (K) = Banco + Flash + Dinheiro.
const dinheiroDe = (l) => somaBG(l) - (num(l, 'banco') + num(l, 'flash'));
const totalDe = (l) => num(l, 'banco') + num(l, 'flash') + dinheiroDe(l);

export default function SalariosView({ visibleStores, storeMeta, employees, absences, salarios, setSalario, updateEmployee, isAdmin }) {
  const { user } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedStore, setSelectedStore] = useState(visibleStores[0]?.id || ALL_STORES);
  const [selectedEmpId, setSelectedEmpId] = useState(null);
  const [view, setView] = useState('func'); // 'func' (por funcionário) | 'resumo' (mensal por equipe)
  const [copied, setCopied] = useState(false);
  const [copiedCell, setCopiedCell] = useState(null);

  const activeStore = visibleStores.some((s) => s.id === selectedStore) || selectedStore === ALL_STORES
    ? selectedStore
    : visibleStores[0]?.id || ALL_STORES;
  const isAmbas = activeStore === ALL_STORES;
  const relevantSet = useMemo(
    () => new Set(isAmbas ? visibleStores.map((s) => s.id) : [activeStore]),
    [isAmbas, visibleStores, activeStore]
  );

  const list = useMemo(
    () =>
      employees
        .filter((e) => relevantSet.has(e.store) && e.active !== false)
        .sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase())),
    [employees, relevantSet]
  );

  // Funcionário em foco (default: primeiro da loja). Se o selecionado sai da
  // lista (troca de loja), cai no primeiro.
  const emp = list.find((e) => e.id === selectedEmpId) || list[0] || null;

  // Docs de salário do funcionário no ano exibido, indexados por mês.
  const docsByMonth = useMemo(() => {
    const m = {};
    if (!emp) return m;
    for (const s of salarios) {
      if (s.employeeId === emp.id && s.year === year) m[s.month] = s;
    }
    return m;
  }, [salarios, emp, year]);
  const doc = docsByMonth[month];

  const dias = emp ? transporteDetalhe(emp, absences, year, month).dias : 0;
  const flashEsperado = dias * VALE_DIA;
  const mode = emp?.salaryMode === 'fora' ? 'fora' : 'folha';

  // Histórico do ano: total pago e "por fora" por mês (visão de todos pagamentos).
  const anual = useMemo(
    () =>
      MONTHS.map((_, m) => {
        const d = docsByMonth[m];
        let pago = 0, fora = 0;
        for (const [line] of LINES) {
          const l = d?.[line];
          if (!l) continue;
          pago += totalDe(l);
          fora += dinheiroDe(l);
        }
        return { m, pago, fora };
      }),
    [docsByMonth]
  );
  const anoTotais = anual.reduce((t, a) => ({ pago: t.pago + a.pago, fora: t.fora + a.fora }), { pago: 0, fora: 0 });

  // ---- Resumo mensal por equipe ----
  // Foco: quanto depositar no BANCO de cada funcionário no dia 5 e no dia 20.
  // Agrupa por loja (equipe), com subtotais e total geral. Só lê o campo `banco`
  // de cada linha (dia5/dia20/extra) do doc de salário do mês selecionado.
  const resumo = useMemo(() => {
    const docByEmp = {};
    for (const s of salarios) {
      if (s.year === year && s.month === month) docByEmp[s.employeeId] = s;
    }
    const storeIds = isAmbas ? visibleStores.map((s) => s.id) : [activeStore];
    const zero = { dia5: 0, dia20: 0, extra: 0, flash5: 0, flash20: 0, total: 0 };
    const groups = [];
    for (const sid of storeIds) {
      const emps = employees
        .filter((e) => e.store === sid && e.active !== false)
        .sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()));
      if (!emps.length) continue;
      const rows = emps.map((e) => {
        const d = docByEmp[e.id];
        const dia5 = num(d?.dia5, 'banco');
        const dia20 = num(d?.dia20, 'banco');
        const extra = num(d?.extra, 'banco');
        const flash5 = num(d?.dia5, 'flash');
        const flash20 = num(d?.dia20, 'flash');
        return { id: e.id, name: e.name, dia5, dia20, extra, flash5, flash20, total: dia5 + dia20 + extra };
      });
      const subtotal = rows.reduce(
        (t, r) => ({
          dia5: t.dia5 + r.dia5, dia20: t.dia20 + r.dia20, extra: t.extra + r.extra,
          flash5: t.flash5 + r.flash5, flash20: t.flash20 + r.flash20, total: t.total + r.total,
        }),
        { ...zero }
      );
      groups.push({ storeId: sid, storeName: storeMeta[sid]?.name || '', rows, subtotal });
    }
    return groups;
  }, [salarios, employees, year, month, isAmbas, visibleStores, activeStore, storeMeta]);

  const hasExtra = resumo.some((g) => g.subtotal.extra !== 0);
  const grandTotal = resumo.reduce(
    (t, g) => ({
      dia5: t.dia5 + g.subtotal.dia5, dia20: t.dia20 + g.subtotal.dia20, extra: t.extra + g.subtotal.extra,
      flash5: t.flash5 + g.subtotal.flash5, flash20: t.flash20 + g.subtotal.flash20, total: t.total + g.subtotal.total,
    }),
    { dia5: 0, dia20: 0, extra: 0, flash5: 0, flash20: 0, total: 0 }
  );

  // Copia um valor único (formato colável em banco: "1234,56", sem R$ nem milhar).
  const copyValue = (key, n) => {
    const text = (Number(n) || 0).toFixed(2).replace('.', ',');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => { setCopiedCell(key); setTimeout(() => setCopiedCell((k) => (k === key ? null : k)), 1200); },
        () => {}
      );
    }
  };

  const copyResumo = () => {
    const lines = [`Depósitos ${MONTHS[month]} ${year}`];
    for (const g of resumo) {
      lines.push('', `*${g.storeName}*`);
      for (const r of g.rows) {
        if (!r.total) continue;
        const parts = [];
        if (r.dia5) parts.push(`dia 5: ${formatBRL(r.dia5)}`);
        if (r.dia20) parts.push(`dia 20: ${formatBRL(r.dia20)}`);
        if (r.extra) parts.push(`extra: ${formatBRL(r.extra)}`);
        lines.push(`${r.name} — ${parts.join(' · ')}`);
      }
      lines.push(`_Total ${g.storeName}: dia 5 ${formatBRL(g.subtotal.dia5)} · dia 20 ${formatBRL(g.subtotal.dia20)}_`);
    }
    const text = lines.join('\n');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
        () => {}
      );
    }
  };

  const commit = (line, field, value) => {
    if (!isAdmin || !emp) return;
    const existing = doc?.[line] || {};
    setSalario(emp.id, emp.store, year, month, line, { ...existing, [field]: value }, user);
  };
  // Observações do mês (campo livre no doc dpSalarios, fora das linhas dia5/dia20/extra).
  const commitObs = (value) => {
    if (!isAdmin || !emp) return;
    if ((doc?.obs || '') === value) return;
    setSalario(emp.id, emp.store, year, month, 'obs', value, user);
  };
  const setProfile = (field, value) => {
    if (!isAdmin || !emp) return;
    updateEmployee(emp.id, { [field]: value });
  };

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const pickStore = (id) => { setSelectedStore(id); setSelectedEmpId(null); };

  return (
    <div className={styles.container}>
      {/* Barra: lojas + dropdown de funcionário */}
      <div className={styles.pickerBar}>
        {visibleStores.length > 1 && (
          <div className={styles.storeTabs}>
            {visibleStores.map((s) => (
              <button
                key={s.id}
                className={`${styles.storeTab} ${s.id === activeStore ? styles.storeTabActive : ''}`}
                onClick={() => pickStore(s.id)}
              >
                {s.name}
              </button>
            ))}
            <button
              className={`${styles.storeTab} ${isAmbas ? styles.storeTabActive : ''}`}
              onClick={() => pickStore(ALL_STORES)}
            >
              Ambas
            </button>
          </div>
        )}
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${view === 'func' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('func')}
          >
            Por funcionário
          </button>
          <button
            className={`${styles.viewBtn} ${view === 'resumo' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('resumo')}
          >
            Resumo mensal
          </button>
        </div>
        {view === 'func' && (
          <select
            className={styles.empSelect}
            value={emp?.id || ''}
            onChange={(e) => setSelectedEmpId(e.target.value)}
          >
            {list.length === 0 && <option value="">Nenhum funcionário</option>}
            {list.map((e) => (
              <option key={e.id} value={e.id}>
                {isAmbas && storeMeta[e.store] ? `${storeMeta[e.store].name} — ${e.name}` : e.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {view === 'resumo' ? (
        <div className={styles.resumo}>
          <div className={styles.resumoBar}>
            <div className={styles.monthNav}>
              <button className={styles.navBtn} onClick={prevMonth} aria-label="Mês anterior">‹</button>
              <span className={styles.monthLabel}>{MONTHS[month]} {year}</span>
              <button className={styles.navBtn} onClick={nextMonth} aria-label="Próximo mês">›</button>
            </div>
            <button className={styles.applyBtn} onClick={copyResumo}>
              {copied ? 'Copiado!' : 'Copiar lista'}
            </button>
          </div>
          <p className={styles.resumoNote}>
            Valor a <strong>depositar no banco</strong> de cada funcionário — dia 5 e dia 20.
          </p>
          {resumo.length === 0 ? (
            <p className={styles.empty}>Nenhum funcionário para exibir.</p>
          ) : (
            <div className={styles.resumoWrap}>
              <table className={styles.resumoTable}>
                <thead>
                  <tr>
                    <th className={styles.resumoNameCol}>Funcionário</th>
                    <th>Banco 5</th>
                    <th>Banco 20</th>
                    <th>Flash 5</th>
                    <th>Flash 20</th>
                    {hasExtra && <th>Extra</th>}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.map((g) => (
                    <Fragment key={g.storeId}>
                      {isAmbas && (
                        <tr className={styles.resumoStoreRow}>
                          <td colSpan={hasExtra ? 7 : 6}>
                            <span className={styles.storeTag} style={{ background: storeMeta[g.storeId]?.color || 'var(--text-secondary)' }}>
                              {(g.storeName || '?').slice(0, 1)}
                            </span>
                            {g.storeName}
                          </td>
                        </tr>
                      )}
                      {g.rows.map((r) => (
                        <tr key={r.id}>
                          <td className={styles.resumoNameCol}>{r.name}</td>
                          <td className={styles.chBancoCell}>
                            {r.dia5 ? (
                              <span className={styles.copyCell}>
                                <span>{formatBRL(r.dia5)}</span>
                                <button
                                  className={styles.copyBtn}
                                  title="Copiar valor"
                                  onClick={() => copyValue(`${r.id}_b5`, r.dia5)}
                                >
                                  {copiedCell === `${r.id}_b5` ? '✓' : <CopyIcon />}
                                </button>
                              </span>
                            ) : '—'}
                          </td>
                          <td className={styles.chBancoCell}>
                            {r.dia20 ? (
                              <span className={styles.copyCell}>
                                <span>{formatBRL(r.dia20)}</span>
                                <button
                                  className={styles.copyBtn}
                                  title="Copiar valor"
                                  onClick={() => copyValue(`${r.id}_b20`, r.dia20)}
                                >
                                  {copiedCell === `${r.id}_b20` ? '✓' : <CopyIcon />}
                                </button>
                              </span>
                            ) : '—'}
                          </td>
                          <td className={styles.chFlashCell}>
                            {r.flash5 ? (
                              <span className={styles.copyCell}>
                                <span>{formatBRL(r.flash5)}</span>
                                <button
                                  className={styles.copyBtn}
                                  title="Copiar valor"
                                  onClick={() => copyValue(`${r.id}_f5`, r.flash5)}
                                >
                                  {copiedCell === `${r.id}_f5` ? '✓' : <CopyIcon />}
                                </button>
                              </span>
                            ) : '—'}
                          </td>
                          <td className={styles.chFlashCell}>
                            {r.flash20 ? (
                              <span className={styles.copyCell}>
                                <span>{formatBRL(r.flash20)}</span>
                                <button
                                  className={styles.copyBtn}
                                  title="Copiar valor"
                                  onClick={() => copyValue(`${r.id}_f20`, r.flash20)}
                                >
                                  {copiedCell === `${r.id}_f20` ? '✓' : <CopyIcon />}
                                </button>
                              </span>
                            ) : '—'}
                          </td>
                          {hasExtra && <td className={styles.chBancoCell}>{r.extra ? formatBRL(r.extra) : '—'}</td>}
                          <td className={styles.resumoRowTotal}>{r.total ? formatBRL(r.total) : '—'}</td>
                        </tr>
                      ))}
                      <tr className={styles.resumoSubtotal}>
                        <td className={styles.resumoNameCol}>Total {g.storeName}</td>
                        <td>{formatBRL(g.subtotal.dia5) || 'R$ 0,00'}</td>
                        <td>{formatBRL(g.subtotal.dia20) || 'R$ 0,00'}</td>
                        <td>{formatBRL(g.subtotal.flash5) || 'R$ 0,00'}</td>
                        <td>{formatBRL(g.subtotal.flash20) || 'R$ 0,00'}</td>
                        {hasExtra && <td>{formatBRL(g.subtotal.extra) || 'R$ 0,00'}</td>}
                        <td>{formatBRL(g.subtotal.total) || 'R$ 0,00'}</td>
                      </tr>
                    </Fragment>
                  ))}
                  {isAmbas && resumo.length > 1 && (
                    <tr className={styles.resumoGrand}>
                      <td className={styles.resumoNameCol}>Total geral</td>
                      <td>{formatBRL(grandTotal.dia5) || 'R$ 0,00'}</td>
                      <td>{formatBRL(grandTotal.dia20) || 'R$ 0,00'}</td>
                      <td>{formatBRL(grandTotal.flash5) || 'R$ 0,00'}</td>
                      <td>{formatBRL(grandTotal.flash20) || 'R$ 0,00'}</td>
                      {hasExtra && <td>{formatBRL(grandTotal.extra) || 'R$ 0,00'}</td>}
                      <td>{formatBRL(grandTotal.total) || 'R$ 0,00'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : !emp ? (
        <p className={styles.empty}>Nenhum funcionário. Cadastre na aba <strong>Escala</strong>.</p>
      ) : (
        <>
          {/* Cabeçalho do funcionário */}
          <div className={styles.empHeader}>
            <span className={styles.empName}>
              {isAmbas && (
                <span className={styles.storeTag} style={{ background: storeMeta[emp.store]?.color || 'var(--text-secondary)' }}>
                  {(storeMeta[emp.store]?.name || '?').slice(0, 1)}
                </span>
              )}
              {emp.name}
            </span>
            <span className={styles.yearTotals}>
              Ano {year}: pago <strong>{formatBRL(anoTotais.pago) || 'R$ 0,00'}</strong>
              {anoTotais.fora !== 0 && <> · por fora <strong className={styles.risk}>{formatBRL(anoTotais.fora)}</strong></>}
            </span>
          </div>

          {/* Cadastro (fusão da antiga aba Funcionários) */}
          <div className={styles.cadastro}>
            <span className={styles.cadastroTitle}>Cadastro</span>
            <div className={styles.cadastroFields}>
              <label className={styles.field}>
                <span>Recebe</span>
                {isAdmin ? (
                  <select className={styles.modeSelect} value={mode} onChange={(e) => setProfile('salaryMode', e.target.value)}>
                    <option value="folha">Tudo na folha</option>
                    <option value="fora">Parte por fora</option>
                  </select>
                ) : <span className={styles.ro}>{mode === 'fora' ? 'Parte por fora' : 'Tudo na folha'}</span>}
              </label>
              <label className={styles.field}>
                <span>Salário base</span>
                {isAdmin ? (
                  <MoneyInput className={styles.moneyInput} value={emp.salaryBase} disabled={mode === 'folha'} placeholder={mode === 'folha' ? 'folha' : '—'} onCommit={(v) => setProfile('salaryBase', v)} />
                ) : <span className={styles.ro}>{mode === 'folha' ? 'folha' : formatBRL(emp.salaryBase)}</span>}
              </label>
              <label className={styles.field}>
                <span>Transporte (mês)</span>
                {isAdmin ? <MoneyInput className={styles.moneyInput} value={emp.transporteRef} onCommit={(v) => setProfile('transporteRef', v)} /> : <span className={styles.ro}>{formatBRL(emp.transporteRef)}</span>}
              </label>
              <label className={styles.field}>
                <span>Feriado (unit.)</span>
                {isAdmin ? <MoneyInput className={styles.moneyInput} value={emp.feriadoUnit} onCommit={(v) => setProfile('feriadoUnit', v)} /> : <span className={styles.ro}>{formatBRL(emp.feriadoUnit)}</span>}
              </label>
              <label className={styles.field}>
                <span>Adiantamento</span>
                {isAdmin ? <MoneyInput className={styles.moneyInput} value={emp.adiantamento} onCommit={(v) => setProfile('adiantamento', v)} /> : <span className={styles.ro}>{formatBRL(emp.adiantamento)}</span>}
              </label>
            </div>
          </div>

          <div className={styles.body}>
            {/* Detalhe do mês (tabela transposta — sem rolagem horizontal) */}
            <div className={styles.detalhe}>
              <div className={styles.monthBar}>
                <div className={styles.monthNav}>
                  <button className={styles.navBtn} onClick={prevMonth} aria-label="Mês anterior">‹</button>
                  <span className={styles.monthLabel}>{MONTHS[month]} {year}</span>
                  <button className={styles.navBtn} onClick={nextMonth} aria-label="Próximo mês">›</button>
                </div>
                <span className={styles.transpInfo}>
                  Transporte: <strong>{dias}</strong> dias · Flash esperado <strong>{formatBRL(flashEsperado)}</strong>
                  {isAdmin && dias > 0 && num(doc?.dia5, 'flash') !== flashEsperado && (
                    <button className={styles.applyBtn} title="Preencher o Flash do Dia 5 com transporte × R$12" onClick={() => commit('dia5', 'flash', flashEsperado)}>usar</button>
                  )}
                </span>
              </div>

              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.rowHead}></th>
                    {LINES.map(([line, label]) => <th key={line}>{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map(([f, label]) => {
                    const bgCls = ROW_BG[f] ? styles[ROW_BG[f]] : '';
                    const fontCls = ROW_FONT[f] ? styles[ROW_FONT[f]] : '';
                    return (
                      <tr key={f}>
                        <td className={styles.rowHead}>{label}</td>
                        {LINES.map(([line]) => {
                          const l = doc?.[line] || {};
                          const v = num(l, f);
                          const bancoWarn = f === 'banco' && l.liquidoFolha != null && l.liquidoFolha !== '' && num(l, 'banco') !== Number(l.liquidoFolha);
                          const flashWarn = f === 'flash' && line === 'dia5' && dias > 0 && num(l, 'flash') !== flashEsperado;
                          const warn = bancoWarn || flashWarn;
                          return (
                            <td key={line} className={warn ? styles.warnCell : ''} title={
                              bancoWarn ? `Diverge do líquido da folha (${formatBRL(l.liquidoFolha)})`
                                : flashWarn ? `Esperado ${formatBRL(flashEsperado)} (transporte × R$12)` : ''
                            }>
                              <MoneyInput className={`${styles.moneyInput} ${bgCls} ${fontCls} ${v < 0 ? styles.neg : ''}`} value={l[f]} disabled={!isAdmin} onCommit={(nv) => commit(line, f, nv)} />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr className={styles.calcRow}>
                    <td className={styles.rowHead}>Dinheiro</td>
                    {LINES.map(([line]) => {
                      const d = dinheiroDe(doc?.[line] || {});
                      return <td key={line} className={`${styles.chDinheiro} ${d < 0 ? styles.neg : ''}`} title="Pago por fora">{formatBRL(d) || 'R$ 0,00'}</td>;
                    })}
                  </tr>
                  <tr className={styles.calcRow}>
                    <td className={styles.rowHead}>Total</td>
                    {LINES.map(([line]) => {
                      const t = totalDe(doc?.[line] || {});
                      return <td key={line} className={`${styles.chTotal} ${t < 0 ? styles.neg : ''}`}>{formatBRL(t) || 'R$ 0,00'}</td>;
                    })}
                  </tr>
                </tbody>
              </table>

              {/* Observações do mês (após a linha Total) */}
              <label className={styles.obsField}>
                <span className={styles.obsLabel}>Observações</span>
                {isAdmin ? (
                  <textarea
                    key={`${emp.id}_${year}_${month}`}
                    className={styles.obsInput}
                    rows={3}
                    defaultValue={doc?.obs || ''}
                    placeholder="Anotações sobre a folha deste mês…"
                    onBlur={(e) => commitObs(e.target.value)}
                  />
                ) : (
                  <p className={styles.obsRo}>{doc?.obs || '—'}</p>
                )}
              </label>
            </div>

            {/* Histórico do ano (todos os pagamentos) */}
            <div className={styles.historico}>
              <span className={styles.histTitle}>Pagamentos {year}</span>
              <table className={styles.histTable}>
                <thead>
                  <tr><th>Mês</th><th>Total pago</th><th>Por fora</th></tr>
                </thead>
                <tbody>
                  {anual.map((a) => (
                    <tr
                      key={a.m}
                      className={a.m === month ? styles.histActive : ''}
                      onClick={() => setMonth(a.m)}
                    >
                      <td className={styles.histMonth}>{MONTHS[a.m]}</td>
                      <td>{a.pago ? formatBRL(a.pago) : '—'}</td>
                      <td className={a.fora !== 0 ? styles.risk : ''}>{a.fora ? formatBRL(a.fora) : '—'}</td>
                    </tr>
                  ))}
                  <tr className={styles.histTotal}>
                    <td className={styles.histMonth}>Ano</td>
                    <td>{formatBRL(anoTotais.pago) || '—'}</td>
                    <td className={anoTotais.fora !== 0 ? styles.risk : ''}>{anoTotais.fora ? formatBRL(anoTotais.fora) : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
