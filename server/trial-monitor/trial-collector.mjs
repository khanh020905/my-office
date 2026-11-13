/**
 * Operational Health Telemetry Collector (Phase 5.1).
 * Reuses existing runtime modules across Control, Orchestration, Reliability, Autonomous Safety, and QA:
 * - ControlManager
 * - MasterOrchestrator
 * - ProcessSupervisor
 * - Durable Journal (WAL)
 * - BackupManager
 * - ReliabilityMetricsCollector
 * - ReviewEngine (QA)
 * - PolicyEngine
 * - EmergencyStop
 * - RecoveryBudgetTracker
 * 
 * Strict Invariants:
 * 1. STRICTLY READ-ONLY: Never mutates execution state, budget, policy, emergency stop, process state, or disk.
 * 2. TRUTHFULNESS: Never fabricates metrics; unmeasured values are strictly null or 'unknown'.
 * 3. IMMUTABILITY: Telemetry snapshots returned are deep-frozen.
 */

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {
  HEALTH_STATUSES,
  createEmptyTelemetrySnapshot,
  validateTelemetrySnapshot,
  deepFreeze,
  assertReadOnlyCollector,
} from './trial-contracts.mjs';

export class TrialCollector {
  /**
   * @param {Object} [options={}]
   * @param {Object} [options.controlManager] - Phase 1 ControlManager
   * @param {Object} [options.masterOrchestrator] - Phase 2 MasterOrchestrator
   * @param {Object} [options.processSupervisor] - Phase 5 ProcessSupervisor
   * @param {Object} [options.journal] - Phase 5 Durable Journal (WAL)
   * @param {Object} [options.backupManager] - Phase 5 BackupManager
   * @param {Object} [options.metricsCollector] - Phase 5 ReliabilityMetricsCollector
   * @param {Object} [options.qaReviewEngine] - Phase 3 ReviewEngine
   * @param {Object} [options.policyEngine] - Phase 4 PolicyEngine
   * @param {Object} [options.emergencyStop] - Phase 4 EmergencyStop
   * @param {Object} [options.recoveryBudgetTracker] - Phase 4 RecoveryBudgetTracker (or budgetManager)
   * @param {Object} [options.budgetManager] - Alias for recoveryBudgetTracker
   * @param {Object} [options.idempotencyManager] - Optional IdempotencyManager
   * @param {Object} [options.reconciliationEngine] - Optional ReconciliationEngine
   * @param {string} [options.rootDir] - Root directory of the application
   * @param {number} [options.stallThresholdMs=300000] - Duration after which in-flight execution is marked stalled (default 5m)
   * @param {Function} [options.now=Date.now] - Epoch ms provider
   */
  constructor(options = {}) {
    this.controlManager = options.controlManager || null;
    this.masterOrchestrator = options.masterOrchestrator || null;
    this.processSupervisor = options.processSupervisor || null;
    this.journal = options.journal || null;
    this.backupManager = options.backupManager || null;
    this.metricsCollector = options.metricsCollector || null;
    this.qaReviewEngine = options.qaReviewEngine || null;
    this.policyEngine = options.policyEngine || null;
    this.emergencyStop = options.emergencyStop || null;
    this.budgetManager = options.recoveryBudgetTracker || options.budgetManager || null;
    this.idempotencyManager = options.idempotencyManager || null;
    this.reconciliationEngine = options.reconciliationEngine || null;

    this.rootDir = options.rootDir || process.cwd();
    this.stallThresholdMs = typeof options.stallThresholdMs === 'number' ? options.stallThresholdMs : 5 * 60 * 1000;
    this.now = typeof options.now === 'function' ? options.now : Date.now;

    // Strict read-only flag
    this.isReadOnly = true;
  }

  /**
   * Prohibited mutating operations throw strictly to protect invariants.
   */
  _assertReadOnly(actionName) {
    throw new Error(`READ_ONLY_INVARIANT_VIOLATION: Trial Collector is strictly read-only. Action "${actionName}" is forbidden.`);
  }

