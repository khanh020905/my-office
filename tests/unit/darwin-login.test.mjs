import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { claudeLogin } from '../../server/platform/darwin.mjs';

// Claude Code's sign-in on a Mac: the Keychain first; not there (a locked or missing Keychain, a login over SSH), the
// folder's .credentials.json, as on Linux and Windows. A folder with neither: no login. (The Keychain item of a fresh
// temp folder never exists, and with no `security` command at all, off a Mac, the file is still read.)
test('no Keychain item: the folder\'s .credentials.json is read', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-login-'));
  try {
    assert.equal(await claudeLogin(dir), null);
    fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'sk-ant-oat-test', expiresAt: 1 } }));
    assert.deepEqual(await claudeLogin(dir), { accessToken: 'sk-ant-oat-test', expiresAt: 1 });
    fs.writeFileSync(path.join(dir, '.credentials.json'), 'not json');
    assert.equal(await claudeLogin(dir), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
