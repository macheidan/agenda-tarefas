// node --test src/utils/escala5x2.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REGRAS, makeTurno, fixTurno, breakNeeded, fmt, toMin, parseHoras, validar, weekDays, dkey, nightClock,
} from './escala5x2.js';

const r = { ...DEFAULT_REGRAS };
const T = (ini, h, pi) => makeTurno('a', toMin(ini), h * 60, pi == null ? null : toMin(pi), r);

test('intervalo mínimo da CLT pelas horas do turno', () => {
  assert.equal(breakNeeded(240), 0);
  assert.equal(breakNeeded(300), 15);
  assert.equal(breakNeeded(360), 15);
  assert.equal(breakNeeded(390), 60);
});

test('saída = entrada + horas + intervalo (horas de relógio)', () => {
  const a = T('18:00', 6);
  assert.equal(fmt(a.fim), '00:15');
  assert.equal(a.pd, 15);
  const b = T('15:00', 8);
  assert.equal(fmt(b.fim), '00:00');
  assert.equal(b.pd, 60);
  assert.equal(T('19:00', 4).pd, 0);
});

test('intervalo nunca cai na trava 19:30–21:30', () => {
  const b = T('15:00', 8); // meio do turno seria 19:00–20:00
  assert.equal(fmt(b.pi), '18:30');
  const c = T('15:00', 8, '20:00');
  assert.ok(c.pi + c.pd <= toMin('19:30') || c.pi >= toMin('21:30'));
  const d = T('18:00', 6); // meio seria 21:00
  assert.equal(fmt(d.pi), '21:30');
});

test('intervalo fora do turno volta para dentro', () => {
  const a = T('15:00', 5, '23:00');
  assert.ok(a.pi >= a.ini && a.pi + a.pd <= a.fim);
});

test('hora noturna reduzida encurta o turno quando ligada', () => {
  const a = makeTurno('a', toMin('18:00'), 360, null, { ...r, not: 1 });
  assert.equal(fmt(a.fim), '23:59');
  assert.equal(nightClock(T('18:00', 6)), 135);
});

test('parseHoras aceita 7 · 7,5 · 7:30 · 7h30', () => {
  assert.equal(parseHoras('7'), 7);
  assert.equal(parseHoras('7,5'), 7.5);
  assert.equal(parseHoras('7:30'), 7.5);
  assert.equal(parseHoras('7h30'), 7.5);
});

test('validar: 6 dias na semana = erro de folga; teto semanal', () => {
  const keys = weekDays('2026-12-21').map(dkey);
  const days = {};
  keys.slice(0, 6).forEach((k) => { days[k] = [fixTurno({ e: 'x', ini: toMin('15:00'), mins: 480, pi: null }, r)]; });
  const out = validar({ emps: [{ id: 'x', name: 'X', jr: 8 }], weekKeys: keys, dayOf: (k) => days[k] || [], r });
  assert.equal(out.rows[0].st, 'err');
  assert.ok(out.alerts.some(([, t]) => t.includes('1 folga')));
  assert.ok(out.alerts.some(([, t]) => t.includes('48h > 42h')));
});

test('validar: interjornada menor que 11 h', () => {
  const keys = weekDays('2026-12-21').map(dkey);
  const days = {
    [keys[0]]: [fixTurno({ e: 'x', ini: toMin('16:00'), mins: 480, pi: null }, r)], // sai 01:00
    [keys[1]]: [fixTurno({ e: 'x', ini: toMin('10:00'), mins: 360, pi: null }, r)],
  };
  const out = validar({ emps: [{ id: 'x', name: 'X', jr: 8 }], weekKeys: keys, dayOf: (k) => days[k] || [], r });
  assert.ok(out.alerts.some(([, t]) => t.includes('mín. 11 h')));
});
