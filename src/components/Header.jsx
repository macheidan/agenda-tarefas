import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/Header.module.css';

export default function Header({
  activeTab,
  onTabChange,
  onNewTask,
  users,
  selectedUid,
  onSelectUser,
  totalUnread,
}) {
  const { user, logout, isAdmin } = useAuth();

  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <h1 className={styles.logo}>Agenda de Tarefas</h1>
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
              className={`${styles.archivedBtn} ${activeTab === 'archived' ? styles.archivedActive : ''}`}
              onClick={() => onTabChange('archived')}
            >
              Arquivados
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
          <button
            className={`${styles.tab} ${activeTab === 'calendar' ? styles.active : ''}`}
            onClick={() => onTabChange('calendar')}
          >
            Calendário
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'kanban' ? styles.active : ''}`}
            onClick={() => onTabChange('kanban')}
          >
            Kanban
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'chat' ? styles.active : ''}`}
            onClick={() => onTabChange('chat')}
          >
            Chat
            {totalUnread > 0 && <span className={styles.bellBadge}>🔔</span>}
          </button>
        </div>
        <button className={styles.newBtn} onClick={onNewTask}>
          + Nova
        </button>
      </nav>
    </header>
  );
}
