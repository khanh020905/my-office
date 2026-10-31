import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTenure, farewellDue, wasActive, dayOf } from '../../server/tenure.mjs';

const DAY = 864e5, NOW = new Date(2026, 10, 3, 16, 0).getTime();
function dirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tenure-')), data = path.join(root, 'data'), claude = path.join(root, 'claude');
  fs.mkdirSync(data); fs.mkdirSync(path.join(claude, 'projects'), { recursive: true });
  return { root, data, claude };
}
// a transcript in Claude Code's folder for `cwd`, last written `daysAgo` days before NOW
function transcript(claude, cwd, id, daysAgo) {
  const dir = path.join(claude, 'projects', cwd.replace(/[^A-Za-z0-9-]/g, '-')); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${id}.jsonl`);
  fs.writeFileSync(f, `${JSON.stringify({ type: 'user', cwd, sessionId: id, message: { role: 'user', content: 'hi' } })}\n`);
  const t = new Date(NOW - daysAgo * DAY); fs.utimesSync(f, t, t);
  return f;
}
const make = (d, now = () => NOW, onChange = () => {}) => createTenure({ dataDir: d.data, claudeDir: d.claude, nameOf: async (cwd) => path.basename(cwd), now, onChange });

test('a farewell is due only for a project that really worked (two days or more), quiet long enough, nobody in it, not said goodbye to', () => {
  const p = { first: NOW - 90 * DAY, last: NOW - 31 * DAY, days: 5 };
  assert.equal(wasActive(p), true);
  assert.equal(farewellDue(p, 30, NOW), true);
  assert.equal(farewellDue(p, 60, NOW), false);                       // (not quiet long enough for 60)
  assert.equal(farewellDue(p, 0, NOW), false);                        // (farewells off)
  assert.equal(farewellDue(p, 30, NOW, true), false);                 // (someone is at work in it now)
  assert.equal(farewellDue({ ...p, farewell: NOW - DAY }, 30, NOW), false);   // (once)
  assert.equal(farewellDue({ ...p, days: 1 }, 30, NOW), false);       // (opened on one day only: never really here)
  assert.equal(farewellDue(null, 30, NOW), false);
});

test('activity counts days and turns, persists, and a project that had its farewell comes back when a session opens in it', async () => {
  const d = dirs(); let at = NOW - 40 * DAY;
  const seen = [];
  const t = make(d, () => at, (what, name) => seen.push(`${what}:${name}`));
  assert.equal(t.touch('shop-api', { at }), 'new');
  t.touch('shop-api', { at: at + 3600e3, turn: true });
  t.touch('shop-api', { at: at + DAY, turn: true });   // (a second day)
  assert.deepEqual({ days: t.get('shop-api').days, turns: t.get('shop-api').turns }, { days: 2, turns: 2 });
  at = NOW;
  assert.deepEqual(t.list(30).map((p) => [p.name, p.due]), [['shop-api', true]]);
  assert.equal(t.markFarewell('shop-api', 30), true);
  assert.equal(t.markFarewell('shop-api', 30), false);   // (once)
  assert.equal(t.list(30)[0].farewell, NOW);
  t.save();
  // a new server on the same folder knows it
  const again = make(d, () => NOW + DAY);
  assert.ok(again.get('shop-api').farewell);
  assert.equal(again.touch('shop-api', { at: NOW + DAY }), 'back');
  const row = again.list(30)[0];
  assert.equal(row.farewell, 0); assert.equal(row.back, NOW + DAY); assert.equal(row.due, false);
  assert.deepEqual(seen, ['new:shop-api', 'farewell:shop-api']);
  fs.rmSync(d.root, { recursive: true, force: true });
});

test('never-active projects get no farewell, however long they sit', () => {
  const d = dirs(); let at = NOW - 200 * DAY;
  const t = make(d, () => at);
  t.touch('tried-once', { at }); t.touch('tried-once', { at: at + 3600e3 });   // (the same day)
  at = NOW;
  assert.deepEqual(t.list(14), []);
  assert.equal(t.markFarewell('tried-once', 14), false);
  assert.equal(t.markFarewell('never-heard-of', 14), false);
  fs.rmSync(d.root, { recursive: true, force: true });
});

test('the first run reads the projects already there from the transcripts (dates and folders only), as there before', async () => {
  const d = dirs();
  transcript(d.claude, '/Users/me/projects/old-crm', 'a1', 70); transcript(d.claude, '/Users/me/projects/old-crm', 'a2', 45);
  transcript(d.claude, '/Users/me/projects/one-off', 'b1', 50);
  const before = fs.readdirSync(path.join(d.claude, 'projects'), { recursive: true }).sort();
  const t = make(d);
  await t.seed();
  const crm = t.get('old-crm'), once = t.get('one-off');
  assert.equal(crm.pre, true); assert.equal(crm.days, 2); assert.equal(dayOf(crm.last), dayOf(NOW - 45 * DAY));
  assert.equal(once.pre, true); assert.equal(once.days, 1);
  assert.deepEqual(t.list(30).map((p) => p.name), ['old-crm']);   // (due: worked on two days, quiet 45 days; the one-off never)
  assert.deepEqual(fs.readdirSync(path.join(d.claude, 'projects'), { recursive: true }).sort(), before);   // (nothing of Claude Code's touched)
  await t.seed();   // (once only)
  fs.rmSync(d.root, { recursive: true, force: true });
});

test('the list stays bounded', () => {
  const d = dirs(); let at = NOW - 400 * DAY;
  const t = make(d, () => at);
  for (let i = 0; i < 320; i++) { t.touch(`p${i}`, { at: at + i * 1000 }); }
  at = NOW;
  t.save();
  const saved = JSON.parse(fs.readFileSync(path.join(d.data, 'tenure.json'), 'utf8'));
  assert.ok(Object.keys(saved.projects).length <= 300);
  assert.equal(saved.projects.p0, undefined);    // (the oldest went)
  assert.ok(saved.projects.p319);
  fs.rmSync(d.root, { recursive: true, force: true });
});
