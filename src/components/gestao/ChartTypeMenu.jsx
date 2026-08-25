import { useEffect, useRef, useState } from 'react';
import styles from '../../styles/Gestao.module.css';

// Ícones dos tipos de gráfico (stroke = currentColor, 24×24, sem lib).
const ICON_PATHS = {
  linha: <path d="M3 17l6-6 4 4 8-8" />,
  degrau: <path d="M3 19h5v-6h5V7h8" />,
  area: <><path d="M3 17l6-6 4 4 8-8" /><path d="M3 21h18" /></>,
  area_emp: <><path d="M3 13l6-4 4 3 8-6" /><path d="M3 18l6-3 4 2 8-4" /><path d="M3 21h18" /></>,
  barras: <><rect x="4" y="11" width="4" height="9" /><rect x="10" y="6" width="4" height="14" /><rect x="16" y="14" width="4" height="6" /></>,
  barras_emp: <><rect x="5" y="4" width="5" height="16" /><path d="M5 12h5" /><rect x="14" y="8" width="5" height="12" /><path d="M14 14h5" /></>,
  rosca: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
  pizza: <><circle cx="12" cy="12" r="9" /><path d="M12 3v9l6.5 6.2" /></>,
  barras_h: <><rect x="4" y="5" width="14" height="3.5" /><rect x="4" y="10.5" width="9" height="3.5" /><rect x="4" y="16" width="5" height="3.5" /></>,
  treemap: <><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M12 3v18M12 12h9M3 15h9" /></>,
  funil: <path d="M4 4h16l-6 8v7l-4-2v-5L4 4z" />,
};

export function ChartTypeIcon({ k }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[k] || ICON_PATHS.linha}
    </svg>
  );
}

/** Botão ao lado do título do gráfico: ícone do tipo atual + menu com os demais. */
export function ChartTypeMenu({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const active = options.find((o) => o.id === value) ?? options[0];

  return (
    <div className={styles.chartMenu} ref={ref}>
      <button
        type="button"
        className={styles.miniBtn}
        onClick={() => setOpen((v) => !v)}
        title="Mudar tipo de gráfico"
        aria-label="Mudar tipo de gráfico"
      >
        <ChartTypeIcon k={active.id} />
      </button>
      {open && (
        <div className={styles.chartMenuList}>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`${styles.chartMenuItem} ${o.id === value ? styles.chartMenuItemActive : ''}`}
              onClick={() => { onChange(o.id); setOpen(false); }}
            >
              <ChartTypeIcon k={o.id} />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
