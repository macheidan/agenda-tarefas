import styles from './SegmentedControl.module.css';

/**
 * Alternador de sub-seções (substitui os vários `.viewBtn/.storyBtn/.scriptBtn`).
 * options: [{ value, label }]
 */
export default function SegmentedControl({ options, value, onChange, className = '' }) {
  return (
    <div className={`${styles.wrap} ${className}`.trim()} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`${styles.seg} ${value === o.value ? styles.on : ''}`}
          onClick={() => onChange?.(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
