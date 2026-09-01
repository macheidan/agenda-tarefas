// node --test scripts/clientes/enderecos.test.mjs
//
// Os casos aqui não são inventados: cada bloco veio de uma linha real do backup
// (`G:\Meu Drive\02 Pizzarias\07 Backup Saipos\cadastros\{dame,lov}.jsonl`),
// com os dígitos preservados porque endereço de rua não identifica ninguém
// sozinho — o que identifica (nome, telefone, CPF) não entra em repositório.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEndereco,
  chaveEndereco,
  unirEnderecos,
  montarEnderecos,
  MAX_ENDERECOS,
} from './enderecos.mjs';

test('endereço simples: os cinco campos saem separados', () => {
  assert.deepEqual(parseEndereco('Novo Hamburgo, Vila Rosa - Rua Avaí, 205, 2401'), {
    logradouro: 'Rua Avaí',
    numero: '205',
    complemento: '2401',
    bairro: 'Vila Rosa',
    cidade: 'Novo Hamburgo',
  });
});

test('sem complemento: o campo simplesmente não existe', () => {
  assert.deepEqual(parseEndereco('Porto Alegre, Petrópolis - Rua Carazinho, 531'), {
    logradouro: 'Rua Carazinho',
    numero: '531',
    bairro: 'Petrópolis',
    cidade: 'Porto Alegre',
  });
});

test('complemento com vírgula dentro vira o RESTO da linha, não o 3º campo', () => {
  const e = parseEndereco(
    'Porto Alegre, Floresta - Avenida Chicago, 272, 503, Em frente da empresa STV'
  );
  assert.equal(e.complemento, '503, Em frente da empresa STV');
  assert.equal(e.numero, '272');
});

test('complemento com " - " dentro não engana o corte do bairro', () => {
  const e = parseEndereco(
    'Porto Alegre, Santana - R. Gomes Jardim, 623, Deixar o pedido no portão da casa/prédio - 703'
  );
  assert.equal(e.bairro, 'Santana');
  assert.equal(e.logradouro, 'R. Gomes Jardim');
  assert.equal(e.complemento, 'Deixar o pedido no portão da casa/prédio - 703');
});

test('logradouro com " - " dentro fica inteiro no logradouro', () => {
  const e = parseEndereco('Porto Alegre, Rio Branco - Rua Quintino Bocaiúva - lado par, 1664, 501');
  assert.equal(e.bairro, 'Rio Branco');
  // "- lado par" é metadado de cadastro do Saipos, não parte do endereço falado.
  assert.equal(e.logradouro, 'Rua Quintino Bocaiúva');
  assert.equal(e.numero, '1664');
});

test('logradouro em CAIXA ALTA é preservado como veio', () => {
  // Não vira Title Case de propósito: normalizar caixa estraga sigla
  // ("BR-116", "RS-118") e o ganho é cosmético.
  const e = parseEndereco('Porto Alegre, Passo da Areia - R JARI, 619, 904 torre c');
  assert.equal(e.logradouro, 'R JARI');
  assert.equal(e.complemento, '904 torre c');
});

test('número ausente: só logradouro depois do traço', () => {
  assert.deepEqual(parseEndereco('Porto Alegre, Petrópolis - Avenida Alegrete'), {
    logradouro: 'Avenida Alegrete',
    bairro: 'Petrópolis',
    cidade: 'Porto Alegre',
  });
});

test('número zero quer dizer "não tem" e o 3º campo é o complemento de verdade', () => {
  const e = parseEndereco('Porto Alegre, Centro - Rua X, 0, Apto 302');
  assert.equal(e.numero, undefined);
  assert.equal(e.complemento, 'Apto 302');
});

test('"s/n" e variantes também são número ausente', () => {
  for (const n of ['s/n', 'S/N', 'sn', 'sem número', '', '.', '-']) {
    const e = parseEndereco(`Porto Alegre, Centro - Rua X, ${n}`);
    assert.equal(e.numero, undefined, `"${n}" deveria virar número vazio`);
  }
});

test('2º campo que não começa com dígito é complemento, não número', () => {
  const e = parseEndereco('Porto Alegre, Centro - Rua Y, casa E11');
  assert.equal(e.numero, undefined);
  assert.equal(e.complemento, 'casa E11');
});

