/**
 * Emergency Stop Manager (Phase 4).
 * Provides instantaneous system-wide halt across all agent providers,
 * blocks new task dispatches immediately, and orchestrates active execution cancellation
 * with strict distinction between 'cancellation requested' and 'cancellation confirmed'.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  EMERGENCY_STOP_STATES,
  canTransitionEmergencyStop,
} from './contracts.mjs';
import { isHumanOperator } from './security-guard.mjs';

export const CANCELLATION_STATUSES = {
  REQUESTED: 'cancellation_requested',
  CONFIRMED: 'cancellation_confirmed',
  FAILED: 'cancellation_failed',
  UNSUPPORTED: 'cancellation_unsupported',
};

export class EmergencyStopActiveError extends Error {
  constructor(message, details = {}) {
    super(message || 'System is under Emergency Stop. All task dispatches are blocked.');
    this.name = 'EmergencyStopActiveError';
    this.code = 'EMERGENCY_STOP_ACTIVE';
    this.trippedAt = details.trippedAt || null;
    this.trippedBy = details.trippedBy || null;
    this.reason = details.reason || null;
    this.details = details;
  }
}

/**
 * Creates the Emergency Stop Manager.
 */
export function createEmergencyStopManager({
  controlManager = null,
  masterOrchestrator = null,
  tasksRunner = null,   // Claude tasks manager (server/tasks.mjs)
  codexRuns = null,     // Codex CLI runs manager (server/codex-runs.mjs)
  storePath = null,
  onHalt = null,
  onResume = null,
  now = Date.now,
} = {}) {
  const defaultStorePath = storePath || path.resolve(process.cwd(), 'data', 'autonomous', 'emergency-stop.json');

  let state = EMERGENCY_STOP_STATES.IDLE;
  let trippedAt = null;
  let trippedBy = null;
  let reason = null;
  let halted = false;

  // Tracked active executions during emergency stop: executionId -> record
  const trackedExecutions = new Map();
  const eventLog = [];

  function load() {
    if (!fs.existsSync(defaultStorePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(defaultStorePath, 'utf8'));
      if (data && typeof data === 'object') {
        state = data.state || EMERGENCY_STOP_STATES.IDLE;
        trippedAt = data.trippedAt || null;
        trippedBy = data.trippedBy || null;
        reason = data.reason || null;
        halted = state !== EMERGENCY_STOP_STATES.IDLE;

        if (Array.isArray(data.trackedExecutions)) {
          for (const item of data.trackedExecutions) {
            trackedExecutions.set(item.executionId, item);
          }
        }
        if (Array.isArray(data.eventLog)) {
          eventLog.push(...data.eventLog);
        }
      }
    } catch {
      // keep in-memory on error
    }
  }

  function persist() {
    try {
      fs.mkdirSync(path.dirname(defaultStorePath), { recursive: true });
      const tmp = `${defaultStorePath}.tmp-${process.pid}`;
      const payload = {
        version: '1.0.0',
        savedAt: now(),
        state,
        halted,
        trippedAt,
        trippedBy,
        reason,
        trackedExecutions: Array.from(trackedExecutions.values()).slice(-200),
        eventLog: eventLog.slice(-100),
      };
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, defaultStorePath);
    } catch {
      // retain in memory
    }
  }

  load();

  function logEvent(type, payload = {}) {
    const entry = {
      id: `ev_estop_${now()}_${crypto.randomBytes(2).toString('hex')}`,
      timestamp: now(),
      type,
      ...payload,
    };
    eventLog.push(entry);
    persist();
    return entry;
  }

  function isHalted() {
    return halted || state !== EMERGENCY_STOP_STATES.IDLE;
  }

  function canDispatch() {
    if (isHalted()) {
      return {
        allowed: false,
        reason: 'EMERGENCY_STOP_ACTIVE',
        trippedAt,
        trippedBy,
        emergencyReason: reason,
        state,
      };
    }
    return { allowed: true };
  }

  function assertCanDispatch() {
    const check = canDispatch();
    if (!check.allowed) {
      throw new EmergencyStopActiveError(
        `Dispatch blocked: Emergency stop active since ${new Date(trippedAt).toISOString()} (reason: ${reason})`,
        { trippedAt, trippedBy, reason, state }
      );
    }
  }

  function getActiveExecutionsSnapshot() {
    const active = [];

    // 1. Inspect ControlManager if available
    if (controlManager) {
      try {
        const execList = typeof controlManager.listExecutions === 'function'
          ? controlManager.listExecutions()
          : controlManager.executions ? Array.from(controlManager.executions.values()) : [];

        for (const ex of execList) {
          if (['running', 'dispatching', 'queued', 'waiting'].includes(ex.status)) {
            active.push({
              executionId: ex.executionId,
              agentId: ex.agentId,
              taskId: ex.taskId,
              sessionId: ex.sessionId,
              providerRunId: ex.providerRunId || null,
            });
          }
        }
      } catch {
        // preserve flow
      }
    }

    // 2. Inspect Claude tasksRunner
    if (tasksRunner && typeof tasksRunner.list === 'function') {
      try {
        const claudeTasks = tasksRunner.list();
        for (const ct of claudeTasks) {
          if (ct && !ct.stopped && !active.some((a) => a.taskId === ct.id || a.providerRunId === ct.id)) {
            active.push({
              executionId: `claude_${ct.id}`,
              agentId: 'claude-code',
              taskId: ct.id,
              sessionId: ct.sid || null,
              providerRunId: ct.id,
            });
          }
        }
      } catch {
        // preserve flow
      }
    }

    // 3. Inspect Codex codexRuns
    if (codexRuns && typeof codexRuns.list === 'function') {
      try {
        const cRuns = codexRuns.list();
        for (const cr of cRuns) {
          if (cr && (cr.status === 'running' || cr.status === 'active') && !active.some((a) => a.taskId === cr.id || a.providerRunId === cr.id)) {
            active.push({
              executionId: `codex_${cr.id}`,
              agentId: 'codex-cli',
              taskId: cr.id,
              sessionId: null,
              providerRunId: cr.id,
            });
          }
        }
      } catch {
        // preserve flow
      }
    }

    return active;
  }

  /**
   * Triggers the instantaneous system-wide Emergency Stop.
   */
  async function triggerEmergencyStop({
    triggeredBy = 'operator',
    reason: triggerReason = 'Emergency stop initiated by operator',
  } = {}) {
    // Immediate synchronous dispatch freeze
    halted = true;
    trippedAt = now();
    trippedBy = triggeredBy;
    reason = triggerReason;
    state = EMERGENCY_STOP_STATES.TRIPPING;

    logEvent('emergency_stop_triggered', { triggeredBy, reason: triggerReason });

    // Gather active tasks
    const active = getActiveExecutionsSnapshot();
    trackedExecutions.clear();

    if (active.length === 0) {
      state = EMERGENCY_STOP_STATES.HALTED;
      persist();
      if (onHalt) onHalt({ triggeredBy, reason: triggerReason, cancellationsCount: 0 });
      return {
        ok: true,
        state,
        cancellationsCount: 0,
        activeExecutions: [],
      };
    }

    state = EMERGENCY_STOP_STATES.CANCELLING;

    // Issue cancellation requests for all active executions
    const cancelPromises = active.map(async (item) => {
      const record = {
        executionId: item.executionId,
        agentId: item.agentId,
        taskId: item.taskId,
        sessionId: item.sessionId,
        providerRunId: item.providerRunId,
        status: CANCELLATION_STATUSES.REQUESTED,
        requestedAt: now(),
        confirmedAt: null,
        confirmed: false,
        error: null,
      };
      trackedExecutions.set(item.executionId, record);

      try {
        let confirmed = false;

        // Route cancellation to ControlManager
        if (controlManager && typeof controlManager.cancelExecution === 'function') {
          try {
            const res = await controlManager.cancelExecution(item.executionId, `Emergency Stop: ${triggerReason}`);
            if (res && (res.cancelled === true || res.ok === true)) {
              confirmed = true;
            }
          } catch {
            // fallback to direct provider cancellation below
          }
        }

        // Direct Claude Code task runner stop
        if (!confirmed && item.agentId === 'claude-code' && tasksRunner && typeof tasksRunner.stop === 'function') {
          const stopped = tasksRunner.stop(item.providerRunId || item.taskId);
          if (stopped) confirmed = true;
        }

        // Direct Codex CLI run stop
        if (!confirmed && item.agentId === 'codex-cli' && codexRuns && typeof codexRuns.stop === 'function') {
          const stopped = codexRuns.stop(item.providerRunId || item.taskId);
          if (stopped) confirmed = true;
        }

        if (confirmed) {
          record.status = CANCELLATION_STATUSES.CONFIRMED;
          record.confirmed = true;
          record.confirmedAt = now();
        }
      } catch (err) {
        record.status = CANCELLATION_STATUSES.FAILED;
        record.error = err.message || String(err);
      }

      return record;
    });

    await Promise.all(cancelPromises);

    // Also cancel active master tasks if masterOrchestrator is present
    if (masterOrchestrator && typeof masterOrchestrator.listMasterTasks === 'function') {
      try {
        const mts = masterOrchestrator.listMasterTasks();
        for (const mt of mts) {
          if (['running', 'dispatching', 'ready'].includes(mt.status)) {
            await masterOrchestrator.cancelMasterTask(mt.masterTaskId, `Emergency Stop: ${triggerReason}`);
          }
        }
      } catch {
        // preserve flow
      }
    }

    // Check if all cancellations are confirmed
    const allDone = Array.from(trackedExecutions.values()).every(
      (r) => r.status === CANCELLATION_STATUSES.CONFIRMED || r.status === CANCELLATION_STATUSES.FAILED
    );
    if (allDone) {
      state = EMERGENCY_STOP_STATES.HALTED;
    }

    persist();

    if (onHalt) {
      onHalt({
        triggeredBy,
        reason: triggerReason,
        cancellationsCount: active.length,
        trackedExecutions: Array.from(trackedExecutions.values()),
      });
    }

    return {
      ok: true,
      state,
      cancellationsCount: active.length,
      activeExecutions: Array.from(trackedExecutions.values()),
    };
  }

  /**
   * Confirms cancellation for a specific execution.
   */
  function confirmCancellation(executionId, { error = null } = {}) {
    const record = trackedExecutions.get(executionId);
    if (!record) return { ok: false, message: `Execution '${executionId}' not tracked.` };

    if (error) {
      record.status = CANCELLATION_STATUSES.FAILED;
      record.error = error;
    } else {
      record.status = CANCELLATION_STATUSES.CONFIRMED;
      record.confirmed = true;
      record.confirmedAt = now();
    }

    // Check if all are settled
    const allSettled = Array.from(trackedExecutions.values()).every(
      (r) => r.status === CANCELLATION_STATUSES.CONFIRMED || r.status === CANCELLATION_STATUSES.FAILED
    );

    if (allSettled && state === EMERGENCY_STOP_STATES.CANCELLING) {
      state = EMERGENCY_STOP_STATES.HALTED;
    }

    persist();
    return { ok: true, record, state };
  }

  /**
   * Verifies the status of any pending cancellations.
   */
  function verifyAllCancelled() {
    let pendingCount = 0;
    let confirmedCount = 0;
    let failedCount = 0;

    for (const record of trackedExecutions.values()) {
      if (record.status === CANCELLATION_STATUSES.REQUESTED) {
        // Query provider status to see if it has terminated
        let isTerminated = false;
        if (record.agentId === 'claude-code' && tasksRunner) {
          const t = tasksRunner.get?.(record.providerRunId || record.taskId);
          if (!t || t.stopped) isTerminated = true;
        } else if (record.agentId === 'codex-cli' && codexRuns) {
          const r = codexRuns.get?.(record.providerRunId || record.taskId);
          if (!r || r.status === 'cancelled' || r.status === 'failed') isTerminated = true;
        }

        if (isTerminated) {
          record.status = CANCELLATION_STATUSES.CONFIRMED;
          record.confirmed = true;
          record.confirmedAt = now();
          confirmedCount++;
        } else {
          pendingCount++;
        }
      } else if (record.status === CANCELLATION_STATUSES.CONFIRMED) {
        confirmedCount++;
      } else {
        failedCount++;
      }
    }

    if (pendingCount === 0 && state === EMERGENCY_STOP_STATES.CANCELLING) {
      state = EMERGENCY_STOP_STATES.HALTED;
    }

    persist();

    return {
      state,
      pendingCount,
      confirmedCount,
      failedCount,
      allConfirmed: pendingCount === 0 && failedCount === 0,
      activeExecutions: Array.from(trackedExecutions.values()),
    };
  }

  /**
   * Asynchronously awaits until all cancellations are confirmed or timeout expires.
   */
  async function waitForConfirmations({ timeoutMs = 3000, pollIntervalMs = 100 } = {}) {
    const startTime = now();
    while (now() - startTime < timeoutMs) {
      const check = verifyAllCancelled();
      if (check.pendingCount === 0) {
        return check;
      }
      await new Promise((res) => setTimeout(res, pollIntervalMs));
    }
    return verifyAllCancelled();
  }

  /**
   * Resumes normal system operation from emergency stop.
   * Requires verified human operator authorization.
   */
  function resumeEmergencyStop({ authorizedBy, reason: resumeReason }) {
    if (!isHumanOperator(authorizedBy)) {
      throw new Error('SECURITY_INVARIANT_VIOLATION: Resuming from Emergency Stop requires explicit authorization by an authenticated human operator.');
    }

    if (!resumeReason || resumeReason.trim().length < 5) {
      throw new Error('Resuming from Emergency Stop requires a clear justification reason.');
    }

    state = EMERGENCY_STOP_STATES.RECOVERING;
    logEvent('emergency_stop_recovery_initiated', { authorizedBy, resumeReason });

    // Clear halt status
    halted = false;
    state = EMERGENCY_STOP_STATES.IDLE;
    trippedAt = null;
    trippedBy = null;
    reason = null;
    trackedExecutions.clear();

    logEvent('emergency_stop_cleared', { authorizedBy, resumeReason });
    persist();

    if (onResume) {
      onResume({ authorizedBy, reason: resumeReason, resumedAt: now() });
    }

    return {
      ok: true,
      state: EMERGENCY_STOP_STATES.IDLE,
      resumedAt: now(),
      authorizedBy,
    };
  }

  function getStatus() {
    const records = Array.from(trackedExecutions.values());
    const total = records.length;
    const requested = records.filter((r) => r.status === CANCELLATION_STATUSES.REQUESTED).length;
    const confirmed = records.filter((r) => r.status === CANCELLATION_STATUSES.CONFIRMED).length;
    const failed = records.filter((r) => r.status === CANCELLATION_STATUSES.FAILED).length;

    return {
      halted: isHalted(),
      state,
      trippedAt,
      trippedBy,
      reason,
      activeExecutions: records,
      cancellationsSummary: {
        total,
        requested,
        confirmed,
        failed,
        allConfirmed: total > 0 ? requested === 0 && failed === 0 : true,
      },
      persistedAt: now(),
    };
  }

  return {
    isHalted,
    canDispatch,
    assertCanDispatch,
    triggerEmergencyStop,
    confirmCancellation,
    verifyAllCancelled,
    waitForConfirmations,
    resumeEmergencyStop,
    getStatus,
    getEventLog: (limit = 50) => eventLog.slice(-limit),
    CANCELLATION_STATUSES,
  };
}

export { createEmergencyStopManager as createEmergencyStop };
