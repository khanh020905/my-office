/**
 * Fault-Injection Unit Tests: Startup Reconciliation & Disaster Recovery.
 * Covers:
 * - Scenario 3: Restart after dispatch but before provider acknowledgement (outcome_unknown blocks blind redispatch).
 * - Scenario 7: Emergency Stop during multiple active provider executions.
 * - Scenario 9: Budget exhaustion during self-healing remediation.
 * - Scenario 14: Isolated restore from backup with integrity validation in sandboxed temp directory.
 * - Scenario 15: QA Critical finding during Autonomous Mode (mandatory QA gate blocks completion).
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createReconciliationEngine } from '../../server/reliability/reconciliation.mjs';
import { createProcessSupervisor } from '../../server/reliability/process-supervisor.mjs';
import { createBackupManager } from '../../server/reliability/backup-manager.mjs';
import { createEmergencyStopManager } from '../../server/autonomous/emergency-stop.mjs';
import { createRecoveryBudgetManager } from '../../server/autonomous/recovery-budget.mjs';
import { createAutonomousScheduler } from '../../server/autonomous/autonomous-scheduler.mjs';
import { createPolicyEngine } from '../../server/autonomous/policy-engine.mjs';
import {
  RECONCILIATION_OUTCOMES,
  reconciliationRequiresIntervention,
} from '../../server/reliability/contracts.mjs';
import {
  AUTONOMY_LEVELS,
  EXECUTION_STATES,
} from '../../server/autonomous/contracts.mjs';

describe('Phase 5 Reliability: Reconciliation & Disaster Recovery Fault Injection', () => {
  let tmpDir;
  let supervisorStore;
  let reconciliationStore;
  let backupDataDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconciliation-test-'));
    supervisorStore = path.join(tmpDir, 'processes.json');
    reconciliationStore = path.join(tmpDir, 'reconciliation-report.json');
    backupDataDir = path.join(tmpDir, 'data');
    fs.mkdirSync(backupDataDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('Scenario 3: Restart after dispatch before provider acknowledgement -> outcome_unknown blocks blind redispatch', () => {
    // 1. Process supervisor has NO process fingerprint recorded because server rebooted right after dispatch before provider PID was acknowledged
    const supervisor = createProcessSupervisor({
      storePath: supervisorStore,
      osInspector: () => null,
    });

    const mockControlManager = {
      listExecutions: () => [
        {
          executionId: 'exec-unacked-101',
          agentId: 'claude-code',
          status: 'dispatching', // dispatch requested, but never acknowledged with PID before crash
          taskId: 'subtask-1',
          result: null,
        },
      ],
      getExecution: (id) => ({
        executionId: id,
        agentId: 'claude-code',
        status: 'dispatching',
        result: null,
      }),
    };

    const reconciliation = createReconciliationEngine({
      processSupervisor: supervisor,
      controlManager: mockControlManager,
      storePath: reconciliationStore,
    });

    // 2. Perform startup reconciliation
    const report = reconciliation.runReconciliation();

    assert.equal(report.totalScanned, 1);
    assert.equal(report.outcomeUnknownCount, 1);
    assert.equal(report.records.length, 1);

    const audited = report.records[0];
    assert.equal(audited.executionId, 'exec-unacked-101');
    assert.equal(audited.outcome, RECONCILIATION_OUTCOMES.OUTCOME_UNKNOWN);
    assert.equal(audited.requiresIntervention, true);

    // Invariant: Blind redispatch is strictly forbidden
    assert.equal(reconciliationRequiresIntervention(audited.outcome), true);
  });

  test('Scenario 7: Emergency Stop during multiple active provider executions dispatches cancellation and tracks confirmation', async () => {
    const estopStore = path.join(tmpDir, 'emergency-stop.json');

    let claudeStopped = false;
    let codexStopped = false;

    const mockTasksRunner = {
      list: () => [{ id: 'claude-task-1', sid: 'sess-1', stopped: claudeStopped }],
      stop: () => {
        claudeStopped = true;
        return true; // immediate confirmation
      },
      get: (id) => ({ id, stopped: claudeStopped }),
    };

    const mockCodexRuns = {
      list: () => [{ id: 'codex-run-2', status: codexStopped ? 'cancelled' : 'running' }],
      stop: () => {
        codexStopped = true;
        return true; // immediate confirmation
      },
      get: (id) => ({ id, status: codexStopped ? 'cancelled' : 'running' }),
    };

    const estop = createEmergencyStopManager({
      storePath: estopStore,
      tasksRunner: mockTasksRunner,
      codexRuns: mockCodexRuns,
    });

    // Instantaneous emergency stop
    const result = await estop.triggerEmergencyStop({
      triggeredBy: 'operator-fault-injection',
      reason: 'Anomaly detected during cross-provider executions',
    });

    assert.equal(result.ok, true);
    assert.equal(estop.isHalted(), true);

    const status = estop.getStatus();
    assert.equal(status.cancellationsSummary.total, 2);
    assert.equal(status.cancellationsSummary.confirmed, 2);
    assert.equal(status.cancellationsSummary.requested, 0);
    assert.equal(status.cancellationsSummary.allConfirmed, true);
  });

  test('Scenario 9: Budget exhaustion during self-healing remediation pauses execution and halts loops', async () => {
    const policyStore = path.join(tmpDir, 'policy.json');
    const budgetStore = path.join(tmpDir, 'budget.json');
    const schedulerStore = path.join(tmpDir, 'scheduler.json');

    const policy = createPolicyEngine({ storePath: policyStore });
    policy.setAutonomyLevel(AUTONOMY_LEVELS.autonomous);

    // Strict tight budget: max 1 remediation attempt before exhaustion
    const budget = createRecoveryBudgetManager({
      storePath: budgetStore,
      initialLimits: {
        maxExecutions: 2,
        maxCostUsd: 0.10,
      },
    });

    const scheduler = createAutonomousScheduler({
      storePath: schedulerStore,
      policyEngine: policy,
      budgetManager: budget,
      selfHealingPolicy: {
        defaultMaxTotalRemediationsPerTask: 1,
      },
    });

    const taskId = 'mt-budget-exhaust';
    scheduler.setTaskExecutionState(taskId, EXECUTION_STATES.PLANNING);
    scheduler.setTaskExecutionState(taskId, EXECUTION_STATES.POLICY_EVALUATING);
    scheduler.setTaskExecutionState(taskId, EXECUTION_STATES.DISPATCHING);
    scheduler.setTaskExecutionState(taskId, EXECUTION_STATES.RUNNING);

    // Attempt 1: succeeds and consumes remediation quota
    const res1 = await scheduler.triggerSelfHealing(taskId, 'sub-1', 'Network timeout');
    assert.equal(res1.remediated, true);

    // Attempt 2: hits global task remediation cap (1), pausing and escalating to human
    const res2 = await scheduler.triggerSelfHealing(taskId, 'sub-1', 'Second timeout');
    assert.equal(res2.remediated, false);
    assert.equal(res2.escalated, true);
    assert.equal(res2.reason, 'budget_exhausted');
  });

  test('Scenario 14: Isolated restore from backup with SHA-256 integrity validation in sandboxed temp directory', async () => {
    // 1. Create simulated production data files
    const mockWal = path.join(backupDataDir, 'reliability', 'execution-journal.wal');
    const mockControl = path.join(backupDataDir, 'control', 'control-state.json');
    fs.mkdirSync(path.dirname(mockWal), { recursive: true });
    fs.mkdirSync(path.dirname(mockControl), { recursive: true });

    fs.writeFileSync(mockWal, '{"seq":0,"eventType":"INIT","checksum":"abc"}\n', 'utf8');
    fs.writeFileSync(mockControl, JSON.stringify({ version: '1.0.0', executions: [] }), 'utf8');

    const backupMgr = createBackupManager({ dataDir: backupDataDir });

    // 2. Generate backup snapshot
    const backupManifest = await backupMgr.createBackup({
      description: 'Scheduled point-in-time snapshot before upgrade',
      triggerDryRun: false,
    });

    assert.ok(backupManifest.backupId);
    assert.ok(backupManifest.sha256);
    assert.ok(backupManifest.files);

    // 3. Perform isolated sandboxed dry-run restore
    const verifyRes = await backupMgr.dryRunRestore(backupManifest.backupId, { cleanup: true });
    assert.equal(verifyRes.ok, true);
    assert.equal(verifyRes.errors.length, 0);
    assert.ok(verifyRes.sandboxDir);

    // Ensure production data files were NOT touched or altered by the sandboxed test
    assert(fs.existsSync(mockWal));
    assert(fs.existsSync(mockControl));
  });

  test('Scenario 15: QA Critical finding during Autonomous Mode blocks task completion and requires authorization', () => {
    const schedulerStore = path.join(tmpDir, 'scheduler-qa.json');

    // Failing quality gate engine simulating detected secret leak
    const mockQAGateEngine = {
      evaluateGates: () => ({
        passed: false,
        blockers: ['[SECURITY GATE FAILED] Sensitive OpenAI API key detected in logs'],
        gates: {
          functional: { passed: true },
          staticQuality: { passed: true },
          security: { passed: false, blocker: 'API key leak' },
        },
      }),
    };

    const scheduler = createAutonomousScheduler({
      storePath: schedulerStore,
      qualityGateEngine: mockQAGateEngine,
    });

    const taskId = 'mt-qa-gate-invariant';
    scheduler.setTaskExecutionState(taskId, EXECUTION_STATES.PLANNING);
    scheduler.setTaskExecutionState(taskId, EXECUTION_STATES.POLICY_EVALUATING);
    scheduler.setTaskExecutionState(taskId, EXECUTION_STATES.DISPATCHING);
    scheduler.setTaskExecutionState(taskId, EXECUTION_STATES.RUNNING);

    // Evaluate task gates before completion
    const evalResult = scheduler.evaluateTaskGates(taskId, [], []);

    assert.equal(evalResult.ok, false);
    assert.equal(evalResult.passed, false);
    assert(evalResult.blockers[0].includes('SECURITY GATE FAILED'));

    // Invariant: task must NOT transition to COMPLETED
    assert.notEqual(scheduler.getExecutionState(taskId), EXECUTION_STATES.COMPLETED);
    assert.equal(scheduler.getExecutionState(taskId), EXECUTION_STATES.SELF_HEALING);
  });
});
