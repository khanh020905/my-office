#!/usr/bin/env node
// A quick check that the office works on this machine, whatever it runs (CI uses it on macOS, Linux and Windows):
// starts the built server on a spare port with its own data folder, then checks the page, the hooks, the machine panel's
// readings and the installer. Run `npm run build` first.
//   node scripts/smoke.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4398, base = `http://127.0.0.1:${PORT}`, data = fs.mkdtempSync(path.join(os.tmpdir(), 'office-smoke-'));
const env = { ...process.env, NODE_ENV: 'production', OFFICE_PORT: String(PORT), OFFICE_DATA_DIR: data, OFFICE_USAGE: '0', OFFICE_CI: '0', OFFICE_TRANSLATE: '0', OFFICE_AI_ACCOUNTS: '0' };   // (AI_ACCOUNTS 0: never this computer's own Codex or Antigravity sign-ins)
const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.mjs')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; server.stdout.on('data', (c) => { log += c; }); server.stderr.on('data', (c) => { log += c; });
const step = (name) => console.log(`  ✓ ${name}`);
try {
  for (let i = 0; ; i++) {   // up within 30 s
    try { if ((await fetch(`${base}/health`)).ok) break; } catch { /* not yet */ }
    if (i > 60) throw new Error('the server did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
  step(`server up on ${os.platform()} (${os.release()})`);
  const page = await fetch(`${base}/`); assert.equal(page.status, 200);
  assert.ok(/<html lang="en" data-os="\w+"/.test(await page.text()), 'the page should start with <html lang="en" data-os="…"> (is the build current?)');
  step('page renders');
  const ev = await fetch(`${base}/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'smoke', cwd: ROOT }) });
  assert.equal(ev.status, 200);
  step('hooks accepted');
  const sys = await (await fetch(`${base}/api/sys`)).json();
  assert.ok(sys.mem.total > 0 && sys.mem.used > 0 && sys.mem.used <= sys.mem.total, 'memory');
  assert.ok(sys.disk.total > 0, 'disk');
  assert.ok(sys.cpu.cores > 0, 'cores');
  assert.ok(Array.isArray(sys.devServers) && Array.isArray(sys.tips), 'lists');
  step(`machine panel: ${Math.round(sys.mem.used / 1e9)}/${Math.round(sys.mem.total / 1e9)} GB RAM, ${Math.round(sys.disk.free / 1e9)} GB free, ${sys.cpu.cores} cores`);
  const settings = path.join(data, 'settings.json');
  execFileSync(process.execPath, [path.join(ROOT, 'bin', 'cli.mjs'), 'install', '--settings', settings], { env, stdio: 'ignore' });
  const cfg = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.equal(Object.keys(cfg.hooks).length, 14);   // (13 events, and PermissionDenied for calls auto mode refuses)
  assert.ok(JSON.stringify(cfg.hooks).includes(`127.0.0.1:${PORT}/event`));
  step('installer writes the hooks');
  console.log('\nAll good.');
} catch (err) {
  console.error(`\n✗ ${err.message}\n--- server output ---\n${log.slice(-3000)}`);
  process.exitCode = 1;
} finally {
  server.kill();
  // (it writes its last state as it stops: wait for it, then clear its folder)
  await new Promise((done) => { if (server.exitCode !== null || server.signalCode) done(); else { server.once('exit', done); setTimeout(done, 5000); } });
  fs.rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
