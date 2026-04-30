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
  { value: 'influencer', label: 'Influencer', color: '#e91e63' },
];

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Aguardando', color: '#9e9e9e', adminOnly: false, hasNext: true },
  { value: 'alteracao', label: 'Alteração', color: '#e53935', adminOnly: true, hasNext: true },
  { value: 'revisado', label: 'Revisado', color: '#3b82f6', adminOnly: false, hasNext: true },
  { value: 'aprovado_gravar', label: 'Aprovado gravar', color: '#009688', adminOnly: true, hasNext: true },
  { value: 'pronto', label: 'Pronto', color: '#ff9800', adminOnly: false, hasNext: true },
  { value: 'publicar', label: 'Publicar', color: '#4caf50', adminOnly: true, hasNext: false },
];

// Legacy values: items criados antes do redesign do fluxo de status
// continuam funcionando, mapeados pra um valor equivalente da lista nova.
const STATUS_LEGACY_MAP = {
  changes_requested: 'alteracao',
  changes_2: 'alteracao',
  approved: 'publicar',
  revised: 'revisado',
};

function normalizeStatus(value) {
  if (!value) return 'pending';
  return STATUS_LEGACY_MAP[value] || value;
}

// Conversão automática do path do Drive: caminho do dono ("Meu Drive")
// vira o caminho do shortcut compartilhado, que é o que o auxiliar usa.
const PERSONAL_DRIVE_PREFIX = 'G:\\Meu Drive\\02 Pizzarias\\03 Marketing\\01 Comunicação\\';
const SHORTCUT_DRIVE_PREFIX = 'G:\\.shortcut-targets-by-id\\0BxvfiuINnUmqNExSenh4SndCZnc\\01 Comunicação\\';

function convertFolderPath(input) {
  if (typeof input !== 'string') return input;
  if (input.startsWith(PERSONAL_DRIVE_PREFIX)) {
    return SHORTCUT_DRIVE_PREFIX + input.slice(PERSONAL_DRIVE_PREFIX.length);
  }
  return input;
}

export default function ContentPlanModal({ editing, isAdmin, onSave, onUpdate, onClose, onDelete }) {
  const isEditing = !!editing.id;

  const [title, setTitle] = useState(editing.title || '');
  const [content, setContent] = useState(editing.content || '');
  const [folder, setFolder] = useState(editing.folder || '');
  const [date, setDate] = useState(editing.dateKey || '');
  const [store, setStore] = useState(editing.store || 'lov');
  const [type, setType] = useState(editing.type || 'story');
  const [status, setStatus] = useState(normalizeStatus(editing.status));
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [folderCopied, setFolderCopied] = useState(false);

  useEffect(() => {
    setTitle(editing.title || '');
    setContent(editing.content || '');
    setFolder(editing.folder || '');
    setDate(editing.dateKey || '');
    setStore(editing.store || 'lov');
    setType(editing.type || 'story');
    setStatus(normalizeStatus(editing.status));
  }, [editing]);

  const currentStore = STORE_OPTIONS.find((o) => o.value === store) || STORE_OPTIONS[0];
  const currentType = TYPE_OPTIONS.find((o) => o.value === type) || TYPE_OPTIONS[0];

  const stripHtml = (html) => (html || '').replace(/<[^>]+>/g, '').trim();
  const hasContent = !!(title.trim() || stripHtml(content));

  const handleSave = () => {
    if (!hasContent || !date || !folder.trim()) return;
    onSave({
      title: title.trim(),
      content,
      folder: folder.trim(),
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
      folder !== (editing.folder || '') ||
      date !== (editing.dateKey || '');
  };

  const handleClose = () => {
    // Editing existing item: auto-save any unsaved changes silently
    if (isEditing && onUpdate && hasUnsaved()) {
      onUpdate(editing.id, {
        title: title.trim(),
        content,
        folder: folder.trim(),
        dateKey: date,
      });
      onClose();
      return;
    }
    // Creating new item with content: confirm before discarding (igual TaskModal)
    if (!isEditing && hasContent) {
      if (window.confirm('Você tem alterações não salvas. Deseja realmente fechar?')) onClose();
      return;
    }
    onClose();
  };

  const copyFolder = async () => {
    if (!folder.trim()) return;
    try {
      await navigator.clipboard.writeText(folder);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = folder;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setFolderCopied(true);
    setTimeout(() => setFolderCopied(false), 1500);
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
          onBlur={() => {
            if (isEditing && onUpdate && (title.trim() !== (editing.title || ''))) {
              onUpdate(editing.id, { title: title.trim() });
            }
          }}
        />

        <div className={styles.field} style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#888', marginBottom: 4, display: 'block' }}>
            Descrição
          </label>
          <RichTextEditor
            value={content}
            onChange={setContent}
            onBlur={() => {
              if (isEditing && onUpdate && content !== (editing.content || '')) {
                onUpdate(editing.id, { content });
              }
            }}
            placeholder="Descreva o post..."
            resizable
          />
        </div>

        <div className={styles.field} style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#888', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            * Pasta
            <button
              type="button"
              onClick={copyFolder}
              disabled={!folder.trim()}
              title={folderCopied ? 'Copiado!' : 'Copiar caminho'}
              style={{
                background: 'none',
                border: 'none',
                padding: 2,
                cursor: folder.trim() ? 'pointer' : 'not-allowed',
                color: folderCopied ? '#4caf50' : '#888',
                display: 'inline-flex',
                alignItems: 'center',
                opacity: folder.trim() ? 1 : 0.4,
              }}
            >
              {folderCopied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </label>
          <input
            type="text"
            value={folder}
            onChange={(e) => setFolder(convertFolderPath(e.target.value))}
            onBlur={() => {
              if (isEditing && onUpdate && folder.trim() !== (editing.folder || '')) {
                onUpdate(editing.id, { folder: folder.trim() });
              }
            }}
            placeholder={'Cole o caminho do "Meu Drive" — converte automático'}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--input-border)',
              borderRadius: 6,
              fontSize: 14,
              color: 'var(--text)',
              background: 'var(--input-bg)',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div className={styles.fields}>
          <div className={styles.statusPriorityRow}>
            <div className={styles.field}>
              <label>Data</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onBlur={() => {
                  if (isEditing && onUpdate && date && date !== (editing.dateKey || '')) {
                    onUpdate(editing.id, { dateKey: date });
                  }
                }}
              />
            </div>

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
          </div>

          <div className={styles.field}>
            <label>Status</label>
            <div className={styles.statusInlineRow}>
              {STATUS_OPTIONS.map((opt) => {
                const active = status === opt.value;
                const blocked = opt.adminOnly && !isAdmin;
                return (
                  <button
                    key={opt.value}
                    className={styles.statusInlineBtn}
                    style={active ? { background: opt.color, borderColor: opt.color, color: '#fff' } : undefined}
                    onClick={() => { if (!blocked) updatePill('status', opt.value); }}
                    disabled={blocked}
                    title={blocked ? 'Apenas admin pode marcar' : opt.label}
                  >
                    {opt.label}
                    {opt.hasNext && <span className={styles.statusArrow}>▶</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <button className={styles.saveBtn} onClick={handleSave} disabled={!hasContent || !date || !folder.trim()}>
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
