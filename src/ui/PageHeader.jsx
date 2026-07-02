import styles from './PageHeader.module.css';

/**
 * Cabeçalho de seção padronizado: título + subtítulo opcional + ações.
 * Unifica os dois padrões que existiam (simples vs sticky com borda).
 * No mobile empilha e as ações ocupam a largura toda.
 */
export default function PageHeader({ title, subtitle, actions, sticky = false }) {
  const cls = [styles.header, sticky && styles.sticky].filter(Boolean).join(' ');
  return (
    <header className={cls}>
      <div className={styles.titles}>
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
