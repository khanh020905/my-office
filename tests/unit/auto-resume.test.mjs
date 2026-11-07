import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAutoResume } from '../../server/auto-resume.mjs';

// server/auto-resume.mjs: a conversation moved off an account that ran out goes on by itself on the new one
const SID = '12345678-1234-1234-1234-123456789abc';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pins = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pins-')); fs.writeFileSync(path.join(d, SID), ''); return d; };
const spawnSpy = () => { const calls = []; const spawn = (file, args, opts) => { calls.push({ file, args, opts }); return { pid: 4242, unref() {} }; }; return { calls, spawn }; };

test('off in the settings: nothing', () => {
  const ar = createAutoResume({ prefs: { get: (k) => (k === 'autoResume' ? false : undefined) } });
  assert.deepEqual(ar.resumeSession({ sid: SID }, 'b'), { ok: false, reason: 'disabled' });
});

test('no conversation id, or not one: nothing', () => {
  const ar = createAutoResume({ prefs: { get: () => undefined } });
  assert.equal(ar.resumeSession({}, 'b').reason, 'badSid');
  assert.equal(ar.resumeSession({ sid: 'not-a-uuid' }, 'b').reason, 'badSid');
});

test('no Claude Code to run: nothing', () => {
  const ar = createAutoResume({ prefs: { get: () => undefined }, findClaude: () => null });
  assert.equal(ar.resumeSession({ sid: SID }, 'b').reason, 'noClaude');
});

test('Claude Code on the new account, resuming that conversation with the words to go on', async () => {
  const { calls, spawn } = spawnSpy(), logs = [];
  const ar = createAutoResume({ prefs: { get: () => undefined }, findClaude: () => ({ file: '/x/claude' }), dirOfSlug: (s) => (s === 'b' ? '/h/.claude-b' : ''),
    pinDir: pins(), spawn, prompt: () => 'go on', delayMs: 5, log: (m) => logs.push(m) });
  assert.equal(ar.resumeSession({ sid: SID, cwd: process.cwd(), name: 'shop' }, 'b').ok, true);
  await wait(30);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, '/x/claude');
  assert.deepEqual(calls[0].args, ['--resume', SID, '-p', 'go on']);
  assert.equal(calls[0].opts.env.CLAUDE_CONFIG_DIR, '/h/.claude-b');
  assert.match(logs[0], /auto-resume shop on b \(pid 4242\)/);
});

test('back to the main account: its own folder, not the one this office runs with', async () => {
  const { calls, spawn } = spawnSpy(), was = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = '/h/.claude-elsewhere';
  try {
    const ar = createAutoResume({ prefs: { get: () => undefined }, findClaude: () => ({ file: '/x/claude' }), dirOfSlug: () => '', pinDir: pins(), spawn, delayMs: 5 });
    ar.resumeSession({ sid: SID }, '');
    await wait(30);
    assert.equal(calls[0].opts.env.CLAUDE_CONFIG_DIR, undefined);
  } finally { if (was === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = was; }
});

test('opened again from the editor meanwhile (its pin gone): no second Claude Code beside it', async () => {
  const { calls, spawn } = spawnSpy(), dir = pins();
  const ar = createAutoResume({ prefs: { get: () => undefined }, findClaude: () => ({ file: '/x/claude' }), pinDir: dir, spawn, delayMs: 20 });
  assert.equal(ar.resumeSession({ sid: SID }, 'b').ok, true);
  fs.rmSync(path.join(dir, SID));
  await wait(50);
  assert.equal(calls.length, 0);
});

test('no loop: at most 3 times in 10 minutes per conversation', () => {
  const logs = [];
  const ar = createAutoResume({ prefs: { get: () => undefined }, findClaude: () => ({ file: '/x/claude' }), spawn: () => ({ unref() {} }), delayMs: 60_000, log: (m) => logs.push(m) });
  for (let i = 0; i < 3; i++) assert.equal(ar.resumeSession({ sid: SID }, 'b').ok, true);
  assert.equal(ar.resumeSession({ sid: SID }, 'b').reason, 'rateLimited');
  assert.match(logs[0], /skipped: 4 times within 10 min/);
});
