/**
 * Régua NPS das pesquisas de satisfação (Delivery Direto).
 * Mesma classificação que o admin do DD usa: 0-6 detrator, 7-8 neutro, 9-10 promotor.
 */

export const NPS_TIERS = {
  detrator: { key: 'detrator', label: 'Detratores', singular: 'Detrator', min: 0, max: 6 },
  neutro: { key: 'neutro', label: 'Neutros', singular: 'Neutro', min: 7, max: 8 },
  promotor: { key: 'promotor', label: 'Promotores', singular: 'Promotor', min: 9, max: 10 },
};

/** Ordem de exibição = ordem de prioridade de insatisfação. */
export const NPS_TIER_ORDER = ['detrator', 'neutro', 'promotor'];

export function npsTier(nota) {
  if (typeof nota !== 'number' || Number.isNaN(nota)) return null;
  if (nota <= 6) return 'detrator';
  if (nota <= 8) return 'neutro';
  return 'promotor';
}

/**
 * Junta as respostas de texto numa frase só, separadas por " / ".
 * O DD deixa o cliente repetir a mesma frase em várias perguntas (ex.: a Tânia
 * respondeu "Não recebi minha pizza" nas 3), então respostas idênticas entram
 * uma vez só.
 */
export function joinAnswers(answers) {
  if (!Array.isArray(answers)) return '';
  const seen = new Set();
  const parts = [];
  for (const item of answers) {
    const text = String(item?.answer ?? '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(text);
  }
  return parts.join(' / ');
}
