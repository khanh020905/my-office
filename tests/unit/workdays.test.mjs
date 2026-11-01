import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SWAPS, breakAfter, dayKey, dayKind, holidayOf, isWorkday, prevWorkday, quarterStart, swapOf } from '../../src/shared/workdays.js';

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

test('the first working day of each quarter (when the fire drill is): past 1/1, the weekend and the holidays', () => {
  const first = (iso) => dayKey(quarterStart(D(iso)));
  assert.equal(first('2026-11-20'), '2026-10-01');   // (a Thursday)
  assert.equal(first('2027-02-15'), '2027-01-04');   // (1/1 a Friday holiday, then the weekend)
  assert.equal(first('2027-05-20'), '2027-04-01');
  assert.equal(first('2027-07-01'), '2027-07-01');
  assert.equal(first('2026-04-30'), '2026-04-01');
  assert.equal(first('2028-01-10'), '2028-01-04');   // (1/1/2028 a Saturday, so taken on Monday 3/1)
});

test('the Government swaps: a weekday off (nghỉ bù) and a Saturday worked for it (làm bù), as announced', () => {
  assert.equal(dayKind(D('2026-01-02')), 'swap'); assert.equal(dayKind(D('2026-01-10')), 'makeup');
  assert.equal(dayKind(D('2026-08-31')), 'swap'); assert.equal(dayKind(D('2026-08-22')), 'makeup');
  assert.ok(isWorkday(D('2026-01-10')) && !isWorkday(D('2026-01-02')));
  assert.ok(!isWorkday(D('2026-01-17')));   // (any other Saturday: off)
  assert.deepEqual(swapOf(D('2026-01-10')), swapOf(D('2026-01-02')));
  assert.equal(swapOf(D('2026-01-10')).off, '2026-01-02'); assert.equal(swapOf(D('2026-11-07')), null);
  for (const [off, work] of SWAPS) { assert.equal(new Date(`${work}T12:00:00`).getDay(), 6, work); assert.ok(![0, 6].includes(new Date(`${off}T12:00:00`).getDay()), off); }
  // none announced for 2027 (Tết and 2/9 chose the options without one); 28/11/2026 was not taken
  assert.ok(SWAPS.every(([off]) => off < '2027-01-01'));
  assert.equal(dayKind(D('2026-11-28')), 'weekend');
});

test('the break after a day: its length, and the Saturday to make it up', () => {
  assert.deepEqual(breakAfter(D('2025-12-31')), { days: 4, makeup: '2026-01-10' });   // (1/1–4/1/2026)
  assert.deepEqual(breakAfter(D('2026-08-28')), { days: 5, makeup: '2026-08-22' });   // (29/8–2/9: made up before)
  assert.deepEqual(breakAfter(D('2026-02-13')), { days: 9, makeup: '' });             // (Tết Bính Ngọ)
  assert.deepEqual(breakAfter(D('2026-11-06')), { days: 2, makeup: '' });
  assert.equal(dayKey(prevWorkday(D('2026-01-12'))), '2026-01-10');   // (the Monday after a make-up Saturday)
});
