import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { weekSummary } from '../../server/wrapped.mjs';
import { buildTimeline } from '../../src/shared/timeline.js';

// two days of replay logs, one session each, in local time like the server writes them
const at = (day, hh, mm) => new Date(`${day}T${hh}:${mm}:00`).getTime();
const ev = (t, sess, name, dir, type, extra = {}) => ({ t, m: { k: 'ev', e: { sess, type, ts: t, ...extra }, s: { id: sess, name, dir, status: type === 'stop' ? 'idle' : 'work', usage: { cost: 2.5 } }, stats: { prompts: 1, edit: type === 'edit' ? 1 : 0 } } });
const day = (d, sess, name, dir) => [
  ev(at(d, '10', '00'), sess, name, dir, 'prompt', { label: 'add cart' }),
  ev(at(d, '10', '05'), sess, name, dir, 'edit', { label: 'cart.ts' }),
  ev(at(d, '10', '40'), sess, name, dir, 'commit', { label: 'add cart' }),
  ev(at(d, '11', '00'), sess, name, dir, 'stop'),
];

test('a week summary adds up hours, commits, cost and the busiest project', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-wrapped-'));
  try {
    const write = (d, items) => fs.writeFileSync(path.join(dir, `${d}.jsonl`), items.map((x) => JSON.stringify(x)).join('\n') + '\n');
    write('2026-10-25', day('2026-10-25', 'a', 'shop-api', '~/code/shop-api'));
    write('2026-10-26', [...day('2026-10-26', 'b', 'landing', '~/code/landing'), ...day('2026-10-26', 'c', 'landing 2', '~/code/landing')]);
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a log');
    const w = await weekSummary({ replayDir: dir, buildTimeline });
    assert.equal(w.days, 2);
    assert.equal(w.from, '2026-10-25');
    assert.equal(w.to, '2026-10-26');
    assert.equal(w.commits, 3);
    assert.equal(w.sessions, 3);
    assert.equal(w.cost, 7.5);
    assert.ok(w.hoursSum > 1.5 && w.hoursSum <= 3, `three one-hour sessions, got ${w.hoursSum}`);
    assert.ok(w.hoursWall <= w.hoursSum, 'two sessions at the same time count once on the clock');
    assert.equal(w.projects[0].name, 'landing');
    assert.equal(w.busiest.day, '2026-10-26');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