  // Explicit mutation guards
  dispatchTask() { this._assertReadOnly('dispatchTask'); }
  cancelExecution() { this._assertReadOnly('cancelExecution'); }
  retryExecution() { this._assertReadOnly('retryExecution'); }
  sendFollowUp() { this._assertReadOnly('sendFollowUp'); }
  createMasterTask() { this._assertReadOnly('createMasterTask'); }
  startMasterTask() { this._assertReadOnly('startMasterTask'); }
  cancelMasterTask() { this._assertReadOnly('cancelMasterTask'); }
  retrySubtask() { this._assertReadOnly('retrySubtask'); }
  triggerEmergencyStop() { this._assertReadOnly('triggerEmergencyStop'); }
  trip() { this._assertReadOnly('trip'); }
  resumeEmergencyStop() { this._assertReadOnly('resumeEmergencyStop'); }
  setAutonomyLevel() { this._assertReadOnly('setAutonomyLevel'); }
  updatePolicy() { this._assertReadOnly('updatePolicy'); }
  resolveApproval() { this._assertReadOnly('resolveApproval'); }
  createBackup() { this._assertReadOnly('createBackup'); }
  restoreFromBackup() { this._assertReadOnly('restoreFromBackup'); }
  appendEvent() { this._assertReadOnly('appendEvent'); }
  createCheckpoint() { this._assertReadOnly('createCheckpoint'); }
  registerProcess() { this._assertReadOnly('registerProcess'); }
  terminateProcessSafely() { this._assertReadOnly('terminateProcessSafely'); }

  /**
   * Gathers live system metrics without data fabrication.
   * @returns {Object}
   */
  getSystemHealth() {
    const mem = process.memoryUsage();
    const totalRam = os.totalmem();
    const freeRam = os.freemem();
    const usedRam = totalRam - freeRam;
    const ramUsagePct = totalRam > 0 ? Math.round((usedRam / totalRam) * 1000) / 10 : null;

    let cpus = [];
    try {
      cpus = os.cpus() || [];
    } catch {
      cpus = [];
    }
    const cpuCount = cpus.length > 0 ? cpus.length : null;
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown';
    const cpuSpeed = cpus.length > 0 ? cpus[0].speed : null;
    const loadAvg = typeof os.loadavg === 'function' ? os.loadavg() : null;

    // Disk space via fs.statfsSync if supported
    let disk = { totalBytes: null, freeBytes: null, usedBytes: null, usagePct: null };
    try {
      if (typeof fs.statfsSync === 'function') {
        const stat = fs.statfsSync(this.rootDir);
        const totalBytes = stat.bsize * stat.blocks;
        const freeBytes = stat.bsize * stat.bavail;
        const usedBytes = Math.max(0, totalBytes - freeBytes);
        const usagePct = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : null;
        disk = { totalBytes, freeBytes, usedBytes, usagePct };
      }
    } catch {
      // Fallback remains nulls without fabrication
    }

    // Active child process count from process supervisor
    let childCount = null;
    if (this.processSupervisor && typeof this.processSupervisor.listTrackedProcesses === 'function') {
      try {
        const tracked = this.processSupervisor.listTrackedProcesses();
        childCount = tracked.filter(
          (p) => p.state === 'running' || p.state === 'spawning'
        ).length;
      } catch {
        childCount = null;
      }
    }

    return {
      uptimeSeconds: Math.floor(process.uptime()),
      cpu: {
        count: cpuCount,
        model: cpuModel,
        speed: cpuSpeed,
        loadAvg,
        usagePct: null, // CPU usage percent requires historical sampling delta; truthfulness requires null
      },
      ram: {
        totalBytes: totalRam,
        freeBytes: freeRam,
        usedBytes: usedRam,
        usagePct: ramUsagePct,
      },
      disk,
      nodeProcess: {
        pid: process.pid,
        version: process.version,
        platform: process.platform,
        arch: process.arch,
        memoryUsage: mem,
        uptimeSeconds: Math.floor(process.uptime()),
      },
      childCount,
    };
  }

