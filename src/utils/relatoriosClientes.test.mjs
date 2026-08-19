// node --test src/utils/relatoriosClientes.test.mjs
//
// O que se testa aqui é o que a tela não deixaria ver: viés de sobrevivência
// (coorte velha marcada como incompleta), receita subestimada quando falta `vm`
// e a classificação de quem ainda não tem histórico coletado.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  somarMeses,
  janelaDeMeses,
  segmentoDe,
  segmentos,
  coortes,
  bairros,
  painelMensal,
  diasAteSegundaCompra,
  chaveBairro,
} from './relatoriosClientes.js';

const HOJE = new Date(2026, 7, 19); // 19/ago/2026

/** Cliente de mentira com o shape que o useClientes entrega. */
function cli(over = {}) {
  return {
    loja: 'dame',
    chave: over.chave || 't:1',
    bairro: 'Centro',
    dias: 10,
    pedidos: 1,
    valorTotal: 100,
    podeReceber: true,
    primeiraCompra: '',
    historicoMeses: null,
    receitaMeses: null,
    ...over,
  };
}

test('somarMeses atravessa a virada do ano nos dois sentidos', () => {
  assert.equal(somarMeses('2026-01', -1), '2025-12');
  assert.equal(somarMeses('2025-12', 1), '2026-01');
  assert.equal(somarMeses('2026-08', -12), '2025-08');
});

test('janelaDeMeses termina no mês de hoje', () => {
  const j = janelaDeMeses(HOJE, 6);
  assert.equal(j.length, 6);
  assert.equal(j[5], '2026-08');
  assert.equal(j[0], '2026-03');
});

test('frequência ganha de recência: campeão parado 40 dias continua campeão', () => {
  const c = cli({
    dias: 40,
    historicoMeses: { '2026-08': 1, '2026-07': 2, '2026-06': 2, '2026-05': 2 },
  });
  assert.equal(segmentoDe(c, HOJE), 'campeao');
});

test('cliente sem histórico coletado nunca é promovido — cai só pela recência', () => {
  assert.equal(segmentoDe(cli({ dias: 15, historicoMeses: null }), HOJE), 'ativo');
  assert.equal(segmentoDe(cli({ dias: 75, historicoMeses: null }), HOJE), 'risco');
  assert.equal(segmentoDe(cli({ dias: Infinity, historicoMeses: null }), HOJE), 'perdido');
});

test('pedidos fora da janela de 6 meses não contam para a frequência', () => {
  // 8 pedidos, todos há mais de 6 meses: é um perdido, não um campeão.
  const c = cli({ dias: 200, historicoMeses: { '2025-10': 4, '2025-11': 4 } });
  assert.equal(segmentoDe(c, HOJE), 'perdido');
});

test('segmentos somam a base inteira e repartem 100% do valor', () => {
  const base = [
    cli({ chave: 'a', dias: 5, valorTotal: 500, historicoMeses: { '2026-08': 7 } }),
    cli({ chave: 'b', dias: 45, valorTotal: 300, historicoMeses: { '2026-07': 3 } }),
    cli({ chave: 'c', dias: 45, valorTotal: 200, historicoMeses: { '2026-07': 1 } }),
    cli({ chave: 'd', dias: 120, valorTotal: 0, historicoMeses: {} }),
  ];
  const segs = segmentos(base, HOJE);
  assert.equal(segs.reduce((s, x) => s + x.qtd, 0), base.length);
  assert.equal(segs.find((s) => s.key === 'campeao').qtd, 1);
  assert.equal(segs.find((s) => s.key === 'fiel').qtd, 1);
  assert.equal(segs.find((s) => s.key === 'esfriando').qtd, 1);
  assert.equal(segs.find((s) => s.key === 'perdido').qtd, 1);
  const soma = segs.reduce((s, x) => s + x.pctValor, 0);
  assert.ok(Math.abs(soma - 1) < 1e-9, `pctValor somou ${soma}`);
});

