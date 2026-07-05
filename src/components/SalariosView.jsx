import { useState, useMemo } from 'react';
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

  const commit = (line, field, value) => {
    if (!isAdmin || !emp) return;
    const existing = doc?.[line] || {};
    setSalario(emp.id, emp.store, year, month, line, { ...existing, [field]: value }, user);
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
            {visibleStores.map((s) => {
              const color = storeMeta[s.id]?.color || 'var(--accent)';
              const active = s.id === activeStore;
              return (
                <button
                  key={s.id}
                  className={styles.storeTab}
                  style={{ borderColor: color, background: active ? color : 'var(--card)', color: active ? '#fff' : color }}
                  onClick={() => pickStore(s.id)}
                >
                  {s.name}
                </button>
              );
            })}
            <button
              className={styles.storeTab}
              style={{
                borderColor: 'var(--text-secondary)',
                background: isAmbas ? 'var(--text-secondary)' : 'var(--card)',
                color: isAmbas ? '#fff' : 'var(--text-secondary)',
              }}
              onClick={() => pickStore(ALL_STORES)}
            >
              Ambas
            </button>
          </div>
        )}
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
      </div>

      {!emp ? (
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
                  {FIELDS.map(([f, label]) => (
                    <tr key={f}>
                      <td className={styles.rowHead}>{label}</td>
                      {LINES.map(([line]) => {
                        const l = doc?.[line] || {};
                        const bancoWarn = f === 'banco' && l.liquidoFolha != null && l.liquidoFolha !== '' && num(l, 'banco') !== Number(l.liquidoFolha);
                        const flashWarn = f === 'flash' && line === 'dia5' && dias > 0 && num(l, 'flash') !== flashEsperado;
                        const warn = bancoWarn || flashWarn;
                        return (
                          <td key={line} className={warn ? styles.warnCell : ''} title={
                            bancoWarn ? `Diverge do líquido da folha (${formatBRL(l.liquidoFolha)})`
                              : flashWarn ? `Esperado ${formatBRL(flashEsperado)} (transporte × R$12)` : ''
                          }>
                            <MoneyInput className={styles.moneyInput} value={l[f]} disabled={!isAdmin} onCommit={(v) => commit(line, f, v)} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className={styles.calcRow}>
                    <td className={styles.rowHead}>Dinheiro</td>
                    {LINES.map(([line]) => {
                      const d = dinheiroDe(doc?.[line] || {});
                      return <td key={line} className={d !== 0 ? styles.risk : ''} title={d !== 0 ? 'Pago por fora' : ''}>{formatBRL(d) || 'R$ 0,00'}</td>;
                    })}
                  </tr>
                  <tr className={styles.calcRow}>
                    <td className={styles.rowHead}>Total</td>
                    {LINES.map(([line]) => <td key={line}>{formatBRL(totalDe(doc?.[line] || {})) || 'R$ 0,00'}</td>)}
                  </tr>
                </tbody>
              </table>
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
