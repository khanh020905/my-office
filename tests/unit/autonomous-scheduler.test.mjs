/**
 * Autonomous Scheduler Unit Tests.
 * Verifies autonomous plan decomposition, concurrency bounds enforcement,
 * failure classification, self-healing remediation with exponential backoff,
 * loop breaker invariants (identical signature recurrence, max attempts cap),
 * quality gate integration, and persistence.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createAutonomousScheduler } from '../../server/autonomous/autonomous-scheduler.mjs';
import { createPolicyEngine } from '../../server/autonomous/policy-engine.mjs';
import { createRecoveryBudgetManager } from '../../server/autonomous/recovery-budget.mjs';
import { createEmergencyStopManager } from '../../server/autonomous/emergency-stop.mjs';
import {
  AUTONOMY_LEVELS,
  EXECUTION_STATES,
  APPROVAL_STATUSES,
  INTERVENTION_REASONS,
  SELF_HEALING_STRATEGIES,
} from '../../server/autonomous/contracts.mjs';

describe('Autonomous Scheduler: Concurrency Bounds, Self-Healing & Failure Detection', () => {
  let tmpDir;
  let schedulerStorePath;
  let policyStorePath;
  let budgetStorePath;
  let estopStorePath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-test-'));
    schedulerStorePath = path.join(tmpDir, 'scheduler-state.json');
    policyStorePath = path.join(tmpDir, 'policy-state.json');
    budgetStorePath = path.join(tmpDir, 'budget-state.json');
    estopStorePath = path.join(tmpDir, 'estop-state.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function transitionToRunning(scheduler, taskId) {
    scheduler.setTaskExecutionState(taskId, EXECUTION_STATES.PLANNING);
    scheduler.setTaskExecutionState(taskId, EXECUTION_STATES.POLICY_EVALUATING);
    scheduler.setTaskExecutionState(taskId, EXECUTION_STATES.DISPATCHING);
    scheduler.setTaskExecutionState(taskId, EXECUTION_STATES.RUNNING);
  }

  test('Decomposes plan, respects emergency stop, and enforces concurrency bounds', async () => {
    const policy = createPolicyEngine({ storePath: policyStorePath });
    policy.setAutonomyLevel(AUTONOMY_LEVELS.supervised);

    const budget = createRecoveryBudgetManager({
      storePath: budgetStorePath,
      initialLimits: {
        maxConcurrentSubtasks: 1, // concurrency cap of 1
      },
    });

    const estop = createEmergencyStopManager({ storePath: estopStorePath });

    const scheduler = createAutonomousScheduler({
      storePath: schedulerStorePath,
      policyEngine: policy,
      budgetManager: budget,
      emergencyStop: estop,
    });

    // 1. Create plan
    const plan = scheduler.createAutonomousPlan({
      title: 'Build Autonomous Verification Suite',
      description: 'End-to-end autonomous test pipeline',
    });

    assert.ok(plan.masterTaskId);
    assert.equal(plan.subtasks.length, 3);
    assert.equal(scheduler.getExecutionState(plan.masterTaskId), EXECUTION_STATES.PLANNING);

    // 2. Start first task - consumes concurrency slot 1
    const runRes1 = await scheduler.startAutonomousExecution(plan.masterTaskId);
    assert.equal(runRes1.ok, true);
    assert.equal(scheduler.getExecutionState(plan.masterTaskId), EXECUTION_STATES.RUNNING);

    // 3. Second task attempting to start hits concurrency bound (cap is 1)
    const plan2 = scheduler.createAutonomousPlan({ title: 'Secondary Task' });
    const runRes2 = await scheduler.startAutonomousExecution(plan2.masterTaskId);
    assert.equal(runRes2.ok, false);
    assert.equal(runRes2.reason, INTERVENTION_REASONS.CONCURRENCY_LIMIT_REACHED);
    assert.equal(scheduler.getExecutionState(plan2.masterTaskId), EXECUTION_STATES.PAUSED);

    // 4. Complete first task's subtask, releasing concurrency
    scheduler.handleSubtaskCompletion(plan.masterTaskId, plan.subtasks[0].subtaskId, { costUsd: 0.05 });

    // Now second task can acquire concurrency
    const runRes2Retry = await scheduler.startAutonomousExecution(plan2.masterTaskId);
    assert.equal(runRes2Retry.ok, true);

    // 5. Emergency stop immediately blocks execution
    await estop.triggerEmergencyStop({ reason: 'Trip test' });
    const plan3 = scheduler.createAutonomousPlan({ title: 'Blocked Task' });
    const runRes3 = await scheduler.startAutonomousExecution(plan3.masterTaskId);
    assert.equal(runRes3.ok, false);
    assert.equal(runRes3.reason, INTERVENTION_REASONS.EMERGENCY_STOP_TRIGGERED);
  });

  test('Classifies failure types into appropriate self-healing strategies', async () => {
    const policy = createPolicyEngine({ storePath: policyStorePath });
    const scheduler = createAutonomousScheduler({
      storePath: schedulerStorePath,
      policyEngine: policy,
    });

    const taskId = 'mt-classify-1';
    transitionToRunning(scheduler, taskId);

    // 1. Transient / Timeout failure -> RETRY_WITH_BACKOFF
    const resTransient = await scheduler.triggerSelfHealing(
      taskId,
      'sub-transient',
      new Error('fetch ETIMEDOUT: connection to agent backend timed out')
    );
    assert.equal(resTransient.remediated, true);
    assert.equal(resTransient.strategy, SELF_HEALING_STRATEGIES.RETRY_WITH_BACKOFF);

    // 2. Provider limitation -> SWITCH_PROVIDER
    const resProvider = await scheduler.triggerSelfHealing(
      taskId,
      'sub-provider',
      new Error('Tool operation not allowed by provider capability')
    );
    assert.equal(resProvider.remediated, true);
    assert.equal(resProvider.strategy, SELF_HEALING_STRATEGIES.SWITCH_PROVIDER);

    // 3. Git dirty / conflict -> GIT_WORKTREE_ROLLBACK
    const resGit = await scheduler.triggerSelfHealing(
      taskId,
      'sub-git',
      new Error('git conflict: uncommitted changes in worktree prevent merge')
    );
    assert.equal(resGit.remediated, true);
    assert.equal(resGit.strategy, SELF_HEALING_STRATEGIES.GIT_WORKTREE_ROLLBACK);

    // 4. Syntax / Test assertion -> DIAGNOSTIC_FIX
    const resDiagnostic = await scheduler.triggerSelfHealing(
      taskId,
      'sub-diagnostic',
      new Error('AssertionError: expected true but received false')
    );
    assert.equal(resDiagnostic.remediated, true);
    assert.equal(resDiagnostic.strategy, SELF_HEALING_STRATEGIES.DIAGNOSTIC_FIX);
  });

  test('Loop breaker: 3 identical consecutive error signatures halt loop and escalate to human approval', async () => {
    const policy = createPolicyEngine({ storePath: policyStorePath });
    const scheduler = createAutonomousScheduler({
      storePath: schedulerStorePath,
      policyEngine: policy,
    });

    const taskId = 'mt-loop-1';
    const subtaskId = 'sub-loop-auth';
    transitionToRunning(scheduler, taskId);

    const recurringError = 'OAuthTokenExpired: refresh token has been revoked by auth server';

    // Attempt 1: self-healing retry
    const res1 = await scheduler.triggerSelfHealing(taskId, subtaskId, recurringError);
    assert.equal(res1.remediated, true);
    assert.equal(res1.attemptNumber, 1);

    // Attempt 2: self-healing retry with exponential backoff
    const res2 = await scheduler.triggerSelfHealing(taskId, subtaskId, recurringError);
    assert.equal(res2.remediated, true);
    assert.equal(res2.attemptNumber, 2);
    assert(res2.backoffMs > res1.backoffMs);

    // Attempt 3: Loop Breaker kicks in due to 3 consecutive identical failure signatures
    const res3 = await scheduler.triggerSelfHealing(taskId, subtaskId, recurringError);
    assert.equal(res3.remediated, false);
    assert.equal(res3.escalated, true);
    assert.equal(res3.reason, INTERVENTION_REASONS.EXECUTION_LOOP_DETECTED);
    assert.equal(res3.strategy, SELF_HEALING_STRATEGIES.ESCALATE_TO_HUMAN);

    // Task state changed to AWAITING_APPROVAL
    assert.equal(scheduler.getExecutionState(taskId), EXECUTION_STATES.AWAITING_APPROVAL);

    // Policy Engine registered human approval request
    const pendingApprovals = policy.listApprovals({ taskId, status: APPROVAL_STATUSES.PENDING });
    assert.equal(pendingApprovals.length, 1);
    assert.equal(pendingApprovals[0].payload.loopBreakerTriggered, true);
  });

  test('Subtask max remediation limit stops endless retries and triggers intervention', async () => {
    const policy = createPolicyEngine({ storePath: policyStorePath });
    const scheduler = createAutonomousScheduler({
      storePath: schedulerStorePath,
      policyEngine: policy,
      selfHealingPolicy: {
        defaultMaxRemediationAttemptsPerSubtask: 3,
      },
    });

    const taskId = 'mt-cap-1';
    const subtaskId = 'sub-cap-1';
    transitionToRunning(scheduler, taskId);

    // 3 distinct failures
    await scheduler.triggerSelfHealing(taskId, subtaskId, 'Error variant A: DNS lookup failed');
    await scheduler.triggerSelfHealing(taskId, subtaskId, 'Error variant B: Socket timeout');
    await scheduler.triggerSelfHealing(taskId, subtaskId, 'Error variant C: Host unreachable');

    // 4th attempt exceeds max limit (3)
    const res4 = await scheduler.triggerSelfHealing(taskId, subtaskId, 'Error variant D: Connection reset');
    assert.equal(res4.remediated, false);
    assert.equal(res4.escalated, true);
    assert.equal(res4.reason, INTERVENTION_REASONS.MAX_REMEDIATION_EXCEEDED);
    assert.equal(scheduler.getExecutionState(taskId), EXECUTION_STATES.AWAITING_APPROVAL);
  });

  test('Integrates with Quality Gate Engine to block completion when mandatory gates fail', () => {
    const scheduler = createAutonomousScheduler({
      storePath: schedulerStorePath,
    });

    const taskId = 'mt-gate-test';
    const mockFailingGates = {
      evaluateGates: () => ({
        passed: false,
        blockers: ['Critical security finding: API key leak in file index.js'],
        gates: {
          functional: { passed: true },
          staticQuality: { passed: true },
          security: { passed: false, blocker: 'API key leak' },
        },
      }),
    };

    const schedulerWithGates = createAutonomousScheduler({
      storePath: schedulerStorePath,
      qualityGateEngine: mockFailingGates,
    });
    transitionToRunning(schedulerWithGates, taskId);

    const checkFailed = schedulerWithGates.evaluateTaskGates(taskId, [], []);
    assert.equal(checkFailed.ok, false);
    assert.equal(checkFailed.passed, false);
    assert.equal(schedulerWithGates.getExecutionState(taskId), EXECUTION_STATES.SELF_HEALING);

    // Mock passing QA Gate Engine
    const mockPassingGates = {
      evaluateGates: () => ({
        passed: true,
        blockers: [],
        gates: {
          functional: { passed: true },
          staticQuality: { passed: true },
          security: { passed: true },
        },
      }),
    };

    const schedulerWithPassingGates = createAutonomousScheduler({
      storePath: schedulerStorePath,
      qualityGateEngine: mockPassingGates,
    });
    transitionToRunning(schedulerWithPassingGates, taskId);

    const checkPassed = schedulerWithPassingGates.evaluateTaskGates(taskId, [], []);
    assert.equal(checkPassed.ok, true);
    assert.equal(checkPassed.passed, true);
    assert.equal(schedulerWithPassingGates.getExecutionState(taskId), EXECUTION_STATES.COMPLETED);
  });

  test('State, interventions and remediation history persist across scheduler restarts', async () => {
    const policy = createPolicyEngine({ storePath: policyStorePath });
    const scheduler1 = createAutonomousScheduler({
      storePath: schedulerStorePath,
      policyEngine: policy,
    });

    const taskId = 'mt-persist-1';
    transitionToRunning(scheduler1, taskId);
    await scheduler1.triggerSelfHealing(taskId, 'sub-p1', 'Temporary glitch');

    // Create a new instance reading same persisted store
    const scheduler2 = createAutonomousScheduler({
      storePath: schedulerStorePath,
      policyEngine: policy,
    });

    assert.equal(scheduler2.getExecutionState(taskId), EXECUTION_STATES.RUNNING);
    const history = scheduler2.getRemediationHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0].masterTaskId, taskId);
    assert.equal(history[0].subtaskId, 'sub-p1');
    assert.equal(history[0].strategy, SELF_HEALING_STRATEGIES.RETRY_WITH_BACKOFF);
  });
});
