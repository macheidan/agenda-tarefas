import { useState } from 'react';
import { formatNumberBR, parseBRL } from '../utils/money';

// Input de valor em R$ que só comita (parseBRL → Number|null) no blur ou Enter.
// Mantém o texto cru enquanto o usuário digita e reformata ao sair do campo.
// `normalize` (opcional) ajusta o valor no commit — precisa rodar aqui, e não no
// onCommit, senão o texto exibido fica diferente do que foi gravado.
export default function MoneyInput({ value, onCommit, disabled, placeholder = '—', className, normalize }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value == null ? '' : formatNumberBR(value));
  // Quando o valor externo muda e não estamos editando, ressincroniza o texto
  // durante o render (padrão recomendado em vez de setState num effect).
  const [lastValue, setLastValue] = useState(value);
  if (!editing && value !== lastValue) {
    setLastValue(value);
    setText(value == null ? '' : formatNumberBR(value));
  }

  const reset = () => setText(value == null ? '' : formatNumberBR(value));

  const commit = () => {
    setEditing(false);
    const raw = parseBRL(text);
    const parsed = normalize ? normalize(raw) : raw;
    setText(parsed == null ? '' : formatNumberBR(parsed));
    const prev = value == null ? null : Number(value);
    if (parsed !== prev) onCommit(parsed);
  };

  return (
    <input
      className={className}
      inputMode="decimal"
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { setEditing(false); reset(); e.currentTarget.blur(); }
      }}
    />
  );
}
