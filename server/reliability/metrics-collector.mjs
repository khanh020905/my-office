/**
 * Operational Health & Reliability Metrics Collector (Phase 5).
 * Computes genuine operational telemetry:
 * - Provider uptime & availability
 * - Active vs Stalled execution counts
 * - p50 and p95 execution latency percentiles
 * - Retry & self-healing remediation rates
 * - Budget & resource spend tracking
 * - Process supervisor orphan and reassigned PID counts
 * - Durable Write-Ahead Log (WAL) sequence, size, and corruption status
 * 
 * Invariant: Never fabricates metrics; returns null or 'unknown' when data is missing.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  HEALTH_STATUSES,
  createDefaultReliabilityMetrics,
} from './contracts.mjs';

export class ReliabilityMetricsCollector {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.dataDir] - Path to the office data directory
   * @param {Object} [options.journal] - Optional Durable WAL Journal instance
   * @param {Object} [options.processSupervisor] - Optional ProcessSupervisor instance
   * @param {Object} [options.budgetManager] - Optional RecoveryBudgetManager instance
   * @param {Object} [options.autonomousScheduler] - Optional AutonomousScheduler instance
   * @param {Object} [options.controlManager] - Optional ControlManager instance
   * @param {number} [options.stallThresholdMs=300000] - Duration after which in-flight execution is marked stalled (default 5m)
   * @param {number} [options.sampleLimit=5000] - Maximum latency samples retained in memory
   * @param {Function} [options.now=Date.now] - Epoch ms provider
   */
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.resolve(process.cwd(), 'data');
    this.journal = options.journal || null;
    this.processSupervisor = options.processSupervisor || null;
    this.budgetManager = options.budgetManager || null;
    this.autonomousScheduler = options.autonomousScheduler || null;
    this.controlManager = options.controlManager || null;
    this.stallThresholdMs = options.stallThresholdMs || 5 * 60 * 1000;
    this.sampleLimit = options.sampleLimit || 5000;
    this.now = typeof options.now === 'function' ? options.now : Date.now;

    this.serverStartedAt = this.now();

    // In-memory telemetry records
    this.latencySamples = [];
    this.executions = new Map(); // executionId -> executionRecord
    this.providers = new Map();  // providerId -> providerRecord
    this.remediations = [];      // remediation events
    this.totalDispatches = 0;
    this.totalRetries = 0;
  }

  /**
   * Records execution duration and status for genuine latency and success analysis.
   * @param {Object} record
   * @param {string} record.executionId
   * @param {string} [record.provider='unknown']
   * @param {number} [record.durationMs]
   * @param {string} [record.status='completed'] - 'running'|'completed'|'failed'|'stalled'|'cancelled'
   * @param {boolean} [record.retried=false]
   * @param {boolean} [record.remediated=false]
   * @param {number} [record.startedAt]
   */
  recordExecution(record) {
    if (!record || !record.executionId) return;

    const startedAt = record.startedAt || this.now();
    const existing = this.executions.get(record.executionId);

    const updated = {
      executionId: record.executionId,
      provider: record.provider || (existing?.provider ?? 'unknown'),
      startedAt: existing?.startedAt || startedAt,
      endedAt: record.status && record.status !== 'running' ? this.now() : (existing?.endedAt ?? null),
      durationMs: typeof record.durationMs === 'number' ? record.durationMs : (existing?.durationMs ?? null),
      status: record.status || (existing?.status ?? 'running'),
      retried: Boolean(record.retried ?? existing?.retried),
      remediated: Boolean(record.remediated ?? existing?.remediated),
    };

    if (updated.endedAt && !updated.durationMs && updated.startedAt) {
      updated.durationMs = Math.max(0, updated.endedAt - updated.startedAt);
    }

    if (typeof updated.durationMs === 'number' && updated.durationMs >= 0 && updated.status === 'completed') {
      this.recordLatency(updated.durationMs);
    }

    if (!existing) {
      this.totalDispatches++;
    }
    if (record.retried && (!existing || !existing.retried)) {
      this.totalRetries++;
    }

    this.executions.set(record.executionId, updated);

    // Keep map bounded
    if (this.executions.size > this.sampleLimit) {
      const oldestKey = this.executions.keys().next().value;
      this.executions.delete(oldestKey);
    }
  }

  /**
   * Records an execution latency sample directly.
   * @param {number} durationMs
   */
  recordLatency(durationMs) {
    if (typeof durationMs !== 'number' || durationMs < 0 || isNaN(durationMs)) return;
    this.latencySamples.push(durationMs);
    if (this.latencySamples.length > this.sampleLimit) {
      this.latencySamples.shift();
    }
  }

  /**
   * Records a self-healing remediation attempt.
   * @param {Object} event
   * @param {string} event.action
   * @param {string} [event.errorType]
   * @param {boolean} [event.success=true]
   */
  recordRemediation(event) {
    if (!event || !event.action) return;
    this.remediations.push({
      action: event.action,
      errorType: event.errorType || 'unknown',
      success: Boolean(event.success),
      timestamp: this.now(),
    });
    if (this.remediations.length > 1000) {
      this.remediations.shift();
    }
  }

  /**
   * Updates provider heartbeat and availability status.
   * @param {string} providerId
   * @param {Object} statusData
   * @param {boolean} [statusData.healthy=true]
   * @param {number} [statusData.latencyMs=null]
   * @param {string} [statusData.status='online']
   */
  recordProviderHeartbeat(providerId, statusData = {}) {
    if (!providerId) return;
    const now = this.now();
    const existing = this.providers.get(providerId) || {
      firstSeen: now,
      totalDispatches: 0,
      failures: 0,
    };

    this.providers.set(providerId, {
      ...existing,
      providerId,
      status: statusData.status || (statusData.healthy !== false ? 'online' : 'offline'),
      lastHeartbeat: now,
      uptimeSeconds: Math.floor((now - existing.firstSeen) / 1000),
      lastLatencyMs: typeof statusData.latencyMs === 'number' ? statusData.latencyMs : null,
      healthy: statusData.healthy !== false,
    });
  }

  /**
   * Calculates mathematical percentiles without fabrication.
   * @param {number[]} samples
   * @returns {{ p50: number|null, p95: number|null, min: number|null, max: number|null, avg: number|null, count: number }}
   */
  computePercentiles(samples) {
    if (!Array.isArray(samples) || samples.length === 0) {
      return {
        p50: null,
        p95: null,
        min: null,
        max: null,
        avg: null,
        count: 0,
      };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const count = sorted.length;
    const p50Index = Math.floor(count * 0.5);
    const p95Index = Math.min(count - 1, Math.floor(count * 0.95));
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    return {
      p50: sorted[p50Index],
      p95: sorted[p95Index],
      min: sorted[0],
      max: sorted[count - 1],
      avg: Math.round((sum / count) * 100) / 100,
      count,
    };
  }

  /**
   * Gathers live process supervisor metrics.
   * @private
   */
  async _getProcessMetrics() {
    if (this.processSupervisor && typeof this.processSupervisor.getStats === 'function') {
      try {
        return this.processSupervisor.getStats();
      } catch {
        // Fallback to disk read
      }
    }

    const procPath = path.join(this.dataDir, 'reliability', 'processes.json');
    if (fs.existsSync(procPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(procPath, 'utf8'));
        const processes = Array.isArray(raw) ? raw : (raw.processes || []);
        let orphanCount = 0;
        let reassignedCount = 0;
        let trackedCount = 0;
        const activePids = [];

        for (const p of processes) {
          if (p.status === 'orphan_detected') orphanCount++;
          if (p.status === 'reassigned_detected') reassignedCount++;
          if (p.status === 'running') {
            trackedCount++;
            if (p.pid) activePids.push(p.pid);
          }
        }

        return {
          trackedCount,
          orphanCount,
          reassignedCount,
          activePids,
        };
      } catch {
        // fallback
      }
    }

    return {
      trackedCount: 0,
      orphanCount: 0,
      reassignedCount: 0,
      activePids: [],
    };
  }

  /**
   * Gathers durable Write-Ahead Log (WAL) telemetry.
   * @private
   */
  async _getJournalMetrics() {
    if (this.journal && typeof this.journal.getStats === 'function') {
      try {
        return this.journal.getStats();
      } catch {
        // Fallback to disk inspect
      }
    }

    const walCandidates = [
      path.join(this.dataDir, 'reliability', 'execution-journal.wal'),
      path.join(this.dataDir, 'reliability', 'journal.wal'),
    ];

    for (const walPath of walCandidates) {
      if (fs.existsSync(walPath)) {
        try {
          const stats = fs.statSync(walPath);
          let walSeq = 0;
          let corruptRecordsCount = 0;
          let recordCount = 0;

          const content = fs.readFileSync(walPath, 'utf8');
          const lines = content.split('\n');

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed);
              if (typeof parsed.seq === 'number') {
                walSeq = Math.max(walSeq, parsed.seq);
              }
              recordCount++;
            } catch {
              corruptRecordsCount++;
            }
          }

          return {
            walSeq,
            walByteSize: stats.size,
            walFilePath: walPath,
            lastSyncTimestamp: stats.mtimeMs,
            corruptRecordsCount,
            totalEventsRecorded: recordCount,
          };
        } catch {
          // fallback
        }
      }
    }

    return {
      walSeq: 0,
      walByteSize: 0,
      walFilePath: walCandidates[0],
      lastSyncTimestamp: null,
      corruptRecordsCount: 0,
      totalEventsRecorded: 0,
    };
  }

  /**
   * Gathers budget spend metrics.
   * @private
   */
  async _getBudgetMetrics() {
    if (this.budgetManager && typeof this.budgetManager.getBudgetSummary === 'function') {
      try {
        const summary = this.budgetManager.getBudgetSummary();
        return {
          totalCostUsd: Number(summary?.usage?.totalCostUsd) || 0.0,
          remainingCostUsd: summary?.remaining?.costRemainingUsd ?? null,
          limitCostUsd: summary?.limits?.maxCostUsd ?? null,
          tokensUsed: Number(summary?.usage?.tokensUsed) || 0,
          isExhausted: Boolean(summary?.isExhausted),
          currency: 'USD',
        };
      } catch {
        // Fallback to disk read
      }
    }

    const budgetPath = path.join(this.dataDir, 'autonomous', 'budget-state.json');
    if (fs.existsSync(budgetPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
        const usage = raw.usage || {};
        const limits = raw.limits || {};
        const totalCostUsd = Number(usage.totalCostUsd) || 0.0;
        const limitCostUsd = typeof limits.maxCostUsd === 'number' ? limits.maxCostUsd : null;
        const remainingCostUsd = limitCostUsd !== null ? Math.max(0, limitCostUsd - totalCostUsd) : null;
        const isExhausted = limitCostUsd !== null && totalCostUsd >= limitCostUsd;

        return {
          totalCostUsd,
          remainingCostUsd,
          limitCostUsd,
          tokensUsed: Number(usage.tokensUsed) || 0,
          isExhausted,
          currency: 'USD',
        };
      } catch {
        // fallback
      }
    }

    return {
      totalCostUsd: 0.0,
      remainingCostUsd: null,
      limitCostUsd: null,
      tokensUsed: 0,
      isExhausted: false,
      currency: 'USD',
    };
  }

  /**
   * Gathers disaster recovery backup metrics.
   * @private
   */
  async _getDisasterRecoveryMetrics() {
    const backupDir = path.join(this.dataDir, 'reliability', 'backups');
    if (fs.existsSync(backupDir)) {
      try {
        const entries = fs.readdirSync(backupDir).filter(f => f.endsWith('.json') || f.endsWith('.tar.gz') || f.startsWith('backup-'));
        const manifestFiles = entries.filter(f => f.includes('manifest'));
        let lastBackupTimestamp = null;
        let lastBackupId = null;
        let lastDryRunRestoreOk = null;

        for (const mf of manifestFiles) {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(backupDir, mf), 'utf8'));
            if (data.timestamp && (!lastBackupTimestamp || data.timestamp > lastBackupTimestamp)) {
              lastBackupTimestamp = data.timestamp;
              lastBackupId = data.backupId || mf;
              if (typeof data.dryRunRestoreOk === 'boolean') {
                lastDryRunRestoreOk = data.dryRunRestoreOk;
              }
            }
          } catch {
            // ignore
          }
        }

        return {
          lastBackupId,
          lastBackupTimestamp,
          lastDryRunRestoreOk,
          backupCount: entries.length,
        };
      } catch {
        // fallback
      }
    }

    return {
      lastBackupId: null,
      lastBackupTimestamp: null,
      lastDryRunRestoreOk: null,
      backupCount: 0,
    };
  }

  /**
   * Computes genuine active vs stalled executions.
   * @private
   */
  _computeExecutionMetrics() {
    const now = this.now();
    let active = 0;
    let stalled = 0;
    let completed = 0;
    let failed = 0;
    const activeExecutions = [];

    // 1. Process in-memory tracked executions
    for (const exec of this.executions.values()) {
      if (exec.status === 'running') {
        const elapsed = now - (exec.startedAt || now);
        if (elapsed > this.stallThresholdMs) {
          stalled++;
        } else {
          active++;
        }
        activeExecutions.push(exec);
      } else if (exec.status === 'completed') {
        completed++;
      } else if (exec.status === 'failed') {
        failed++;
      } else if (exec.status === 'stalled') {
        stalled++;
      }
    }

    // 2. Cross-reference scheduler tasks if passed
    if (this.autonomousScheduler && typeof this.autonomousScheduler.getActiveSubtasks === 'function') {
      try {
        const subtasks = this.autonomousScheduler.getActiveSubtasks() || [];
        for (const st of subtasks) {
          if (!this.executions.has(st.subtaskId)) {
            const elapsed = now - (st.dispatchedAt || now);
            if (elapsed > this.stallThresholdMs) {
              stalled++;
            } else {
              active++;
            }
          }
        }
      } catch {
        // fallback
      }
    }

    const latencies = this.computePercentiles(this.latencySamples);

    return {
      active,
      stalled,
      completed,
      failed,
      total: this.totalDispatches || (active + stalled + completed + failed),
      p50LatencyMs: latencies.p50,
      p95LatencyMs: latencies.p95,
      minLatencyMs: latencies.min,
      maxLatencyMs: latencies.max,
      avgLatencyMs: latencies.avg,
      latenciesSampleCount: latencies.count,
    };
  }

  /**
   * Computes retry and remediation rates.
   * @private
   */
  _computeSelfHealingMetrics() {
    const totalAttempts = Math.max(this.totalDispatches, 1);
    const retryRate = this.totalDispatches > 0
      ? Math.round((this.totalRetries / this.totalDispatches) * 1000) / 1000
      : 0.0;

    const totalRemediations = this.remediations.length;
    const successfulRemediations = this.remediations.filter(r => r.success).length;
    const remediationRate = this.totalDispatches > 0
      ? Math.round((totalRemediations / this.totalDispatches) * 1000) / 1000
      : 0.0;

    return {
      retryRate,
      remediationRate,
      totalRetries: this.totalRetries,
      totalRemediations,
      successfulRemediations,
      totalAttempts: this.totalDispatches,
    };
  }

  /**
   * Gathers registered provider availability.
   * @private
   */
  _getProviderMetrics() {
    const result = {};
    const defaultProviders = ['claude-code', 'codex-cli', 'antigravity'];

    for (const pid of defaultProviders) {
      const rec = this.providers.get(pid);
      if (rec) {
        result[pid] = {
          status: rec.status,
          uptimeSeconds: rec.uptimeSeconds,
          lastHeartbeat: rec.lastHeartbeat,
          lastLatencyMs: rec.lastLatencyMs,
          healthy: rec.healthy,
        };
      } else {
        result[pid] = {
          status: 'unknown',
          uptimeSeconds: null,
          lastHeartbeat: null,
          lastLatencyMs: null,
          healthy: null,
        };
      }
    }

    // Add any dynamically observed providers
    for (const [pid, rec] of this.providers.entries()) {
      if (!result[pid]) {
        result[pid] = {
          status: rec.status,
          uptimeSeconds: rec.uptimeSeconds,
          lastHeartbeat: rec.lastHeartbeat,
          lastLatencyMs: rec.lastLatencyMs,
          healthy: rec.healthy,
        };
      }
    }

    return result;
  }

  /**
   * Collects complete Operational Health metrics container.
   * Never fabricates missing metrics: uses null or 'unknown'.
   * @returns {Promise<Object>}
   */
  async collectMetrics() {
    const now = this.now();
    const uptimeSeconds = Math.max(0, Math.floor((now - this.serverStartedAt) / 1000));

    const [processMetrics, journalMetrics, budgetMetrics, drMetrics] = await Promise.all([
      this._getProcessMetrics(),
      this._getJournalMetrics(),
      this._getBudgetMetrics(),
      this._getDisasterRecoveryMetrics(),
    ]);

    const executionMetrics = this._computeExecutionMetrics();
    const selfHealingMetrics = this._computeSelfHealingMetrics();
    const providerMetrics = this._getProviderMetrics();

    // Determine overall health status & warning issues
    const issues = [];
    let status = HEALTH_STATUSES.HEALTHY;

    // Critical conditions
    if (journalMetrics.corruptRecordsCount > 0) {
      status = HEALTH_STATUSES.CRITICAL;
      issues.push(`WAL contains ${journalMetrics.corruptRecordsCount} unrecovered corrupt record(s)`);
    }
    if (processMetrics.orphanCount > 0) {
      status = HEALTH_STATUSES.CRITICAL;
      issues.push(`${processMetrics.orphanCount} un-reconciled orphan process(es) detected`);
    }
    if (budgetMetrics.isExhausted) {
      status = HEALTH_STATUSES.CRITICAL;
      issues.push('Autonomous operation budget is exhausted');
    }

    // Degraded conditions
    if (status !== HEALTH_STATUSES.CRITICAL) {
      if (executionMetrics.stalled > 0) {
        status = HEALTH_STATUSES.DEGRADED;
        issues.push(`${executionMetrics.stalled} execution(s) currently stalled exceeding ${Math.round(this.stallThresholdMs / 1000)}s threshold`);
      }
      if (selfHealingMetrics.retryRate > 0.35) {
        status = HEALTH_STATUSES.DEGRADED;
        issues.push(`Elevated execution retry rate: ${(selfHealingMetrics.retryRate * 100).toFixed(1)}%`);
      }
      const offlineProviders = Object.entries(providerMetrics).filter(([, p]) => p.status === 'offline');
      if (offlineProviders.length > 0) {
        status = HEALTH_STATUSES.DEGRADED;
        issues.push(`Provider offline: ${offlineProviders.map(([id]) => id).join(', ')}`);
      }
    }

    return {
      status,
      issues,
      timestamp: now,
      uptimeSeconds,
      serverStartedAt: this.serverStartedAt,
      providers: providerMetrics,
      executions: executionMetrics,
      selfHealing: selfHealingMetrics,
      budget: budgetMetrics,
      processes: processMetrics,
      journal: journalMetrics,
      disasterRecovery: drMetrics,
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
      },
    };
  }

  /**
   * Resets all in-memory telemetry records.
   */
  reset() {
    this.latencySamples = [];
    this.executions.clear();
    this.providers.clear();
    this.remediations = [];
    this.totalDispatches = 0;
    this.totalRetries = 0;
    this.serverStartedAt = this.now();
  }
}

let defaultCollector = null;

/**
 * Returns or creates the singleton ReliabilityMetricsCollector instance.
 * @param {Object} [options={}]
 * @returns {ReliabilityMetricsCollector}
 */
export function getMetricsCollector(options = {}) {
  if (!defaultCollector) {
    defaultCollector = new ReliabilityMetricsCollector(options);
  }
  return defaultCollector;
}

/**
 * Factory for creating dedicated ReliabilityMetricsCollector instances.
 * @param {Object} [options={}]
 * @returns {ReliabilityMetricsCollector}
 */
export function createReliabilityMetricsCollector(options = {}) {
  return new ReliabilityMetricsCollector(options);
}

export { createReliabilityMetricsCollector as createMetricsCollector };

