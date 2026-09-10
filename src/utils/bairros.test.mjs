import test from 'node:test';
import assert from 'node:assert/strict';
import { bairroCanonico, chaveBairro, contarPorBairro } from './bairros.js';

// Os casos abaixo são grafias REAIS da base, medidas em 10/09/2026. Cada grupo
// existia partido na tela antes desta função.

test('as quatro grafias de Passo d\'Areia viram uma', () => {
  const grafias = ["Passo D'Areia", 'Passo da Areia', "Passo D' Areia", 'Passoa Dareia'];
  const nomes = new Set(grafias.map(bairroCanonico));
  assert.equal(nomes.size, 1, `virou ${[...nomes].join(' / ')}`);
  assert.equal([...nomes][0], "Passo d'Areia");
});

test("Mont'Serrat com e sem apóstrofo é o mesmo bairro", () => {
  const nomes = new Set(["Mont'Serrat", 'Mont Serrat', "Mont' Serrat"].map(bairroCanonico));
  assert.equal(nomes.size, 1);
});

test('erros de digitação medidos caem no bairro certo', () => {
  assert.equal(bairroCanonico('Petropolsi'), 'Petrópolis');
  assert.equal(bairroCanonico('901petrópolis'), 'Petrópolis');
  assert.equal(bairroCanonico('Jardom Botanico'), 'Jardim Botânico');
  assert.equal(bairroCanonico('Paternon'), 'Partenon');
  assert.equal(bairroCanonico('Chac Das Pedras'), 'Chácara das Pedras');
  assert.equal(bairroCanonico('B Fim'), 'Bom Fim');
  assert.equal(bairroCanonico('Moinhos De Ventos'), 'Moinhos de Vento');
});

test('acento não separa: Sarandi e Sarandí são o mesmo', () => {
  assert.equal(chaveBairro('Sarandi'), chaveBairro('Sarandí'));
  assert.equal(chaveBairro('Jardim Sabara'), chaveBairro('Jardim Sabará'));
});

test('caixa alta estranha é corrigida sem inventar nome', () => {
  assert.equal(bairroCanonico('Alto PetróPolis'), 'Alto Petrópolis');
  assert.equal(bairroCanonico('Cais Do Porto'), 'Cais do Porto');
  assert.equal(bairroCanonico('Costa E Silva'), 'Costa e Silva');
});

test('preposição no meio fica minúscula, no começo não', () => {
  assert.equal(bairroCanonico('DAS PEDRAS'), 'Das Pedras');
  assert.equal(bairroCanonico('chácara DAS pedras'), 'Chácara das Pedras');
});

test('bairros que APENAS parecem iguais continuam separados', () => {
  // Alto Petrópolis e Petrópolis são bairros distintos de Porto Alegre; juntar
  // os dois inflaria o maior bairro da loja com gente que mora em outro lugar.
  assert.notEqual(bairroCanonico('Alto Petrópolis'), bairroCanonico('Petrópolis'));
  assert.notEqual(bairroCanonico('Alto Teresópolis'), bairroCanonico('Teresópolis'));
  // "Centro" pode ser o de outra cidade (a base tem Guajuviras, de Canoas), e
  // não é seguro fundir com o Centro Histórico de Porto Alegre.
  assert.notEqual(bairroCanonico('Centro'), bairroCanonico('Centro Histórico'));
});

test('vazio e nulo não viram bairro', () => {
  assert.equal(bairroCanonico(''), '');
  assert.equal(bairroCanonico(null), '');
  assert.equal(bairroCanonico('   '), '');
});

test('contagem soma as grafias no mesmo balde', () => {
  const out = contarPorBairro([
    { bairro: "Passo D'Areia" },
    { bairro: 'Passo da Areia' },
    { bairro: 'Passoa Dareia' },
    { bairro: 'Petrópolis' },
    { bairro: '' },
  ]);
  assert.deepEqual(out, [
    { nome: "Passo d'Areia", qtd: 3 },
    { nome: 'Petrópolis', qtd: 1 },
  ]);
});
