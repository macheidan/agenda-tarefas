import { useState, useRef, useLayoutEffect, useMemo } from 'react';
import { processLinks } from '../utils/processLinks';
import styles from '../styles/ArchivedView.module.css';

const clampStyle = {
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  maxHeight: 'none',
};

const expandedStyle = {
  display: 'block',
  overflow: 'visible',
  maxHeight: 'none',
};

const linkStyle = {
  background: 'none',
  border: 'none',
  color: '#2383e2',
  cursor: 'pointer',
  fontSize: 13,
  padding: '4px 0',
  fontWeight: 500,
};

function TaskCard({ task, onArchive }) {
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);
  const descRef = useRef(null);
  const processedDescription = useMemo(() => processLinks(task.description), [task.description]);

  useLayoutEffect(() => {
    const el = descRef.current;
    if (el) {
      setNeedsClamp(el.scrollHeight > el.clientHeight + 2);
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
                style={expanded ? expandedStyle : clampStyle}
                dangerouslySetInnerHTML={{ __html: processedDescription }}
              />
              {needsClamp && !expanded && (
                <button onClick={() => setExpanded(true)} style={linkStyle}>
                  Expandir
                </button>
              )}
              {expanded && (
                <button onClick={() => setExpanded(false)} style={linkStyle}>
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
