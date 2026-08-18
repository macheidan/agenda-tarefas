// Proxy do Gemini pra intranet (damepizza.com.br/intranet).
// A chave da API vive SÓ aqui (env GEMINI_API_KEY) — o cliente nunca a vê.
// Auth: ID token do Firebase no Authorization; só usuário aprovado
// (users/{uid}.approved == true) ou o admin passa — espelho das firestore.rules.
//
// Envs (Vercel): GEMINI_API_KEY, FIREBASE_SERVICE_ACCOUNT (JSON), ADMIN_EMAIL.
import { cors, autenticar } from '../lib/auth.js';

// Mesmos modelos oferecidos no cliente; nada fora da lista passa.
const ALLOWED_MODELS = [
  'gemini-3.0-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'método não permitido' });

  if (!(await autenticar(req, res))) return;

  const { model, contents, systemInstruction, generationConfig } = req.body || {};
  if (!ALLOWED_MODELS.includes(model)) return res.status(400).json({ error: 'modelo inválido' });
  if (!Array.isArray(contents) || !contents.length) {
    return res.status(400).json({ error: 'contents vazio' });
  }
  if (JSON.stringify(contents).length > 400_000) {
    return res.status(413).json({ error: 'conversa longa demais' });
  }

  const body = { contents };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: String(systemInstruction) }] };
  if (generationConfig) body.generationConfig = generationConfig;

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    }
  );

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    // Repassa o status (429/503) na mensagem: o retry/fallback do cliente lê isso.
    const msg = data?.error?.message || 'erro no Gemini';
    return res.status(upstream.status).json({ error: msg });
  }

  const text = (data.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || '')
    .join('');
  return res.status(200).json({ text });
}
