import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  PLANILHA_CSV_URL, parsePlanilha, DEFAULT_MARGEM_CONFIG, mergeMargemConfig,
} from '../lib/margemPlanilha';

// Hook da sub-seção Margem (Preços): lê a planilha CARDAPIOS direto do Google
// (CSV público — sempre fresco a cada visita) e a config de taxas compartilhada
// em cmvConfig/margem (Firestore, escrita restrita a admin/editor de compras).
export function useMargem() {
  const [planilha, setPlanilha] = useState(null); // { bases, sabores }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(PLANILHA_CSV_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setPlanilha(parsePlanilha(await res.text()));
      setFetchedAt(new Date());
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const [config, setConfig] = useState(DEFAULT_MARGEM_CONFIG);
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'cmvConfig', 'margem'),
      (snap) => { if (snap.exists()) setConfig(mergeMargemConfig(snap.data())); },
      () => {}
    );
    return unsub;
  }, []);

  // Grava a config inteira (doc pequeno). Otimista: aplica local antes; se as
  // rules barrarem (não é admin/editor), avisa e o snapshot corrige.
  const saveConfig = useCallback(async (next) => {
    const merged = mergeMargemConfig(next);
    setConfig(merged);
    try {
      await setDoc(doc(db, 'cmvConfig', 'margem'), merged);
    } catch (e) {
      alert('Sem permissão para salvar as taxas: ' + (e?.message || e));
    }
  }, []);

  return { planilha, loading, error, fetchedAt, refresh, config, saveConfig };
}
