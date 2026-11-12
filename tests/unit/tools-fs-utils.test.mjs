import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { normalizePath, isSafePath, linkOrCopyDirectory } from '../../server/tools/fs-utils.mjs';

describe('Universal Tool Registry — Filesystem & Windows Compatibility', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'my-office-fs-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* cleanup */
    }
  });

  it('normalizes paths consistently across separators', () => {
    const raw = path.join(tempDir, 'tools', 'sub', '..', 'actual');
    const normalized = normalizePath(raw);
    assert.equal(normalized, path.resolve(tempDir, 'tools', 'actual'));
    assert.equal(normalizePath(''), '');
  });

  it('validates safe paths and guards against path traversal', () => {
    const base = path.join(tempDir, 'managed');
    fs.mkdirSync(base, { recursive: true });

    const safeTarget = path.join(base, 'tool-a', 'v1');
    assert.equal(isSafePath(base, safeTarget), true);

    const escapeTarget = path.join(base, '..', 'system32');
    assert.equal(isSafePath(base, escapeTarget), false);
  });

  it('links or copies directories with automatic fallback', () => {
    const srcDir = path.join(tempDir, 'source-skill');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'SKILL.md'), '# Test Skill', 'utf8');

    const destDir = path.join(tempDir, 'dest-adapter', 'linked-skill');

    const result = linkOrCopyDirectory(srcDir, destDir);
    assert.ok(result.method === 'junction' || result.method === 'dir' || result.method === 'copy');
    assert.ok(fs.existsSync(destDir));
    assert.ok(fs.existsSync(path.join(destDir, 'SKILL.md')));
    assert.equal(fs.readFileSync(path.join(destDir, 'SKILL.md'), 'utf8'), '# Test Skill');
  });
});

