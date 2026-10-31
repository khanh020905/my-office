import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasBg, versionOf, parseBackgrounded, bgRefusal, bgPhase, parseAgents, bgSettings, HOLD_S } from '../../server/bg-sessions.mjs';
import { createTasks } from '../../server/tasks.mjs';

// what Claude Code 2.1.316 printed (checked by hand in a folder of its own, without a model)
const BACKGROUNDED = 'backgrounded · 7c5dcf5d\n  claude agents             list sessions\n  claude attach 7c5dcf5d    open in this terminal\n';
const COPY = 'note: session 46f1b9d1 is already running in the background, so this started a copy as 2c4bfa5b. `claude attach 46f1b9d1` opens the original.\nbackgrounded · 2c4bfa5b (idle — send a prompt to start)\n';

test('the help and version say whether it has background sessions', () => {
  assert.equal(hasBg('Options:\n  --bg, --background   Start the session in the background\nCommands:\n  agents [options]   Manage background agents\n'), true);
  assert.equal(hasBg('Options:\n  -p, --print   Print response and exit\nCommands:\n  mcp   Configure MCP servers\n'), false);
  assert.equal(hasBg('  --bg   only the flag, no agents command\n'), false);
  assert.equal(versionOf('2.1.316 (Claude Code)\n'), '2.1.316');
  assert.equal(versionOf('nothing'), null);
});

test('what `claude --bg` printed: its short id, a copy, why it refused', () => {
  assert.deepEqual(parseBackgrounded(BACKGROUNDED), { id: '7c5dcf5d', copy: false });
  assert.deepEqual(parseBackgrounded(`Starting background service…\n${BACKGROUNDED.replace('7c5dcf5d', '7c5dcf5d · flaky-test-fix')}`), { id: '7c5dcf5d', copy: false });
  assert.deepEqual(parseBackgrounded(COPY), { id: '2c4bfa5b', copy: true });
  assert.equal(parseBackgrounded('Usage: claude [options]'), null);
  assert.equal(bgRefusal('Workspace not trusted. Run `claude` in /x once and accept the trust prompt, then retry.'), 'untrusted');
  assert.equal(bgRefusal("error: unknown option '--bg'"), 'failed');
});

test('a row of `claude agents --json` the way the office tells it', () => {
  assert.deepEqual(bgPhase({ state: 'working', status: 'busy' }), { phase: 'work', wait: null });
  assert.deepEqual(bgPhase({ state: 'blocked', status: 'waiting', waitingFor: 'permission prompt' }), { phase: 'wait', wait: 'permission prompt' });
  assert.deepEqual(bgPhase({ state: 'working', status: 'waiting', waitingFor: 'input needed' }), { phase: 'wait', wait: 'input needed' });
  assert.deepEqual(bgPhase({ state: 'blocked', status: 'idle' }), { phase: 'wait', wait: null });   // (an expired login, say)
  assert.deepEqual(bgPhase({ state: 'done' }), { phase: 'done', wait: null });
  assert.deepEqual(bgPhase({ state: 'failed' }), { phase: 'fail', wait: null });
  assert.deepEqual(bgPhase({ state: 'stopped' }), { phase: 'stopped', wait: null });
  assert.deepEqual(bgPhase(undefined), { phase: 'gone', wait: null });
  const rows = parseAgents('note: something first\n[{"id":"75512f71","kind":"background","sessionId":"75512f71-2b75","state":"working"},3]\n');
  assert.deepEqual(rows.map((r) => r.id), ['75512f71']);
  assert.deepEqual(parseAgents('not json'), []);
});

