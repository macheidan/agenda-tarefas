import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import MoneyInput from './MoneyInput';
import { formatBRL } from '../utils/money';
import { transporteDetalhe } from '../utils/transporte';
import styles from '../styles/SalariosView.module.css';

// Salários Folha: a ficha "Por funcionário" reduzida ao que quem fecha a folha
// precisa — loja, funcionário, mês e, em cada linha, o que vai pro BANCO e pro
// FLASH (vale por dia de transporte). Sem totais, sem histórico do ano.
// Lê o espelho dpSalariosBanco (só banco e flash), nunca dpSalarios: é o que
// permite liberar a tela pra outro usuário sem expor salário/adiantamento/
// empréstimo. Editar aqui grava nas duas coleções (setSalarioFolha), então a
// aba Salários vê a mudança, e vice-versa.

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const ALL_STORES = '__all__';
const LINES = [['dia5', 'Dia 5'], ['dia20', 'Dia 20'], ['extra', 'Extra']];
const VALE_DIA = 12; // R$ por dia de transporte (base do Flash) — mesmo valor da aba Salários.
// Linhas da tabela: campo, rótulo e classe de fundo (mesmas cores da aba Salários).
const FIELDS = [['banco', 'Banco', styles.chBanco], ['flash', 'Flash', styles.chFlash]];

const num = (l, f) => Number(l?.[f]) || 0;

export default function SalariosFolhaView({ visibleStores, storeMeta, employees, absences, salariosBanco, setSalarioFolha, canEdit }) {
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

  // Mesma régua de Salários: contrato encerrado antes do mês exibido = arquivado.
  const curMonthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const isArchived = useCallback(
    (e) => {
      const end = e.contractEnd ? e.contractEnd.slice(0, 7) : null;
      return !!end && curMonthKey > end;
    },
    [curMonthKey]
  );
  const byName = (a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());

  const list = useMemo(
    () => employees.filter((e) => relevantSet.has(e.store) && e.active !== false && !isArchived(e)).sort(byName),
    [employees, relevantSet, isArchived]
  );
  // Arquivados (contrato encerrado antes do mês) ficam fora daqui — a Folha é
  // só quem está na equipe; o histórico deles mora na aba Salários.
  const emp = list.find((e) => e.id === selectedEmpId) || list[0] || null;

  const docsByMonth = useMemo(() => {
    const m = {};
    if (!emp) return m;
    for (const s of salariosBanco) {
      if (s.employeeId === emp.id && s.year === year) m[s.month] = s;
    }
    return m;
  }, [salariosBanco, emp, year]);
  const doc = docsByMonth[month];

  // Flash esperado do Dia 5 = dias de transporte a pagar × R$12 (regra da aba Salários).
  const dias = emp ? transporteDetalhe(emp, absences || [], year, month).dias : 0;
  const flashEsperado = dias * VALE_DIA;

  const commit = (line, field, value) => {
    if (!canEdit || !emp) return;
    setSalarioFolha(emp.id, emp.store, year, month, line, { [field]: value }, user);
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
          <div className={styles.empHeader}>
            <span className={styles.empName}>
              {isAmbas && (
                <span className={styles.storeTag} style={{ background: storeMeta[emp.store]?.color || 'var(--text-secondary)' }}>
                  {(storeMeta[emp.store]?.name || '?').slice(0, 1)}
                </span>
              )}
              {emp.name}
            </span>
          </div>

          <div className={styles.body}>
            <div className={styles.detalhe}>
              <div className={styles.monthBar}>
                <div className={styles.monthNav}>
                  <button className={styles.navBtn} onClick={prevMonth} aria-label="Mês anterior">‹</button>
                  <span className={styles.monthLabel}>{MONTHS[month]} {year}</span>
                  <button className={styles.navBtn} onClick={nextMonth} aria-label="Próximo mês">›</button>
                </div>
                <span className={styles.transpInfo}>
                  Transporte: <strong>{dias}</strong> dias · Flash esperado <strong>{formatBRL(flashEsperado)}</strong>
                  {canEdit && dias > 0 && num(doc?.dia5, 'flash') !== flashEsperado && (
                    <button className={styles.applyBtn} title="Preencher o Flash do Dia 5 com transporte × R$12" onClick={() => commit('dia5', 'flash', flashEsperado)}>usar</button>
                  )}
                  {!canEdit && <> · Somente leitura</>}
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
                  {FIELDS.map(([field, label, bgCls]) => (
                    <tr key={field}>
                      <td className={styles.rowHead}>{label}</td>
                      {LINES.map(([line]) => {
                        const v = num(doc?.[line], field);
                        const flashWarn = field === 'flash' && line === 'dia5' && dias > 0 && v !== flashEsperado;
                        return (
                          <td key={line} className={flashWarn ? styles.warnCell : ''} title={flashWarn ? `Esperado ${formatBRL(flashEsperado)} (transporte × R$12)` : ''}>
                            <MoneyInput
                              className={`${styles.moneyInput} ${bgCls} ${v < 0 ? styles.neg : ''}`}
                              value={doc?.[line]?.[field]}
                              disabled={!canEdit}
                              onCommit={(nv) => commit(line, field, nv)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
