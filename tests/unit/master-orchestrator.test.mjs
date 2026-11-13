import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createMasterOrchestrator } from '../../server/orchestration/engine/master-orchestrator.mjs';

test('Master Orchestrator: Multi-Agent DAG Coordination, Parallel Execution & Recovery', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'master-orch-test-'));
  const storePath = path.join(tmpDir, 'master-orchestration.json');

  const executedDispatches = [];
  const executionsStore = new Map();

  const mockControlManager = {
    dispatchTask: async ({ agentId, workingDirectory, instruction, sessionId }) => {
      const executionId = `mock-exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const rec = {
        executionId,
        agentId,
        workingDirectory,
        instruction,
        sessionId,
        status: 'running',
        result: `Executed instruction on ${agentId}`,
      };
      executionsStore.set(executionId, rec);
      executedDispatches.push(rec);

      // Transition to succeeded automatically after a short tick
      setTimeout(() => {
        rec.status = 'succeeded';
      }, 50);

      return { execution: rec };
    },
    getExecution: (id) => executionsStore.get(id) || null,
    cancelExecution: async (id, reason) => {
      const e = executionsStore.get(id);
      if (e) {
        e.status = 'cancelled';
        e.error = reason;
      }
      return { ok: true };
    },
  };

  const mockCapabilityRegistry = {
    isOperationAllowed: (agentId) => {
      if (agentId === 'claude-code' || agentId === 'codex-cli') return { allowed: true };
      return { allowed: false, reason: 'Provider cannot start tasks' };
    },
  };

  const orchestrator = createMasterOrchestrator({
    controlManager: mockControlManager,
    capabilityRegistry: mockCapabilityRegistry,
    storePath,
    maxConcurrentSubtasks: 2,
  });

  let createdMaster = null;

  await t.test('Creates Master Task with valid DAG subtasks', () => {
    // 3 Subtasks: s1 (Architect), s2 (Backend), s3 (Verify). s2 depends on s1, s3 depends on s2.
    createdMaster = orchestrator.createMasterTask({
      title: 'Full Stack Service Overhaul',
      description: 'Refactor database, add API endpoints and integration tests',
      workingDirectory: tmpDir,
      subtasks: [
        {
          subtaskId: 'subtask-1',
          title: 'Architecture Blueprint',
          instruction: 'Design DB schema and REST contracts',
          assignedProvider: 'claude-code',
          dependencies: [],
          priority: 2,
        },
        {
          subtaskId: 'subtask-2',
          title: 'Database Migration',
          instruction: 'Apply schema migration script',
          assignedProvider: 'codex-cli',
          dependencies: ['subtask-1'],
          priority: 1,
        },
        {
          subtaskId: 'subtask-3',
          title: 'Integration Test Suite',
          instruction: 'Verify endpoints against DB migration',
          assignedProvider: 'claude-code',
          dependencies: ['subtask-2'],
          priority: 1,
        },
      ],
    });

    assert.ok(createdMaster.masterTaskId);
    assert.equal(createdMaster.status, 'ready');
    assert.equal(createdMaster.subtasks.length, 3);
  });

  await t.test('Starts orchestration: executes sequential & parallel dependencies honestly', async () => {
    await orchestrator.startMasterTask(createdMaster.masterTaskId);

    // Initial state: subtask-1 should be dispatching/running, subtasks 2 and 3 waiting
    let mt = orchestrator.getMasterTask(createdMaster.masterTaskId);
    assert.equal(mt.status, 'running');
    const s1 = mt.subtasks.find((s) => s.subtaskId === 'subtask-1');
    assert.ok(['dispatching', 'running', 'succeeded'].includes(s1.status));

    // Wait for full orchestration DAG completion
    let maxWait = 25;
    while (maxWait-- > 0) {
      await new Promise((r) => setTimeout(r, 100));
      mt = orchestrator.getMasterTask(createdMaster.masterTaskId);
      if (mt.status === 'succeeded') break;
    }

    assert.equal(mt.status, 'succeeded');
    assert.equal(mt.progress.succeeded, 3);
    assert.equal(mt.progress.percentage, 100);
    assert.ok(mt.result);
    assert.equal(mt.result.completedSubtasks, 3);
  });

  await t.test('Server Restart & Persistence: Re-hydrates state and completed history', () => {
    const reloadedOrchestrator = createMasterOrchestrator({
      controlManager: mockControlManager,
      capabilityRegistry: mockCapabilityRegistry,
      storePath,
    });

    const restored = reloadedOrchestrator.getMasterTask(createdMaster.masterTaskId);
    assert.ok(restored);
    assert.equal(restored.status, 'succeeded');
    assert.equal(restored.subtasks.length, 3);
    assert.equal(restored.progress.succeeded, 3);
  });

  await t.test('Failed dependency propagation: downstream tasks are marked blocked', async () => {
    // Create master with failing task
    const failingMaster = orchestrator.createMasterTask({
      title: 'Failing Pipeline Test',
      workingDirectory: tmpDir,
      subtasks: [
        {
          subtaskId: 'fail-1',
          title: 'Failing Step',
          instruction: 'Fail this immediately',
          assignedProvider: 'claude-code',
          dependencies: [],
        },
        {
          subtaskId: 'dependent-2',
          title: 'Dependent Step',
          instruction: 'Should be blocked',
          assignedProvider: 'codex-cli',
          dependencies: ['fail-1'],
        },
      ],
    });

    // Manually mark fail-1 as failed
    const stFail = failingMaster.subtasks.find((s) => s.subtaskId === 'fail-1');
    stFail.status = 'failed';
    stFail.error = 'Fatal execution error';

    await orchestrator.startMasterTask(failingMaster.masterTaskId);

    const mt = orchestrator.getMasterTask(failingMaster.masterTaskId);
    assert.equal(mt.status, 'failed');
    const dep2 = mt.subtasks.find((s) => s.subtaskId === 'dependent-2');
    assert.equal(dep2.status, 'blocked');
    assert.match(dep2.error, /Dependencies failed/);
  });

  await t.test('QA Quality Gate blocks Master Task succeeded status until gate resolves', async () => {
    const { createReviewEngine } = await import('../../server/orchestration/qa/review-engine.mjs');
    const qaEngine = createReviewEngine({ maxReviewIterations: 3 });

    const orchWithQa = createMasterOrchestrator({
      controlManager: mockControlManager,
      capabilityRegistry: mockCapabilityRegistry,
      qaReviewEngine: qaEngine,
    });

    const mt = orchWithQa.createMasterTask({
      title: 'QA Gate Gated Task',
      subtasks: [
        { subtaskId: 'st-audit-1', title: 'Implementation', assignedProvider: 'claude-code', dependencies: [] },
      ],
    });

    // Mark subtask succeeded
    mt.subtasks[0].status = 'succeeded';

    // Conduct review with failing functional tests
    await qaEngine.conductReview({
      masterTaskId: mt.masterTaskId,
      subtaskId: 'st-audit-1',
      implementationAgent: 'claude-code',
      testResults: { command: 'npm test', exitCode: 1, total: 5, passed: 4, failed: 1 },
      staticResults: {
        typecheck: { status: 'passed', errorCount: 0 },
        lint: { status: 'passed', errorCount: 0 },
      },
    });

    // Refresh state: QA Gate must block and set status to remediation_required
    const blockedMt = orchWithQa.refreshMasterTaskState(mt.masterTaskId);
    assert.strictEqual(blockedMt.status, 'remediation_required');
    assert.strictEqual(blockedMt.qualityGates.passed, false);
    assert.strictEqual(blockedMt.error.includes('Quality Gates unresolved'), true);

    // Now re-verify remediation with all passing tests
    const reviewId = blockedMt.qualityGates.gates ? qaEngine.listReviews({ masterTaskId: mt.masterTaskId })[0].reviewId : null;
    await qaEngine.reverifyRemediation({
      reviewId,
      newTestResults: { command: 'npm test', exitCode: 0, total: 5, passed: 5, failed: 0 },
      newStaticResults: {
        typecheck: { status: 'passed', errorCount: 0 },
        lint: { status: 'passed', errorCount: 0 },
      },
    });

    // Refresh state again: QA Gate now passes, and Master Task achieves succeeded!
    const passedMt = orchWithQa.refreshMasterTaskState(mt.masterTaskId);
    assert.strictEqual(passedMt.status, 'succeeded');
    assert.strictEqual(passedMt.qualityGates.passed, true);
    assert.strictEqual(passedMt.result.qualitySignOff.passed, true);
  });

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
