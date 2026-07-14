import { useEffect, useState } from 'react';

// Detecta deploy novo comparando o hash do bundle no index.html publicado.
// Ao voltar pra aba (visibilitychange) com versão nova → recarrega na hora
// (ninguém está digitando). Com a aba aberta, o polling só liga o aviso,
// e o Dashboard mostra um botão "Atualizar".
const POLL_MS = 5 * 60 * 1000;

async function fetchBundleHash() {
  try {
    const res = await fetch('/', { cache: 'no-store' });
    const html = await res.text();
    const m = html.match(/assets\/index-([\w-]+)\.js/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function useVersionCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let hashInicial = null;
    let cancelado = false;

    const checar = async (recarregarSeNovo) => {
      const hash = await fetchBundleHash();
      if (cancelado || !hash) return;
      if (!hashInicial) {
        hashInicial = hash;
        return;
      }
      if (hash !== hashInicial) {
        if (recarregarSeNovo) window.location.reload();
        else setUpdateAvailable(true);
      }
    };

    checar(false);
    const timer = setInterval(() => checar(false), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') checar(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelado = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { updateAvailable, reload: () => window.location.reload() };
}
