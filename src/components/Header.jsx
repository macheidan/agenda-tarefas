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
  customName,
  allSettings,
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
                    {allSettings?.[u.uid]?.customName || u.displayName || u.email}
                  </option>
                ))}
            </select>
          )}
          {isAdmin && (
            <button
              className={`${completedCount > 0 ? styles.completedBtn : styles.archivedBtn} ${activeTab === 'completed' ? (completedCount > 0 ? styles.completedActive : styles.archivedActive) : ''}`}
              onClick={() => onTabChange('completed')}
            >
              Concluídos{completedCount > 0 ? ` (${completedCount})` : ''}
            </button>
          )}

          {isAdmin && (
            <button
              className={styles.iconBtn}
              onClick={onOpenMessage}
              title="Mensagem"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 4L12 13L2 4" />
              </svg>
            </button>
          )}
          {isAdmin && (
            <button
              className={`${styles.iconBtn} ${activeTab === 'settings' ? styles.iconBtnActive : ''}`}
              onClick={() => onTabChange('settings')}
              title="Configuração"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          )}
          <img className={styles.avatar} src={user.photoURL} alt={user.displayName} />
          <span className={styles.userName}>{customName || user.displayName}</span>
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
