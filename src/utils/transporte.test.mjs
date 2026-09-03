import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transporteDetalhe } from './transporte.js';

// Mês exibido: agosto/2026 → ciclo a pagar 06/08→05/09 (31 dias), faltas 06/07→05/08.
const emp = { id: 'e1', folgaWeekdays: [1] }; // folga fixa na segunda

test('sem marcações: dias = janela − folgas fixas', () => {
  const r = transporteDetalhe(emp, [], 2026, 7);
  assert.equal(r.daysInWindow, 31);
  assert.equal(r.folgas, 4); // segundas entre 06/08 e 05/09 (10, 17, 24, 31)
  assert.equal(r.ferias, 0);
  assert.equal(r.feriadoTrab, 0);
  assert.equal(r.dias, 27);
});

test('férias, faltas e feriado trabalhado descontam', () => {
  const abs = [
    { employeeId: 'e1', date: '2026-08-11', type: 'ferias' }, // terça, ciclo a pagar
    { employeeId: 'e1', date: '2026-08-12', type: 'ferias' },
    { employeeId: 'e1', date: '2026-07-20', type: 'falta_justificada' }, // ciclo anterior
    { employeeId: 'e1', date: '2026-07-25', type: 'feriado_trabalhado' },
    { employeeId: 'e1', date: '2026-08-20', type: 'feriado_trabalhado' }, // fora do ciclo anterior
  ];
  const r = transporteDetalhe(emp, abs, 2026, 7);
  assert.equal(r.ferias, 2);
  assert.equal(r.faltaJust, 1);
  assert.equal(r.feriadoTrab, 1);
  assert.equal(r.dias, 31 - 4 - 2 - 1 - 1);
});

test('férias na folga fixa conta uma vez só', () => {
  const abs = [{ employeeId: 'e1', date: '2026-08-10', type: 'ferias' }]; // segunda
  const r = transporteDetalhe(emp, abs, 2026, 7);
  assert.equal(r.ferias, 1);
  assert.equal(r.folgas, 3);
  assert.equal(r.dias, 27);
});
