import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../hooks/useSettings';
import { useIsMobile } from '../hooks/useIsMobile';
import { getNamedHolidays } from '../utils/holidays';
import { useDepartamentoPessoal, ABSENCE_TYPES } from '../hooks/useDepartamentoPessoal';
import { transporteDetalhe, empFolgaWeekdays } from '../utils/transporte';
import SalariosView from './SalariosView';
import styles from '../styles/DepartamentoPessoalView.module.css';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const STORE_COLORS = ['#465fff', '#ff9800', '#12b76a', '#9c27b0', '#f04438', '#3949ab'];
const ALL_STORES = '__all__';
// Folga semanal: qualquer dia da semana (getDay: 0=Domingo ... 6=Sábado).
const FOLGA_WEEK = [[1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta'], [5, 'Sexta'], [6, 'Sábado'], [0, 'Domingo']];
const FOLGA_WEEK_NAME = { 0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado' };

// empFolgaWeekdays vem de utils/transporte (fonte única, usada também por Salários).

const pad = (n) => String(n).padStart(2, '0');
const typeByKey = (key) => ABSENCE_TYPES.find((t) => t.key === key);

export default function DepartamentoPessoalView() {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings(user.uid);
  const isMobile = useIsMobile(768);
  // Editores (e o admin) gerenciam lojas/funcionários. Qualquer usuário com a
  // seção visível pode trabalhar no calendário (marcar todos os tipos).
  const canEdit = isAdmin || settings?.dpEditor === true;
  // Salários é dado sensível: só admin ou quem o admin liberou (dpSalariosVisible).
  const canSalarios = isAdmin || settings?.dpSalariosVisible === true;
  const [dpSection, setDpSection] = useState('escala'); // escala | funcionarios | salarios
  const {
    stores,
    loadingStores,
    storesError,
    seedDefaultStores,
    employees,
    absences,
    salarios,
    setSalario,
    addStore,
    renameStore,
    deleteStore,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    setAbsence,
  } = useDepartamentoPessoal();

  // Sem acesso a Salários, a seção efetiva é sempre a Escala (fallback em render).
  // 'funcionarios' foi fundido em 'salarios' — normaliza legado.
  const effectiveSection = canSalarios ? (dpSection === 'escala' ? 'escala' : 'salarios') : 'escala';

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
  const [fWeekdays, setFWeekdays] = useState([]); // dias fixos de folga (0=Dom..6=Sáb)
  const [fMonthN, setFMonthN] = useState(''); // '' | 1..5 (domingo do mês)
  const [popover, setPopover] = useState(null);
  const [selectedEmp, setSelectedEmp] = useState(null); // funcionário escolhido no mobile
  const [copied, setCopied] = useState(false);
  const [managingStores, setManagingStores] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [editingStore, setEditingStore] = useState(null);
  const [editingStoreName, setEditingStoreName] = useState('');
  const popRef = useRef(null);

  useEffect(() => {
    if (!popover) return;
    // Ignora os eventos do próprio toque que abriu o popover: alguns browsers
    // mobile (webviews in-app, Android WebView) emitem mousedown/pointerdown
    // "fantasma" logo após o click, fechando o menu no mesmo toque — dava a
    // impressão de que o menu não abria.
    const openedAt = Date.now();
    const onDown = (e) => {
      if (Date.now() - openedAt < 350) return;
      if (popRef.current && !popRef.current.contains(e.target)) setPopover(null);
    };
    // pointerdown cobre mouse + touch; mousedown como fallback p/ browsers antigos.
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('mousedown', onDown);
    };
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
    if (!canEdit) return; // só editores/admin marcam faltas
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
    setFWeekdays([]);
    setFMonthN('');
  };

  const openEdit = (emp) => {
    setFormMode('edit');
    setFormId(emp.id);
    setFName(emp.name || '');
    setFStore(emp.store || '');
    setFWeekdays(empFolgaWeekdays(emp));
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
      // Zera o campo antigo (1 dia) pra nao conflitar com o novo array.
      updateEmployee(formId, { name, store: fStore, folgaWeekdays: wds, folgaWeekday: null, folgaMonthN: mn });
    } else {
      addEmployee(name, fStore, user, { folgaWeekdays: wds, folgaMonthN: mn });
    }
    closeForm();
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

  // Resumo do mês (só para editores). Transporte a Pagar mistura DOIS ciclos:
  //  • dias corridos + folgas → ciclo a pagar: 06 do mês exibido → 05 do seguinte
  //    (adiantado no fechamento do dia do pagamento).
  //  • faltas + feriado trabalhado → ciclo anterior já apurado: 06 do mês
  //    anterior → 05 do mês exibido (ocorrências que só se conhecem depois).
  // Transporte a Pagar = dias − folgas − faltas.
  const monthSummary = useMemo(() => {
    if (!canEdit) return [];
    const toISO = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const absStartISO = toISO(new Date(year, month - 1, 6));
    const absEndISO = toISO(new Date(year, month, 5));
    // Datas ISO (YYYY-MM-DD) comparam cronologicamente como string.
    const inAbsWindow = (iso) => iso >= absStartISO && iso <= absEndISO;
    return storeEmployees.map((emp) => {
      // Faltas e feriado trabalhado: ciclo anterior já apurado (06 mês anterior → 05 mês atual).
      const occAbs = absences.filter(
        (a) => a.employeeId === emp.id && a.date && inAbsWindow(a.date)
      );
      const datesOf = (type) =>
        occAbs.filter((a) => a.type === type).map((a) => a.date).sort();
      const faltaJustDatesISO = datesOf('falta_justificada');
      const faltaNaoJustDatesISO = datesOf('falta_injustificada');
      const feriadoTrab = occAbs.filter((a) => a.type === 'feriado_trabalhado').length;
      // Folgas (ciclo a pagar) e dias de transporte vêm do helper compartilhado.
      const { dias: diasTrab, folgas, faltaJust, faltaNaoJust } =
        transporteDetalhe(emp, absences, year, month);
      return { id: emp.id, name: emp.name, store: emp.store, faltaJust, faltaNaoJust, faltaJustDatesISO, faltaNaoJustDatesISO, feriadoTrab, folgas, diasTrab };
    });
  }, [canEdit, storeEmployees, absences, year, month]);

  const summaryTotals = useMemo(
    () =>
      monthSummary.reduce(
        (t, r) => ({
          faltaJust: t.faltaJust + r.faltaJust,
          faltaNaoJust: t.faltaNaoJust + r.faltaNaoJust,
          feriadoTrab: t.feriadoTrab + r.feriadoTrab,
          folgas: t.folgas + r.folgas,
          diasTrab: t.diasTrab + r.diasTrab,
        }),
        { faltaJust: 0, faltaNaoJust: 0, feriadoTrab: 0, folgas: 0, diasTrab: 0 }
      ),
    [monthSummary]
  );

  const copySummary = () => {
    // Formato agrupado: *Loja* → -Falta (com linha em branco entre seções) → só quem tem falta.
    // Datas dd/mm; dias seguidos viram "dd/mm a dd/mm". Nomes alinhados por seção.
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
    // agrupa por loja preservando a ordem de aparição
    const order = [];
    const byStore = {};
    monthSummary.forEach((r) => {
      if (!byStore[r.store]) { byStore[r.store] = { name: storeMeta[r.store]?.name || '', naoJust: [], just: [] }; order.push(r.store); }
      if (r.faltaNaoJustDatesISO.length) byStore[r.store].naoJust.push({ name: r.name, dates: r.faltaNaoJustDatesISO });
      if (r.faltaJustDatesISO.length) byStore[r.store].just.push({ name: r.name, dates: r.faltaJustDatesISO });
    });
    const blocks = order
      .map((store) => {
        const g = byStore[store];
        const secs = [
          section('Falta Não Justificada', g.naoJust),
          section('Falta Justificada', g.just),
        ].filter(Boolean);
        return secs.length ? `*${g.name}*\n${secs.join('\n\n')}` : '';
      })
      .filter(Boolean);
    const text = blocks.join('\n\n');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
        () => {}
      );
    }
  };

  const activeStoreObj = stores.find((s) => s.id === activeStore);
  // Rótulos de mês (MM) para a nota do resumo: anterior, atual e seguinte.
  const mmAtual = pad(month + 1);
  const mmSeg = pad(((month + 1) % 12) + 1);
  const mmAnt = pad(((month + 11) % 12) + 1);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>👥 Departamento Pessoal</h2>
        <div className={styles.headerActions}>
          <button
            className={`${styles.sectionTab} ${effectiveSection === 'escala' ? styles.sectionTabActive : ''}`}
            onClick={() => setDpSection('escala')}
          >
            Escala
          </button>
          {canSalarios && (
            <button
              className={`${styles.sectionTab} ${effectiveSection === 'salarios' ? styles.sectionTabActive : ''}`}
              onClick={() => setDpSection('salarios')}
            >
              Salários
            </button>
          )}
        </div>
      </div>

      {effectiveSection === 'salarios' && (
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
      )}

      {effectiveSection === 'escala' && (<>
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
              Folgas da semana
              <div className={styles.folgaDaysRow}>
                {FOLGA_WEEK.map(([v, n]) => (
                  <button
                    type="button"
                    key={v}
                    className={fWeekdays.includes(v) ? `${styles.folgaDay} ${styles.folgaDayOn}` : styles.folgaDay}
                    onClick={() => toggleFWeekday(v)}
                  >{n.slice(0, 3)}</button>
                ))}
              </div>
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

      {/* Resumo do mês (somente editores) */}
      {canEdit && monthSummary.length > 0 && (
        <div className={styles.summary}>
          <div className={styles.summaryHead}>
            <h3>Resumo — {MONTHS[month]} {year}{isAmbas ? ' (todas as lojas)' : activeStoreObj ? ` — ${activeStoreObj.name}` : ''}</h3>
            <button className={styles.smallBtn} onClick={copySummary}>
              {copied ? 'Copiado!' : 'Copiar tabela'}
            </button>
          </div>
          <p className={styles.summaryNote}>
            <strong>Transporte a pagar</strong> de {MONTHS[month]} (pago em 05/{mmSeg}) = dias − folgas − faltas.
            Dias corridos e folgas contam de 06/{mmAtual} a 05/{mmSeg} (ciclo a pagar);
            faltas e feriados do ciclo anterior já apurado, de 06/{mmAnt} a 05/{mmAtual}.
          </p>
          <div className={styles.summaryWrap}>
            <table className={styles.summaryTable}>
              <thead>
                <tr>
                  {isAmbas && <th>Loja</th>}
                  <th className={styles.summaryNameCol}>Funcionário</th>
                  <th>Falta Just.</th>
                  <th>Falta Não Just.</th>
                  <th>Feriado Trab.</th>
                  <th>Folgas</th>
                  <th>
                    Transporte a Pagar
                    <span className={styles.colPeriod}>ciclo 06/{mmAtual} a 05/{mmSeg}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {monthSummary.map((r) => (
                  <tr key={r.id}>
                    {isAmbas && <td>{storeMeta[r.store]?.name || ''}</td>}
                    <td className={styles.summaryNameCol}>{r.name}</td>
                    <td>{r.faltaJust}</td>
                    <td>{r.faltaNaoJust}</td>
                    <td>{r.feriadoTrab}</td>
                    <td>{r.folgas}</td>
                    <td>{r.diasTrab}</td>
                  </tr>
                ))}
                <tr className={styles.summaryTotalRow}>
                  {isAmbas && <td />}
                  <td className={styles.summaryNameCol}>Total</td>
                  <td>{summaryTotals.faltaJust}</td>
                  <td>{summaryTotals.faltaNaoJust}</td>
                  <td>{summaryTotals.feriadoTrab}</td>
                  <td>{summaryTotals.folgas}</td>
                  <td>{summaryTotals.diasTrab}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

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
      </>)}
    </div>
  );
}
