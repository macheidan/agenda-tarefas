import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import styles from '../styles/MobileCalendarView.module.css';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const STATUS_DOT = {
  not_started: styles.dotNotStarted,
  in_progress: styles.dotInProgress,
  done: styles.dotDone,
  complete_notify: styles.dotCompleteNotify,
};

const STATUS_LABEL = {
  not_started: 'Não iniciada',
  in_progress: 'Em andamento',
  done: 'Concluída',
  complete_notify: 'Aguardando confirmação',
};

function pad(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDateStr(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const start = new Date(year, month, 1 - startOffset);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

function taskTouchesDate(task, dateStr) {
  if (!task.date) return false;
  if (task.finishDate && task.finishDate >= task.date) {
    return dateStr >= task.date && dateStr <= task.finishDate;
  }
  return task.date === dateStr;
}

export default function MobileCalendarView({ tasks, onDateClick, onTaskClick }) {
  const todayStr = toDateStr(new Date());
  const [viewYM, setViewYM] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const gridRef = useRef(null);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  const grid = useMemo(
    () => buildMonthGrid(viewYM.year, viewYM.month),
    [viewYM.year, viewYM.month]
  );

  const tasksByDate = useMemo(() => {
    const map = new Map();
    for (const t of tasks) {
      if (!t.date) continue;
      const start = parseDateStr(t.date);
      const end = t.finishDate ? parseDateStr(t.finishDate) : start;
      if (!start || !end) continue;
      const cur = new Date(start);
      while (cur <= end) {
        const k = toDateStr(cur);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(t);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [tasks]);

  const eventsForSelected = useMemo(() => {
    const list = (tasksByDate.get(selectedDate) || []).slice();
    list.sort((a, b) => (b.priority ?? 5) - (a.priority ?? 5));
    return list;
  }, [tasksByDate, selectedDate]);

  const goPrev = useCallback(() => {
    setViewYM((p) => {
      const m = p.month - 1;
      return m < 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: m };
    });
  }, []);

  const goNext = useCallback(() => {
    setViewYM((p) => {
      const m = p.month + 1;
      return m > 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: m };
    });
  }, []);

  const goToday = useCallback(() => {
    const d = new Date();
    setViewYM({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedDate(toDateStr(d));
  }, []);

  const onDayTap = (cellDate) => {
    const ds = toDateStr(cellDate);
    if (cellDate.getMonth() !== viewYM.month) {
      setViewYM({ year: cellDate.getFullYear(), month: cellDate.getMonth() });
    }
    setSelectedDate(ds);
  };

  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  };

  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.style.transition = 'none';
      gridRef.current.style.opacity = '0.4';
      requestAnimationFrame(() => {
        if (gridRef.current) {
          gridRef.current.style.transition = 'opacity 180ms ease-out';
          gridRef.current.style.opacity = '1';
        }
      });
    }
  }, [viewYM.year, viewYM.month]);

  const selDate = parseDateStr(selectedDate);
  const selectedHeading = selDate
    ? `${WEEKDAY_NAMES[selDate.getDay()]}, ${selDate.getDate()} de ${MONTHS[selDate.getMonth()].toLowerCase()}`
    : '';

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <button className={styles.navArrow} onClick={goPrev} aria-label="Mês anterior">‹</button>
          <h1 className={styles.monthTitle}>
            {MONTHS[viewYM.month]} <span className={styles.year}>{viewYM.year}</span>
          </h1>
          <button className={styles.navArrow} onClick={goNext} aria-label="Próximo mês">›</button>
        </div>
        <button className={styles.todayBtn} onClick={goToday}>Hoje</button>
      </div>

      <div className={styles.weekdays}>
        {WEEKDAY_LETTERS.map((d, i) => (
          <span
            key={i}
            className={`${styles.weekday} ${i === 0 ? styles.sunday : ''} ${i === 6 ? styles.saturday : ''}`}
          >
            {d}
          </span>
        ))}
      </div>

      <div
        ref={gridRef}
        className={styles.grid}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {grid.map((d, i) => {
          const ds = toDateStr(d);
          const isOtherMonth = d.getMonth() !== viewYM.month;
          const isToday = ds === todayStr;
          const isSelected = ds === selectedDate;
          const dayTasks = tasksByDate.get(ds) || [];
          const dayOfWeek = d.getDay();

          const dotStatuses = [];
          const seen = new Set();
          for (const t of dayTasks) {
            const isOverdue = t.status !== 'done' && t.finishDate && t.finishDate < todayStr;
            const key = isOverdue ? 'overdue' : (t.status || 'not_started');
            if (!seen.has(key)) {
              seen.add(key);
              dotStatuses.push(key);
              if (dotStatuses.length === 4) break;
            }
          }

          return (
            <button
              key={i}
              type="button"
              className={[
                styles.cell,
                isOtherMonth ? styles.otherMonth : '',
                isToday ? styles.today : '',
                isSelected ? styles.selected : '',
                dayOfWeek === 0 ? styles.sundayCell : '',
                dayOfWeek === 6 ? styles.saturdayCell : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onDayTap(d)}
            >
              <span className={styles.dayNumber}>{d.getDate()}</span>
              {dotStatuses.length > 0 && (
                <span className={styles.dots}>
                  {dotStatuses.map((s, idx) => (
                    <span
                      key={idx}
                      className={`${styles.dot} ${s === 'overdue' ? styles.dotOverdue : (STATUS_DOT[s] || styles.dotNotStarted)}`}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className={styles.sheet}>
        <div className={styles.sheetHeader}>
          <span className={styles.sheetDate}>{selectedHeading}</span>
          <span className={styles.sheetCount}>
            {eventsForSelected.length === 0
              ? 'Sem tarefas'
              : `${eventsForSelected.length} ${eventsForSelected.length === 1 ? 'tarefa' : 'tarefas'}`}
          </span>
        </div>
        <div className={styles.sheetList}>
          {eventsForSelected.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>📅</span>
              <span>Toque no + para adicionar uma tarefa</span>
            </div>
          ) : (
            eventsForSelected.map((task) => {
              const isOverdue = task.status !== 'done' && task.finishDate && task.finishDate < todayStr;
              const statusKey = isOverdue ? 'overdue' : (task.status || 'not_started');
              return (
                <button
                  key={task.id}
                  type="button"
                  className={`${styles.eventItem} ${styles[`event_${statusKey}`] || ''}`}
                  onClick={() => onTaskClick(task)}
                >
                  <span className={`${styles.eventBar} ${styles[`bar_${statusKey}`] || ''}`} />
                  <div className={styles.eventBody}>
                    <span className={styles.eventTitle}>{task.title}</span>
                    <span className={styles.eventMeta}>
                      {STATUS_LABEL[isOverdue ? 'not_started' : (task.status || 'not_started')]}
                      {isOverdue && <span className={styles.overdueTag}> • Atrasada</span>}
                      {task.finishDate && task.finishDate !== task.date && (
                        <span> • até {task.finishDate.split('-').reverse().slice(0, 2).join('/')}</span>
                      )}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <button
        type="button"
        className={styles.fab}
        onClick={() => onDateClick(selectedDate)}
        aria-label="Nova tarefa"
      >
        +
      </button>
    </div>
  );
}
