/**
 * Autonomous Trial Anomaly Detector (Phase 5.1).
 * Evaluates collected operational snapshots against the 4 defined alert severities:
 * - SEV-1: Critical Emergency (Emergency Stop tripped, unauthorized file access, unverified process signaling, data corruption)
 * - SEV-2: High Severity (Orphan process detected, critical WAL corrupt record, budget exhaustion breach, unexpected duplicate execution)
 * - SEV-3: Medium Severity (Provider outage / heartbeat missing, stalled task >300s, excessive retry loop, backup verification failure)
 * - SEV-4: Low / Advisory Notice (Performance latency degradation p95 > 15s, budget warning >70%, pending approval aging >15m)
 *
 * Strictly Read-Only:
 * Generates structured, immutable alert notifications with actionable operator guidance.
 * NEVER attempts automatic repairs, mutations, or process terminations.
 */

import {
  ALERT_SEVERITIES,
  ALERT_CODES,
  HEALTH_STATUSES,
  createAlert,
} from './trial-contracts.mjs';

export const DEFAULT_ANOMALY_THRESHOLDS = Object.freeze({
  stallThresholdMs: 300000,          // 300 seconds (5m)
  p95LatencyMs: 15000,               // 15 seconds
  budgetWarningPct: 70,              // 70% budget utilization
  approvalAgingMs: 15 * 60 * 1000,   // 15 minutes
  maxRetryRate: 0.25,                // 25% retry rate
  providerHeartbeatTimeoutMs: 120000,// 2 minutes
});

export class TrialAnomalyDetector {
  /**
   * @param {Object} [options={}]
   * @param {Object} [options.thresholds={}] - Custom alert thresholds
   * @param {Function} [options.now=Date.now] - Epoch timestamp provider
   */
  constructor(options = {}) {
    this.thresholds = {
      ...DEFAULT_ANOMALY_THRESHOLDS,
      ...(options.thresholds || {}),
    };
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.isReadOnly = true;
  }

  /**
   * Prohibited mutating operations throw strictly to protect invariants.
   */
  _assertReadOnly(actionName) {
    throw new Error(`READ_ONLY_INVARIANT_VIOLATION: Trial Anomaly Detector is strictly read-only. Action "${actionName}" is forbidden.`);
  }

  dispatchTask() { this._assertReadOnly('dispatchTask'); }
  cancelExecution() { this._assertReadOnly('cancelExecution'); }
  retryExecution() { this._assertReadOnly('retryExecution'); }
  terminateProcessSafely() { this._assertReadOnly('terminateProcessSafely'); }
  triggerEmergencyStop() { this._assertReadOnly('triggerEmergencyStop'); }
  resolveApproval() { this._assertReadOnly('resolveApproval'); }

  /**
   * Returns copy of active evaluation thresholds.
   * @returns {Object}
   */
  getThresholds() {
    return { ...this.thresholds };
  }

  /**
   * Evaluates a collected telemetry snapshot and returns detected alerts.
   * @param {Object} snapshot - Telemetry snapshot adhering to trial-contracts schema
   * @returns {Object} Evaluation summary containing alerts and severity aggregates
   */
  evaluate(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return {
        timestamp: this.now(),
        snapshotId: null,
        alerts: [],
        countsBySeverity: {
          [ALERT_SEVERITIES.SEV_1]: 0,
          [ALERT_SEVERITIES.SEV_2]: 0,
          [ALERT_SEVERITIES.SEV_3]: 0,
          [ALERT_SEVERITIES.SEV_4]: 0,
        },
        totalAlerts: 0,
        highestSeverity: null,
        overallHealth: HEALTH_STATUSES.UNKNOWN,
      };
    }

    const evaluationTimestamp = snapshot.timestamp || this.now();
    const alerts = [];

    // Evaluate in order: SEV-1, SEV-2, SEV-3, SEV-4
    this._evaluateSev1(snapshot, evaluationTimestamp, alerts);
    this._evaluateSev2(snapshot, evaluationTimestamp, alerts);
    this._evaluateSev3(snapshot, evaluationTimestamp, alerts);
    this._evaluateSev4(snapshot, evaluationTimestamp, alerts);

