import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// the menu bar icon (menubar/MyOfficeBar.swift) still compiles: type-checked by the Swift compiler, on a Mac that has one
let swift = process.platform === 'darwin';
try { if (swift) execFileSync('xcrun', ['--find', 'swiftc'], { stdio: 'ignore' }); } catch { swift = false; }
test('the menu bar app type-checks', { skip: !swift && 'no Swift compiler here', timeout: 240_000 }, () => {
  execFileSync('xcrun', ['swiftc', '-typecheck', 'menubar/MyOfficeBar.swift'], { stdio: 'pipe' });
});

// its logo ships with it (macOS shows it on the app's notifications; without it they carry a blank square)
test('the menu bar app has its logo', () => {
  const icns = fs.readFileSync('menubar/AppIcon.icns');
  assert.equal(icns.subarray(0, 4).toString(), 'icns');
  assert.equal(icns.readUInt32BE(4), icns.length);
  assert.match(fs.readFileSync('bin/cli.mjs', 'utf8'), /CFBundleIconFile<\/key><string>AppIcon</);
});
