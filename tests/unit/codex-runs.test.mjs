import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseCodexJsonl, createCodexRuns } from '../../server/codex-runs.mjs';

test('Codex JSONL parser handles chunk boundaries, ignores malformed lines, and deduplicates', () => {
  const run = { buf: '', seen: new Set(), messages: [] }, got = [];
  const line = JSON.stringify({ type: 'thread.started', thread_id: 'thread-a' });
  parseCodexJsonl(run, line.slice(0, 12), false, (e) => got.push(e));
  parseCodexJsonl(run, `${line.slice(12)}\nnot-json\n${line}\n`, false, (e) => got.push(e));
  assert.equal(got.length, 1);
  assert.equal(run.threadId, 'thread-a');
});

test('Codex captures assistant messages without inferring a process result', () => {
  const run = { buf: '', seen: new Set(), messages: [] }, got = [];
  const events = [{ type: 'turn.started' }, { type: 'item.completed', item: { id: 'item-a', type: 'agent_message', text: 'answer' } }, { type: 'turn.completed' }];
  parseCodexJsonl(run, `${events.map(JSON.stringify).join('\n')}\n`, false, (e) => got.push(e.type));
  assert.deepEqual(got, ['turn.started', 'item.completed', 'turn.completed']);
  assert.deepEqual(run.messages.map((m) => m.text), ['answer']);
  assert.equal(run.outcome, undefined);
});

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  kill() { this.killed = true; return true; }
  close(code, signal = null) { this.emit('close', code, signal); }
}

async function setup({ timeoutMs = 60_000, dirty = false, spawnProcess } = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'office-codex-'));
  const repo = path.join(dataDir, 'repo'), project = path.join(repo, 'app'), worktreeRoot = path.join(dataDir, 'worktrees');
  await fs.mkdir(project, { recursive: true });
  let isDirty = dirty;
  const gitRun = async (args, cwd) => {
    if (args[0] === 'rev-parse') return cwd === project || cwd === repo ? repo : cwd;
    if (args[0] === 'status') return isDirty ? ' M file.txt' : '';
    if (args[0] === 'worktree' && args[1] === 'add') { await fs.mkdir(path.join(args[4], 'app'), { recursive: true }); return ''; }
    if (args[0] === 'worktree' && args[1] === 'remove') { await fs.rm(args[2], { recursive: true }); return ''; }
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
  const children = [], calls = [], gitChanges = new Map();
  const runner = createCodexRuns({ bin: 'codex', dataDir, timeoutMs, worktreeRoot, gitRun,
    gitStatus: async (cwd) => gitChanges.get(cwd) || '',
    spawnProcess: spawnProcess || ((bin, argv, opts) => { calls.push({ bin, argv, opts }); const c = new FakeChild(); c.pid = 1234; children.push(c); return c; }) });
  return { dataDir, repo, project, worktreeRoot, runner, children, calls, gitChanges, dirty: (v) => { isDirty = v; } };
}
const waitForRun = async (runner, id) => { for (let i = 0; i < 50 && ['running', 'starting'].includes(runner.get(id)?.status); i++) await new Promise((resolve) => setTimeout(resolve, 10)); return runner.get(id); };
const turnDone = (child) => child.stdout.write(`${JSON.stringify({ type: 'turn.completed' })}\n`);

test('start creates a dedicated worktree and uses only workspace-write', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  await fs.writeFile(path.join(h.project, 'input.txt'), 'from dependency');
  const result = await h.runner.start({ dir: h.project, text: 'make a small change', workflowId: 'workflow-1', taskId: 'task-a', dispatchId: 'claim-a',
    seedArtifacts: [{ dir: h.project, artifacts: ['input.txt'] }] });
  assert.equal(result.ok, true);
  assert.equal(result.run.status, 'running');
  assert.equal(result.run.workflowId, 'workflow-1');
  assert.equal(result.run.taskId, 'task-a');
  assert.equal(result.run.dispatchId, 'claim-a');
  assert.ok(result.run.worktreePath.startsWith(h.worktreeRoot));
  assert.equal(await fs.readFile(path.join(result.run.worktreePath, 'app', 'input.txt'), 'utf8'), 'from dependency');
  assert.ok(h.calls[0].argv.includes('workspace-write'));
  assert.ok(!h.calls[0].argv.includes('read-only'));
  assert.equal(h.calls[0].opts.cwd, path.join(result.run.worktreePath, 'app'));
  assert.equal(h.calls[0].opts.env.CODEX_WINDOWS_REGISTERED_CORE, undefined);
  assert.equal(h.calls[0].opts.env.CODEX_PERMISSION_PROFILE, undefined);
  assert.equal(h.calls[0].opts.env.APPDATA, process.env.APPDATA);
  assert.ok(!h.calls[0].argv.includes('danger-full-access'));
});

test('dirty repositories fail without spawning or changing the checkout', async (t) => {
  const h = await setup({ dirty: true }); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const result = await h.runner.start({ dir: h.project, text: 'task' });
  assert.equal(result.code, 'dirtyRepository');
  assert.equal(h.calls.length, 0);
  assert.equal(result.run.status, 'failed');
});

