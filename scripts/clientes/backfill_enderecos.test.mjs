// Teste do casamento backup -> Firestore do backfill de endereços.
//
//   node --test scripts/clientes/backfill_enderecos.test.mjs
//
// O que está sendo protegido aqui é sobretudo o erro grave: dar a uma pessoa o
// endereço de outra. As travas de homônimo têm teste dos dois lados.

import test from 'node:test';
import assert from 'node:assert/strict';
import { casar, aplicar, digerir, limparTelefone, limparNome, bairroPrincipal } from './backfill_enderecos.mjs';
import { parseEndereco } from './enderecos.mjs';

/** Cadastro como `lerBackup()` entrega. */
const cadastro = (over = {}) => {
  const ends = (over.linhas || []).map(parseEndereco).filter(Boolean);
  const { linhas, ...resto } = over;
  return {
    id: 1,
    tel: '',
    cpf: '',
    nome: 'Fulano de Tal',
    ends,
    ...bairroPrincipal(ends),
    ...resto,
  };
};

const RUA_A = 'Porto Alegre, Petrópolis - R. Barão de Ubá, 382, 301';
const RUA_B = 'Porto Alegre, Floresta - Avenida Chicago, 272, 503';

test('casa por telefone', () => {
  const it = { k: 't:51999990000', t: '51999990000', n: 'Fulano de Tal', b: 'Petrópolis' };
  const { achados, via } = casar([it], [cadastro({ tel: '51999990000', linhas: [RUA_A] })]);
  assert.equal(via.telefone, 1);
  assert.equal(achados.get(it).length, 1);
});

test('casa por hash de CPF quando o telefone não bate', () => {
  const cpf = '12345678909';
  const it = { k: 'c:x', t: '', h: digerir(cpf), n: 'Fulano de Tal', b: 'Petrópolis' };
  const { via } = casar([it], [cadastro({ cpf, linhas: [RUA_A] })]);
  assert.equal(via.cpf, 1);
});

test('casa por nome+bairro quando não há telefone nem CPF', () => {
  const it = { k: 'i:9', t: '', n: 'Ana Paula Souza', b: 'Petrópolis' };
  const { via } = casar(
    [it],
    [cadastro({ nome: 'Ana Paula Souza', linhas: [RUA_A] })]
  );
  assert.equal(via.nome_bairro, 1);
});

test('nome de uma palavra nunca casa', () => {
  const it = { k: 'i:9', t: '', n: 'Amanda', b: 'Petrópolis' };
  const { via, semCliente } = casar([it], [cadastro({ nome: 'Amanda', linhas: [RUA_A] })]);
  assert.equal(via.nome_bairro, 0);
  assert.equal(semCliente, 1);
});

test('dois clientes com o mesmo nome+bairro queimam a chave (lado Firestore)', () => {
  const a = { k: 'i:1', t: '', n: 'Joao da Silva', b: 'Centro' };
  const b = { k: 'i:2', t: '', n: 'João da Silva', b: 'Centro' };
  const { via, semCliente } = casar(
    [a, b],
    [cadastro({ nome: 'Joao da Silva', linhas: [RUA_A] })]
  );
  assert.equal(via.nome_bairro, 0);
  assert.equal(semCliente, 1, 'melhor ninguem receber endereco do que receber o do homonimo');
});

test('dois cadastros do backup com CPFs diferentes queimam a chave (lado backup)', () => {
  const it = { k: 'i:1', t: '', n: 'Joao da Silva', b: 'Centro' };
  const linhas = ['Porto Alegre, Centro - Rua Um, 10'];
  const { via } = casar(
    [it],
    [
      cadastro({ id: 1, cpf: '11111111111', nome: 'Joao da Silva', linhas }),
      cadastro({ id: 2, cpf: '22222222222', nome: 'Joao da Silva', linhas }),
    ]
  );
  assert.equal(via.nome_bairro, 0);
});

test('dois cadastros do backup com telefones diferentes queimam a chave', () => {
  const it = { k: 'i:1', t: '', n: 'Joao da Silva', b: 'Centro' };
  const linhas = ['Porto Alegre, Centro - Rua Um, 10'];
  const { via } = casar(
    [it],
    [
      cadastro({ id: 1, tel: '51999990000', nome: 'Joao da Silva', linhas }),
      cadastro({ id: 2, tel: '51888880000', nome: 'Joao da Silva', linhas }),
    ]
  );
  assert.equal(via.nome_bairro, 0);
});

test('a mesma pessoa em dois cadastros do backup soma os endereços', () => {
  // O Saipos duplica bastante: um cadastro por canal, mesmo telefone.
  const it = { k: 't:51999990000', t: '51999990000', n: 'Fulano de Tal', b: 'Petrópolis' };
  const { achados } = casar(
    [it],
    [
      cadastro({ id: 1, tel: '51999990000', linhas: [RUA_A] }),
      cadastro({ id: 2, tel: '51999990000', linhas: [RUA_B] }),
    ]
  );
  const blocos = [{ id: 'dame_0', itens: [it] }];
  aplicar(blocos, achados);
  assert.equal(blocos[0].itens[0].d.length, 2);
});

