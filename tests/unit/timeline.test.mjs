import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline } from '../../src/shared/timeline.js';

const T0 = Date.parse('2026-10-27T09:00:00Z');
const ev = (t, sess, type, extra = {}) => ({ t: T0 + t * 1000, m: { k: 'ev', e: { sess, type, ts: T0 + t * 1000, ...extra }, s: { id: sess, name: 'shop-api', status: 'work' } } });

test('one row per session, spans in time order', () => {
  const items = [ev(0, 'a', 'prompt', { label: 'add cart' }), ev(10, 'a', 'read', { label: 'cart.ts' }), ev(40, 'a', 'edit', { label: 'cart.ts' }), ev(100, 'a', 'stop')];
  const tl = buildTimeline(items, T0, T0 + 200e3);
  assert.equal(tl.rows.length, 1);
  const spans = tl.rows[0].spans;
  assert.ok(spans.length >= 3);
  // a span is [start, end, kind, label]
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] >= spans[i - 1][0], 'spans start in order');
  assert.deepEqual(spans.slice(0, 3).map((x) => x[2]), ['think', 'read', 'edit']);
});

test('an empty log gives no rows and zero totals', () => {
  const tl = buildTimeline([], T0, T0 + 60e3);
  assert.equal(tl.rows.length, 0);
  assert.equal(tl.totals.prompts, 0);
});
