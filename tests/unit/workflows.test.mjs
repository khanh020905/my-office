import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkflows } from '../../server/workflows.mjs';

async function setup(t, { maxConcurrent = 2, dispatch, cancel } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'office-workflows-'));
  const file = path.join(dir, 'workflows.json'), called = [];
  const engine = createWorkflows({ file, maxConcurrent, dispatch: dispatch || (async (_w, task) => {
    called.push(task.id); return { ok: true, runId: `run-${task.id}`, dispatchId: task.dispatchId };
  }), cancel });
  t.after(async () => { engine.dispose(); await fs.rm(dir, { recursive: true, force: true }); });
  return { dir, file, called, engine };
}

const plan = (tasks) => ({ name: 'Test workflow', tasks });
const flush = async () => { await new Promise((resolve) => setImmediate(resolve)); await new Promise((resolve) => setImmediate(resolve)); };

test('rejects cycles, unknown dependency ids, unsupported providers, and unsafe artifacts', async (t) => {
  const h = await setup(t);
  assert.equal(h.engine.create(plan([{ id: 'a', dependsOn: ['b'] }, { id: 'b', dependsOn: ['a'] }])).code, 'cycle');
  assert.equal(h.engine.create(plan([{ id: 'a', dependsOn: ['missing'] }])).code, 'invalidTask');
  assert.equal(h.engine.create(plan([{ id: 'a', provider: 'antigravity' }])).code, 'invalidTask');
  assert.equal(h.engine.create(plan([{ id: 'absolute', provider: 'codex-cli', expectedArtifacts: ['C:\\outside.txt'] }])).code, 'invalidTask');
  assert.equal(h.engine.create(plan([{ id: 'traversal', provider: 'codex-cli', expectedArtifacts: ['../outside.txt'] }])).code, 'invalidTask');
  assert.equal(h.engine.create(plan([{ id: 'claude', provider: 'claude', expectedArtifacts: ['result.txt'] }])).code, 'invalidTask');
});

test('persists an exclusive task claim before dispatch and rejects a second scheduler owner', async (t) => {
  let finish;
  const h = await setup(t, { dispatch: (_w, task) => { h.called.push(task.id); return new Promise((resolve) => { finish = resolve; }); } });
  const made = h.engine.create(plan([{ id: 'a', provider: 'codex-cli' }]));
  h.engine.start(made.workflow.id);
  for (let i = 0; i < 5; i++) h.engine.schedule();
  await flush();
  const claimed = h.engine.get(made.workflow.id).tasks[0];
  assert.equal(h.called.length, 1);
  assert.equal(claimed.status, 'dispatching');
  assert.equal(claimed.attempt, 1);
  assert.ok(claimed.dispatchId);
  const persisted = JSON.parse(await fs.readFile(h.file, 'utf8')).workflows[0].tasks[0];
  assert.equal(persisted.dispatchId, claimed.dispatchId);
  const second = createWorkflows({ file: h.file });
  assert.equal(second.schedulerAvailable, false);
  assert.equal(second.start(made.workflow.id).code, 'schedulerBusy');
  assert.equal(second.create(plan([{ id: 'other' }])).code, 'schedulerBusy');
  second.dispose();
  finish({ ok: true, runId: 'run-a', dispatchId: claimed.dispatchId });
  await flush();
  assert.equal(h.engine.get(made.workflow.id).tasks[0].status, 'running');
  assert.equal(h.engine.settle(made.workflow.id, 'a', { status: 'completed', runId: 'run-a', dispatchId: claimed.dispatchId }), true);
  h.engine.schedule(); h.engine.schedule(); await flush();
  assert.equal(h.called.length, 1);
});

test('reclaims an expired scheduler lease after its owner process is gone', async (t) => {
  const h = await setup(t);
  h.engine.dispose();
  await fs.writeFile(`${h.file}.scheduler.lock`, JSON.stringify({ ownerId: 'dead-owner', pid: 2_000_000_000, at: 1, expiresAt: 2 }));
  const recovered = createWorkflows({ file: h.file });
  t.after(() => recovered.dispose());
  assert.equal(recovered.schedulerAvailable, true);
});

