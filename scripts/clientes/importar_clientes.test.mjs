// Teste do merge do importador de clientes — a parte que não dá para conferir
// olhando a tela, porque só aparece depois de dois dias de coleta.
//
//   node --test scripts/clientes/importar_clientes.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { fundir } from './importar_clientes.mjs';

/** Registro como o coletar_clientes.py entrega. */
const coletado = (over = {}) => ({
  chave: 't:51999990000',
  telefone: '51999990000',
  cpfHash: '',
  nome: 'Fulano',
  pedidos: 3,
  valorTotal: 300,
  ultimaCompra: '2026-08-18',
  bairro: 'Petrópolis',
  cidade: 'Porto Alegre',
  cancelados: 0,
  telefoneOrigem: 'cadastro',
  aniversario: '',
  email: '',
  ...over,
});

test('cliente novo entra com os campos da coleta', () => {
  const { itens, inseridos } = fundir([], [coletado()]);
  assert.equal(inseridos, 1);
  assert.deepEqual(itens[0], {
    k: 't:51999990000',
    t: '51999990000',
    n: 'Fulano',
    p: 3,
    v: 300,
    u: '2026-08-18',
    b: 'Petrópolis',
    c: 'Porto Alegre',
  });
});

test('cadastro sem telefone entra pela chave de CPF', () => {
  const { itens } = fundir(
    [],
    [coletado({ chave: 'c:abc123', telefone: '', cpfHash: 'abc123', telefoneOrigem: '' })]
  );
  assert.equal(itens[0].k, 'c:abc123');
  assert.equal(itens[0].t, undefined);
  assert.equal(itens[0].h, 'abc123');
});

test('pedidos e valor nunca encolhem quando um cadastro sai da janela', () => {
  const base = [{ k: 't:51999990000', t: '51999990000', n: 'Fulano', p: 10, v: 1200, u: '2026-06-01' }];
  const { itens } = fundir(base, [coletado({ pedidos: 3, valorTotal: 300 })]);
  assert.equal(itens[0].p, 10);
  assert.equal(itens[0].v, 1200);
  assert.equal(itens[0].u, '2026-08-18', 'a última compra é sempre a mais recente');
});

test('quem foi religado por CPF funde com o registro que já existia sem telefone', () => {
  // Ontem o cliente só existia como cadastro de marketplace (sem telefone).
  const base = [{ k: 'c:abc123', h: 'abc123', n: 'Fulano', p: 4, v: 400, u: '2026-07-10', b: 'Petrópolis' }];
  // Hoje a coleta casou o CPF com um cadastro de balcão e trouxe o telefone.
  const { itens, atualizados } = fundir(
    base,
    [coletado({ cpfHash: 'abc123', pedidos: 6, valorTotal: 700, telefoneOrigem: 'cpf' })]
  );
  assert.equal(atualizados, 1);
  assert.equal(itens.length, 1, 'não pode virar dois clientes na tela');
  assert.equal(itens[0].k, 't:51999990000', 'a identidade passa a ser o telefone');
  assert.equal(itens[0].t, '51999990000');
  assert.equal(itens[0].p, 6);
  assert.equal(itens[0].o, 'cpf', 'a tela marca que o telefone veio de outro cadastro');
});

test('dois registros da base que eram a mesma pessoa viram um só', () => {
  const base = [
    { k: 't:51999990000', t: '51999990000', n: 'Fulano', p: 2, v: 200, u: '2026-05-01' },
    { k: 'c:abc123', h: 'abc123', n: 'Fulano da Silva', p: 5, v: 900, u: '2026-07-01' },
  ];
  const { itens, unificados } = fundir(base, [coletado({ cpfHash: 'abc123' })]);
  assert.equal(unificados, 1);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].p, 5, 'fica com o maior histórico dos dois');
  assert.equal(itens[0].v, 900);
});

test('quem não apareceu na coleta de hoje continua na base, envelhecendo', () => {
  const base = [{ k: 't:51988887777', t: '51988887777', n: 'Sumido', p: 1, v: 90, u: '2026-04-02' }];
  const { itens, inseridos } = fundir(base, [coletado()]);
  assert.equal(inseridos, 1);
  assert.equal(itens.length, 2);
  assert.ok(itens.some((i) => i.t === '51988887777'));
});

test('cadastro sem data de última compra não entra', () => {
  const { itens, inseridos } = fundir([], [coletado({ ultimaCompra: '' })]);
  assert.equal(inseridos, 0);
  assert.equal(itens.length, 0);
});

test('religado por nome+bairro absorve o registro antigo em vez de duplicar', () => {
  // A base tem os dois lados da mesma pessoa: um cadastro de balcão com
  // telefone e um do iFood sem, chaveado pelo nome+endereço.
  const existentes = [
    { k: 't:51999990000', t: '51999990000', n: 'Marisiana Battistella', p: 64, v: 8000, u: '2026-08-10', b: 'Petrópolis' },
    { k: 'e:abc123', n: 'Marisiana Battistella', p: 25, v: 3000, u: '2026-08-12', b: 'Petrópolis' },
  ];
  // Hoje o coletor religou: o cadastro do iFood ganhou o telefone e os dois
  // viraram um só, que chega com a chave anterior a tiracolo.
  const coleta = [
    {
      chave: 't:51999990000', telefone: '51999990000', nome: 'Marisiana Battistella',
      pedidos: 89, valorTotal: 11000, ultimaCompra: '2026-08-12', bairro: 'Petrópolis',
      telefoneOrigem: 'nome_bairro', chavesAntigas: ['e:abc123'],
    },
  ];
  const { itens, unificados } = fundir(existentes, coleta);
  assert.equal(itens.length, 1, 'a pessoa não pode aparecer duas vezes na tela');
  assert.equal(unificados, 1);
  assert.equal(itens[0].k, 't:51999990000');
  assert.equal(itens[0].p, 89, 'os pedidos dos dois cadastros somam');
});

test('sem a chave antiga o registro orfao sobreviveria — o teste guarda a regressao', () => {
  const existentes = [
    { k: 't:51999990000', t: '51999990000', n: 'Marisiana Battistella', p: 64, v: 8000, u: '2026-08-10' },
    { k: 'e:abc123', n: 'Marisiana Battistella', p: 25, v: 3000, u: '2026-08-12' },
  ];
  const semPista = [
    {
      chave: 't:51999990000', telefone: '51999990000', nome: 'Marisiana Battistella',
      pedidos: 89, valorTotal: 11000, ultimaCompra: '2026-08-12',
    },
  ];
  const { itens } = fundir(existentes, semPista);
  assert.equal(itens.length, 2, 'é exatamente o que chavesAntigas evita');
});