    // Compute aggregate metrics
    const countsBySeverity = {
      [ALERT_SEVERITIES.SEV_1]: 0,
      [ALERT_SEVERITIES.SEV_2]: 0,
      [ALERT_SEVERITIES.SEV_3]: 0,
      [ALERT_SEVERITIES.SEV_4]: 0,
    };

    for (const a of alerts) {
      if (countsBySeverity[a.severity] !== undefined) {
        countsBySeverity[a.severity]++;
      }
    }

    let highestSeverity = null;
    let overallHealth = HEALTH_STATUSES.HEALTHY;

    if (countsBySeverity[ALERT_SEVERITIES.SEV_1] > 0) {
      highestSeverity = ALERT_SEVERITIES.SEV_1;
      overallHealth = HEALTH_STATUSES.CRITICAL;
    } else if (countsBySeverity[ALERT_SEVERITIES.SEV_2] > 0) {
      highestSeverity = ALERT_SEVERITIES.SEV_2;
      overallHealth = HEALTH_STATUSES.CRITICAL;
    } else if (countsBySeverity[ALERT_SEVERITIES.SEV_3] > 0) {
      highestSeverity = ALERT_SEVERITIES.SEV_3;
      overallHealth = HEALTH_STATUSES.DEGRADED;
    } else if (countsBySeverity[ALERT_SEVERITIES.SEV_4] > 0) {
      highestSeverity = ALERT_SEVERITIES.SEV_4;
      overallHealth = HEALTH_STATUSES.DEGRADED;
    }