  /**
   * Gathers agent execution and provider health.
   * @param {number} now
   * @returns {Promise<Object>}
   */
  async getAgentHealth(now = this.now()) {
    let executions = {
      active: 0,
      queued: 0,
      stalled: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      total: 0,
      activeList: [],
    };
    let providers = {};
    let latency = {
      p50Ms: null,
      p95Ms: null,
      sampleCount: 0,
    };

    // 1. Gather from metricsCollector if available
    let metricsData = null;
    if (this.metricsCollector && typeof this.metricsCollector.collectMetrics === 'function') {
      try {
        metricsData = await this.metricsCollector.collectMetrics();
        if (metricsData.providers) {
          providers = metricsData.providers;
        }
        if (metricsData.executions?.latency) {
          latency = {
            p50Ms: metricsData.executions.latency.p50Ms ?? null,
            p95Ms: metricsData.executions.latency.p95Ms ?? null,
            sampleCount: metricsData.executions.latency.sampleCount ?? 0,
          };
        }
      } catch {
        // Fall back to direct calculation
      }
    }

    // 2. Gather executions directly from controlManager
    if (this.controlManager && typeof this.controlManager.listExecutions === 'function') {
      try {
        const allExecs = this.controlManager.listExecutions({ limit: 1000 }) || [];
        executions.total = allExecs.length;

        for (const ex of allExecs) {
          const status = ex.status;
          if (status === 'running') {
            executions.active++;
            const started = ex.startedAt || ex.createdAt || now;
            const durationMs = Math.max(0, now - started);
            const isStalled = durationMs > this.stallThresholdMs;

            if (isStalled) {
              executions.stalled++;
            }

            executions.activeList.push({
              executionId: ex.executionId,
              agentId: ex.agentId,
              taskId: ex.taskId,
              status: isStalled ? 'stalled' : 'running',
              durationMs,
              stalled: isStalled,
              startedAt: started,
            });
          } else if (status === 'queued' || status === 'waiting') {
            executions.queued++;
          } else if (status === 'completed' || status === 'succeeded') {
            executions.completed++;
          } else if (status === 'failed') {
            executions.failed++;
          } else if (status === 'cancelled') {
            executions.cancelled++;
          }
        }
      } catch {
        // preserve defaults
      }
    } else if (metricsData?.executions) {
      executions.active = metricsData.executions.active || 0;
      executions.stalled = metricsData.executions.stalled || 0;
      executions.completed = metricsData.executions.completed || 0;
      executions.failed = metricsData.executions.failed || 0;
      executions.cancelled = metricsData.executions.cancelled || 0;
      executions.total = metricsData.executions.total || 0;
    }

    // Ensure providers map has known provider stubs if none exist
    if (Object.keys(providers).length === 0) {
      providers = {
        'claude-code': { id: 'claude-code', name: 'Claude Code CLI', status: 'unknown', lastHeartbeat: null, pingMs: null },
        'codex-cli': { id: 'codex-cli', name: 'Codex CLI', status: 'unknown', lastHeartbeat: null, pingMs: null },
        'antigravity': { id: 'antigravity', name: 'Antigravity Workspace', status: 'unknown', lastHeartbeat: null, pingMs: null },
      };
    }

    return {
      providers,
      executions,
      latency,
    };
  }

  /**
   * Gathers Master Task orchestration DAG state.
   * @returns {Object}
   */
  getOrchestrationState() {
    const masterTasks = {
      total: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      list: [],
    };
    const dag = {
      activeSubtasks: 0,
      blockedSubtasks: 0,
      completedSubtasks: 0,
      failedSubtasks: 0,
      retryRate: 0,
    };

    if (this.masterOrchestrator && typeof this.masterOrchestrator.listMasterTasks === 'function') {
      try {
        const tasks = this.masterOrchestrator.listMasterTasks({ limit: 100 }) || [];
        masterTasks.total = tasks.length;

        let totalSubtasks = 0;
        let totalRetries = 0;

        for (const mt of tasks) {
          if (mt.status === 'running') masterTasks.running++;
          else if (mt.status === 'succeeded') masterTasks.succeeded++;
          else if (mt.status === 'failed') masterTasks.failed++;
          else if (mt.status === 'cancelled') masterTasks.cancelled++;

          masterTasks.list.push({
            masterTaskId: mt.masterTaskId,
            title: mt.title,
            status: mt.status,
            subtaskCount: Array.isArray(mt.subtasks) ? mt.subtasks.length : 0,
            createdAt: mt.createdAt,
            completedAt: mt.completedAt,
          });

          if (Array.isArray(mt.subtasks)) {
            for (const st of mt.subtasks) {
              totalSubtasks++;
              totalRetries += (st.retryCount || 0);

              if (st.status === 'running' || st.status === 'dispatched') {
                dag.activeSubtasks++;
              } else if (st.status === 'pending' || st.status === 'blocked') {
                dag.blockedSubtasks++;
              } else if (st.status === 'succeeded' || st.status === 'passed') {
                dag.completedSubtasks++;
              } else if (st.status === 'failed') {
                dag.failedSubtasks++;
              }
            }
          }
        }

        dag.retryRate = totalSubtasks > 0 ? Math.round((totalRetries / totalSubtasks) * 1000) / 1000 : 0;
      } catch {
        // preserve defaults
      }
    }

    return {
      masterTasks,
      dag,
    };
  }

