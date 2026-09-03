// Cálculo do "Transporte a Pagar" — fonte única, usada pela Escala e por Salários.
//
// O transporte é pago ADIANTADO no dia 05 para o ciclo 06 do mês exibido → 05 do
// seguinte (regra do fechamento de folha das pizzarias). Então:
//   • ciclo a pagar (06 do mês exibido → 05 do seguinte): desconta folgas, férias
//     e as faltas/feriados trabalhados que estavam marcados ATÉ o pagamento
//     (createdAt ≤ dia 05). É o que faz um afastamento longo já marcado dar
//     zero, em vez de pagar dias que a pessoa não vai trabalhar. Marcação feita
//     depois do pagamento não entra aqui — entra no mês seguinte, como tardia —
//     e por isso o número de um mês já pago não muda depois.
//   • ciclo anterior (06 do mês anterior → 05 do exibido): já foi pago no dia 05
//     do mês anterior; falta e feriado trabalhado marcados DEPOIS desse pagamento
//     não foram descontados na época e descontam agora. Cada marcação desconta
//     exatamente uma vez: ou no próprio ciclo, ou como tardia no seguinte.
// Transporte a pagar (em dias) = dias corridos − folgas − férias − faltas e
// feriados trabalhados do ciclo (marcados) − faltas e feriados trabalhados
// tardios do ciclo anterior. Nunca fica negativo (não há saldo a compensar).

const pad = (n) => String(n).padStart(2, '0');
const toISO = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

// Dias de folga fixa da semana do funcionário (novo array folgaWeekdays com
// fallback pro antigo folgaWeekday). Idêntico ao empFolgaWeekdays da Escala.
export function empFolgaWeekdays(emp) {
  if (Array.isArray(emp.folgaWeekdays)) return emp.folgaWeekdays;
  if (emp.folgaWeekday != null) return [emp.folgaWeekday];
  return [];
}

function nthSundayOf(dt) {
  let c = 0;
  const y = dt.getFullYear();
  const m = dt.getMonth();
  const d = dt.getDate();
  for (let i = 1; i <= d; i++) if (new Date(y, m, i).getDay() === 0) c++;
  return c;
}

// Uma data é folga do funcionário: marca real de folga no banco tem prioridade;
// senão, derivada da config (dia fixo da semana OU o Nº domingo do mês).
function isFolgaOn(emp, dt, absences) {
  const ds = toISO(dt);
  const real = absences.find((a) => a.employeeId === emp.id && a.date === ds);
  if (real) return real.type === 'folga';
  const wd = dt.getDay();
  if (empFolgaWeekdays(emp).includes(wd)) return true;
  if (emp.folgaMonthN != null && wd === 0 && nthSundayOf(dt) === emp.folgaMonthN) return true;
  return false;
}

// Data (ISO) em que a marcação foi criada. Sem createdAt (registro antigo ou
// importado) tratamos como tardia: é o comportamento anterior, que descontava
// toda falta do ciclo anterior.
function createdISO(a) {
  const c = a.createdAt;
  if (!c) return null;
  const d = typeof c.toDate === 'function' ? c.toDate() : c instanceof Date ? c : new Date(c);
  return Number.isNaN(d.getTime()) ? null : toISO(d);
}
const isFalta = (t) => t === 'falta_justificada' || t === 'falta_injustificada';

// Detalhamento do transporte a pagar de um funcionário no mês exibido.
// Retorna { dias, daysInWindow, folgas, ferias, faltasCiclo, feriadoTrabCiclo,
//   faltasTardias, feriadoTrabTardio, faltas, faltaJust, faltaNaoJust, feriadoTrab }.
// faltas/faltaJust/faltaNaoJust/feriadoTrab são a apuração COMPLETA do ciclo
// anterior (o que vai pra contabilidade); só a parte tardia entra no transporte.
export function transporteDetalhe(emp, absences, year, month) {
  const winStart = new Date(year, month, 6);
  const winEnd = new Date(year, month + 1, 5);
  const absStart = new Date(year, month - 1, 6);
  const absEnd = new Date(year, month, 5);
  const absStartISO = toISO(absStart);
  const absEndISO = toISO(absEnd);
  // Cada ciclo é pago no dia 05 que antecede o seu 06.
  const paidISO = toISO(new Date(year, month, 5));
  const prevPaidISO = toISO(new Date(year, month - 1, 5));
  // Datas ISO (YYYY-MM-DD) comparam cronologicamente como string.
  const inAbsWindow = (iso) => iso >= absStartISO && iso <= absEndISO;
  const daysInWindow = Math.round((winEnd - winStart) / 86400000) + 1;

  const occAbs = absences.filter(
    (a) => a.employeeId === emp.id && a.date && inAbsWindow(a.date)
  );
  const faltaJust = occAbs.filter((a) => a.type === 'falta_justificada').length;
  const faltaNaoJust = occAbs.filter((a) => a.type === 'falta_injustificada').length;
  const feriadoTrab = occAbs.filter((a) => a.type === 'feriado_trabalhado').length;
  // Tardias: marcadas depois do pagamento do ciclo anterior (ou sem createdAt).
  const tardia = (a) => { const c = createdISO(a); return c == null || c > prevPaidISO; };
  const faltasTardias = occAbs.filter((a) => isFalta(a.type) && tardia(a)).length;
  const feriadoTrabTardio = occAbs.filter((a) => a.type === 'feriado_trabalhado' && tardia(a)).length;

  // Ciclo a pagar, dia a dia: a marcação real do dia manda; sem marcação, vale
  // a folga automática da config. Cada dia desconta no máximo uma vez. Falta e
  // feriado trabalhado só contam se estavam marcados até o pagamento do ciclo.
  const conhecida = (a) => { const c = createdISO(a); return c == null || c <= paidISO; };
  let folgas = 0;
  let ferias = 0;
  let faltasCiclo = 0;
  let feriadoTrabCiclo = 0;
  const dt = new Date(winStart);
  while (dt <= winEnd) {
    const ds = toISO(dt);
    const real = absences.find((a) => a.employeeId === emp.id && a.date === ds);
    if (real?.type === 'ferias') ferias++;
    else if (isFalta(real?.type) && conhecida(real)) faltasCiclo++;
    else if (real?.type === 'feriado_trabalhado' && conhecida(real)) feriadoTrabCiclo++;
    else if (isFolgaOn(emp, dt, absences)) folgas++;
    dt.setDate(dt.getDate() + 1);
  }

  const dias = Math.max(
    0,
    daysInWindow - folgas - ferias - faltasCiclo - feriadoTrabCiclo - faltasTardias - feriadoTrabTardio
  );
  return {
    dias, daysInWindow, folgas, ferias, faltasCiclo, feriadoTrabCiclo, faltasTardias, feriadoTrabTardio,
    faltas: faltaJust + faltaNaoJust, faltaJust, faltaNaoJust, feriadoTrab,
  };
}

// Atalho: só o número de dias de transporte a pagar (base do Flash = dias × 12).
export function transporteDiasNoMes(emp, absences, year, month) {
  return transporteDetalhe(emp, absences, year, month).dias;
}
