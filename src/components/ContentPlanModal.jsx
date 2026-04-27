import { useState } from 'react';
import styles from '../styles/ContentPlanModal.module.css';

const STORE_LABEL = { lov: 'LOV', dame: 'DAME' };
const TYPE_LABEL = { story: 'Story', reel: 'Reels' };
const STATUS_LABEL = {
  pending: 'Em análise',
  changes_requested: 'Alteração pedida',
  revised: 'Revisado',
  approved: 'Aprovado',
};

const formatDateBR = (dateKey) => {
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
};

export default function ContentPlanModal({ editing, isAdmin, onSave, onClose, onDelete }) {
  const [content, setContent] = useState(editing.content || '');
  const [status, setStatus] = useState(editing.status || 'pending');

  const submit = (newStatus) => {
    onSave({ content, status: newStatus || status });
  };

  const handleEditByAuthor = () => {
    let next = status;
    if (status === 'changes_requested') next = 'revised';
    else if (status === 'approved') next = 'pending';
    submit(next);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>
            <span className={`${styles.storeBadge} ${styles[`store_${editing.store}`]}`}>{STORE_LABEL[editing.store]}</span>
            <span className={styles.typeBadge}>{TYPE_LABEL[editing.type]}</span>
            <span className={styles.date}>{formatDateBR(editing.dateKey)}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <textarea
          className={styles.textarea}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Descreva o post..."
          rows={8}
          autoFocus
        />

        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>Status atual:</span>
          <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>

        <div className={styles.actions}>
          {onDelete && (
            <button
              className={styles.deleteBtn}
              onClick={() => { if (window.confirm('Excluir este item?')) onDelete(); }}
            >
              Excluir
            </button>
          )}
          <div className={styles.actionsRight}>
            {isAdmin ? (
              <>
                <button
                  className={styles.changesBtn}
                  onClick={() => submit('changes_requested')}
                  disabled={!content.trim()}
                >
                  Pedir alteração
                </button>
                <button
                  className={styles.approveBtn}
                  onClick={() => submit('approved')}
                  disabled={!content.trim()}
                >
                  Aprovar
                </button>
              </>
            ) : (
              <button
                className={styles.approveBtn}
                onClick={handleEditByAuthor}
                disabled={!content.trim()}
              >
                Salvar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