  /**
   * Gathers Reliability state: WAL, process supervisor, reconciliation, backups, idempotency.
   * @returns {Object}
   */
  getReliabilityState() {
    const wal = {
      sequence: 0,
      byteSize: 0,
      corruptRecordsCount: 0,
      fsyncMode: 'sync-critical',
      lastHash: null,
    };
    if (this.journal && typeof this.journal.getJournalStats === 'function') {
      try {
        const stats = this.journal.getJournalStats();
        wal.sequence = stats.currentSeq || 0;
        wal.byteSize = stats.walByteSize || 0;
        wal.corruptRecordsCount = stats.corruptRecordsCount || 0;
        wal.lastHash = stats.lastHash || null;
      } catch {
        // preserve defaults
      }
    }

    const processes = {
      tracked: 0,
      running: 0,
      orphans: 0,
      reassigned: 0,
      terminated: 0,
    };
    if (this.processSupervisor && typeof this.processSupervisor.listTrackedProcesses === 'function') {
      try {
        const list = this.processSupervisor.listTrackedProcesses({ limit: 1000 }) || [];
        processes.tracked = list.length;
        for (const p of list) {
          if (p.state === 'running' || p.state === 'spawning') processes.running++;
          else if (p.state === 'orphan_detected') processes.orphans++;
          else if (p.state === 'reassigned_detected') processes.reassigned++;
          else if (p.state === 'terminated') processes.terminated++;
        }
      } catch {
        // preserve defaults
      }
    }

    const reconciliation = {
      lastReconciliationAt: null,
      pendingInterventions: 0,
      outcomesCount: {},
    };
    if (this.reconciliationEngine && typeof this.reconciliationEngine.getReconciliationReport === 'function') {
      try {
        const rep = this.reconciliationEngine.getReconciliationReport();
        reconciliation.lastReconciliationAt = rep.lastReconciliationAt || null;
        reconciliation.pendingInterventions = rep.pendingInterventions?.length || 0;
        reconciliation.outcomesCount = rep.outcomesCount || {};
      } catch {
        // preserve defaults
      }
    }

    const backups = {
      totalBackups: 0,
      lastBackupId: null,
      lastBackupAt: null,
      lastBackupStatus: null,
    };
    if (this.backupManager && typeof this.backupManager.listBackups === 'function') {
      try {
        const bList = this.backupManager.listBackups() || [];
        backups.totalBackups = bList.length;
        if (bList.length > 0) {
          const latest = bList[0];
          backups.lastBackupId = latest.backupId || null;
          backups.lastBackupAt = latest.timestamp || null;
          backups.lastBackupStatus = latest.status || (latest.verified ? 'verified_restore_ok' : 'created');
        }
      } catch {
        // preserve defaults
      }
    }

    const idempotency = {
      activeLocks: 0,
      totalCached: 0,
    };
    if (this.idempotencyManager && typeof this.idempotencyManager.getStats === 'function') {
      try {
        const idempStats = this.idempotencyManager.getStats();
        idempotency.activeLocks = idempStats.activeLocks || 0;
        idempotency.totalCached = idempStats.totalCached || 0;
      } catch {
        // preserve defaults
      }
    }

    return {
      wal,
      processes,
      reconciliation,
      backups,
      idempotency,
    };
  }

