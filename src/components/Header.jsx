import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import styles from '../styles/Header.module.css';

export default function Header({
  activeTab,
  onTabChange,
  users,
  selectedUid,
  onSelectUser,
  calendarEnabled,
  ideasEnabled,
  reelsEnabled,
  contentPlanEnabled,
  notesEnabled,
  shoppingListEnabled,
  reviewsEnabled,
  knowledgeEnabled,
  ideasUnread,
  reviewsUnread,
  onOpenMessage,
  completedCount,
  customName,
  allSettings,
}) {
  const { user, logout, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

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
              className={`${styles.bellBtn} ${completedCount > 0 ? styles.bellBtnActive : ''} ${activeTab === 'completed' ? styles.bellBtnSelected : ''}`}
              onClick={() => onTabChange('completed')}
              title="Concluídos"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {completedCount > 0 && <span className={styles.bellCount}>{completedCount}</span>}
            </button>
          )}

          <div className={styles.avatarMenu} ref={menuRef}>
            <button
              className={styles.avatarBtn}
              onClick={() => setMenuOpen((v) => !v)}
              title={customName || user.displayName}
            >
              <img className={styles.avatar} src={user.photoURL} alt={user.displayName} />
            </button>
            {menuOpen && (
              <div className={styles.dropdown}>
                <div className={styles.dropdownHeader}>
                  {customName || user.displayName}
                </div>
                {isAdmin && (
                  <button
                    className={styles.dropdownItem}
                    onClick={() => { setMenuOpen(false); onTabChange('settings'); }}
                  >
                    Configurações
                  </button>
                )}
                {isAdmin && (
                  <button
                    className={styles.dropdownItem}
                    onClick={() => { setMenuOpen(false); onOpenMessage(); }}
                  >
                    Mensagem
                  </button>
                )}
                <button
                  className={styles.dropdownItem}
                  onClick={() => { setMenuOpen(false); logout(); }}
                >
                  Sair
                </button>
              </div>
            )}
          </div>
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
          {reelsEnabled && (
            <button
              className={`${styles.tab} ${activeTab === 'reels' ? styles.active : ''}`}
              onClick={() => onTabChange('reels')}
            >
              Instagram
            </button>
          )}
          {contentPlanEnabled && (
            <button
              className={`${styles.tab} ${activeTab === 'contentPlan' ? styles.active : ''}`}
              onClick={() => onTabChange('contentPlan')}
            >
              Content Plan
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
          {ideasEnabled && (
            <button
              className={`${styles.tab} ${activeTab === 'ideas' ? styles.active : ''}`}
              onClick={() => onTabChange('ideas')}
            >
              Ideias
              {ideasUnread > 0 && <span className={styles.bellBadge}>🔔</span>}
            </button>
          )}
          {reviewsEnabled && (
            <button
              className={`${styles.tab} ${activeTab === 'reviews' ? styles.active : ''}`}
              onClick={() => onTabChange('reviews')}
            >
              Avaliações
              {reviewsUnread > 0 && <span className={styles.sirenBadge}>🚨</span>}
            </button>
          )}
          {knowledgeEnabled && (
            <button
              className={`${styles.tab} ${activeTab === 'knowledge' ? styles.active : ''}`}
              onClick={() => onTabChange('knowledge')}
            >
              Conhecimento
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