test('coorte anterior à cobertura da base vem marcada como incompleta', () => {
  const base = [
    cli({ chave: 'velho', primeiraCompra: '2026-02-10', historicoMeses: { '2026-02': 1, '2026-08': 1 } }),
    cli({ chave: 'novo', primeiraCompra: '2026-06-03', historicoMeses: { '2026-06': 1 } }),
  ];
  const { linhas } = coortes(base, { hoje: HOJE, coberturaDesde: '2026-05-20' });
  const fev = linhas.find((l) => l.mes === '2026-02');
  const jun = linhas.find((l) => l.mes === '2026-06');
  assert.equal(fev.completa, false, 'fevereiro é anterior à cobertura');
  assert.equal(jun.completa, true, 'junho já está coberto por inteiro');
});

test('coorte: quem comprou duas vezes no mês de entrada conta como recompra', () => {
  const base = [
    cli({ chave: 'x', primeiraCompra: '2026-07-02', historicoMeses: { '2026-07': 2 } }),
    cli({ chave: 'y', primeiraCompra: '2026-07-04', historicoMeses: { '2026-07': 1 } }),
  ];
  const { linhas } = coortes(base, { hoje: HOJE, coberturaDesde: '2026-05-20' });
  const jul = linhas.find((l) => l.mes === '2026-07');
  assert.equal(jul.tamanho, 2);
  assert.equal(jul.voltaram, 1);
});

test('coorte: mês que ainda não aconteceu vira célula vazia, não zero', () => {
  const base = [cli({ chave: 'z', primeiraCompra: '2026-08-01', historicoMeses: { '2026-08': 1 } })];
  const { linhas } = coortes(base, { hoje: HOJE, coberturaDesde: '2026-05-20' });
  const ago = linhas.find((l) => l.mes === '2026-08');
  assert.equal(ago.celulas[0], null, 'setembro ainda não existe');
});

test('painel mensal separa novo, reativado e recorrente', () => {
  const base = [
    // novo em agosto
    cli({ chave: 'n', primeiraCompra: '2026-08-02', historicoMeses: { '2026-08': 1 }, receitaMeses: { '2026-08': 90 } }),
    // comprou em julho e agosto: recorrente
    cli({ chave: 'r', primeiraCompra: '2026-01-05', historicoMeses: { '2026-07': 1, '2026-08': 1 }, receitaMeses: { '2026-07': 80, '2026-08': 110 } }),
    // sumiu desde maio e voltou em agosto: reativado
    cli({ chave: 'v', primeiraCompra: '2026-01-05', historicoMeses: { '2026-05': 1, '2026-08': 2 }, receitaMeses: { '2026-05': 70, '2026-08': 200 } }),
  ];
  const linhas = painelMensal(base, { hoje: HOJE, coberturaDesde: '2026-05-20' });
  const ago = linhas.find((l) => l.mes === '2026-08');
  assert.equal(ago.ativos, 3);
  assert.equal(ago.novos, 1);
  assert.equal(ago.reativados, 1);
  assert.equal(ago.recorrentes, 1);
  assert.equal(ago.pedidos, 4);
  assert.equal(ago.receita, 400);
  assert.equal(ago.receitaParcial, false);
  assert.equal(ago.correndo, true, 'o mês corrente nunca é fechado');
});

test('painel: mês com cliente sem receita coletada avisa que está subestimado', () => {
  const base = [
    cli({ chave: 'a', primeiraCompra: '2026-07-01', historicoMeses: { '2026-07': 1 }, receitaMeses: { '2026-07': 100 } }),
    cli({ chave: 'b', primeiraCompra: '2026-07-01', historicoMeses: { '2026-07': 1 }, receitaMeses: null }),
  ];
  const jul = painelMensal(base, { hoje: HOJE }).find((l) => l.mes === '2026-07');
  assert.equal(jul.receita, 100);
  assert.equal(jul.receitaParcial, true);
  assert.equal(jul.semReceita, 1);
});

