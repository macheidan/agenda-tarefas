import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { TabIcon } from '../tabIcons';
import styles from '../../styles/AppShellV2.module.css';

/**
 * Shell da v2 — port do 02-layout.md do spec-kit (TailAdmin):
 * sidebar 290px fixa (drawer no mobile) + topbar 72px sticky + conteúdo.
 *
 * Recebe as MESMAS props do Header legado e renderiza `children` na área de
 * conteúdo. Só é montado quando IS_V2; a v1 segue no Header horizontal.
 *
 * Diferença de navegação em relação à v1: o kit agrupa os itens em seções
 * rotuladas na sidebar. A ordem custom do usuário (useTabsOrder/SettingsView)
 * é respeitada DENTRO de cada grupo.
 */

// Grupos da sidebar (spec: label uppercase por seção). Um item que não caia em
// nenhum grupo entra em "Outros" — assim aba nova nunca some do menu.
const NAV_GROUPS = [
  { label: 'Operação', keys: ['calendar', 'shopping', 'precosInsumos'] },
  { label: 'Equipe', keys: ['departamentoPessoal', 'motoboys'] },
  { label: 'Marketing', keys: ['reels', 'contentPlan', 'influencers', 'reviews'] },
  { label: 'Ferramentas', keys: ['notes', 'ideas', 'knowledge'] },
];

export default function AppShellV2({
  children,
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
  influencersEnabled,
  precosInsumosEnabled,
  departamentoPessoalEnabled,
  motoboysEnabled,
  ideasUnread,
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
    influencers: { enabled: influencersEnabled, key: 'influencers', label: 'Influencers' },
    notes: { enabled: notesEnabled, key: 'notes', label: 'Anotações' },
    shopping: { enabled: shoppingListEnabled, key: 'shopping', label: 'Compras' },
    ideas: { enabled: ideasEnabled, key: 'ideas', label: 'Ideias', unread: ideasUnread },
    reviews: { enabled: reviewsEnabled, key: 'reviews', label: 'Avaliações' },
    knowledge: { enabled: knowledgeEnabled, key: 'knowledge', label: 'Conhecimento' },
    precosInsumos: { enabled: precosInsumosEnabled, key: 'precosInsumos', label: 'Preços' },
    departamentoPessoal: { enabled: departamentoPessoalEnabled, key: 'departamentoPessoal', label: 'Depto Pessoal' },
    motoboys: { enabled: motoboysEnabled, key: 'motoboys', label: 'Motoboys' },
  };

  // Ordem custom do usuário, aplicada dentro de cada grupo.
  const order = tabsOrder && tabsOrder.length ? tabsOrder : Object.keys(TABS_DEF);
  const rank = (k) => {
    const i = order.indexOf(k);
    return i === -1 ? 999 : i;
  };
  const grouped = NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.keys
      .map((k) => TABS_DEF[k])
      .filter((t) => t && t.enabled)
      .sort((a, b) => rank(a.key) - rank(b.key)),
  })).filter((g) => g.items.length > 0);

  const knownKeys = new Set(NAV_GROUPS.flatMap((g) => g.keys));
  const outros = Object.values(TABS_DEF)
    .filter((t) => t.enabled && !knownKeys.has(t.key))
    .sort((a, b) => rank(a.key) - rank(b.key));
  if (outros.length) grouped.push({ label: 'Outros', items: outros });

  const { user, logout, isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Retração da sidebar no desktop (faixa de ícones), igual ao dashboard_pizzarias.
  const [collapsed, setCollapsed] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem('sidebar:collapsed') === '1'
  );
  const [theme, setTheme] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'dark'
      : 'light'
  );
  const menuRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem('sidebar:collapsed', collapsed ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, [collapsed]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // Trocar de aba fecha o drawer (mobile). No handler, não num efeito —
  // efeito aqui dispararia render em cascata a cada troca de aba.
  const handleTabChange = (k) => {
    onTabChange(k);
    setDrawerOpen(false);
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // ignore storage errors
    }
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  };

  return (
    <div className={styles.shell}>
      <button
        type="button"
        aria-label="Fechar menu"
        className={`${styles.overlay} ${drawerOpen ? styles.overlayOpen : ''}`}
        onClick={() => setDrawerOpen(false)}
      />

      <aside
        className={`${styles.sidebar} ${drawerOpen ? styles.sidebarOpen : ''} ${collapsed ? styles.sidebarCollapsed : ''}`}
      >
        <div className={styles.logo}>
          <div className={styles.logoBrand}>
            <span className={styles.logoMark}>D</span>
            <span className={styles.logoText}>Dáme &amp; Lov</span>
          </div>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expandir menu' : 'Retrair menu'}
            title={collapsed ? 'Expandir menu' : 'Retrair menu'}
          >
            {collapsed ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M9 3v18" />
                <path d="m14 9 3 3-3 3" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M9 3v18" />
                <path d="m16 15-3-3 3-3" />
              </svg>
            )}
          </button>
        </div>

        <nav className={styles.nav}>
          {grouped.map((g) => (
            <div key={g.label}>
              <div className={styles.navGroupLabel}>{g.label}</div>
              {g.items.map((t) => (
                <button
                  key={t.key}
                  className={`${styles.navItem} ${activeTab === t.key ? styles.navItemActive : ''}`}
                  onClick={() => handleTabChange(t.key)}
                  title={collapsed ? t.label : undefined}
                >
                  <span className={styles.navIcon}><TabIcon k={t.key} /></span>
                  <span className={styles.navLabel}>{t.label}</span>
                  {t.unread > 0 && (
                    <span className={`${styles.navBadge} ${styles.navBadgeAlert}`}>{t.unread}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className={styles.mainCol}>
        <header className={styles.topbar}>
          <button
            className={styles.hamburger}
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="Abrir menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>

          <div className={styles.topbarRight}>
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
              className={styles.iconBtn}
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
                className={`${styles.iconBtn} ${activeTab === 'completed' ? styles.iconBtnSelected : ''}`}
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
                  <div className={styles.dropdownHeader}>{customName || user.displayName}</div>
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
        </header>

        <div className={styles.content}>
          <div className={styles.contentInner}>{children}</div>
        </div>
      </div>
    </div>
  );
}