test('the settings a background session gets: in place, the office told, approvals that wait', () => {
  const s = JSON.parse(bgSettings({ port: 4310 }));
  assert.deepEqual(s.worktree, { bgIsolation: 'none' });
  const bind = s.hooks.SessionStart[0].hooks[0], perm = s.hooks.PermissionRequest[0].hooks[0], ask = s.hooks.PreToolUse[0];
  assert.match(bind.command, /X-Office-Job: \$\{CLAUDE_JOB_DIR##\*\/\}/);
  assert.match(bind.command, /127\.0\.0\.1:4310\/hook\/bind/);
  assert.match(perm.command, /--max-time 86400 .*'http:\/\/127\.0\.0\.1:4310\/hook\/permission\?long=1' \|\| true$/);
  assert.equal(perm.timeout, HOLD_S + 10);
  assert.equal(ask.matcher, 'AskUserQuestion|ExitPlanMode');
  assert.match(ask.hooks[0].command, /\/hook\/question\?long=1/);
  // nothing about one task in them: Claude Code keeps them with the session and uses them again when it wakes it
  assert.equal(bgSettings({ port: 4310 }), bgSettings({ port: 4310 }));
  const w = JSON.parse(bgSettings({ port: 4310, win: true, send: '"node" "send.mjs"' }));
  assert.equal(w.hooks.SessionStart[0].hooks[0].command, '"node" "send.mjs" http://127.0.0.1:4310/hook/bind --async --job');
  assert.equal(w.hooks.PermissionRequest[0].hooks[0].command, `"node" "send.mjs" http://127.0.0.1:4310/hook/permission?long=1 --wait ${HOLD_S}`);
});

// a stand-in for Claude Code's background sessions: what each call answered, and what it was asked
function fakeBg({ ok = true, out = BACKGROUNDED, code = 0, rows = [] } = {}) {
  const calls = [];
  return {
    calls, rows,
    want: () => true, settings: () => '{"worktree":{"bgIsolation":"none"}}',
    probe: async () => ({ ok, version: '2.1.316' }),
    run: async (file, args) => { calls.push(['run', ...args]); return { code, out, err: code ? out : '' }; },
    list: async () => rows,
    stop: async (file, id) => { calls.push(['stop', id]); return true; },
  };
}
// (stands in for `claude` where a run really starts: exits at once on Claude's flags, on every system; Windows has no /bin/echo)
const QUICK = process.execPath;
const until = async (fn, ms = 3000) => { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 10)); } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-bg-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('a task as a background session: started, told which it is, its answer from its Stop hook', async () => {
  const bg = fakeBg(), seen = [], done = [];
  const tasks = createTasks({ dataDir: dir, claude: () => ({ file: QUICK }), env: () => ({}), bg, onBg: (t, what, d) => seen.push([what, d]), onDone: (t) => done.push(t), watchMs: 60_000 });
  const r = tasks.start({ dir, text: '-p tidy the docs', system: 'a word from the office' });
  assert.equal(r.ok, true);
  await until(() => seen.some(([w]) => w === 'started'));
  const args = bg.calls[0].slice(1);
  assert.deepEqual(args.slice(0, 1), ['--bg']);
  assert.deepEqual(args.slice(-2), ['--', '-p tidy the docs']);   // (its words after --: never read as flags)
  assert.ok(args.includes('--settings') && args.includes('--append-system-prompt'));
  tasks.bind('7c5dcf5d', 'sess-1');
  assert.equal(tasks.of('sess-1')?.hooked, true);
  assert.equal(tasks.settle(r.task.id, { result: 'All tidy.' }), true);
  assert.equal(done[0].result, 'All tidy.');
  assert.deepEqual(tasks.list(), []);
});

test('carrying on a background session: stopped first while it runs, then woken with the options it keeps', async () => {
  const bg = fakeBg({ rows: [{ id: 'aaaa1111', sessionId: 'sess-2', pid: 42, state: 'done' }] }), seen = [];
  const tasks = createTasks({ dataDir: dir, claude: () => ({ file: QUICK }), env: () => ({}), bg, onBg: (t, what) => seen.push(what), watchMs: 60_000 });
  tasks.start({ dir, text: 'and the tests', from: { sid: 'sess-2', fork: false } });
  await until(() => seen.includes('started'));
  assert.deepEqual(bg.calls[0], ['stop', 'aaaa1111']);
  assert.deepEqual(bg.calls[1], ['run', '--bg', '--resume', 'sess-2', '--', 'and the tests']);   // (no --settings: it keeps its own)
});

test('a folder Claude Code won\'t start one in: the same task as `claude -p`, said why', async () => {
  const bg = fakeBg({ code: 1, out: 'Workspace not trusted. Run `claude` in /x once and accept the trust prompt, then retry.' }), seen = [], done = [];
  const tasks = createTasks({ dataDir: dir, claude: () => ({ file: QUICK }), env: () => ({}), bg, onBg: (t, what, d) => seen.push([what, d]), onDone: (t) => done.push(t), watchMs: 60_000 });
  tasks.start({ dir, text: 'fix it' });
  await until(() => done.length === 1);
  assert.deepEqual(seen, [['fallback', 'untrusted']]);
  assert.equal(done[0].mode, 'print');
});

test('stopped from its card before it even started: stopped as it starts', async () => {
  const bg = fakeBg(), done = [];
  let release; bg.run = (file, args) => { bg.calls.push(['run', ...args]); return new Promise((r) => { release = () => r({ code: 0, out: BACKGROUNDED, err: '' }); }); };
  const tasks = createTasks({ dataDir: dir, claude: () => ({ file: QUICK }), env: () => ({}), bg, onDone: (t) => done.push(t), watchMs: 60_000 });
  const r = tasks.start({ dir, text: 'slowly' });
  await until(() => bg.calls.length === 1);
  assert.equal(tasks.stop(r.task.id), true);
  release();
  await until(() => done.length === 1);
  assert.equal(done[0].stopped, true);
  assert.deepEqual(bg.calls.at(-1), ['stop', '7c5dcf5d']);
});

test('looked at while it runs: waiting on the Mac, then failed', async () => {
  const bg = fakeBg(), seen = [], done = [];
  const tasks = createTasks({ dataDir: dir, claude: () => ({ file: QUICK }), env: () => ({}), bg, onBg: (t, what, d) => seen.push([what, d]), onDone: (t) => done.push(t), watchMs: 20 });
  tasks.start({ dir, text: 'work' });
  await until(() => seen.some(([w]) => w === 'started'));
  bg.rows.push({ id: '7c5dcf5d', sessionId: 'sess-3', state: 'blocked', status: 'waiting', waitingFor: 'permission prompt' });
  await until(() => seen.some(([w]) => w === 'wait'));
  assert.deepEqual(seen.find(([w]) => w === 'wait'), ['wait', 'permission prompt']);
  assert.equal(tasks.of('sess-3')?.job, '7c5dcf5d');
  bg.rows[0].state = 'failed';
  await until(() => done.length === 1);
  assert.equal(done[0].error, 'failed');
});
