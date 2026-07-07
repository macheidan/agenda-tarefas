import { useState, useRef, useEffect, useCallback } from 'react';
import styles from '../styles/StickyNotes.module.css';

// Paleta estilo Microsoft Sticky Notes. Cores fixas (exceção às CSS vars, igual
// às cores de categoria do app) — a tinta do texto é sempre escura pra manter
// legibilidade nos dois temas.
const STICKY_COLORS = ['yellow', 'green', 'pink', 'blue', 'purple', 'gray'];

function StickyNote({ note, onUpdate, onDelete }) {
  const [text, setText] = useState(note.text || '');
  const [serverText, setServerText] = useState(note.text || '');
  const [editing, setEditing] = useState(false);
  const [palette, setPalette] = useState(false);
  const taRef = useRef(null);
  const saveTimer = useRef(null);
  const paletteRef = useRef(null);

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
    <div className={`${styles.note} ${styles[note.color] || styles.yellow}`}>
      <div className={styles.noteBar}>
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
  stickyNotes,
  addStickyNote,
  updateStickyNote,
  deleteStickyNote,
}) {
  const [colorIdx, setColorIdx] = useState(0);

  const handleAdd = () => {
    // Roda as cores da paleta a cada novo post-it, pra não ficar tudo amarelo.
    const color = STICKY_COLORS[colorIdx % STICKY_COLORS.length];
    setColorIdx((i) => i + 1);
    addStickyNote(color);
  };

  return (
    <aside className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>Lembretes</span>
        <button className={styles.addBtn} onClick={handleAdd} title="Novo lembrete">
          + Novo
        </button>
      </div>
      <div className={styles.list}>
        {stickyNotes.length === 0 ? (
          <button className={styles.empty} onClick={handleAdd}>
            <span className={styles.emptyPlus}>+</span>
            <span>Adicionar lembrete</span>
          </button>
        ) : (
          stickyNotes.map((note) => (
            <StickyNote
              key={note.id}
              note={note}
              onUpdate={updateStickyNote}
              onDelete={deleteStickyNote}
            />
          ))
        )}
      </div>
    </aside>
  );
}
