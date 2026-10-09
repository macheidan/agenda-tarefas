import { useCallback, useEffect, useState } from 'react';
import { auth } from '../firebase';

// Fila da planilha AGENDAMENTO SOCIAL (skill /mkt-social-agendamento). O web app
// do Apps Script exige uma chave que só o proxy conhece; o browser manda o ID
// token do Firebase, como no Dash.
const FEED_URL =
  import.meta.env.VITE_POSTAGENS_URL ||
  'https://gemini-proxy-intranet.vercel.app/api/postagens';

/** Postagens agendadas e publicadas: `{ itens: [{ id, marca, tipo, quando, status, ... }], lido }`. */
export function usePostagens() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('não autenticado');
      const token = await user.getIdToken();
      const res = await fetch(FEED_URL, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        const corpo = await res.json().catch(() => ({}));
        throw new Error(corpo.error || `HTTP ${res.status}`);
      }
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { itens: data?.itens || [], lido: data?.lido || null, loading, error, reload: load };
}
