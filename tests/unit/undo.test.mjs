import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createUndo } from '../../server/undo.mjs';

// the office's own copies: made by before() as each file tool is about to write, per turn
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-undo-')), work = path.join(root, 'work');
  fs.mkdirSync(work);
  let t = 1_000_000;
  const u = createUndo({ dir: path.join(root, 'undo'), now: () => t, maxBytes: 100 });
  return { u, f: (n) => path.join(work, n), tick: (ms) => { t += ms; return t; }, root };
}

test('a turn: an edited file back as it was, a new one removed, one changed since left alone, a big one left alone', async () => {
  const { u, f, tick, root } = setup();
  for (const [n, s] of [['a.txt', 'a before'], ['c.txt', 'c before'], ['big.txt', 'x'.repeat(200)]]) fs.writeFileSync(f(n), s);
  u.prompt('sess-one', 'tidy the files');
  // Claude's file tools, each asked first (the copy is made before the write)
  for (const n of ['a.txt', 'b.txt', 'c.txt', 'big.txt']) u.before('sess-one', f(n));
  u.before('sess-one', f('a.txt'));   // (touched again in the same turn: the first copy stays)
  fs.writeFileSync(f('a.txt'), 'a after'); fs.writeFileSync(f('b.txt'), 'b new'); fs.writeFileSync(f('c.txt'), 'c after'); fs.writeFileSync(f('big.txt'), 'y'.repeat(200));
  const end = tick(10_000) / 1000; u.stop('sess-one');
  for (const n of ['a.txt', 'b.txt', 'big.txt']) fs.utimesSync(f(n), end - 1, end - 1);
  fs.writeFileSync(f('c.txt'), 'c changed by you'); fs.utimesSync(f('c.txt'), end + 3600, end + 3600);   // (an hour later)
  const p = await u.plan('sess-one');
  assert.equal(p.prompt, 'tidy the files');
  assert.deepEqual(Object.fromEntries(p.files.map((x) => [path.basename(x.file), x.action])), { 'a.txt': 'restore', 'b.txt': 'delete', 'c.txt': 'changedAfter', 'big.txt': 'big' });
  const r = await u.apply('sess-one');
  assert.equal(r.done.length, 2);
  assert.equal(fs.readFileSync(f('a.txt'), 'utf8'), 'a before');
  assert.ok(!fs.existsSync(f('b.txt')));
  assert.equal(fs.readFileSync(f('c.txt'), 'utf8'), 'c changed by you');
  // what was there is kept, so the undo can be undone
  const m = JSON.parse(fs.readFileSync(path.join(r.after, 'manifest.json'), 'utf8'));
  assert.deepEqual(m.files.map((x) => fs.readFileSync(path.join(r.after, x.kept), 'utf8')).sort(), ['a after', 'b new']);
  // once is enough
  assert.ok((await u.plan('sess-one')).undone);
  assert.deepEqual((await u.apply('sess-one')).done, []);
  assert.ok(root);
});

test('only the last turn, only after a prompt; the oldest turns\' copies go', async () => {
  const { u, f, tick } = setup();
  u.before('sess-two', f('x.txt'));   // (no turn yet: nothing kept)
  assert.equal(await u.plan('sess-two'), null);
  fs.writeFileSync(f('x.txt'), 'one');
  for (let i = 0; i < 5; i++) { u.prompt('sess-two', `turn ${i}`); u.before('sess-two', f('x.txt')); fs.writeFileSync(f('x.txt'), `v${i}`); const at = tick(1000) / 1000; fs.utimesSync(f('x.txt'), at, at); u.stop('sess-two'); }   // (written within the turn, by the test's clock)
  const p = await u.plan('sess-two');
  assert.equal(p.prompt, 'turn 4');
  await u.apply('sess-two');
  assert.equal(fs.readFileSync(f('x.txt'), 'utf8'), 'v3');   // (as before the last turn, not before the first)
  assert.equal(fs.readdirSync(path.join(path.dirname(path.dirname(f('x.txt'))), 'undo', 'sess-two')).length, 3);   // (3 turns kept)
});
