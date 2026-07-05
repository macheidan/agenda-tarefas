// Helpers de moeda (BRL) para as telas de Salários/Funcionários.

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Número → "R$ 1.234,56". null/undefined/NaN viram string vazia.
export function formatBRL(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '';
  return brl.format(Number(n));
}

// Número → "1.234,56" (sem símbolo, pra inputs).
export function formatNumberBR(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// String digitada (aceita "1.234,56", "1234.56", "1234,5", "R$ 100") → Number ou null.
export function parseBRL(str) {
  if (str == null) return null;
  if (typeof str === 'number') return Number.isNaN(str) ? null : str;
  let s = String(str).trim();
  if (!s) return null;
  s = s.replace(/[R$\s]/g, '');
  if (s === '' || s === '-') return null;
  // Se tem vírgula, trata como separador decimal pt-BR (remove pontos de milhar).
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}