test('blocks failed and incomplete prerequisite chains until explicit retry succeeds', async (t) => {
  const h = await setup(t);
  const made = h.engine.create(plan([
    { id: 'a', provider: 'codex-cli', maxAttempts: 2 },
    { id: 'b', dependsOn: ['a'] }, { id: 'c', dependsOn: ['a'] }, { id: 'd', dependsOn: ['b', 'c'] },
  ]));
  h.engine.start(made.workflow.id); await flush();
  assert.deepEqual(h.called, ['a']);
  h.engine.settle(made.workflow.id, 'a', { status: 'incomplete', error: 'expected artifact missing' }); await flush();
  const tasks = h.engine.get(made.workflow.id).tasks;
  assert.equal(tasks.find((x) => x.id === 'a').status, 'incomplete');
  for (const id of ['b', 'c', 'd']) {
    const blocked = tasks.find((x) => x.id === id);
    assert.equal(blocked.status, 'blocked');
    assert.ok(blocked.blockReason);
    assert.ok(blocked.blockedBy.length);
  }
  assert.deepEqual(h.called, ['a']);
  assert.equal(h.engine.retry(made.workflow.id, 'a').ok, true); await flush();
  assert.equal(h.engine.get(made.workflow.id).tasks.find((x) => x.id === 'b').status, 'blocked');
  assert.equal(h.engine.get(made.workflow.id).tasks.find((x) => x.id === 'c').status, 'blocked');
  h.engine.settle(made.workflow.id, 'a', { status: 'completed' }); await flush();
  assert.deepEqual(h.called, ['a', 'a', 'b', 'c']);
  assert.equal(h.engine.get(made.workflow.id).tasks.find((x) => x.id === 'd').status, 'blocked');
  h.engine.settle(made.workflow.id, 'b', { status: 'completed' }); await flush();
  assert.equal(h.called.includes('d'), false);
  h.engine.settle(made.workflow.id, 'c', { status: 'completed' }); await flush();
  h.engine.schedule(); h.engine.schedule(); await flush();
  assert.deepEqual(h.called, ['a', 'a', 'b', 'c', 'd']);
});

test('provider incomplete result is a failed prerequisite, not a successful dependency', async (t) => {
  const h = await setup(t);
  const made = h.engine.create(plan([{ id: 'a', provider: 'codex-cli' }, { id: 'b', dependsOn: ['a'] }]));
  h.engine.start(made.workflow.id); await flush();
  const a = h.engine.get(made.workflow.id).tasks[0];
  assert.equal(h.engine.providerChanged({ id: 'run-a', workflowId: made.workflow.id, taskId: 'a', dispatchId: a.dispatchId,
    provider: 'codex-cli', status: 'completed', processStatus: 'completed', taskStatus: 'incomplete', exitCode: 0,
    error: 'expected artifact missing' }), true);
  const tasks = h.engine.get(made.workflow.id).tasks;
  assert.equal(tasks[0].status, 'failed');
  assert.equal(tasks[0].runs[0].taskStatus, 'failed');
  assert.equal(tasks[0].runs[0].providerTaskStatus, 'incomplete');
  assert.equal(tasks[1].status, 'blocked');
  assert.deepEqual(tasks[1].blockedBy, ['a']);
  assert.deepEqual(h.called, ['a']);
});

test('global concurrency is released once on timeout', async (t) => {
  const h = await setup(t, { maxConcurrent: 1 });
  const made = h.engine.create(plan([{ id: 'a', provider: 'codex-cli' }, { id: 'b', provider: 'codex-cli' }]));
  h.engine.start(made.workflow.id); await flush();
  assert.deepEqual(h.called, ['a']);
  const a = h.engine.get(made.workflow.id).tasks[0];
  assert.equal(h.engine.providerChanged({ id: 'run-a', workflowId: made.workflow.id, taskId: 'a', dispatchId: a.dispatchId,
    provider: 'codex-cli', status: 'timeout', processStatus: 'timeout', taskStatus: 'incomplete', exitCode: null }), true);
  await flush();
  assert.deepEqual(h.called, ['a', 'b']);
  assert.equal(h.engine.get(made.workflow.id).tasks[0].status, 'timeout');
});

