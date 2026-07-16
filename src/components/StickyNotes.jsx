import { useState, useRef, useEffect, useCallback } from 'react';
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
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import styles from '../styles/StickyNotes.module.css';

// Paleta estilo Microsoft Sticky Notes. Cores fixas (exceção às CSS vars, igual
// às cores de categoria do app) — a tinta do texto é sempre escura pra manter
// legibilidade nos dois temas.
const STICKY_COLORS = ['yellow', 'green', 'pink', 'blue', 'purple', 'gray'];

// Alça de arraste (grip de 6 pontos). Só ela dispara o drag; o resto do post-it
// continua editável no clique/foco.
function DragHandle({ attributes, listeners, setActivatorNodeRef }) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className={styles.dragHandle}
      title="Arrastar para reordenar"
      aria-label="Arrastar para reordenar"
      {...attributes}
      {...listeners}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
      </svg>
    </button>
  );
}

function StickyNote({ note, onUpdate, onDelete }) {
  const [text, setText] = useState(note.text || '');
  const [serverText, setServerText] = useState(note.text || '');
  const [editing, setEditing] = useState(false);
  const [palette, setPalette] = useState(false);
  const taRef = useRef(null);
  const saveTimer = useRef(null);
  const paletteRef = useRef(null);

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: note.id });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Sincroniza texto vindo do Firestore quando outro cliente edita, sem
  // atropelar o que o usuário está digitando localmente. Padrão de ajuste de
  // estado durante o render (React), evitando setState dentro de useEffect.
  if (!editing && note.text !== serverText) {
    setServerText(note.text || '');
    setText(note.text || '');
  }

  const autoGrow = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, []);

  useEffect(() => {
    autoGrow();
  }, [text, autoGrow]);

  useEffect(() => {
    if (!palette) return undefined;
    const onOutside = (e) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target)) {
        setPalette(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [palette]);

  const scheduleSave = (value) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      onUpdate(note.id, { text: value });
    }, 700);
  };

  const handleChange = (e) => {
    setText(e.target.value);
    scheduleSave(e.target.value);
  };

  const handleBlur = () => {
    setEditing(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if ((text || '') !== (note.text || '')) {
      onUpdate(note.id, { text });
    }
  };

  const pickColor = (color) => {
    setPalette(false);
    if (color !== note.color) onUpdate(note.id, { color });
  };

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className={`${styles.note} ${styles[note.color] || styles.yellow}`}
    >
      <div className={styles.noteBar}>
        <div className={styles.barLeft}>
          <DragHandle attributes={attributes} listeners={listeners} setActivatorNodeRef={setActivatorNodeRef} />
          <div className={styles.paletteWrap} ref={paletteRef}>
            <button
              className={styles.barBtn}
              title="Cor"
              onClick={() => setPalette((v) => !v)}
              aria-label="Trocar cor"
            >
              <span className={styles.colorDot} />
            </button>
            {palette && (
              <div className={styles.palette}>
                {STICKY_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`${styles.swatch} ${styles[c]} ${note.color === c ? styles.swatchActive : ''}`}
                    onClick={() => pickColor(c)}
                    aria-label={c}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          className={styles.barBtn}
          title="Excluir"
          aria-label="Excluir lembrete"
          onClick={() => {
            if (window.confirm('Excluir este lembrete?')) onDelete(note.id);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      </div>
      <textarea
        ref={taRef}
        className={styles.noteText}
        value={text}
        placeholder="Escreva um lembrete…"
        onChange={handleChange}
        onFocus={() => setEditing(true)}
        onBlur={handleBlur}
        rows={1}
      />
    </div>
  );
}

export default function StickyNotes({
  side = 'right',
  stickyNotes,
  addStickyNote,
  updateStickyNote,
  deleteStickyNote,
  reorderStickyNotes,
}) {
  const [colorIdx, setColorIdx] = useState(0);

  // Notas deste lado. Notas antigas sem `side` caem no lado direito (onde o
  // painel nasceu), pra não sumir nada.
  const notes = stickyNotes.filter((n) => (n.side || 'right') === side);
  const noteById = Object.fromEntries(notes.map((n) => [n.id, n]));

  // Ordem local (só de ids) pra o arraste ser otimista, sem esperar o eco do
  // Firestore. O conteúdo de cada nota vem sempre fresco do prop.
  const [orderIds, setOrderIds] = useState(() => notes.map((n) => n.id));

  // Reconciliação durante o render (padrão do app: evita setState em effect).
  // Só reage a entrada/saída de notas — mantém a ordem local intacta durante e
  // logo após o arraste. Nota nova entra embaixo (comportamento antigo).
  const freshIds = notes.map((n) => n.id);
  const sameMembers =
    orderIds.length === freshIds.length && orderIds.every((id) => noteById[id]);
  if (!sameMembers) {
    const present = orderIds.filter((id) => noteById[id]);
    const added = freshIds.filter((id) => !present.includes(id));
    setOrderIds([...present, ...added]);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleAdd = () => {
    // Roda as cores da paleta a cada novo post-it, pra não ficar tudo amarelo.
    const color = STICKY_COLORS[colorIdx % STICKY_COLORS.length];
    setColorIdx((i) => i + 1);
    addStickyNote(color, side);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderIds.indexOf(active.id);
    const newIndex = orderIds.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(orderIds, oldIndex, newIndex);
    setOrderIds(next); // otimista
    reorderStickyNotes?.(next); // persiste `order` no Firestore
  };

  const orderedNotes = orderIds.map((id) => noteById[id]).filter(Boolean);

  return (
    <aside className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Lembretes</span>
        <button className={styles.addBtn} onClick={handleAdd} title="Novo lembrete">
          + Novo
        </button>
      </div>
      <div className={styles.list}>
        {orderedNotes.length === 0 ? (
          <button className={styles.empty} onClick={handleAdd}>
            <span className={styles.emptyPlus}>+</span>
            <span>Adicionar lembrete</span>
          </button>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
              {orderedNotes.map((note) => (
                <StickyNote
                  key={note.id}
                  note={note}
                  onUpdate={updateStickyNote}
                  onDelete={deleteStickyNote}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </aside>
  );
}
