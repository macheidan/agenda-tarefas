import { useCallback, useEffect, useState } from 'react';
import { auth } from '../firebase';

// JSON do coletor Python (scripts/dash/runner.py, Task Scheduler 03:00),
// publicado por FTPS numa pasta que agora exige Basic auth. Quem lê é o proxy
// (gemini-proxy /api/dash), que valida o ID token do Firebase e guarda a
// credencial da pasta. Antes o cliente buscava o arquivo direto e o token da
// URL ia no bundle — ou seja, o faturamento estava aberto a qualquer um.
const FEED_URL =
  import.meta.env.VITE_DASH_FEED_URL ||
  'https://gemini-proxy-intranet.vercel.app/api/dash';

/**
 * Feed do Dash e do mês corrente da Mesa do Dono: vendas diárias (sales_days /
 * sales_month), agenda, notícias, feeds, GitHub, Instagram etc.
 */
export function useDashFeed() {
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

  return { data, loading, error, reload: load };
}
