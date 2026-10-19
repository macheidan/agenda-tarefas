// Escala 5x2 (EC 141/2026): contas puras da sub-aba do Depto Pessoal.
// Um turno guarda só { e, ini, mins, pi } — funcionário, entrada (minutos desde
// 00:00 do dia), minutos trabalhados e início do intervalo. A saída e a duração
// do intervalo são SEMPRE calculadas (fixTurno): intervalo mínimo da CLT para as
// horas do turno, fora da faixa travada (lk0–lk1).

export const DEFAULT_REGRAS = {
  teto: 42,          // h/semana (42 na transição, 40 a partir de 16/12/2027)
  folgas: 2,         // folgas mínimas por semana
  dom: 3,            // 1 domingo de folga a cada N semanas (0 = não checa)
  not: 0,            // 1 = encurta o turno pela hora noturna reduzida; 0 = só informa
  mins: [0, 0, 0, 0, 0, 0, 0], // mínimo de pessoas por dia (Seg..Dom)
  h0: 13, h1: 26,    // régua do dia (26 = 02h do dia seguinte)
  o0: '18:00', o1: '00:00', // loja aberta (faixa destacada)
  lk0: '19:30', lk1: '21:30', // ninguém sai para intervalo nesta faixa
};

// Mesma paleta dos post-its de Lembretes (StickyNotes.module.css).
export const CORES = {
  yellow: '#fef3a6', green: '#cdeeb6', pink: '#ffcfe0',
  blue: '#c5e4ff', purple: '#e4d3f6', gray: '#e6e8ec',
};
export const COR_KEYS = Object.keys(CORES);
export const WD = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const SNAP = 15;

