import { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/KanbanView.module.css';

const COLUMNS = [
  { id: 'not_started', title: 'Não iniciada', color: '#9e9e9e' },
  { id: 'in_progress', title: 'Em andamento', color: '#2196f3' },
  { id: 'done', title: 'Concluído', color: '#4caf50' },
];

function groupByRecurrence(tasks) {
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
      singles.push({ type: 'single', task });
    }
  });

  const result = [...singles];
  Object.values(groups).forEach((group) => {
    group.tasks.sort((a, b) => a.date.localeCompare(b.date));
    result.push({ type: 'group', group });
  });

  result.sort((a, b) => {
    const dateA = a.type === 'single' ? a.task.date : a.group.tasks[0]?.date || '';
    const dateB = b.type === 'single' ? b.task.date : b.group.tasks[0]?.date || '';
    return dateA.localeCompare(dateB);
  });

  return result;
}

const RECURRENCE_LABELS = {
  daily: 'Diária',
  weekly: 'Semanal',
  monthly: 'Mensal',
};

export default function KanbanView({ tasks, onUpdateStatus, onTaskClick, onArchive, onDelete }) {
  const { isAdmin } = useAuth();
  const [expandedGroups, setExpandedGroups] = useState({});

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId;

    // Check if it's a group drag
    if (draggableId.startsWith('group:')) {
      const groupId = draggableId.replace('group:', '');
      const groupTasks = tasks.filter(
        (t) => t.recurrenceGroup === groupId && t.recurrence !== 'once'
      );
      groupTasks.forEach((t) => onUpdateStatus(t.id, newStatus));
    } else {
      onUpdateStatus(draggableId, newStatus);
    }
  };

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const getColumnItems = (columnId) => {
    const colTasks = tasks.filter((t) => t.status === columnId);
    return groupByRecurrence(colTasks);
  };

  const renderCard = (task, index, isDraggable = true) => {
    const cardContent = (provided, snapshot) => (
      <div
        ref={provided?.innerRef}
        {...(provided?.draggableProps || {})}
        {...(provided?.dragHandleProps || {})}
        className={`${styles.card} ${snapshot?.isDragging ? styles.dragging : ''}`}
        onClick={() => onTaskClick(task)}
        style={{
          ...(provided?.draggableProps?.style || {}),
          ...(!isDraggable ? { marginLeft: 12, borderLeft: '3px solid #ddd' } : {}),
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
    );

    if (!isDraggable) {
      return (
        <Draggable key={task.id} draggableId={task.id} index={index}>
          {(provided, snapshot) => cardContent(provided, snapshot)}
        </Draggable>
      );
    }

    return (
      <Draggable key={task.id} draggableId={task.id} index={index}>
        {(provided, snapshot) => cardContent(provided, snapshot)}
      </Draggable>
    );
  };

  let draggableIndex = 0;

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className={styles.board}>
        {COLUMNS.map((col) => {
          const items = getColumnItems(col.id);
          draggableIndex = 0;

          return (
            <div key={col.id} className={styles.column}>
              <div className={styles.columnHeader} style={{ borderTopColor: col.color }}>
                <span className={styles.columnDot} style={{ background: col.color }} />
                <h3>{col.title}</h3>
                <span className={styles.count}>
                  {tasks.filter((t) => t.status === col.id).length}
                </span>
              </div>
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`${styles.columnBody} ${snapshot.isDraggingOver ? styles.dragOver : ''}`}
                  >
                    {items.map((item) => {
                      if (item.type === 'single') {
                        const idx = draggableIndex++;
                        return renderCard(item.task, idx, true);
                      }

                      const { group } = item;
                      const isExpanded = expandedGroups[group.groupId];
                      const groupDraggableIdx = draggableIndex++;

                      return (
                        <Draggable
                          key={`group:${group.groupId}`}
                          draggableId={`group:${group.groupId}`}
                          index={groupDraggableIdx}
                        >
                          {(groupProvided, groupSnapshot) => (
                            <div
                              ref={groupProvided.innerRef}
                              {...groupProvided.draggableProps}
                              className={`${styles.groupWrapper} ${groupSnapshot.isDragging ? styles.dragging : ''}`}
                            >
                              <div
                                className={styles.groupHeader}
                                {...groupProvided.dragHandleProps}
                                onClick={() => toggleGroup(group.groupId)}
                              >
                                <span className={styles.groupToggle}>
                                  {isExpanded ? '▼' : '▶'}
                                </span>
                                <span className={styles.groupTitle}>{group.title}</span>
                                <span className={styles.groupBadge}>
                                  {RECURRENCE_LABELS[group.recurrence]} · {group.tasks.length}
                                </span>
                              </div>
                              {isExpanded && (
                                <Droppable droppableId={`${col.id}:group:${group.groupId}`} type="GROUP_TASK">
                                  {(innerProvided) => (
                                    <div
                                      ref={innerProvided.innerRef}
                                      {...innerProvided.droppableProps}
                                      className={styles.groupTasks}
                                    >
                                      {group.tasks.map((task, i) => renderCard(task, i, false))}
                                      {innerProvided.placeholder}
                                    </div>
                                  )}
                                </Droppable>
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
