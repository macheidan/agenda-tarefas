import styles from './Card.module.css';

/**
 * Contêiner canônico (superfície).
 * padding: none | sm | md | lg
 * hover: realce ao passar o mouse (para cards clicáveis)
 */
export default function Card({
  as = 'div',
  padding = 'md',
  hover = false,
  className = '',
  children,
  ...rest
}) {
  const Comp = as;
  const cls = [styles.card, styles[`p-${padding}`], hover && styles.hover, className]
    .filter(Boolean)
    .join(' ');
  return (
    <Comp className={cls} {...rest}>
      {children}
    </Comp>
  );
}
