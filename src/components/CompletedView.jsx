import { useState, useRef, useEffect } from 'react';
import styles from '../styles/ArchivedView.module.css';

function TaskCard({ task, onArchive }) {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const descRef = useRef(null);

  useEffect(() => {
    if (descRef.current) {
      setIsClamped(descRef.current.scrollHeight > descRef.current.clientHeight);
    }
  }, [task.description]);

  return (
    <div className={styles.card}>
      <div className={styles.cardMain}>
        <div className={styles.cardInfo}>
          <p className={styles.cardTitle}>{task.title}</p>
          <span className={styles.cardDate} style={{ fontWeight: 600, color: '#555' }}>
            {task.userName}
          </span>
          {task.description && (
            <>
              <div
                ref={descRef}
                className={styles.cardDescription}
                style={expanded
                  ? { maxHeight: 'none', overflow: 'visible' }
                  : { maxHeight: '4.5em', overflow: 'hidden' }
                }
                dangerouslySetInnerHTML={{ __html: task.description }}
              />
              {isClamped && !expanded && (
                <button
                  onClick={() => setExpanded(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2383e2',
                    cursor: 'pointer',
                    fontSize: 13,
                    padding: '4px 0',
                    fontWeight: 500,
                  }}
                >
                  Expandir
                </button>
              )}
              {expanded && (
                <button
                  onClick={() => setExpanded(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2383e2',
                    cursor: 'pointer',
                    fontSize: 13,
                    padding: '4px 0',
                    fontWeight: 500,
                  }}
                >
                  Recolher
                </button>
              )}
            </>
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
  );
}

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
            <TaskCard
              key={`${task.uid}-${task.id}`}
              task={task}
              onArchive={onArchive}
            />
          ))}
        </div>
      )}
    </div>
  );
}
