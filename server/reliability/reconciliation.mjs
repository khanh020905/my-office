/**
 * Startup Reconciliation Engine (Phase 5).
 * Enforces Refinement 4: Safe Orphan Reconciliation on Startup.
 * Audits in-flight executions after reboot or crash, verifies OS process fingerprints,
 * strictly forbids blind redispatches, and routes unverified outcomes to operator intervention.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  RECONCILIATION_OUTCOMES,
  reconciliationRequiresIntervention,
  WAL_EVENT_TYPES,
} from './contracts.mjs';

export function createReconciliationEngine({
  processSupervisor,
  controlManager = null,
  masterOrchestrator = null,
  journal = null,
  storePath = null,
  now = Date.now,
} = {}) {
  const defaultStorePath = storePath || path.resolve(process.cwd(), 'data', 'reliability', 'reconciliation-report.json');

  let latestReport = null;

  function load() {
    if (!fs.existsSync(defaultStorePath)) return;
    try {
      latestReport = JSON.parse(fs.readFileSync(defaultStorePath, 'utf8'));
    } catch {
      // In-memory fallback
    }
  }

  function persist() {
    if (!latestReport) return;
    try {
      fs.mkdirSync(path.dirname(defaultStorePath), { recursive: true });
      const tmp = `${defaultStorePath}.tmp-${process.pid}-${now()}`;
      fs.writeFileSync(tmp, JSON.stringify(latestReport, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, defaultStorePath);
    } catch {
      // In-memory fallback
    }
  }

  load();

  /**
   * Reconciles a single execution record against OS process supervisor state.
   */
  function reconcileExecution(executionId, executionData = null) {
    const exec = executionData || (controlManager?.getExecution ? controlManager.getExecution(executionId) : null);
    const trackedProcess = processSupervisor?.getTrackedProcess ? processSupervisor.getTrackedProcess(executionId) : null;

    if (!exec && !trackedProcess) {
      return {
        executionId,
        outcome: RECONCILIATION_OUTCOMES.OUTCOME_UNKNOWN,
        reason: 'Execution not found in Control Manager or Process Supervisor',
        requiresIntervention: true,
      };
    }

    // Check terminal states
    if (exec && ['succeeded', 'failed', 'cancelled'].includes(exec.status)) {
      return {
        executionId,
        outcome: exec.status === 'succeeded' ? RECONCILIATION_OUTCOMES.COMPLETED : RECONCILIATION_OUTCOMES.FAILED,
        reason: `Execution was already terminal (${exec.status})`,
        requiresIntervention: false,
      };
    }

    // If no process fingerprint exists for an in-flight task -> Outcome unknown!
    if (!trackedProcess || !trackedProcess.fingerprint) {
      return {
        executionId,
        outcome: RECONCILIATION_OUTCOMES.OUTCOME_UNKNOWN,
        reason: 'In-flight execution has no recorded OS ProcessFingerprint. Outcome cannot be proven.',
        requiresIntervention: true,
      };
    }

    // Verify process identity in OS table
    const liveness = processSupervisor.verifyProcessLiveness(executionId);

    if (liveness.alive) {
      if (liveness.fingerprintMatches) {
        return {
          executionId,
          outcome: RECONCILIATION_OUTCOMES.STILL_RUNNING,
          pid: trackedProcess.fingerprint.pid,
          reason: 'Process is verified still running with valid ProcessFingerprint',
          requiresIntervention: false,
        };
      } else {
        // PID reused!
        return {
          executionId,
          outcome: RECONCILIATION_OUTCOMES.MANUAL_RECONCILIATION_REQUIRED,
          pid: trackedProcess.fingerprint.pid,
          reason: 'PID_REASSIGNED_DETECTED: OS re-assigned PID to another process. Operator intervention required.',
          requiresIntervention: true,
        };
      }
    }

    // Process is not alive
    // Did it leave a verifiable result or exit code?
    if (exec?.result) {
      return {
        executionId,
        outcome: RECONCILIATION_OUTCOMES.COMPLETED,
        reason: 'Process exited and left verifiable output result',
        requiresIntervention: false,
      };
    }

    if (exec?.status === 'running' || exec?.status === 'dispatching') {
      return {
        executionId,
        outcome: RECONCILIATION_OUTCOMES.FAILED,
        reason: 'Process exited unexpectedly without recording terminal state',
        requiresIntervention: false,
      };
    }

    return {
      executionId,
      outcome: RECONCILIATION_OUTCOMES.OUTCOME_UNKNOWN,
      reason: 'Process exited without clear completion evidence',
      requiresIntervention: true,
    };
  }

  /**
   * Sweeps all active executions across the system on startup.
   */
  function runReconciliation({ dryRun = false } = {}) {
    const timestamp = now();
    const records = [];

    // 1. Reconcile Process Supervisor OS table
    const supervisorResults = processSupervisor?.reconcileStartupProcesses ? processSupervisor.reconcileStartupProcesses() : {};

    // 2. Collect in-flight executions from ControlManager
    const inFlightExecutions = [];
    if (controlManager && typeof controlManager.listExecutions === 'function') {
      const all = controlManager.listExecutions();
      for (const ex of all) {
        if (['running', 'dispatching', 'queued', 'waiting'].includes(ex.status)) {
          inFlightExecutions.push(ex);
        }
      }
    }

    // Also include tracked processes from supervisor not in controlManager
    if (processSupervisor && typeof processSupervisor.listTrackedProcesses === 'function') {
      const tracked = processSupervisor.listTrackedProcesses();
      for (const p of tracked) {
        if (!inFlightExecutions.some((e) => e.executionId === p.executionId)) {
          inFlightExecutions.push({
            executionId: p.executionId,
            agentId: p.provider,
            status: 'running',
          });
        }
      }
    }

    let stillRunningCount = 0;
    let failedCount = 0;
    let completedCount = 0;
    let outcomeUnknownCount = 0;
    let manualInterventionCount = 0;

    for (const ex of inFlightExecutions) {
      const rec = reconcileExecution(ex.executionId, ex);
      records.push(rec);

      if (rec.outcome === RECONCILIATION_OUTCOMES.STILL_RUNNING) stillRunningCount++;
      else if (rec.outcome === RECONCILIATION_OUTCOMES.FAILED) failedCount++;
      else if (rec.outcome === RECONCILIATION_OUTCOMES.COMPLETED) completedCount++;
      else if (rec.outcome === RECONCILIATION_OUTCOMES.OUTCOME_UNKNOWN) outcomeUnknownCount++;
      else if (rec.outcome === RECONCILIATION_OUTCOMES.MANUAL_RECONCILIATION_REQUIRED) manualInterventionCount++;

      // INVARIANT: Blind redispatch is forbidden!
      // If not dry-run, safely update status in controlManager / masterOrchestrator
      if (!dryRun) {
        if (rec.outcome === RECONCILIATION_OUTCOMES.FAILED) {
          if (controlManager?.getExecution) {
            const live = controlManager.getExecution(ex.executionId);
            if (live) {
              live.status = 'failed';
              live.error = rec.reason;
              live.completedAt = timestamp;
            }
          }
        } else if (rec.outcome === RECONCILIATION_OUTCOMES.OUTCOME_UNKNOWN || rec.outcome === RECONCILIATION_OUTCOMES.MANUAL_RECONCILIATION_REQUIRED) {
          // Keep branch halted and require intervention
          if (controlManager?.getExecution) {
            const live = controlManager.getExecution(ex.executionId);
            if (live) {
              live.status = 'waiting';
              live.requiresIntervention = true;
              live.interventionReason = rec.reason;
            }
          }
        }
      }
    }

    latestReport = {
      timestamp,
      totalScanned: records.length,
      dryRun,
      stillRunningCount,
      failedCount,
      completedCount,
      outcomeUnknownCount,
      manualInterventionCount,
      requiresInterventionTotal: outcomeUnknownCount + manualInterventionCount,
      supervisorResults,
      records,
    };

    if (!dryRun) {
      persist();

      if (journal && typeof journal.appendEvent === 'function') {
        journal.appendEvent({
          eventType: WAL_EVENT_TYPES.RECONCILIATION_RUN,
          aggregateType: 'system',
          aggregateId: 'reconciliation',
          payload: {
            totalScanned: records.length,
            outcomeUnknownCount,
            manualInterventionCount,
          },
        });
      }
    }

    return latestReport;
  }

  /**
   * Resolves a pending operator intervention for an ambiguous execution outcome.
   */
  function resolveIntervention(executionId, {
    decision, // 'retry' | 'mark_failed' | 'mark_completed' | 'cancel'
    operatorId = 'operator',
    notes = '',
  } = {}) {
    if (!latestReport) {
      throw new Error('No reconciliation report available.');
    }

    const record = latestReport.records.find((r) => r.executionId === executionId);
    if (!record) {
      throw new Error(`Execution ${executionId} not found in reconciliation report.`);
    }

    record.resolved = true;
    record.resolvedAt = now();
    record.resolvedBy = operatorId;
    record.resolutionDecision = decision;
    record.resolutionNotes = notes;

    // Apply decision to ControlManager if available
    if (controlManager?.getExecution) {
      const exec = controlManager.getExecution(executionId);
      if (exec) {
        if (decision === 'mark_failed') {
          exec.status = 'failed';
          exec.error = notes || 'Marked failed by operator intervention';
        } else if (decision === 'mark_completed') {
          exec.status = 'succeeded';
          exec.result = notes || 'Marked completed by operator intervention';
        } else if (decision === 'cancel') {
          exec.status = 'cancelled';
        }
      }
    }

    persist();
    return record;
  }

  function getReconciliationReport() {
    return latestReport;
  }

  return {
    reconcileExecution,
    runReconciliation,
    resolveIntervention,
    getReconciliationReport,
  };
}