test('maxAttempts=2 prevents a third provider dispatch after repeated scheduler ticks', async (t) => {
  const h = await setup(t);
  const made = h.engine.create(plan([{ id: 'a', maxAttempts: 2 }]));
  h.engine.start(made.workflow.id); await flush();
  h.engine.settle(made.workflow.id, 'a', { status: 'failed', error: 'first failure' }); await flush();
  assert.equal(h.called.length, 1);
  assert.equal(h.engine.retry(made.workflow.id, 'a').ok, true); await flush();
  h.engine.settle(made.workflow.id, 'a', { status: 'failed', error: 'second failure' }); await flush();
  for (let i = 0; i < 20; i++) h.engine.schedule();
  assert.equal(h.called.length, 2);
  assert.equal(h.engine.get(made.workflow.id).tasks[0].attempt, 2);
  assert.equal(h.engine.retry(made.workflow.id, 'a').code, 'notRetryable');
});

test('provider events persist run, workspace, process, output and terminal evidence', async (t) => {
  const h = await setup(t);
  const made = h.engine.create(plan([{ id: 'claude-task', provider: 'claude' }]));
  h.engine.start(made.workflow.id); await flush();
  const task = h.engine.get(made.workflow.id).tasks[0];
  const startedAt = Date.now() - 20;
  assert.equal(h.engine.providerChanged({ id: 'claude-run-1', workflowId: made.workflow.id, taskId: task.id, dispatchId: task.dispatchId,
    provider: 'claude', status: 'running', processStatus: 'running', pid: 77, startedAt, worktreePath: 'C:/tmp/claude-wt', branch: 'myoffice/test' }), true);
  assert.equal(h.engine.providerChanged({ id: 'claude-run-1', workflowId: made.workflow.id, taskId: task.id, dispatchId: task.dispatchId,
    provider: 'claude', status: 'completed', processStatus: 'completed', taskStatus: 'success', pid: 77, startedAt,
    endedAt: startedAt + 15, exitCode: 0, worktreePath: 'C:/tmp/claude-wt', branch: 'myoffice/test', result: 'frontend tests passed', output: 'claude output' }), true);
  const saved = h.engine.get(made.workflow.id).tasks[0];
  assert.equal(saved.status, 'completed');
  assert.equal(saved.runId, 'claude-run-1');
  assert.equal(saved.runs.length, 1);
  assert.deepEqual({ workflowId: saved.runs[0].workflowId, taskId: saved.runs[0].taskId, runId: saved.runs[0].runId,
    provider: saved.runs[0].provider, workingDirectory: saved.runs[0].workingDirectory, worktreePath: saved.runs[0].worktreePath,
    branchName: saved.runs[0].branchName, attemptNumber: saved.runs[0].attemptNumber, processId: saved.runs[0].processId,
    startedAt: saved.runs[0].startedAt, completedAt: saved.runs[0].completedAt, exitCode: saved.runs[0].exitCode,
    outputRef: saved.runs[0].outputRef }, { workflowId: made.workflow.id, taskId: 'claude-task', runId: 'claude-run-1', provider: 'claude',
    workingDirectory: '', worktreePath: 'C:/tmp/claude-wt', branchName: 'myoffice/test', attemptNumber: 1, processId: 77,
    startedAt, completedAt: startedAt + 15, exitCode: 0, outputRef: 'claude-run-1' });
  assert.equal(saved.runs[0].output, 'claude output');
  assert.equal(saved.attempts[0].taskStatus, 'completed');
});

