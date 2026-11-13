/**
 * Production Reliability, Observability & Disaster Recovery Contracts (Phase 5).
 * Central source of truth for Process Fingerprints, Scoped Idempotency Keys,
 * Durable Write-Ahead Log (WAL) schemas with SHA-256 checksums,
 * Startup Reconciliation outcomes, and Backup/Restore manifests.
 */

import crypto from 'node:crypto';

// ============================================================================
// 1. RECONCILIATION OUTCOMES & PROCESS STATUSES
// ============================================================================

export const RECONCILIATION_OUTCOMES = {
  COMPLETED: 'completed',
  FAILED: 'failed',
  STILL_RUNNING: 'still_running',
  CANCELLATION_REQUESTED: 'cancellation_requested',
  CANCELLATION_CONFIRMED: 'cancellation_confirmed',
  OUTCOME_UNKNOWN: 'outcome_unknown',
  MANUAL_RECONCILIATION_REQUIRED: 'manual_reconciliation_required',
};

export const RECONCILIATION_OUTCOME_LIST = Object.values(RECONCILIATION_OUTCOMES);

export const PROCESS_SUPERVISOR_STATES = {
  SPAWNING: 'spawning',
  RUNNING: 'running',
  TERMINATING: 'terminating',
  TERMINATED: 'terminated',
  ORPHAN_DETECTED: 'orphan_detected',
  REASSIGNED_DETECTED: 'reassigned_detected',
};

export const PROCESS_SUPERVISOR_STATE_LIST = Object.values(PROCESS_SUPERVISOR_STATES);

// ============================================================================
// 2. IDEMPOTENCY KEY SCHEMAS & STATES
// ============================================================================

export const IDEMPOTENCY_STATES = {
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  EXPIRED: 'EXPIRED',
  CONFLICT: 'CONFLICT',
};

export const IDEMPOTENCY_DEFAULTS = {
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  lockTimeoutMs: 60 * 1000,   // 60 seconds lock wait timeout
};

/**
 * Validates and parses a scoped idempotency key: operatorId:endpoint:clientGeneratedUUID
 * @param {string} key
 * @returns {{ valid: boolean, operatorId?: string, endpoint?: string, uuid?: string, error?: string }}
 */
export function parseIdempotencyKey(key) {
  if (typeof key !== 'string' || !key.trim()) {
    return { valid: false, error: 'Idempotency key must be a non-empty string.' };
  }

  const parts = key.split(':');
  if (parts.length < 3) {
    return {
      valid: false,
      error: `Invalid idempotency key format "${key}". Expected format: operatorId:endpoint:clientUUID`,
    };
  }

  const operatorId = parts[0].trim();
  const uuid = parts[parts.length - 1].trim();
  const endpoint = parts.slice(1, parts.length - 1).join(':').trim();

  if (!operatorId || !endpoint || !uuid) {
    return {
      valid: false,
      error: 'Idempotency key parts (operatorId, endpoint, uuid) cannot be empty.',
    };
  }

  return {
    valid: true,
    operatorId,
    endpoint,
    uuid,
  };
}

/**
 * Formats a scoped idempotency key.
 * @param {string} operatorId
 * @param {string} endpoint
 * @param {string} [uuid]
 * @returns {string}
 */
