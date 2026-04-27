// Feriados brasileiros (nacionais + Páscoa-relacionados).
// Algoritmo de Gauss para calcular o domingo de Páscoa.

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const FIXED_HOLIDAYS = [
  [1, 1],   // Confraternização Universal
  [4, 21],  // Tiradentes
  [5, 1],   // Dia do Trabalho
  [9, 7],   // Independência
  [10, 12], // Nossa Senhora Aparecida
  [11, 2],  // Finados
  [11, 15], // Proclamação da República
  [12, 25], // Natal
];

export function getHolidays(year) {
  const easter = easterSunday(year);
  const dates = FIXED_HOLIDAYS.map(([m, d]) => new Date(year, m - 1, d));
  dates.push(addDays(easter, -2));   // Sexta-feira Santa
  dates.push(addDays(easter, -47));  // Carnaval (terça)
  dates.push(addDays(easter, 60));   // Corpus Christi
  return dates;
}

const dateKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Retorna Set de dateKeys (YYYY-MM-DD) que são véspera (D-1) de feriados
// que caem em terça (2), quarta (3), quinta (4) ou sexta (5).
export function getHotDates(years) {
  const set = new Set();
  for (const year of years) {
    for (const holiday of getHolidays(year)) {
      const dow = holiday.getDay();
      if (dow >= 2 && dow <= 5) {
        set.add(dateKey(addDays(holiday, -1)));
      }
    }
  }
  return set;
}
