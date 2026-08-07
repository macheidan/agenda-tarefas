import { auth } from '../firebase';

// Proxy serverless do Gemini (Vercel, projeto gemini-proxy-intranet). A chave
// da API vive só lá; aqui vai o ID token do Firebase, que o proxy valida e
// checa aprovação antes de repassar ao Gemini.
const PROXY_URL =
  import.meta.env.VITE_GEMINI_PROXY_URL ||
  'https://gemini-proxy-intranet.vercel.app/api/generate';

// Chama o modelo e devolve o texto da resposta. Erros viram Error com o status
// HTTP na mensagem — o retry/fallback dos hooks lê '429'/'503' de lá.
export async function callGemini({ model, contents, systemInstruction, generationConfig }) {
  const user = auth.currentUser;
  if (!user) throw new Error('401 não autenticado');
  const token = await user.getIdToken();
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ model, contents, systemInstruction, generationConfig }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${data.error || res.statusText}`);
  return data.text || '';
}
