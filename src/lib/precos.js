// Regras de leitura da base de preços (Supabase) compartilhadas entre a seção
// Preços e quem mais precisar do custo de um "Produto (planilha)" — hoje o
// Relatório Estoque, em Suprimentos. Ficam aqui pra que a conta do Resultado
// (Regra3) seja a MESMA nos dois lugares: um relatório que calcula o custo por
// uma regra própria começa a divergir do CMV no primeiro fator cadastrado.

// Normaliza a data para 'YYYY-MM-DD' independente do formato de origem
// (ISO com hora, 'DD/MM/YYYY' ou já 'YYYY-MM-DD'). Sem isso, datas em formato
// diferente quebram a comparação de string usada nos filtros.
export function parseDataISO(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const d = new Date(s);
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}

// Regra3: o fator multiplica o preço/kg por padrão (ex: "2" -> x2). Com o
// prefixo "/" ele divide (ex: "/2" -> dividido por 2). Aceita vírgula decimal.
// Retorna o resultado numérico ou null se o campo estiver vazio/inválido.
export function calcResultado(precoNorm, raw) {
  if (raw === '' || raw == null) return null;
  const s = String(raw).trim();
  const isDiv = s.startsWith('/');
  const numStr = (isDiv ? s.slice(1) : s).replace(',', '.').trim();
  const n = Number(numStr);
  if (numStr === '' || Number.isNaN(n)) return null;
  if (isDiv) return n === 0 ? null : precoNorm / n;
  return precoNorm * n;
}

// Fator por unidade de embalagem (tabela fatores_unidade). O fator geral mora em
// produtos.fator_regra3, mas o mesmo produto bruto pode chegar em embalagens
// diferentes conforme o fornecedor (ex: "MORANGO" por BD de 250g na Ivanei e por
// CX de 1kg na MH). Quando existe fator pra (produto, unidade), ele vale; senao
// cai no fator geral do produto.
export function chaveFatorUnidade(produtoId, unidade) {
  return `${produtoId}|${String(unidade || '').trim().toUpperCase()}`;
}

// Mapa 'produto_id|UNID' -> fator. Sem a tabela (ou com erro), volta vazio e
// tudo segue pelo fator geral.
export async function fetchFatoresUnidade(supabase) {
  const { data, error } = await supabase.from('fatores_unidade').select('produto_id, unidade, fator');
  if (error) {
    console.warn('[precos] fatores_unidade indisponivel:', error.message || error);
    return {};
  }
  const map = {};
  for (const r of data || []) {
    if (r.fator != null && String(r.fator).trim() !== '') map[chaveFatorUnidade(r.produto_id, r.unidade)] = r.fator;
  }
  return map;
}

export function fatorEfetivo(fatoresUnidade, produtoId, unidade, fatorProduto) {
  const v = fatoresUnidade?.[chaveFatorUnidade(produtoId, unidade)];
  return v != null ? v : (fatorProduto ?? null);
}
