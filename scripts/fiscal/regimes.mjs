/**
 * Regras tributárias usadas na simulação — funções puras, sem I/O, para o
 * teste em `regimes.test.mjs` conferir cada uma contra o imposto realmente
 * pago em janeiro/2026.
 *
 * Ano-base da simulação: 2027. Motivo: a opção por Lucro Presumido ou Real é
 * anual e irretratável, exercida no primeiro recolhimento de janeiro — 2026 já
 * está travado. 2027 também é o ano em que PIS/COFINS deixam de existir e
 * entra a CBS, o que muda o eixo da comparação (ver `cbsIbsRestaurante`).
 */

// ── Lucro Presumido ───────────────────────────────────────────────────────
// Restaurante vende mercadoria de produção própria: presunção de 8% para IRPJ
// e 12% para CSLL (Lei 9.249/1995, arts. 15 e 20).
export const PRESUNCAO_IRPJ = 0.08;
export const PRESUNCAO_CSLL = 0.12;
const IRPJ_ALIQ = 0.15;
const IRPJ_ADICIONAL = 0.10;
const CSLL_ALIQ = 0.09;
/** Adicional de 10% incide sobre o que passar de R$ 20 mil por mês de período. */
const LIMITE_ADICIONAL_MENSAL = 20000;

/** IRPJ + CSLL sobre lucro presumido. `meses` define o limite do adicional. */
export function lucroPresumido(baseFiscal, meses = 12) {
  const lucroIrpj = baseFiscal * PRESUNCAO_IRPJ;
  const excedente = Math.max(0, lucroIrpj - LIMITE_ADICIONAL_MENSAL * meses);
  const irpj = lucroIrpj * IRPJ_ALIQ + excedente * IRPJ_ADICIONAL;
  const csll = baseFiscal * PRESUNCAO_CSLL * CSLL_ALIQ;
  return { lucroIrpj, irpj, csll, total: irpj + csll };
}

/**
 * IRPJ + CSLL sobre lucro real. Prejuízo não gera crédito no ano: zera o
 * imposto e vira prejuízo fiscal, compensável em anos seguintes contra no
 * máximo 30% do lucro de cada ano (Lei 9.065/1995, art. 15).
 */
export function lucroReal(lair, meses = 12, prejuizoAcumulado = 0) {
  if (lair <= 0) {
    return { base: 0, irpj: 0, csll: 0, total: 0, prejuizoGerado: -lair, prejuizoUsado: 0 };
  }
  const prejuizoUsado = Math.min(prejuizoAcumulado, lair * 0.30);
  const base = lair - prejuizoUsado;
  const excedente = Math.max(0, base - LIMITE_ADICIONAL_MENSAL * meses);
  const irpj = base * IRPJ_ALIQ + excedente * IRPJ_ADICIONAL;
  const csll = base * CSLL_ALIQ;
  return { base, irpj, csll, total: irpj + csll, prejuizoGerado: 0, prejuizoUsado };
}

// ── Simples Nacional, Anexo I ─────────────────────────────────────────────
// Restaurante/pizzaria (CNAE 5611-2/01) é tributado pelo Anexo I.
const ANEXO_I = [
  { teto: 180000, aliq: 0.040, deducao: 0 },
  { teto: 360000, aliq: 0.073, deducao: 5940 },
  { teto: 720000, aliq: 0.095, deducao: 13860 },
  { teto: 1800000, aliq: 0.107, deducao: 22500 },
  { teto: 3600000, aliq: 0.143, deducao: 87300 },
  { teto: 4800000, aliq: 0.190, deducao: 378000 },
];
export const TETO_SIMPLES = 4800000;

/** Alíquota efetiva do Anexo I para uma receita bruta dos últimos 12 meses. */
export function aliquotaSimples(rbt12) {
  if (rbt12 > TETO_SIMPLES) return null;
  const faixa = ANEXO_I.find((f) => rbt12 <= f.teto);
  return (rbt12 * faixa.aliq - faixa.deducao) / rbt12;
}

/**
 * O impedimento que decide o caso: sócio que participa de outra empresa do
 * Simples (LC 123/2006, art. 3º, §4º, III) ou que administra outra pessoa
 * jurídica com fins lucrativos (mesmo §4º, V) só pode optar se a receita bruta
 * GLOBAL das empresas ficar dentro do teto. Não é por CNPJ.
 */
export function elegivelSimples({ receitaGlobal, socioComumAdministrador }) {
  if (!socioComumAdministrador) return { elegivel: receitaGlobal <= TETO_SIMPLES, motivo: null };
  if (receitaGlobal > TETO_SIMPLES) {
    return {
      elegivel: false,
      motivo: `receita bruta global de R$ ${receitaGlobal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} `
        + `ultrapassa o teto de R$ ${TETO_SIMPLES.toLocaleString('pt-BR')} (LC 123/2006, art. 3º, §4º, III e V)`,
    };
  }
  return { elegivel: true, motivo: null };
}

