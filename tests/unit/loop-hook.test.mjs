// The stuck-loop hook runs before every tool call, synchronously: it must never hold Claude Code up or block it when
// the office is down, slow or answering nonsense. These run the very command `install` writes (and the Windows script).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const WIN = process.platform === 'win32';
const payload = JSON.stringify({ session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } });

// a port nobody listens on
async function deadPort() { const s = http.createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r)); const { port } = s.address(); await new Promise((r) => s.close(r)); return port; }
// an office that answers with `body` after `wait` ms
async function office(body, wait = 0) {
  const s = http.createServer((req, res) => { req.resume(); req.on('end', () => setTimeout(() => { try { res.writeHead(200).end(body); } catch { /* gone */ } }, wait)); });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { port: s.address().port, close: () => new Promise((r) => { s.closeAllConnections(); s.close(r); }) };
}
// the PreToolUse command `install` writes for that port (into a settings file of the test's own)
function loopCommand(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-hook-')), file = path.join(dir, 'settings.json');
  execFileSync(process.execPath, [path.join(ROOT, 'bin', 'cli.mjs'), 'install', '--settings', file, '--no-status'], { env: { ...process.env, HOME: dir, USERPROFILE: dir, CLAUDE_CONFIG_DIR: path.join(dir, '.claude'), OFFICE_PORT: String(port), OFFICE_DATA_DIR: dir }, stdio: 'ignore' });
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const hooks = cfg.hooks.PreToolUse.flatMap((e) => e.hooks).filter((h) => h.command.includes('/hook/loop'));
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(hooks.length, 1, 'one stuck-loop hook');
  assert.ok(!hooks[0].async, 'synchronous: its answer counts');
  assert.ok(hooks[0].timeout <= 2);
  return hooks[0].command;
}
// runs a hook command the way Claude Code does (a shell, the event on stdin): -> { code, out, ms }
function runHook(command) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const child = spawn(command, { shell: WIN ? true : '/bin/sh', stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => { out += c; });
    child.on('close', (code) => resolve({ code, out, ms: performance.now() - t0 }));
    child.stdin.end(payload);
  });
}

test('the office not running: the hook prints nothing and exits 0 at once (the call goes ahead)', async () => {
  const r = await runHook(loopCommand(await deadPort()));
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
  assert.ok(r.ms < 1000, `took ${Math.round(r.ms)} ms`);
});

test('the office slow to answer: given up within the hook\'s budget, nothing printed', async () => {
  const o = await office('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"late"}}', 3000);
  try {
    const r = await runHook(loopCommand(o.port));
    assert.equal(r.code, 0);
    assert.equal(r.out, '', 'a late answer is no answer');
    assert.ok(r.ms < 1500, `took ${Math.round(r.ms)} ms`);
  } finally { await o.close(); }
});

test('the office answering: its decision comes through as it was sent', async () => {
  const deny = '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"same error 3 times"}}';
  const o = await office(deny);
  try {
    const r = await runHook(loopCommand(o.port));
    assert.equal(r.code, 0);
    assert.deepEqual(JSON.parse(r.out), JSON.parse(deny));
  } finally { await o.close(); }
});

test('Windows\' hook script (--fast): nothing from an office that is down or slow', async () => {
  const send = (port) => runHook(`"${process.execPath}" "${path.join(ROOT, 'hooks', 'send.mjs')}" http://127.0.0.1:${port}/hook/loop --fast`);
  const down = await send(await deadPort());
  assert.equal(down.code, 0); assert.equal(down.out, '');
  const o = await office('{"continue":false}', 2000);
  try { const slow = await send(o.port); assert.equal(slow.code, 0); assert.equal(slow.out, ''); assert.ok(slow.ms < 1500, `took ${Math.round(slow.ms)} ms`); } finally { await o.close(); }
});

test('install also adds the hook that says pinned notes again after a compaction: synchronous, only on "compact", short', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-hook-')), file = path.join(dir, 'settings.json');
  execFileSync(process.execPath, [path.join(ROOT, 'bin', 'cli.mjs'), 'install', '--settings', file, '--no-status'], { env: { ...process.env, HOME: dir, USERPROFILE: dir, CLAUDE_CONFIG_DIR: path.join(dir, '.claude'), OFFICE_PORT: '4310', OFFICE_DATA_DIR: dir }, stdio: 'ignore' });
  const entries = JSON.parse(fs.readFileSync(file, 'utf8')).hooks.SessionStart.filter((e) => e.hooks.some((h) => h.command.includes('/hook/start')));
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].matcher, 'compact');
  assert.ok(!entries[0].hooks[0].async);
  assert.ok(entries[0].hooks[0].timeout <= 5);
});
