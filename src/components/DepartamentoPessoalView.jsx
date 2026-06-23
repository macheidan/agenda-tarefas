import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDepartamentoPessoal, ABSENCE_TYPES } from '../hooks/useDepartamentoPessoal';
import styles from '../styles/DepartamentoPessoalView.module.css';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const STORE_COLORS = ['#465fff', '#ff9800', '#12b76a', '#9c27b0', '#f04438', '#3949ab'];

const pad = (n) => String(n).padStart(2, '0');
const typeByKey = (key) => ABSENCE_TYPES.find((t) => t.key === key);

export default function DepartamentoPessoalView() {
  const { user } = useAuth();
  const {
    stores,
    employees,
    absences,
    addStore,
    renameStore,
    deleteStore,
    addEmployee,
    renameEmployee,
    deactivateEmployee,
    reactivateEmployee,
    deleteEmployee,
    setAbsence,
  } = useDepartamentoPessoal();

  const [selectedStore, setSelectedStore] = useState(null);
  // Loja ativa derivada: a selecionada se ainda existir, senão a primeira.
  const activeStore =
    selectedStore && stores.some((s) => s.id === selectedStore)
      ? selectedStore
      : stores[0]?.id || null;
  const setActiveStore = setSelectedStore;
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [showInactive, setShowInactive] = useState(false);
  const [addingEmp, setAddingEmp] = useState(false);
  const [empName, setEmpName] = useState('');
  const [editingEmp, setEditingEmp] = useState(null);
  const [editingEmpName, setEditingEmpName] = useState('');
  const [popover, setPopover] = useState(null); // { employeeId, date, x, y }
  const [managingStores, setManagingStores] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [editingStore, setEditingStore] = useState(null);
  const [editingStoreName, setEditingStoreName] = useState('');
  const popRef = useRef(null);

  // Fecha popover ao clicar fora.
  useEffect(() => {
    if (!popover) return;
    const onDown = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setPopover(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [popover]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );

  const storeEmployees = useMemo(
    () =>
      employees.filter(
        (e) => e.store === activeStore && (showInactive || e.active !== false)
      ),
    [employees, activeStore, showInactive]
  );

  // Mapa de ocorrências: `${employeeId}__${date}` -> { id, type }
  const absenceMap = useMemo(() => {
    const map = {};
    const prefix = `${year}-${pad(month + 1)}-`;
    for (const a of absences) {
      if (a.store !== activeStore) continue;
      if (!a.date || !a.date.startsWith(prefix)) continue;
      map[`${a.employeeId}__${a.date}`] = { id: a.id, type: a.type };
    }
    return map;
  }, [absences, activeStore, year, month]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const handleCellClick = (e, employeeId, day) => {
    const date = `${year}-${pad(month + 1)}-${pad(day)}`;
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ employeeId, date, x: rect.left, y: rect.bottom });
  };

  const applyType = (typeKey) => {
    if (!popover) return;
    const existing = absenceMap[`${popover.employeeId}__${popover.date}`];
    setAbsence(popover.employeeId, activeStore, popover.date, typeKey, existing?.id, user);
    setPopover(null);
  };

  const handleAddEmployee = () => {
    const name = empName.trim();
    if (!name) return;
    addEmployee(name, activeStore, user);
    setEmpName('');
    setAddingEmp(false);
  };

  const saveEmpRename = (id) => {
    if (editingEmpName.trim()) renameEmployee(id, editingEmpName);
    setEditingEmp(null);
    setEditingEmpName('');
  };

  const activeStoreObj = stores.find((s) => s.id === activeStore);

  return (
    <div className={styles.container}>
      {/* Cabeçalho da seção (submenu como na seção Instagram) */}
      <div className={styles.header}>
        <h2>👥 Departamento Pessoal</h2>
        <div className={styles.headerActions}>
          <button className={`${styles.sectionTab} ${styles.sectionTabActive}`}>
            Escala de Faltas
          </button>
        </div>
      </div>

      {/* Abas de lojas + gerenciar */}
      <div className={styles.storeBar}>
        <div className={styles.storeTabs}>
          {stores.map((s, idx) => {
            const color = STORE_COLORS[idx % STORE_COLORS.length];
            const active = s.id === activeStore;
            return (
              <button
                key={s.id}
                className={styles.storeTab}
                style={{
                  borderColor: color,
                  background: active ? color : 'var(--card)',
                  color: active ? '#fff' : color,
                }}
                onClick={() => setActiveStore(s.id)}
              >
                {s.name}
              </button>
            );
          })}
          <button
            className={styles.manageStoresBtn}
            onClick={() => setManagingStores((v) => !v)}
            title="Gerenciar lojas"
          >
            {managingStores ? 'Fechar' : '⚙ Lojas'}
          </button>
        </div>
      </div>

      {managingStores && (
        <div className={styles.manageBox}>
          <h4>Lojas</h4>
          <div className={styles.manageList}>
            {stores.map((s) => (
              <div key={s.id} className={styles.manageRow}>
                {editingStore === s.id ? (
                  <>
                    <input
                      className={styles.inlineInput}
                      value={editingStoreName}
                      autoFocus
                      onChange={(e) => setEditingStoreName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          renameStore(s.id, editingStoreName);
                          setEditingStore(null);
                        }
                      }}
                    />
                    <button
                      className={styles.smallBtn}
                      onClick={() => { renameStore(s.id, editingStoreName); setEditingStore(null); }}
                    >
                      Salvar
                    </button>
                    <button className={styles.smallBtnGhost} onClick={() => setEditingStore(null)}>
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <span className={styles.manageName}>{s.name}</span>
                    <button
                      className={styles.smallBtnGhost}
                      onClick={() => { setEditingStore(s.id); setEditingStoreName(s.name); }}
                    >
                      Renomear
                    </button>
                    <button
                      className={styles.smallBtnDanger}
                      onClick={() => {
                        if (window.confirm(`Remover a loja "${s.name}"? Os funcionários dela deixam de aparecer.`)) {
                          deleteStore(s.id);
                        }
                      }}
                    >
                      Remover
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className={styles.addStoreRow}>
            <input
              className={styles.inlineInput}
              placeholder="Nova loja..."
              value={newStoreName}
              onChange={(e) => setNewStoreName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newStoreName.trim()) {
                  addStore(newStoreName);
                  setNewStoreName('');
                }
              }}
            />
            <button
              className={styles.smallBtn}
              onClick={() => {
                if (newStoreName.trim()) { addStore(newStoreName); setNewStoreName(''); }
              }}
            >
              + Adicionar loja
            </button>
          </div>
        </div>
      )}

      {/* Barra de mês + ações */}
      <div className={styles.toolbar}>
        <div className={styles.monthNav}>
          <button className={styles.navBtn} onClick={prevMonth} aria-label="Mês anterior">‹</button>
          <span className={styles.monthLabel}>{MONTHS[month]} {year}</span>
          <button className={styles.navBtn} onClick={nextMonth} aria-label="Próximo mês">›</button>
        </div>
        <div className={styles.toolbarActions}>
          <label className={styles.inactiveToggle}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Mostrar inativos
          </label>
          {activeStore && (
            <button className={styles.newBtn} onClick={() => setAddingEmp((v) => !v)}>
              {addingEmp ? 'Cancelar' : '+ Funcionário'}
            </button>
          )}
        </div>
      </div>

      {addingEmp && (
        <div className={styles.addEmpRow}>
          <input
            className={styles.inlineInput}
            placeholder={`Nome do funcionário (${activeStoreObj?.name || ''})`}
            value={empName}
            autoFocus
            onChange={(e) => setEmpName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddEmployee()}
          />
          <button className={styles.smallBtn} onClick={handleAddEmployee}>Adicionar</button>
        </div>
      )}

      {/* Grade */}
      {stores.length === 0 ? (
        <p className={styles.empty}>Carregando lojas...</p>
      ) : storeEmployees.length === 0 ? (
        <p className={styles.empty}>
          Nenhum funcionário em <strong>{activeStoreObj?.name}</strong>. Clique em
          {' '}<strong>+ Funcionário</strong> para começar.
        </p>
      ) : (
        <div className={styles.gridWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th className={`${styles.cornerCell} ${styles.nameCol}`}>Funcionário</th>
                {days.map((d) => {
                  const wd = new Date(year, month, d).getDay();
                  const weekend = wd === 0 || wd === 6;
                  return (
                    <th key={d} className={`${styles.dayHead} ${weekend ? styles.weekend : ''}`}>
                      <span className={styles.dayNum}>{d}</span>
                      <span className={styles.dayWd}>{WEEKDAYS[wd]}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {storeEmployees.map((emp) => (
                <tr key={emp.id} className={emp.active === false ? styles.inactiveRow : ''}>
                  <td className={`${styles.nameCell} ${styles.nameCol}`}>
                    {editingEmp === emp.id ? (
                      <div className={styles.nameEdit}>
                        <input
                          className={styles.inlineInput}
                          value={editingEmpName}
                          autoFocus
                          onChange={(e) => setEditingEmpName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEmpRename(emp.id)}
                        />
                        <button className={styles.iconBtn} onClick={() => saveEmpRename(emp.id)} title="Salvar">✓</button>
                        <button className={styles.iconBtn} onClick={() => setEditingEmp(null)} title="Cancelar">✕</button>
                      </div>
                    ) : (
                      <div className={styles.nameWrap}>
                        <span className={styles.empName} title={emp.name}>
                          {emp.name}{emp.active === false ? ' (inativo)' : ''}
                        </span>
                        <span className={styles.rowActions}>
                          <button
                            className={styles.iconBtn}
                            onClick={() => { setEditingEmp(emp.id); setEditingEmpName(emp.name); }}
                            title="Renomear"
                          >
                            ✎
                          </button>
                          {emp.active === false ? (
                            <>
                              <button
                                className={styles.iconBtn}
                                onClick={() => reactivateEmployee(emp.id)}
                                title="Reativar"
                              >
                                ↩
                              </button>
                              <button
                                className={styles.iconBtnDanger}
                                onClick={() => {
                                  if (window.confirm(`Excluir definitivamente "${emp.name}"? Isso remove o funcionário do histórico.`)) {
                                    deleteEmployee(emp.id);
                                  }
                                }}
                                title="Excluir definitivamente"
                              >
                                🗑
                              </button>
                            </>
                          ) : (
                            <button
                              className={styles.iconBtn}
                              onClick={() => deactivateEmployee(emp.id)}
                              title="Remover (mantém histórico)"
                            >
                              ✕
                            </button>
                          )}
                        </span>
                      </div>
                    )}
                  </td>
                  {days.map((d) => {
                    const date = `${year}-${pad(month + 1)}-${pad(d)}`;
                    const mark = absenceMap[`${emp.id}__${date}`];
                    const t = mark && typeByKey(mark.type);
                    const wd = new Date(year, month, d).getDay();
                    const weekend = wd === 0 || wd === 6;
                    return (
                      <td
                        key={d}
                        className={`${styles.cell} ${weekend ? styles.weekend : ''}`}
                        onClick={(e) => handleCellClick(e, emp.id, d)}
                        title={t ? t.label : ''}
                      >
                        {t && (
                          <span
                            className={styles.mark}
                            style={{ background: t.color }}
                          >
                            {t.short}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legenda */}
      <div className={styles.legend}>
        {ABSENCE_TYPES.map((t) => (
          <span key={t.key} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: t.color }}>{t.short}</span>
            {t.label}
          </span>
        ))}
      </div>

      {/* Popover de seleção de tipo */}
      {popover && (
        <div
          ref={popRef}
          className={styles.popover}
          style={{ top: popover.y + 4, left: Math.min(popover.x, window.innerWidth - 220) }}
        >
          {ABSENCE_TYPES.map((t) => (
            <button key={t.key} className={styles.popItem} onClick={() => applyType(t.key)}>
              <span className={styles.popDot} style={{ background: t.color }}>{t.short}</span>
              {t.label}
            </button>
          ))}
          <button className={styles.popClear} onClick={() => applyType(null)}>
            Limpar
          </button>
        </div>
      )}
    </div>
  );
}