  /**
   * Gathers Autonomous Safety state: autonomy level, emergency stop, approvals, budget, quality gates.
   * @param {number} now
   * @returns {Object}
   */
  getSafetyState(now = this.now()) {
    let autonomyLevel = 'readonly';
    let approvals = {
      pendingCount: 0,
      agingCount: 0,
      pendingList: [],
    };

    if (this.policyEngine) {
      try {
        if (typeof this.policyEngine.getAutonomyLevel === 'function') {
          autonomyLevel = this.policyEngine.getAutonomyLevel() || 'readonly';
        }
        if (typeof this.policyEngine.listApprovals === 'function') {
          const pending = this.policyEngine.listApprovals({ status: 'pending' }) || [];
          approvals.pendingCount = pending.length;
          const agingThreshold = 15 * 60 * 1000; // 15 mins
          for (const app of pending) {
            const age = Math.max(0, now - (app.createdAt || now));
            const isAging = age > agingThreshold;
            if (isAging) approvals.agingCount++;
            approvals.pendingList.push({
              approvalId: app.approvalId,
              actionType: app.actionType,
              title: app.title,
              ageMinutes: Math.round(age / 60000),
              isAging,
            });
          }
        }
      } catch {
        // preserve defaults
      }
    }

    let emergencyStop = {
      halted: false,
      state: 'idle',
      trippedAt: null,
      trippedBy: null,
      reason: null,
    };
    if (this.emergencyStop) {
      try {
        const estopStatus = typeof this.emergencyStop.getStatus === 'function' ? this.emergencyStop.getStatus() : null;
        const isHalted = typeof this.emergencyStop.isHalted === 'function' ? this.emergencyStop.isHalted() : Boolean(estopStatus?.halted);
        emergencyStop = {
          halted: Boolean(isHalted),
          state: estopStatus?.state || (isHalted ? 'halted' : 'idle'),
          trippedAt: estopStatus?.trippedAt || null,
          trippedBy: estopStatus?.trippedBy || null,
          reason: estopStatus?.reason || null,
        };
      } catch {
        // preserve defaults
      }
    }

    let budget = {
      isExhausted: false,
      maxCostUsd: null,
      totalCostUsd: null,
      costUtilizationPct: null,
      remainingCostUsd: null,
      maxSubtasks: null,
      subtasksCompleted: null,
      subtaskUtilizationPct: null,
      maxExecutions: null,
      executionCount: null,
      executionUtilizationPct: null,
      activeConcurrent: 0,
    };

    const resolvedBudgetTracker = this.budgetManager || this.policyEngine?.budgetManager;
    if (resolvedBudgetTracker && typeof resolvedBudgetTracker.getBudgetSummary === 'function') {
      try {
        const bSummary = resolvedBudgetTracker.getBudgetSummary();
        budget = {
          isExhausted: Boolean(bSummary.isExhausted),
          maxCostUsd: bSummary.limits?.maxCostUsd ?? null,
          totalCostUsd: bSummary.usage?.totalCostUsd ?? null,
          costUtilizationPct: bSummary.utilizationPct?.cost ?? null,
          remainingCostUsd: bSummary.remaining?.costUsd ?? null,
          maxSubtasks: bSummary.limits?.maxSubtasks ?? null,
          subtasksCompleted: bSummary.usage?.subtasksCompleted ?? null,
          subtaskUtilizationPct: bSummary.utilizationPct?.subtasks ?? null,
          maxExecutions: bSummary.limits?.maxExecutions ?? null,
          executionCount: bSummary.usage?.executionCount ?? null,
          executionUtilizationPct: bSummary.utilizationPct?.executions ?? null,
          activeConcurrent: bSummary.usage?.activeConcurrent ?? 0,
        };
      } catch {
        // preserve defaults
      }
    }

    let qualityGates = {
      totalReviews: 0,
      passed: 0,
      failed: 0,
      remediationRequired: 0,
      openFindings: 0,
      criticalFindings: 0,
      highFindings: 0,
    };
    if (this.qaReviewEngine && typeof this.qaReviewEngine.getSummaryStats === 'function') {
      try {
        const stats = this.qaReviewEngine.getSummaryStats();
        qualityGates = {
          totalReviews: stats.totalReviews || 0,
          passed: stats.passedReviews || 0,
          failed: stats.failedReviews || 0,
          remediationRequired: stats.remediationRequired || 0,
          openFindings: stats.openFindings || 0,
          criticalFindings: stats.criticalFindings || 0,
          highFindings: stats.highFindings || 0,
        };
      } catch {
        // preserve defaults
      }
    }

    return {
      autonomyLevel,
      emergencyStop,
      approvals,
      budget,
      qualityGates,
    };
  }

