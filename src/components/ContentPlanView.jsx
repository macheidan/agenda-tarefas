import { useState, useRef, useCallback, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useAuth } from '../contexts/AuthContext';
import ContentPlanModal from './ContentPlanModal';
import styles from '../styles/ContentPlanView.module.css';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const STORE_LABEL = { lov: 'LOV', dame: 'DAME' };
const TYPE_LABEL = { story: 'Story', reel: 'Reels' };

function formatWeekTitle(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  e.setDate(e.getDate() - 1);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(s.getDate())}/${pad(s.getMonth() + 1)} - ${pad(e.getDate())}/${pad(e.getMonth() + 1)}`;
}

function formatMonthTitle(date) {
  const d = new Date(date);
  return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatDayTitle(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return `${WEEKDAYS[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const stripHtml = (html) => (html || '').replace(/<[^>]+>/g, '').trim();

const eventTitleFor = (it) => {
  const prefix = `${STORE_LABEL[it.store] || it.store} ▪ ${TYPE_LABEL[it.type] || it.type}`;
  const headline = it.title?.trim() || stripHtml(it.content) || '(sem conteúdo)';
  return `${prefix} — ${headline}`;
};

export default function ContentPlanView({ items, addItem, updateItem, deleteItem }) {
  const { user } = useAuth();
  const calRef = useRef(null);
  const [currentView, setCurrentView] = useState(
    () => localStorage.getItem('contentPlanView') || 'dayGridMonth'
  );
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState(null);

  const updateTitle = useCallback((api) => {
    const view = api.view;
    if (view.type === 'dayGridDay') setTitle(formatDayTitle(view.activeStart));
    else if (view.type === 'dayGridWeek') setTitle(formatWeekTitle(view.activeStart, view.activeEnd));
    else setTitle(formatMonthTitle(view.currentStart));
  }, []);

  const handleDatesSet = useCallback((info) => {
    setCurrentView(info.view.type);
    if (info.view.type === 'dayGridDay') setTitle(formatDayTitle(info.view.activeStart));
    else if (info.view.type === 'dayGridWeek') setTitle(formatWeekTitle(info.view.activeStart, info.view.activeEnd));
    else setTitle(formatMonthTitle(info.view.currentStart));
  }, []);

  const handlePrev = () => {
    const api = calRef.current?.getApi();
    if (api) { api.prev(); updateTitle(api); }
  };

  const handleNext = () => {
    const api = calRef.current?.getApi();
    if (api) { api.next(); updateTitle(api); }
  };

  const handleToday = () => {
    const api = calRef.current?.getApi();
    if (api) { api.today(); updateTitle(api); }
  };

  const changeView = (next) => {
    const api = calRef.current?.getApi();
    if (!api || currentView === next) return;
    api.changeView(next);
    setCurrentView(next);
    localStorage.setItem('contentPlanView', next);
    updateTitle(api);
  };

  const events = items.map((it) => ({
    id: it.id,
    title: eventTitleFor(it),
    start: it.dateKey,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    classNames: [`fc-event--cp-${it.status || 'pending'}`, `fc-event--cp-store-${it.store}`],
    extendedProps: { item: it },
  }));

  const hotDates = useMemo(() => {
    const set = new Set();
    for (const it of items) {
      if (it.hot) set.add(it.dateKey);
    }
    return set;
  }, [items]);

  const localDateKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const openCellNew = (dateStr) => {
    setEditing({
      id: null,
      dateKey: dateStr,
      store: 'lov',
      type: 'story',
      title: '',
      content: '',
      status: 'pending',
      hot: hotDates.has(dateStr),
    });
  };

  const openEdit = (item) => {
    setEditing({
      id: item.id,
      dateKey: item.dateKey,
      store: item.store,
      type: item.type,
      title: item.title || '',
      content: item.content || '',
      status: item.status || 'pending',
      hot: !!item.hot,
    });
  };

  const handleSave = async ({ title, store, type, content, status, dateKey, hot }) => {
    const trimmed = (content || '').trim();
    const trimmedTitle = (title || '').trim();
    const hasContent = trimmedTitle || stripHtml(trimmed);
    const finalDateKey = dateKey || editing.dateKey;
    if (editing.id) {
      if (!hasContent) {
        await deleteItem(editing.id);
      } else {
        await updateItem(editing.id, { title: trimmedTitle, store, type, content: trimmed, status, dateKey: finalDateKey, hot: !!hot });
      }
    } else if (hasContent) {
      await addItem({ dateKey: finalDateKey, store, type, title: trimmedTitle, content: trimmed, status, hot: !!hot }, user);
    }
    setEditing(null);
  };

  return (
    <div className={`${styles.container} ${currentView === 'dayGridWeek' ? styles.weekView : ''} ${currentView === 'dayGridDay' ? styles.dayView : ''}`}>
      <div className={styles.toolbar}>
        <span className={styles.titleText}>{title}</span>
        <div className={styles.toolbarRight}>
          <button className={styles.navBtn} onClick={handlePrev}>‹</button>
          <button className={styles.navBtn} onClick={handleNext}>›</button>
          <button className={`${styles.viewBtn} ${currentView === 'dayGridDay' ? styles.viewBtnActive : ''}`} onClick={() => changeView('dayGridDay')}>Dia</button>
          <button className={`${styles.viewBtn} ${currentView === 'dayGridWeek' ? styles.viewBtnActive : ''}`} onClick={() => changeView('dayGridWeek')}>Semana</button>
          <button className={`${styles.viewBtn} ${currentView === 'dayGridMonth' ? styles.viewBtnActive : ''}`} onClick={() => changeView('dayGridMonth')}>Mês</button>
          <button className={styles.todayBtn} onClick={handleToday}>Hoje</button>
        </div>
      </div>

      <div className={styles.legend}>
        <span><span className={`${styles.legendDot} ${styles.statusPending}`} /> Aguardando</span>
        <span><span className={`${styles.legendDot} ${styles.statusChanges}`} /> Alteração 1</span>
        <span><span className={`${styles.legendDot} ${styles.statusRevised}`} /> Revisado</span>
        <span><span className={`${styles.legendDot} ${styles.statusChanges2}`} /> Alteração 2</span>
        <span><span className={`${styles.legendDot} ${styles.statusApproved}`} /> Aprovado</span>
      </div>

      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView={currentView}
        locale="pt-br"
        headerToolbar={false}
        datesSet={handleDatesSet}
        events={events}
        dayCellClassNames={(arg) => (hotDates.has(localDateKey(arg.date)) ? ['cp-hot-day'] : [])}
        dateClick={(info) => openCellNew(info.dateStr)}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          openEdit(info.event.extendedProps.item);
        }}
        height="auto"
        contentHeight="auto"
        dayMaxEvents={false}
        fixedWeekCount={false}
      />

      {editing && (
        <ContentPlanModal
          editing={editing}
          onSave={handleSave}
          onUpdate={updateItem}
          onClose={() => setEditing(null)}
          onDelete={editing.id ? () => { deleteItem(editing.id); setEditing(null); } : null}
        />
      )}
    </div>
  );
}
