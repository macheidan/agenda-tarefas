import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import RichContent from './RichContent';
import styles from '../styles/NotesView.module.css';

const VIEW_KEY = 'notesView';

const formatDate = (timestamp) => {
  if (!timestamp?.seconds) return '';
  const d = new Date(timestamp.seconds * 1000);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

// Alça de arraste (grip de 6 pontos). Só ela dispara o drag; o resto do item
// continua abrindo a nota no clique/toque.
function DragHandle({ attributes, listeners, setActivatorNodeRef }) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className={styles.dragHandle}
      onClick={(e) => e.stopPropagation()}
      title="Arrastar para reordenar"
      aria-label="Arrastar para reordenar"
      {...attributes}
      {...listeners}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
      </svg>
    </button>
  );
}

function SortableRow({ note, onNoteClick }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: note.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={styles.row}
      onClick={() => onNoteClick(note)}
    >
      <DragHandle attributes={attributes} listeners={listeners} setActivatorNodeRef={setActivatorNodeRef} />
      <span className={styles.rowTitle}>{note.title || 'Sem título'}</span>
      <span className={styles.rowDate}>{formatDate(note.createdAt)}</span>
      <span className={styles.rowChevron} aria-hidden>›</span>
    </li>
  );
}

function SortableCard({ note, onNoteClick }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: note.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={styles.card}
      onClick={() => onNoteClick(note)}
    >
      <div className={styles.cardBar}>
        <DragHandle attributes={attributes} listeners={listeners} setActivatorNodeRef={setActivatorNodeRef} />
      </div>
      <h3 className={styles.cardTitle}>{note.title || 'Sem título'}</h3>
      {note.content && <RichContent className={styles.cardContent} html={note.content} />}
      <span className={styles.cardDate}>{formatDate(note.createdAt)}</span>
    </div>
  );
}

export default function NotesView({ notes, onNewNote, onNoteClick, onReorder }) {
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) || 'list';
    } catch {
      return 'list';
    }
  });

  // Ordem local (só de ids) pra o arraste ser otimista, sem esperar o eco do
  // Firestore. O conteúdo de cada nota vem sempre fresco do prop `notes`.
  const noteById = Object.fromEntries(notes.map((n) => [n.id, n]));
  const [orderIds, setOrderIds] = useState(() => notes.map((n) => n.id));

  // Reconciliação durante o render (padrão do app: evita setState em effect).
  // Só reage a entrada/saída de notas — mantém a ordem local intacta durante e
  // logo após o arraste. Novas notas entram no topo (ordem do prop já sorteado).
  const freshIds = notes.map((n) => n.id);
  const sameMembers =
    orderIds.length === freshIds.length && orderIds.every((id) => noteById[id]);
  if (!sameMembers) {
    const present = orderIds.filter((id) => noteById[id]);
    const added = freshIds.filter((id) => !present.includes(id));
    setOrderIds([...added, ...present]);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const toggleView = () => {
    const next = view === 'list' ? 'grid' : 'list';
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // ignora storage error
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderIds.indexOf(active.id);
    const newIndex = orderIds.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(orderIds, oldIndex, newIndex);
    setOrderIds(next); // otimista
    onReorder?.(next); // persiste `order` no Firestore
  };

  const orderedNotes = orderIds.map((id) => noteById[id]).filter(Boolean);

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

      {orderedNotes.length === 0 ? (
        <div className={styles.empty}>
          <p>Nenhuma anotação ainda. Crie uma nova anotação para começar.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={orderIds}
            strategy={view === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
          >
            {view === 'grid' ? (
              <div className={styles.grid}>
                {orderedNotes.map((note) => (
                  <SortableCard key={note.id} note={note} onNoteClick={onNoteClick} />
                ))}
              </div>
            ) : (
              <ul className={styles.list}>
                {orderedNotes.map((note) => (
                  <SortableRow key={note.id} note={note} onNoteClick={onNoteClick} />
                ))}
              </ul>
            )}
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
