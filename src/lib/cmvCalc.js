// Cálculo de custo das fichas técnicas do CMV — compartilhado entre a aba CMV
// (CmvView) e a aba Margem (MargemView). O custo unitário de cada ingrediente
// vem do Resultado (custo/kg) dos Produtos (planilha) da seção Preços.

export const SIZES = [['qtdP', 'Pequena'], ['qtdM', 'Média'], ['qtdG', 'Grande'], ['qtdS', 'Super']];

// Aceita virgula decimal; '' -> 0.
export function num(v) {
  if (v === '' || v == null) return 0;
  const n = Number(String(v).replace(',', '.').trim());
  return Number.isNaN(n) ? 0 : n;
}

// Custo por kg de um beneficiado: soma(qtd x custo do ingrediente) / rendimento
// (rendimento vazio => usa o peso bruto, ou seja, sem perda).
export function calcBeneficiado(b, custoBase) {
  let pesoBruto = 0, custoTotal = 0;
  for (const l of b.lines || []) {
    const q = num(l.qtd);
    pesoBruto += q;
    custoTotal += q * (custoBase[l.ref]?.custo || 0);
  }
  const rend = num(b.rendimento) > 0 ? num(b.rendimento) : pesoBruto;
  const custoPorKg = rend > 0 ? custoTotal / rend : 0;
  return { pesoBruto, custoTotal, rendimento: rend, custoPorKg };
}

// Total de custo de um sabor por tamanho (P/M/G/S) = Σ (qtd × custo do ingrediente),
// incluindo a BASE da categoria do sabor (mussarela/orégano/caixa que vão em todas).
// Ingrediente da base que JÁ está na ficha do sabor não soma de novo: a linha
// do sabor carrega o peso replicado da base (ver useCmv/applyBaseToLines).
export function calcSabor(s, custoBase, benefCusto, bases) {
  const cat = s.categoria || 'salgada';
  const own = s.lines || [];
  const ownKeys = new Set(own.map((l) => `${l.tipo || 'base'}:${l.ref}`));
  const baseLines = ((bases && bases[cat]) || []).filter((l) => !ownKeys.has(`${l.tipo || 'base'}:${l.ref}`));
  const t = { qtdP: 0, qtdM: 0, qtdG: 0, qtdS: 0 };
  for (const l of [...own, ...baseLines]) {
    const cu = l.tipo === 'beneficiado' ? (benefCusto[l.ref] || 0) : (custoBase[l.ref]?.custo || 0);
    for (const [k] of SIZES) t[k] += num(l[k]) * cu;
  }
  return t;
}