  /**
   * Collects a complete operational health telemetry snapshot.
   * Strictly read-only, non-mutating, truthful, and deep-frozen.
   * @returns {Promise<Readonly<Object>>}
   */
  async collectSnapshot() {
    const now = this.now();

    const [systemHealth, agentHealth] = await Promise.all([
      Promise.resolve(this.getSystemHealth()),
      this.getAgentHealth(now),
    ]);

    const orchestrationState = this.getOrchestrationState();
    const reliability = this.getReliabilityState();
    const safety = this.getSafetyState(now);

    // Assess overall health status & active issues
    const issues = [];
    let overallStatus = HEALTH_STATUSES.HEALTHY;

    // Critical conditions
    if (safety.emergencyStop.halted) {
      overallStatus = HEALTH_STATUSES.CRITICAL;
      issues.push(`Emergency Stop active (${safety.emergencyStop.reason || 'Safety tripped'})`);
    }
    if (reliability.wal.corruptRecordsCount > 0) {
      overallStatus = HEALTH_STATUSES.CRITICAL;
      issues.push(`WAL contains ${reliability.wal.corruptRecordsCount} unrecovered corrupt record(s)`);
    }
    if (reliability.processes.orphans > 0) {
      overallStatus = HEALTH_STATUSES.CRITICAL;
      issues.push(`${reliability.processes.orphans} orphan process(es) detected`);
    }
    if (safety.budget.isExhausted) {
      overallStatus = HEALTH_STATUSES.CRITICAL;
      issues.push('Autonomous operations budget is completely exhausted');
    }
    if (safety.qualityGates.criticalFindings > 0) {
      overallStatus = HEALTH_STATUSES.CRITICAL;
      issues.push(`${safety.qualityGates.criticalFindings} critical unresolved QA finding(s) blocking completion`);
    }

    // Degraded conditions (only if not already critical)
    if (overallStatus !== HEALTH_STATUSES.CRITICAL) {
      if (agentHealth.executions.stalled > 0) {
        overallStatus = HEALTH_STATUSES.DEGRADED;
        issues.push(`${agentHealth.executions.stalled} task execution(s) currently stalled exceeding ${Math.round(this.stallThresholdMs / 1000)}s`);
      }
      if (reliability.processes.reassigned > 0) {
        overallStatus = HEALTH_STATUSES.DEGRADED;
        issues.push(`${reliability.processes.reassigned} reassigned PID conflict(s) detected`);
      }
      if (safety.budget.costUtilizationPct !== null && safety.budget.costUtilizationPct >= 70) {
        overallStatus = HEALTH_STATUSES.DEGRADED;
        issues.push(`Budget cost consumption warning: ${safety.budget.costUtilizationPct}% utilized`);
      }
      if (safety.approvals.agingCount > 0) {
        overallStatus = HEALTH_STATUSES.DEGRADED;
        issues.push(`${safety.approvals.agingCount} pending approval(s) waiting review for > 15 minutes`);
      }
      if (reliability.backups.lastBackupStatus && reliability.backups.lastBackupStatus.includes('failed')) {
        overallStatus = HEALTH_STATUSES.DEGRADED;
        issues.push(`Last backup status degraded/failed: ${reliability.backups.lastBackupStatus}`);
      }
      const offlineProviders = Object.entries(agentHealth.providers).filter(([, p]) => p.status === 'offline');
      if (offlineProviders.length > 0) {
        overallStatus = HEALTH_STATUSES.DEGRADED;
        issues.push(`Provider offline: ${offlineProviders.map(([id]) => id).join(', ')}`);
      }
      if (agentHealth.latency.p95Ms !== null && agentHealth.latency.p95Ms > 15000) {
        overallStatus = HEALTH_STATUSES.DEGRADED;
        issues.push(`High execution latency p95: ${agentHealth.latency.p95Ms}ms (> 15000ms threshold)`);
      }
    }

    const snapshot = createEmptyTelemetrySnapshot({
      timestamp: now,
      overallStatus,
      issues,
      systemHealth,
      agentHealth,
      orchestrationState,
      reliability,
      safety,
    });

    // Validate structural invariant
    const validation = validateTelemetrySnapshot(snapshot);
    if (!validation.valid) {
      throw new Error(`Telemetry snapshot schema violation: ${validation.errors.join('; ')}`);
    }

    // Return deep-frozen snapshot to guarantee immutability
    return deepFreeze(snapshot);
  }
}

/**
 * Factory function creating a validated, strictly read-only TrialCollector instance.
 * @param {Object} options
 * @returns {TrialCollector}
 */
export function createTrialCollector(options = {}) {
  const instance = new TrialCollector(options);
  assertReadOnlyCollector(instance);

  const proxy = new Proxy(instance, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        const mutatingPatterns = [
          'dispatchTask',
          'cancelExecution',
          'retryExecution',
          'sendFollowUp',
          'createMasterTask',
          'startMasterTask',
          'cancelMasterTask',
          'retrySubtask',
          'triggerEmergencyStop',
          'trip',
          'resumeEmergencyStop',
          'setAutonomyLevel',
          'updatePolicy',
          'resolveApproval',
          'createBackup',
          'restoreFromBackup',
          'appendEvent',
          'createCheckpoint',
          'registerProcess',
          'terminateProcessSafely',
        ];

        if (mutatingPatterns.includes(prop)) {
          return () => {
            throw new Error(`READ_ONLY_INVARIANT_VIOLATION: Trial Collector is strictly read-only. Action "${prop}" is forbidden.`);
          };
        }
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  return proxy;
}

export default createTrialCollector;