export function formatIdempotencyKey(operatorId, endpoint, uuid = null) {
  const resolvedUuid = uuid || crypto.randomUUID();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${operatorId}:${cleanEndpoint}:${resolvedUuid}`;
}

// ============================================================================
// 3. PROCESS FINGERPRINT SCHEMA & VALIDATION
// ============================================================================

/**
 * Validates a process fingerprint object.
 * @param {Object} fp
 * @returns {boolean}
 */
export function validateProcessFingerprint(fp) {
  if (!fp || typeof fp !== 'object') {
    throw new Error('Process fingerprint must be an object.');
  }
  if (typeof fp.pid !== 'number' || fp.pid <= 0) {
    throw new Error(`Invalid process PID: ${fp.pid}`);
  }
  if (typeof fp.startTime !== 'number' || fp.startTime <= 0) {
    throw new Error(`Invalid process startTime: ${fp.startTime}`);
  }
  if (typeof fp.executable !== 'string' || !fp.executable.trim()) {
    throw new Error('Process fingerprint requires a non-empty executable path.');
  }
  if (typeof fp.commandLine !== 'string') {
    throw new Error('Process fingerprint requires commandLine string.');
  }
  if (typeof fp.parentPid !== 'number' || fp.parentPid < 0) {
    throw new Error(`Invalid parentPid: ${fp.parentPid}`);
  }
  return true;
}

/**
 * Compares two process fingerprints to guarantee OS process identity.
 * Strictly prevents killing a re-assigned OS PID.
 * @param {Object} recorded
 * @param {Object} actual
 * @param {number} [startTimeToleranceMs=2000]
 * @returns {boolean}
 */
export function fingerprintsMatch(recorded, actual, startTimeToleranceMs = 2000) {
  if (!recorded || !actual) return false;
  if (recorded.pid !== actual.pid) return false;

  // Verify executable name match (case-insensitive on Windows)
  const normRecExec = (recorded.executable || '').toLowerCase().replace(/\\/g, '/');
  const normActExec = (actual.executable || '').toLowerCase().replace(/\\/g, '/');
  const baseRec = normRecExec.split('/').pop();
  const baseAct = normActExec.split('/').pop();
  if (baseRec !== baseAct && !normActExec.endsWith(baseRec)) {
    return false;
  }

  // Verify start time within tolerance (accounts for clock jitter / OS tick resolution)
  if (recorded.startTime && actual.startTime) {
    const diff = Math.abs(recorded.startTime - actual.startTime);
    if (diff > startTimeToleranceMs) {
      return false;
    }
  }

  // If parentPid is available on both, check it
  if (recorded.parentPid && actual.parentPid && recorded.parentPid !== actual.parentPid) {
    return false;
  }

  return true;
}

/**
 * Creates a normalized process fingerprint.
 * @param {Object} params
 * @returns {Object}
 */
export function createProcessFingerprint({
  pid,
  startTime = Date.now(),
  executable = process.execPath,
  commandLine = '',
  parentPid = process.pid,
  hostUser = process.env.USERNAME || process.env.USER || 'unknown',
}) {
  const fp = {
    pid,
    startTime,
    executable,
    commandLine,
    parentPid,
    hostUser,
  };
  validateProcessFingerprint(fp);
  return fp;
}

// ============================================================================
// 4. WRITE-AHEAD LOG (WAL) SCHEMAS & CHECKSUMS
// ============================================================================

export const WAL_EVENT_TYPES = {
  EXECUTION_DISPATCH_REQUESTED: 'EXECUTION_DISPATCH_REQUESTED',
  EXECUTION_DISPATCHED: 'EXECUTION_DISPATCHED',
  EXECUTION_COMPLETED: 'EXECUTION_COMPLETED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  EXECUTION_CANCEL_REQUESTED: 'EXECUTION_CANCEL_REQUESTED',
  EXECUTION_CANCEL_CONFIRMED: 'EXECUTION_CANCEL_CONFIRMED',
  APPROVAL_REQUESTED: 'APPROVAL_REQUESTED',
  APPROVAL_RESOLVED: 'APPROVAL_RESOLVED',
  EMERGENCY_STOP_TRIPPED: 'EMERGENCY_STOP_TRIPPED',
  EMERGENCY_STOP_RESET: 'EMERGENCY_STOP_RESET',
  CHECKPOINT_CREATED: 'CHECKPOINT_CREATED',
  RECONCILIATION_RUN: 'RECONCILIATION_RUN',
  PROCESS_REGISTERED: 'PROCESS_REGISTERED',
  PROCESS_TERMINATED: 'PROCESS_TERMINATED',
};

export const WAL_EVENT_TYPE_LIST = Object.values(WAL_EVENT_TYPES);

/**
 * Synchronous flush events that require fs.fdatasyncSync/fsync.
 */
export const CRITICAL_WAL_EVENTS = [
  WAL_EVENT_TYPES.EXECUTION_DISPATCH_REQUESTED,
  WAL_EVENT_TYPES.APPROVAL_RESOLVED,
  WAL_EVENT_TYPES.EMERGENCY_STOP_TRIPPED,
  WAL_EVENT_TYPES.CHECKPOINT_CREATED,
];

/**
 * Canonicalizes an object or array by sorting all keys recursively.
 * @param {*} obj
 * @returns {*}
 */
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalize);
  }
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = canonicalize(obj[key]);
  }
  return sorted;
}

/**
 * Computes SHA-256 checksum for a WAL event payload.
 * Canonicalizes payload to ensure deterministic hashing.
 * @param {Object} eventData
 * @returns {string}
 */
export function computeEventChecksum(eventData) {
  const { checksum, ...rest } = eventData;
  void checksum;
  const canonicalObj = canonicalize(rest);
  return crypto.createHash('sha256').update(JSON.stringify(canonicalObj), 'utf8').digest('hex');
}

/**
 * Verifies the checksum of a deserialized WAL event.
 * @param {Object} event
 * @returns {boolean}
 */
export function verifyEventChecksum(event) {
  if (!event || typeof event !== 'object' || !event.checksum) return false;
  const computed = computeEventChecksum(event);
  return computed === event.checksum;
}

/**
 * Creates and signs a structured WAL event.
 * @param {Object} params
 * @returns {Object}
 */
export function createWalEvent({
  seq,
  eventId = `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
  timestamp = Date.now(),
  aggregateType = 'execution',
  aggregateId,
  masterTaskId = null,
  eventType,
  payload = {},
  idempotencyKey = null,
  prevHash = null,
}) {
  if (typeof seq !== 'number' || seq < 0) {
    throw new Error(`WAL event requires a non-negative integer seq, got: ${seq}`);
  }
  if (!eventType || !WAL_EVENT_TYPE_LIST.includes(eventType)) {
    throw new Error(`Invalid WAL eventType: ${eventType}`);
  }

  const event = {
    seq,
    eventId,
    timestamp,
    aggregateType,
    aggregateId: aggregateId || 'system',
    masterTaskId,
    eventType,
    payload,
    idempotencyKey,
    prevHash: prevHash || '0'.repeat(64),
  };

  event.checksum = computeEventChecksum(event);
  return event;
}

