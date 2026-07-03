import { useState } from 'react';
import { TabIcon as Icon } from './tabIcons';
import styles from '../styles/BottomNav.module.css';

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
