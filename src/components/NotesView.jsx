import RichContent from './RichContent';
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
        <div className={styles.grid}>
          {notes.map((note) => (
            <div
              key={note.id}
              className={styles.card}
              onClick={() => onNoteClick(note)}
            >
              <h3 className={styles.cardTitle}>{note.title}</h3>
              {note.content && (
                <RichContent className={styles.cardContent} html={note.content} />
              )}
              <span className={styles.cardDate}>{formatDate(note.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
