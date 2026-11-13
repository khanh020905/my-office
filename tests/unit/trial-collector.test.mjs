import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALERT_SEVERITIES,
  ALERT_SEVERITY_LIST,
  ALERT_CODES,
  createAlert,
  validateAlert,
  createTelemetryGap,
  validateTelemetryGap,
  validateTelemetrySnapshot,
  createEmptyTelemetrySnapshot,
  deepFreeze,
  assertReadOnlyCollector,
  HEALTH_STATUSES,
} from '../../server/trial-monitor/trial-contracts.mjs';
import {
  createTrialCollector,
  TrialCollector,
} from '../../server/trial-monitor/trial-collector.mjs';

describe('Trial Monitoring Contracts & Collector (Phase 5.1)', () => {
  describe('Contracts & Schemas', () => {
    it('defines SEV-1 through SEV-4 alert severities', () => {
      assert.equal(ALERT_SEVERITIES.SEV_1, 'SEV-1');
      assert.equal(ALERT_SEVERITIES.SEV_2, 'SEV-2');
      assert.equal(ALERT_SEVERITIES.SEV_3, 'SEV-3');
      assert.equal(ALERT_SEVERITIES.SEV_4, 'SEV-4');
      assert.equal(ALERT_SEVERITY_LIST.length, 4);
      assert.ok(ALERT_SEVERITY_LIST.includes('SEV-1'));
      assert.ok(ALERT_SEVERITY_LIST.includes('SEV-4'));
    });

    it('creates and validates structured alerts', () => {
      const alert = createAlert({
        severity: ALERT_SEVERITIES.SEV_1,
        code: ALERT_CODES.EMERGENCY_STOP_TRIPPED,
        affectedTarget: 'AutonomousEmergencyStop',
        evidence: { reason: 'Unauthorized write attempt to /etc/hosts' },
        recommendedAction: 'Verify safety logs and resume manually if authorized.',
      });

      assert.ok(alert.id.startsWith('alert-'));
      assert.equal(alert.severity, 'SEV-1');
      assert.equal(alert.code, 'EMERGENCY_STOP_TRIPPED');
      assert.equal(alert.affectedTarget, 'AutonomousEmergencyStop');
      assert.ok(alert.timestamp > 0);

      const check = validateAlert(alert);
      assert.equal(check.valid, true);
      assert.equal(check.errors.length, 0);
    });

    it('rejects invalid alert parameters', () => {
      assert.throws(() => {
        createAlert({
          severity: 'SEV-99', // Invalid severity
          code: 'TEST',
          affectedTarget: 'Target',
          evidence: {},
          recommendedAction: 'Fix it',
        });
      }, /Invalid alert/);
    });

    it('creates and validates telemetry gap records', () => {
      const startTime = Date.now() - 300000;
      const endTime = Date.now();
      const gap = createTelemetryGap({
        startTime,
        endTime,
        reason: 'Server restart downtime',
      });

      assert.ok(gap.id.startsWith('gap-'));
      assert.equal(gap.startTime, startTime);
      assert.equal(gap.endTime, endTime);
      assert.equal(gap.durationMs, endTime - startTime);
      assert.equal(gap.missedIntervals, 5); // 300,000ms / 60,000ms = 5 intervals
      assert.equal(gap.reason, 'Server restart downtime');

      const check = validateTelemetryGap(gap);
      assert.equal(check.valid, true);
    });

    it('creates truthful default telemetry snapshot and validates schema', () => {
      const snap = createEmptyTelemetrySnapshot();
      assert.equal(snap.readOnlyInvariant, true);
      assert.equal(snap.overallStatus, HEALTH_STATUSES.UNKNOWN);
      assert.equal(snap.systemHealth.cpu.usagePct, null); // truthfulness (not fabricated)
      assert.equal(snap.safety.autonomyLevel, 'readonly');

      const check = validateTelemetrySnapshot(snap);
      assert.equal(check.valid, true);
    });

    it('deepFreeze prevents modifications to nested properties', () => {
      const testObj = { a: 1, nested: { b: 2 } };
      deepFreeze(testObj);
      assert.ok(Object.isFrozen(testObj));
      assert.ok(Object.isFrozen(testObj.nested));
      assert.throws(() => {
        testObj.nested.b = 99;
      });
    });
  });

  describe('TrialCollector Factory & Read-Only Invariants', () => {
    it('creates collector adhering strictly to read-only invariant', () => {
      const collector = createTrialCollector();
      assert.equal(collector.isReadOnly, true);
      assert.ok(assertReadOnlyCollector(collector));

      // Attempting any mutating operation throws
      assert.throws(() => {
        collector.dispatchTask();
      }, /READ_ONLY_INVARIANT_VIOLATION/);

      assert.throws(() => {
        collector.cancelExecution();
      }, /READ_ONLY_INVARIANT_VIOLATION/);

      assert.throws(() => {
        collector.triggerEmergencyStop();
      }, /READ_ONLY_INVARIANT_VIOLATION/);

      assert.throws(() => {
        collector.setAutonomyLevel();
      }, /READ_ONLY_INVARIANT_VIOLATION/);
    });

    it('gathers real system metrics without fabrication', () => {
      const collector = createTrialCollector();
      const sys = collector.getSystemHealth();

      assert.ok(sys.uptimeSeconds >= 0);
      assert.equal(typeof sys.cpu.count, 'number');
      assert.equal(typeof sys.cpu.model, 'string');
      assert.equal(sys.cpu.usagePct, null); // truthfulness: not fabricated
      assert.ok(sys.ram.totalBytes > 0);
      assert.ok(sys.ram.freeBytes > 0);
      assert.ok(sys.ram.usagePct >= 0 && sys.ram.usagePct <= 100);
      assert.equal(sys.nodeProcess.pid, process.pid);
      assert.equal(sys.nodeProcess.version, process.version);
      assert.ok(sys.nodeProcess.memoryUsage.heapUsed > 0);
    });

    it('collects complete telemetry snapshot and freezes result', async () => {
      const mockControlManager = {
        listExecutions: () => [
          {
            executionId: 'exec-1',
            agentId: 'claude-code',
            taskId: 'task-1',
            status: 'running',
            startedAt: Date.now() - 10000,
          },
          {
            executionId: 'exec-2',
            agentId: 'codex-cli',
            taskId: 'task-2',
            status: 'completed',
          },
        ],
      };

      const mockJournal = {
        getJournalStats: () => ({
          currentSeq: 42,
          walByteSize: 1024,
          corruptRecordsCount: 0,
          lastHash: 'sha-fake',
        }),
      };

      const mockSupervisor = {
        listTrackedProcesses: () => [
          { executionId: 'exec-1', state: 'running' },
        ],
      };

      const mockEmergencyStop = {
        isHalted: () => false,
        getStatus: () => ({ halted: false, state: 'idle' }),
      };

      const mockPolicyEngine = {
        getAutonomyLevel: () => 'supervised',
        listApprovals: () => [],
      };

      const collector = createTrialCollector({
        controlManager: mockControlManager,
        journal: mockJournal,
        processSupervisor: mockSupervisor,
        emergencyStop: mockEmergencyStop,
        policyEngine: mockPolicyEngine,
      });

      const snapshot = await collector.collectSnapshot();

      assert.equal(snapshot.readOnlyInvariant, true);
      assert.equal(snapshot.overallStatus, HEALTH_STATUSES.HEALTHY);
      assert.equal(snapshot.reliability.wal.sequence, 42);
      assert.equal(snapshot.reliability.processes.running, 1);
      assert.equal(snapshot.agentHealth.executions.active, 1);
      assert.equal(snapshot.agentHealth.executions.completed, 1);
      assert.equal(snapshot.safety.autonomyLevel, 'supervised');
      assert.equal(snapshot.safety.emergencyStop.halted, false);

      // Verify returned snapshot is completely immutable
      assert.ok(Object.isFrozen(snapshot));
      assert.ok(Object.isFrozen(snapshot.systemHealth));
      assert.throws(() => {
        snapshot.overallStatus = 'critical';
      });
    });

    it('evaluates critical condition when Emergency Stop is tripped', async () => {
      const mockEmergencyStop = {
        isHalted: () => true,
        getStatus: () => ({
          halted: true,
          state: 'halted',
          reason: 'Manual emergency stop triggered by operator',
          trippedAt: Date.now(),
        }),
      };

      const collector = createTrialCollector({
        emergencyStop: mockEmergencyStop,
      });

      const snapshot = await collector.collectSnapshot();
      assert.equal(snapshot.overallStatus, HEALTH_STATUSES.CRITICAL);
      assert.ok(snapshot.issues.some((i) => i.includes('Emergency Stop active')));
    });

    it('evaluates critical condition when orphan process or WAL corrupt record is detected', async () => {
      const mockJournal = {
        getJournalStats: () => ({
          currentSeq: 10,
          walByteSize: 500,
          corruptRecordsCount: 2,
          lastHash: null,
        }),
      };

      const mockSupervisor = {
        listTrackedProcesses: () => [
          { executionId: 'exec-orphan', state: 'orphan_detected' },
        ],
      };

      const collector = createTrialCollector({
        journal: mockJournal,
        processSupervisor: mockSupervisor,
      });

      const snapshot = await collector.collectSnapshot();
      assert.equal(snapshot.overallStatus, HEALTH_STATUSES.CRITICAL);
      assert.ok(snapshot.issues.some((i) => i.includes('corrupt record')));
      assert.ok(snapshot.issues.some((i) => i.includes('orphan process')));
    });

    it('evaluates degraded condition when tasks are stalled exceeding threshold', async () => {
      const now = Date.now();
      const mockControlManager = {
        listExecutions: () => [
          {
            executionId: 'exec-stalled',
            agentId: 'claude-code',
            taskId: 'task-long',
            status: 'running',
            startedAt: now - 350000, // 350s ago (> 300s threshold)
          },
        ],
      };

      const collector = createTrialCollector({
        controlManager: mockControlManager,
        stallThresholdMs: 300000,
        now: () => now,
      });

      const snapshot = await collector.collectSnapshot();
      assert.equal(snapshot.overallStatus, HEALTH_STATUSES.DEGRADED);
      assert.equal(snapshot.agentHealth.executions.stalled, 1);
      assert.ok(snapshot.issues.some((i) => i.includes('stalled exceeding 300s')));
    });
  });
});
