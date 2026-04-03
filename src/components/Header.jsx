import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/Header.module.css';

export default function Header({
  activeTab,
  onTabChange,
  onNewTask,
  users,
  selectedUid,
  onSelectUser,
  calendarEnabled,
  kanbanEnabled,
  ideasEnabled,
  notesEnabled,
  shoppingListEnabled,
  ideasUnread,
  onOpenMessage,
  completedCount,
}) {
  const { user, logout, isAdmin } = useAuth();

  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <h1 className={styles.logo}>Intranet 🍕</h1>
        <div className={styles.userArea}>
          {isAdmin && users.length > 0 && (
            <select
              className={styles.userSelect}
              value={selectedUid}
              onChange={(e) => onSelectUser(e.target.value)}
            >
              <option value={user.uid}>Minha agenda</option>
              {users
                .filter((u) => u.uid !== user.uid)
                .map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.displayName || u.email}
                  </option>
                ))}
            </select>
          )}
          {isAdmin && (
            <button
              className={`${styles.completedBtn} ${activeTab === 'completed' ? styles.completedActive : ''}`}
              onClick={() => onTabChange('completed')}
            >
              Concluídos{completedCount > 0 ? ` (${completedCount})` : ''}
            </button>
          )}
          {isAdmin && (
            <button
              className={`${styles.archivedBtn} ${activeTab === 'archived' ? styles.archivedActive : ''}`}
              onClick={() => onTabChange('archived')}
            >
              Arquivados
            </button>
          )}
          {isAdmin && (
            <button
              className={styles.archivedBtn}
              onClick={onOpenMessage}
            >
              Mensagem
            </button>
          )}
          {isAdmin && (
            <button
              className={`${styles.archivedBtn} ${activeTab === 'settings' ? styles.archivedActive : ''}`}
              onClick={() => onTabChange('settings')}
            >
              Configuração
            </button>
          )}
          <img className={styles.avatar} src={user.photoURL} alt={user.displayName} />
          <span className={styles.userName}>{user.displayName}</span>
          <button className={styles.logoutBtn} onClick={logout}>
            Sair
          </button>
        </div>
      </div>

      <nav className={styles.nav}>
        <div className={styles.tabs}>
          {calendarEnabled && (
            <button
              className={`${styles.tab} ${activeTab === 'calendar' ? styles.active : ''}`}
              onClick={() => onTabChange('calendar')}
            >
              Calendário
            </button>
          )}
          {kanbanEnabled && (
            <button
              className={`${styles.tab} ${activeTab === 'kanban' ? styles.active : ''}`}
              onClick={() => onTabChange('kanban')}
            >
              Kanban
            </button>
          )}
          {ideasEnabled && (
            <button
              className={`${styles.tab} ${activeTab === 'ideas' ? styles.active : ''}`}
              onClick={() => onTabChange('ideas')}
            >
              Ideias
              {ideasUnread > 0 && <span className={styles.bellBadge}>🔔</span>}
            </button>
          )}
          {notesEnabled && (
            <button
              className={`${styles.tab} ${activeTab === 'notes' ? styles.active : ''}`}
              onClick={() => onTabChange('notes')}
            >
              Anotações
            </button>
          )}
          {shoppingListEnabled && (
            <button
              className={`${styles.tab} ${activeTab === 'shopping' ? styles.active : ''}`}
              onClick={() => onTabChange('shopping')}
            >
              Lista de Compras
            </button>
          )}
        </div>
        <button className={styles.newBtn} onClick={onNewTask}>
          + Nova Tarefa
        </button>
      </nav>
    </header>
  );
}
