import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createCapabilityRegistry } from '../../server/control/capability-registry.mjs';
import { createControlManager } from '../../server/control/control-manager.mjs';

test('Agent Control Center: Lifecycle, Dispatch, Steer, Cancel & Recovery', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-test-'));
  const storePath = path.join(tmpDir, 'control-state.json');

  const mockAdapters = new Map([
    ['claude-code', {
      detectAgent: () => ({
        detected: true,
        installed: true,
        configured: true,
        executable_path: 'claude.cmd',
        status: 'FUNCTIONALLY_VERIFIED',
      }),
    }],
    ['codex-cli', {
      detectAgent: () => ({
        detected: true,
        installed: true,
        configured: true,
        executable_path: 'codex.cmd',
        status: 'FUNCTIONALLY_VERIFIED',
      }),
    }],
    ['codex-app', {
      detectAgent: () => ({
        detected: true,
        installed: null,
        configured: true,
        status: 'CONFIGURED',
      }),
    }],
  ]);

  const registry = createCapabilityRegistry({ adapters: mockAdapters });

  const ingestedEvents = [];
  const mockTaskAggregator = {
    ingest: (e) => ingestedEvents.push(e),
    getTask: (id) => ({ taskId: id, status: 'running', title: 'Mock Live Task' }),
  };

  const stoppedTasks = [];
  const mockTasksRunner = {
    start: ({ dir, text }) => ({
      ok: true,
      task: { id: `claude-task-${Date.now()}`, dir, text },
    }),
    stop: (id) => {
      stoppedTasks.push(id);
      return true;
    },
  };

  const stoppedCodexRuns = [];
  const mockCodexRuns = {
    start: async ({ dir, text }) => ({
      ok: true,
      id: `codex-run-${Date.now()}`,
      dir,
      text,
    }),
    stop: (id) => {
      stoppedCodexRuns.push(id);
      return true;
    },
  };

  const control = createControlManager({
    capabilityRegistry: registry,
    taskAggregator: mockTaskAggregator,
    tasksRunner: mockTasksRunner,
    codexRuns: mockCodexRuns,
    storePath,
    knownDirs: [tmpDir, process.cwd()],
  });

  let claudeExec = null;
  let codexExec = null;

  await t.test('Dispatch Claude Code task creates execution, updates session & notifies TaskAggregator', async () => {
    const res = await control.dispatchTask({
      agentId: 'claude-code',
      workingDirectory: tmpDir,
      instruction: 'Refactor authentication module',
    });

    assert.equal(res.execution.agentId, 'claude-code');
    assert.equal(res.execution.status, 'running');
    assert.equal(res.execution.instruction, 'Refactor authentication module');
    assert.ok(res.execution.executionId);
    assert.ok(res.execution.taskId);
    claudeExec = res.execution;

    // Check TaskAggregator ingestion
    const dispEvent = ingestedEvents.find((e) => e.taskId === claudeExec.taskId);
    assert.ok(dispEvent);
    assert.equal(dispEvent.provider, 'claude-code');
    assert.equal(dispEvent.label, 'Refactor authentication module');
  });

  await t.test('Dispatch Codex CLI task creates separate isolated execution', async () => {
    const res = await control.dispatchTask({
      agentId: 'codex-cli',
      workingDirectory: tmpDir,
      instruction: 'Execute database migrations',
    });

    assert.equal(res.execution.agentId, 'codex-cli');
    assert.equal(res.execution.status, 'running');
    codexExec = res.execution;
    assert.notEqual(codexExec.executionId, claudeExec.executionId);
    assert.notEqual(codexExec.sessionId, claudeExec.sessionId);
  });

  await t.test('Dispatch to unsupported provider (Codex App) is rejected fail-closed', async () => {
    await assert.rejects(
      async () => {
        await control.dispatchTask({
          agentId: 'codex-app',
          workingDirectory: tmpDir,
          instruction: 'Automate GUI',
        });
      },
      /desktop GUI application/
    );
  });

  await t.test('Send follow-up instruction to Claude session works', async () => {
    const res = await control.sendFollowUp(claudeExec.sessionId, 'Also write comprehensive unit tests');
    assert.equal(res.ok, true);
    const steerEvent = ingestedEvents.find((e) => e.label.includes('write comprehensive unit tests'));
    assert.ok(steerEvent);
  });

  await t.test('Send follow-up to Codex CLI session is rejected (unsupported steer)', async () => {
    await assert.rejects(
      async () => {
        await control.sendFollowUp(codexExec.sessionId, 'Change batch arguments');
      },
      /does not support mid-session follow-up/
    );
  });

  await t.test('Cancel Claude execution stops task and records terminal state', async () => {
    const res = await control.cancelExecution(claudeExec.executionId, 'User requested cancel');
    assert.equal(res.ok, true);
    assert.equal(res.status, 'cancelled');
    assert.ok(stoppedTasks.includes(claudeExec.taskId));

    const updated = control.getExecution(claudeExec.executionId);
    assert.equal(updated.status, 'cancelled');
    assert.equal(updated.error, 'User requested cancel');
  });

  await t.test('Retry cancelled Claude execution creates new linked attempt', async () => {
    const retried = await control.retryExecution(claudeExec.executionId);
    assert.ok(retried.execution);
    assert.equal(retried.execution.status, 'running');
    assert.equal(retried.execution.retryOf, claudeExec.executionId);
    assert.equal(retried.execution.instruction, claudeExec.instruction);
  });

  await t.test('Persistence & Restart: State restores cleanly with executions and sessions', () => {
    // Re-instantiate control manager pointing to existing storePath
    const reloaded = createControlManager({
      capabilityRegistry: registry,
      taskAggregator: mockTaskAggregator,
      storePath,
      knownDirs: [tmpDir],
    });

    const execs = reloaded.listExecutions();
    assert.ok(execs.length >= 3);
    const restoredClaude = reloaded.getExecution(claudeExec.executionId);
    assert.equal(restoredClaude.status, 'cancelled');
    assert.equal(restoredClaude.agentId, 'claude-code');
  });

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

