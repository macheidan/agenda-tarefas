import { useState, useEffect } from 'react';
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
  { value: 'pending', label: 'Em análise', color: '#e6b400' },
  { value: 'changes_requested', label: 'Alteração pedida', color: '#e53935' },
  { value: 'revised', label: 'Revisado', color: '#3b82f6' },
  { value: 'approved', label: 'Aprovado', color: '#4caf50' },
];

export default function ContentPlanModal({ editing, isAdmin, onSave, onClose, onDelete }) {
  const isEditing = !!editing.id;
  const [content, setContent] = useState(editing.content || '');
  const [date, setDate] = useState(editing.dateKey || '');
  const [store, setStore] = useState(editing.store || 'lov');
  const [type, setType] = useState(editing.type || 'story');
  const [status, setStatus] = useState(editing.status || 'pending');
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  useEffect(() => {
    setContent(editing.content || '');
    setDate(editing.dateKey || '');
    setStore(editing.store || 'lov');
    setType(editing.type || 'story');
    setStatus(editing.status || 'pending');
  }, [editing]);

  const currentStore = STORE_OPTIONS.find((o) => o.value === store) || STORE_OPTIONS[0];
  const currentType = TYPE_OPTIONS.find((o) => o.value === type) || TYPE_OPTIONS[0];
  const currentStatus = STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0];

  const submit = (newStatus) => {
    if (!content.trim()) return;
    onSave({ store, type, content, status: newStatus || status, dateKey: date });
  };

  const handleEditByAuthor = () => {
    let next = status;
    if (status === 'changes_requested') next = 'revised';
    else if (status === 'approved') next = 'pending';
    submit(next);
  };

  const hasUnsaved = () => {
    return content !== (editing.content || '') ||
      date !== (editing.dateKey || '') ||
      store !== (editing.store || 'lov') ||
      type !== (editing.type || 'story');
  };

  const handleClose = () => {
    if (isEditing && hasUnsaved()) {
      if (window.confirm('Você tem alterações não salvas. Deseja realmente fechar?')) onClose();
    } else {
      onClose();
    }
  };

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={handleClose}>&times;</button>

        <textarea
          className={styles.titleInput}
          placeholder="O que vai postar?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          autoFocus
        />

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
                  onClick={() => { setShowStoreDropdown((v) => !v); setShowTypeDropdown(false); setShowStatusDropdown(false); }}
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
                        onClick={() => { setStore(opt.value); setShowStoreDropdown(false); }}
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
                  onClick={() => { setShowTypeDropdown((v) => !v); setShowStoreDropdown(false); setShowStatusDropdown(false); }}
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
                        onClick={() => { setType(opt.value); setShowTypeDropdown(false); }}
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
              <div className={styles.statusWrapper}>
                <button
                  className={styles.statusBadge}
                  style={{ background: currentStatus.color }}
                  onClick={() => { setShowStatusDropdown((v) => !v); setShowStoreDropdown(false); setShowTypeDropdown(false); }}
                >
                  {currentStatus.label}
                </button>
                {showStatusDropdown && (
                  <div className={styles.statusDropdown}>
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        className={styles.statusOption}
                        style={{ color: opt.color }}
                        onClick={() => { setStatus(opt.value); setShowStatusDropdown(false); }}
                      >
                        <span className={styles.statusDot} style={{ background: opt.color }} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          {isAdmin ? (
            <>
              <button
                className={styles.saveBtn}
                onClick={() => submit('approved')}
                disabled={!content.trim()}
              >
                Aprovar
              </button>
              <button
                className={styles.changesBtn}
                onClick={() => submit('changes_requested')}
                disabled={!content.trim()}
              >
                Pedir alteração
              </button>
            </>
          ) : (
            <button
              className={styles.saveBtn}
              onClick={handleEditByAuthor}
              disabled={!content.trim()}
            >
              Salvar
            </button>
          )}
          {isEditing && onDelete && (
            <button
              className={styles.deleteBtn}
              onClick={() => { if (window.confirm('Excluir este item?')) onDelete(); }}
            >
              Excluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
