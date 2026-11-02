import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { dataDir } from '../../server/data-dir.mjs';

// a clone keeps data/ beside the code; an npm install (global, or npx's cache) keeps ~/.my-office, which an upgrade
// leaves alone; OFFICE_DATA_DIR wins
test('where the office keeps its data', () => {
  const clone = path.join(os.homedir(), 'code', 'my-office'), npm = path.join('/opt', 'homebrew', 'lib', 'node_modules', 'my-office');
  assert.equal(dataDir(clone, {}), path.join(clone, 'data'));
  assert.equal(dataDir(npm, {}), path.join(os.homedir(), '.my-office'));
  assert.equal(dataDir(path.join(os.homedir(), '.npm', '_npx', 'ab12', 'node_modules', 'my-office'), {}), path.join(os.homedir(), '.my-office'));
  assert.equal(dataDir(npm, { OFFICE_DATA_DIR: '/tmp/office-test' }), path.resolve('/tmp/office-test'));
});
