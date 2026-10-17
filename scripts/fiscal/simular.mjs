/**
 * Simulação de regime tributário para 2027 — Dáme e Lov.
 *
 *   node scripts/fiscal/simular.mjs [--custo-contabil=24000]
 *
 * Base de dados: DRE 2026 jan–jul realizado (`dados.mjs`). Regras: `regimes.mjs`.
 * Ano simulado: 2027, porque a opção de regime é anual e irretratável — 2026 já
 * está fechado — e porque em 2027 PIS/COFINS somem e entra a CBS.
 */
import {
  lucroPresumido, lucroReal, aliquotaSimples, elegivelSimples, irrfDividendos,
  irpfm, cbsIbsRestaurante, ICMS_RS_RESTAURANTE, TETO_DIVIDENDO_ISENTO_MENSAL,
} from './regimes.mjs';
import { DRE_2026, FATURAMENTO_2025, TRIBUTOS_JAN_2026, FATOR_BASE_FISCAL, PESSOAL } from './dados.mjs';

const arg = (nome, padrao) => {
  const m = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return m ? Number(m.split('=')[1]) : padrao;
};
/** Honorário contábil incremental do Lucro Real, por empresa, por ano. */
const CUSTO_CONTABIL_REAL = arg('custo-contabil', 24000);

const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const pct = (v) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const soma = (a) => a.reduce((x, y) => x + y, 0);

// ── 1. Fechar 2026 e usar como base de 2027 ──────────────────────────────
// Ago–dez de 2026 é projetado: sazonalidade de 2025 corrigida pelo ritmo
// medido em jan–jul de 2026 (as duas casas rodam ~12% abaixo de 2025).
function projetar(marca) {
  const d = DRE_2026[marca];
  const realizado = d.faturamento;
  const mesmoPeriodo2025 = soma(FATURAMENTO_2025[marca].slice(0, d.meses));
  const ritmo = realizado / mesmoPeriodo2025;
  const restante = soma(FATURAMENTO_2025[marca].slice(d.meses)) * ritmo;
  return { realizado, ritmo, restante, ano: realizado + restante };
}

/**
 * Lucro antes do IRPJ/CSLL. O "Resultado Operacional" do DRE já está líquido
 * da linha Tributos, que carrega o IRPJ/CSLL dentro — então é preciso devolver
 * o imposto sobre lucro para chegar no LAIR.
 */
function margemLair(marca) {
  const d = DRE_2026[marca];
  const impostoLucro = lucroPresumido(d.faturamento * FATOR_BASE_FISCAL, d.meses).total;
  const lair = d.resultadoOperacional + impostoLucro;
  return { lair, impostoLucro, margem: lair / d.faturamento };
}

const empresas = ['dame', 'lov'].map((marca) => {
  const d = DRE_2026[marca];
  const proj = projetar(marca);
  const { lair, margem } = margemLair(marca);
  const escala = proj.ano / d.faturamento; // jan–jul → ano cheio
  return {
    marca,
    nome: d.nome,
    receita2027: proj.ano,
    ritmo: proj.ritmo,
    margemLair: margem,
    lair2027: margem * proj.ano,
    comissoes: d.comissoes * escala,
    entrega: d.motoboy * escala,
    pessoal: d.despesasPessoal * escala,
    distribuicao2027: d.distribuicaoLucros * escala,
    distribuicaoMensal2026: d.distribuicaoLucrosMensal,
    // encargos de folha (INSS patronal + FGTS) medidos em jan/26, proporcionais
    // à folha. Não dependem do regime de IRPJ — entram só na carga total.
    encargosFolha: (TRIBUTOS_JAN_2026[marca].inss + TRIBUTOS_JAN_2026[marca].fgts)
      / DRE_2026[marca].despesasPessoal * DRE_2026[marca].meses * d.despesasPessoal * escala,
  };
});

const receitaGlobal2027 = soma(empresas.map((e) => e.receita2027));
const receitaGlobal2025 = soma(['dame', 'lov'].map((m) => soma(FATURAMENTO_2025[m])));

