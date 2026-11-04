import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerFolhaTexto, casarFuncionario } from './folhaTexto.js';

const recibo = (nome, extra, venc, desc, liq) => [
  ...extra,
  'JL TEIXEIRA COMERCIO DE ALIMENTOS LTDA', 'CNPJ: 08.608.380/0001-53 CC:', '14', 'Código',
  nome, 'Nome do Funcionário CBO', 'Folha Mensal', 'Outubro de 2026', 'PIZZAIOLO Admissão: 01/01/2020',
  'Declaro ter recebido a importância líquida discriminada neste recibo.', venc, desc, liq,
  '____/____/_______', 'Data Data',
].join('\n');

test('líquido, mês e empréstimos sem duplicar as duas vias', () => {
  const via = recibo('ANA SOUZA', [
    '219 DESC. EMP. CRED. TRAB Nº 111 100,00 100,00',
    'DESC. EMP. CRED. TRAB Nº 111 100,00 100,00',
    'Código Descrição Referência Vencimentos Descontos', '993', '224',
    'TROCO MES ANTERIOR', 'DESC. EMP. CRED. TRAB Nº 222', '0,39', '50,50',
  ], '3.000,00', '1.000,00', '2.000,00');
  const [a] = lerFolhaTexto(via + '\n' + via);
  assert.equal(a.nome, 'ANA SOUZA');
  assert.equal(a.mes, 9);
  assert.equal(a.ano, 2026);
  assert.equal(a.liquido, 2000);
  assert.deepEqual(a.emprestimos, { 111: 100, 222: 50.5 });
  assert.equal(a.emprestimoTotal, 150.5);
});

test('códigos intercalados entre os totais', () => {
  const t = recibo('BIA LIMA', [], '2.773,32', '224\n226\n1.709,32', '1.064,00');
  assert.equal(lerFolhaTexto(t)[0].liquido, 1064);
});

test('casa apelido e desempata homônimo pela loja', () => {
  const emps = [{ id: 'p', name: 'Paty', store: 'd' }, { id: 'j1', name: 'Júlio', store: 'l' }, { id: 'j2', name: 'Julio', store: 'd' }];
  assert.equal(casarFuncionario('PATRICIA GISELE', emps, 'd').id, 'p');
  assert.equal(casarFuncionario('JULIO CESAR MEDINA', emps, 'd').id, 'j2');
  assert.equal(casarFuncionario('JULIO CESAR MEDINA', emps, null), null);
});

test('apelido que é começo do nome ganha do parecido (Fabi × Fabio)', () => {
  const emps = [{ id: 'fa', name: 'Fabi', store: 'd' }, { id: 'fo', name: 'Fabio', store: 'd' }];
  assert.equal(casarFuncionario('FABIANA SANTOS', emps, 'd').id, 'fa');
  assert.equal(casarFuncionario('FABIO LUIZ', emps, 'd').id, 'fo');
});
