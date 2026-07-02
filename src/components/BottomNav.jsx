import { useState } from 'react';
import styles from '../styles/BottomNav.module.css';

// Ícones (stroke = currentColor) por chave de seção.
const I = {
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  reels: <><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></>,
  contentPlan: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
  influencers: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  notes: <><path d="M5 3h14v18H5z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  shopping: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></>,
  ideas: <><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" /></>,
  reviews: <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 21.4l1.4-6.8L2.2 9.9l6.9-.8L12 2z" />,
  knowledge: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  precosInsumos: <><path d="M20.6 13.4L13.4 20.6a2 2 0 0 1-2.8 0l-8.2-8.2V2h10.4l8.2 8.2a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" /></>,
  departamentoPessoal: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><rect x="16" y="3" width="6" height="8" rx="1" /></>,
  completed: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
};

const Icon = ({ k }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {I[k] || I.contentPlan}
  </svg>
);

/**
 * Barra de navegação inferior (mobile). Mostra as 4 primeiras seções + "Mais",
 * que abre uma folha com o restante. tabs = [{ key, label, badge }].
 */
export default function BottomNav({ tabs, activeTab, onTabChange }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const primary = tabs.slice(0, 4);
  const rest = tabs.slice(4);
  const restActive = rest.some((t) => t.key === activeTab);

  const go = (key) => {
    setSheetOpen(false);
    onTabChange(key);
  };

  return (
    <>
      {sheetOpen && <div className={styles.backdrop} onClick={() => setSheetOpen(false)} />}
      {sheetOpen && (
        <div className={styles.sheet} role="menu">
          <div className={styles.sheetGrip} />
          <div className={styles.sheetGrid}>
            {rest.map((t) => (
              <button
                key={t.key}
                className={`${styles.sheetItem} ${activeTab === t.key ? styles.sheetItemOn : ''}`}
                onClick={() => go(t.key)}
              >
                <span className={styles.sheetIcon}><Icon k={t.key} /></span>
                {t.label}
                {t.badge}
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className={styles.bar}>
        {primary.map((t) => (
          <button
            key={t.key}
            className={`${styles.item} ${activeTab === t.key ? styles.on : ''}`}
            onClick={() => go(t.key)}
          >
            <span className={styles.icon}><Icon k={t.key} />{t.badge}</span>
            <span className={styles.label}>{t.label}</span>
          </button>
        ))}
        {rest.length > 0 && (
          <button
            className={`${styles.item} ${restActive || sheetOpen ? styles.on : ''}`}
            onClick={() => setSheetOpen((v) => !v)}
          >
            <span className={styles.icon}>
              <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
            </span>
            <span className={styles.label}>Mais</span>
          </button>
        )}
      </nav>
    </>
  );
}