// ── 2. Regimes ───────────────────────────────────────────────────────────
function cenarios(e) {
  const baseFiscal = e.receita2027 * FATOR_BASE_FISCAL;
  const cbs = cbsIbsRestaurante(e.receita2027, { comissoes: e.comissoes, entrega: e.entrega });
  const icms = e.receita2027 * ICMS_RS_RESTAURANTE;
  const comum = cbs.total + icms + e.encargosFolha; // igual nos dois regimes

  const presumido = lucroPresumido(baseFiscal, 12);
  const real = lucroReal(e.lair2027, 12);

  return {
    cbs, icms, comum,
    presumido: { ...presumido, carga: comum + presumido.total, custoExtra: 0 },
    real: { ...real, carga: comum + real.total + CUSTO_CONTABIL_REAL, custoExtra: CUSTO_CONTABIL_REAL },
  };
}

// ── 3. Relatório ─────────────────────────────────────────────────────────
const L = console.log;
L('\n' + '═'.repeat(74));
L('  SIMULAÇÃO DE REGIME TRIBUTÁRIO — ANO-CALENDÁRIO 2027');
L('  base: DRE 2026 jan–jul realizado · regras: LC 214/2025 e Lei 15.270/2025');
L('═'.repeat(74));

L('\n▸ REGIME ATUAL: LUCRO PRESUMIDO');
L('  Provado pelo extrato de jan/26: ICMS pago à Secretaria da Fazenda e');
L('  PIS/COFINS em DARF na razão exata 3,00/0,65. Nada disso existe no Simples.');
for (const marca of ['dame', 'lov']) {
  const t = TRIBUTOS_JAN_2026[marca];
  L(`  ${DRE_2026[marca].nome.padEnd(12)} jan/26: ICMS ${brl(t.icms)} · PIS+COFINS ${brl(t.pis + t.cofins)}`
    + ` · IRPJ+CSLL ${brl(t.irpj + t.csll)} · INSS+FGTS ${brl(t.inss + t.fgts)}`);
}

L('\n▸ SIMPLES NACIONAL: VEDADO');
const eleg = elegivelSimples({ receitaGlobal: receitaGlobal2027, socioComumAdministrador: true });
L(`  Receita global 2025 ${brl(receitaGlobal2025)} · projeção 2027 ${brl(receitaGlobal2027)}`);
L(`  ${eleg.motivo}`);
L('  Como você é sócio-administrador das duas, as receitas SOMAM. Nem uma nem');
L('  outra pode optar — e separado seria pior de qualquer forma:');
for (const e of empresas) {
  const aliq = aliquotaSimples(e.receita2027);
  L(`    ${e.nome.padEnd(12)} Anexo I a ${brl(e.receita2027)} daria ${aliq ? pct(aliq) : 'acima do teto'}`
    + `${aliq ? ` = ${brl(aliq * e.receita2027)} (DAS, já com CPP)` : ''}`);
}

L('\n▸ 2027: A CBS SAI DA DISPUTA');
L('  PIS/COFINS acabam. A CBS de bares e restaurantes (LC 214/2025, arts. 273-276)');
L('  é cumulativa e por atividade — idêntica no Presumido e no Real. Ou seja: o');
L('  motivo que hoje segura o Lucro Real (3,65% cumulativo x 9,25% não cumulativo)');
L('  deixa de existir. Sobra só o IRPJ/CSLL para decidir.');
for (const e of empresas) {
  const c = cenarios(e);
  L(`    ${e.nome.padEnd(12)} CBS+IBS ${pct(c.cbs.aliquota)} sobre ${brl(c.cbs.base)}`
    + ` (exclui iFood e entrega) = ${brl(c.cbs.total)} · ${pct(c.cbs.total / e.receita2027)} da receita`);
}

L('\n▸ IRPJ + CSLL EM 2027 — É AQUI QUE A DECISÃO ACONTECE');
L('  ' + 'empresa'.padEnd(13) + 'receita'.padStart(14) + 'margem'.padStart(9)
  + 'presumido'.padStart(13) + 'real'.padStart(12) + 'diferença'.padStart(13));