    return {
      timestamp: evaluationTimestamp,
      snapshotId: snapshot.id || null,
      alerts,
      countsBySeverity,
      totalAlerts: alerts.length,
      highestSeverity,
      overallHealth,
    };
  }

  /**
   * Alias for evaluate.
   */
  detectAnomalies(snapshot) {
    return this.evaluate(snapshot);
  }

  // ==========================================================================
  // SEV-1: CRITICAL EMERGENCY
  // ==========================================================================
  _evaluateSev1(snapshot, now, alerts) {
    const safety = snapshot.safety || {};
    const reliability = snapshot.reliability || {};

    // 1. Emergency Stop Tripped
    const estop = safety.emergencyStop;
    if (estop && (estop.halted === true || estop.state === 'halted' || estop.state === 'tripped')) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_1,
        code: ALERT_CODES.EMERGENCY_STOP_TRIPPED,
        affectedTarget: estop.trippedBy || 'AutonomousEmergencyStop',
        evidence: {
          halted: estop.halted,
          state: estop.state,
          reason: estop.reason || 'Emergency stop triggered by safety policy or manual operator action',
          trippedAt: estop.trippedAt,
        },
        recommendedAction: 'Emergency Stop is active; execution halted across all autonomous agents. Inspect audit trail and reset via control console when resolved.',
        timestamp: now,
      }));
    }

    // 2. Unauthorized File Access
    const qualityGates = safety.qualityGates || {};
    const issues = Array.isArray(snapshot.issues) ? snapshot.issues : [];
    const unauthorizedIssue = issues.find(i => i && (i.code === ALERT_CODES.UNAUTHORIZED_FILE_ACCESS || i.type === 'unauthorized_file_access'));
    if (unauthorizedIssue || qualityGates.unauthorizedAccessCount > 0) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_1,
        code: ALERT_CODES.UNAUTHORIZED_FILE_ACCESS,
        affectedTarget: unauthorizedIssue?.target || 'PolicySandbox',
        evidence: unauthorizedIssue?.evidence || {
          unauthorizedAccessCount: qualityGates.unauthorizedAccessCount || 1,
          details: unauthorizedIssue?.details || 'Access outside allowed workspace path detected.',
        },
        recommendedAction: 'Unauthorized file access attempt detected outside sandbox boundary. Review security logs and isolate agent session immediately.',
        timestamp: now,
      }));
    }

    // 3. Unverified Process Signaling
    const processes = reliability.processes || {};
    const unverifiedSignalingIssue = issues.find(i => i && (i.code === ALERT_CODES.UNVERIFIED_PROCESS_SIGNALING || i.type === 'unverified_process_signaling'));
    if (processes.reassigned > 0 || unverifiedSignalingIssue) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_1,
        code: ALERT_CODES.UNVERIFIED_PROCESS_SIGNALING,
        affectedTarget: 'ProcessSupervisor',
        evidence: unverifiedSignalingIssue?.evidence || {
          reassignedCount: processes.reassigned || 0,
          reason: 'Process supervisor detected attempt to signal or terminate a recycled/reassigned OS PID.',
        },
        recommendedAction: 'Process Identity Safety blocked termination signal to reassigned OS PID. Verify process registration table before proceeding.',
        timestamp: now,
      }));
    }

    // 4. Data Corruption
    const wal = reliability.wal || {};
    const dataCorruptionIssue = issues.find(i => i && (i.code === ALERT_CODES.DATA_CORRUPTION || i.type === 'data_corruption'));
    if (wal.dataCorruption === true || wal.checksumMismatch === true || dataCorruptionIssue) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_1,
        code: ALERT_CODES.DATA_CORRUPTION,
        affectedTarget: dataCorruptionIssue?.target || 'JournalWAL',
        evidence: dataCorruptionIssue?.evidence || {
          corruptRecordsCount: wal.corruptRecordsCount || 0,
          lastHash: wal.lastHash || null,
          details: dataCorruptionIssue?.details || 'SHA-256 integrity chain verification failed on durable records.',
        },
        recommendedAction: 'Critical data corruption detected in durable storage. Halt active writes and perform disaster recovery restore from latest backup.',
        timestamp: now,
      }));
    }
  }

  // ==========================================================================
  // SEV-2: HIGH SEVERITY INCIDENT
  // ==========================================================================
  _evaluateSev2(snapshot, now, alerts) {
    const reliability = snapshot.reliability || {};
    const safety = snapshot.safety || {};
    const agentHealth = snapshot.agentHealth || {};
    const issues = Array.isArray(snapshot.issues) ? snapshot.issues : [];

    // 1. Orphan Process Detected
    const processes = reliability.processes || {};
    const orphanIssue = issues.find(i => i && (i.code === ALERT_CODES.ORPHAN_PROCESS_DETECTED || i.type === 'orphan_process_detected'));
    if (processes.orphans > 0 || orphanIssue) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_2,
        code: ALERT_CODES.ORPHAN_PROCESS_DETECTED,
        affectedTarget: 'ProcessSupervisor',
        evidence: orphanIssue?.evidence || {
          orphanCount: processes.orphans || 1,
          details: 'Orphan process identified running without registered supervisor parent session.',
        },
        recommendedAction: 'Orphan process detected detached from parent runtime. Verify PID identity before safe operator termination.',
        timestamp: now,
      }));
    }

    // 2. Critical WAL Corrupt Record
    const wal = reliability.wal || {};
    const walCorruptIssue = issues.find(i => i && (i.code === ALERT_CODES.WAL_CORRUPT_RECORD || i.type === 'wal_corrupt_record'));
    if (wal.corruptRecordsCount > 0 || walCorruptIssue) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_2,
        code: ALERT_CODES.WAL_CORRUPT_RECORD,
        affectedTarget: 'JournalWAL',
        evidence: walCorruptIssue?.evidence || {
          corruptRecordsCount: wal.corruptRecordsCount || 0,
          sequence: wal.sequence || 0,
          byteSize: wal.byteSize || 0,
        },
        recommendedAction: 'Corrupt record detected in durable write-ahead log. Review WAL truncation offsets and archived .corrupt.bak files.',
        timestamp: now,
      }));
    }

    // 3. Budget Exhaustion Breach
    const budget = safety.budget || {};
    const isExhausted = Boolean(budget.isExhausted) ||
      (typeof budget.costUtilizationPct === 'number' && budget.costUtilizationPct >= 100) ||
      (typeof budget.remainingCostUsd === 'number' && budget.remainingCostUsd <= 0);
    const budgetExhaustionIssue = issues.find(i => i && (i.code === ALERT_CODES.BUDGET_EXHAUSTION_BREACH || i.type === 'budget_exhaustion_breach'));

    if (isExhausted || budgetExhaustionIssue) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_2,
        code: ALERT_CODES.BUDGET_EXHAUSTION_BREACH,
        affectedTarget: 'RecoveryBudgetTracker',
        evidence: budgetExhaustionIssue?.evidence || {
          isExhausted: true,
          totalCostUsd: budget.totalCostUsd,
          maxCostUsd: budget.maxCostUsd,
          costUtilizationPct: budget.costUtilizationPct,
          remainingCostUsd: budget.remainingCostUsd,
        },
        recommendedAction: 'Operational budget limit reached. Autonomous subtasks suspended. Operator must review spending and grant additional budget to resume.',
        timestamp: now,
      }));
    }

    // 4. Unexpected Duplicate Execution
    const idempotency = reliability.idempotency || {};
    const executions = agentHealth.executions || {};
    const duplicateIssue = issues.find(i => i && (i.code === ALERT_CODES.UNEXPECTED_DUPLICATE_EXECUTION || i.type === 'unexpected_duplicate_execution'));
    if (idempotency.conflicts > 0 || executions.duplicateDetected === true || duplicateIssue) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_2,
        code: ALERT_CODES.UNEXPECTED_DUPLICATE_EXECUTION,
        affectedTarget: 'IdempotencyManager',
        evidence: duplicateIssue?.evidence || {
          conflicts: idempotency.conflicts || 1,
          activeLocks: idempotency.activeLocks || 0,
          details: 'Concurrent duplicate dispatch request was intercepted and rejected.',
        },
        recommendedAction: 'Unexpected duplicate execution blocked by scoped idempotency key lock. Investigate rapid re-dispatch or concurrent clients.',
        timestamp: now,
      }));
    }
  }

  // ==========================================================================
  // SEV-3: MEDIUM SEVERITY DEGRADATION
  // ==========================================================================
  _evaluateSev3(snapshot, now, alerts) {
    const agentHealth = snapshot.agentHealth || {};
    const orchestration = snapshot.orchestrationState || {};
    const reliability = snapshot.reliability || {};
    const issues = Array.isArray(snapshot.issues) ? snapshot.issues : [];

    // 1. Provider Outage / Heartbeat Missing
    const providers = agentHealth.providers || {};
    for (const [providerKey, provider] of Object.entries(providers)) {
      if (!provider || typeof provider !== 'object') continue;

      const pStatus = (provider.status || '').toLowerCase();
      const pId = provider.id || providerKey;
      const pName = provider.name || pId;

      if (['down', 'outage', 'unhealthy', 'error', 'failed'].includes(pStatus)) {
        alerts.push(createAlert({
          severity: ALERT_SEVERITIES.SEV_3,
          code: ALERT_CODES.PROVIDER_OUTAGE,
          affectedTarget: `Provider:${pName}`,
          evidence: {
            providerId: pId,
            name: pName,
            status: provider.status,
            lastHeartbeat: provider.lastHeartbeat,
            pingMs: provider.pingMs,
          },
          recommendedAction: 'Provider service is down or reporting errors. Route executions to fallback provider and verify upstream status.',
          timestamp: now,
        }));
      } else if (
        typeof provider.lastHeartbeat === 'number' &&
        provider.lastHeartbeat > 0 &&
        (now - provider.lastHeartbeat > this.thresholds.providerHeartbeatTimeoutMs)
      ) {
        alerts.push(createAlert({
          severity: ALERT_SEVERITIES.SEV_3,
          code: ALERT_CODES.HEARTBEAT_MISSING,
          affectedTarget: `Provider:${pName}`,
          evidence: {
            providerId: pId,
            name: pName,
            lastHeartbeat: provider.lastHeartbeat,
            heartbeatAgeMs: now - provider.lastHeartbeat,
            timeoutThresholdMs: this.thresholds.providerHeartbeatTimeoutMs,
          },
          recommendedAction: 'Provider heartbeat timed out. Ping endpoint or restart provider bridge agent.',
          timestamp: now,
        }));
      }
    }

    const providerOutageIssue = issues.find(i => i && (i.code === ALERT_CODES.PROVIDER_OUTAGE || i.type === 'provider_outage'));
    if (providerOutageIssue && !alerts.some(a => a.code === ALERT_CODES.PROVIDER_OUTAGE)) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_3,
        code: ALERT_CODES.PROVIDER_OUTAGE,
        affectedTarget: providerOutageIssue.target || 'ProviderService',
        evidence: providerOutageIssue.evidence || { details: 'Provider unreachable or error reported.' },
        recommendedAction: 'Provider service is down or reporting errors. Route executions to fallback provider and verify upstream status.',
        timestamp: now,
      }));
    }

    // 2. Stalled Task (> 300s)
    const executions = agentHealth.executions || {};
    const activeList = Array.isArray(executions.activeList) ? executions.activeList : [];
    const stalledFromList = activeList.filter(ex => ex && (ex.stalled === true || (typeof ex.durationMs === 'number' && ex.durationMs > this.thresholds.stallThresholdMs)));
    const stalledCount = executions.stalled || stalledFromList.length;
    const stalledIssue = issues.find(i => i && (i.code === ALERT_CODES.STALLED_TASK || i.type === 'stalled_task'));

    if (stalledCount > 0 || stalledIssue) {
      const primaryStalled = stalledFromList[0] || stalledIssue?.evidence?.stalledExecution || null;
      const target = primaryStalled?.executionId ? `Execution:${primaryStalled.executionId}` : 'ExecutionManager';

      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_3,
        code: ALERT_CODES.STALLED_TASK,
        affectedTarget: target,
        evidence: stalledIssue?.evidence || {
          stalledCount,
          thresholdMs: this.thresholds.stallThresholdMs,
          stalledExecutions: stalledFromList.map(s => ({
            executionId: s.executionId,
            agentId: s.agentId,
            durationMs: s.durationMs,
          })),
        },
        recommendedAction: 'Execution exceeded stall threshold (300s). Check agent child process responsiveness and cancel stalled task if unresponsive.',
        timestamp: now,
      }));
    }

    // 3. Excessive Retry Loop
    const dag = orchestration.dag || {};
    const retryRate = typeof dag.retryRate === 'number' ? dag.retryRate : 0;
    const excessiveRetryIssue = issues.find(i => i && (i.code === ALERT_CODES.EXCESSIVE_RETRY_LOOP || i.type === 'excessive_retry_loop'));

    if (retryRate > this.thresholds.maxRetryRate || dag.excessiveRetries === true || excessiveRetryIssue) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_3,
        code: ALERT_CODES.EXCESSIVE_RETRY_LOOP,
        affectedTarget: 'MasterOrchestrator',
        evidence: excessiveRetryIssue?.evidence || {
          retryRate,
          threshold: this.thresholds.maxRetryRate,
          activeSubtasks: dag.activeSubtasks || 0,
          failedSubtasks: dag.failedSubtasks || 0,
        },
        recommendedAction: 'Subtask retry rate exceeds acceptable limits. Check error patterns in DAG nodes and pause failing retry loops.',
        timestamp: now,
      }));
    }

    // 4. Backup Verification Failure
    const backups = reliability.backups || {};
    const backupStatus = (backups.lastBackupStatus || '').toLowerCase();
    const backupFailureIssue = issues.find(i => i && (i.code === ALERT_CODES.BACKUP_VERIFICATION_FAILURE || i.type === 'backup_verification_failure'));

    if (
      backupStatus === 'failed' ||
      backupStatus === 'verification_failed' ||
      backups.lastVerificationOk === false ||
      backups.verificationFailed === true ||
      backupFailureIssue
    ) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_3,
        code: ALERT_CODES.BACKUP_VERIFICATION_FAILURE,
        affectedTarget: 'BackupManager',
        evidence: backupFailureIssue?.evidence || {
          lastBackupId: backups.lastBackupId || null,
          lastBackupStatus: backups.lastBackupStatus || 'failed',
          lastBackupAt: backups.lastBackupAt || null,
        },
        recommendedAction: 'Disaster recovery backup dry-run verification failed. Trigger an isolated restore dry-run in sandbox and create fresh backup.',
        timestamp: now,
      }));
    }
  }

  // ==========================================================================
  // SEV-4: LOW / ADVISORY NOTICE
  // ==========================================================================
  _evaluateSev4(snapshot, now, alerts) {
    const agentHealth = snapshot.agentHealth || {};
    const safety = snapshot.safety || {};
    const issues = Array.isArray(snapshot.issues) ? snapshot.issues : [];

    // 1. Performance Latency Degradation (p95 > 15s)
    const latency = agentHealth.latency || {};
    const p95Ms = typeof latency.p95Ms === 'number' ? latency.p95Ms : null;
    const latencyIssue = issues.find(i => i && (i.code === ALERT_CODES.LATENCY_DEGRADATION || i.type === 'latency_degradation'));

    if ((p95Ms !== null && p95Ms > this.thresholds.p95LatencyMs) || latencyIssue) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_4,
        code: ALERT_CODES.LATENCY_DEGRADATION,
        affectedTarget: 'AgentExecutionPipeline',
        evidence: latencyIssue?.evidence || {
          p95Ms,
          thresholdMs: this.thresholds.p95LatencyMs,
          sampleCount: latency.sampleCount || 0,
        },
        recommendedAction: 'P95 execution latency exceeds 15s. Monitor provider rate limits and optimize prompt token length.',
        timestamp: now,
      }));
    }

    // 2. Budget Warning (> 70%)
    const budget = safety.budget || {};
    const costPct = typeof budget.costUtilizationPct === 'number' ? budget.costUtilizationPct : null;
    const subtaskPct = typeof budget.subtaskUtilizationPct === 'number' ? budget.subtaskUtilizationPct : null;
    const highestUtilization = Math.max(costPct || 0, subtaskPct || 0);
    const budgetWarningIssue = issues.find(i => i && (i.code === ALERT_CODES.BUDGET_WARNING || i.type === 'budget_warning'));

    // Only fire SEV-4 warning if not already exhausted (SEV-2 handles exhaustion)
    if (
      !budget.isExhausted &&
      ((highestUtilization > this.thresholds.budgetWarningPct && highestUtilization < 100) || budgetWarningIssue)
    ) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_4,
        code: ALERT_CODES.BUDGET_WARNING,
        affectedTarget: 'RecoveryBudgetTracker',
        evidence: budgetWarningIssue?.evidence || {
          costUtilizationPct: budget.costUtilizationPct,
          subtaskUtilizationPct: budget.subtaskUtilizationPct,
          thresholdPct: this.thresholds.budgetWarningPct,
          totalCostUsd: budget.totalCostUsd,
          maxCostUsd: budget.maxCostUsd,
        },
        recommendedAction: 'Autonomous budget utilization has reached warning threshold (>70%). Review pending tasks to prevent budget exhaustion.',
        timestamp: now,
      }));
    }

    // 3. Pending Approval Aging (> 15m)
    const approvals = safety.approvals || {};
    const pendingList = Array.isArray(approvals.pendingList) ? approvals.pendingList : [];
    const agingApprovals = pendingList.filter(app => app && (app.isAging === true || (typeof app.ageMinutes === 'number' && app.ageMinutes >= 15)));
    const agingCount = approvals.agingCount || agingApprovals.length;
    const approvalAgingIssue = issues.find(i => i && (i.code === ALERT_CODES.PENDING_APPROVAL_AGING || i.type === 'pending_approval_aging'));

    if (agingCount > 0 || approvalAgingIssue) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_4,
        code: ALERT_CODES.PENDING_APPROVAL_AGING,
        affectedTarget: 'PolicyEngine',
        evidence: approvalAgingIssue?.evidence || {
          agingCount,
          thresholdMinutes: 15,
          pendingApprovals: agingApprovals.map(a => ({
            approvalId: a.approvalId,
            actionType: a.actionType,
            ageMinutes: a.ageMinutes,
          })),
        },
        recommendedAction: 'Approvals have been pending operator review for over 15 minutes. Notify duty operator to review and unblock workflow.',
        timestamp: now,
      }));
    }

    // 4. Telemetry Gap Detected (if reported in issues)
    const gapIssue = issues.find(i => i && (i.code === ALERT_CODES.TELEMETRY_GAP_DETECTED || i.type === 'telemetry_gap_detected'));
    if (gapIssue) {
      alerts.push(createAlert({
        severity: ALERT_SEVERITIES.SEV_4,
        code: ALERT_CODES.TELEMETRY_GAP_DETECTED,
        affectedTarget: 'TrialScheduler',
        evidence: gapIssue.evidence || { details: 'Missed polling cycles or downtime detected.' },
        recommendedAction: 'Examine telemetry gaps for possible server reboots or monitor execution lag.',
        timestamp: now,
      }));
    }
  }
}

/**
 * Factory function creating a TrialAnomalyDetector instance.
 * @param {Object} [options={}]
 * @returns {TrialAnomalyDetector}
 */
export function createTrialAnomalyDetector(options = {}) {
  return new TrialAnomalyDetector(options);
}
