/**
 * Autonomous Policy Engine Unit Tests.
 * Verifies autonomy level enforcement (readonly, assisted, supervised, autonomous),
 * approval request lifecycle (create, list, resolve, expire, cancel),
 * budget & concurrency enforcement integration, and persistence.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createPolicyEngine } from '../../server/autonomous/policy-engine.mjs';
import { createRecoveryBudgetManager } from '../../server/autonomous/recovery-budget.mjs';
import {
  AUTONOMY_LEVELS,
  APPROVAL_STATUSES,
  APPROVAL_ACTION_TYPES,
  INTERVENTION_REASONS,
} from '../../server/autonomous/contracts.mjs';

describe('Autonomous Policy Engine: Autonomy Levels, Approvals & Budget Enforcement', () => {
  let tmpDir;
  let policyStorePath;
  let budgetStorePath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-engine-test-'));
    policyStorePath = path.join(tmpDir, 'policy-state.json');
    budgetStorePath = path.join(tmpDir, 'budget-state.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('Default autonomy level is supervised and level transitions are audited', () => {
    const engine = createPolicyEngine({ storePath: policyStorePath });

    assert.equal(engine.getAutonomyLevel(), AUTONOMY_LEVELS.supervised);

    // Transition to readonly
    const resReadonly = engine.setAutonomyLevel(AUTONOMY_LEVELS.readonly, 'admin-user');
    assert.equal(resReadonly.ok, true);
    assert.equal(engine.getAutonomyLevel(), AUTONOMY_LEVELS.readonly);

    // Rejects invalid autonomy level
    assert.throws(
      () => engine.setAutonomyLevel('unrestricted_god_mode', 'hacker'),
      /Invalid autonomy level/
    );

    // Transition to autonomous
    const resAuto = engine.setAutonomyLevel(AUTONOMY_LEVELS.autonomous, 'ops-lead');
    assert.equal(resAuto.ok, true);
    assert.equal(engine.getAutonomyLevel(), AUTONOMY_LEVELS.autonomous);

    // Verify audit trail contains level changes
    const audit = engine.getAuditTrail();
    const changes = audit.filter((e) => e.type === 'autonomy_level_changed');
    assert.equal(changes.length, 2);
    assert.equal(changes[0].actor, 'admin-user');
    assert.equal(changes[0].details.newLevel, AUTONOMY_LEVELS.readonly);
    assert.equal(changes[1].actor, 'ops-lead');
    assert.equal(changes[1].details.newLevel, AUTONOMY_LEVELS.autonomous);
  });

  test('Enforces autonomy level action boundaries across all 4 modes', () => {
    const engine = createPolicyEngine({ storePath: policyStorePath });

    // 1. READONLY mode: write/edit actions require approval, read-only passes
    engine.setAutonomyLevel(AUTONOMY_LEVELS.readonly);
    const roRead = engine.evaluateAction({
      actionType: APPROVAL_ACTION_TYPES.CODE_EDIT,
      context: { isReadOnly: true },
    });
    assert.equal(roRead.allowed, true);

    const roWrite = engine.evaluateAction({
      actionType: APPROVAL_ACTION_TYPES.CODE_EDIT,
      context: { isReadOnly: false },
      title: 'Modify index.html',
    });
    assert.equal(roWrite.allowed, false);
    assert.equal(roWrite.requiresApproval, true);
    assert.ok(roWrite.approvalRequest);

    // 2. ASSISTED mode: every mutation step requires approval
    engine.setAutonomyLevel(AUTONOMY_LEVELS.assisted);
    const assistedWrite = engine.evaluateAction({
      actionType: APPROVAL_ACTION_TYPES.TOOL_INVOKE,
      context: { tool: 'run_command' },
    });
    assert.equal(assistedWrite.allowed, false);
    assert.equal(assistedWrite.requiresApproval, true);
    assert.equal(assistedWrite.reason, INTERVENTION_REASONS.ASSISTED_STEP_APPROVAL_REQUIRED);

    // 3. SUPERVISED mode: non-destructive routine edits auto-approved; destructive operations require approval
    engine.setAutonomyLevel(AUTONOMY_LEVELS.supervised);
    const supSafe = engine.evaluateAction({
      actionType: APPROVAL_ACTION_TYPES.CODE_EDIT,
      context: { isDestructive: false },
    });
    assert.equal(supSafe.allowed, true);
    assert.equal(supSafe.requiresApproval, false);

    const supDestructive = engine.evaluateAction({
      actionType: APPROVAL_ACTION_TYPES.DESTRUCTIVE_OPERATION,
      context: { isDestructive: true },
      title: 'Database cleanup',
    });
    assert.equal(supDestructive.allowed, false);
    assert.equal(supDestructive.requiresApproval, true);

    // 4. AUTONOMOUS mode: auto-approves routine actions, guards security & budget overrides
    engine.setAutonomyLevel(AUTONOMY_LEVELS.autonomous);
    const autoSafe = engine.evaluateAction({
      actionType: APPROVAL_ACTION_TYPES.CODE_EDIT,
      context: {},
    });
    assert.equal(autoSafe.allowed, true);

    const autoEscalation = engine.evaluateAction({
      actionType: APPROVAL_ACTION_TYPES.PERMISSION_GRANT,
      context: { isPermissionEscalation: true },
    });
    assert.equal(autoEscalation.allowed, false);
    assert.equal(autoEscalation.requiresApproval, true);
  });

  test('Human approval request lifecycle: create, list, resolve, and expire', () => {
    let mockTime = 100000;
    const nowFn = () => mockTime;

    const engine = createPolicyEngine({ storePath: policyStorePath, now: nowFn });

    // Create approval
    const appr1 = engine.createApproval({
      taskId: 'task-100',
      actionType: APPROVAL_ACTION_TYPES.CODE_EDIT,
      title: 'Approval for file write',
      description: 'Agent requested to edit config.json',
      expiresAt: mockTime + 10000,
    });

    assert.equal(appr1.status, APPROVAL_STATUSES.PENDING);
    assert.equal(appr1.taskId, 'task-100');

    // List pending approvals
    const pendingList = engine.listApprovals({ status: APPROVAL_STATUSES.PENDING });
    assert.equal(pendingList.length, 1);
    assert.equal(pendingList[0].approvalId, appr1.approvalId);

    // Resolve: Approve
    const resolvedApprove = engine.resolveApproval(appr1.approvalId, {
      action: 'approve',
      reason: 'Reviewed diff, looks safe.',
      resolvedBy: 'developer-jane',
    });

    assert.equal(resolvedApprove.status, APPROVAL_STATUSES.APPROVED);
    assert.equal(resolvedApprove.resolvedBy, 'developer-jane');

    // Cannot re-resolve already resolved approval
    assert.throws(
      () => engine.resolveApproval(appr1.approvalId, { action: 'reject' }),
      /already resolved/
    );

    // Create second approval and reject it
    const appr2 = engine.createApproval({
      taskId: 'task-100',
      actionType: APPROVAL_ACTION_TYPES.COMMAND_EXEC,
      title: 'Approval for shell exec',
      expiresAt: mockTime + 10000,
    });

    const resolvedReject = engine.resolveApproval(appr2.approvalId, {
      action: 'reject',
      reason: 'Command is unsafe in staging environment.',
      resolvedBy: 'lead-dev',
    });
    assert.equal(resolvedReject.status, APPROVAL_STATUSES.REJECTED);

    // Create third approval and verify expiration
    const appr3 = engine.createApproval({
      taskId: 'task-200',
      actionType: APPROVAL_ACTION_TYPES.CODE_EDIT,
      expiresAt: mockTime + 5000,
    });

    // Advance time past expiration
    mockTime += 6000;
    const expiredAppr = engine.getApproval(appr3.approvalId);
    assert.equal(expiredAppr.status, APPROVAL_STATUSES.EXPIRED);

    // Cancel remaining pending approvals for a task
    const appr4 = engine.createApproval({
      taskId: 'task-300',
      actionType: APPROVAL_ACTION_TYPES.CODE_EDIT,
      expiresAt: mockTime + 50000,
    });
    assert.equal(appr4.status, APPROVAL_STATUSES.PENDING);

    const cancelledCount = engine.cancelApprovalsForTask('task-300', 'Task aborted by user');
    assert.equal(cancelledCount, 1);
    assert.equal(engine.getApproval(appr4.approvalId).status, APPROVAL_STATUSES.CANCELLED);
  });

  test('Integrates RecoveryBudgetManager and blocks actions when budget or concurrency is exceeded', () => {
    const budget = createRecoveryBudgetManager({
      storePath: budgetStorePath,
      initialLimits: {
        maxSubtasks: 5,
        maxCostUsd: 1.50,
        maxConcurrentSubtasks: 2,
        maxExecutions: 10,
      },
    });

    const engine = createPolicyEngine({
      storePath: policyStorePath,
      budgetManager: budget,
    });

    // Normal safe action within budget
    const check1 = engine.evaluateAction({
      actionType: APPROVAL_ACTION_TYPES.CODE_EDIT,
      context: { projectedCostUsd: 0.10, projectedSubtasks: 1 },
    });
    assert.equal(check1.allowed, true);

    // Action exceeding cost limit
    const checkCostBreach = engine.evaluateAction({
      actionType: APPROVAL_ACTION_TYPES.CODE_EDIT,
      context: { projectedCostUsd: 2.00 }, // exceeds 1.50 limit
    });
    assert.equal(checkCostBreach.allowed, false);
    assert.equal(checkCostBreach.blockedBy, 'budget');
    assert.equal(checkCostBreach.reason, INTERVENTION_REASONS.BUDGET_EXHAUSTED);
    assert(checkCostBreach.reasons.some((r) => r.includes('Cost limit reached')));

    // Action exceeding concurrency limit
    const checkConcurrencyBreach = engine.evaluateAction({
      actionType: APPROVAL_ACTION_TYPES.CODE_EDIT,
      context: { projectedConcurrency: 3 }, // exceeds 2 concurrent
    });
    assert.equal(checkConcurrencyBreach.allowed, false);
    assert.equal(checkConcurrencyBreach.blockedBy, 'budget');
    assert.equal(checkConcurrencyBreach.reason, INTERVENTION_REASONS.CONCURRENCY_LIMIT_REACHED);

    // Record usage to exhaust subtask budget
    budget.recordUsage({ subtasks: 5, costUsd: 1.00 });
    assert.equal(budget.isExhausted(), true);

    const checkExhausted = engine.evaluateAction({
      actionType: APPROVAL_ACTION_TYPES.CODE_EDIT,
      context: { projectedSubtasks: 1 },
    });
    assert.equal(checkExhausted.allowed, false);
    assert.equal(checkExhausted.reason, INTERVENTION_REASONS.BUDGET_EXHAUSTED);
  });

  test('Policy configuration and approvals state persist across instances', () => {
    const engine1 = createPolicyEngine({ storePath: policyStorePath });
    engine1.setAutonomyLevel(AUTONOMY_LEVELS.assisted, 'operator-persist');

    const appr = engine1.createApproval({
      taskId: 'task-persist',
      actionType: APPROVAL_ACTION_TYPES.TOOL_INVOKE,
      title: 'Persisted approval',
    });

    // Create a new instance pointing to same file
    const engine2 = createPolicyEngine({ storePath: policyStorePath });
    assert.equal(engine2.getAutonomyLevel(), AUTONOMY_LEVELS.assisted);

    const fetched = engine2.getApproval(appr.approvalId);
    assert.ok(fetched);
    assert.equal(fetched.title, 'Persisted approval');
    assert.equal(fetched.status, APPROVAL_STATUSES.PENDING);
  });
});