test('número alfanumérico ("161a", "1.325") é preservado cru', () => {
  assert.equal(parseEndereco('Porto Alegre, Centro - Rua X, 161a').numero, '161a');
  assert.equal(parseEndereco('Porto Alegre, Centro - Rua X, 1.325').numero, '1.325');
});

test('literal "null" grudado no nome da rua é removido', () => {
  const e = parseEndereco(
    'Porto Alegre, Santa Cecília - null Rua Ramiro Barcelos 2350 - Hospital de Clínicas de Porto Alegre, 2350, UTI ADULTO'
  );
  assert.equal(e.logradouro, 'Rua Ramiro Barcelos 2350 - Hospital de Clínicas de Porto Alegre');
  assert.equal(e.numero, '2350');
});

test('acentuação: NFD e NFC descrevem o mesmo lugar', () => {
  const nfc = parseEndereco('Porto Alegre, Petrópolis - Rua Carazinho, 531');
  const nfd = parseEndereco(
    'Porto Alegre, Petrópolis - Rua Carazinho, 531'.normalize('NFD')
  );
  assert.equal(chaveEndereco(nfc), chaveEndereco(nfd));
});

test('quebra de linha e espaço duplo no meio do endereço não viram campo', () => {
  const e = parseEndereco('Porto Alegre, Centro\n Histórico - R.  Dr. Flores, 383,  Apto 804 ');
  assert.equal(e.bairro, 'Centro Histórico');
  assert.equal(e.logradouro, 'R. Dr. Flores');
  assert.equal(e.complemento, 'Apto 804');
});

test('campo vazio, nulo ou só pontuação devolve null', () => {
  for (const v of ['', null, undefined, '   ', '<br>', ',']) {
    assert.equal(parseEndereco(v), null, `${JSON.stringify(v)} deveria devolver null`);
  }
});

test('linha sem " - ": vira logradouro solto em vez de sumir', () => {
  const e = parseEndereco('Rua Sem Formato 42');
  assert.equal(e.logradouro, 'Rua Sem Formato 42');
  assert.equal(e.bairro, undefined);
});

// --- chave do lugar --------------------------------------------------------

test('o tipo do logradouro sai da chave: "R." e "Rua" são o mesmo lugar', () => {
  const a = parseEndereco('Porto Alegre, Petrópolis - R. Barão de Ubá, 382, 301');
  const b = parseEndereco('Porto Alegre, Petrópolis - Rua Barão de Ubá, 382, 502');
  assert.equal(chaveEndereco(a), chaveEndereco(b));
});

test('o complemento NÃO entra na chave, mas o número entra', () => {
  const a = parseEndereco('Porto Alegre, Petrópolis - Rua X, 382, 301');
  const b = parseEndereco('Porto Alegre, Petrópolis - Rua X, 383, 301');
  assert.notEqual(chaveEndereco(a), chaveEndereco(b));
});

test('bairro NÃO entra na chave: mesma rua e número é o mesmo lugar', () => {
  // Rua de divisa de bairro, que cada canal atribui a um lado — 281 casos no
  // backup, todos ruído. Ver o comentário de `chaveEndereco`.
  const a = parseEndereco('Porto Alegre, Bela Vista - Rua Coronel Lucas de Oliveira, 1745');
  const b = parseEndereco('Porto Alegre, Petrópolis - Rua Coronel Lucas de Oliveira, 1745');
  assert.equal(chaveEndereco(a), chaveEndereco(b));
});

test('cidade diferente é lugar diferente, mesmo com a mesma rua e número', () => {
  const a = parseEndereco('Porto Alegre, Centro - Rua Sete de Setembro, 100');
  const b = parseEndereco('Canoas, Centro - Rua Sete de Setembro, 100');
  assert.notEqual(chaveEndereco(a), chaveEndereco(b));
});

test('bairro fundido é o primeiro que apareceu, para não trocar a cada rodada', () => {
  const d1 = unirEnderecos(
    ['Porto Alegre, Bela Vista - Rua Coronel Lucas de Oliveira, 1745'],
    ['Porto Alegre, Petrópolis - Rua Coronel Lucas de Oliveira, 1745']
  );
  assert.equal(d1[0].bairro, 'Bela Vista');
  // A ordem das listas manda; re-unir o resultado consigo mesmo não muda nada.
  assert.deepEqual(unirEnderecos(d1, d1), d1);
});

