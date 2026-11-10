import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdMs, createBarWatch, BAR_HOLD_MS } from '../../server/mac-hold.mjs';

const base = { focused: false, barAlive: true, idleSec: 3, pref: true, normalMs: 45_000 };

test('a focused office page holds the usual time, whatever the menu bar says', () => {
  assert.equal(holdMs({ ...base, focused: true, barAlive: false, idleSec: 9999, pref: false }), 45_000);
});
test('the menu bar alone holds briefly, only when the owner is at the Mac', () => {
  assert.equal(holdMs(base), BAR_HOLD_MS);
  assert.ok(BAR_HOLD_MS <= 20_000);
  assert.equal(holdMs({ ...base, idleSec: 600 }), 0);          // away from the Mac
  assert.equal(holdMs({ ...base, idleSec: Infinity }), 0);     // not read yet
  assert.equal(holdMs({ ...base, barAlive: false }), 0);       // the app is not running
  assert.equal(holdMs({ ...base, pref: false }), 0);           // turned off in Settings
});
test('the idle time is read at most every 10 s, and only while the app polls', async () => {
  let t = 100_000, reads = 0;
  const w = createBarWatch({ idle: async () => { reads++; return 5; }, now: () => t });
  assert.equal(w.alive(), false);
  w.seen(); await new Promise((r) => setImmediate(r));
  assert.equal(reads, 1); assert.equal(w.idleSec(), 5); assert.equal(w.alive(), true);
  for (let i = 0; i < 4; i++) { t += 3000; w.seen(); }
  await new Promise((r) => setImmediate(r));
  assert.equal(reads, 2);                                       // 12 s later: one more read, not four
  t += 20_000; assert.equal(w.alive(), false);                  // the app stopped polling
});

test('away from the Mac, a phone that can answer holds it for as long as the hook waits', async () => {
  const { holdPlan, backAtMac, PHONE_HOLD_MS } = await import('../../server/mac-hold.mjs');
  const away = { ...base, barAlive: false, idleSec: 600, phone: true, phoneMs: 595_000 };
  assert.deepEqual(holdPlan(away), { ms: 595_000, by: 'phone' });
  assert.deepEqual(holdPlan({ ...away, focused: true }), { ms: 595_000, by: 'phone' });   // (a page left open on the Mac: nobody looks at it)
  assert.deepEqual(holdPlan({ ...away, phone: false }), { ms: 0, by: null });             // no phone to answer: Claude Code asks itself
  assert.deepEqual(holdPlan({ ...away, phone: false, focused: true }), { ms: 45_000, by: 'page' });
  assert.deepEqual(holdPlan({ ...away, idleSec: Infinity }), { ms: 0, by: null });        // idle time unknown (not a Mac): as before
  assert.deepEqual(holdPlan({ ...away, idleSec: 30, barAlive: true }), { ms: BAR_HOLD_MS, by: 'bar' });   // at the Mac: the banner
  assert.deepEqual(holdPlan({ ...away, idleSec: 30, focused: true }), { ms: 45_000, by: 'page' });
  assert.ok(PHONE_HOLD_MS <= 10 * 60_000);
  assert.equal(backAtMac(3), true); assert.equal(backAtMac(600), false); assert.equal(backAtMac(Infinity), false);
});
test('a request coming in reads the idle time again when the reading is old, app or no app', async () => {
  let t = 100_000, reads = 0, idle = 5;
  const w = createBarWatch({ idle: async () => { reads++; return idle; }, now: () => t });
  assert.equal(await w.fresh(), 5); assert.equal(reads, 1);
  t += 3000; idle = 700; assert.equal(await w.fresh(), 5); assert.equal(reads, 1);   // (3 s old: kept)
  t += 8000; assert.equal(await w.fresh(), 700); assert.equal(reads, 2);
  t += 4500; idle = 2; assert.equal(await w.fresh(4000), 2);                        // (a shorter age: the return watch)
});