test('stale provider events cannot overwrite a retried task', async (t) => {
  const h = await setup(t);
  const made = h.engine.create(plan([{ id: 'a', provider: 'codex-cli', maxAttempts: 2 }]));
  h.engine.start(made.workflow.id); await flush();
  const first = h.engine.get(made.workflow.id).tasks[0];
  h.engine.settle(made.workflow.id, 'a', { status: 'failed', runId: 'old-run', dispatchId: first.dispatchId });
  h.engine.retry(made.workflow.id, 'a'); await flush();
  const second = h.engine.get(made.workflow.id).tasks[0];
  assert.notEqual(first.dispatchId, second.dispatchId);
  assert.equal(h.engine.providerChanged({ id: 'old-run', workflowId: made.workflow.id, taskId: 'a', dispatchId: first.dispatchId,
    provider: 'codex-cli', status: 'completed', taskStatus: 'success' }), false);
  assert.equal(h.engine.get(made.workflow.id).tasks[0].status, 'running');
});

test('cancellation during provider startup cancels the eventual run once', async (t) => {
  let finishDispatch; const cancelled = [];
  const h = await setup(t, { dispatch: (_w, task) => new Promise((resolve) => { finishDispatch = () => resolve({ ok: true, runId: 'run-a', dispatchId: task.dispatchId }); }),
    cancel: (provider, runId) => { cancelled.push([provider, runId]); return true; } });
  const made = h.engine.create(plan([{ id: 'a', provider: 'codex-cli' }]));
  h.engine.start(made.workflow.id); await flush();
  assert.equal(h.engine.cancelTask(made.workflow.id, 'a').ok, true);
  finishDispatch(); await flush();
  assert.deepEqual(cancelled, [['codex-cli', 'run-a']]);
  assert.equal(h.engine.get(made.workflow.id).tasks[0].status, 'cancelled');
});

test('recovery interrupts active runs, blocks dependents, and retains correlated run history', async (t) => {
  const h = await setup(t);
  const made = h.engine.create(plan([{ id: 'active', provider: 'codex-cli' }, { id: 'later', dependsOn: ['active'] }]));
  h.engine.start(made.workflow.id); await flush();
  const task = h.engine.get(made.workflow.id).tasks[0];
  h.engine.providerChanged({ id: 'run-active', workflowId: made.workflow.id, taskId: 'active', dispatchId: task.dispatchId,
    provider: 'codex-cli', status: 'running', processStatus: 'running', pid: 1234, startedAt: Date.now(), worktreePath: 'C:/tmp/wt' });
  assert.ok(h.engine.get(made.workflow.id).tasks[0].claimExpiresAt);
  h.engine.persist(); h.engine.dispose();
  const recovered = createWorkflows({ file: h.file });
  t.after(() => recovered.dispose());
  const w = recovered.get(made.workflow.id);
  assert.equal(w.tasks.find((x) => x.id === 'active').status, 'interrupted');
  assert.equal(w.tasks.find((x) => x.id === 'later').status, 'blocked');
  assert.equal(w.tasks.find((x) => x.id === 'active').runs[0].runId, 'run-active');
  recovered.schedule();
  assert.equal(h.called.length, 1);
  assert.equal(w.status, 'interrupted');
  assert.equal(w.events.some((e) => e.eventType === 'task.interrupted'), true);
});

test('duplicate provider completion cannot dispatch a task twice', async (t) => {
  const h = await setup(t);
  const made = h.engine.create(plan([{ id: 'a', provider: 'codex-cli' }])); h.engine.start(made.workflow.id); await flush();
  const task = h.engine.get(made.workflow.id).tasks[0];
  const run = { workflowId: made.workflow.id, taskId: 'a', dispatchId: task.dispatchId, id: 'run-a', provider: 'codex-cli',
    status: 'completed', processStatus: 'completed', taskStatus: 'success', messages: [{ text: 'done' }] };
  assert.equal(h.engine.providerChanged(run), true);
  assert.equal(h.engine.providerChanged(run), false);
  await flush();
  assert.deepEqual(h.called, ['a']);
  assert.equal(h.engine.get(made.workflow.id).tasks[0].status, 'completed');
});
