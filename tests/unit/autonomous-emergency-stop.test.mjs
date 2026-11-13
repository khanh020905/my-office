/**
 * Autonomous Emergency Stop Unit Tests.
 * Verifies instantaneous system-wide halt, immediate dispatch blocking,
 * strict distinction between cancellation requested vs confirmed,
 * human operator resume authorization, and persistence.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  createEmergencyStopManager,
  EmergencyStopActiveError,
  CANCELLATION_STATUSES,
} from '../../server/autonomous/emergency-stop.mjs';
import {
  EMERGENCY_STOP_STATES,
} from '../../server/autonomous/contracts.mjs';

describe('Autonomous Emergency Stop & Immediate Dispatch Block', () => {
  let tmpDir;
  let storePath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emergency-stop-test-'));
    storePath = path.join(tmpDir, 'emergency-stop.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('Initial state is idle and allows dispatches', () => {
    const estop = createEmergencyStopManager({ storePath });

    assert.equal(estop.isHalted(), false);
    const check = estop.canDispatch();
    assert.equal(check.allowed, true);

    // assertCanDispatch does not throw
    assert.doesNotThrow(() => estop.assertCanDispatch());

    const status = estop.getStatus();
    assert.equal(status.state, EMERGENCY_STOP_STATES.IDLE);
    assert.equal(status.halted, false);
    assert.equal(status.trippedAt, null);
  });

  test('Triggering emergency stop blocks new dispatches immediately and synchronously', async () => {
    const estop = createEmergencyStopManager({ storePath });

    const result = await estop.triggerEmergencyStop({
      triggeredBy: 'operator-1',
      reason: 'Critical anomaly detected in cluster',
    });

    assert.equal(result.ok, true);
    assert.equal(estop.isHalted(), true);

    const check = estop.canDispatch();
    assert.equal(check.allowed, false);
    assert.equal(check.reason, 'EMERGENCY_STOP_ACTIVE');
    assert.equal(check.emergencyReason, 'Critical anomaly detected in cluster');
    assert.equal(check.trippedBy, 'operator-1');

    assert.throws(
      () => estop.assertCanDispatch(),
      (err) => {
        assert(err instanceof EmergencyStopActiveError);
        assert.equal(err.code, 'EMERGENCY_STOP_ACTIVE');
        assert.equal(err.trippedBy, 'operator-1');
        assert.equal(err.reason, 'Critical anomaly detected in cluster');
        return true;
      }
    );
  });

  test('Distinguishes cancellation requested vs cancellation confirmed across providers', async () => {
    // Mock active tasks runner where execution-1 stops immediately, execution-2 is pending
    let claudeStopped = false;
    const mockTasksRunner = {
      list: () => [
        { id: 'task-claude-1', sid: 'sess-1', stopped: claudeStopped },
      ],
      stop: (id) => {
        if (id === 'task-claude-1') {
          claudeStopped = true;
          return true; // immediate confirmation
        }
        return false;
      },
      get: (id) => ({ id, stopped: claudeStopped }),
    };

    // Mock codex runs where cancellation is asynchronous (stop initiates request)
    let codexStatus = 'running';
    const mockCodexRuns = {
      list: () => [
        { id: 'run-codex-2', status: codexStatus },
      ],
      stop: () => false, // returns false for immediate stop, requires async confirmation
      get: (id) => ({ id, status: codexStatus }),
    };

    const estop = createEmergencyStopManager({
      storePath,
      tasksRunner: mockTasksRunner,
      codexRuns: mockCodexRuns,
    });

    const triggerResult = await estop.triggerEmergencyStop({
      triggeredBy: 'lead-dev',
      reason: 'Security circuit breaker trip',
    });

    assert.equal(triggerResult.ok, true);
    assert.equal(triggerResult.cancellationsCount, 2);

    const status = estop.getStatus();
    assert.equal(status.halted, true);
    assert.equal(status.cancellationsSummary.total, 2);

    // claude task was immediately confirmed
    const claudeRec = status.activeExecutions.find((e) => e.taskId === 'task-claude-1');
    assert.ok(claudeRec);
    assert.equal(claudeRec.status, CANCELLATION_STATUSES.CONFIRMED);
    assert.equal(claudeRec.confirmed, true);

    // codex task was requested but not yet confirmed
    const codexRec = status.activeExecutions.find((e) => e.taskId === 'run-codex-2');
    assert.ok(codexRec);
    assert.equal(codexRec.status, CANCELLATION_STATUSES.REQUESTED);
    assert.equal(codexRec.confirmed, false);
    assert.equal(status.cancellationsSummary.confirmed, 1);
    assert.equal(status.cancellationsSummary.requested, 1);
    assert.equal(status.cancellationsSummary.allConfirmed, false);

    // Now confirm the pending codex run
    const confirmRes = estop.confirmCancellation(codexRec.executionId);
    assert.equal(confirmRes.ok, true);
    assert.equal(confirmRes.record.status, CANCELLATION_STATUSES.CONFIRMED);
    assert.equal(confirmRes.record.confirmed, true);

    const finalStatus = estop.getStatus();
    assert.equal(finalStatus.state, EMERGENCY_STOP_STATES.HALTED);
    assert.equal(finalStatus.cancellationsSummary.confirmed, 2);
    assert.equal(finalStatus.cancellationsSummary.requested, 0);
    assert.equal(finalStatus.cancellationsSummary.allConfirmed, true);
  });

  test('Resumption requires verified human authorization and valid justification', async () => {
    const estop = createEmergencyStopManager({ storePath });

    await estop.triggerEmergencyStop({
      triggeredBy: 'monitor-agent',
      reason: 'Automated anomaly threshold exceeded',
    });
    assert.equal(estop.isHalted(), true);

    // Automated subagent cannot resume
    assert.throws(
      () => estop.resumeEmergencyStop({ authorizedBy: 'agent:auto-remediator', reason: 'Attempt auto resume' }),
      /SECURITY_INVARIANT_VIOLATION/
    );
    assert.throws(
      () => estop.resumeEmergencyStop({ authorizedBy: 'autonomous-scheduler', reason: 'Attempt auto resume' }),
      /SECURITY_INVARIANT_VIOLATION/
    );

    // Cannot resume without meaningful reason
    assert.throws(
      () => estop.resumeEmergencyStop({ authorizedBy: 'human:alice', reason: '   ' }),
      /justification reason/
    );

    // Valid human resumption succeeds
    const resumeRes = estop.resumeEmergencyStop({
      authorizedBy: 'human:alice',
      reason: 'Root cause investigated and remediation patch applied.',
    });

    assert.equal(resumeRes.ok, true);
    assert.equal(resumeRes.state, EMERGENCY_STOP_STATES.IDLE);
    assert.equal(estop.isHalted(), false);
    assert.doesNotThrow(() => estop.assertCanDispatch());
  });

  test('State and event log persist cleanly and reload across restart', async () => {
    const estop1 = createEmergencyStopManager({ storePath });
    await estop1.triggerEmergencyStop({
      triggeredBy: 'human:bob',
      reason: 'Physical emergency halt pressed',
    });

    assert.equal(estop1.isHalted(), true);

    // Create fresh instance loading same persisted store
    const estop2 = createEmergencyStopManager({ storePath });
    assert.equal(estop2.isHalted(), true);
    const status = estop2.getStatus();
    assert.equal(status.trippedBy, 'human:bob');
    assert.equal(status.reason, 'Physical emergency halt pressed');
    assert.equal(status.state, EMERGENCY_STOP_STATES.HALTED);

    const events = estop2.getEventLog();
    assert(events.length >= 1);
    assert.equal(events[0].type, 'emergency_stop_triggered');
  });
});
