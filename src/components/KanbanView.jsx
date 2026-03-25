import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/KanbanView.module.css';

const COLUMNS = [
  { id: 'not_started', title: 'Não iniciada', color: '#9e9e9e' },
  { id: 'in_progress', title: 'Em andamento', color: '#2196f3' },
  { id: 'done', title: 'Concluído', color: '#4caf50' },
];

const RECURRENCE_LABELS = {
  daily: 'Diária',
  weekly: 'Semanal',
  monthly: 'Mensal',
};

function buildColumnItems(tasks) {
  const singles = [];
  const groups = {};

  tasks.forEach((task) => {
    if (task.recurrenceGroup && task.recurrence !== 'once') {
      if (!groups[task.recurrenceGroup]) {
        groups[task.recurrenceGroup] = {
          groupId: task.recurrenceGroup,
          title: task.title,
          recurrence: task.recurrence,
          tasks: [],
        };
      }
      groups[task.recurrenceGroup].tasks.push(task);
    } else {
      singles.push(task);
    }
  });

  // Sort group tasks by date
  Object.values(groups).forEach((g) => {
    g.tasks.sort((a, b) => a.date.localeCompare(b.date));
  });

  // Build flat list of draggable items with group headers interleaved
  const items = [];
  const usedGroups = new Set();

  // Combine singles and first task of each group, sort by date
  const allEntries = [
    ...singles.map((t) => ({ sortDate: t.date, type: 'single', task: t })),
    ...Object.values(groups).map((g) => ({
      sortDate: g.tasks[0]?.date || '',
      type: 'group',
      group: g,
    })),
  ];
  allEntries.sort((a, b) => a.sortDate.localeCompare(b.sortDate));

  allEntries.forEach((entry) => {
    if (entry.type === 'single') {
      items.push({ kind: 'task', task: entry.task, inGroup: false });
    } else {
      const g = entry.group;
      items.push({ kind: 'groupHeader', group: g });
      // Group tasks will be rendered conditionally when expanded
      g.tasks.forEach((t) => {
        items.push({ kind: 'task', task: t, inGroup: true, groupId: g.groupId });
      });
    }
  });

  return items;
}

export default function KanbanView({ tasks, onUpdateStatus, onTaskClick, onArchive, onDelete }) {
  const { isAdmin } = useAuth();
  const [expandedGroups, setExpandedGroups] = useState({});

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId;
    onUpdateStatus(draggableId, newStatus);
  };

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className={styles.board}>
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          const items = buildColumnItems(colTasks);
          let draggableIndex = 0;

          return (
            <div key={col.id} className={styles.column}>
              <div className={styles.columnHeader} style={{ borderTopColor: col.color }}>
                <span className={styles.columnDot} style={{ background: col.color }} />
                <h3>{col.title}</h3>
                <span className={styles.count}>{colTasks.length}</span>
              </div>
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`${styles.columnBody} ${snapshot.isDraggingOver ? styles.dragOver : ''}`}
                  >
                    {items.map((item) => {
                      if (item.kind === 'groupHeader') {
                        const g = item.group;
                        const isExpanded = expandedGroups[g.groupId];
                        return (
                          <div
                            key={`gh:${g.groupId}`}
                            className={styles.groupHeader}
                            onClick={() => toggleGroup(g.groupId)}
                          >
                            <span className={styles.groupToggle}>
                              {isExpanded ? '▼' : '▶'}
                            </span>
                            <span className={styles.groupTitle}>{g.title}</span>
                            <span className={styles.groupBadge}>
                              {RECURRENCE_LABELS[g.recurrence]} · {g.tasks.length}
                            </span>
                          </div>
                        );
                      }

                      // task item
                      const { task, inGroup, groupId } = item;
                      if (inGroup && !expandedGroups[groupId]) return null;

                      const idx = draggableIndex++;
                      return (
                        <Draggable key={task.id} draggableId={task.id} index={idx}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              className={`${styles.card} ${dragSnapshot.isDragging ? styles.dragging : ''}`}
                              onClick={() => onTaskClick(task)}
                              style={{
                                ...dragProvided.draggableProps.style,
                                ...(inGroup ? { marginLeft: 12, borderLeft: '3px solid #ddd' } : {}),
                              }}
                            >
                              <p className={styles.cardTitle}>{task.title}</p>
                              <div className={styles.cardBottom}>
                                <span className={styles.cardDate}>{task.date}</span>
                                {task.finishDate && (
                                  <span className={styles.cardDate}> → {task.finishDate}</span>
                                )}
                              </div>
                              {isAdmin && task.status === 'done' && (
                                <button
                                  className={styles.archiveBtn}
                                  onClick={(e) => { e.stopPropagation(); onArchive(task.id); }}
                                  title="Arquivar"
                                >
                                  📦
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  className={styles.deleteBtn}
                                  onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                                  title="Excluir"
                                >
                                  <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 16, lineHeight: 1 }}>✕</span>
                                </button>
                              )}
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
