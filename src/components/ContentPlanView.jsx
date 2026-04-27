import { Fragment, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ContentPlanModal from './ContentPlanModal';
import styles from '../styles/ContentPlanView.module.css';

const ROWS = [
  { store: 'lov', type: 'story', label: 'Story' },
  { store: 'lov', type: 'reel', label: 'Reels' },
  { store: 'dame', type: 'story', label: 'Story' },
  { store: 'dame', type: 'reel', label: 'Reels' },
];

const STORE_LABEL = { lov: 'LOV', dame: 'DAME' };

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const formatDateKey = (year, month, day) => {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
};

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

export default function ContentPlanView({ items, addItem, updateItem, deleteItem }) {
  const { user, isAdmin } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [editing, setEditing] = useState(null);

  const days = useMemo(() => {
    const total = daysInMonth(year, month);
    return Array.from({ length: total }, (_, i) => i + 1);
  }, [year, month]);

  const itemsByCell = useMemo(() => {
    const map = {};
    for (const it of items) {
      const k = `${it.dateKey}|${it.store}|${it.type}`;
      map[k] = it;
    }
    return map;
  }, [items]);

  const goPrev = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const goNext = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  };

  const openCell = (store, type, day, existing) => {
    const dateKey = formatDateKey(year, month, day);
    setEditing({
      id: existing?.id || null,
      dateKey,
      store,
      type,
      content: existing?.content || '',
      status: existing?.status || 'pending',
      authorName: existing?.authorName,
      updatedAt: existing?.updatedAt,
    });
  };

  const handleSave = async ({ content, status }) => {
    const trimmed = content.trim();
    if (editing.id) {
      if (!trimmed) {
        await deleteItem(editing.id);
      } else {
        await updateItem(editing.id, { content: trimmed, status });
      }
    } else if (trimmed) {
      await addItem({ dateKey: editing.dateKey, store: editing.store, type: editing.type, content: trimmed, status }, user);
    }
    setEditing(null);
  };

  const handleClose = () => setEditing(null);

  const isToday = (day) => {
    const t = new Date();
    return t.getFullYear() === year && t.getMonth() === month && t.getDate() === day;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>📅 Content Plan</h2>
        <div className={styles.nav}>
          <button className={styles.navBtn} onClick={goPrev} title="Mês anterior">‹</button>
          <button className={styles.todayBtn} onClick={goToday}>Hoje</button>
          <span className={styles.monthLabel}>{MONTHS[month]} {year}</span>
          <button className={styles.navBtn} onClick={goNext} title="Próximo mês">›</button>
        </div>
      </div>

      <div className={styles.legend}>
        <span><span className={`${styles.legendDot} ${styles.statusPending}`} /> Em análise</span>
        <span><span className={`${styles.legendDot} ${styles.statusChanges}`} /> Alteração pedida</span>
        <span><span className={`${styles.legendDot} ${styles.statusRevised}`} /> Revisado</span>
        <span><span className={`${styles.legendDot} ${styles.statusApproved}`} /> Aprovado</span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.cornerCell} />
              <th className={styles.rowLabel} />
              {days.map((d) => (
                <th key={d} className={`${styles.dayHeader} ${isToday(d) ? styles.dayHeaderToday : ''}`}>
                  {String(d).padStart(2, '0')}/{String(month + 1).padStart(2, '0')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, idx) => {
              const isFirstOfStore = idx === 0 || ROWS[idx - 1].store !== row.store;
              const storeRowSpan = ROWS.filter((r) => r.store === row.store).length;
              return (
                <tr key={`${row.store}-${row.type}`} className={styles.dataRow}>
                  {isFirstOfStore && (
                    <th className={`${styles.storeCell} ${styles[`store_${row.store}`]}`} rowSpan={storeRowSpan}>
                      {STORE_LABEL[row.store]}
                    </th>
                  )}
                  <th className={styles.rowLabel}>{row.label}</th>
                  {days.map((d) => {
                    const dateKey = formatDateKey(year, month, d);
                    const it = itemsByCell[`${dateKey}|${row.store}|${row.type}`];
                    const status = it?.status;
                    const cellClass = `${styles.cell} ${status ? styles[`status_${status}`] : ''} ${isToday(d) ? styles.cellToday : ''}`;
                    return (
                      <td key={d} className={cellClass} onClick={() => openCell(row.store, row.type, d, it)}>
                        {it?.content && <span className={styles.cellContent}>{it.content}</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <ContentPlanModal
          editing={editing}
          isAdmin={isAdmin}
          onSave={handleSave}
          onClose={handleClose}
          onDelete={editing.id ? () => { deleteItem(editing.id); handleClose(); } : null}
        />
      )}
    </div>
  );
}
