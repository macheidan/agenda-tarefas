import { useState } from 'react';
import RichContent from './RichContent';
import styles from '../styles/NotesView.module.css';

const VIEW_KEY = 'notesView';

export default function NotesView({ notes, onNewNote, onNoteClick }) {
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) || 'list';
    } catch {
      return 'list';
    }
  });

  const toggleView = () => {
    const next = view === 'list' ? 'grid' : 'list';
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // ignora storage error
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp?.seconds) return '';
    const d = new Date(timestamp.seconds * 1000);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Anotações</h2>
        <div className={styles.headerActions}>
          <button
            className={styles.viewToggle}
            onClick={toggleView}
            title={view === 'list' ? 'Ver em caixas' : 'Ver em lista'}
            aria-label={view === 'list' ? 'Mudar para visualização em caixas' : 'Mudar para visualização em lista'}
          >
            {view === 'list' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            )}
          </button>
          <button className={styles.newBtn} onClick={onNewNote}>
            + Nova Anotação
          </button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className={styles.empty}>
          <p>Nenhuma anotação ainda. Crie uma nova anotação para começar.</p>
        </div>
      ) : view === 'grid' ? (
        <div className={styles.grid}>
          {notes.map((note) => (
            <div
              key={note.id}
              className={styles.card}
              onClick={() => onNoteClick(note)}
            >
              <h3 className={styles.cardTitle}>{note.title || 'Sem título'}</h3>
              {note.content && (
                <RichContent className={styles.cardContent} html={note.content} />
              )}
              <span className={styles.cardDate}>{formatDate(note.createdAt)}</span>
            </div>
          ))}
        </div>
      ) : (
        <ul className={styles.list}>
          {notes.map((note) => (
            <li
              key={note.id}
              className={styles.row}
              onClick={() => onNoteClick(note)}
            >
              <span className={styles.rowTitle}>{note.title || 'Sem título'}</span>
              <span className={styles.rowDate}>{formatDate(note.createdAt)}</span>
              <span className={styles.rowChevron} aria-hidden>›</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
