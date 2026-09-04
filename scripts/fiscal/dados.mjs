/**
 * Dados de entrada da simulação de regimes tributários.
 *
 * FONTE: planilha "DRE" no Drive (id 1ocnKjysZ-Eb7IIgtGO-BY1lGE9jNDNtI61eZgnzFuvE),
 * abas `DAME 2026`, `LOV 2026`, `DAME 2025`, `LOV 2025` e a aba de lançamentos dos
 * extratos (janeiro/2026). Lido em 2026-09-01.
 *
 * A linha "Tributos" do DRE é um agregado de caixa: junta imposto sobre venda
 * (ICMS/PIS/COFINS), imposto sobre lucro (IRPJ/CSLL) e encargo de folha
 * (INSS patronal + FGTS). A simulação precisa dos três separados, e a única
 * decomposição exata que existe é a de janeiro/2026 (abaixo) — o resto do ano
 * é reconstruído por alíquota em `regimes.mjs` e conferido contra o total pago.
 */

// ── DRE 2026, jan–jul (realizado) ─────────────────────────────────────────
export const DRE_2026 = {
  dame: {
    nome: 'Dáme Pizza',
    meses: 7,
    faturamentoMensal: [237220.00, 235675.00, 293151.05, 313851.31, 337318.55, 330046.61, 348543.39],
    faturamento: 2095805.91,
    tributos: 265280.31,
    insumos: 837365.90,
    bebidas: 19098.85,
    comissoes: 119710.15,
    taxasCartao: 40044.76,
    motoboy: 163162.64,
    despesasAdm: 80244.58,
    despesasMarketing: 134203.45,
    despesasPessoal: 290384.00,
    resultadoOperacional: 48028.85,
    // capex/abaixo da linha operacional
    investimentos: 29904.00,
    distribuicaoLucrosMensal: [30008.00, 5459.90, 25013.31, 44160.13, 34070.88, 50378.76, 27897.63],
    distribuicaoLucros: 216988.61,
  },
  lov: {
    nome: 'Lov Pizza',
    meses: 7,
    faturamentoMensal: [177380.00, 174744.57, 215537.10, 205725.23, 225574.43, 236497.61, 229669.53],
    faturamento: 1465128.47,
    tributos: 190988.46,
    insumos: 507966.64,
    bebidas: 26849.70,
    comissoes: 101215.66,
    taxasCartao: 34948.75,
    motoboy: 125904.20,
    despesasAdm: 121717.84,
    despesasMarketing: 138850.74,
    despesasPessoal: 201180.47,
    resultadoOperacional: -50901.61,
    investimentos: 4.00,
    distribuicaoLucrosMensal: [15970.00, 1056.95, 7973.78, 21327.57, 16877.76, 47073.67, 13054.63],
    distribuicaoLucros: 123334.36,
  },
};

// ── Faturamento 2025 fechado (base da sazonalidade e do teto do Simples) ──
export const FATURAMENTO_2025 = {
  dame: [270899.00, 270202.00, 357695.00, 330981.00, 387741.00, 377405.19,
         376795.74, 343622.30, 310505.99, 313390.00, 318228.00, 299708.00],
  lov: [167403.00, 165882.00, 249510.00, 228501.00, 287902.00, 293447.89,
        289267.86, 258723.39, 244408.59, 245231.00, 232724.00, 219030.00],
};

/**
 * Decomposição EXATA da linha "Tributos" de janeiro/2026, item a item do
 * extrato. É o que prova qual é o regime atual: há ICMS pago direto à
 * Secretaria da Fazenda e PIS/COFINS em DARF separado — nenhum dos dois
 * existiria no Simples Nacional. Os DARFs de 30/01 batem com IRPJ e CSLL do
 * 4º trimestre/2025 calculados sobre lucro presumido (conferido em
 * `regimes.test.mjs`).
 */
export const TRIBUTOS_JAN_2026 = {
  dame: { icms: 9949, pis: 1837, cofins: 8476, irpj: 11442, csll: 9419, inss: 7642, fgts: 4628, outros: 400 },
  lov: { icms: 7670, pis: 1297, cofins: 5985, irpj: 7671, csll: 6904, inss: 6186, fgts: 3918, outros: 0 },
};

/**
 * Fator entre o "Faturamento" do DRE e a base de cálculo fiscal observada.
 * Calibrado no PIS/COFINS de janeiro/2026: COFINS de R$ 8.476 a 3% implica
 * base de R$ 282.533 contra faturamento de R$ 299.708 em dez/25 (Dáme).
 * O mesmo 0,943 reproduz o PIS, e o IRPJ/CSLL do trimestre.
 */
export const FATOR_BASE_FISCAL = 0.943;

/** Retirada pessoal declarada pelo sócio (resposta em 2026-09-01). */
export const PESSOAL = {
  proLaboreMensal: 5000,
  observacao: 'Sócio-administrador das duas empresas; pró-labore somado até R$ 5 mil/mês.',
};
