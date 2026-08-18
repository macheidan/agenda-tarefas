import { auth } from '../firebase';

// Proxy serverless do WhatsApp Cloud API (Vercel, projeto gemini-proxy-intranet).
// O token permanente da Meta vive só lá; daqui vai o ID token do Firebase, que
// o proxy valida e confere contra a flag `clientesEnviar`.
const SEND_URL =
  import.meta.env.VITE_WA_SEND_URL ||
  'https://gemini-proxy-intranet.vercel.app/api/wa-send';

// Tamanho do lote. Não é gosto: uma função serverless tem poucos segundos de
// execução, e é o lote que dá progresso na tela e permite retomar de onde parou.
export const LOTE = 20;

/** Pausa entre lotes — evita bater no limite de taxa da Meta num disparo longo. */
export const PAUSA_MS = 1000;

export async function enviarLote({ campanhaId, loja, template, idioma, destinatarios, meta }) {
  const user = auth.currentUser;
  if (!user) throw new Error('401 não autenticado');
  const token = await user.getIdToken();
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ campanhaId, loja, template, idioma, destinatarios, meta }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${data.error || res.statusText}`);
  return data;
}

/** ID de campanha legível: dame-2026-08-18-a1b2. */
export function novaCampanhaId(loja) {
  const hoje = new Date().toISOString().slice(0, 10);
  const sufixo = Math.random().toString(36).slice(2, 6);
  return `${loja}-${hoje}-${sufixo}`;
}
