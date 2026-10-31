import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bringsLunch, heatSecs, homeShare, lunchOf, warmAt, warmWindow } from '../../src/shared/comnha.js';

// (2026-11-02 is a Monday)
const MON = new Date(2026, 10, 2, 11, 50), TUE = new Date(2026, 10, 3, 11, 50), SAT = new Date(2026, 10, 7, 11, 50), SUN = new Date(2026, 10, 8, 11, 50);
const ids = Array.from({ length: 2000 }, (_, i) => `sess-${i}`);
const share = (d) => ids.filter((id) => bringsLunch(id, d)).length / ids.length;

test('more people bring lunch from home on a Monday, about a third on other weekdays, nobody at the weekend', () => {
  assert.equal(homeShare(MON), 55); assert.equal(homeShare(TUE), 30); assert.equal(homeShare(SAT), 0); assert.equal(homeShare(SUN), 0);
  assert.ok(Math.abs(share(MON) - 0.55) < 0.04, `Monday ${share(MON)}`);
  assert.ok(Math.abs(share(TUE) - 0.30) < 0.04, `Tuesday ${share(TUE)}`);
  assert.ok(share(MON) > share(TUE));
  assert.equal(share(SAT), 0); assert.equal(share(SUN), 0);
});

test('the same answer all day for a person (every page agrees), a new draw the next day', () => {
  const morning = new Date(2026, 10, 3, 8, 0), evening = new Date(2026, 10, 3, 22, 30);
  for (const id of ids.slice(0, 200)) assert.equal(bringsLunch(id, morning), bringsLunch(id, evening));
  const wed = new Date(2026, 10, 4, 11, 50);
  assert.ok(ids.some((id) => bringsLunch(id, TUE) !== bringsLunch(id, wed)));
  assert.equal(bringsLunch('', TUE, true), false);   // (nobody without an id)
  assert.equal(bringsLunch('anyone', SAT, true), true);   // ?comnha: everyone, any day
});

test('each goes to warm it at a minute of their own between 11:45 and 12:14, inside the lunch window', () => {
  const mins = new Set(ids.map((id) => warmAt(id, TUE)));
  assert.equal(Math.min(...mins), 705); assert.equal(Math.max(...mins), 734);
  for (const m of mins) assert.ok(warmWindow(m));
  assert.equal(warmWindow(704), false); assert.equal(warmWindow(780), false); assert.equal(warmWindow(779), true);
});

test('two to three minutes in the microwave (short ones for ?comnha); the box and what is in it', () => {
  for (const id of ids.slice(0, 300)) {
    const s = heatSecs(id, TUE), q = heatSecs(id, TUE, true);
    assert.ok(s >= 120 && s <= 180, `${s}`); assert.ok(q >= 15 && q <= 25, `${q}`);
  }
  const all = ids.map((id) => lunchOf(id, TUE));
  for (const L of all) assert.ok(['blue', 'green', 'pink', 'glass', 'inox'].includes(L.kind));
  const part = (k) => all.filter((L) => L[k]).length / all.length;
  assert.ok(part('smelly') > 0.15 && part('smelly') < 0.3, `smelly ${part('smelly')}`);   // (cá kho, mắm: about one box in five)
  assert.ok(part('pop') > 0.08 && part('pop') < 0.2, `pop ${part('pop')}`);
  assert.ok(part('pantry') > 0.55 && part('pantry') < 0.78, `pantry ${part('pantry')}`);   // (two in three at a pantry table, the rest at the desk)
  assert.equal(lunchOf('x', TUE).kind, lunchOf('x', SAT).kind);   // (the same box every day)
});
