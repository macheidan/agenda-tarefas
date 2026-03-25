import { useState, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import RichTextEditor from './RichTextEditor';
import styles from '../styles/TaskModal.module.css';

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Não iniciada', color: '#9e9e9e' },
  { value: 'in_progress', label: 'Em andamento', color: '#2196f3' },
  { value: 'done', label: 'Concluído', color: '#4caf50' },
];

const RECURRENCE_OPTIONS = [
  { value: 'once', label: 'Uma Vez' },
  { value: 'daily', label: 'Diária (dias úteis)' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
];

export default function TaskModal({ task, initialDate, onSave, onUpdate, onDelete, onClose }) {
  const { user } = useAuth();
  const isEditing = !!task;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [finishDate, setFinishDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [recurrence, setRecurrence] = useState('once');
  const [recurrenceCount, setRecurrenceCount] = useState('');
  const [status, setStatus] = useState('not_started');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setDate(task.date || '');
      setFinishDate(task.finishDate || '');
      setEndDate(task.endDate || '');
      setRecurrence(task.recurrence || 'once');
      setStatus(task.status || 'not_started');
      setComments(task.comments || []);
    } else if (initialDate) {
      setDate(initialDate);
    }
  }, [task, initialDate]);

  const handleSave = () => {
    if (!title.trim() || !date) return;

    if (isEditing) {
      onUpdate(task.id, {
        title: title.trim(),
        description,
        date,
        finishDate: finishDate || null,
        endDate: endDate || null,
        recurrence,
        status,
        comments,
      });
    } else {
      onSave({
        title: title.trim(),
        description,
        date,
        finishDate: finishDate || null,
        endDate: endDate || null,
        recurrence,
        recurrenceCount: recurrence !== 'once' ? (recurrenceCount || 2) : 1,
      });
    }
    onClose();
  };

  const handleDelete = () => {
    if (task) {
      onDelete(task.id);
      onClose();
    }
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    const comment = {
      text: newComment.trim(),
      authorName: user.displayName,
      authorPhoto: user.photoURL,
      authorUid: user.uid,
      timestamp: Timestamp.now(),
    };
    const updated = [...comments, comment];
    setComments(updated);
    setNewComment('');
    if (isEditing) {
      onUpdate(task.id, { comments: updated });
    }
  };

  const hasUnsavedContent = () => {
    if (isEditing) {
      return title !== (task.title || '') || description !== (task.description || '');
    }
    return title.trim() !== '' || (description.trim() !== '' && description !== '<p></p>');
  };

  const handleClose = () => {
    if (hasUnsavedContent()) {
      if (window.confirm('Você tem alterações não salvas. Deseja realmente fechar?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];

  const recurrenceLabel =
    recurrence === 'daily' ? 'dias úteis' : recurrence === 'weekly' ? 'semanas' : 'meses';

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={handleClose}>
          &times;
        </button>

        <input
          className={styles.titleInput}
          type="text"
          placeholder="Título da tarefa"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className={styles.field} style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#888', marginBottom: 4, display: 'block' }}>
            Descrição
          </label>
          <RichTextEditor value={description} onChange={setDescription} placeholder="Descreva a tarefa..." resizable />
        </div>

        <div className={styles.fields}>
          <div className={styles.field}>
            <label>Data de início</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className={styles.field}>
            <label>Data de término (opcional)</label>
            <input type="date" value={finishDate} onChange={(e) => setFinishDate(e.target.value)} />
          </div>

          <div className={styles.field}>
            <label>Horário (opcional)</label>
            <input type="time" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          <div className={styles.field}>
            <label>Recorrência</label>
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              {RECURRENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {recurrence !== 'once' && !isEditing && (
            <div className={styles.field}>
              <label>Repetir por {recurrenceCount || ''} {recurrenceLabel}</label>
              <input
                type="number"
                min="2"
                max="365"
                value={recurrenceCount}
                onChange={(e) => setRecurrenceCount(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
                placeholder="Quantidade"
              />
            </div>
          )}

          <div className={styles.field}>
            <label>Status</label>
            <div className={styles.statusWrapper}>
              <button
                className={styles.statusBadge}
                style={{ background: currentStatus.color }}
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
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
                      onClick={() => {
                        setStatus(opt.value);
                        setShowStatusDropdown(false);
                        if (isEditing) {
                          onUpdate(task.id, { status: opt.value });
                        }
                      }}
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

        {isEditing && (
          <div className={styles.commentsSection}>
            <h3>Comentários</h3>
            <div className={styles.commentsList}>
              {comments.map((c, i) => (
                <div key={i} className={styles.comment}>
                  <img
                    className={styles.commentAvatar}
                    src={c.authorPhoto || 'https://via.placeholder.com/32'}
                    alt={c.authorName}
                  />
                  <div className={styles.commentBody}>
                    <span className={styles.commentAuthor}>{c.authorName}</span>
                    <p className={styles.commentText}>{c.text}</p>
                    <span className={styles.commentTime}>
                      {c.timestamp?.toDate
                        ? c.timestamp.toDate().toLocaleString('pt-BR')
                        : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.commentInput}>
              <input
                type="text"
                placeholder="Adicionar comentário..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
              />
              <button onClick={handleAddComment}>Enviar</button>
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.saveBtn} onClick={handleSave}>
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
