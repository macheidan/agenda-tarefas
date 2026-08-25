import styles from '../../styles/Gestao.module.css';

// KPI card + chip de variação das views de Gestão (padrão TailAdmin do
// dashboard antigo, refeito com as vars da casa).

const ArrowUp = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17L17 7M8 7h9v9" />
  </svg>
);

const ArrowDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 7l10 10M17 8v9H8" />
  </svg>
);

/** Chip de variação percentual. `invert` pra métricas onde subir é ruim. */
export function DeltaChip({ label, value, invert = false }) {
  if (value === null || value === undefined) {
    return (
      <span className={`${styles.deltaChip} ${styles.deltaNeutral}`}>
        {label ? `${label}: —` : '—'}
      </span>
    );
  }
  const up = value >= 0;
  const good = invert ? !up : up;
  return (
    <span className={`${styles.deltaChip} ${good ? styles.deltaUp : styles.deltaDown}`}>
      {up ? <ArrowUp /> : <ArrowDown />}
      {label && <span>{label}</span>}
      <span>
        {`${value > 0 ? '+' : ''}${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
      </span>
    </span>
  );
}

/** Card de métrica: ícone colorido, label + valor, chips de delta, rodapé. */
export function KpiCard({ icon, iconColor, label, value, deltas, footer, negative }) {
  return (
    <div className={styles.kpiCard}>
      {icon && (
        <div
          className={styles.kpiIcon}
          style={iconColor ? { background: `${iconColor}15`, color: iconColor } : { background: 'var(--badge-bg)', color: 'var(--text)' }}
        >
          {icon}
        </div>
      )}
      <div className={styles.kpiRow}>
        <div>
          <span className={styles.kpiLabel}>{label}</span>
          <h4 className={`${styles.kpiValue} ${negative ? styles.kpiValueNegative : ''}`}>{value}</h4>
        </div>
        {deltas && <div className={styles.kpiDeltas}>{deltas}</div>}
      </div>
      {footer && <div className={styles.kpiFooter}>{footer}</div>}
    </div>
  );
}
