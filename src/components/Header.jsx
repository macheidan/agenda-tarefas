import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import logoUrl from '../imgs/logo.png';
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
  tabsOrder,
}) {
  const TABS_DEF = {
    calendar: { enabled: calendarEnabled, key: 'calendar', label: 'Calendário' },
    reels: { enabled: reelsEnabled, key: 'reels', label: 'Instagram' },
    contentPlan: { enabled: contentPlanEnabled, key: 'contentPlan', label: 'Content Plan' },
    notes: { enabled: notesEnabled, key: 'notes', label: 'Anotações' },
    shopping: { enabled: shoppingListEnabled, key: 'shopping', label: 'Lista de Compras' },
    ideas: {
      enabled: ideasEnabled,
      key: 'ideas',
      label: 'Ideias',
      badge: ideasUnread > 0 ? <span className={styles.bellBadge}>🔔</span> : null,
    },
    reviews: {
      enabled: reviewsEnabled,
      key: 'reviews',
      label: 'Avaliações',
      badge: reviewsUnread > 0 ? <span className={styles.sirenBadge}>🚨</span> : null,
    },
    knowledge: { enabled: knowledgeEnabled, key: 'knowledge', label: 'Conhecimento' },
  };
  const orderedTabs = (tabsOrder && tabsOrder.length ? tabsOrder : Object.keys(TABS_DEF))
    .map((k) => TABS_DEF[k])
    .filter((t) => t && t.enabled);
  const { user, logout, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark'
      : 'light'
  );
  const menuRef = useRef(null);
  const tabsRef = useRef(null);

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

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // ignore storage errors
    }
    if (next === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  };

  useEffect(() => {
    const container = tabsRef.current;
    if (!container) return;
    const active = container.querySelector(`.${styles.active}`);
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeTab]);

  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <h1 className={styles.logo}>
          <img className={styles.logoImg} src={logoUrl} alt="" />
          <span className={styles.logoText}>Intranet Dáme &amp; Lov</span>
        </h1>
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
          <button
            className={styles.themeBtn}
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            aria-label="Alternar tema"
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
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
        <div className={styles.tabs} ref={tabsRef}>
          {orderedTabs.map((t) => (
            <button
              key={t.key}
              className={`${styles.tab} ${activeTab === t.key ? styles.active : ''}`}
              onClick={() => onTabChange(t.key)}
            >
              {t.label}
              {t.badge}
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
}
