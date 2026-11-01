import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NEW_BUILD_MS, SERVICE_MS, createLiftService, planService } from '../../server/lift-service.mjs';

const T0 = Date.UTC(2026, 10, 1, 2, 0);

test('a restart on the same build: three minutes of servicing, no sticker', () => {
  const p = planService({ build: 'abc', sticker: null }, 'abc', T0, '0.2.0');
  assert.equal(p.until - p.since, SERVICE_MS);
  assert.equal(p.newBuild, false);
  assert.equal(p.sticker, null);
});

test('a new build: five minutes, and the sticker for it (dated when the servicing ends)', () => {
  const p = planService({ build: 'old', sticker: null }, 'new', T0, '0.2.0');
  assert.equal(p.until - p.since, NEW_BUILD_MS);
  assert.equal(p.newBuild, true);
  assert.deepEqual(p.sticker, { build: 'new', version: '0.2.0', at: T0 + NEW_BUILD_MS });
});

test('the first start ever, or a start with no build (dev mode), is not a new build', () => {
  assert.equal(planService(null, 'abc', T0).newBuild, false);
  assert.equal(planService({ build: '' }, 'abc', T0).newBuild, false);
  assert.equal(planService({ build: 'abc' }, '', T0).newBuild, false);
  assert.equal(planService({ build: 'abc' }, '', T0).until - T0, SERVICE_MS);
});

test('a restart on a build already inspected keeps its sticker; on another build the old one goes', () => {
  const sticker = { build: 'new', version: '0.2.0', at: T0 };
  assert.deepEqual(planService({ build: 'new', sticker }, 'new', T0 + 3600e3).sticker, sticker);
  assert.equal(planService({ build: 'new', sticker }, 'newer', T0 + 3600e3).sticker.build, 'newer');
  assert.equal(planService({ build: 'new', sticker: { ...sticker, build: 'older' } }, 'new', T0).sticker, null);
});

test('createLiftService keeps the build in data/lift.json: the next start on another build is a new build', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lift-'));
  try {
    const a = createLiftService({ dataDir: dir, build: 'b1', version: '0.2.0', now: T0 });
    assert.equal(a.plan.newBuild, false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'lift.json'), 'utf8')).build, 'b1');
    const b = createLiftService({ dataDir: dir, build: 'b2-long-build-id', version: '0.2.1', now: T0 + 60e3 });
    assert.equal(b.plan.newBuild, true);
    // what a page gets: the time left (not a clock time), the whole length, the sticker with a short build id
    assert.deepEqual(b.pub(T0 + 60e3 + 30e3), { left: NEW_BUILD_MS - 30e3, total: NEW_BUILD_MS, newBuild: true, sticker: { version: '0.2.1', at: T0 + 60e3 + NEW_BUILD_MS, build: 'b2-long' } });
    assert.equal(b.pub(T0 + 60e3 + NEW_BUILD_MS + 1).left, 0);
    // and on that same build again: three minutes, the sticker still there
    const c = createLiftService({ dataDir: dir, build: 'b2-long-build-id', version: '0.2.1', now: T0 + 3600e3 });
    assert.equal(c.plan.newBuild, false);
    assert.equal(c.pub(T0 + 3600e3).total, SERVICE_MS);
    assert.equal(c.pub(T0 + 3600e3).sticker.build, 'b2-long');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a broken or unwritable data/lift.json is a first start, never an error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lift-'));
  try {
    fs.writeFileSync(path.join(dir, 'lift.json'), '{not json');
    assert.equal(createLiftService({ dataDir: dir, build: 'x', now: T0 }).plan.newBuild, false);
    assert.doesNotThrow(() => createLiftService({ dataDir: path.join(dir, 'missing', 'deeper'), build: 'x', now: T0 }));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
