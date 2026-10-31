import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGit } from '../../server/git.mjs';

// a new version tag in a session's repository is a release (people/photobooth.js), once; a tag there before is not
test('a new tag is a release, told once', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-git-')), git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  try {
    git('init', '-q'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 'T'); git('config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a'); git('add', '.'); git('commit', '-q', '-m', 'one'); git('tag', 'v0.1.0');
    const seen = [];
    const g = createGit({ onRepo() {}, onCommit() {}, onPush() {}, onCi() {}, onRelease: (r, tag) => seen.push(tag) });
    await g.poll([dir]);
    assert.deepEqual(seen, [], 'a tag already there when the office opens is old news');
    git('tag', 'v0.2.0'); await g.poll([dir]); await g.poll([dir]);
    assert.deepEqual(seen, ['v0.2.0']);
    fs.writeFileSync(path.join(dir, 'b.txt'), 'b'); git('add', '.'); git('commit', '-q', '-m', 'two'); git('tag', '-a', 'v1.0.0', '-m', 'one point oh');
    await g.poll([dir]);
    assert.deepEqual(seen, ['v0.2.0', 'v1.0.0']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
