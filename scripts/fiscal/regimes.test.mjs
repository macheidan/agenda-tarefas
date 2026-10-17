import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lucroPresumido, lucroReal, aliquotaSimples, elegivelSimples, irrfDividendos,
  aliquotaIrpfm, irpfm, cbsIbsRestaurante, lucroIsentoDistribuivel,
  PIS_COFINS_CUMULATIVO,
} from './regimes.mjs';
import { DRE_2026, FATURAMENTO_2025, TRIBUTOS_JAN_2026, FATOR_BASE_FISCAL } from './dados.mjs';

/** Erro relativo entre o modelo e o imposto que de fato saiu do banco. */
const desvio = (modelo, real) => Math.abs(modelo - real) / real;

// ── O modelo tem que reproduzir janeiro/2026, que é dado real ─────────────
// Se estas falharem, a premissa de que o regime atual é Lucro Presumido caiu.

test('PIS/COFINS de jan/26 confere com 3,65% cumulativo sobre dez/25', () => {
  for (const [marca, tributos] of Object.entries(TRIBUTOS_JAN_2026)) {
    const dezembro = FATURAMENTO_2025[marca][11];
    const modelo = dezembro * FATOR_BASE_FISCAL * PIS_COFINS_CUMULATIVO;
    assert.ok(desvio(modelo, tributos.pis + tributos.cofins) < 0.04,
      `${marca}: modelo ${modelo.toFixed(0)} x pago ${tributos.pis + tributos.cofins}`);
  }
});

test('a razão COFINS/PIS paga é exatamente 3,00/0,65 — assinatura do regime cumulativo', () => {
  for (const tributos of Object.values(TRIBUTOS_JAN_2026)) {
    assert.ok(desvio(tributos.cofins / tributos.pis, 0.03 / 0.0065) < 0.01);
  }
});

test('DARFs de 30/01 conferem com IRPJ e CSLL presumidos do 4º tri/2025', () => {
  for (const [marca, tributos] of Object.entries(TRIBUTOS_JAN_2026)) {
    const quarto = FATURAMENTO_2025[marca].slice(9).reduce((a, b) => a + b, 0);
    const modelo = lucroPresumido(quarto * FATOR_BASE_FISCAL, 3);
    assert.ok(desvio(modelo.irpj, tributos.irpj) < 0.03, `${marca} IRPJ`);
    assert.ok(desvio(modelo.csll, tributos.csll) < 0.03, `${marca} CSLL`);
  }
});

test('a decomposição de jan/26 fecha com a linha Tributos do DRE', () => {
  for (const [marca, t] of Object.entries(TRIBUTOS_JAN_2026)) {
    const soma = Object.values(t).reduce((a, b) => a + b, 0);
    assert.equal(soma, marca === 'dame' ? 53793 : 39631);
  }
});

// ── Regras ────────────────────────────────────────────────────────────────

test('adicional de 10% do IRPJ só incide acima de R$ 20 mil por mês', () => {
  // 12 meses, lucro presumido de exatamente R$ 240 mil: sem adicional.
  const semAdicional = lucroPresumido(240000 / 0.08, 12);
  assert.equal(Math.round(semAdicional.irpj), Math.round(240000 * 0.15));
  const comAdicional = lucroPresumido(340000 / 0.08, 12);
  assert.equal(Math.round(comAdicional.irpj), Math.round(340000 * 0.15 + 100000 * 0.10));
});

test('prejuízo zera IRPJ/CSLL e vira prejuízo fiscal, sem crédito no ano', () => {
  const r = lucroReal(-33240, 12);
  assert.equal(r.total, 0);
  assert.equal(r.prejuizoGerado, 33240);
});

test('compensação de prejuízo é limitada a 30% do lucro do ano', () => {
  const r = lucroReal(100000, 12, 90000);
  assert.equal(r.prejuizoUsado, 30000);
  assert.equal(r.base, 70000);
});

test('alíquota efetiva do Anexo I nas faixas que interessam', () => {
  assert.ok(Math.abs(aliquotaSimples(3500000) - 0.1181) < 0.001);
  assert.ok(Math.abs(aliquotaSimples(2500000) - 0.1081) < 0.001);
  assert.equal(aliquotaSimples(5000000), null);
});

test('sócio-administrador comum soma as receitas: acima do teto, nenhuma opta', () => {
  const global = { receitaGlobal: 6007399, socioComumAdministrador: true };
  assert.equal(elegivelSimples(global).elegivel, false);
  // A mesma receita, com quadros societários independentes, não impede.
  assert.equal(elegivelSimples({ ...global, socioComumAdministrador: false }).elegivel, false);
  assert.equal(elegivelSimples({ receitaGlobal: 3500000, socioComumAdministrador: true }).elegivel, true);
});

test('IRRF de dividendos pega o mês inteiro, não só o excedente', () => {
  assert.equal(irrfDividendos([50000]), 0);
  assert.equal(Math.round(irrfDividendos([50001])), 5000);
  // Junho/2026 da Dáme: R$ 50.378,76 estourou o teto por R$ 378,76.
  const dame = DRE_2026.dame.distribuicaoLucrosMensal;
  assert.ok(Math.abs(irrfDividendos(dame) - 5037.876) < 0.01);
  // A Lov não estourou em nenhum mês.
  assert.equal(irrfDividendos(DRE_2026.lov.distribuicaoLucrosMensal), 0);
});

test('alíquota do IRPFM sobe linear de 0 a 10% entre R$ 600 mil e R$ 1,2 mi', () => {
  assert.equal(aliquotaIrpfm(600000), 0);
  assert.ok(Math.abs(aliquotaIrpfm(900000) - 0.05) < 1e-9);
  assert.equal(aliquotaIrpfm(1200000), 0.10);
  assert.equal(aliquotaIrpfm(2000000), 0.10);
});

test('IRRF já pago abate o IRPFM', () => {
  const semRetencao = irpfm(633375, 0);
  assert.ok(Math.abs(semRetencao.devido - 3523) < 5);
  assert.equal(irpfm(633375, 10000).devido, 0);
});

test('a base da CBS exclui intermediação de plataforma e entrega', () => {
  const r = cbsIbsRestaurante(1000000, { comissoes: 57000, entrega: 78000 });
  assert.ok(Math.abs(r.aliquota - 0.0528) < 1e-9);
  assert.equal(r.base, 865000);
  assert.ok(Math.abs(r.total - 45672) < 1);
});

test('sem escrituração, o teto de lucro isento é o presumido menos tributos', () => {
  const sem = lucroIsentoDistribuivel({
    lucroPresumidoValor: 263802, tributosPeriodo: 237277, lucroContabil: 120343, temEscrituracao: false,
  });
  assert.equal(sem, 26525);
  const com = lucroIsentoDistribuivel({
    lucroPresumidoValor: 263802, tributosPeriodo: 237277, lucroContabil: 120343, temEscrituracao: true,
  });
  assert.equal(com, 120343);
});
