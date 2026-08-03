// Cálculo do "Transporte a Pagar" — fonte única, usada pela Escala e por Salários.
//
// O transporte a pagar de um mês mistura DOIS ciclos (regra do fechamento de folha
// das pizzarias, 06→05):
//   • dias corridos + folgas → ciclo a pagar: 06 do mês exibido → 05 do seguinte
//     (adiantado no fechamento do dia do pagamento).
//   • faltas → ciclo anterior já apurado: 06 do mês anterior → 05 do mês exibido
//     (ocorrências que só se conhecem depois).
// Transporte a pagar (em dias) = dias corridos − folgas − faltas (just. + não just.).

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

// Detalhamento do transporte a pagar de um funcionário no mês exibido.
// Retorna { dias, daysInWindow, folgas, faltas, faltaJust, faltaNaoJust }.
export function transporteDetalhe(emp, absences, year, month) {
  const winStart = new Date(year, month, 6);
  const winEnd = new Date(year, month + 1, 5);
  const absStart = new Date(year, month - 1, 6);
  const absEnd = new Date(year, month, 5);
  const absStartISO = toISO(absStart);
  const absEndISO = toISO(absEnd);
  // Datas ISO (YYYY-MM-DD) comparam cronologicamente como string.
  const inAbsWindow = (iso) => iso >= absStartISO && iso <= absEndISO;
  const daysInWindow = Math.round((winEnd - winStart) / 86400000) + 1;

  const occAbs = absences.filter(
    (a) => a.employeeId === emp.id && a.date && inAbsWindow(a.date)
  );
  const faltaJust = occAbs.filter((a) => a.type === 'falta_justificada').length;
  const faltaNaoJust = occAbs.filter((a) => a.type === 'falta_injustificada').length;

  let folgas = 0;
  const dt = new Date(winStart);
  while (dt <= winEnd) {
    if (isFolgaOn(emp, dt, absences)) folgas++;
    dt.setDate(dt.getDate() + 1);
  }

  const dias = Math.max(0, daysInWindow - folgas - faltaJust - faltaNaoJust);
  return { dias, daysInWindow, folgas, faltas: faltaJust + faltaNaoJust, faltaJust, faltaNaoJust };
}

// Atalho: só o número de dias de transporte a pagar (base do Flash = dias × 12).
export function transporteDiasNoMes(emp, absences, year, month) {
  return transporteDetalhe(emp, absences, year, month).dias;
}
