import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHORES, PILE_MAX, assign, cupMoments, cupsBetween, done, due, fresh, pile, roll, saw, washed } from '../../src/shared/duty.js';

const P = (...keys) => keys.map((k) => ({ key: k, name: k.toUpperCase() }));

test('four chores, a name each; fewer people take several', () => {
  const a = assign(roll(fresh(), '2026-11-02', '2026-10-30'), P('web', 'api', 'docs', 'ops', 'mobile'));
  assert.deepEqual(Object.keys(a.who), CHORES);
  assert.equal(new Set(Object.values(a.who)).size, 4);
  const b = assign(roll(fresh(), '2026-11-02', '2026-10-30'), P('web', 'api'));
  assert.deepEqual(Object.values(b.who), ['api', 'web', 'api', 'web']);
  assert.equal(assign(roll(fresh(), '2026-11-02', '2026-10-30'), []).who.cups, undefined);   // (nobody here: no roster yet)
});

test('the roster holds all day whoever comes later, and the turn moves on the next working day', () => {
  let st = assign(roll(fresh(), '2026-11-02', '2026-10-30'), P('a', 'b', 'c', 'd', 'e', 'f'));
  const mon = { ...st.who };
  st = assign(st, P('a', 'b', 'c', 'd', 'e', 'f', 'g'));
  assert.deepEqual(st.who, mon);
  for (const c of CHORES) st = done(st, c, 1000);
  st = assign(roll(st, '2026-11-03', '2026-11-02'), P('a', 'b', 'c', 'd', 'e', 'f'));
  assert.deepEqual(Object.values(st.who), ['e', 'f', 'a', 'b']);   // (from where Monday's stopped, round to the start)
  // someone not here today is skipped, not given a chore
  st = assign(roll(st, '2026-11-04', '2026-11-03'), P('a', 'b', 'd', 'e', 'f'));
  assert.ok(!Object.values(st.who).includes('c'));
});

test('a chore left undone is owed the next working day by the same person; anything older is let go', () => {
  let st = assign(roll(fresh(), '2026-11-02', '2026-10-30'), P('a', 'b', 'c', 'd'));
  st = done(done(st, 'plants', 560), 'table', 1030);
  const tue = roll(st, '2026-11-03', '2026-11-02');
  assert.deepEqual(tue.owe.map((o) => [o.chore, o.who, o.name]), [['cups', st.who.cups, st.who.cups.toUpperCase()], ['trash', st.who.trash, st.who.trash.toUpperCase()]]);
  assert.deepEqual(tue.who, {}); assert.deepEqual(tue.done, {});
  assert.deepEqual(done(tue, 'cups', 490, true).owe.map((o) => o.chore), ['trash']);
  assert.deepEqual(roll(st, '2026-11-05', '2026-11-04').owe, []);   // (a gap: nothing carried)
  assert.equal(roll(st, '2026-11-02', '2026-10-30'), st);   // (the same day: as it was)
});

test('the cups pile up through the day and stay overnight when nobody washed them', () => {
  let st = saw(assign(roll(fresh(), '2026-11-02', '2026-10-30'), P('a', 'b', 'c', 'd', 'e')), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(pile(st, 479), 0);
  const counts = [600, 780, 900, 1020].map((m) => pile(st, m));
  for (let k = 1; k < counts.length; k++) assert.ok(counts[k] >= counts[k - 1], String(counts));
  assert.ok(counts[3] >= 10, `five people by five o'clock: ${counts[3]}`);
  // each person: the morning cup, the lunch glass (both before the washing-up at 13:00), most days an afternoon one
  for (const k of ['a', 'b', 'c']) { const m = cupMoments(k, '2026-11-02'); assert.ok(m[0] >= 480 && m[0] < 600 && m[1] >= 750 && m[1] < 810); }
  assert.equal(cupsBetween(['a'], '2026-11-02', 0, 1440), cupMoments('a', '2026-11-02').length);
  // washed at 13:30, after the nap: the morning's gone, the afternoon's come
  const w = washed(st, 810);
  assert.equal(pile(w, 811), 0);
  assert.equal(pile(w, 1440), cupsBetween(st.seen, st.day, 810, 1440));
  // never washed: all of it is there the next morning
  const tue = roll(st, '2026-11-03', '2026-11-02');
  assert.equal(pile(tue, 480), Math.min(PILE_MAX, pile(st, 1440)));
  assert.ok(pile(tue, 480) > 0);
});

test('when each chore is done: plants from the morning, cups after lunch, bin and tables at about five', () => {
  assert.ok(due('plants', 540) && !due('plants', 480));
  assert.ok(!due('cups', 700) && !due('cups', 800) && due('cups', 815));
  assert.ok(!due('trash', 900) && due('trash', 1020) && due('table', 1020) && !due('trash', 1110));
});
