import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { useDepartamentoPessoal, ABSENCE_TYPES } from '../hooks/useDepartamentoPessoal';
import styles from '../styles/DepartamentoPessoalView.module.css';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const STORE_COLORS = ['#465fff', '#ff9800', '#12b76a', '#9c27b0', '#f04438', '#3949ab'];
const ALL_STORES = '__all__';

const pad = (n) => String(n).padStart(2, '0');
const typeByKey = (key) => ABSENCE_TYPES.find((t) => t.key === key);

export default function DepartamentoPessoalView() {
  const { user } = useAuth();
  const { settings } = useSettings(user.uid);
  const {
    stores,
    loadingStores,
    storesError,
    seedDefaultStores,
    employees,
    absences,
    addStore,
    renameStore,
    deleteStore,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    setAbsence,
  } = useDepartamentoPessoal();

  // Lojas escondidas para este usuário (configurado pelo admin em Settings).
  const hiddenSet = useMemo(
    () => new Set(settings?.dpHiddenStores || []),
    [settings]
  );
  const visibleStores = useMemo(
    () => stores.filter((s) => !hiddenSet.has(s.id)),
    [stores, hiddenSet]
  );

  // Cor e nome por loja (índice estável na lista completa).
  const storeMeta = useMemo(() => {
    const m = {};
    stores.forEach((s, idx) => {
      m[s.id] = { name: s.name, color: STORE_COLORS[idx % STORE_COLORS.length] };
    });
    return m;
  }, [stores]);

  const [selectedStore, setSelectedStore] = useState(null);
  const validIds = [...visibleStores.map((s) => s.id), ALL_STORES];
  const activeStore =
    selectedStore && validIds.includes(selectedStore)
      ? selectedStore
      : visibleStores[0]?.id || null;
  const isAmbas = activeStore === ALL_STORES;

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [addingEmp, setAddingEmp] = useState(false);
  const [empName, setEmpName] = useState('');
  const [empStore, setEmpStore] = useState('');
  const [editingEmp, setEditingEmp] = useState(null);
  const [editName, setEditName] = useState('');
  const [editStore, setEditStore] = useState('');
  const [popover, setPopover] = useState(null);
  const [managingStores, setManagingStores] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [editingStore, setEditingStore] = useState(null);
  const [editingStoreName, setEditingStoreName] = useState('');
  const popRef = useRef(null);

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

  // Lojas relevantes para a visão atual (uma loja, ou todas as visíveis em "Ambas").
  const relevantStoreIds = useMemo(
    () => (isAmbas ? visibleStores.map((s) => s.id) : activeStore ? [activeStore] : []),
    [isAmbas, visibleStores, activeStore]
  );
  const relevantSet = useMemo(() => new Set(relevantStoreIds), [relevantStoreIds]);

  const storeOrder = useMemo(() => {
    const o = {};
    stores.forEach((s, idx) => { o[s.id] = idx; });
    return o;
  }, [stores]);

  const storeEmployees = useMemo(() => {
    const list = employees.filter((e) => relevantSet.has(e.store) && e.active !== false);
    list.sort((a, b) => {
      if (isAmbas) {
        const so = (storeOrder[a.store] ?? 0) - (storeOrder[b.store] ?? 0);
        if (so !== 0) return so;
      }
      return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
    });
    return list;
  }, [employees, relevantSet, isAmbas, storeOrder]);

  // Mapa de ocorrências do mês: `${employeeId}__${date}` -> { id, type }
  const absenceMap = useMemo(() => {
    const map = {};
    const prefix = `${year}-${pad(month + 1)}-`;
    for (const a of absences) {
      if (!relevantSet.has(a.store)) continue;
      if (!a.date || !a.date.startsWith(prefix)) continue;
      map[`${a.employeeId}__${a.date}`] = { id: a.id, type: a.type };
    }
    return map;
  }, [absences, relevantSet, year, month]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const handleCellClick = (e, emp, day) => {
    const date = `${year}-${pad(month + 1)}-${pad(day)}`;
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({ employeeId: emp.id, store: emp.store, date, x: rect.left, y: rect.bottom });
  };

  const applyType = (typeKey) => {
    if (!popover) return;
    const existing = absenceMap[`${popover.employeeId}__${popover.date}`];
    setAbsence(popover.employeeId, popover.store, popover.date, typeKey, existing?.id, user);
    setPopover(null);
  };

  const openAddEmp = () => {
    setEmpStore(isAmbas ? (visibleStores[0]?.id || '') : activeStore || '');
    setEmpName('');
    setAddingEmp((v) => !v);
  };

  const handleAddEmployee = () => {
    const name = empName.trim();
    const store = isAmbas ? empStore : activeStore;
    if (!name || !store) return;
    addEmployee(name, store, user);
    setEmpName('');
    setAddingEmp(false);
  };

  const startEdit = (emp) => {
    setEditingEmp(emp.id);
    setEditName(emp.name || '');
    setEditStore(emp.store || '');
  };
  const saveEdit = (id) => {
    if (!editName.trim()) return;
    updateEmployee(id, { name: editName, store: editStore });
    setEditingEmp(null);
  };

  const activeStoreObj = stores.find((s) => s.id === activeStore);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>👥 Departamento Pessoal</h2>
        <div className={styles.headerActions}>
          <button className={`${styles.sectionTab} ${styles.sectionTabActive}`}>
            Escala de Faltas
          </button>
        </div>
      </div>

      {/* Abas de lojas (+ Ambas) + gerenciar */}
      <div className={styles.storeBar}>
        <div className={styles.storeTabs}>
          {visibleStores.map((s) => {
            const color = storeMeta[s.id]?.color || 'var(--accent)';
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
                onClick={() => setSelectedStore(s.id)}
              >
                {s.name}
              </button>
            );
          })}
          {visibleStores.length > 1 && (
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
          )}
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
                        if (e.key === 'Enter') { renameStore(s.id, editingStoreName); setEditingStore(null); }
                      }}
                    />
                    <button className={styles.smallBtn} onClick={() => { renameStore(s.id, editingStoreName); setEditingStore(null); }}>Salvar</button>
                    <button className={styles.smallBtnGhost} onClick={() => setEditingStore(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <span className={styles.manageName}>{s.name}</span>
                    <button className={styles.smallBtnGhost} onClick={() => { setEditingStore(s.id); setEditingStoreName(s.name); }}>Renomear</button>
                    <button
                      className={styles.smallBtnDanger}
                      onClick={() => {
                        if (window.confirm(`Remover a loja "${s.name}"? Os funcionários dela deixam de aparecer.`)) deleteStore(s.id);
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
                if (e.key === 'Enter' && newStoreName.trim()) { addStore(newStoreName); setNewStoreName(''); }
              }}
            />
            <button
              className={styles.smallBtn}
              onClick={() => { if (newStoreName.trim()) { addStore(newStoreName); setNewStoreName(''); } }}
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
          {(activeStore || isAmbas) && visibleStores.length > 0 && (
            <button className={styles.newBtn} onClick={openAddEmp}>
              {addingEmp ? 'Cancelar' : '+ Funcionário'}
            </button>
          )}
        </div>
      </div>

      {addingEmp && (
        <div className={styles.addEmpRow}>
          <input
            className={styles.inlineInput}
            placeholder="Nome do funcionário"
            value={empName}
            autoFocus
            onChange={(e) => setEmpName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddEmployee()}
          />
          {isAmbas ? (
            <select className={styles.storeSelect} value={empStore} onChange={(e) => setEmpStore(e.target.value)}>
              {visibleStores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          ) : (
            <span className={styles.addEmpStoreLabel}>em <strong>{activeStoreObj?.name}</strong></span>
          )}
          <button className={styles.smallBtn} onClick={handleAddEmployee}>Adicionar</button>
        </div>
      )}

      {/* Grade */}
      {loadingStores ? (
        <p className={styles.empty}>Carregando lojas...</p>
      ) : stores.length === 0 ? (
        <div className={styles.empty}>
          <p>Nenhuma loja cadastrada ainda.</p>
          <button className={styles.newBtn} onClick={() => seedDefaultStores()}>
            Criar minhas duas lojas (Dáme e Lov)
          </button>
          {storesError && (
            <p className={styles.errorMsg}>
              Erro ao acessar o banco: {storesError}. Pode ser necessário publicar as
              regras do Firestore (coleções dpStores/dpEmployees/dpAbsences).
            </p>
          )}
        </div>
      ) : visibleStores.length === 0 ? (
        <p className={styles.empty}>Nenhuma loja disponível para o seu usuário.</p>
      ) : storeEmployees.length === 0 ? (
        <p className={styles.empty}>
          Nenhum funcionário {isAmbas ? 'cadastrado' : <>em <strong>{activeStoreObj?.name}</strong></>}.
          Clique em <strong>+ Funcionário</strong> para começar.
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
                <tr key={emp.id}>
                  <td className={`${styles.nameCell} ${styles.nameCol} ${editingEmp === emp.id ? styles.nameColEditing : ''}`}>
                    {editingEmp === emp.id ? (
                      <div className={styles.nameEdit}>
                        <input
                          className={styles.inlineInput}
                          value={editName}
                          autoFocus
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveEdit(emp.id)}
                        />
                        <select className={styles.storeSelect} value={editStore} onChange={(e) => setEditStore(e.target.value)}>
                          {stores.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <button className={styles.iconBtn} onClick={() => saveEdit(emp.id)} title="Salvar">✓</button>
                        <button className={styles.iconBtn} onClick={() => setEditingEmp(null)} title="Cancelar">✕</button>
                      </div>
                    ) : (
                      <div className={styles.nameWrap}>
                        <span className={styles.empNameWrap}>
                          {isAmbas && (
                            <span
                              className={styles.empStoreTag}
                              style={{ background: storeMeta[emp.store]?.color || 'var(--text-secondary)' }}
                              title={storeMeta[emp.store]?.name}
                            >
                              {(storeMeta[emp.store]?.name || '?').slice(0, 1)}
                            </span>
                          )}
                          <span className={styles.empName} title={emp.name}>{emp.name}</span>
                        </span>
                        <span className={styles.rowActions}>
                          <button className={styles.iconBtn} onClick={() => startEdit(emp)} title="Editar funcionário">✎</button>
                          <button
                            className={styles.iconBtnDanger}
                            onClick={() => {
                              if (window.confirm(`Apagar o funcionário "${emp.name}"? Esta ação remove o funcionário e suas faltas.`)) {
                                deleteEmployee(emp.id);
                              }
                            }}
                            title="Apagar funcionário"
                          >
                            🗑
                          </button>
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
                        onClick={(e) => handleCellClick(e, emp, d)}
                        title={t ? t.label : ''}
                      >
                        {t && <span className={styles.mark} style={{ background: t.color }}>{t.short}</span>}
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
          <button className={styles.popClear} onClick={() => applyType(null)}>Limpar</button>
        </div>
      )}
    </div>
  );
}
