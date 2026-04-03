import styles from '../styles/ArchivedView.module.css';

export default function CompletedView({ completedTasks, onArchive }) {
  const sorted = [...completedTasks].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Tarefas Concluídas</h2>
      </div>

      {sorted.length === 0 ? (
        <div className={styles.empty}>
          <p>Nenhuma tarefa concluída aguardando aprovação.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {sorted.map((task) => (
            <div key={`${task.uid}-${task.id}`} className={styles.card}>
              <div className={styles.cardMain}>
                <div className={styles.cardInfo}>
                  <p className={styles.cardTitle}>{task.title}</p>
                  <span className={styles.cardDate} style={{ fontWeight: 600, color: '#555' }}>
                    {task.userName}
                  </span>
                  {task.description && (
                    <div
                      className={styles.cardDescription}
                      dangerouslySetInnerHTML={{ __html: task.description }}
                    />
                  )}
                </div>
                <div className={styles.cardActions}>
                  <button
                    className={styles.unarchiveBtn}
                    style={{ background: '#4caf50', color: '#fff', border: 'none' }}
                    onClick={() => onArchive(task.uid, task.id)}
                  >
                    Concluir
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
