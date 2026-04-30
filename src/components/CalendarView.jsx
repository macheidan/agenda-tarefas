import { useState, useRef, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import styles from '../styles/CalendarView.module.css';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

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

export default function CalendarView({ tasks, onDateClick, onTaskClick }) {
  const today = new Date().toISOString().split('T')[0];
  const calRef = useRef(null);
  const [currentView, setCurrentView] = useState(
    () => localStorage.getItem('calendarView') || 'dayGridWeek'
  );
  const [title, setTitle] = useState('');

  const updateTitle = useCallback((api) => {
    const view = api.view;
    if (view.type === 'dayGridDay') {
      setTitle(formatDayTitle(view.activeStart));
    } else if (view.type === 'dayGridWeek') {
      setTitle(formatWeekTitle(view.activeStart, view.activeEnd));
    } else {
      setTitle(formatMonthTitle(view.currentStart));
    }
  }, []);

  const handleDatesSet = useCallback((info) => {
    setCurrentView(info.view.type);
    if (info.view.type === 'dayGridDay') {
      setTitle(formatDayTitle(info.view.activeStart));
    } else if (info.view.type === 'dayGridWeek') {
      setTitle(formatWeekTitle(info.view.activeStart, info.view.activeEnd));
    } else {
      setTitle(formatMonthTitle(info.view.currentStart));
    }
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
    localStorage.setItem('calendarView', next);
    updateTitle(api);
  };

  const events = tasks.map((task) => {
    const isOverdue =
      task.status !== 'done' && task.finishDate && task.finishDate < today;

    let backgroundColor = 'transparent';
    let textColor = undefined;
    let classNames = [];

    if (isOverdue) {
      backgroundColor = 'rgba(235, 87, 87, 0.12)';
      textColor = '#eb5757';
      classNames = ['fc-event--overdue'];
    } else if (task.status === 'done') {
      backgroundColor = 'rgba(76, 175, 80, 0.12)';
      textColor = '#2e7d32';
      classNames = ['fc-event--done'];
    } else if (task.status === 'in_progress') {
      backgroundColor = 'rgba(35, 131, 226, 0.14)';
      textColor = '#2383e2';
      classNames = ['fc-event--in-progress'];
    } else if (task.status === 'complete_notify') {
      backgroundColor = 'rgba(255, 152, 0, 0.14)';
      textColor = '#e68900';
      classNames = ['fc-event--complete-notify'];
    }

    if (!classNames.length && task.status === 'not_started') {
      backgroundColor = '#f4f4f4';
      classNames = ['fc-event--not-started'];
    }

    const event = {
      id: task.id,
      title: task.title,
      start: task.date,
      allDay: true,
      backgroundColor,
      borderColor: 'transparent',
      textColor,
      classNames,
      extendedProps: { task },
    };

    if (task.finishDate && task.finishDate > task.date) {
      const endDate = new Date(task.finishDate + 'T12:00:00');
      endDate.setDate(endDate.getDate() + 1);
      event.end = endDate.toISOString().split('T')[0];
      event.display = 'block';
    }

    return event;
  });

  return (
    <div className={`${styles.container} ${currentView === 'dayGridWeek' ? styles.weekView : ''} ${currentView === 'dayGridDay' ? styles.dayView : ''}`}>
      <div className={styles.toolbar}>
        <span className={styles.titleText}>{title}</span>
        <div className={styles.toolbarRight}>
          <button className={styles.navBtn} onClick={handlePrev}>‹</button>
          <button className={styles.navBtn} onClick={handleNext}>›</button>
          <button
            className={`${styles.viewBtn} ${currentView === 'dayGridDay' ? styles.viewBtnActive : ''}`}
            onClick={() => changeView('dayGridDay')}
          >
            Dia
          </button>
          <button
            className={`${styles.viewBtn} ${currentView === 'dayGridWeek' ? styles.viewBtnActive : ''}`}
            onClick={() => changeView('dayGridWeek')}
          >
            Semana
          </button>
          <button
            className={`${styles.viewBtn} ${currentView === 'dayGridMonth' ? styles.viewBtnActive : ''}`}
            onClick={() => changeView('dayGridMonth')}
          >
            Mês
          </button>
          <button className={styles.todayBtn} onClick={handleToday}>Hoje</button>
        </div>
      </div>
      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView={currentView}
        locale="pt-br"
        headerToolbar={false}
        datesSet={handleDatesSet}
        events={events}
        eventOrder={(a, b) => {
          const pa = a.extendedProps?.task?.priority ?? 5;
          const pb = b.extendedProps?.task?.priority ?? 5;
          return pb - pa;
        }}
        dateClick={(info) => onDateClick(info.dateStr)}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          onTaskClick(info.event.extendedProps.task);
        }}
        height="auto"
        contentHeight="auto"
        dayMaxEvents={false}
        fixedWeekCount={false}
      />
    </div>
  );
}
