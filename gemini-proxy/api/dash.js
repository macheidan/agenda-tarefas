// Feed do Dash e da Mesa do Dono: venda diária das duas lojas, quebra por
// canal, agenda e os feeds do coletor (scripts/dash/runner.py, 03:00).
//
// Até 09/09/2026 o cliente buscava esse JSON direto em
// fabiomachado.com.br/pizzas/data/dashboard-data-<token>.json. Como o Vite
// embute VITE_* no bundle, o token ia junto e a URL era pública: qualquer um
// lia o faturamento sem login. Agora a pasta exige Basic auth, a credencial
// vive só aqui e o browser precisa do ID token do Firebase, como no resto.
//
// Envs (Vercel): DASH_JSON_URL, DASH_BASIC_USER, DASH_BASIC_PASS
//   (+ FIREBASE_SERVICE_ACCOUNT e ADMIN_EMAIL, compartilhados).
import { cors, autenticar, adminEmail } from '../lib/auth.js';

export default async function handler(req, res) {
  if (cors(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'método não permitido' });

  // Admin only, igual à UI (Dash e Mesa do Dono são `isAdmin &&` no Dashboard)
  // e às firestore.rules (fechamentos_mensais, dre_detalhes e vendas_itens são
  // exclusivas do admin). O feed traz o mesmo faturamento — não pode ser mais
  // aberto que as coleções.
  const usuario = await autenticar(req, res);
  if (!usuario) return;
  if (usuario.email !== adminEmail()) {
    return res.status(403).json({ error: 'sem permissão para esta ação' });
  }

  const url = process.env.DASH_JSON_URL;
  const basicUser = process.env.DASH_BASIC_USER;
  const basicPass = process.env.DASH_BASIC_PASS;
  if (!url || !basicUser || !basicPass) {
    return res.status(500).json({ error: 'feed do dash não configurado no servidor' });
  }

  const basic = Buffer.from(`${basicUser}:${basicPass}`).toString('base64');
  let upstream;
  try {
    upstream = await fetch(`${url}?t=${Date.now()}`, {
      headers: { Authorization: `Basic ${basic}` },
      cache: 'no-store',
    });
  } catch {
    return res.status(502).json({ error: 'feed do dash indisponível' });
  }

  if (!upstream.ok) {
    // 401 aqui é credencial do .htpasswd fora de sincronia com a env — não é
    // problema do usuário, então não repassa o 401 e confunde o cliente.
    return res.status(502).json({ error: `feed do dash respondeu ${upstream.status}` });
  }

  const texto = await upstream.text();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).send(texto);
}
