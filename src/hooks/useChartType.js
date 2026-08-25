import { useState } from 'react';

/**
 * Tipo de gráfico escolhido pelo usuário pra um gráfico específico, lembrado
 * entre sessões (localStorage `chart_type:<chartId>` — mesma chave do
 * dashboard antigo, então a preferência migra junto).
 */
export function useChartType(chartId, options, defaultType) {
  const storageKey = `chart_type:${chartId}`;
  const [type, setType] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored && options.some((o) => o.id === stored)) return stored;
    } catch { /* localStorage indisponível */ }
    return defaultType;
  });

  const set = (t) => {
    setType(t);
    try { localStorage.setItem(storageKey, t); } catch { /* só não persiste */ }
  };
  return [type, set];
}