let totalPresumido = 0; let totalReal = 0; let totalExtra = 0;
for (const e of empresas) {
  const c = cenarios(e);
  totalPresumido += c.presumido.total;
  totalReal += c.real.total;
  totalExtra += c.real.custoExtra;
  L('  ' + e.nome.padEnd(13) + brl(e.receita2027).padStart(14) + pct(e.margemLair).padStart(9)
    + brl(c.presumido.total).padStart(13) + brl(c.real.total).padStart(12)
    + brl(c.real.total - c.presumido.total).padStart(13));
}
L('  ' + '─'.repeat(72));
L('  ' + 'GRUPO'.padEnd(13) + brl(receitaGlobal2027).padStart(14) + ''.padStart(9)
  + brl(totalPresumido).padStart(13) + brl(totalReal).padStart(12)
  + brl(totalReal - totalPresumido).padStart(13));
L(`\n  Economia bruta do Lucro Real: ${brl(totalPresumido - totalReal)}/ano`);
L(`  (−) contabilidade adicional:  ${brl(totalExtra)}/ano  (${brl(CUSTO_CONTABIL_REAL)} por empresa)`);
L(`  = ECONOMIA LÍQUIDA:           ${brl(totalPresumido - totalReal - totalExtra)}/ano`);
const lov = empresas.find((e) => e.marca === 'lov');
L(`\n  A Lov ainda gera ${brl(-lov.lair2027)} de prejuízo fiscal, compensável contra`);
L('  até 30% do lucro de anos seguintes — no Presumido esse prejuízo se perde.');
L('  Optar pelo Lucro Real ANUAL (não trimestral): com balancete de suspensão os');
L('  meses ruins abatem os bons dentro do próprio ano.');

L('\n▸ PESSOA FÍSICA — Lei 15.270/2025');
const distribuicao = soma(empresas.map((e) => e.distribuicao2027));
const proLabore = PESSOAL.proLaboreMensal * 12;
const rtla = distribuicao + proLabore;
const irrfHoje = soma(empresas.map((e) => irrfDividendos(e.distribuicaoMensal2026)));
const comIrrf = irpfm(rtla, irrfHoje);
const alisado = irpfm(rtla, 0);
L(`  Distribuição projetada ${brl(distribuicao)} + pró-labore ${brl(proLabore)} = renda ${brl(rtla)}`);
L(`  IRPFM: alíquota ${pct(comIrrf.aliquota)} → piso de imposto ${brl(comIrrf.minimo)}`);
L(`  Padrão atual de saques → IRRF de 10% ${brl(irrfHoje)}, IRPFM residual ${brl(comIrrf.devido)}`
  + ` · total ${brl(irrfHoje + comIrrf.devido)}`);
L(`  Saques alisados (< ${brl(TETO_DIVIDENDO_ISENTO_MENSAL)}/mês por CNPJ) → IRRF R$ 0,`
  + ` IRPFM ${brl(alisado.devido)} · total ${brl(alisado.devido)}`);
L(`  Ganho de alisar: ${brl(irrfHoje + comIrrf.devido - alisado.devido)}/ano — pequeno, porque o`);
L('  IRRF é compensável contra o IRPFM. O que ele evita mesmo é o degrau: em');
L('  jun/26 a Dáme passou do teto por R$ 379 e isso custou R$ 5.038.');
L(`  Com duas empresas o teto é ${brl(TETO_DIVIDENDO_ISENTO_MENSAL * 2)}/mês sem retenção — desde que`);
L('  cada CNPJ fique abaixo do seu. Manter pró-labore baixo segue sendo certo:');
L('  dividendo custa ~0% até o teto, pró-labore custa 20% de INSS patronal.');

L('\n▸ O RISCO QUE VALE MAIS QUE A ESCOLHA DE REGIME');
const lucroLiquidoReal = soma(empresas.map((e) => Math.max(0, e.lair2027 - lucroReal(e.lair2027, 12).total)))
  - Math.max(0, -lov.lair2027);
L(`  Lucro contábil do grupo em 2027 (no Lucro Real): ~${brl(lucroLiquidoReal)}`);
L(`  Distribuição projetada:                          ${brl(distribuicao)}`);
L(`  Descoberto:                                      ${brl(distribuicao - lucroLiquidoReal)}`);
L('  Lucro distribuído acima do lucro apurado não é isento: vira rendimento');
L('  tributável do sócio (tabela progressiva) e, na Lov, não há lucro nenhum a');
L('  distribuir. Confirmar contra a ECD antes de qualquer coisa — o DRE aqui é');
L('  gerencial e de caixa, e pode estar classificando saque como distribuição.');
L('');
