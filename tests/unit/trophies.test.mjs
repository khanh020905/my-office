import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTrophies, MILESTONES } from '../../server/trophies.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'office-trophies-'));
const today = () => '2026-10-27';

test('the opening plaque is earned on the first run, without a message', () => {
  const sent = [];
  const t = createTrophies({ dataDir: tmp(), claudeDir: tmp(), today, deployRe: /git push .*v\d/, onChange: (p, earned) => sent.push(earned) });
  assert.ok(t.pub().earned.open);
  assert.equal(sent.length, 0);
});

test('live counts reach a milestone and announce it once', () => {
  const sent = [];
  const t = createTrophies({ dataDir: tmp(), claudeDir: tmp(), today, deployRe: /git push .*v\d/, onChange: (p, earned) => sent.push(...earned) });
  t.bump('deploy');
  assert.deepEqual(sent, ['d1']);
  t.bump('deploy');
  assert.deepEqual(sent, ['d1'], 'not announced twice');
  assert.equal(t.pub().totals.deploy, 2);
});

test('a session counts once however many prompts it gets', () => {
  const t = createTrophies({ dataDir: tmp(), claudeDir: tmp(), today, deployRe: /x/, onChange: () => {} });
  t.session('abc'); t.session('abc'); t.session('def');
  assert.equal(t.pub().totals.sessions, 2);
});

test('every milestone has a known kind and a positive threshold', () => {
  for (const m of MILESTONES) { assert.ok(['plaque', 'cup', 'star', 'book', 'rocket', 'medal'].includes(m.kind), m.id); assert.ok(m.n > 0, m.id); }
});
