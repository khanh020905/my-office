import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAgentIntegrationState } from '../../server/tools/agent-integration-state.mjs';

test('persists observed evidence across restart without claiming functional verification', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-state-'));
  const storePath = path.join(dir, 'registry.json');
  const first = createAgentIntegrationState({ storePath, now: () => 1000 });
  first.observe('codex-app', 'codex-app', 'codex-app-hook', 'session-1', 1000, 'D:/repo');
  const restored = createAgentIntegrationState({ storePath, now: () => 2000 });
  const row = restored.get('codex-app', { detected: false, statuses: ['SUPPORTED', 'CONFIGURED'] });
  assert.equal(row.connected, true);
  assert.equal(row.observed, true);
  assert.equal(row.installed, false);
  assert.equal(row.configured, true);
  assert.equal(row.functionallyVerified, false);
  assert.equal(row.evidenceSource, 'codex-app-hook');
  assert.equal(row.projectScope, 'D:/repo');
  assert.equal(row.lastObservedAt, 1000);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('marks evidence stale without clearing observed history or installed/configured state', () => {
  let now = 0;
  const state = createAgentIntegrationState({ now: () => now, staleAfterMs: 10 });
  state.observe('antigravity', 'antigravity', 'antigravity-observer', 'conversation-1', 1);
  now = 12;
  const row = state.get('antigravity', { detected: true, statuses: ['CONFIGURED'] });
  assert.equal(row.evidenceStale, true);
  assert.equal(row.connected, false);
  assert.equal(row.observed, true);
  assert.equal(row.installed, true);
  assert.equal(row.configured, true);
});
