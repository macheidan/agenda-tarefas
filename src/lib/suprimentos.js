// Constantes e helpers compartilhados pelas sub-seções de Suprimentos
// (Compras e Estoque Mensal). Ficam aqui porque as duas telas mostram o MESMO
// catálogo (comprasFornecedores/comprasItens) — endereço de loja, paleta de
// cores por fornecedor e normalização de busca precisam bater entre elas.

// Lojas de Compras. O NOME é o valor guardado no localStorage e o que sai na
// mensagem do pedido — por isso a lista é de objetos com nome + endereço, e não
// de ids. Cada loja tem a sua permissão de ver (mesmo padrão do Estoque Mensal
// e de Motoboys/Avaliações): nasce ligada (`!== false`) e o admin desliga por
// usuário em Configurações, pra quem só pede para a própria loja.
// O `id` é minúsculo sem acento de propósito: é ele que vai no id do pedido
// congelado e é o MESMO valor da coluna `loja` das notas fiscais no Supabase
// ('dame'/'lov'), o que deixa a conferência cruzar as duas fontes sem de-para.
export const COMPRAS_LOJAS = [
  { id: 'lov', nome: 'Lov', endereco: 'Anita Garibaldi 1593', verFlag: 'comprasVerLov' },
  { id: 'dame', nome: 'Dáme', endereco: 'Carazinho 443', verFlag: 'comprasVerDame' },
];

// Endereço de cada loja, incluído ao lado do nome na mensagem copiada.
export const LOJA_ENDERECO = Object.fromEntries(COMPRAS_LOJAS.map((l) => [l.nome, l.endereco]));

// Nome exibido -> id (o <select> do pedido guarda o NOME, por causa do
// localStorage antigo e da mensagem copiada).
export const LOJA_ID = Object.fromEntries(COMPRAS_LOJAS.map((l) => [l.nome, l.id]));

export const FORNEC_COLORS = ['#465fff', '#ff9800', '#12b76a', '#9c27b0', '#f04438', '#3949ab', '#0d9488'];

// Valor do <select> de fornecedor que significa "todos".
export const ALL = '__all__';

// Loja escolhida fica memorizada no navegador, compartilhada pelas duas telas.
export const LOJA_KEY = 'comprasLoja';

// Normaliza para busca: minúsculas e sem acentos.
export const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Lojas do Estoque Mensal (mesmo padrão de Motoboys/Avaliações): cada loja conta
// o MESMO produto no seu próprio doc de contagem, e tem permissão de ver e de
// editar separadas. `ver` nasce ligado (!== false); `editar` nasce desligado
// (=== true), como toda permissão de escrita.
export const ESTOQUE_LOJAS = [
  { id: 'dame', nome: 'Dáme', verFlag: 'estoqueVerDame', editFlag: 'estoqueEditarDame' },
  { id: 'lov', nome: 'Lov', verFlag: 'estoqueVerLov', editFlag: 'estoqueEditarLov' },
];

// Valor contado: preenchido (0 conta — significa "acabou").
export const isContado = (v) => v !== null && v !== undefined && v !== '';

// Elenco do mês: a lista de Compras achatada num formato que não depende mais
// do catálogo (nome do fornecedor junto, vínculo da planilha junto). É o que é
// congelado no doc da contagem quando o mês começa a ser preenchido.
export const congelarCatalogo = (itens, fornecNome = {}) => (itens || []).map((i) => ({
  id: i.id,
  produto: i.produto || '',
  marca: i.marca || '',
  unid: i.unid || '',
  fornecedorId: i.fornecedorId || '',
  fornecedor: fornecNome[i.fornecedorId] || '',
  planilha: i.planilhaNome || '',
}));

// Itens que o mês exibe: o elenco congelado quando ele existe, senão a lista de
// Compras de hoje (mês ainda não iniciado). Uma contagem de item que não está
// no elenco — só acontece com dado antigo — entra no fim, para nunca sumir.
export function elencoDoMes(catalogoCongelado, itensAtuais, fornecNome = {}, qtys = {}) {
  const base = catalogoCongelado?.length
    ? catalogoCongelado
    : congelarCatalogo(itensAtuais, fornecNome);
  const vistos = new Set(base.map((i) => i.id));
  const soltos = Object.keys(qtys)
    .filter((id) => isContado(qtys[id]) && !vistos.has(id))
    .map((id) => {
      const atual = (itensAtuais || []).find((i) => i.id === id);
      return atual
        ? congelarCatalogo([atual], fornecNome)[0]
        : { id, produto: '(produto removido)', marca: '', unid: '', fornecedorId: '', fornecedor: '', planilha: '' };
    });
  return base.concat(soltos);
}

// Linhas contadas de um mês, montadas sobre o elenco (ver acima).
export function itensContados(qtys, elenco) {
  return (elenco || [])
    .filter((i) => isContado(qtys?.[i.id]))
    .map((i) => ({ ...i, itemId: i.id, qtd: Number(qtys[i.id]) || 0 }));
}

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

// Id da contagem do Estoque Mensal — mesmo endereçamento (mês + loja).
export const contagemId = (mes, lojaId) => `${mes}_${lojaId}`;

// ---- Pedido congelado (Conferir Pedidos) ----

// Dias de entrega do pedido, na ordem do <select>. Ficam aqui porque a
// conferência precisa traduzir o dia escolhido numa DATA de verdade.
export const COMPRAS_WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// Data de hoje ('YYYY-MM-DD') no fuso local — o toISOString() cru viraria o dia
// seguinte à noite em POA.
export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Traduz o dia de entrega escolhido ('Quarta') na PRÓXIMA data em que ele cai
 * ('2026-08-05'), contando de `baseISO` (padrão: hoje) e aceitando o próprio
 * dia — "entrega quarta após 16:30" pedido numa quarta é hoje mesmo.
 *
 * É essa data que permite achar a nota: sem ela o pedido guarda só o nome do
 * dia, e nome de dia não casa com `data_emissao`.
 */
export const dataDaEntrega = (weekday, baseISO = hojeISO()) => {
  const idx = COMPRAS_WEEKDAYS.indexOf(weekday);
  if (idx < 0) return '';
  const alvo = (idx + 1) % 7; // Segunda=1 ... Domingo=0, como o getDay()
  const [y, m, d] = baseISO.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  const delta = (alvo - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + delta);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
};

// Id do pedido congelado: um doc por DIA, loja e fornecedor. Recopiar o mesmo
// pedido no mesmo dia sobrescreve (é correção, não pedido novo).
export const pedidoId = (dataISO, lojaId, fornecedorId) => `${dataISO}_${lojaId}_${fornecedorId}`;

// Data ISO no formato curto de tela ('30/07').
export const fmtDiaMes = (iso) => {
  const [, m, d] = String(iso || '').split('-');
  return m && d ? `${d}/${m}` : (iso || '');
};
