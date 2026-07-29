// Constantes e helpers compartilhados pelas sub-seções de Suprimentos
// (Compras e Estoque Mensal). Ficam aqui porque as duas telas mostram o MESMO
// catálogo (comprasFornecedores/comprasItens) — endereço de loja, paleta de
// cores por fornecedor e normalização de busca precisam bater entre elas.

export const LOJAS = ['Lov', 'Dáme'];

// Endereço de cada loja, incluído ao lado do nome na mensagem copiada.
export const LOJA_ENDERECO = { Lov: 'Anita Garibaldi 1593', Dáme: 'Carazinho 443' };

export const FORNEC_COLORS = ['#465fff', '#ff9800', '#12b76a', '#9c27b0', '#f04438', '#3949ab', '#0d9488'];

// Valor do <select> de fornecedor que significa "todos".
export const ALL = '__all__';

// Loja escolhida fica memorizada no navegador, compartilhada pelas duas telas.
export const LOJA_KEY = 'comprasLoja';

// Normaliza para busca: minúsculas e sem acentos.
export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Item contado no Estoque Mensal: campo preenchido (0 conta — significa "acabou").
export const isContado = (item) => item?.estoqueQty !== null && item?.estoqueQty !== undefined && item?.estoqueQty !== '';

// Número no formato da mensagem copiada (inteiro sem casas, decimal com vírgula).
export const fmtQty = (value) => {
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
};
