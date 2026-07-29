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

// Lojas do Estoque Mensal (mesmo padrão de Motoboys/Avaliações): cada loja conta
// o MESMO produto no seu próprio campo do item, e tem permissão de ver e de
// editar separadas. `ver` nasce ligado (!== false); `editar` nasce desligado
// (=== true), como toda permissão de escrita.
export const ESTOQUE_LOJAS = [
  { id: 'dame', nome: 'Dáme', field: 'estoqueQtyDame', verFlag: 'estoqueVerDame', editFlag: 'estoqueEditarDame' },
  { id: 'lov', nome: 'Lov', field: 'estoqueQtyLov', verFlag: 'estoqueVerLov', editFlag: 'estoqueEditarLov' },
];

// Campos de contagem — usados nas regras do Firestore e na limpeza.
export const ESTOQUE_FIELDS = ESTOQUE_LOJAS.map((l) => l.field);

// Valor contado: preenchido (0 conta — significa "acabou").
export const isContado = (v) => v !== null && v !== undefined && v !== '';

// Item com contagem em alguma das lojas (usado no contador do submenu).
export const temContagem = (item) => ESTOQUE_FIELDS.some((f) => isContado(item?.[f]));

// Número no formato da mensagem copiada (inteiro sem casas, decimal com vírgula).
export const fmtQty = (value) => {
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
};

// ---- Relatório Estoque ----

// Mês de referência no formato 'YYYY-MM' (o mesmo do <input type="month">).
// Usa a data local, não o UTC: no fuso de POA o toISOString() vira o mês
// seguinte na virada.
export const mesAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Primeiro dia do mês SEGUINTE ('YYYY-MM-DD'). É o corte usado na consulta de
// preços: "preço até o último dia do mês" vira `data < primeiroDoProximo`, o
// que funciona tanto se a coluna for date quanto timestamp.
export const inicioProximoMes = (mes) => {
  const [y, m] = String(mes || '').split('-').map(Number);
  if (!y || !m) return '';
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
};

// Último dia do mês ('YYYY-MM-DD') — só pra exibir a data de corte na tela.
export const fimDoMes = (mes) => {
  const [y, m] = String(mes || '').split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
};

const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export const fmtMes = (mes) => {
  const [y, m] = String(mes || '').split('-').map(Number);
  if (!y || !m) return mes || '';
  return `${MESES_PT[m - 1]}/${y}`;
};

export const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Id do relatório congelado: um doc por mês E por loja (cada loja fecha a sua
// contagem quando termina, sem esperar a outra).
export const relatorioId = (mes, lojaId) => `${mes}_${lojaId}`;