test('spawn throws become failed terminal runs', async (t) => {
  const h = await setup({ spawnProcess: () => { throw new Error('spawn denied'); } }); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const result = await h.runner.start({ dir: h.project, text: 'task' });
  assert.equal(result.code, 'start');
  assert.equal(result.run.status, 'failed');
  assert.match(result.run.error, /spawn denied/);
});

test('normal zero and non-zero exits become completed and failed', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const a = await h.runner.start({ dir: h.project, text: 'complete' }); h.children[0].stderr.write('non-fatal warning\n'); turnDone(h.children[0]); h.children[0].close(0);
  const b = await h.runner.start({ dir: h.project, text: 'fail' }); h.children[1].close(2);
  await waitForRun(h.runner, a.run.id); await waitForRun(h.runner, b.run.id);
  assert.equal(h.runner.get(a.run.id).status, 'completed');
  assert.equal(h.runner.get(a.run.id).taskStatus, 'success');
  assert.equal(h.runner.get(a.run.id).error, '');
  assert.match(h.runner.get(a.run.id).stderr, /non-fatal warning/);
  assert.equal(h.runner.get(a.run.id).exitCode, 0);
  assert.equal(h.runner.get(b.run.id).status, 'failed');
  assert.equal(h.runner.get(b.run.id).taskStatus, 'failure');
  assert.equal(h.runner.get(b.run.id).exitCode, 2);
});

test('stop records cancelled before kill and duplicate close cannot change it', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const result = await h.runner.start({ dir: h.project, text: 'long task' }), child = h.children[0];
  assert.equal(h.runner.stop(result.run.id), true);
  assert.equal(h.runner.get(result.run.id).status, 'cancelled');
  assert.equal(child.killed, true);
  assert.equal((await h.runner.cleanup(result.run.id)).code, 'activeOrMissing');
  child.close(null, 'SIGTERM'); child.close(0);
  const saved = h.runner.get(result.run.id);
  assert.equal(saved.status, 'cancelled');
  assert.equal(saved.signal, 'SIGTERM');
  assert.equal(saved.events.filter((e) => e.eventType === 'run.cancelled').length, 1);
  assert.deepEqual(await h.runner.cleanup(result.run.id), { ok: true });
});

test('timeout records timeout before termination', async (t) => {
  const h = await setup({ timeoutMs: 15 }); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const result = await h.runner.start({ dir: h.project, text: 'long task' });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(h.runner.get(result.run.id).status, 'timeout');
  assert.equal(h.children[0].killed, true);
});

