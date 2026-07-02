import styles from './Button.module.css';

/**
 * Botão canônico do design system.
 * variant: primary | secondary | ghost | danger | dangerSolid
 * size: md | sm
 * block: ocupa 100% da largura
 * square: botão-ícone quadrado
 * as: elemento/componente a renderizar (ex.: 'a')
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  square = false,
  as = 'button',
  className = '',
  children,
  ...rest
}) {
  const Comp = as;
  const cls = [
    styles.btn,
    styles[variant],
    styles[size],
    block && styles.block,
    square && styles.square,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Comp className={cls} {...rest}>
      {children}
    </Comp>
  );
}
