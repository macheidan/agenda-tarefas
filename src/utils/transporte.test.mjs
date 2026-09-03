import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transporteDetalhe } from './transporte.js';

// Mês exibido: agosto/2026 (month=7) → ciclo a pagar 06/08→05/09 (31 dias),
// pago em 05/08; ciclo anterior 06/07→05/08, pago em 05/07.
const emp = { id: 'e1', folgaWeekdays: [1] }; // folga fixa na segunda
const cedo = new Date(2026, 6, 1); // marcada antes do pagamento do ciclo anterior (05/07)
const tarde = new Date(2026, 6, 20); // marcada depois

test('sem marcações: dias = janela − folgas fixas', () => {
  const r = transporteDetalhe(emp, [], 2026, 7);
  assert.equal(r.daysInWindow, 31);
  assert.equal(r.folgas, 4); // segundas 10, 17, 24, 31/08
  assert.equal(r.dias, 27);
});

test('férias, faltas e feriado trabalhado do ciclo a pagar descontam', () => {
  const abs = [
    { employeeId: 'e1', date: '2026-08-11', type: 'ferias' },
    { employeeId: 'e1', date: '2026-08-12', type: 'ferias' },
    { employeeId: 'e1', date: '2026-08-13', type: 'falta_justificada' },
    { employeeId: 'e1', date: '2026-08-20', type: 'feriado_trabalhado' },
  ];
  const r = transporteDetalhe(emp, abs, 2026, 7);
  assert.equal(r.ferias, 2);
  assert.equal(r.faltasCiclo, 1);
  assert.equal(r.feriadoTrabCiclo, 1);
  assert.equal(r.dias, 31 - 4 - 2 - 1 - 1);
});

test('ciclo anterior: só marcação tardia desconta; a apuração completa continua nas colunas', () => {
  const abs = [
    { employeeId: 'e1', date: '2026-07-10', type: 'falta_injustificada', createdAt: cedo },
    { employeeId: 'e1', date: '2026-07-20', type: 'falta_justificada', createdAt: tarde },
    { employeeId: 'e1', date: '2026-07-25', type: 'feriado_trabalhado', createdAt: tarde },
    { employeeId: 'e1', date: '2026-07-28', type: 'falta_justificada' }, // sem createdAt = tardia
  ];
  const r = transporteDetalhe(emp, abs, 2026, 7);
  assert.equal(r.faltaJust, 2);
  assert.equal(r.faltaNaoJust, 1);
  assert.equal(r.feriadoTrab, 1);
  assert.equal(r.faltasTardias, 2);
  assert.equal(r.feriadoTrabTardio, 1);
  assert.equal(r.dias, 27 - 3);
});

test('createdAt como Timestamp do Firestore (toDate)', () => {
  const abs = [{ employeeId: 'e1', date: '2026-07-10', type: 'falta_justificada', createdAt: { toDate: () => cedo } }];
  assert.equal(transporteDetalhe(emp, abs, 2026, 7).faltasTardias, 0);
});

test('férias na folga fixa conta uma vez só', () => {
  const abs = [{ employeeId: 'e1', date: '2026-08-10', type: 'ferias' }]; // segunda
  const r = transporteDetalhe(emp, abs, 2026, 7);
  assert.equal(r.ferias, 1);
  assert.equal(r.folgas, 3);
  assert.equal(r.dias, 27);
});

test('afastamento marcado no ciclo inteiro dá zero (caso Luis)', () => {
  const abs = [];
  const d = new Date(2026, 7, 14);
  while (d <= new Date(2026, 9, 5)) {
    abs.push({ employeeId: 'e1', date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, type: 'falta_justificada', createdAt: new Date(2026, 7, 14) });
    d.setDate(d.getDate() + 1);
  }
  const r = transporteDetalhe({ id: 'e1', folgaWeekday: 3, folgaMonthN: 1 }, abs, 2026, 8);
  assert.equal(r.faltasCiclo, 30);
  assert.equal(r.dias, 0);
});