export const pad = (n) => String(n).padStart(2, '0');
export const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const mondayOf = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(x, -((x.getDay() + 6) % 7));
};
export const weekDays = (monKey) => { const m = parseKey(monKey); return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(m, i)); };
export const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const fmt = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
export const hm = (m) => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return r ? `${h}h${pad(r)}` : `${h}h`; };
export const hhmm = (m) => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return r ? `${h}:${pad(r)}` : `${h}`; };
export const snap = (m) => Math.round(m / SNAP) * SNAP;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Aceita 7 · 7,5 · 7.5 · 7:30 · 7h30. Devolve horas (número) ou NaN.
export function parseHoras(s) {
  s = String(s ?? '').trim().toLowerCase().replace(',', '.');
  const m = s.match(/^(\d{1,2})\s*[h:]\s*(\d{1,2})?$/);
  if (m) return Number(m[1]) + Number(m[2] || 0) / 60;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

export const regrasOf = (cfg) => ({ ...DEFAULT_REGRAS, ...(cfg?.regras || {}) });

const isNight = (m) => { const x = ((m % 1440) + 1440) % 1440; return x >= 1320 || x < 300; };

// Horas legais trabalhadas (minutos), sem o intervalo; com hora noturna reduzida se r.not.
export function legal(t, r) {
  let s = 0;
  for (let m = t.ini; m < t.fim; m++) {
    if (m >= t.pi && m < t.pi + t.pd) continue;
    s += isNight(m) && Number(r.not) === 1 ? 60 / 52.5 : 1;
  }
  return s;
}

// Minutos de relógio trabalhados entre 22h e 5h — base do adicional noturno.
export function nightClock(t) {
  let n = 0;
  for (let m = t.ini; m < t.fim; m++) if (isNight(m) && !(m >= t.pi && m < t.pi + t.pd)) n++;
  return n;
}

// CLT art. 71: 15 min acima de 4 h; 1 h acima de 6 h.
export const breakNeeded = (mins) => (mins > 360 ? 60 : mins > 240 ? 15 : 0);

// Faixa(s) proibidas para intervalo, em minutos (repete no dia seguinte).
export function lockWin(r) {
  if (!r.lk0 || !r.lk1) return null;
  const b0 = toMin(r.lk0);
  let b1 = toMin(r.lk1);
  if (b1 <= b0) b1 += 1440;
  return [[b0, b1], [b0 + 1440, b1 + 1440]];
}
export const inLock = (pi, pd, lk) => pd > 0 && lk.some(([b0, b1]) => pi < b1 && pi + pd > b0);
export const brokenLock = (t, r) => { const lk = lockWin(r); return !!(lk && inLock(t.pi, t.pd, lk)); };

// Monta o turno completo a partir de entrada, minutos e intervalo preferido.
export function makeTurno(e, ini, mins, piPref, r) {
  const pd = breakNeeded(mins);
  const noturna = Number(r.not) === 1;
  const walk = (pi) => {
    let m = ini, s = 0;
    while (s < mins - 1e-6) {
      if (!(m >= pi && m < pi + pd)) s += isNight(m) && noturna ? 60 / 52.5 : 1;
      m++;
      if (m - ini > 24 * 60) break;
    }
    return m;
  };
  let pi = piPref != null ? piPref : snap(ini + mins / 2);
  let fim = walk(pi);
  // intervalo fora do turno: volta para o meio
  if (pd && (pi < ini || pi + pd > fim)) { pi = snap(ini + mins / 2); fim = walk(pi); }
  // trava: vai para a borda livre mais próxima da faixa proibida
  const lk = lockWin(r);
  if (pd && lk && inLock(pi, pd, lk)) {
    const cands = [];
    lk.forEach(([b0, b1]) => cands.push(b0 - pd, b1));
    cands.sort((x, y) => Math.abs(x - pi) - Math.abs(y - pi));
    for (const c of cands) {
      if (inLock(c, pd, lk)) continue;
      const fc = walk(c);
      if (c >= ini && c + pd <= fc) { pi = c; fim = fc; break; }
    }
  }
  return { e, ini, mins, pi, pd, fim };
}

export const fixTurno = (t, r) => makeTurno(t.e, t.ini, t.mins, t.pi, r);
// O que vai para o Firestore: só o que não é derivado.
export const storeTurno = (t) => ({ e: t.e, ini: t.ini, mins: t.mins, pi: t.pi });

export const shiftLabel = (t) => `${fmt(t.ini)}–${fmt(t.fim)}`;

// Pessoas trabalhando em cada hora da régua (mínimo dentro da hora, fora do intervalo).
export function coverage(list, r) {
  const out = [];
  for (let h = r.h0; h < r.h1; h++) {
    let mn = Infinity;
    for (let q = 0; q < 4; q++) {
      const m = h * 60 + q * 15 + 7;
      const c = list.filter((t) => m >= t.ini && m < t.fim && !(m >= t.pi && m < t.pi + t.pd)).length;
      mn = Math.min(mn, c);
    }
    out.push(mn);
  }
  return out;
}

// Conferência da semana. dayOf(k) devolve a lista de turnos completos do dia k
// (de qualquer semana já carregada — domingos e dias seguidos olham para trás).
export function validar({ emps, weekKeys, dayOf, r }) {
  const alerts = [];
  const issues = {}; // issues[dateKey][empId] = 'bad' | 'warn'
  const mark = (k, id, lvl) => {
    issues[k] = issues[k] || {};
    if (issues[k][id] !== 'bad') issues[k][id] = lvl;
  };
  const find = (id, k) => dayOf(k).find((t) => t.e === id);
  const ds = (k) => parseKey(k).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const rows = [];

  emps.forEach((emp) => {
    let tot = 0, dias = 0, noite = 0;
    const cells = weekKeys.map((k) => {
      const t = find(emp.id, k);
      if (!t) return null;
      dias++; tot += t.mins; noite += nightClock(t);
      if (t.mins > 480) { mark(k, emp.id, 'bad'); alerts.push(['err', `${emp.name} — ${ds(k)}: ${hm(t.mins)} no dia (máx. 8 h).`]); }
      if (brokenLock(t, r)) { mark(k, emp.id, 'bad'); alerts.push(['err', `${emp.name} — ${ds(k)}: o turno não tem como encaixar o intervalo fora de ${r.lk0}–${r.lk1}.`]); }
      if (emp.jr && Math.abs(t.mins - emp.jr * 60) > 15) { mark(k, emp.id, 'warn'); alerts.push(['warn', `${emp.name} — ${ds(k)}: escalado ${hm(t.mins)}, contrato de ${hm(emp.jr * 60)}.`]); }
      return t;
    });
    const folgas = 7 - dias;
    let st = 'ok';
    const msg = [];
    if (folgas < r.folgas) { st = 'err'; msg.push(`${folgas} folga(s)`); }
    if (tot > r.teto * 60) { st = 'err'; msg.push(`${hm(tot)} > ${r.teto}h`); }
    if (st === 'err') {
      weekKeys.forEach((k) => { if (find(emp.id, k)) mark(k, emp.id, 'bad'); });
      alerts.push(['err', `${emp.name}: ${msg.join(', ')} na semana.`]);
    }

    // interjornada 11 h, 7 dias seguidos e domingos — janela de 8 semanas para trás
    const first = parseKey(weekKeys[0]);
    let run = 0, runStart = null, domStreak = 0;
    for (let d = addDays(first, -56); d <= parseKey(weekKeys[6]); d = addDays(d, 1)) {
      const k = dkey(d), t = find(emp.id, k), inWeek = d >= first;
      if (t) {
        const prev = find(emp.id, dkey(addDays(d, -1)));
        if (prev && inWeek) {
          const gap = t.ini + 1440 - prev.fim;
          if (gap < 660) { mark(k, emp.id, 'bad'); alerts.push(['err', `${emp.name} — ${ds(k)}: só ${hm(gap)} de descanso desde a saída anterior (mín. 11 h).`]); }
        }
        if (!run) runStart = k;
        run++;
        if (run === 7 && inWeek) { mark(k, emp.id, 'bad'); alerts.push(['err', `${emp.name}: 7 dias seguidos sem descanso desde ${ds(runStart)}.`]); }
      } else run = 0;
      if (d.getDay() === 0 && Number(r.dom) > 0) {
        if (t) {
          domStreak++;
          if (domStreak >= Number(r.dom) && inWeek) { mark(k, emp.id, 'warn'); alerts.push(['warn', `${emp.name}: ${domStreak} domingos seguidos trabalhados — precisa folgar um domingo.`]); }
        } else domStreak = 0;
      }
    }
    if (st === 'ok' && dias && folgas > r.folgas) st = 'warn';
    rows.push({ emp, cells, tot, noite, folgas, dias, st });
  });

  weekKeys.forEach((k, i) => {
    const n = dayOf(k).length;
    if (r.mins[i] > 0 && n < r.mins[i]) alerts.push(['warn', `${ds(k)}: ${n} de ${r.mins[i]} pessoas.`]);
  });
  return { rows, alerts, issues };
}
