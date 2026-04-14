import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/ContentPlanModal.module.css';

const FORMATS = ['STORY', 'REEL', 'FEED'];

const PILLAR_OPTIONS = [
  { value: 'red', label: 'Vermelho' },
  { value: 'blue', label: 'Azul' },
  { value: 'yellow', label: 'Amarelo' },
  { value: 'purple', label: 'Roxo' },
  { value: 'teal', label: 'Ciano' },
  { value: 'green', label: 'Verde' },
];

const WEEKDAYS_FULL = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

const FORMAT_CLASSES = { STORY: 'fmtStory', REEL: 'fmtReel', FEED: 'fmtFeed' };
const PILLAR_CLASSES = {
  red: 'pillarRed', blue: 'pillarBlue', yellow: 'pillarYellow',
  purple: 'pillarPurple', teal: 'pillarTeal', green: 'pillarGreen',
};
const BORDER_CLASSES = {
  red: 'borderRed', blue: 'borderBlue', yellow: 'borderYellow',
  purple: 'borderPurple', teal: 'borderTeal', green: 'borderGreen',
};

function getWeekday(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return WEEKDAYS_FULL[d.getDay()];
}

function formatDateBr(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

export default function ContentPlanModal({ post, initialDate, onSave, onUpdate, onDelete, onClose }) {
  const { isAdmin } = useAuth();
  const isEditing = !!post;
  const [mode, setMode] = useState(isEditing ? 'view' : 'edit');

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [format, setFormat] = useState('STORY');
  const [pillarColor, setPillarColor] = useState('red');
  const [pillar, setPillar] = useState('');
  const [tool, setTool] = useState('');
  const [textoVisual, setTextoVisual] = useState('');
  const [comoProduzir, setComoProduzir] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    if (post) {
      setTitle(post.title || '');
      setDate(post.date || '');
      setFormat(post.format || 'STORY');
      setPillarColor(post.pillarColor || 'red');
      setPillar(post.pillar || '');
      setTool(post.tool || '');
      setTextoVisual(post.textoVisual || '');
      setComoProduzir(post.comoProduzir || '');
    } else if (initialDate) {
      setDate(initialDate);
    }
  }, [post, initialDate]);

  const handleSave = async () => {
    if (!title.trim() || !date) {
      alert('Informe título e data');
      return;
    }
    const data = {
      title: title.trim(),
      date,
      format,
      pillar: pillar.trim(),
      pillarColor,
      tool: tool.trim(),
      textoVisual: textoVisual.trim(),
      comoProduzir: comoProduzir.trim(),
    };
    if (isEditing) {
      await onUpdate(post.id, data);
      setMode('view');
    } else {
      await onSave(data);
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Excluir este post?')) return;
    await onDelete(post.id);
    onClose();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textoVisual);
      setCopyStatus('Copiado!');
      setTimeout(() => setCopyStatus(''), 1500);
    } catch {
      setCopyStatus('Erro ao copiar');
    }
  };

  const pillarClass = styles[PILLAR_CLASSES[pillarColor] || 'pillarRed'];
  const formatClass = styles[FORMAT_CLASSES[format] || 'fmtStory'];
  const borderClass = styles[BORDER_CLASSES[pillarColor] || 'borderRed'];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.topRow}>
          <span className={`${styles.formatTag} ${formatClass}`}>{format}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        {mode === 'view' ? (
          <>
            <h2 className={styles.title}>{title}</h2>
            <div className={styles.meta}>
              {formatDateBr(date)} · {getWeekday(date)}
              {tool && ` · ${tool}`}
              {pillar && (
                <span className={styles.pillarInline}>
                  <span className={`${styles.pillarDot} ${pillarClass}`} />
                  {pillar}
                </span>
              )}
            </div>

            {textoVisual && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>TEXTO VISUAL</div>
                <div className={`${styles.visualBox} ${borderClass}`}>
                  {textoVisual}
                </div>
                <button className={styles.copyBtn} onClick={handleCopy}>
                  📋 {copyStatus || 'Copiar'}
                </button>
              </div>
            )}

            {pillar && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>PILAR</div>
                <div className={styles.pillarRow}>
                  <span className={`${styles.pillarDot} ${pillarClass}`} />
                  {pillar}
                </div>
              </div>
            )}

            {comoProduzir && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>COMO PRODUZIR</div>
                <div className={styles.produzirBox}>{comoProduzir}</div>
              </div>
            )}

            {isAdmin && (
              <div className={styles.actions}>
                <button className={styles.deleteBtn} onClick={handleDelete}>
                  Excluir
                </button>
                <button className={styles.editBtn} onClick={() => setMode('edit')}>
                  Editar
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={styles.formRow}>
              <label className={styles.fieldLabel}>Título</label>
              <input
                className={styles.input}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Food porn abertura de semana"
                autoFocus
              />
            </div>

            <div className={styles.twoCol}>
              <div className={styles.formRow}>
                <label className={styles.fieldLabel}>Data</label>
                <input
                  className={styles.input}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className={styles.formRow}>
                <label className={styles.fieldLabel}>Formato</label>
                <select
                  className={styles.input}
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                >
                  {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.twoCol}>
              <div className={styles.formRow}>
                <label className={styles.fieldLabel}>Pilar (cor)</label>
                <select
                  className={styles.input}
                  value={pillarColor}
                  onChange={(e) => setPillarColor(e.target.value)}
                >
                  {PILLAR_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formRow}>
                <label className={styles.fieldLabel}>Pilar (nome)</label>
                <input
                  className={styles.input}
                  type="text"
                  value={pillar}
                  onChange={(e) => setPillar(e.target.value)}
                  placeholder="Desejo visual"
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <label className={styles.fieldLabel}>Ferramenta (opcional)</label>
              <input
                className={styles.input}
                type="text"
                value={tool}
                onChange={(e) => setTool(e.target.value)}
                placeholder="CapCut, Canva, Meta..."
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.fieldLabel}>Texto visual</label>
              <textarea
                className={styles.textarea}
                value={textoVisual}
                onChange={(e) => setTextoVisual(e.target.value)}
                placeholder="Legenda/overlay que aparece no post"
                rows={3}
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.fieldLabel}>Como produzir</label>
              <textarea
                className={styles.textarea}
                value={comoProduzir}
                onChange={(e) => setComoProduzir(e.target.value)}
                placeholder="Passo a passo de produção"
                rows={6}
              />
            </div>

            <div className={styles.actions}>
              <button
                className={styles.cancelBtn}
                onClick={isEditing ? () => setMode('view') : onClose}
              >
                Cancelar
              </button>
              <button className={styles.saveBtn} onClick={handleSave}>
                Salvar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
