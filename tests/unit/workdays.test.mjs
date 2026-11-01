import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, dayKind, holidayOf, isWorkday, prevWorkday } from '../../src/shared/workdays.js';

const D = (s) => new Date(`${s}T09:00:00`);
const kinds = (from, to) => { const out = {}; for (let d = D(from); d <= D(to); d.setDate(d.getDate() + 1)) out[dayKey(d)] = dayKind(d); return out; };

test('Monday to Friday are working days, Saturday and Sunday are not', () => {
  assert.deepEqual(Object.values(kinds('2026-11-02', '2026-11-08')), ['work', 'work', 'work', 'work', 'work', 'weekend', 'weekend']);
});

test('2026 as announced: Tết 16–20/2 (nine days off with the weekends), Giỗ Tổ on a Sunday taken on Monday, 30/4 and 1/5, 1–2/9, 24/11', () => {
  const tet = kinds('2026-02-13', '2026-02-23');
  assert.equal(tet['2026-02-13'], 'work'); assert.equal(tet['2026-02-23'], 'work');
  assert.deepEqual(Object.values(tet).slice(1, 10), ['weekend', 'weekend', 'holiday', 'holiday', 'holiday', 'holiday', 'holiday', 'weekend', 'weekend']);
  assert.equal(holidayOf(D('2026-04-26')), 'hung'); assert.equal(holidayOf(D('2026-04-27')), 'comp');
  for (const d of ['2026-01-01', '2026-04-30', '2026-05-01', '2026-09-01', '2026-09-02', '2026-11-24']) assert.equal(dayKind(D(d)), 'holiday', d);
  assert.equal(holidayOf(D('2026-11-24')), 'culture');
  assert.ok(isWorkday(D('2026-11-25')));
});

test('2027 as announced: Tết 4/2–10/2 (two days on the weekend taken after), 1/5 on a Saturday taken on Monday, 2–3/9', () => {
  for (const d of ['2027-02-04', '2027-02-05', '2027-02-08', '2027-02-09', '2027-02-10']) assert.equal(dayKind(D(d)), 'holiday', d);
  assert.equal(holidayOf(D('2027-02-09')), 'comp'); assert.equal(holidayOf(D('2027-02-10')), 'comp');
  assert.ok(isWorkday(D('2027-02-11'))); assert.ok(isWorkday(D('2027-02-03')));
  assert.equal(holidayOf(D('2027-05-03')), 'comp');
  assert.equal(holidayOf(D('2027-09-03')), 'national'); assert.ok(isWorkday(D('2027-09-01')));
});

test('a year not announced yet follows the usual pattern', () => {
  // 2028: mùng 1 Tết is 26/1; the last day of the lunar year and the first four of the new one
  for (const d of ['2028-01-25', '2028-01-26', '2028-01-27', '2028-01-28']) assert.equal(dayKind(D(d)), 'holiday', d);
  assert.equal(holidayOf(D('2028-01-31')), 'comp');   // (mùng 4 on the Saturday: taken on the Monday)
});

test('the working day before: over the weekend and over Tết', () => {
  assert.equal(dayKey(prevWorkday(D('2026-11-02'))), '2026-10-30');
  assert.equal(dayKey(prevWorkday(D('2026-11-03'))), '2026-11-02');
  assert.equal(dayKey(prevWorkday(D('2027-02-11'))), '2027-02-03');
});
