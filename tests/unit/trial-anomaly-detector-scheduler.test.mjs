import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ALERT_SEVERITIES,
  ALERT_CODES,
  HEALTH_STATUSES,
  createEmptyTelemetrySnapshot,
} from '../../server/trial-monitor/trial-contracts.mjs';
import {
  createTrialAnomalyDetector,
  TrialAnomalyDetector,
} from '../../server/trial-monitor/trial-anomaly-detector.mjs';
import {
  createTrialScheduler,
  TrialScheduler,
} from '../../server/trial-monitor/trial-scheduler.mjs';

describe('Trial Anomaly Detector & Scheduler (Phase 5.1)', () => {
  describe('Trial Anomaly Detector', () => {
    let detector;

    beforeEach(() => {
      detector = createTrialAnomalyDetector();
    });

    it('instantiates cleanly with default thresholds and read-only flag', () => {
      assert.ok(detector instanceof TrialAnomalyDetector);
      assert.equal(detector.isReadOnly, true);
      const thresholds = detector.getThresholds();
      assert.equal(thresholds.stallThresholdMs, 300000);
      assert.equal(thresholds.p95LatencyMs, 15000);
      assert.equal(thresholds.budgetWarningPct, 70);
      assert.equal(thresholds.approvalAgingMs, 15 * 60 * 1000);
    });

    it('strictly enforces read-only invariant and throws on prohibited mutations', () => {
      assert.throws(() => detector.dispatchTask(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => detector.cancelExecution(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => detector.retryExecution(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => detector.terminateProcessSafely(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => detector.triggerEmergencyStop(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => detector.resolveApproval(), /READ_ONLY_INVARIANT_VIOLATION/);
    });

    it('evaluates a completely healthy snapshot as healthy with 0 alerts', () => {
      const snap = createEmptyTelemetrySnapshot({
        overallStatus: HEALTH_STATUSES.HEALTHY,
        systemHealth: { nodeProcess: { pid: process.pid } },
        safety: {
          emergencyStop: { halted: false, state: 'idle' },
          budget: { isExhausted: false, costUtilizationPct: 25 },
          approvals: { agingCount: 0, pendingList: [] },
        },
        reliability: {
          wal: { corruptRecordsCount: 0, sequence: 10 },
          processes: { orphans: 0, reassigned: 0, running: 2 },
          backups: { lastBackupStatus: 'verified_restore_ok' },
          idempotency: { activeLocks: 0, conflicts: 0 },
        },
        agentHealth: {
          providers: {
            'codex-cli': { id: 'codex-cli', status: 'healthy', lastHeartbeat: Date.now() },
          },
          executions: { stalled: 0, activeList: [] },
          latency: { p95Ms: 1200 },
        },
        orchestrationState: {
          dag: { retryRate: 0.02 },
        },
      });

      const evalResult = detector.evaluate(snap);
      assert.equal(evalResult.totalAlerts, 0);
      assert.equal(evalResult.highestSeverity, null);
      assert.equal(evalResult.overallHealth, HEALTH_STATUSES.HEALTHY);
    });

    describe('SEV-1 Critical Emergencies', () => {
      it('detects Emergency Stop tripped as SEV-1', () => {
        const snap = createEmptyTelemetrySnapshot({
          safety: {
            emergencyStop: {
              halted: true,
              state: 'tripped',
              reason: 'Safety policy violation: file written outside sandbox',
              trippedBy: 'AutonomousPolicyEngine',
              trippedAt: Date.now(),
            },
          },
        });

        const evalResult = detector.evaluate(snap);
        assert.equal(evalResult.highestSeverity, ALERT_SEVERITIES.SEV_1);
        assert.equal(evalResult.overallHealth, HEALTH_STATUSES.CRITICAL);
        const estopAlert = evalResult.alerts.find(a => a.code === ALERT_CODES.EMERGENCY_STOP_TRIPPED);
        assert.ok(estopAlert);
        assert.equal(estopAlert.severity, 'SEV-1');
        assert.ok(estopAlert.recommendedAction.includes('Emergency Stop is active'));
      });

      it('detects unauthorized file access as SEV-1', () => {
        const snap = createEmptyTelemetrySnapshot({
          safety: {
            qualityGates: { unauthorizedAccessCount: 2 },
          },
        });

        const evalResult = detector.evaluate(snap);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.UNAUTHORIZED_FILE_ACCESS);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-1');
        assert.ok(alert.recommendedAction.includes('sandbox boundary'));
      });

      it('detects unverified process signaling (reassigned PID) as SEV-1', () => {
        const snap = createEmptyTelemetrySnapshot({
          reliability: {
            processes: { reassigned: 1, orphans: 0 },
          },
        });

        const evalResult = detector.evaluate(snap);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.UNVERIFIED_PROCESS_SIGNALING);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-1');
        assert.ok(alert.recommendedAction.includes('Process Identity Safety'));
      });

      it('detects data corruption as SEV-1', () => {
        const snap = createEmptyTelemetrySnapshot({
          reliability: {
            wal: { dataCorruption: true, corruptRecordsCount: 5 },
          },
        });

        const evalResult = detector.evaluate(snap);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.DATA_CORRUPTION);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-1');
        assert.ok(alert.recommendedAction.includes('disaster recovery restore'));
      });
    });

    describe('SEV-2 High Severity Incidents', () => {
      it('detects orphan processes as SEV-2', () => {
        const snap = createEmptyTelemetrySnapshot({
          reliability: {
            processes: { orphans: 3 },
          },
        });

        const evalResult = detector.evaluate(snap);
        assert.equal(evalResult.highestSeverity, ALERT_SEVERITIES.SEV_2);
        assert.equal(evalResult.overallHealth, HEALTH_STATUSES.CRITICAL);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.ORPHAN_PROCESS_DETECTED);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-2');
        assert.equal(alert.evidence.orphanCount, 3);
      });

      it('detects critical WAL corrupt records as SEV-2', () => {
        const snap = createEmptyTelemetrySnapshot({
          reliability: {
            wal: { corruptRecordsCount: 1, sequence: 104 },
          },
        });

        const evalResult = detector.evaluate(snap);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.WAL_CORRUPT_RECORD);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-2');
        assert.equal(alert.evidence.corruptRecordsCount, 1);
      });

      it('detects budget exhaustion breach as SEV-2', () => {
        const snap = createEmptyTelemetrySnapshot({
          safety: {
            budget: {
              isExhausted: true,
              costUtilizationPct: 100,
              totalCostUsd: 10.0,
              maxCostUsd: 10.0,
              remainingCostUsd: 0.0,
            },
          },
        });

        const evalResult = detector.evaluate(snap);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.BUDGET_EXHAUSTION_BREACH);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-2');
        assert.ok(alert.recommendedAction.includes('Autonomous subtasks suspended'));
      });

      it('detects unexpected duplicate executions as SEV-2', () => {
        const snap = createEmptyTelemetrySnapshot({
          reliability: {
            idempotency: { conflicts: 2, activeLocks: 1 },
          },
        });

        const evalResult = detector.evaluate(snap);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.UNEXPECTED_DUPLICATE_EXECUTION);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-2');
        assert.equal(alert.evidence.conflicts, 2);
      });
    });

    describe('SEV-3 Medium Severity Degradations', () => {
      it('detects provider outage as SEV-3', () => {
        const snap = createEmptyTelemetrySnapshot({
          agentHealth: {
            providers: {
              'claude-code': { id: 'claude-code', name: 'Claude Code CLI', status: 'down' },
            },
          },
        });

        const evalResult = detector.evaluate(snap);
        assert.equal(evalResult.highestSeverity, ALERT_SEVERITIES.SEV_3);
        assert.equal(evalResult.overallHealth, HEALTH_STATUSES.DEGRADED);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.PROVIDER_OUTAGE);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-3');
        assert.ok(alert.affectedTarget.includes('Claude Code CLI'));
      });

      it('detects provider heartbeat missing as SEV-3', () => {
        const now = Date.now();
        const snap = createEmptyTelemetrySnapshot({
          timestamp: now,
          agentHealth: {
            providers: {
              'codex-cli': {
                id: 'codex-cli',
                name: 'Codex CLI',
                status: 'healthy',
                lastHeartbeat: now - 300000, // 5 minutes ago (> 2m threshold)
              },
            },
          },
        });

        const evalResult = detector.evaluate(snap);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.HEARTBEAT_MISSING);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-3');
        assert.ok(alert.affectedTarget.includes('Codex CLI'));
      });

      it('detects stalled task (> 300s) as SEV-3', () => {
        const snap = createEmptyTelemetrySnapshot({
          agentHealth: {
            executions: {
              stalled: 1,
              activeList: [{
                executionId: 'exec-stalled-001',
                agentId: 'codex',
                status: 'stalled',
                durationMs: 350000,
                stalled: true,
              }],
            },
          },
        });

        const evalResult = detector.evaluate(snap);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.STALLED_TASK);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-3');
        assert.equal(alert.affectedTarget, 'Execution:exec-stalled-001');
      });

      it('detects excessive retry loop as SEV-3', () => {
        const snap = createEmptyTelemetrySnapshot({
          orchestrationState: {
            dag: { retryRate: 0.45 }, // > 0.25 threshold
          },
        });

        const evalResult = detector.evaluate(snap);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.EXCESSIVE_RETRY_LOOP);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-3');
        assert.equal(alert.evidence.retryRate, 0.45);
      });

      it('detects backup verification failure as SEV-3', () => {
        const snap = createEmptyTelemetrySnapshot({
          reliability: {
            backups: {
              lastBackupId: 'backup-1234',
              lastBackupStatus: 'verification_failed',
            },
          },
        });

        const evalResult = detector.evaluate(snap);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.BACKUP_VERIFICATION_FAILURE);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-3');
        assert.equal(alert.evidence.lastBackupStatus, 'verification_failed');
      });
    });

    describe('SEV-4 Low / Advisory Notices', () => {
      it('detects performance latency degradation (p95 > 15s) as SEV-4', () => {
        const snap = createEmptyTelemetrySnapshot({
          agentHealth: {
            latency: { p95Ms: 18500, sampleCount: 40 },
          },
        });

        const evalResult = detector.evaluate(snap);
        assert.equal(evalResult.highestSeverity, ALERT_SEVERITIES.SEV_4);
        assert.equal(evalResult.overallHealth, HEALTH_STATUSES.DEGRADED);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.LATENCY_DEGRADATION);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-4');
        assert.equal(alert.evidence.p95Ms, 18500);
      });

      it('detects budget warning (> 70%) as SEV-4', () => {
        const snap = createEmptyTelemetrySnapshot({
          safety: {
            budget: {
              isExhausted: false,
              costUtilizationPct: 82.5,
              totalCostUsd: 8.25,
              maxCostUsd: 10.0,
            },
          },
        });

        const evalResult = detector.evaluate(snap);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.BUDGET_WARNING);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-4');
        assert.equal(alert.evidence.costUtilizationPct, 82.5);
      });

      it('detects pending approval aging (> 15m) as SEV-4', () => {
        const snap = createEmptyTelemetrySnapshot({
          safety: {
            approvals: {
              agingCount: 1,
              pendingList: [{
                approvalId: 'appr-001',
                actionType: 'deploy',
                ageMinutes: 20,
                isAging: true,
              }],
            },
          },
        });

        const evalResult = detector.evaluate(snap);
        const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.PENDING_APPROVAL_AGING);
        assert.ok(alert);
        assert.equal(alert.severity, 'SEV-4');
        assert.equal(alert.evidence.agingCount, 1);
      });
    });
  });

  describe('Trial Scheduler', () => {
    let tempDir;
    let storePath;
    let mockCollector;
    let detector;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-sched-test-'));
      storePath = path.join(tempDir, 'trial-state.json');

      mockCollector = {
        isReadOnly: true,
        collectSnapshot: async () => {
          return createEmptyTelemetrySnapshot({
            overallStatus: HEALTH_STATUSES.HEALTHY,
            systemHealth: { nodeProcess: { pid: process.pid } },
            agentHealth: {
              executions: { stalled: 0, activeList: [] },
              latency: { p95Ms: 1200 },
            },
            safety: {
              emergencyStop: { halted: false },
              budget: { isExhausted: false, costUtilizationPct: 15 },
              approvals: { agingCount: 0, pendingList: [] },
            },
            reliability: {
              processes: { orphans: 0, reassigned: 0 },
              wal: { corruptRecordsCount: 0 },
              backups: { lastBackupStatus: 'verified_restore_ok' },
            },
          });
        },
      };

      detector = createTrialAnomalyDetector();
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    });

    it('samples snapshots, evaluates anomalies, and persists state to disk', async () => {
      const scheduler = createTrialScheduler({
        collector: mockCollector,
        anomalyDetector: detector,
        storePath,
        intervalMs: 60000,
      });

      assert.equal(scheduler.isReadOnly, true);
      const res = await scheduler.sampleNow();
      assert.ok(res.snapshot);
      assert.ok(res.evaluation);
      assert.equal(scheduler.snapshots.length, 1);
      assert.equal(scheduler.stats.totalSamples, 1);

      // Verify file persisted on disk
      assert.ok(fs.existsSync(storePath));
      const onDisk = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      assert.equal(onDisk.snapshots.length, 1);
      assert.equal(onDisk.stats.totalSamples, 1);
    });

    it('detects telemetry gap during polling loop when interval is delayed', async () => {
      let virtualNow = 1000000;
      const scheduler = createTrialScheduler({
        collector: mockCollector,
        anomalyDetector: detector,
        storePath,
        intervalMs: 60000,
        now: () => virtualNow,
      });

      // Sample 1 at t=1,000,000
      await scheduler.sampleNow();
      assert.equal(scheduler.gaps.length, 0);

      // Advance time by 300,000ms (5 intervals elapsed, expecting 1) -> gap!
      virtualNow += 300000;
      const res2 = await scheduler.sampleNow();
      assert.ok(res2.gap);
      assert.equal(res2.gap.missedIntervals, 4); // 5 intervals - 1 expected = 4 missed
      assert.equal(scheduler.gaps.length, 1);
      assert.equal(scheduler.stats.totalGaps, 1);
    });

    it('detects telemetry gap and restores state upon server restart', async () => {
      const t1 = 1000000000;
      // Scheduler 1 runs before reboot
      const sched1 = createTrialScheduler({
        collector: mockCollector,
        anomalyDetector: detector,
        storePath,
        intervalMs: 60000,
        now: () => t1,
      });
      await sched1.sampleNow();
      sched1.stop();

      // Verify state saved
      assert.ok(fs.existsSync(storePath));

      // Server reboot occurs: 10 minutes (600,000ms) pass before restart
      const t2 = t1 + 600000;
      const sched2 = createTrialScheduler({
        collector: mockCollector,
        anomalyDetector: detector,
        storePath,
        intervalMs: 60000,
        now: () => t2,
      });

      // sched2 should have restored state from disk and detected server restart downtime gap
      assert.equal(sched2.snapshots.length, 1);
      assert.equal(sched2.gaps.length, 1);
      assert.ok(sched2.gaps[0].reason.includes('Server restart'));
      assert.equal(sched2.gaps[0].missedIntervals, 10);
      assert.equal(sched2.stats.totalGaps, 1);
    });

    it('strictly enforces read-only invariant and forbids state mutation attempts', () => {
      const scheduler = createTrialScheduler({
        collector: mockCollector,
        anomalyDetector: detector,
        storePath,
      });

      assert.throws(() => scheduler.dispatchTask(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => scheduler.cancelExecution(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => scheduler.retryExecution(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => scheduler.terminateProcessSafely(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => scheduler.triggerEmergencyStop(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => scheduler.repairState(), /READ_ONLY_INVARIANT_VIOLATION/);
    });

    it('provides query methods: getStatus, listSnapshots, listAlerts, listGaps', async () => {
      let virtualNow = 2000000;
      const scheduler = createTrialScheduler({
        collector: mockCollector,
        anomalyDetector: detector,
        storePath,
        intervalMs: 60000,
        now: () => virtualNow,
      });

      await scheduler.sampleNow();
      virtualNow += 60000;
      await scheduler.sampleNow();

      const status = scheduler.getStatus();
      assert.equal(status.totalSamples, 2);
      assert.equal(status.isReadOnly, true);

      const snapshots = scheduler.listSnapshots({ limit: 1 });
      assert.equal(snapshots.length, 1);

      const alerts = scheduler.listAlerts();
      assert.ok(Array.isArray(alerts));

      const gaps = scheduler.listGaps();
      assert.ok(Array.isArray(gaps));
    });

    it('integrates seamlessly with real TrialCollector and persists live snapshot', async () => {
      const { createTrialCollector } = await import('../../server/trial-monitor/trial-collector.mjs');
      const realCollector = createTrialCollector();
      const scheduler = createTrialScheduler({
        collector: realCollector,
        anomalyDetector: detector,
        storePath,
        intervalMs: 60000,
      });

      const res = await scheduler.sampleNow();
      assert.ok(res.snapshot);
      assert.equal(res.snapshot.readOnlyInvariant, true);
      assert.ok(res.snapshot.systemHealth.nodeProcess.pid > 0);
      assert.ok(res.evaluation);
      assert.equal(scheduler.snapshots.length, 1);
      assert.equal(scheduler.isReadOnly, true);
    });
  });
});

