import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { useIsMobile } from '../hooks/useIsMobile';
import { getNamedHolidays } from '../utils/holidays';
import { useDepartamentoPessoal, ABSENCE_TYPES } from '../hooks/useDepartamentoPessoal';
import styles from '../styles/DepartamentoPessoalView.module.css';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const STORE_COLORS = ['#465fff', '#ff9800', '#12b76a', '#9c27b0', '#f04438', '#3949ab'];
const ALL_STORES = '__all__';
// Folga semanal permitida: segunda a quinta.
const FOLGA_WEEK = [[1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta']];
const FOLGA_WEEK_NAME = { 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta' };

// Escala inicial da loja Lov (importação de 1 clique).
const LOV_ESCALA = [
  { name: 'Michel', folgaWeekday: 1, folgaMonthN: 2 },
  { name: 'Natalia', folgaWeekday: 1, folgaMonthN: 3 },
  { name: 'Sergio', folgaWeekday: 1, folgaMonthN: 4 },
  { name: 'Juliana', folgaWeekday: 2, folgaMonthN: 2 },
  { name: 'Luis', folgaWeekday: 3, folgaMonthN: 1 },
  { name: 'Marcos', folgaWeekday: 4, folgaMonthN: 4 },
  { name: 'Júlio', folgaWeekday: null, folgaMonthN: 3 },
];

const pad = (n) => String(n).padStart(2, '0');
const typeByKey = (key) => ABSENCE_TYPES.find((t) => t.key === key);

export default function DepartamentoPessoalView() {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings(user.uid);
  const isMobile = useIsMobile(768);
  // Editores (e o admin) gerenciam lojas/funcionários. Qualquer usuário com a
  // seção visível pode trabalhar no calendário (marcar todos os tipos).
  const canEdit = isAdmin || settings?.dpEditor === true;
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
  // Formulário de funcionário (add/editar) numa barra no topo.
  const [formMode, setFormMode] = useState(null); // null | 'add' | 'edit'
  const [formId, setFormId] = useState(null);
  const [fName, setFName] = useState('');
  const [fStore, setFStore] = useState('');
  const [fWeekday, setFWeekday] = useState(''); // '' | 1..4 (seg-qui)
  const [fMonthN, setFMonthN] = useState(''); // '' | 1..5 (domingo do mês)
  const [popover, setPopover] = useState(null);
  const [selectedEmp, setSelectedEmp] = useState(null); // funcionário escolhido no mobile
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

  const closeForm = () => setFormMode(null);

  const openAdd = () => {
    if (formMode === 'add') { closeForm(); return; }
    setFormMode('add');
    setFormId(null);
    setFName('');
    setFStore(isAmbas ? (visibleStores[0]?.id || '') : activeStore || '');
    setFWeekday('');
    setFMonthN('');
  };

  const openEdit = (emp) => {
    setFormMode('edit');
    setFormId(emp.id);
    setFName(emp.name || '');
    setFStore(emp.store || '');
    setFWeekday(emp.folgaWeekday != null ? String(emp.folgaWeekday) : '');
    setFMonthN(emp.folgaMonthN != null ? String(emp.folgaMonthN) : '');
  };

  const submitForm = () => {
    const name = fName.trim();
    if (!name || !fStore) return;
    const wd = fWeekday === '' ? null : Number(fWeekday);
    const mn = fMonthN === '' ? null : Number(fMonthN);
    if (formMode === 'edit' && formId) {
      updateEmployee(formId, { name, store: fStore, folgaWeekday: wd, folgaMonthN: mn });
    } else {
      addEmployee(name, fStore, user, { folgaWeekday: wd, folgaMonthN: mn });
    }
    closeForm();
  };

  // Importa a escala inicial da Lov (cria os funcionários com folga; ignora repetidos).
  const importLovEscala = () => {
    const lov = stores.find((s) => (s.name || '').trim().toLowerCase() === 'lov');
    if (!lov) {
      window.alert('Loja "Lov" não encontrada. Crie a loja Lov antes de importar.');
      return;
    }
    const existing = new Set(
      employees.filter((e) => e.store === lov.id).map((e) => (e.name || '').trim().toLowerCase())
    );
    const toAdd = LOV_ESCALA.filter((e) => !existing.has(e.name.toLowerCase()));
    if (toAdd.length === 0) {
      window.alert('Todos os funcionários da escala Lov já estão cadastrados.');
      return;
    }
    if (!window.confirm(`Importar ${toAdd.length} funcionário(s) na loja Lov com as folgas configuradas?`)) return;
    toAdd.forEach((e) =>
      addEmployee(e.name, lov.id, user, { folgaWeekday: e.folgaWeekday, folgaMonthN: e.folgaMonthN })
    );
  };

  // Feriados (nacionais + RS + Porto Alegre + móveis) do ano exibido.
  const holidays = useMemo(() => getNamedHolidays(year), [year]);
  const holidayFor = (d) => holidays[`${pad(month + 1)}-${pad(d)}`];

  const folgaType = typeByKey('folga');
  const nthSundayOfMonth = (d) => {
    let c = 0;
    for (let i = 1; i <= d; i++) if (new Date(year, month, i).getDay() === 0) c++;
    return c;
  };
  // Dia é folga (derivado da config do funcionário): dia fixo da semana OU o Nº domingo do mês.
  const isFolgaDay = (emp, d) => {
    const wd = new Date(year, month, d).getDay();
    if (emp.folgaWeekday != null && wd === emp.folgaWeekday) return true;
    if (emp.folgaMonthN != null && wd === 0 && nthSundayOfMonth(d) === emp.folgaMonthN) return true;
    return false;
  };
  const folgaDesc = (emp) => {
    const p = [];
    if (emp.folgaWeekday != null) p.push(FOLGA_WEEK_NAME[emp.folgaWeekday] || '');
    if (emp.folgaMonthN != null) p.push(`${emp.folgaMonthN}º domingo`);
    return p.filter(Boolean).join(' • ');
  };

  // No mobile, mostra um funcionário por vez (escolhido no seletor).
  const mobileEmp =
    storeEmployees.find((e) => e.id === selectedEmp) || storeEmployees[0] || null;

  // Info de uma célula. Marca real do banco tem prioridade; senão, folga derivada da config.
  const dayInfo = (emp, d) => {
    const date = `${year}-${pad(month + 1)}-${pad(d)}`;
    const mark = absenceMap[`${emp.id}__${date}`];
    let t = mark ? typeByKey(mark.type) : null;
    if (!t && isFolgaDay(emp, d)) t = folgaType;
    const wd = new Date(year, month, d).getDay();
    return { date, mark, t, wd, weekend: wd === 0 || wd === 6, holiday: holidayFor(d) };
  };

  const activeStoreObj = stores.find((s) => s.id === activeStore);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>👥 Departamento Pessoal</h2>
        <div className={styles.headerActions}>
          <button className={`${styles.sectionTab} ${styles.sectionTabActive}`}>
            Escala
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
          {canEdit && (
            <button
              className={styles.manageStoresBtn}
              onClick={() => setManagingStores((v) => !v)}
              title="Gerenciar lojas"
            >
              {managingStores ? 'Fechar' : '⚙ Lojas'}
            </button>
          )}
        </div>
      </div>

      {managingStores && canEdit && (
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
          {canEdit && stores.some((s) => (s.name || '').trim().toLowerCase() === 'lov') && (
            <button className={styles.smallBtnGhost} onClick={importLovEscala} title="Cria os funcionários da escala Lov com folga">
              Importar escala Lov
            </button>
          )}
          {canEdit && (activeStore || isAmbas) && visibleStores.length > 0 && (
            <button className={styles.newBtn} onClick={openAdd}>
              {formMode === 'add' ? 'Cancelar' : '+ Funcionário'}
            </button>
          )}
        </div>
      </div>

      {formMode && canEdit && (
        <div className={styles.empForm}>
          <div className={styles.empFormTitle}>
            {formMode === 'add' ? 'Novo funcionário' : 'Editar funcionário'}
          </div>
          <div className={styles.empFormFields}>
            <input
              className={styles.inlineInput}
              placeholder="Nome do funcionário"
              value={fName}
              autoFocus
              onChange={(e) => setFName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitForm()}
            />
            <label className={styles.fieldLabel}>
              Loja
              <select className={styles.storeSelect} value={fStore} onChange={(e) => setFStore(e.target.value)}>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className={styles.fieldLabel}>
              Folga da semana
              <select className={styles.storeSelect} value={fWeekday} onChange={(e) => setFWeekday(e.target.value)}>
                <option value="">—</option>
                {FOLGA_WEEK.map(([v, n]) => (
                  <option key={v} value={v}>{n}</option>
                ))}
              </select>
            </label>
            <label className={styles.fieldLabel}>
              Folga do mês
              <select className={styles.storeSelect} value={fMonthN} onChange={(e) => setFMonthN(e.target.value)}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}º domingo</option>
                ))}
              </select>
            </label>
            <button className={styles.smallBtn} onClick={submitForm}>
              {formMode === 'add' ? 'Adicionar' : 'Salvar'}
            </button>
            <button className={styles.smallBtnGhost} onClick={closeForm}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Grade */}
      {loadingStores ? (
        <p className={styles.empty}>Carregando lojas...</p>
      ) : stores.length === 0 ? (
        <div className={styles.empty}>
          <p>Nenhuma loja cadastrada ainda.</p>
          {canEdit && (
            <button className={styles.newBtn} onClick={() => seedDefaultStores()}>
              Criar minhas duas lojas (Dáme e Lov)
            </button>
          )}
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
          {canEdit && <> Clique em <strong>+ Funcionário</strong> para começar.</>}
        </p>
      ) : isMobile ? (
        <div className={styles.mList}>
          <div className={styles.mEmpSelectRow}>
            <span className={styles.mEmpSelectLabel}>Funcionário</span>
            <select
              className={styles.mEmpSelect}
              value={mobileEmp?.id || ''}
              onChange={(e) => setSelectedEmp(e.target.value)}
            >
              {storeEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {isAmbas && storeMeta[e.store] ? `${storeMeta[e.store].name} — ${e.name}` : e.name}
                </option>
              ))}
            </select>
          </div>
          {[mobileEmp].filter(Boolean).map((emp) => {
            const firstDow = new Date(year, month, 1).getDay();
            return (
              <div key={emp.id} className={styles.mEmpCard}>
                <div className={styles.mEmpHeader}>
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
                    <span className={styles.mEmpName} title={emp.name}>{emp.name}</span>
                    {folgaDesc(emp) && (
                      <span className={styles.folgaTag} title={`Folga: ${folgaDesc(emp)}`}>FG</span>
                    )}
                  </span>
                  {canEdit && (
                    <span className={`${styles.rowActions} ${styles.rowActionsVisible}`}>
                      <button className={styles.iconBtn} onClick={() => openEdit(emp)} title="Editar funcionário">✎</button>
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
                  )}
                </div>
                <div className={styles.mCalGrid}>
                  {WEEKDAYS.map((w, i) => (
                    <span key={`h${i}`} className={styles.mWeekday}>{w}</span>
                  ))}
                  {Array.from({ length: firstDow }).map((_, i) => (
                    <span key={`b${i}`} className={styles.mDayEmpty} />
                  ))}
                  {days.map((d) => {
                    const info = dayInfo(emp, d);
                    return (
                      <button
                        key={d}
                        className={`${styles.mDay} ${info.weekend ? styles.mDayWeekend : ''} ${info.holiday ? styles.mDayHoliday : ''}`}
                        onClick={(e) => handleCellClick(e, emp, d)}
                        title={info.t ? info.t.label : info.holiday || ''}
                      >
                        <span className={styles.mDayNum}>{d}</span>
                        {info.t && <span className={styles.mDayMark} style={{ background: info.t.color }}>{info.t.short}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.gridWrap}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th className={`${styles.cornerCell} ${styles.nameCol}`}>Funcionário</th>
                {days.map((d) => {
                  const wd = new Date(year, month, d).getDay();
                  const weekend = wd === 0 || wd === 6;
                  const hol = holidayFor(d);
                  return (
                    <th
                      key={d}
                      className={`${styles.dayHead} ${weekend ? styles.weekend : ''} ${hol ? styles.holidayHead : ''}`}
                      title={hol || ''}
                    >
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
                  <td className={`${styles.nameCell} ${styles.nameCol}`}>
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
                        {folgaDesc(emp) && (
                          <span className={styles.folgaTag} title={`Folga: ${folgaDesc(emp)}`}>FG</span>
                        )}
                      </span>
                      {canEdit && (
                        <span className={styles.rowActions}>
                          <button className={styles.iconBtn} onClick={() => openEdit(emp)} title="Editar funcionário">✎</button>
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
                      )}
                    </div>
                  </td>
                  {days.map((d) => {
                    const info = dayInfo(emp, d);
                    return (
                      <td
                        key={d}
                        className={`${styles.cell} ${info.weekend ? styles.weekend : ''} ${info.holiday ? styles.holidayCell : ''}`}
                        onClick={(e) => handleCellClick(e, emp, d)}
                        title={info.t ? info.t.label : info.holiday || ''}
                      >
                        {info.t && <span className={styles.mark} style={{ background: info.t.color }}>{info.t.short}</span>}
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
        <span className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.holidayLegendDot}`} />
          Feriado
        </span>
      </div>

      {/* Popover de seleção de tipo */}
      {popover && (
        <div
          ref={popRef}
          className={styles.popover}
          style={{
            top: Math.max(8, Math.min(popover.y + 4, window.innerHeight - 260)),
            left: Math.max(8, Math.min(popover.x, window.innerWidth - 220)),
          }}
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
