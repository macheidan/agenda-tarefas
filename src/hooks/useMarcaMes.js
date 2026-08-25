import { useState, useCallback } from 'react';
import { currentAnoMes, previousAnoMes, MARCAS } from '../lib/gestao';

// Marca ativa (dame | lov | consolidado) + mês ativo (YYYY-MM) das views de
// Gestão, persistidos em localStorage pra sobreviver ao F5 e valer entre as
// abas (Mesa do Dono, Vendas, DRE). Só uma view monta por vez, então a
// persistência basta como sincronização.
const MARCA_KEY = 'gestao:marca';
const MES_KEY = 'gestao:anoMes';

const marcaValida = (m) => MARCAS.some((x) => x.id === m);
const mesValido = (s) => /^\d{4}-\d{2}$/.test(s || '');

export function useMarcaMes() {
  const [marca, setMarcaState] = useState(() => {
    try {
      const saved = localStorage.getItem(MARCA_KEY);
      return marcaValida(saved) ? saved : 'consolidado';
    } catch { return 'consolidado'; }
  });

  // Default: mês anterior (fechamento mais recente disponível).
  const [anoMes, setAnoMesState] = useState(() => {
    try {
      const saved = localStorage.getItem(MES_KEY);
      return mesValido(saved) ? saved : previousAnoMes(currentAnoMes());
    } catch { return previousAnoMes(currentAnoMes()); }
  });

  const setMarca = useCallback((m) => {
    if (!marcaValida(m)) return;
    setMarcaState(m);
    try { localStorage.setItem(MARCA_KEY, m); } catch { /* só não persiste */ }
  }, []);

  const setAnoMes = useCallback((s) => {
    if (!mesValido(s)) return;
    setAnoMesState(s);
    try { localStorage.setItem(MES_KEY, s); } catch { /* só não persiste */ }
  }, []);

  return { marca, setMarca, anoMes, setAnoMes };
}