// ── Imposto sobre consumo ─────────────────────────────────────────────────
// PIS/COFINS cumulativo (Lucro Presumido) x não cumulativo (Lucro Real).
export const PIS_COFINS_CUMULATIVO = 0.0365;
export const PIS_COFINS_NAO_CUMULATIVO = 0.0925;

/** ICMS/RS: regime diferenciado de bares e restaurantes, 3,5% da receita
 *  bruta, sem crédito (RICMS/RS art. 38-A, redação do Decreto 57.930/2024,
 *  vigente de 2025 a 2028). Sobrevive intacto em 2027 — o IBS só começa a
 *  substituir o ICMS em 2029. */
export const ICMS_RS_RESTAURANTE = 0.035;

/**
 * CBS + IBS em 2027 no regime específico de bares e restaurantes
 * (LC 214/2025, arts. 273 a 276).
 *
 * Três coisas importam aqui:
 *  - alíquota de referência da CBS 8,8%, reduzida em 0,1 p.p. em 2027 porque o
 *    IBS entra em 0,1% — a soma fica nos mesmos 8,8%;
 *  - o art. 275 reduz a alíquota em 40% para fornecimento de alimentação;
 *  - o art. 274, parágrafo único, tira da base a intermediação de plataforma
 *    digital (iFood), a entrega e a gorjeta. Num delivery isso é ~14% da
 *    receita e derruba bastante a carga efetiva.
 *
 * O regime é cumulativo: sem crédito para o adquirente e sem crédito nas
 * aquisições. Por isso a CBS **não depende** de ser Lucro Presumido ou Real —
 * é a mesma nos dois, e some da comparação entre regimes.
 */
export const CBS_IBS_2027 = 0.088;
export const REDUCAO_BARES_RESTAURANTES = 0.40;

export function cbsIbsRestaurante(faturamento, { comissoes = 0, entrega = 0 } = {}) {
  const aliquota = CBS_IBS_2027 * (1 - REDUCAO_BARES_RESTAURANTES);
  const base = faturamento - comissoes - entrega;
  return { aliquota, base, total: base * aliquota };
}

// ── Camada pessoa física (Lei 15.270/2025, vigente desde 01/01/2026) ──────
export const TETO_DIVIDENDO_ISENTO_MENSAL = 50000;
export const IRRF_DIVIDENDOS = 0.10;

/**
 * IRRF de 10% sobre lucros distribuídos. O limite de R$ 50 mil é por empresa
 * pagadora e por sócio, apurado mês a mês — e quando estoura, os 10% pegam o
 * valor INTEIRO do mês, não só o excedente. Distribuir R$ 50.001 custa
 * R$ 5.000,10; distribuir R$ 50.000 custa zero.
 */
export function irrfDividendos(distribuicoesMensais) {
  return distribuicoesMensais.reduce(
    (acc, v) => acc + (v > TETO_DIVIDENDO_ISENTO_MENSAL ? v * IRRF_DIVIDENDOS : 0),
    0,
  );
}

export const IRPFM_PISO = 600000;
export const IRPFM_TETO = 1200000;

/** Alíquota do IRPF mínimo das altas rendas: (renda / 60.000) − 10, de 0 a 10%. */
export function aliquotaIrpfm(rendaTotalAnual) {
  if (rendaTotalAnual <= IRPFM_PISO) return 0;
  if (rendaTotalAnual >= IRPFM_TETO) return 0.10;
  return rendaTotalAnual / 60000 / 100 - 0.10;
}

/** IRPFM devido = alíquota × renda − imposto já pago no ano (inclusive o IRRF
 *  de 10% sobre dividendos, que é compensável). Nunca negativo. */
export function irpfm(rendaTotalAnual, impostoJaPago) {
  const aliquota = aliquotaIrpfm(rendaTotalAnual);
  const minimo = rendaTotalAnual * aliquota;
  return { aliquota, minimo, devido: Math.max(0, minimo - impostoJaPago) };
}

/**
 * Limite do lucro que pode sair isento. Sem escrituração contábil, o Lucro
 * Presumido só isenta o lucro presumido menos os tributos do período
 * (Lei 9.249/1995, art. 10 c/c IN SRF 93/1997, art. 48). Com escrituração, o
 * limite passa a ser o lucro contábil — que é o mesmo teto do Lucro Real.
 */
export function lucroIsentoDistribuivel({ lucroPresumidoValor, tributosPeriodo, lucroContabil, temEscrituracao }) {
  if (temEscrituracao) return lucroContabil;
  return Math.max(0, lucroPresumidoValor - tributosPeriodo);
}
