import { test } from 'node:test';
import { execFileSync } from 'node:child_process';

// the menu bar icon (menubar/MyOfficeBar.swift) still compiles: type-checked by the Swift compiler, on a Mac that has one
let swift = process.platform === 'darwin';
try { if (swift) execFileSync('xcrun', ['--find', 'swiftc'], { stdio: 'ignore' }); } catch { swift = false; }
test('the menu bar app type-checks', { skip: !swift && 'no Swift compiler here', timeout: 240_000 }, () => {
  execFileSync('xcrun', ['swiftc', '-typecheck', 'menubar/MyOfficeBar.swift'], { stdio: 'pipe' });
});
