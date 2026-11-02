import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildVsix, editorClis, panelIn, EXT_ID } from '../../server/vsix.mjs';

let unzip = true;
try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); } catch { unzip = false; }

// the editor side-bar extension as a .vsix: the manifest names it, its files under extension/, a zip unzip agrees with
test('the side-bar extension packs into a .vsix', { skip: !unzip && 'no unzip' }, () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'office-vsix-')), 'p.vsix');
  buildVsix(path.resolve('vscode-extension'), out);
  execFileSync('unzip', ['-tq', out]);   // (every entry's CRC checked)
  const list = execFileSync('unzip', ['-Z1', out], { encoding: 'utf8' }).trim().split('\n').sort();
  assert.deepEqual(list, ['[Content_Types].xml', 'extension.vsixmanifest', 'extension/extension.js', 'extension/media/icon.svg', 'extension/package.json']);
  const manifest = execFileSync('unzip', ['-p', out, 'extension.vsixmanifest'], { encoding: 'utf8' });
  const pkg = JSON.parse(fs.readFileSync('vscode-extension/package.json', 'utf8'));
  assert.ok(manifest.includes(`Id="${pkg.name}" Version="${pkg.version}" Publisher="${pkg.publisher}"`));
  assert.equal(`${pkg.publisher}.${pkg.name}`, EXT_ID);
});

test('editors: only the ones opened on this computer; the panel found by its folder', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'office-ed-')), bin = path.join(home, 'bin');
  fs.mkdirSync(bin); fs.writeFileSync(path.join(bin, process.platform === 'win32' ? 'cursor.cmd' : 'cursor'), '');
  fs.mkdirSync(path.join(home, '.cursor', 'extensions', `${EXT_ID}-0.1.0`), { recursive: true });
  const found = editorClis({ home, apps: path.join(home, 'none'), env: { PATH: bin } });
  assert.deepEqual(found.map((e) => e.app), ['Cursor']);
  assert.deepEqual(panelIn({ home }), ['Cursor']);
  assert.deepEqual(editorClis({ home: fs.mkdtempSync(path.join(os.tmpdir(), 'office-ed2-')), apps: path.join(home, 'none'), env: { PATH: bin } }), []);   // (never opened here)
});