test('bairros: os pequenos viram uma linha "Outros" sem sumir do total', () => {
  const base = [
    ...Array.from({ length: 4 }, (_, i) => cli({ chave: `p${i}`, bairro: 'Petrópolis', valorTotal: 1000 })),
    cli({ chave: 'q', bairro: 'Cavalhada', valorTotal: 50 }),
    cli({ chave: 'r', bairro: 'Restinga', valorTotal: 30, loja: 'lov' }),
  ];
  const linhas = bairros(base, { lojas: ['dame', 'lov'] });
  assert.equal(linhas.length, 2);
  assert.equal(linhas[0].bairro, 'Petrópolis');
  assert.equal(linhas[0].porLoja.dame, 4);
  const outros = linhas[1];
  assert.ok(outros.resto);
  assert.equal(outros.qtd, 2);
  assert.equal(outros.valor, 80);
  assert.equal(outros.porLoja.lov, 1);
  const somaPct = linhas.reduce((s, l) => s + l.pctValor, 0);
  assert.ok(Math.abs(somaPct - 1) < 1e-9);
});

test('dias até a 2ª compra ignora quem entrou antes da cobertura da base', () => {
  const base = [
    cli({ chave: 'a', pedidos: 2, primeiraCompra: '2026-06-01', ultimaCompra: '2026-06-15' }),
    cli({ chave: 'b', pedidos: 2, primeiraCompra: '2026-06-01', ultimaCompra: '2026-06-21' }),
    cli({ chave: 'c', pedidos: 2, primeiraCompra: '2026-06-10', ultimaCompra: '2026-06-14' }),
    // fora da cobertura: entrou antes, não pode entrar na conta
    cli({ chave: 'd', pedidos: 2, primeiraCompra: '2026-01-01', ultimaCompra: '2026-01-03' }),
    // só um pedido: não tem intervalo
    cli({ chave: 'e', pedidos: 1, primeiraCompra: '2026-06-02', ultimaCompra: '2026-06-02' }),
  ];
  const r = diasAteSegundaCompra(base, '2026-05-20');
  assert.equal(r.n, 3);
  assert.equal(r.mediana, 14);
  assert.ok(Math.abs(r.ateUmaSemana - 1 / 3) < 1e-9);
});

test('bairros: mesma rua escrita de dois jeitos vira uma linha só', () => {
  const base = [
    ...Array.from({ length: 5 }, (_, i) => cli({ chave: `a${i}`, bairro: "Passo D'Areia", valorTotal: 100 })),
    ...Array.from({ length: 3 }, (_, i) => cli({ chave: `b${i}`, bairro: 'Passo da Areia', valorTotal: 100 })),
    ...Array.from({ length: 4 }, (_, i) => cli({ chave: `c${i}`, bairro: 'Petropolis', valorTotal: 100 })),
    ...Array.from({ length: 6 }, (_, i) => cli({ chave: `d${i}`, bairro: 'Petrópolis', valorTotal: 100 })),
  ];
  const linhas = bairros(base);
  assert.equal(linhas.length, 2);
  const passo = linhas.find((l) => l.bairro.startsWith('Passo'));
  assert.equal(passo.qtd, 8);
  assert.equal(passo.bairro, "Passo D'Areia", 'exibe a grafia mais comum do grupo');
  assert.equal(linhas.find((l) => l.bairro.startsWith('Petr')).qtd, 10);
});

test('chaveBairro não funde bairros de fato diferentes', () => {
  assert.notEqual(chaveBairro('Bom Fim'), chaveBairro('Bom Jesus'));
  assert.notEqual(chaveBairro('Passo da Areia'), chaveBairro('Areal'));
  assert.equal(chaveBairro('Jardim Botânico'), chaveBairro('jardim botanico'));
});

test('painel: nos meses mais antigos a separação novo/reativado fica desconhecida', () => {
  const base = [
    cli({ chave: 'a', primeiraCompra: '2024-01-01', historicoMeses: { '2025-09': 1, '2026-08': 1 } }),
  ];
  const linhas = painelMensal(base, { hoje: HOJE });
  const setembro = linhas.find((l) => l.mes === '2025-09'); // mês mais antigo da janela de 12
  assert.equal(setembro.ativos, 1);
  assert.equal(setembro.separacaoConhecida, false);
  assert.equal(setembro.reativados, null, 'não pode inventar reativado sem os 2 meses anteriores');
  assert.equal(setembro.recorrentes, null);
  const agosto = linhas.find((l) => l.mes === '2026-08');
  assert.equal(agosto.separacaoConhecida, true);
});