test('stdout is captured and bounded', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const result = await h.runner.start({ dir: h.project, text: 'say hello' });
  h.children[0].stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: 'thread-a' })}\n`);
  assert.match(h.runner.get(result.run.id).output, /thread.started/);
  assert.equal(h.runner.get(result.run.id).threadId, 'thread-a');
});

test('exit zero without output is incomplete, not successful', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const result = await h.runner.start({ dir: h.project, text: 'do a task' }); h.children[0].close(0);
  const saved = await waitForRun(h.runner, result.run.id);
  assert.equal(saved.processStatus, 'completed');
  assert.equal(saved.exitCode, 0);
  assert.equal(saved.taskStatus, 'incomplete');
});

test('failed tool events block a task even when the process exits zero', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const result = await h.runner.start({ dir: h.project, text: 'write a file' });
  h.children[0].stdout.write(`${JSON.stringify({ type: 'item.completed', item: { type: 'file_change', status: 'failed', error: 'failed_to_write_file' } })}\n`);
  turnDone(h.children[0]); h.children[0].close(0);
  const saved = await waitForRun(h.runner, result.run.id);
  assert.equal(saved.exitCode, 0);
  assert.equal(saved.taskStatus, 'blocked');
  assert.match(saved.error, /failed_to_write_file/);
});

test('no-match ripgrep searches do not poison a completed artifact task', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const artifact = 'SPEC.md';
  const result = await h.runner.start({ dir: h.project, text: 'write a spec', expectedArtifacts: [artifact] });
  h.children[0].stdout.write(`${JSON.stringify({ type: 'item.completed', item: { id: 'search', type: 'command_execution', status: 'failed',
    command: 'rg --files -g AGENTS.md -g README.md', exit_code: 1 } })}\n`);
  h.children[0].stdout.write(`${JSON.stringify({ type: 'item.completed', item: { id: 'search-2', type: 'command_execution', status: 'failed',
    command: 'rg -n createServer . -g !SPEC.md', exit_code: 1 } })}\n`);
  await fs.writeFile(path.join(result.run.workingDirectory, artifact), '# API spec');
  h.gitChanges.set(result.run.worktreePath, `?? ${artifact}\0`);
  turnDone(h.children[0]); h.children[0].close(0);
  const saved = await waitForRun(h.runner, result.run.id);
  assert.equal(saved.taskStatus, 'success');
  assert.deepEqual(saved.artifactChanges, [artifact]);
});

test('a failed Codex turn is a task failure, not blocked or successful', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const result = await h.runner.start({ dir: h.project, text: 'do a task' });
  h.children[0].stdout.write(`${JSON.stringify({ type: 'turn.failed' })}\n`); h.children[0].close(0);
  const saved = await waitForRun(h.runner, result.run.id);
  assert.equal(saved.processStatus, 'completed');
  assert.equal(saved.taskStatus, 'failure');
  assert.match(saved.error, /failed turn/);
});

test('expected artifact must be created or changed and appear in Git status', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const artifact = 'CODEX_WRITE_ACCEPTANCE.txt';
  const result = await h.runner.start({ dir: h.project, text: 'write a file', expectedArtifacts: [artifact] });
  await fs.writeFile(path.join(result.run.workingDirectory, artifact), 'MY OFFICE CODEX WRITE VERIFIED');
  h.gitChanges.set(result.run.worktreePath, `?? ${artifact}\0`);
  turnDone(h.children[0]); h.children[0].close(0);
  const saved = await waitForRun(h.runner, result.run.id);
  assert.equal(saved.taskStatus, 'success');
  assert.deepEqual(saved.changedFiles, [artifact]);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(h.dataDir, 'codex-runs.json'), 'utf8')).runs[0].expectedArtifacts, [artifact]);
  assert.equal(JSON.parse(await fs.readFile(path.join(h.dataDir, 'codex-runs.json'), 'utf8')).runs[0].taskStatus, 'success');
});

test('exit zero without the expected artifact is incomplete', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const result = await h.runner.start({ dir: h.project, text: 'write a file', expectedArtifacts: ['missing.txt'] });
  turnDone(h.children[0]); h.children[0].close(0);
  const saved = await waitForRun(h.runner, result.run.id);
  assert.equal(saved.taskStatus, 'incomplete');
  assert.match(saved.error, /missing.txt/);
});

test('rejects unsafe expected artifact paths before launching Codex', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  for (const expected of [['../outside.txt'], ['.git/config'], ['C:\\outside.txt']]) {
    assert.equal((await h.runner.start({ dir: h.project, text: 'task', expectedArtifacts: expected })).code, 'invalidArtifact');
  }
  assert.equal(h.calls.length, 0);
});

test('a missing worktree fails without spawning Codex', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  let spawned = false;
  const missing = createCodexRuns({ bin: 'codex', dataDir: path.join(h.dataDir, 'missing'), worktreeRoot: h.worktreeRoot,
    worktrees: { create: async () => ({ repoRoot: h.repo, worktreePath: path.join(h.dataDir, 'does-not-exist'), workingDirectory: path.join(h.dataDir, 'does-not-exist'), branch: 'myoffice/missing', owner: 'x' }), release: () => true },
    spawnProcess: () => { spawned = true; return new FakeChild(); } });
  const result = await missing.start({ dir: h.project, text: 'task' });
  assert.equal(result.code, 'invalidWorktree');
  assert.equal(spawned, false);
  missing.dispose();
});

test('an incorrect working directory outside the worktree fails without spawning', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const worktreePath = path.join(h.dataDir, 'worktree'), outside = path.join(h.dataDir, 'outside');
  await fs.mkdir(worktreePath); await fs.mkdir(outside);
  let spawned = false;
  const runner = createCodexRuns({ bin: 'codex', dataDir: path.join(h.dataDir, 'incorrect-cwd'),
    worktrees: { create: async () => ({ repoRoot: h.repo, worktreePath, workingDirectory: outside, branch: 'myoffice/outside', owner: 'x' }), release: () => true },
    spawnProcess: () => { spawned = true; return new FakeChild(); } });
  const result = await runner.start({ dir: h.project, text: 'task' });
  assert.equal(result.code, 'invalidWorktree');
  assert.equal(spawned, false);
  runner.dispose();
});

test('restart recovery persists completed runs and marks active runs interrupted', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const done = await h.runner.start({ dir: h.project, text: 'done' }); h.children[0].close(0);
  const active = await h.runner.start({ dir: h.project, text: 'still running' });
  h.runner.dispose();
  await waitForRun(h.runner, done.run.id);
  const recovered = createCodexRuns({ bin: 'codex', dataDir: h.dataDir, gitRun: async () => '', worktreeRoot: h.worktreeRoot });
  assert.equal(recovered.get(done.run.id).status, 'completed');
  assert.equal(recovered.get(done.run.id).taskStatus, 'incomplete');
  assert.equal(recovered.get(active.run.id).status, 'interrupted');
  assert.equal(recovered.get(active.run.id).worktreePath, active.run.worktreePath);
  recovered.dispose();
});

test('cleanup refuses dirty worktrees and removes clean worktrees', async (t) => {
  const h = await setup(); t.after(() => fs.rm(h.dataDir, { recursive: true, force: true }));
  const result = await h.runner.start({ dir: h.project, text: 'task' }); h.children[0].close(0);
  await waitForRun(h.runner, result.run.id);
  h.dirty(true);
  assert.equal((await h.runner.cleanup(result.run.id)).code, 'dirtyWorktree');
  h.dirty(false);
  assert.deepEqual(await h.runner.cleanup(result.run.id), { ok: true });
});
