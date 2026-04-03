import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/ArchivedView.module.css';

const STATUS_LABELS = {
  not_started: 'Não iniciada',
  in_progress: 'Em andamento',
  done: 'Concluído',
  complete_notify: 'Concluído e Notificado',
};

const STATUS_COLORS = {
  not_started: '#9e9e9e',
  in_progress: '#2196f3',
  done: '#4caf50',
  complete_notify: '#ff9800',
};

export default function ArchivedView({ archivedTasks, onUnarchive, onDelete, onClearChat, adminMessages, onDeleteMessage }) {
  const { isAdmin } = useAuth();

  const sorted = [...archivedTasks].sort((a, b) => b.date?.localeCompare(a.date));

  const formatDate = (timestamp) => {
    if (!timestamp?.seconds) return '';
    const d = new Date(timestamp.seconds * 1000);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Tarefas Arquivadas</h2>
        {isAdmin && (
          <button
            className={styles.clearChatBtn}
            onClick={() => {
              if (window.confirm('Limpar todas as mensagens de todos os chats? Esta ação não pode ser desfeita.')) {
                onClearChat();
              }
            }}
          >
            Limpar Chat
          </button>
        )}
      </div>

      {isAdmin && adminMessages && adminMessages.length > 0 && (
        <div className={styles.messagesSection}>
          <h3 className={styles.sectionTitle}>Mensagens Enviadas</h3>
          <div className={styles.list}>
            {adminMessages.map((msg) => (
              <div key={msg.id} className={styles.messageCard}>
                <p className={styles.messageText}>{msg.text}</p>
                <div className={styles.messageActions}>
                  <span className={styles.messageDate}>{formatDate(msg.createdAt)}</span>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => {
                      if (window.confirm('Excluir esta mensagem?')) {
                        onDeleteMessage(msg.id);
                      }
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className={styles.empty}>
          <p>Nenhuma tarefa arquivada.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {sorted.map((task) => (
            <div key={task.id} className={styles.card}>
              <div className={styles.cardMain}>
                <div className={styles.cardInfo}>
                  <p className={styles.cardTitle}>{task.title}</p>
                  {task.description && (
                    <div
                      className={styles.cardDescription}
                      dangerouslySetInnerHTML={{ __html: task.description }}
                    />
                  )}
                  <div className={styles.cardMeta}>
                    <span className={styles.cardDate}>{task.date}</span>
                    {task.finishDate && <span className={styles.cardDate}> → {task.finishDate}</span>}
                    <span
                      className={styles.statusBadge}
                      style={{ background: STATUS_COLORS[task.status] }}
                    >
                      {STATUS_LABELS[task.status]}
                    </span>
                  </div>
                </div>
                {isAdmin && (
                  <div className={styles.cardActions}>
                    <button
                      className={styles.unarchiveBtn}
                      onClick={() => onUnarchive(task.id)}
                      title="Desarquivar"
                    >
                      ↩️ Restaurar
                    </button>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => {
                        if (window.confirm('Excluir permanentemente esta tarefa?')) {
                          onDelete(task.id);
                        }
                      }}
                      title="Excluir"
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
