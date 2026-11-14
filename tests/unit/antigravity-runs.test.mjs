import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { changedConversations } from '../../server/antigravity-runs.mjs';

test('reports only .db conversation files changed after the cutoff', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ag-runs-'));
  try {
    await fs.writeFile(path.join(dir, 'old.db'), '');
    await fs.writeFile(path.join(dir, 'new.db'), '');
    await fs.writeFile(path.join(dir, 'notes.txt'), '');
    const past = new Date(Date.now() - 60_000);
    await fs.utimes(path.join(dir, 'old.db'), past, past);
    const hits = await changedConversations([dir, path.join(dir, 'missing')], Date.now() - 30_000);
    assert.deepEqual(hits.map((h) => h.id), ['new']);
    assert.equal(hits[0].dir, dir);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
