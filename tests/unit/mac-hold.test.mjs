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
