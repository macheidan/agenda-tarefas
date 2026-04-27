import { useState, useEffect } from 'react';
import RichTextEditor from './RichTextEditor';
import styles from '../styles/ContentPlanModal.module.css';

const STORE_OPTIONS = [
  { value: 'lov', label: 'LOV', color: '#ff9800' },
  { value: 'dame', label: 'DAME', color: '#3949ab' },
];

const TYPE_OPTIONS = [
  { value: 'story', label: 'Story', color: '#9e9e9e' },
  { value: 'reel', label: 'Reels', color: '#9c27b0' },
];

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Aguardando', color: '#9e9e9e' },
  { value: 'changes_requested', label: 'Alteração 1', color: '#ff9800' },
  { value: 'revised', label: 'Revisado', color: '#3b82f6' },
  { value: 'changes_2', label: 'Alteração 2', color: '#e53935' },
  { value: 'approved', label: 'Aprovado', color: '#4caf50' },
];

export default function ContentPlanModal({ editing, onSave, onUpdate, onClose, onDelete }) {
  const isEditing = !!editing.id;

  const [title, setTitle] = useState(editing.title || '');
  const [content, setContent] = useState(editing.content || '');
  const [date, setDate] = useState(editing.dateKey || '');
  const [store, setStore] = useState(editing.store || 'lov');
  const [type, setType] = useState(editing.type || 'story');
  const [status, setStatus] = useState(editing.status || 'pending');
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  useEffect(() => {
    setTitle(editing.title || '');
    setContent(editing.content || '');
    setDate(editing.dateKey || '');
    setStore(editing.store || 'lov');
    setType(editing.type || 'story');
    setStatus(editing.status || 'pending');
  }, [editing]);

  const currentStore = STORE_OPTIONS.find((o) => o.value === store) || STORE_OPTIONS[0];
  const currentType = TYPE_OPTIONS.find((o) => o.value === type) || TYPE_OPTIONS[0];

  const stripHtml = (html) => (html || '').replace(/<[^>]+>/g, '').trim();
  const hasContent = !!(title.trim() || stripHtml(content));

  const handleSave = () => {
    if (!hasContent || !date) return;
    onSave({
      title: title.trim(),
      content,
      dateKey: date,
      store,
      type,
      status,
    });
  };

  const handleDelete = () => {
    if (window.confirm('Excluir este item?')) onDelete();
  };

  const hasUnsaved = () => {
    return title !== (editing.title || '') ||
      content !== (editing.content || '') ||
      date !== (editing.dateKey || '');
  };

  const handleClose = () => {
    if (isEditing && hasUnsaved()) {
      if (window.confirm('Você tem alterações não salvas. Deseja realmente fechar?')) onClose();
    } else if (!isEditing && hasContent) {
      if (window.confirm('Você tem alterações não salvas. Deseja realmente fechar?')) onClose();
    } else {
      onClose();
    }
  };

  // Auto-save pill changes when editing
  const updatePill = (field, value) => {
    if (field === 'store') setStore(value);
    if (field === 'type') setType(value);
    if (field === 'status') setStatus(value);
    if (isEditing && onUpdate) onUpdate(editing.id, { [field]: value });
  };

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={handleClose}>&times;</button>

        <input
          className={styles.titleInput}
          type="text"
          placeholder="Título do post"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className={styles.field} style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#888', marginBottom: 4, display: 'block' }}>
            Descrição
          </label>
          <RichTextEditor value={content} onChange={setContent} placeholder="Descreva o post..." resizable />
        </div>

        <div className={styles.fields}>
          <div className={styles.dateRow}>
            <div className={styles.field}>
              <label>Data</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className={styles.statusPriorityRow}>
            <div className={styles.field}>
              <label>Loja</label>
              <div className={styles.statusWrapper}>
                <button
                  className={styles.statusBadge}
                  style={{ background: currentStore.color }}
                  onClick={() => { setShowStoreDropdown((v) => !v); setShowTypeDropdown(false); }}
                >
                  {currentStore.label}
                </button>
                {showStoreDropdown && (
                  <div className={styles.statusDropdown}>
                    {STORE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        className={styles.statusOption}
                        style={{ color: opt.color }}
                        onClick={() => { updatePill('store', opt.value); setShowStoreDropdown(false); }}
                      >
                        <span className={styles.statusDot} style={{ background: opt.color }} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.field}>
              <label>Tipo</label>
              <div className={styles.statusWrapper}>
                <button
                  className={styles.statusBadge}
                  style={{ background: currentType.color }}
                  onClick={() => { setShowTypeDropdown((v) => !v); setShowStoreDropdown(false); }}
                >
                  {currentType.label}
                </button>
                {showTypeDropdown && (
                  <div className={styles.statusDropdown}>
                    {TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        className={styles.statusOption}
                        style={{ color: opt.color }}
                        onClick={() => { updatePill('type', opt.value); setShowTypeDropdown(false); }}
                      >
                        <span className={styles.statusDot} style={{ background: opt.color }} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.field}>
              <label>Status</label>
              <div className={styles.statusInlineRow}>
                {STATUS_OPTIONS.map((opt) => {
                  const active = status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      className={styles.statusInlineBtn}
                      style={active ? { background: opt.color, borderColor: opt.color, color: '#fff' } : undefined}
                      onClick={() => updatePill('status', opt.value)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.saveBtn} onClick={handleSave} disabled={!hasContent || !date}>
            Salvar
          </button>
          {isEditing && (
            <button className={styles.deleteBtn} onClick={handleDelete}>
              Excluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
