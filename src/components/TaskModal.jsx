import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import RichTextEditor from './RichTextEditor';
import { useDirtyClose } from '../hooks/useDirtyClose';
import styles from '../styles/TaskModal.module.css';

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Não iniciada', color: '#9e9e9e' },
  { value: 'in_progress', label: 'Em andamento', color: '#2196f3' },
  { value: 'done', label: 'Concluído', color: '#4caf50' },
  { value: 'complete_notify', label: 'Concluir e Notificar', color: '#ff9800' },
];

const RECURRENCE_OPTIONS = [
  { value: 'once', label: 'Uma Vez' },
  { value: 'daily', label: 'Diária (dias úteis)' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
];

export default function TaskModal({ task, initialDate, onSave, onUpdate, onUpdateGroup, onDelete, onClose }) {
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
  const [priority, setPriority] = useState(5);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setDate(task.date || '');
      setFinishDate(task.finishDate || '');
      setEndDate(task.endDate || '');
      setRecurrence(task.recurrence || 'once');
      setStatus(task.status || 'not_started');
      setPriority(task.priority ?? 5);
    } else if (initialDate) {
      setDate(initialDate);
    }
  }, [task, initialDate]);

  const handleSave = () => {
    if (!title.trim() || !date) return;

    if (isEditing) {
      const titleChanged = title.trim() !== (task.title || '');
      const descChanged = description !== (task.description || '');
      const hasGroup = task.recurrenceGroup && (titleChanged || descChanged);

      const updates = {
        title: title.trim(),
        description,
        date,
        finishDate: finishDate || null,
        endDate: endDate || null,
        recurrence,
        status,
        priority,
      };

      if (hasGroup && onUpdateGroup) {
        const applyAll = window.confirm(
          'Esta tarefa faz parte de uma recorrência.\n\nDeseja aplicar as alterações de título e descrição em todas as tarefas da recorrência?\n\nOK = Alterar todas\nCancelar = Alterar só esta'
        );
        if (applyAll) {
          const groupUpdates = {};
          if (titleChanged) groupUpdates.title = title.trim();
          if (descChanged) groupUpdates.description = description;
          onUpdateGroup(task.recurrenceGroup, groupUpdates);
          onUpdate(task.id, updates);
        } else {
          onUpdate(task.id, updates);
        }
      } else {
        onUpdate(task.id, updates);
      }
    } else {
      onSave({
        title: title.trim(),
        description,
        date,
        finishDate: finishDate || null,
        endDate: endDate || null,
        recurrence,
        priority,
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

  const isDirty = isEditing
    ? (
        title !== (task.title || '') ||
        description !== (task.description || '') ||
        date !== (task.date || '') ||
        finishDate !== (task.finishDate || '') ||
        endDate !== (task.endDate || '') ||
        recurrence !== (task.recurrence || 'once')
      )
    : (
        title.trim() !== '' ||
        (description.trim() !== '' && description !== '<p></p>') ||
        (initialDate ? date !== initialDate : date !== '') ||
        finishDate !== '' ||
        endDate !== ''
      );

  const handleClose = useDirtyClose(isDirty, onClose);

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
          <div className={styles.dateRow}>
            <div className={styles.field}>
              <label>Data de início</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Data de término (opcional)</label>
              <input type="date" value={finishDate} onChange={(e) => setFinishDate(e.target.value)} />
            </div>
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

          <div className={styles.statusPriorityRow}>
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
            <div className={styles.field}>
              <label>Prioridade</label>
              <div className={styles.statusWrapper}>
                <button
                  className={styles.statusBadge}
                  style={{ background: priority >= 8 ? '#e53935' : priority >= 5 ? '#ff9800' : '#4caf50' }}
                  onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                >
                  {priority}
                </button>
                {showPriorityDropdown && (
                  <div className={styles.statusDropdown}>
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
                      <button
                        key={n}
                        className={styles.statusOption}
                        style={{ color: n >= 8 ? '#e53935' : n >= 5 ? '#ff9800' : '#4caf50' }}
                        onClick={() => {
                          setPriority(n);
                          setShowPriorityDropdown(false);
                          if (isEditing) {
                            onUpdate(task.id, { priority: n });
                          }
                        }}
                      >
                        <span className={styles.statusDot} style={{ background: n >= 8 ? '#e53935' : n >= 5 ? '#ff9800' : '#4caf50' }} />
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

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
