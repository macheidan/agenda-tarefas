// Autenticação compartilhada pelos endpoints do proxy.
// Todo endpoint aqui é chamado pelo browser da intranet com o ID token do
// Firebase no Authorization — a checagem é o espelho das firestore.rules.
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ALLOWED_ORIGINS = [
  'https://damepizza.com.br',
  'https://www.damepizza.com.br',
  'http://localhost:5173',
  'http://localhost:4173',
];

// Aprovação custa 1 read por chamada; um cache curto por instância segura a
// quota sem deixar um usuário desativado durar mais que 5 min.
const approvedCache = new Map(); // uid -> { ok, exp }
const CACHE_MS = 5 * 60 * 1000;

export function app() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
}

export const adminEmail = () => process.env.ADMIN_EMAIL || 'machadofabio@gmail.com';

export async function isApproved(decoded) {
  if (decoded.email === adminEmail()) return true;
  const hit = approvedCache.get(decoded.uid);
  if (hit && hit.exp > Date.now()) return hit.ok;
  const snap = await getFirestore().doc(`users/${decoded.uid}`).get();
  const ok = snap.exists && snap.data().approved === true;
  approvedCache.set(decoded.uid, { ok, exp: Date.now() + CACHE_MS });
  return ok;
}

/** Flag booleana em settings/{uid} — mesma semântica do hasSettingFlag das rules. */
export async function hasSettingFlag(decoded, flag) {
  if (decoded.email === adminEmail()) return true;
  const snap = await getFirestore().doc(`settings/${decoded.uid}`).get();
  return snap.exists && snap.data()[flag] === true;
}

/** CORS + preflight. Devolve true quando a requisição já foi respondida. */
export function cors(req, res, metodos = 'POST, OPTIONS') {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', metodos);
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Valida o ID token e devolve o usuário, ou responde o erro e devolve null.
 * `flag` opcional exige também a permissão correspondente em settings/{uid}.
 */
export async function autenticar(req, res, flag) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).json({ error: 'sem token' });
    return null;
  }
  let decoded;
  try {
    app();
    decoded = await getAuth().verifyIdToken(token);
  } catch {
    res.status(401).json({ error: 'token inválido' });
    return null;
  }
  if (!(await isApproved(decoded))) {
    res.status(403).json({ error: 'usuário não aprovado' });
    return null;
  }
  if (flag && !(await hasSettingFlag(decoded, flag))) {
    res.status(403).json({ error: 'sem permissão para esta ação' });
    return null;
  }
  return decoded;
}
