import { useState, useMemo, useCallback, Fragment } from 'react';
import { useAuth } from '../contexts/AuthContext';
import MoneyInput from './MoneyInput';
import { formatBRL } from '../utils/money';
import { transporteDetalhe } from '../utils/transporte';
import { exportarResumoFolhaPdf } from '../lib/folhaPdf';
import styles from '../styles/SalariosView.module.css';

// Salários Folha: a ficha "Por funcionário" reduzida ao que quem fecha a folha
// precisa — loja, funcionário, mês e, em cada linha, o que vai pro BANCO e pro
// FLASH (vale por dia de transporte). Sem totais, sem histórico do ano.
// Lê o espelho dpSalariosBanco (só banco e flash), nunca dpSalarios: é o que
// permite liberar a tela pra outro usuário sem expor salário/adiantamento/
// empréstimo. Editar aqui grava nas duas coleções (setSalarioFolha), então a
// aba Salários vê a mudança, e vice-versa.
// A sub-seção "Resumo Mensal" lista Banco e Flash de toda a equipe, por loja,
// com subtotais — e o botão "Salvar PDF" imprime exatamente essa tabela
// (src/lib/folhaPdf.js), sem nada além do que o espelho carrega.

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
const ZERO_RESUMO = { banco5: 0, banco20: 0, flash5: 0, flash20: 0, extraBanco: 0, extraFlash: 0, total: 0 };
const somaResumo = (a, b) => ({
  banco5: a.banco5 + b.banco5, banco20: a.banco20 + b.banco20,
  flash5: a.flash5 + b.flash5, flash20: a.flash20 + b.flash20,
  extraBanco: a.extraBanco + b.extraBanco, extraFlash: a.extraFlash + b.extraFlash,
  total: a.total + b.total,
});