test('endereço sem logradouro não entra na lista', () => {
  // Só bairro e cidade não localiza porta nenhuma, e isso o cliente já tem em
  // `b` e `c`.
  assert.deepEqual(unirEnderecos([{ bairro: 'Centro', cidade: 'Porto Alegre' }]), []);
});

// --- união -----------------------------------------------------------------

test('as 6 linhas do cadastro real viram 3 lugares', () => {
  // Cadastro dame/7962: três endereços escritos de seis jeitos.
  const d = unirEnderecos([
    'Novo Hamburgo, Vila Rosa - Rua Avaí, 205, 2401',
    'Porto Alegre, Floresta - Avenida Chicago, 272, 503, Em frente da empresa STV',
    'Porto Alegre, Floresta - Avenida Chicago, 272, 503, Empresa de segurança STV',
    'Porto Alegre, Floresta - Rua Conde de Porto Alegre, 489, 403',
    'Porto Alegre, Floresta - Rua Conde de Porto Alegre, 489, 403 / Padaria Dalmas',
    'Porto Alegre, Floresta - Rua Conde de Porto Alegre, 489, 403, Padaria Dalmas',
  ]);
  assert.equal(d.length, 3);
  // Do apartamento escrito de três jeitos fica o mais curto — é o número puro.
  const conde = d.find((e) => e.logradouro.includes('Conde'));
  assert.equal(conde.complemento, '403');
});

test('unir é idempotente: rodar duas vezes não duplica nem muda nada', () => {
  const cru = [
    'Porto Alegre, Floresta - Avenida Chicago, 272, 503',
    'Porto Alegre, Petrópolis - R. Barão de Ubá, 382, 301',
  ];
  const uma = unirEnderecos(cru);
  const duas = unirEnderecos(uma, cru);
  const tres = unirEnderecos(duas, uma, cru);
  assert.deepEqual(duas, uma);
  assert.deepEqual(tres, uma);
});

test('endereço já gravado no Firestore entra sem virar duplicata do cru', () => {
  const gravado = [{ logradouro: 'R. Barão de Ubá', numero: '382', bairro: 'Petrópolis', cidade: 'Porto Alegre' }];
  const cru = ['Porto Alegre, Petrópolis - Rua Barão de Ubá, 382, 301'];
  const d = unirEnderecos(gravado, cru);
  assert.equal(d.length, 1);
  // O merge acrescenta o complemento que faltava e nunca apaga o que havia.
  assert.equal(d[0].complemento, '301');
});

test('lista vazia nunca apaga o que já existe', () => {
  const gravado = [{ logradouro: 'Rua X', numero: '10', bairro: 'Centro', cidade: 'Porto Alegre' }];
  assert.deepEqual(unirEnderecos(gravado, []), gravado);
  assert.deepEqual(unirEnderecos(gravado, ['']), gravado);
  assert.deepEqual(unirEnderecos(gravado, null), gravado);
});

// --- montagem final --------------------------------------------------------

test('o endereço do bairro do cliente vem primeiro', () => {
  const d = montarEnderecos(
    [
      [
        'Novo Hamburgo, Vila Rosa - Rua Avaí, 205, 2401',
        'Porto Alegre, Floresta - Avenida Chicago, 272, 503',
      ],
    ],
    { bairro: 'Floresta', cidade: 'Porto Alegre' }
  );
  assert.equal(d[0].bairro, 'Floresta');
  assert.equal(d.length, 2);
});

test('sem endereço nenhum devolve null, para o campo sumir do doc', () => {
  assert.equal(montarEnderecos([[]], {}), null);
  assert.equal(montarEnderecos([['', null]], {}), null);
});

test('a lista é cortada no teto', () => {
  const muitos = Array.from(
    { length: MAX_ENDERECOS + 5 },
    (_, i) => `Porto Alegre, Centro - Rua ${i}, ${i + 1}`
  );
  assert.equal(montarEnderecos([muitos], {}).length, MAX_ENDERECOS);
});
