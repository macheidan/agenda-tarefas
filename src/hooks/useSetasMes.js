import { useEffect, useRef } from 'react';

// Seta ←/→ troca de mês (mesmo que clicar em ‹ ›). Não rouba a seta de quem
// está digitando num campo nem combinações com Alt/Ctrl/Shift/Meta.
export default function useSetasMes(prevMonth, nextMonth, enabled = true) {
  const ref = useRef({ prevMonth, nextMonth });
  ref.current = { prevMonth, nextMonth };

  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (ev) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      const t = ev.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      ev.preventDefault();
      if (ev.key === 'ArrowLeft') ref.current.prevMonth();
      else ref.current.nextMonth();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
