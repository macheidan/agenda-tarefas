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
const pad = (n) => String(n).padStart(2, '0');

const num = (line, f) => Number(line?.[f]) || 0;
// Σ(B:G) = valor devido ao funcionário na linha.
const somaBG = (l) =>
  num(l, 'salario') + num(l, 'transporte') + num(l, 'feriado') +
  num(l, 'entrada') + num(l, 'adianta') + num(l, 'empres');
// Dinheiro (H) = Σ(B:G) − (Banco + Flash). Total (K) = Banco + Flash + Dinheiro.
const dinheiroDe = (l) => somaBG(l) - (num(l, 'banco') + num(l, 'flash'));

export default function SalariosView({ visibleStores, storeMeta, employees, absences, salarios, setSalario, isAdmin }) {
  const { user } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedStore, setSelectedStore] = useState(visibleStores[0]?.id || ALL_STORES);

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

  // Índice rápido: employeeId → doc de salário do mês exibido.
  const salByEmp = useMemo(() => {
    const m = {};
    for (const s of salarios) {
      if (s.year === year && s.month === month) m[s.employeeId] = s;
    }
    return m;
  }, [salarios, year, month]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const commit = (emp, doc, line, field, value) => {
    if (!isAdmin) return;
    const existing = doc?.[line] || {};
    setSalario(emp.id, emp.store, year, month, line, { ...existing, [field]: value }, user);
  };

  const mmSeg = pad(((month + 1) % 12) + 1);

  // Totais do mês (por fora = risco), somando as 3 linhas de todos os funcionários.
  const totais = useMemo(() => {
    let banco = 0, flash = 0, dinheiro = 0;
    for (const emp of list) {
      const doc = salByEmp[emp.id];
      for (const [line] of LINES) {
        const l = doc?.[line];
        if (!l) continue;
        banco += num(l, 'banco');
        flash += num(l, 'flash');
        dinheiro += dinheiroDe(l);
      }
    }
    return { banco, flash, dinheiro };
  }, [list, salByEmp]);

  return (
    <div className={styles.container}>
      <p className={styles.hint}>
        Folha do mês por funcionário (Dia 5 / Dia 20 / Extra), espelhando as planilhas.
        <strong> Dinheiro</strong> e <strong>Total</strong> são calculados: Dinheiro = (Salário+Transporte+Feriado+Entrada+Adianta+Empréstimo) − (Banco+Flash).
        O <span className={styles.riskInline}>Dinheiro em destaque</span> é o que vai “por fora”.
        {!isAdmin && ' Somente leitura — apenas o admin edita.'}
      </p>

      <div className={styles.toolbar}>
        <div className={styles.monthNav}>
          <button className={styles.navBtn} onClick={prevMonth} aria-label="Mês anterior">‹</button>
          <span className={styles.monthLabel}>{MONTHS[month]} {year}</span>
          <button className={styles.navBtn} onClick={nextMonth} aria-label="Próximo mês">›</button>
        </div>
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
                  onClick={() => setSelectedStore(s.id)}
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
              onClick={() => setSelectedStore(ALL_STORES)}
            >
              Ambas
            </button>
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <p className={styles.empty}>Nenhum funcionário. Cadastre na aba <strong>Escala</strong>.</p>
      ) : (
        <>
          {list.map((emp) => {
            const doc = salByEmp[emp.id];
            const dias = transporteDetalhe(emp, absences, year, month).dias;
            const flashEsperado = dias * VALE_DIA;
            const dia5Flash = num(doc?.dia5, 'flash');
            const flashOk = dia5Flash === flashEsperado;
            const porForaMes = LINES.reduce((acc, [line]) => acc + (doc?.[line] ? dinheiroDe(doc[line]) : 0), 0);

            return (
              <div key={emp.id} className={styles.empCard}>
                <div className={styles.empHeader}>
                  <span className={styles.empName}>
                    {isAmbas && (
                      <span className={styles.storeTag} style={{ background: storeMeta[emp.store]?.color || 'var(--text-secondary)' }}>
                        {(storeMeta[emp.store]?.name || '?').slice(0, 1)}
                      </span>
                    )}
                    {emp.name}
                  </span>
                  <span className={styles.empMeta}>
                    Transporte a pagar: <strong>{dias}</strong> dias · Flash esperado:{' '}
                    <strong>{formatBRL(flashEsperado)}</strong>
                    {isAdmin && dias > 0 && !flashOk && (
                      <button
                        className={styles.applyBtn}
                        title="Preencher o Flash do Dia 5 com o valor esperado (transporte × R$12)"
                        onClick={() => commit(emp, doc, 'dia5', 'flash', flashEsperado)}
                      >
                        usar
                      </button>
                    )}
                  </span>
                </div>

                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.rowHead}></th>
                        <th>Salário</th>
                        <th>Transp.</th>
                        <th>Feriado</th>
                        <th>Entrada</th>
                        <th>Adianta</th>
                        <th>Emprést.</th>
                        <th className={styles.calcHead}>Dinheiro</th>
                        <th>Banco</th>
                        <th>Flash</th>
                        <th className={styles.calcHead}>Total</th>
                        <th className={styles.refHead}>Líq. folha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LINES.map(([line, label]) => {
                        const l = doc?.[line] || {};
                        const dinheiro = dinheiroDe(l);
                        const total = num(l, 'banco') + num(l, 'flash') + dinheiro;
                        const liq = l.liquidoFolha;
                        const bancoWarn = liq != null && liq !== '' && num(l, 'banco') !== Number(liq);
                        const flashWarn = line === 'dia5' && dias > 0 && num(l, 'flash') !== flashEsperado;
                        const money = (field, extraClass = '') => (
                          <MoneyInput
                            className={`${styles.moneyInput} ${extraClass}`}
                            value={l[field]}
                            disabled={!isAdmin}
                            onCommit={(v) => commit(emp, doc, line, field, v)}
                          />
                        );
                        return (
                          <tr key={line}>
                            <td className={styles.rowHead}>{label}</td>
                            <td>{money('salario')}</td>
                            <td>{money('transporte')}</td>
                            <td>{money('feriado')}</td>
                            <td>{money('entrada')}</td>
                            <td>{money('adianta')}</td>
                            <td>{money('empres')}</td>
                            <td className={`${styles.calcCell} ${dinheiro !== 0 ? styles.risk : ''}`} title={dinheiro !== 0 ? 'Valor pago por fora' : ''}>
                              {formatBRL(dinheiro) || 'R$ 0,00'}
                            </td>
                            <td className={bancoWarn ? styles.warnCell : ''} title={bancoWarn ? `Diverge do líquido da folha (${formatBRL(liq)})` : ''}>
                              {money('banco')}
                            </td>
                            <td className={flashWarn ? styles.warnCell : ''} title={flashWarn ? `Esperado ${formatBRL(flashEsperado)} (transporte × R$12)` : ''}>
                              {money('flash')}
                            </td>
                            <td className={styles.calcCell}>{formatBRL(total) || 'R$ 0,00'}</td>
                            <td className={styles.refCell}>{money('liquidoFolha')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {porForaMes !== 0 && (
                  <div className={styles.porForaLine}>
                    Por fora no mês (Dinheiro): <strong className={styles.risk}>{formatBRL(porForaMes)}</strong>
                  </div>
                )}
              </div>
            );
          })}

          <div className={styles.totais}>
            <span>Mês {MONTHS[month]} · pago em 05/{mmSeg}</span>
            <span>Banco: <strong>{formatBRL(totais.banco)}</strong></span>
            <span>Flash: <strong>{formatBRL(totais.flash)}</strong></span>
            <span>Por fora: <strong className={totais.dinheiro !== 0 ? styles.risk : ''}>{formatBRL(totais.dinheiro)}</strong></span>
          </div>
        </>
      )}
    </div>
  );
}
