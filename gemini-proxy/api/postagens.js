// Fila de postagens agendadas (Instagram da Dáme e da Lov) para a aba
// Postagens, que só visualiza: quem agenda é a skill /mkt-social-agendamento e
// quem publica é o Apps Script da planilha AGENDAMENTO SOCIAL.
//
// O Apps Script expõe a aba FILA num web app (doGet) que exige uma chave; a
// chave vive só aqui. O browser chega com o ID token do Firebase, como no resto.
//
// Envs (Vercel): POSTAGENS_URL, POSTAGENS_KEY
//   (+ FIREBASE_SERVICE_ACCOUNT e ADMIN_EMAIL, compartilhados).
import { cors, autenticar } from '../lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'método não permitido' });

  // Mesma flag que liga a aba no Dashboard; admin passa sempre.
  const usuario = await autenticar(req, res, 'postagensEnabled');
  if (!usuario) return;

  const url = process.env.POSTAGENS_URL;
  const key = process.env.POSTAGENS_KEY;
  if (!url || !key) return res.status(500).json({ error: 'fila de postagens não configurada no servidor' });

  let upstream;
  try {
    // O web app responde com 302 para googleusercontent; fetch segue sozinho.
    upstream = await fetch(`${url}?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
  } catch {
    return res.status(502).json({ error: 'planilha de agendamento indisponível' });
  }
  if (!upstream.ok) return res.status(502).json({ error: `planilha respondeu ${upstream.status}` });

  const corpo = await upstream.json().catch(() => null);
  if (!corpo || corpo.error) {
    return res.status(502).json({ error: corpo?.error ? `planilha: ${corpo.error}` : 'resposta inválida da planilha' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(corpo);
}
