import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import styles from '../styles/KanbanView.module.css';

const COLUMNS = [
  { id: 'not_started', title: 'Não iniciada', color: '#9e9e9e' },
  { id: 'in_progress', title: 'Em andamento', color: '#2196f3' },
  { id: 'done', title: 'Concluído', color: '#4caf50' },
];

export default function KanbanView({ tasks, onUpdateStatus, onTaskClick }) {
  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const newStatus = destination.droppableId;
    onUpdateStatus(draggableId, newStatus);
  };

  const getColumnTasks = (columnId) =>
    tasks.filter((t) => t.status === columnId);

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className={styles.board}>
        {COLUMNS.map((col) => (
          <div key={col.id} className={styles.column}>
            <div className={styles.columnHeader} style={{ borderTopColor: col.color }}>
              <span className={styles.columnDot} style={{ background: col.color }} />
              <h3>{col.title}</h3>
              <span className={styles.count}>{getColumnTasks(col.id).length}</span>
            </div>
            <Droppable droppableId={col.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`${styles.columnBody} ${snapshot.isDraggingOver ? styles.dragOver : ''}`}
                >
                  {getColumnTasks(col.id).map((task, index) => (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`${styles.card} ${snapshot.isDragging ? styles.dragging : ''}`}
                          onClick={() => onTaskClick(task)}
                        >
                          <p className={styles.cardTitle}>{task.title}</p>
                          <span className={styles.cardDate}>{task.date}</span>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}
