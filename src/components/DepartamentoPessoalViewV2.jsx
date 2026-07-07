import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { useIsMobile } from '../hooks/useIsMobile';
import { getNamedHolidays } from '../utils/holidays';
import { useDepartamentoPessoal, ABSENCE_TYPES } from '../hooks/useDepartamentoPessoal';
import { transporteDetalhe, empFolgaWeekdays } from '../utils/transporte';
import SalariosView from './SalariosView';
import styles from '../styles/DepartamentoPessoalViewV2.module.css';

// V2 "BRASA" — redesenho da sub-aba Escala com tema próprio (auto-contido). A
// LÓGICA é a mesma do DepartamentoPessoalView (mesmos hooks e regras); só a
// camada de apresentação muda. Salários reusa o SalariosView existente (fora do
// escopo do redesenho, conforme piloto).

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const STORE_COLORS = ['#4f46e5', '#0ea5e9', '#059669', '#9333ea', '#e11d48', '#d97706'];
const ALL_STORES = '__all__';
const FOLGA_WEEK = [[1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta'], [5, 'Sexta'], [6, 'Sábado'], [0, 'Domingo']];

const pad = (n) => String(n).padStart(2, '0');
const typeByKey = (key) => ABSENCE_TYPES.find((t) => t.key === key);

export default function DepartamentoPessoalViewV2() {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings(user.uid);
  const isMobile = useIsMobile(768);
  const canEdit = isAdmin || settings?.dpEditor === true;
  const canSalarios = isAdmin || settings?.dpSalariosVisible === true;
  const [dpSection, setDpSection] = useState('escala');
  const {
    stores, loadingStores, storesError, seedDefaultStores,
    employees, absences, salarios, setSalario,
    addStore, renameStore, deleteStore,
    addEmployee, updateEmployee, deleteEmployee, setAbsence,
  } = useDepartamentoPessoal();

  const effectiveSection = canSalarios ? (dpSection === 'escala' ? 'escala' : 'salarios') : 'escala';

  const hiddenSet = useMemo(() => new Set(settings?.dpHiddenStores || []), [settings]);
  const visibleStores = useMemo(() => stores.filter((s) => !hiddenSet.has(s.id)), [stores, hiddenSet]);

  const storeMeta = useMemo(() => {
    const m = {};
    stores.forEach((s, idx) => { m[s.id] = { name: s.name, color: STORE_COLORS[idx % STORE_COLORS.length] }; });
    return m;
  }, [stores]);

  const [selectedStore, setSelectedStore] = useState(null);
  const validIds = [...visibleStores.map((s) => s.id), ALL_STORES];
  const activeStore = selectedStore && validIds.includes(selectedStore) ? selectedStore : visibleStores[0]?.id || null;
  const isAmbas = activeStore === ALL_STORES;

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [formMode, setFormMode] = useState(null);
  const [formId, setFormId] = useState(null);
  const [fName, setFName] = useState('');
  const [fStore, setFStore] = useState('');
  const [fWeekdays, setFWeekdays] = useState([]);
  const [fMonthN, setFMonthN] = useState('');
  const [popover, setPopover] = useState(null);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [copied, setCopied] = useState(false);
  const [managingStores, setManagingStores] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [editingStore, setEditingStore] = useState(null);
  const [editingStoreName, setEditingStoreName] = useState('');
  const popRef = useRef(null);

  useEffect(() => {
    if (!popover) return;
    const onDown = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setPopover(null); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [popover]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

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
    if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1);
  };

  const handleCellClick = (e, emp, day) => {
    if (!canEdit) return;
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
    setFormMode('add'); setFormId(null); setFName('');
    setFStore(isAmbas ? (visibleStores[0]?.id || '') : activeStore || '');
    setFWeekdays([]); setFMonthN('');
  };

  const openEdit = (emp) => {
    setFormMode('edit'); setFormId(emp.id); setFName(emp.name || '');
    setFStore(emp.store || ''); setFWeekdays(empFolgaWeekdays(emp));
    setFMonthN(emp.folgaMonthN != null ? String(emp.folgaMonthN) : '');
  };

  const toggleFWeekday = (v) =>
    setFWeekdays((prev) => (prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v]));

  const submitForm = () => {
    const name = fName.trim();
    if (!name || !fStore) return;
    const wds = fWeekdays.slice().sort((a, b) => a - b);
    const mn = fMonthN === '' ? null : Number(fMonthN);
    if (formMode === 'edit' && formId) {
      updateEmployee(formId, { name, store: fStore, folgaWeekdays: wds, folgaWeekday: null, folgaMonthN: mn });
    } else {
      addEmployee(name, fStore, user, { folgaWeekdays: wds, folgaMonthN: mn });
    }
    closeForm();
  };

  const holidays = useMemo(() => getNamedHolidays(year), [year]);
  const holidayFor = (d) => holidays[`${pad(month + 1)}-${pad(d)}`];

  const folgaType = typeByKey('folga');
  const nthSundayOfMonth = (d) => {
    let c = 0;
    for (let i = 1; i <= d; i++) if (new Date(year, month, i).getDay() === 0) c++;
    return c;
  };
  const isFolgaDay = (emp, d) => {
    const wd = new Date(year, month, d).getDay();
    if (empFolgaWeekdays(emp).includes(wd)) return true;
    if (emp.folgaMonthN != null && wd === 0 && nthSundayOfMonth(d) === emp.folgaMonthN) return true;
    return false;
  };
  const folgaDesc = (emp) => {
    const p = [];
    const wds = empFolgaWeekdays(emp);
    if (wds.length) p.push(FOLGA_WEEK.filter(([v]) => wds.includes(v)).map(([, n]) => n).join(', '));
    if (emp.folgaMonthN != null) p.push(`${emp.folgaMonthN}º domingo`);
    return p.filter(Boolean).join(' • ');
  };

  const mobileEmp = storeEmployees.find((e) => e.id === selectedEmp) || storeEmployees[0] || null;

  const dayInfo = (emp, d) => {
    const date = `${year}-${pad(month + 1)}-${pad(d)}`;
    const mark = absenceMap[`${emp.id}__${date}`];
    let t = mark ? typeByKey(mark.type) : null;
    if (!t && isFolgaDay(emp, d)) t = folgaType;
    const wd = new Date(year, month, d).getDay();
    return { date, mark, t, wd, weekend: wd === 0 || wd === 6, holiday: holidayFor(d) };
  };

  const monthSummary = useMemo(() => {
    if (!canEdit) return [];
    const toISO = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const absStartISO = toISO(new Date(year, month - 1, 6));
    const absEndISO = toISO(new Date(year, month, 5));
    const inAbsWindow = (iso) => iso >= absStartISO && iso <= absEndISO;
    return storeEmployees.map((emp) => {
      const occAbs = absences.filter((a) => a.employeeId === emp.id && a.date && inAbsWindow(a.date));
      const datesOf = (type) => occAbs.filter((a) => a.type === type).map((a) => a.date).sort();
      const faltaJustDatesISO = datesOf('falta_justificada');
      const faltaNaoJustDatesISO = datesOf('falta_injustificada');
      const feriadoTrab = occAbs.filter((a) => a.type === 'feriado_trabalhado').length;
      const { dias: diasTrab, folgas, faltaJust, faltaNaoJust } = transporteDetalhe(emp, absences, year, month);
      return { id: emp.id, name: emp.name, store: emp.store, faltaJust, faltaNaoJust, faltaJustDatesISO, faltaNaoJustDatesISO, feriadoTrab, folgas, diasTrab };
    });
  }, [canEdit, storeEmployees, absences, year, month]);

  const summaryTotals = useMemo(
    () => monthSummary.reduce((t, r) => ({
      faltaJust: t.faltaJust + r.faltaJust,
      faltaNaoJust: t.faltaNaoJust + r.faltaNaoJust,
      feriadoTrab: t.feriadoTrab + r.feriadoTrab,
      folgas: t.folgas + r.folgas,
      diasTrab: t.diasTrab + r.diasTrab,
    }), { faltaJust: 0, faltaNaoJust: 0, feriadoTrab: 0, folgas: 0, diasTrab: 0 }),
    [monthSummary]
  );

  const copySummary = () => {
    const dm = (iso) => { const [, mm, dd] = iso.split('-'); return `${dd}/${mm}`; };
    const fmtRanges = (isoDates) => {
      if (!isoDates.length) return '';
      const sorted = [...isoDates].sort();
      const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
      const groups = [];
      let start = sorted[0], prev = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        if (dayDiff(prev, sorted[i]) === 1) { prev = sorted[i]; }
        else { groups.push([start, prev]); start = prev = sorted[i]; }
      }
      groups.push([start, prev]);
      return groups.map(([a, b]) => (a === b ? dm(a) : `${dm(a)} a ${dm(b)}`)).join(', ');
    };
    const section = (title, entries) => {
      if (!entries.length) return null;
      const w = Math.max(...entries.map((e) => e.name.length));
      return [`-${title}`, ...entries.map((e) => `${e.name.padEnd(w)}  - ${fmtRanges(e.dates)}`)].join('\n');
    };
    const order = [];
    const byStore = {};
    monthSummary.forEach((r) => {
      if (!byStore[r.store]) { byStore[r.store] = { name: storeMeta[r.store]?.name || '', naoJust: [], just: [] }; order.push(r.store); }
      if (r.faltaNaoJustDatesISO.length) byStore[r.store].naoJust.push({ name: r.name, dates: r.faltaNaoJustDatesISO });
      if (r.faltaJustDatesISO.length) byStore[r.store].just.push({ name: r.name, dates: r.faltaJustDatesISO });
    });
    const blocks = order.map((store) => {
      const g = byStore[store];
      const secs = [section('Falta Não Justificada', g.naoJust), section('Falta Justificada', g.just)].filter(Boolean);
      return secs.length ? `*${g.name}*\n${secs.join('\n\n')}` : '';
    }).filter(Boolean);
    const text = blocks.join('\n\n');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});
    }
  };

  const activeStoreObj = stores.find((s) => s.id === activeStore);
  const mmAtual = pad(month + 1);
  const mmSeg = pad(((month + 1) % 12) + 1);
  const mmAnt = pad(((month + 11) % 12) + 1);

  const sectionTabs = (
    <div className={styles.sectionTabs}>
      <button
        className={`${styles.sectionTab} ${effectiveSection === 'escala' ? styles.sectionTabActive : ''}`}
        onClick={() => setDpSection('escala')}
      >Escala</button>
      {canSalarios && (
        <button
          className={`${styles.sectionTab} ${effectiveSection === 'salarios' ? styles.sectionTabActive : ''}`}
          onClick={() => setDpSection('salarios')}
        >Salários</button>
      )}
    </div>
  );

  return (
    <div className={styles.root}>
      {/* Cabeçalho editorial */}
      <div className={styles.hero}>
        <div className={styles.heroLeft}>
          <span className={styles.kicker}>Dáme &amp; Lov · Escala</span>
          <h2 className={styles.title}>Departamento <em>Pessoal</em></h2>
          <p className={styles.subtitle}>
            Escala de faltas, folgas e feriados trabalhados — e o transporte a pagar do ciclo.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
          <span className={styles.seal}><span className={styles.sealDot} /> Visual V2 · Clean</span>
          {sectionTabs}
        </div>
      </div>

      {effectiveSection === 'salarios' && (
        <div style={{ padding: '18px 22px' }}>
          <SalariosView
            visibleStores={visibleStores}
            storeMeta={storeMeta}
            employees={employees}
            absences={absences}
            salarios={salarios}
            setSalario={setSalario}
            updateEmployee={updateEmployee}
            isAdmin={isAdmin}
          />
        </div>
      )}

      {effectiveSection === 'escala' && (<>
        {/* Barra de controle: lojas + navegação de mês + ação */}
        <div className={styles.controlBar}>
          <div className={styles.storeChips}>
            {visibleStores.map((s) => {
              const color = storeMeta[s.id]?.color || 'var(--v2-accent)';
              const active = s.id === activeStore;
              return (
                <button
                  key={s.id}
                  className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                  onClick={() => setSelectedStore(s.id)}
                >
                  <span className={styles.chipDot} style={{ background: active ? '#fff' : color }} />
                  {s.name}
                </button>
              );
            })}
            {visibleStores.length > 1 && (
              <button
                className={`${styles.chip} ${isAmbas ? styles.chipActive : ''}`}
                onClick={() => setSelectedStore(ALL_STORES)}
              >Ambas</button>
            )}
            {canEdit && (
              <button className={styles.manageBtn} onClick={() => setManagingStores((v) => !v)} title="Gerenciar lojas">
                {managingStores ? 'Fechar' : '⚙ Lojas'}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div className={styles.monthNav}>
              <button className={styles.monthArrow} onClick={prevMonth} aria-label="Mês anterior">‹</button>
              <span className={styles.monthLabel}>{MONTHS[month]} <span>{year}</span></span>
              <button className={styles.monthArrow} onClick={nextMonth} aria-label="Próximo mês">›</button>
            </div>
            {canEdit && (activeStore || isAmbas) && visibleStores.length > 0 && (
              <button className={styles.btn} onClick={openAdd}>
                {formMode === 'add' ? 'Cancelar' : '+ Funcionário'}
              </button>
            )}
          </div>
        </div>

        {managingStores && canEdit && (
          <div className={styles.panel}>
            <p className={styles.panelTitle}>Lojas</p>
            <div className={styles.manageList}>
              {stores.map((s) => (
                <div key={s.id} className={styles.manageRow}>
                  {editingStore === s.id ? (
                    <>
                      <input
                        className={styles.input}
                        style={{ flex: 1 }}
                        value={editingStoreName}
                        autoFocus
                        onChange={(e) => setEditingStoreName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { renameStore(s.id, editingStoreName); setEditingStore(null); } }}
                      />
                      <button className={styles.btn} onClick={() => { renameStore(s.id, editingStoreName); setEditingStore(null); }}>Salvar</button>
                      <button className={styles.btnGhost} onClick={() => setEditingStore(null)}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <span className={styles.manageName}>{s.name}</span>
                      <button className={styles.btnGhost} onClick={() => { setEditingStore(s.id); setEditingStoreName(s.name); }}>Renomear</button>
                      <button
                        className={styles.btnDanger}
                        onClick={() => { if (window.confirm(`Remover a loja "${s.name}"? Os funcionários dela deixam de aparecer.`)) deleteStore(s.id); }}
                      >Remover</button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className={styles.addStoreRow}>
              <input
                className={styles.input}
                style={{ flex: 1 }}
                placeholder="Nova loja..."
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && newStoreName.trim()) { addStore(newStoreName); setNewStoreName(''); } }}
              />
              <button className={styles.btn} onClick={() => { if (newStoreName.trim()) { addStore(newStoreName); setNewStoreName(''); } }}>+ Adicionar loja</button>
            </div>
          </div>
        )}

        {formMode && canEdit && (
          <div className={styles.panel}>
            <p className={styles.panelTitle}>{formMode === 'add' ? 'Novo funcionário' : 'Editar funcionário'}</p>
            <div className={styles.formGrid}>
              <label className={styles.field} style={{ flex: '1 1 200px' }}>
                Nome
                <input
                  className={styles.input}
                  placeholder="Nome do funcionário"
                  value={fName}
                  autoFocus
                  onChange={(e) => setFName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitForm()}
                />
              </label>
              <label className={styles.field}>
                Loja
                <select className={styles.select} value={fStore} onChange={(e) => setFStore(e.target.value)}>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                Folgas da semana
                <div className={styles.dayToggles}>
                  {FOLGA_WEEK.map(([v, n]) => (
                    <button
                      type="button"
                      key={v}
                      className={`${styles.dayToggle} ${fWeekdays.includes(v) ? styles.dayToggleOn : ''}`}
                      onClick={() => toggleFWeekday(v)}
                    >{n.slice(0, 3)}</button>
                  ))}
                </div>
              </label>
              <label className={styles.field}>
                Folga do mês
                <select className={styles.select} value={fMonthN} onChange={(e) => setFMonthN(e.target.value)}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}º domingo</option>)}
                </select>
              </label>
              <button className={styles.btn} onClick={submitForm}>{formMode === 'add' ? 'Adicionar' : 'Salvar'}</button>
              <button className={styles.btnGhost} onClick={closeForm}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Grade / estados */}
        {loadingStores ? (
          <p className={styles.empty}>Carregando a escala…</p>
        ) : stores.length === 0 ? (
          <div className={styles.empty}>
            <p>Nenhuma loja cadastrada ainda.</p>
            {canEdit && <button className={styles.btn} onClick={() => seedDefaultStores()}>Criar minhas duas lojas (Dáme e Lov)</button>}
            {storesError && <p className={styles.errorMsg}>Erro ao acessar o banco: {storesError}.</p>}
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
            <div className={styles.mSelectRow}>
              <span className={styles.mSelectLabel}>Funcionário</span>
              <select
                className={styles.select}
                style={{ flex: 1 }}
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
                <div key={emp.id} className={styles.mCard}>
                  <div className={styles.mCardHead}>
                    <span className={styles.empNameWrap}>
                      {isAmbas && (
                        <span className={styles.storeTag} style={{ background: storeMeta[emp.store]?.color }} title={storeMeta[emp.store]?.name}>
                          {(storeMeta[emp.store]?.name || '?').slice(0, 1)}
                        </span>
                      )}
                      <span className={styles.empName} title={emp.name}>{emp.name}</span>
                      {folgaDesc(emp) && <span className={styles.folgaTag} title={`Folga: ${folgaDesc(emp)}`}>FG</span>}
                    </span>
                    {canEdit && (
                      <span className={`${styles.rowActions} ${styles.rowActionsVisible}`}>
                        <button className={styles.iconBtn} onClick={() => openEdit(emp)} title="Editar">✎</button>
                        <button
                          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                          onClick={() => { if (window.confirm(`Apagar o funcionário "${emp.name}"? Remove o funcionário e suas faltas.`)) deleteEmployee(emp.id); }}
                          title="Apagar"
                        >🗑</button>
                      </span>
                    )}
                  </div>
                  <div className={styles.mCalGrid}>
                    {WEEKDAYS.map((w, i) => <span key={`h${i}`} className={styles.mWeekday}>{w}</span>)}
                    {Array.from({ length: firstDow }).map((_, i) => <span key={`b${i}`} className={styles.mDayEmpty} />)}
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
          <div className={styles.gridCard}>
            <div className={styles.gridScroll}>
              <table className={styles.grid}>
                <thead>
                  <tr>
                    <th className={styles.cornerCell}>Funcionário</th>
                    {days.map((d) => {
                      const wd = new Date(year, month, d).getDay();
                      const weekend = wd === 0 || wd === 6;
                      const hol = holidayFor(d);
                      return (
                        <th key={d} className={`${styles.dayHead} ${weekend ? styles.weekendHead : ''} ${hol ? styles.holidayHead : ''}`} title={hol || ''}>
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
                      <td className={styles.nameCell}>
                        <div className={styles.nameWrap}>
                          <span className={styles.empNameWrap}>
                            {isAmbas && (
                              <span className={styles.storeTag} style={{ background: storeMeta[emp.store]?.color }} title={storeMeta[emp.store]?.name}>
                                {(storeMeta[emp.store]?.name || '?').slice(0, 1)}
                              </span>
                            )}
                            <span className={styles.empName} title={emp.name}>{emp.name}</span>
                            {folgaDesc(emp) && <span className={styles.folgaTag} title={`Folga: ${folgaDesc(emp)}`}>FG</span>}
                          </span>
                          {canEdit && (
                            <span className={styles.rowActions}>
                              <button className={styles.iconBtn} onClick={() => openEdit(emp)} title="Editar">✎</button>
                              <button
                                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                onClick={() => { if (window.confirm(`Apagar o funcionário "${emp.name}"? Remove o funcionário e suas faltas.`)) deleteEmployee(emp.id); }}
                                title="Apagar"
                              >🗑</button>
                            </span>
                          )}
                        </div>
                      </td>
                      {days.map((d) => {
                        const info = dayInfo(emp, d);
                        return (
                          <td
                            key={d}
                            className={`${styles.cell} ${info.weekend ? styles.cellWeekend : ''} ${info.holiday ? styles.cellHoliday : ''}`}
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
            <span className={`${styles.legendDot} ${styles.legendHoliday}`} />
            Feriado
          </span>
        </div>

        {/* Resumo do mês (editores) */}
        {canEdit && monthSummary.length > 0 && (
          <div className={styles.summary}>
            <div className={styles.statRow}>
              <div className={styles.statCard}><div className={styles.statValue}>{summaryTotals.folgas}</div><div className={styles.statLabel}>Folgas</div></div>
              <div className={styles.statCard}><div className={styles.statValue}>{summaryTotals.faltaJust}</div><div className={styles.statLabel}>Falta Just.</div></div>
              <div className={styles.statCard}><div className={styles.statValue}>{summaryTotals.faltaNaoJust}</div><div className={styles.statLabel}>Falta N/Just.</div></div>
              <div className={styles.statCard}><div className={styles.statValue}>{summaryTotals.feriadoTrab}</div><div className={styles.statLabel}>Feriado Trab.</div></div>
              <div className={`${styles.statCard} ${styles.statAccent}`}><div className={styles.statValue}>{summaryTotals.diasTrab}</div><div className={styles.statLabel}>Transporte a pagar</div></div>
            </div>

            <div className={styles.summaryHead}>
              <h3>Resumo — {MONTHS[month]} {year}{isAmbas ? ' · todas as lojas' : activeStoreObj ? ` · ${activeStoreObj.name}` : ''}</h3>
              <button className={styles.btnGhost} onClick={copySummary}>{copied ? 'Copiado!' : 'Copiar tabela'}</button>
            </div>
            <p className={styles.summaryNote}>
              <strong>Transporte a pagar</strong> de {MONTHS[month]} (pago em 05/{mmSeg}) = dias − folgas − faltas.
              Dias corridos e folgas contam de 06/{mmAtual} a 05/{mmSeg} (ciclo a pagar);
              faltas e feriados do ciclo anterior já apurado, de 06/{mmAnt} a 05/{mmAtual}.
            </p>
            <div className={styles.summaryCard}>
              <div className={styles.summaryScroll}>
                <table className={styles.summaryTable}>
                  <thead>
                    <tr>
                      {isAmbas && <th className={styles.summaryNameCol}>Loja</th>}
                      <th className={styles.summaryNameCol}>Funcionário</th>
                      <th>Falta Just.</th>
                      <th>Falta Não Just.</th>
                      <th>Feriado Trab.</th>
                      <th>Folgas</th>
                      <th>Transporte<span className={styles.colPeriod}>ciclo 06/{mmAtual} a 05/{mmSeg}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthSummary.map((r) => (
                      <tr key={r.id}>
                        {isAmbas && <td className={styles.summaryNameCol}>{storeMeta[r.store]?.name || ''}</td>}
                        <td className={styles.summaryNameCol}>{r.name}</td>
                        <td>{r.faltaJust}</td>
                        <td>{r.faltaNaoJust}</td>
                        <td>{r.feriadoTrab}</td>
                        <td>{r.folgas}</td>
                        <td className={styles.transportCell}>{r.diasTrab}</td>
                      </tr>
                    ))}
                    <tr className={styles.summaryTotalRow}>
                      {isAmbas && <td />}
                      <td className={styles.summaryNameCol}>Total</td>
                      <td>{summaryTotals.faltaJust}</td>
                      <td>{summaryTotals.faltaNaoJust}</td>
                      <td>{summaryTotals.feriadoTrab}</td>
                      <td>{summaryTotals.folgas}</td>
                      <td className={styles.transportCell}>{summaryTotals.diasTrab}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Popover de tipo */}
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
      </>)}
    </div>
  );
}
