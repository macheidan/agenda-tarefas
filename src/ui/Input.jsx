import styles from './Input.module.css';

/** Rótulo + campo + dica, empilhados. */
export function Field({ label, hint, htmlFor, className = '', children }) {
  return (
    <label htmlFor={htmlFor} className={`${styles.field} ${className}`.trim()}>
      {label && <span className={styles.label}>{label}</span>}
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}

export function Input({ className = '', ...rest }) {
  return <input className={`${styles.control} ${className}`.trim()} {...rest} />;
}

export function Textarea({ className = '', ...rest }) {
  return <textarea className={`${styles.control} ${styles.textarea} ${className}`.trim()} {...rest} />;
}

export function Select({ className = '', children, ...rest }) {
  return (
    <select className={`${styles.control} ${styles.select} ${className}`.trim()} {...rest}>
      {children}
    </select>
  );
}
