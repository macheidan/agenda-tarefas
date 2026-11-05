// Monta os lançamentos de Salários (linhas Dia 5 / Dia 20) a partir de um
// funcionário lido do texto da folha (utils/folhaTexto.js).
//
// Dia 20 (adiantamento): Salário = bruto (total de vencimentos), Empréstimo =
// −(empréstimos da folha), Banco = líquido. O Salário, negativo, vira o
// Adiantamento do Dia 5 do mês seguinte.
//
// Dia 5 (folha do mês anterior, paga no dia 5):
//   • Salário: "Tudo na folha" → líquido (sem desconto de falta da escala);
//     "Parte por fora" → salário base do cadastro.
//   • Banco = líquido.
//   • Feriado = feriados trabalhados na escala × feriado unitário do cadastro.
//   • Transporte = dias de transporte a pagar × transporte/dia do cadastro; em
//     branco no cadastro → não preenche. Rumi e Patricia saem da seção Transp
//     (a Patricia com Uber nos dias em que a Cintia não trabalha).
//   • Adiantamento = −(Salário do Dia 20 do mês anterior).
//   • Faltas: "Tudo na folha" → em branco; "Parte por fora" → −(base ÷ 30 × 2)
//     por falta não justificada (o dia + o DSR).
//   • Empréstimo = −(soma dos DESC. EMP. CRED. TRAB da folha); em "Parte por
//     fora", menos o empréstimo já descontado no Dia 20 do mês anterior.
//   • Flash = dias de transporte a pagar × R$12.
//   • Sócio: Salário = Banco = líquido; Transporte = Flash = valor mensal do
//     campo transporte do cadastro.
// Entrada fica de fora (é manual).

import {
  transporteDetalhe, diasSemTrabalho, perfilTranspDe, empDoPerfil,
  tarifaDoMes, calcTransporteEspecial,
} from './transporte.js';

export const VALE_DIA = 12;
const cents = (n) => Math.round(n * 100) / 100;
const neg = (v) => -Math.abs(v);

// Folha de <mes>/<ano> → mês em que entra. Dia 5 paga a folha do mês anterior.
export function mesAlvo(tipo, ano, mes) {
  if (tipo !== 'dia5') return { year: ano, month: mes };
  return mes === 11 ? { year: ano + 1, month: 0 } : { year: ano, month: mes + 1 };
}

const docDe = (salarios, empId, y, m) =>
  salarios.find((d) => d.employeeId === empId && d.year === y && d.month === m) || null;

// → { line, patch, extras: [{ year, month, line, patch }], transp: {perfil, patch}|null, notas: [] }
export function montarLancamento({ tipo, item, emp, employees, absences, salarios, transportes, year, month }) {
  const liq = item.liquido;
  const notas = [];
  if (tipo === 'dia20') {
    const ny = month === 11 ? year + 1 : year;
    const nm = (month + 1) % 12;
    const bruto = item.bruto ?? liq;
    if (item.bruto == null) notas.push('sem total de vencimentos: salário = líquido');
    return {
      line: 'dia20',
      patch: {
        salario: bruto,
        empres: item.emprestimoTotal ? neg(item.emprestimoTotal) : null,
        banco: liq,
        liquidoFolha: liq,
      },
      extras: [{ year: ny, month: nm, line: 'dia5', patch: { adiantamento: neg(bruto) } }],
      transp: null,
      notas,
    };
  }

  // Sócio (pró-labore): salário = líquido da folha; o "transporte" do cadastro
  // dele é o Flash do mês inteiro (valor fixo, não por dia) e vai igual no Flash.
  if (item.socio) {
    const ref = emp.transporteRef != null && emp.transporteRef !== '' ? Number(emp.transporteRef) : null;
    const p = { salario: liq, banco: liq, liquidoFolha: liq };
    if (ref != null) { p.transporte = ref; p.flash = ref; notas.push('sócio: transporte = flash do mês'); }
    return { line: 'dia5', patch: p, extras: [], transp: null, notas };
  }

  const mode = emp.salaryMode === 'fora' ? 'fora' : 'folha';
  const det = transporteDetalhe(emp, absences, year, month);
  const patch = { banco: liq, liquidoFolha: liq };

  if (mode === 'fora' && emp.salaryBase != null) patch.salario = Number(emp.salaryBase);
  else {
    patch.salario = liq;
    if (mode === 'fora') notas.push('sem salário base no cadastro: usei o líquido');
  }

  patch.feriado = det.feriadoTrab && emp.feriadoUnit != null ? cents(det.feriadoTrab * Number(emp.feriadoUnit)) : null;

  let transp = null;
  const perfil = perfilTranspDe(emp);
  if (perfil) {
    const empUber = perfil.uberDe ? empDoPerfil(employees, perfil.uberDe) : null;
    const uber = empUber ? diasSemTrabalho(empUber, absences, year, month) : 0;
    const tarifa = (f) => tarifaDoMes(transportes, perfil, year, month, f);
    const { total } = calcTransporteEspecial(perfil.key, det.dias, uber, tarifa);
    patch.transporte = total;
    transp = { perfil: perfil.key, patch: perfil.uberDe ? { dias: det.dias, uber } : { dias: det.dias } };
    notas.push(perfil.uberDe ? `Transp: ${det.dias} dias, ${uber} de Uber` : `Transp: ${det.dias} dias`);
  } else if (emp.transporteRef != null && emp.transporteRef !== '') {
    patch.transporte = cents(det.dias * Number(emp.transporteRef));
  }

  const py = month === 0 ? year - 1 : year;
  const pm = month === 0 ? 11 : month - 1;
  const ant = docDe(salarios, emp.id, py, pm)?.dia20?.salario;
  if (ant != null && ant !== '' && Number(ant) !== 0) patch.adiantamento = neg(Number(ant));

  const nFaltas = det.faltaNaoJust;
  patch.falta = mode === 'fora' && nFaltas && emp.salaryBase != null
    ? neg(cents((Number(emp.salaryBase) / 30) * 2 * nFaltas))
    : null;

  // "Parte por fora": o que já foi descontado de empréstimo no Dia 20 anterior
  // sai da soma da folha (o desconto não se repete no Dia 5).
  let emp20 = 0;
  if (mode === 'fora') {
    emp20 = Math.abs(Number(docDe(salarios, emp.id, py, pm)?.dia20?.empres) || 0);
    if (emp20 && item.emprestimoTotal) notas.push(`empréstimo: folha ${item.emprestimoTotal.toFixed(2)} − dia 20 ${emp20.toFixed(2)}`);
  }
  const empLiq = cents((item.emprestimoTotal || 0) - emp20);
  patch.empres = empLiq ? -empLiq : null;
  patch.flash = perfil?.flashIgualTransporte
    ? (patch.transporte ?? null)
    : det.dias ? det.dias * VALE_DIA : null;

  return { line: 'dia5', patch, extras: [], transp, notas };
}