test('cadastro sem endereço nenhum é contado, não casado', () => {
  const it = { k: 't:51999990000', t: '51999990000', n: 'Fulano de Tal', b: 'Petrópolis' };
  const { semEndereco, achados } = casar([it], [cadastro({ tel: '51999990000', linhas: [] })]);
  assert.equal(semEndereco, 1);
  assert.equal(achados.size, 0);
});

// --- aplicação -------------------------------------------------------------

test('cliente sem endereço ganha o do backup', () => {
  const it = { k: 't:51999990000', t: '51999990000', n: 'Fulano de Tal', b: 'Petrópolis' };
  const blocos = [{ id: 'dame_0', itens: [it] }];
  const { achados } = casar([it], [cadastro({ tel: '51999990000', linhas: [RUA_A] })]);
  const { ganharam, mudou } = aplicar(blocos, achados);
  assert.equal(ganharam, 1);
  assert.equal(mudou.size, 1);
  assert.equal(blocos[0].itens[0].d[0].numero, '382');
});

test('endereço que já estava não é sobrescrito, é somado', () => {
  const it = {
    k: 't:51999990000',
    t: '51999990000',
    n: 'Fulano de Tal',
    b: 'Petrópolis',
    d: [{ logradouro: 'Rua Que Ja Estava', numero: '7', bairro: 'Petrópolis', cidade: 'Porto Alegre' }],
  };
  const blocos = [{ id: 'dame_0', itens: [it] }];
  const { achados } = casar([it], [cadastro({ tel: '51999990000', linhas: [RUA_B] })]);
  const { ganharam, cresceram } = aplicar(blocos, achados);
  assert.equal(ganharam, 0);
  assert.equal(cresceram, 1);
  const d = blocos[0].itens[0].d;
  assert.equal(d.length, 2);
  assert.ok(d.some((e) => e.logradouro === 'Rua Que Ja Estava'));
});

test('backup sem endereço para o cliente não apaga o que ele já tinha', () => {
  const it = {
    k: 't:51999990000',
    t: '51999990000',
    n: 'Fulano de Tal',
    b: 'Petrópolis',
    d: [{ logradouro: 'Rua Que Ja Estava', numero: '7', bairro: 'Petrópolis', cidade: 'Porto Alegre' }],
  };
  const blocos = [{ id: 'dame_0', itens: [it] }];
  const { achados } = casar([it], []);
  const { mudou, inalterados } = aplicar(blocos, achados);
  assert.equal(mudou.size, 0, 'nem o bloco precisa ser reescrito');
  assert.equal(inalterados, 1);
  assert.equal(blocos[0].itens[0].d.length, 1);
});

test('rodar duas vezes não muda nada na segunda — zero blocos reescritos', () => {
  const it = { k: 't:51999990000', t: '51999990000', n: 'Fulano de Tal', b: 'Petrópolis' };
  const blocos = [{ id: 'dame_0', itens: [it] }];
  const cads = [cadastro({ tel: '51999990000', linhas: [RUA_A, RUA_B] })];

  aplicar(blocos, casar(blocos[0].itens, cads).achados);
  const depoisDaPrimeira = JSON.stringify(blocos[0].itens);

  const segunda = aplicar(blocos, casar(blocos[0].itens, cads).achados);
  assert.equal(segunda.mudou.size, 0);
  assert.equal(segunda.ganharam + segunda.cresceram, 0);
  assert.equal(JSON.stringify(blocos[0].itens), depoisDaPrimeira);
});

// --- espelhos do coletor ---------------------------------------------------

test('telefone: só os dígitos do primeiro, e curto demais não vale', () => {
  assert.equal(limparTelefone('5133330000<br>51999990000'), '5133330000');
  assert.equal(limparTelefone('(51) 99999-0000'), '51999990000');
  assert.equal(limparTelefone('12345'), '');
  assert.equal(limparTelefone(null), '');
});

test('nome: lixo do Saipos vira vazio', () => {
  assert.equal(limparNome(', ,'), '');
  assert.equal(limparNome('-'), '');
  assert.equal(limparNome('  Ana   Souza '), 'Ana Souza');
});

test('bairro principal: o endereço de Porto Alegre ganha do de fora', () => {
  const ends = [
    parseEndereco('Novo Hamburgo, Vila Rosa - Rua Avaí, 205'),
    parseEndereco(RUA_A),
  ];
  assert.deepEqual(bairroPrincipal(ends), { bairro: 'Petrópolis', cidade: 'Porto Alegre' });
});
