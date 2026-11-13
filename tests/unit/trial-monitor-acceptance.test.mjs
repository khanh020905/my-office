/**
 * Comprehensive Automated Acceptance Test Suite for Autonomous Trial Monitoring (Phase 5.1).
 * 
 * Verifies all 13 mandatory acceptance criteria:
 * 1. Monitoring while server is healthy.
 * 2. Monitoring after server restart (state persistence).
 * 3. Detection of stalled execution (> stall threshold).
 * 4. Detection of orphan process.
 * 5. Provider outage detection.
 * 6. WAL integrity failure detection.
 * 7. Backup failure detection.
 * 8. Budget threshold alert (SEV-2 / SEV-4).
 * 9. Emergency Stop alert (SEV-1).
 * 10. Telemetry gap detection (missed polling intervals).
 * 11. Daily report generation (reports/operational-trial/day-01.md).
 * 12. Final report generation (reports/operational-trial/FINAL-7-DAY-ASSESSMENT.md).
 * 13. Verify that the agent cannot mutate execution state (read-only enforcement invariant).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// Trial Monitoring Subsystem Contracts & Components
import {
  ALERT_SEVERITIES,
  ALERT_SEVERITY_LIST,
  ALERT_SEVERITY_DEFINITIONS,
  ALERT_CODES,
  HEALTH_STATUSES,
  createAlert,
  validateAlert,
  createTelemetryGap,
  validateTelemetryGap,
  validateTelemetrySnapshot,
  createEmptyTelemetrySnapshot,
  deepFreeze,
  assertReadOnlyCollector,
} from '../../server/trial-monitor/trial-contracts.mjs';

import {
  createTrialCollector,
  TrialCollector,
} from '../../server/trial-monitor/trial-collector.mjs';

import {
  createTrialAnomalyDetector,
  TrialAnomalyDetector,
} from '../../server/trial-monitor/trial-anomaly-detector.mjs';

import {
  createTrialScheduler,
  TrialScheduler,
} from '../../server/trial-monitor/trial-scheduler.mjs';

import {
  generateDailyReport,
  generateFinalAssessment,
  createTrialReportGenerator,
} from '../../server/trial-monitor/trial-report-generator.mjs';

import {
  createTrialMonitor,
  TrialMonitor,
} from '../../server/trial-monitor/trial-monitor.mjs';

describe('Trial Monitoring Swarm Acceptance Suite (Phase 5.1)', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'trial-monitor-acceptance-'));
  });

  afterEach(async () => {
    try {
      await fsp.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // ==========================================================================
  // Criterion 1: Monitoring while server is healthy
  // ==========================================================================
  describe('Criterion 1: Monitoring while server is healthy', () => {
    it('samples telemetry cleanly, passes schema validation, and detects 0 alerts in healthy state', async () => {
      const collector = createTrialCollector();
      const detector = createTrialAnomalyDetector();

      // Collect a genuine snapshot from the environment asynchronously
      const snapshot = await collector.collectSnapshot();

      // Validate snapshot integrity and read-only schema compliance
      const validation = validateTelemetrySnapshot(snapshot);
      assert.equal(validation.valid, true, `Snapshot validation errors: ${validation.errors.join(', ')}`);
      assert.equal(snapshot.readOnlyInvariant, true);
      assert.ok(snapshot.timestamp > 0);
      assert.ok(snapshot.systemHealth);
      assert.ok(snapshot.agentHealth);
      assert.ok(snapshot.orchestrationState);
      assert.ok(snapshot.reliability);
      assert.ok(snapshot.safety);

      // Create a known fully healthy baseline telemetry snapshot
      const healthySnapshot = createEmptyTelemetrySnapshot({
        overallStatus: HEALTH_STATUSES.HEALTHY,
        systemHealth: {
          uptimeSeconds: 7200,
          nodeProcess: { pid: process.pid, uptimeSeconds: 7200 },
        },
        agentHealth: {
          providers: {
            'codex-cli': { id: 'codex-cli', name: 'Codex CLI', status: 'healthy', lastHeartbeat: Date.now() },
            'claude-code': { id: 'claude-code', name: 'Claude Code', status: 'healthy', lastHeartbeat: Date.now() },
          },
          executions: { active: 1, queued: 0, stalled: 0, failed: 0, activeList: [] },
          latency: { p95Ms: 1200, sampleCount: 10 },
        },
        orchestrationState: {
          dag: { activeSubtasks: 1, failedSubtasks: 0, retryRate: 0.01 },
        },
        reliability: {
          wal: { sequence: 100, corruptRecordsCount: 0, byteSize: 4096 },
          processes: { running: 2, orphans: 0, reassigned: 0 },
          backups: { lastBackupStatus: 'verified_restore_ok', totalBackups: 3 },
          idempotency: { activeLocks: 1, conflicts: 0 },
        },
        safety: {
          autonomyLevel: 'supervised',
          emergencyStop: { halted: false, state: 'idle' },
          approvals: { pendingCount: 0, agingCount: 0, pendingList: [] },
          budget: { isExhausted: false, costUtilizationPct: 20, maxCostUsd: 100, totalCostUsd: 20 },
        },
      });

      const evaluation = detector.evaluate(healthySnapshot);
      assert.equal(evaluation.totalAlerts, 0, 'Healthy server should produce 0 alerts');
      assert.equal(evaluation.highestSeverity, null);
      assert.equal(evaluation.overallHealth, HEALTH_STATUSES.HEALTHY);

      // Verify scheduler samples and tracks the healthy snapshot
      const storePath = path.join(tempDir, 'healthy-state.json');
      const scheduler = createTrialScheduler({
        collector: {
          collectSnapshot: async () => healthySnapshot,
        },
        anomalyDetector: detector,
        storePath,
        intervalMs: 1000,
      });

      const sampled = await scheduler.sampleNow();
      assert.equal(sampled.snapshot.overallStatus, HEALTH_STATUSES.HEALTHY);
      assert.equal(sampled.evaluation.totalAlerts, 0);
      assert.equal(scheduler.snapshots.length, 1);
      assert.equal(scheduler.alerts.length, 0);
    });
  });

  // ==========================================================================
  // Criterion 2: Monitoring after server restart (state persistence)
  // ==========================================================================
  describe('Criterion 2: Monitoring after server restart (state persistence)', () => {
    it('persists telemetry state to disk and restores history and gaps upon restart', async () => {
      const storePath = path.join(tempDir, 'persistence-trial-state.json');
      let simulatedTime = 1700000000000;

      // 1. Initial server run
      const initialCollector = {
        collectSnapshot: async () => createEmptyTelemetrySnapshot({
          timestamp: simulatedTime,
          overallStatus: HEALTH_STATUSES.HEALTHY,
        }),
      };
      const detector = createTrialAnomalyDetector({ now: () => simulatedTime });

      const scheduler1 = createTrialScheduler({
        collector: initialCollector,
        anomalyDetector: detector,
        storePath,
        intervalMs: 60000,
        now: () => simulatedTime,
      });

      // Take 2 samples before restart
      await scheduler1.sampleNow();
      simulatedTime += 60000;
      await scheduler1.sampleNow();

      assert.equal(scheduler1.snapshots.length, 2);
      assert.ok(fs.existsSync(storePath), 'trial-state.json must exist on disk');

      // Stop initial scheduler (simulate server shutdown)
      scheduler1.stop();

      // 2. Simulate server downtime: 15 minutes offline
      const downtimeMs = 15 * 60 * 1000;
      simulatedTime += downtimeMs;

      // 3. Restart server and re-initialize scheduler from persisted storePath
      const scheduler2 = createTrialScheduler({
        collector: {
          collectSnapshot: async () => createEmptyTelemetrySnapshot({
            timestamp: simulatedTime,
            overallStatus: HEALTH_STATUSES.HEALTHY,
          }),
        },
        anomalyDetector: detector,
        storePath,
        intervalMs: 60000,
        now: () => simulatedTime,
      });

      // Verify state was restored from disk
      assert.equal(scheduler2.snapshots.length, 2, 'Previous snapshots should be restored across restart');
      assert.ok(scheduler2.stats.totalSamples >= 2);

      // Verify that restart downtime was detected as a telemetry gap
      assert.equal(scheduler2.gaps.length, 1, 'Server restart downtime must create a telemetry gap record');
      const restartGap = scheduler2.gaps[0];
      assert.ok(restartGap.missedIntervals >= 14);
      assert.ok(restartGap.reason.includes('Server restart downtime'));
      const gapValidation = validateTelemetryGap(restartGap);
      assert.equal(gapValidation.valid, true);

      // 4. Verify continuous monitoring resumes after restart
      await scheduler2.sampleNow();
      assert.equal(scheduler2.snapshots.length, 3, 'New sample added after restart');
      assert.equal(scheduler2.stats.totalSamples, 3);
    });
  });

  // ==========================================================================
  // Criterion 3: Detection of stalled execution (> stall threshold)
  // ==========================================================================
  describe('Criterion 3: Detection of stalled execution (> stall threshold)', () => {
    it('detects task execution exceeding 300s stall threshold and emits SEV-3 alert', () => {
      const detector = createTrialAnomalyDetector({
        thresholds: { stallThresholdMs: 300000 },
      });

      const stalledSnapshot = createEmptyTelemetrySnapshot({
        overallStatus: HEALTH_STATUSES.DEGRADED,
        agentHealth: {
          executions: {
            active: 1,
            stalled: 1,
            activeList: [
              {
                executionId: 'exec-stalled-991',
                agentId: 'agent-worker-1',
                durationMs: 345000, // 345s > 300s
                stalled: true,
              },
            ],
          },
        },
      });

      const evalResult = detector.evaluate(stalledSnapshot);

      assert.equal(evalResult.countsBySeverity[ALERT_SEVERITIES.SEV_3], 1);
      assert.equal(evalResult.highestSeverity, ALERT_SEVERITIES.SEV_3);

      const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.STALLED_TASK);
      assert.ok(alert, 'STALLED_TASK alert must be generated');
      assert.equal(alert.severity, ALERT_SEVERITIES.SEV_3);
      assert.equal(alert.affectedTarget, 'Execution:exec-stalled-991');
      assert.ok(alert.evidence.thresholdMs === 300000);
      assert.ok(alert.recommendedAction.includes('exceeded stall threshold'));

      const validation = validateAlert(alert);
      assert.equal(validation.valid, true);
    });
  });

  // ==========================================================================
  // Criterion 4: Detection of orphan process
  // ==========================================================================
  describe('Criterion 4: Detection of orphan process', () => {
    it('detects unmonitored orphan process and emits SEV-2 alert with process guidance', () => {
      const detector = createTrialAnomalyDetector();

      const orphanSnapshot = createEmptyTelemetrySnapshot({
        overallStatus: HEALTH_STATUSES.CRITICAL,
        reliability: {
          processes: {
            running: 5,
            orphans: 2, // 2 orphan processes detected
            reassigned: 0,
          },
        },
      });

      const evalResult = detector.evaluate(orphanSnapshot);

      assert.equal(evalResult.countsBySeverity[ALERT_SEVERITIES.SEV_2], 1);
      assert.equal(evalResult.highestSeverity, ALERT_SEVERITIES.SEV_2);

      const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.ORPHAN_PROCESS_DETECTED);
      assert.ok(alert, 'ORPHAN_PROCESS_DETECTED alert must be generated');
      assert.equal(alert.severity, ALERT_SEVERITIES.SEV_2);
      assert.equal(alert.affectedTarget, 'ProcessSupervisor');
      assert.equal(alert.evidence.orphanCount, 2);
      assert.ok(alert.recommendedAction.includes('Orphan process detected detached'));

      const validation = validateAlert(alert);
      assert.equal(validation.valid, true);
    });
  });

  // ==========================================================================
  // Criterion 5: Provider outage detection
  // ==========================================================================
  describe('Criterion 5: Provider outage detection', () => {
    it('detects provider outage status and heartbeat timeouts, emitting SEV-3 alerts', () => {
      const now = Date.now();
      const detector = createTrialAnomalyDetector({
        thresholds: { providerHeartbeatTimeoutMs: 120000 },
        now: () => now,
      });

      const providerOutageSnapshot = createEmptyTelemetrySnapshot({
        timestamp: now,
        overallStatus: HEALTH_STATUSES.DEGRADED,
        agentHealth: {
          providers: {
            'codex-cli': {
              id: 'codex-cli',
              name: 'Codex CLI',
              status: 'error', // Provider status outage
              lastHeartbeat: now - 30000,
            },
            'claude-code': {
              id: 'claude-code',
              name: 'Claude Code',
              status: 'healthy',
              lastHeartbeat: now - 250000, // 250s > 120s timeout
            },
          },
        },
      });

      const evalResult = detector.evaluate(providerOutageSnapshot);

      // Verify provider error status raised PROVIDER_OUTAGE
      const outageAlert = evalResult.alerts.find(a => a.code === ALERT_CODES.PROVIDER_OUTAGE);
      assert.ok(outageAlert, 'PROVIDER_OUTAGE alert must be generated');
      assert.equal(outageAlert.severity, ALERT_SEVERITIES.SEV_3);
      assert.equal(outageAlert.affectedTarget, 'Provider:Codex CLI');
      assert.equal(validateAlert(outageAlert).valid, true);

      // Verify missing heartbeat raised HEARTBEAT_MISSING
      const heartbeatAlert = evalResult.alerts.find(a => a.code === ALERT_CODES.HEARTBEAT_MISSING);
      assert.ok(heartbeatAlert, 'HEARTBEAT_MISSING alert must be generated');
      assert.equal(heartbeatAlert.severity, ALERT_SEVERITIES.SEV_3);
      assert.equal(heartbeatAlert.affectedTarget, 'Provider:Claude Code');
      assert.ok(heartbeatAlert.evidence.heartbeatAgeMs >= 250000);
      assert.equal(validateAlert(heartbeatAlert).valid, true);
    });
  });

  // ==========================================================================
  // Criterion 6: WAL integrity failure detection
  // ==========================================================================
  describe('Criterion 6: WAL integrity failure detection', () => {
    it('detects corrupt records in write-ahead log and emits SEV-2 alert', () => {
      const detector = createTrialAnomalyDetector();

      const walCorruptSnapshot = createEmptyTelemetrySnapshot({
        overallStatus: HEALTH_STATUSES.CRITICAL,
        reliability: {
          wal: {
            sequence: 450,
            byteSize: 1048576,
            corruptRecordsCount: 3, // Corrupt records in WAL
          },
        },
      });

      const evalResult = detector.evaluate(walCorruptSnapshot);

      const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.WAL_CORRUPT_RECORD);
      assert.ok(alert, 'WAL_CORRUPT_RECORD alert must be generated');
      assert.equal(alert.severity, ALERT_SEVERITIES.SEV_2);
      assert.equal(alert.affectedTarget, 'JournalWAL');
      assert.equal(alert.evidence.corruptRecordsCount, 3);
      assert.ok(alert.recommendedAction.includes('Corrupt record detected in durable write-ahead log'));
      assert.equal(validateAlert(alert).valid, true);
    });

    it('detects unrecoverable durable storage data corruption and emits SEV-1 alert', () => {
      const detector = createTrialAnomalyDetector();

      const dataCorruptionSnapshot = createEmptyTelemetrySnapshot({
        overallStatus: HEALTH_STATUSES.CRITICAL,
        reliability: {
          wal: {
            dataCorruption: true,
            corruptRecordsCount: 15,
            lastHash: 'corrupt-hash-invalid',
          },
        },
      });

      const evalResult = detector.evaluate(dataCorruptionSnapshot);

      const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.DATA_CORRUPTION);
      assert.ok(alert, 'DATA_CORRUPTION alert must be generated');
      assert.equal(alert.severity, ALERT_SEVERITIES.SEV_1);
      assert.equal(alert.affectedTarget, 'JournalWAL');
      assert.equal(validateAlert(alert).valid, true);
    });
  });

  // ==========================================================================
  // Criterion 7: Backup failure detection
  // ==========================================================================
  describe('Criterion 7: Backup failure detection', () => {
    it('detects backup verification failure and emits SEV-3 alert', () => {
      const detector = createTrialAnomalyDetector();

      const backupFailureSnapshot = createEmptyTelemetrySnapshot({
        overallStatus: HEALTH_STATUSES.DEGRADED,
        reliability: {
          backups: {
            lastBackupId: 'backup-snapshot-2026-11-12-001',
            lastBackupStatus: 'verification_failed',
            lastVerificationOk: false,
            lastBackupAt: Date.now() - 3600000,
          },
        },
      });

      const evalResult = detector.evaluate(backupFailureSnapshot);

      const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.BACKUP_VERIFICATION_FAILURE);
      assert.ok(alert, 'BACKUP_VERIFICATION_FAILURE alert must be generated');
      assert.equal(alert.severity, ALERT_SEVERITIES.SEV_3);
      assert.equal(alert.affectedTarget, 'BackupManager');
      assert.ok(alert.recommendedAction.includes('Disaster recovery backup dry-run verification failed'));
      assert.equal(validateAlert(alert).valid, true);
    });
  });

  // ==========================================================================
  // Criterion 8: Budget threshold alert (SEV-2 / SEV-4)
  // ==========================================================================
  describe('Criterion 8: Budget threshold alert (SEV-2 / SEV-4)', () => {
    it('emits SEV-4 BUDGET_WARNING when utilization reaches warning threshold (>70%)', () => {
      const detector = createTrialAnomalyDetector({
        thresholds: { budgetWarningPct: 70 },
      });

      const warningSnapshot = createEmptyTelemetrySnapshot({
        safety: {
          budget: {
            isExhausted: false,
            totalCostUsd: 75,
            maxCostUsd: 100,
            costUtilizationPct: 75, // 75% > 70% threshold
            remainingCostUsd: 25,
          },
        },
      });

      const evalResult = detector.evaluate(warningSnapshot);
      const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.BUDGET_WARNING);

      assert.ok(alert, 'BUDGET_WARNING alert must be generated for >70% utilization');
      assert.equal(alert.severity, ALERT_SEVERITIES.SEV_4);
      assert.equal(alert.affectedTarget, 'RecoveryBudgetTracker');
      assert.equal(alert.evidence.costUtilizationPct, 75);
      assert.ok(alert.recommendedAction.includes('warning threshold (>70%)'));
      assert.equal(validateAlert(alert).valid, true);
    });

    it('emits SEV-2 BUDGET_EXHAUSTION_BREACH when budget is fully exhausted (>=100%)', () => {
      const detector = createTrialAnomalyDetector();

      const exhaustedSnapshot = createEmptyTelemetrySnapshot({
        safety: {
          budget: {
            isExhausted: true,
            totalCostUsd: 105,
            maxCostUsd: 100,
            costUtilizationPct: 105,
            remainingCostUsd: 0,
          },
        },
      });

      const evalResult = detector.evaluate(exhaustedSnapshot);
      const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.BUDGET_EXHAUSTION_BREACH);

      assert.ok(alert, 'BUDGET_EXHAUSTION_BREACH alert must be generated for budget exhaustion');
      assert.equal(alert.severity, ALERT_SEVERITIES.SEV_2);
      assert.equal(alert.affectedTarget, 'RecoveryBudgetTracker');
      assert.equal(alert.evidence.isExhausted, true);
      assert.ok(alert.recommendedAction.includes('Operational budget limit reached'));
      assert.equal(validateAlert(alert).valid, true);
    });
  });

  // ==========================================================================
  // Criterion 9: Emergency Stop alert (SEV-1)
  // ==========================================================================
  describe('Criterion 9: Emergency Stop alert (SEV-1)', () => {
    it('detects active emergency stop and emits SEV-1 critical alert requiring escalation', () => {
      const detector = createTrialAnomalyDetector();

      const eStopSnapshot = createEmptyTelemetrySnapshot({
        overallStatus: HEALTH_STATUSES.CRITICAL,
        safety: {
          emergencyStop: {
            halted: true,
            state: 'halted',
            trippedAt: Date.now() - 5000,
            trippedBy: 'SecurityGuard:ForbiddenPathWrite',
            reason: 'Agent attempted destructive out-of-sandbox modification to sensitive system path',
          },
        },
      });

      const evalResult = detector.evaluate(eStopSnapshot);

      assert.equal(evalResult.highestSeverity, ALERT_SEVERITIES.SEV_1);
      assert.equal(evalResult.countsBySeverity[ALERT_SEVERITIES.SEV_1], 1);

      const alert = evalResult.alerts.find(a => a.code === ALERT_CODES.EMERGENCY_STOP_TRIPPED);
      assert.ok(alert, 'EMERGENCY_STOP_TRIPPED alert must be generated');
      assert.equal(alert.severity, ALERT_SEVERITIES.SEV_1);
      assert.equal(alert.affectedTarget, 'SecurityGuard:ForbiddenPathWrite');
      assert.equal(alert.evidence.halted, true);
      assert.ok(alert.recommendedAction.includes('Emergency Stop is active'));

      // Check SEV-1 definition requirement: SLA <= 5 min and immediate escalation
      const sevDef = ALERT_SEVERITY_DEFINITIONS[ALERT_SEVERITIES.SEV_1];
      assert.equal(sevDef.requiresImmediateHumanEscalation, true);
      assert.equal(sevDef.targetSlaMinutes, 5);

      assert.equal(validateAlert(alert).valid, true);
    });
  });

  // ==========================================================================
  // Criterion 10: Telemetry gap detection (missed polling intervals)
  // ==========================================================================
  describe('Criterion 10: Telemetry gap detection (missed polling intervals)', () => {
    it('accurately identifies sampling lag / missed polling intervals and registers telemetry gaps', async () => {
      const storePath = path.join(tempDir, 'gaps-trial-state.json');
      let simulatedTime = 1710000000000;

      const scheduler = createTrialScheduler({
        collector: {
          collectSnapshot: async () => createEmptyTelemetrySnapshot({ timestamp: simulatedTime }),
        },
        anomalyDetector: createTrialAnomalyDetector({ now: () => simulatedTime }),
        storePath,
        intervalMs: 60000, // 60s
        now: () => simulatedTime,
      });

      // Sample 1 at t=0
      await scheduler.sampleNow();
      assert.equal(scheduler.snapshots.length, 1);
      assert.equal(scheduler.gaps.length, 0);

      // Advance clock by 310 seconds (> 5 missed cycles of 60s)
      simulatedTime += 310000;

      // Sample 2 at t=310s (should trigger runtime lag gap detection)
      await scheduler.sampleNow();

      assert.equal(scheduler.snapshots.length, 2);
      assert.equal(scheduler.gaps.length, 1, 'Lag exceeding 1.5x interval must create a telemetry gap');

      const gap = scheduler.gaps[0];
      assert.ok(gap.id.startsWith('gap-'));
      assert.equal(gap.durationMs, 310000);
      assert.equal(gap.missedIntervals, 4);
      assert.ok(gap.reason.includes('Missed polling interval'));

      const validation = validateTelemetryGap(gap);
      assert.equal(validation.valid, true);
    });
  });

  // ==========================================================================
  // Criterion 11: Daily report generation (reports/operational-trial/day-01.md)
  // ==========================================================================
  describe('Criterion 11: Daily report generation (reports/operational-trial/day-01.md)', () => {
    it('generates day-01.md containing all 6 required sections with truthful metrics', async () => {
      const outputDir = path.join(tempDir, 'reports/operational-trial');

      const sampleSnapshots = [
        createEmptyTelemetrySnapshot({
          timestamp: Date.now() - 3600000,
          overallStatus: HEALTH_STATUSES.HEALTHY,
          systemHealth: {
            uptimeSeconds: 86400,
            nodeProcess: { pid: process.pid, uptimeSeconds: 86400, memoryUsage: { rss: 120 * 1024 * 1024 } },
          },
          reliability: {
            wal: { sequence: 120, corruptRecordsCount: 0 },
            processes: { orphans: 0 },
          },
          safety: {
            emergencyStop: { halted: false, state: 'idle' },
            autonomyLevel: 'supervised',
          },
        }),
      ];

      const sampleAlerts = [
        createAlert({
          severity: ALERT_SEVERITIES.SEV_4,
          code: ALERT_CODES.BUDGET_WARNING,
          affectedTarget: 'RecoveryBudgetTracker',
          evidence: { costUtilizationPct: 72 },
          recommendedAction: 'Monitor remaining budget quota.',
          timestamp: Date.now() - 1800000,
        }),
      ];

      const sampleGaps = [
        createTelemetryGap({
          startTime: Date.now() - 7200000,
          endTime: Date.now() - 7020000,
          durationMs: 180000,
          missedIntervals: 3,
          reason: 'Scheduled maintenance reboot',
        }),
      ];

      const reportResult = await generateDailyReport({
        dayNumber: 1,
        date: '2026-11-12',
        snapshots: sampleSnapshots,
        alerts: sampleAlerts,
        gaps: sampleGaps,
        outputDir,
        writeToFile: true,
      });

      assert.equal(reportResult.fileName, 'day-01.md');
      assert.ok(fs.existsSync(reportResult.filePath), 'File reports/operational-trial/day-01.md must exist');

      const content = await fsp.readFile(reportResult.filePath, 'utf8');

      // Verify all required markdown sections are clearly present
      assert.ok(content.includes('Executive Summary'), 'Must have Executive Summary');
      assert.ok(content.includes('1. Verified Stable'), 'Must have Verified Stable section');
      assert.ok(content.includes('2. Verified Incidents'), 'Must have Verified Incidents section');
      assert.ok(content.includes('3. Unresolved Incidents'), 'Must have Unresolved Incidents section');
      assert.ok(content.includes('4. Monitoring Gaps'), 'Must have Monitoring Gaps section');
      assert.ok(content.includes('5. Not Tested'), 'Must have Not Tested section');
      assert.ok(content.includes('6. Recommendations'), 'Must have Recommendations section');

      // Verify metrics truthfulness: unmeasured metrics labeled explicitly
      assert.ok(content.includes('Day 01') || content.includes('day-01'));
      assert.ok(content.includes('SEV-4'));
      assert.ok(content.includes('Scheduled maintenance reboot'));
    });
  });

  // ==========================================================================
  // Criterion 12: Final report generation (reports/operational-trial/FINAL-7-DAY-ASSESSMENT.md)
  // ==========================================================================
  describe('Criterion 12: Final report generation (reports/operational-trial/FINAL-7-DAY-ASSESSMENT.md)', () => {
    it('generates FINAL-7-DAY-ASSESSMENT.md with comprehensive longitudinal assessment and rollout verdict', async () => {
      const outputDir = path.join(tempDir, 'reports/operational-trial');

      const dailyReports = [
        { dayNumber: 1, dayStr: '01', status: 'healthy', summary: { snapshotCount: 1440, alertsCount: 0, totalGapDurationMs: 0 } },
        { dayNumber: 2, dayStr: '02', status: 'healthy', summary: { snapshotCount: 1440, alertsCount: 1, totalGapDurationMs: 0 } },
        { dayNumber: 3, dayStr: '03', status: 'healthy', summary: { snapshotCount: 1440, alertsCount: 0, totalGapDurationMs: 60000 } },
        { dayNumber: 4, dayStr: '04', status: 'healthy', summary: { snapshotCount: 1440, alertsCount: 0, totalGapDurationMs: 0 } },
        { dayNumber: 5, dayStr: '05', status: 'healthy', summary: { snapshotCount: 1440, alertsCount: 0, totalGapDurationMs: 0 } },
        { dayNumber: 6, dayStr: '06', status: 'healthy', summary: { snapshotCount: 1440, alertsCount: 0, totalGapDurationMs: 0 } },
        { dayNumber: 7, dayStr: '07', status: 'healthy', summary: { snapshotCount: 1440, alertsCount: 0, totalGapDurationMs: 0 } },
      ];

      const finalResult = await generateFinalAssessment({
        days: 7,
        dailyReports,
        outputDir,
        writeToFile: true,
      });

      assert.equal(finalResult.fileName, 'FINAL-7-DAY-ASSESSMENT.md');
      assert.ok(fs.existsSync(finalResult.filePath), 'FINAL-7-DAY-ASSESSMENT.md must exist on disk');

      const content = await fsp.readFile(finalResult.filePath, 'utf8');

      // Verify core assessment contents
      assert.ok(content.includes('Final 7-Day Operational Assessment'), 'Must contain title');
      assert.ok(content.includes('Executive Summary'), 'Must state executive summary');
      assert.ok(content.includes('Operational Scorecard'), 'Must contain scorecard');
      assert.ok(content.includes('1. Verified Stable Subsystems'), 'Must list stable subsystems');
      assert.ok(content.includes('2. Verified Incidents'), 'Must list incidents');
      assert.ok(content.includes('3. Unresolved Incidents'), 'Must list unresolved incidents');
      assert.ok(content.includes('4. Monitoring Gaps'), 'Must list monitoring gaps');
      assert.ok(content.includes('5. Not Tested'), 'Must list not tested');
      assert.ok(content.includes('6. Recommendations'), 'Must provide recommendations');

      // Verdict must be a recognized outcome
      assert.ok(
        content.includes('READY FOR PRODUCTION ROLLOUT') ||
        content.includes('CONDITIONALLY READY') ||
        content.includes('BLOCKED'),
        'Must declare clear rollout readiness verdict'
      );
      assert.ok(parseFloat(finalResult.availabilityPct) >= 99.0);
    });
  });

  // ==========================================================================
  // Criterion 13: Verify that the agent cannot mutate execution state (read-only enforcement invariant)
  // ==========================================================================
  describe('Criterion 13: Strict Read-Only Enforcement Invariant', () => {
    it('verifies that TrialCollector, AnomalyDetector, TrialScheduler, and TrialMonitor reject all mutations', async () => {
      // 1. TrialCollector invariant check
      const collector = createTrialCollector();
      assert.equal(collector.isReadOnly, true);
      assert.doesNotThrow(() => assertReadOnlyCollector(collector));

      // Attempting prohibited mutations on collector must throw READ_ONLY_INVARIANT_VIOLATION
      assert.throws(() => collector.dispatchTask(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => collector.cancelExecution(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => collector.retryExecution(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => collector.triggerEmergencyStop(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => collector.setAutonomyLevel('autonomous'), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => collector.resolveApproval('app-1', 'approved'), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => collector.terminateProcessSafely(1234), /READ_ONLY_INVARIANT_VIOLATION/);

      // 2. TrialAnomalyDetector invariant check
      const detector = createTrialAnomalyDetector();
      assert.equal(detector.isReadOnly, true);
      assert.throws(() => detector.dispatchTask(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => detector.cancelExecution(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => detector.retryExecution(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => detector.terminateProcessSafely(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => detector.triggerEmergencyStop(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => detector.resolveApproval(), /READ_ONLY_INVARIANT_VIOLATION/);

      // 3. TrialScheduler invariant check
      const scheduler = createTrialScheduler({
        collector,
        anomalyDetector: detector,
        storePath: path.join(tempDir, 'ro-state.json'),
      });
      assert.equal(scheduler.isReadOnly, true);
      assert.throws(() => scheduler.dispatchTask(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => scheduler.cancelExecution(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => scheduler.retryExecution(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => scheduler.terminateProcessSafely(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => scheduler.triggerEmergencyStop(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => scheduler.resolveApproval(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => scheduler.repairState(), /READ_ONLY_INVARIANT_VIOLATION/);

      // 4. TrialMonitor coordinator invariant check
      const monitor = createTrialMonitor({
        collector,
        anomalyDetector: detector,
        scheduler,
        outputDir: path.join(tempDir, 'ro-reports'),
      });
      assert.equal(monitor.isReadOnly, true);
      assert.throws(() => monitor.dispatchTask(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => monitor.cancelExecution(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => monitor.retryExecution(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => monitor.triggerEmergencyStop(), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => monitor.setAutonomyLevel('autonomous'), /READ_ONLY_INVARIANT_VIOLATION/);
      assert.throws(() => monitor.resolveApproval('app-1', 'approved'), /READ_ONLY_INVARIANT_VIOLATION/);

      // 5. Verify snapshot immutability
      const snapshot = await collector.collectSnapshot();
      assert.equal(snapshot.readOnlyInvariant, true);
      // Attempting to modify frozen snapshot throws in strict mode
      assert.throws(() => {
        snapshot.overallStatus = 'corrupted';
      }, /Cannot assign to read only property/);
    });
  });
});