// ============================================================================
// 5. BACKUP & DISASTER RECOVERY SCHEMAS
// ============================================================================

export const BACKUP_STATUSES = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  VERIFIED_RESTORE_OK: 'verified_restore_ok',
  VERIFIED_RESTORE_FAILED: 'verified_restore_failed',
};

/**
 * Validates a backup manifest object.
 * @param {Object} manifest
 * @returns {boolean}
 */
export function validateBackupManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Backup manifest must be an object.');
  }
  if (!manifest.backupId || typeof manifest.backupId !== 'string') {
    throw new Error('Backup manifest requires backupId string.');
  }
  if (typeof manifest.timestamp !== 'number') {
    throw new Error('Backup manifest requires numeric timestamp.');
  }
  if (!manifest.files || typeof manifest.files !== 'object') {
    throw new Error('Backup manifest requires files map.');
  }
  if (!manifest.sha256 || typeof manifest.sha256 !== 'string') {
    throw new Error('Backup manifest requires overall sha256 checksum.');
  }
  return true;
}

// ============================================================================
// 6. OPERATIONAL HEALTH & METRICS SCHEMAS
// ============================================================================

export const HEALTH_STATUSES = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  CRITICAL: 'critical',
  UNKNOWN: 'unknown',
};

/**
 * Creates default Operational Health metrics container.
 * Never fabricates missing metrics: uses null or 'unknown'.
 * @param {Object} [overrides={}]
 * @returns {Object}
 */
export function createDefaultReliabilityMetrics(overrides = {}) {
  return {
    status: HEALTH_STATUSES.UNKNOWN,
    uptimeSeconds: 0,
    serverStartedAt: Date.now(),
    executions: {
      active: 0,
      stalled: 0,
      total: 0,
      p50LatencyMs: null,
      p95LatencyMs: null,
    },
    selfHealing: {
      retryRate: 0.0,
      remediationRate: 0.0,
      totalRemediations: 0,
    },
    budget: {
      totalCostUsd: 0.0,
      remainingCostUsd: null,
      isExhausted: false,
    },
    processes: {
      trackedCount: 0,
      orphanCount: 0,
      reassignedCount: 0,
    },
    journal: {
      walSeq: 0,
      walByteSize: 0,
      lastSyncTimestamp: null,
      corruptRecordsCount: 0,
    },
    disasterRecovery: {
      lastBackupId: null,
      lastBackupTimestamp: null,
      lastDryRunRestoreOk: null,
    },
    ...overrides,
  };
}

/**
 * Evaluates whether a reconciliation outcome requires manual operator intervention.
 * Invariant: Blind redispatch is forbidden if outcome is unknown or ambiguous.
 * @param {string} outcome
 * @returns {boolean}
 */
export function reconciliationRequiresIntervention(outcome) {
  return (
    outcome === RECONCILIATION_OUTCOMES.OUTCOME_UNKNOWN ||
    outcome === RECONCILIATION_OUTCOMES.MANUAL_RECONCILIATION_REQUIRED
  );
}
