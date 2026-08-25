import { useCallback, useEffect, useState } from 'react';

// JSON do coletor Python (Hub), publicado por FTP em fabiomachado.com.br/pizzas/
// data/ — mesmo feed do dashboard antigo. O nome do arquivo carrega um token
// (VITE_DASH_TOKEN) porque a pasta é estática e sem auth: o token deixa a URL
// não-adivinhável. O CORS pra damepizza.com.br vem de um .htaccess na pasta.
const TOKEN = import.meta.env.VITE_DASH_TOKEN;
const DATA_URL = TOKEN
  ? `https://fabiomachado.com.br/pizzas/data/dashboard-data-${TOKEN}.json`
  : null;

/**
 * Feed do Dash e do mês corrente da Mesa do Dono: vendas diárias (sales_days /
 * sales_month), agenda, notícias, feeds, GitHub, Instagram etc.
 */
export function useDashFeed() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!DATA_URL) {
      setError('VITE_DASH_TOKEN ausente no .env');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
