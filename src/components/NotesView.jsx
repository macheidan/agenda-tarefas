import styles from '../styles/NotesView.module.css';

export default function NotesView({ notes, onNewNote, onNoteClick }) {
  const formatDate = (timestamp) => {
    if (!timestamp?.seconds) return '';
    const d = new Date(timestamp.seconds * 1000);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Anotações</h2>
        <button className={styles.newBtn} onClick={onNewNote}>
          + Nova Anotação
        </button>
      </div>

      {notes.length === 0 ? (
        <div className={styles.empty}>
          <p>Nenhuma anotação ainda. Crie uma nova anotação para começar.</p>
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
