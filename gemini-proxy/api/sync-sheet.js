// Dispara o Web App do Apps Script que puxa a planilha pro Firestore:
// ?alvo=dre (planilha DRE) ou ?alvo=vendas (VENDAS LOJAS).
//
// Até 09/09/2026 o botão "Atualizar da planilha" chamava o /exec direto do
// browser, com o token na query — e o Vite embutia URL e token no bundle
// público. Qualquer um podia disparar o sync em loop e queimar a quota de 6 min
// do Apps Script. Agora URL e token vivem só aqui, e quem chama precisa ser o
// admin: as coleções que o sync escreve (fechamentos_mensais, dre_detalhes,
// vendas_itens) já são exclusivas do admin nas firestore.rules.
//
// Envs (Vercel): SYNC_DRE_URL, SYNC_DRE_TOKEN, SYNC_VENDAS_URL, SYNC_VENDAS_TOKEN
import { cors, autenticar, adminEmail } from '../lib/auth.js';

const ALVOS = {
  dre: ['SYNC_DRE_URL', 'SYNC_DRE_TOKEN'],
  vendas: ['SYNC_VENDAS_URL', 'SYNC_VENDAS_TOKEN'],
};

export default async function handler(req, res) {
  if (cors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'método não permitido' });

  const usuario = await autenticar(req, res);
  if (!usuario) return;
  if (usuario.email !== adminEmail()) {
    return res.status(403).json({ error: 'sem permissão para esta ação' });
  }

  const alvo = String(req.query?.alvo || '');
  if (!ALVOS[alvo]) return res.status(400).json({ error: 'alvo inválido' });

  const [envUrl, envToken] = ALVOS[alvo];
  const url = process.env[envUrl];
  const token = process.env[envToken];
  if (!url || !token) return res.status(500).json({ error: `sync ${alvo} não configurado` });

  // O Apps Script responde 302 pro googleusercontent; fetch segue sozinho.
  // O sync roda em minutos e a função serverless morre antes — por isso não
  // esperamos o corpo: o cliente confirma pelo onSnapshot do Firestore.
  try {
    const upstream = await fetch(`${url}?token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(25_000),
    });
    if (!upstream.ok) return res.status(502).json({ ok: false, error: `apps script ${upstream.status}` });
    const json = await upstream.json().catch(() => ({}));
    return res.status(200).json({ ok: json.ok === true });
  } catch (e) {
    // Timeout aqui não quer dizer que falhou: o Apps Script segue rodando.
    if (e?.name === 'TimeoutError') return res.status(202).json({ ok: true, parcial: true });
    return res.status(502).json({ ok: false, error: 'apps script indisponível' });
  }
}
