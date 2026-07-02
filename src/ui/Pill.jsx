import styles from './Pill.module.css';

/**
 * Etiqueta de status/estado.
 * tone: neutral | accent | ok | warn | bad
 * dot: mostra um pontinho colorido antes do texto
 */
export default function Pill({ tone = 'neutral', dot = false, className = '', children }) {
  const cls = [styles.pill, styles[tone], className].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  );
}