export default function SalariosFolhaView({ visibleStores, storeMeta, employees, absences, salariosBanco, setSalarioFolha, canEdit }) {
  const { user } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedStore, setSelectedStore] = useState(visibleStores[0]?.id || ALL_STORES);
  const [selectedEmpId, setSelectedEmpId] = useState(null);
  const [view, setView] = useState('func'); // 'func' (por funcionário) | 'resumo' (mensal por equipe)

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

  // ---- Resumo Mensal por equipe (só Banco e Flash) ----
  // Agrupa por loja, com subtotal; total da linha = tudo que sai pro funcionário
  // no mês por banco + Flash (dia 5, dia 20 e extra).
  const resumo = useMemo(() => {
    const docByEmp = {};
    for (const s of salariosBanco) {
      if (s.year === year && s.month === month) docByEmp[s.employeeId] = s;
    }
    const storeIds = isAmbas ? visibleStores.map((s) => s.id) : [activeStore];
    const groups = [];
    for (const sid of storeIds) {
      const emps = employees.filter((e) => e.store === sid && e.active !== false && !isArchived(e)).sort(byName);
      if (!emps.length) continue;
      const rows = emps.map((e) => {
        const d = docByEmp[e.id];
        const r = {
          id: e.id, name: e.name,
          banco5: num(d?.dia5, 'banco'), banco20: num(d?.dia20, 'banco'),
          flash5: num(d?.dia5, 'flash'), flash20: num(d?.dia20, 'flash'),
          extraBanco: num(d?.extra, 'banco'), extraFlash: num(d?.extra, 'flash'),
        };
        r.total = r.banco5 + r.banco20 + r.flash5 + r.flash20 + r.extraBanco + r.extraFlash;
        return r;
      });
      const subtotal = rows.reduce(somaResumo, { ...ZERO_RESUMO });
      groups.push({ storeId: sid, storeName: storeMeta[sid]?.name || '', rows, subtotal });
    }
    return groups;
  }, [salariosBanco, employees, year, month, isAmbas, visibleStores, activeStore, storeMeta, isArchived]);
  const hasExtra = resumo.some((g) => g.subtotal.extraBanco !== 0 || g.subtotal.extraFlash !== 0);
  const grandTotal = resumo.reduce((t, g) => somaResumo(t, g.subtotal), { ...ZERO_RESUMO });
  const resumoCols = 6 + (hasExtra ? 2 : 0);

  const salvarPdf = () => {
    const ok = exportarResumoFolhaPdf({
      mesLabel: `${MONTHS[month]} ${year}`,
      grupos: resumo,
      grandTotal,
      hasExtra,
      geradoEm: new Date().toLocaleString('pt-BR'),
    });
    if (!ok) window.alert('O navegador bloqueou a janela do PDF. Libere pop-ups para este site e tente de novo.');
  };

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
            Resumo Mensal
          </button>
        </div>
        {view !== 'resumo' && (
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
            <button
              className={styles.applyBtn}
              onClick={salvarPdf}
              disabled={resumo.length === 0}
              title="Abre a impressão do navegador — escolha 'Salvar como PDF'"
            >
              Salvar PDF
            </button>
          </div>
          <p className={styles.resumoNote}>
            <strong>Banco</strong> e <strong>Flash</strong> de cada funcionário — dia 5 e dia 20, por loja.
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
                    {hasExtra && <><th>Banco extra</th><th>Flash extra</th></>}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.map((g) => (
                    <Fragment key={g.storeId}>
                      {isAmbas && (
                        <tr className={styles.resumoStoreRow}>
                          <td colSpan={resumoCols}>
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
                          <td className={styles.chBancoCell}>{r.banco5 ? formatBRL(r.banco5) : '—'}</td>
                          <td className={styles.chBancoCell}>{r.banco20 ? formatBRL(r.banco20) : '—'}</td>
                          <td className={styles.chFlashCell}>{r.flash5 ? formatBRL(r.flash5) : '—'}</td>
                          <td className={styles.chFlashCell}>{r.flash20 ? formatBRL(r.flash20) : '—'}</td>
                          {hasExtra && (
                            <>
                              <td className={styles.chBancoCell}>{r.extraBanco ? formatBRL(r.extraBanco) : '—'}</td>
                              <td className={styles.chFlashCell}>{r.extraFlash ? formatBRL(r.extraFlash) : '—'}</td>
                            </>
                          )}
                          <td className={styles.resumoRowTotal}>{r.total ? formatBRL(r.total) : '—'}</td>
                        </tr>
                      ))}
                      <tr className={styles.resumoSubtotal}>
                        <td className={styles.resumoNameCol}>Total {g.storeName}</td>
                        <td>{formatBRL(g.subtotal.banco5) || 'R$ 0,00'}</td>
                        <td>{formatBRL(g.subtotal.banco20) || 'R$ 0,00'}</td>
                        <td>{formatBRL(g.subtotal.flash5) || 'R$ 0,00'}</td>
                        <td>{formatBRL(g.subtotal.flash20) || 'R$ 0,00'}</td>
                        {hasExtra && (
                          <>
                            <td>{formatBRL(g.subtotal.extraBanco) || 'R$ 0,00'}</td>
                            <td>{formatBRL(g.subtotal.extraFlash) || 'R$ 0,00'}</td>
                          </>
                        )}
                        <td>{formatBRL(g.subtotal.total) || 'R$ 0,00'}</td>
                      </tr>
                    </Fragment>
                  ))}
                  {isAmbas && resumo.length > 1 && (
                    <tr className={styles.resumoGrand}>
                      <td className={styles.resumoNameCol}>Total geral</td>
                      <td>{formatBRL(grandTotal.banco5) || 'R$ 0,00'}</td>
                      <td>{formatBRL(grandTotal.banco20) || 'R$ 0,00'}</td>
                      <td>{formatBRL(grandTotal.flash5) || 'R$ 0,00'}</td>
                      <td>{formatBRL(grandTotal.flash20) || 'R$ 0,00'}</td>
                      {hasExtra && (
                        <>
                          <td>{formatBRL(grandTotal.extraBanco) || 'R$ 0,00'}</td>
                          <td>{formatBRL(grandTotal.extraFlash) || 'R$ 0,00'}</td>
                        </>
                      )}
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
