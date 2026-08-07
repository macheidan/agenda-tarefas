// Proxy do Gemini pra intranet (damepizza.com.br/intranet).
// A chave da API vive SÓ aqui (env GEMINI_API_KEY) — o cliente nunca a vê.
// Auth: ID token do Firebase no Authorization; só usuário aprovado
// (users/{uid}.approved == true) ou o admin passa — espelho das firestore.rules.
//
// Envs (Vercel): GEMINI_API_KEY, FIREBASE_SERVICE_ACCOUNT (JSON), ADMIN_EMAIL.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ALLOWED_ORIGINS = [
  'https://damepizza.com.br',
  'https://www.damepizza.com.br',
  'http://localhost:5173',
  'http://localhost:4173',
];

// Mesmos modelos oferecidos no cliente; nada fora da lista passa.
const ALLOWED_MODELS = [
  'gemini-3.0-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

// Aprovação custa 1 read por chamada; um cache curto por instância segura a
// quota do free tier sem deixar um usuário desativado durar mais que 5 min.
const approvedCache = new Map(); // uid -> { ok, exp }
const CACHE_MS = 5 * 60 * 1000;

function app() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
}

async function isApproved(decoded) {
  if (decoded.email === (process.env.ADMIN_EMAIL || 'machadofabio@gmail.com')) return true;
  const hit = approvedCache.get(decoded.uid);
  if (hit && hit.exp > Date.now()) return hit.ok;
  const snap = await getFirestore().doc(`users/${decoded.uid}`).get();
  const ok = snap.exists && snap.data().approved === true;
  approvedCache.set(decoded.uid, { ok, exp: Date.now() + CACHE_MS });
  return ok;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'método não permitido' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'sem token' });

  let decoded;
  try {
    app();
    decoded = await getAuth().verifyIdToken(token);
  } catch {
    return res.status(401).json({ error: 'token inválido' });
  }
  if (!(await isApproved(decoded))) {
    return res.status(403).json({ error: 'usuário não aprovado' });
  }

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
