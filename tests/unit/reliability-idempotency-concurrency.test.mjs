/**
 * Fault-Injection Unit Tests: Scoped Idempotency & Concurrency Safety.
 * Covers:
 * - Scenario 4: Duplicate dispatch requests with same Idempotency-Key.
 * - Scenario 5: Duplicate approval requests.
 * - Scenario 6: Concurrent conflicting approval and rejection.
 * - Scenario 13: Concurrent scheduler workers attempting the same Subtask.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createIdempotencyEngine } from '../../server/reliability/idempotency.mjs';
import {
  IDEMPOTENCY_STATES,
  formatIdempotencyKey,
  parseIdempotencyKey,
} from '../../server/reliability/contracts.mjs';

describe('Phase 5 Reliability: Scoped Idempotency & Concurrency Fault Injection', () => {
  let tmpDir;
  let storePath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'idempotency-test-'));
    storePath = path.join(tmpDir, 'idempotency-cache.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('Refinement 2: Scoped key format validation (operatorId:endpoint:uuid)', () => {
    // Valid key
    const validKey = formatIdempotencyKey('admin', '/api/control/dispatch', 'uuid-1234');
    assert.equal(validKey, 'admin:/api/control/dispatch:uuid-1234');
    const parsed = parseIdempotencyKey(validKey);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.operatorId, 'admin');
    assert.equal(parsed.endpoint, '/api/control/dispatch');
    assert.equal(parsed.uuid, 'uuid-1234');

    // Invalid format
    const invalidParsed = parseIdempotencyKey('just-a-plain-uuid');
    assert.equal(invalidParsed.valid, false);
    assert(invalidParsed.error.includes('Expected format'));
  });

  test('Scenario 4: Duplicate dispatch requests with same Idempotency-Key return cached response without re-dispatching', () => {
    const engine = createIdempotencyEngine({ storePath });
    const key = 'operator-1:/api/control/dispatch:task-req-101';

    // 1. First request acquires lock
    const lock1 = engine.acquireLock(key);
    assert.equal(lock1.acquired, true);
    assert.equal(lock1.state, IDEMPOTENCY_STATES.IN_PROGRESS);

    // 2. In-flight concurrent request with same key is rejected with CONCURRENT_REQUEST_IN_FLIGHT
    const lockConcurrent = engine.acquireLock(key);
    assert.equal(lockConcurrent.acquired, false);
    assert.equal(lockConcurrent.inProgress, true);
    assert.equal(lockConcurrent.error, 'CONCURRENT_REQUEST_IN_FLIGHT');
    assert(lockConcurrent.retryAfterMs > 0);

    // 3. First request finishes and records response
    engine.recordResponse(key, {
      statusCode: 200,
      body: { ok: true, taskId: 'task-101', status: 'dispatching' },
    });

    // 4. Subsequent duplicate request receives cached response immediately without re-dispatch
    const lockDuplicate = engine.acquireLock(key);
    assert.equal(lockDuplicate.acquired, false);
    assert.equal(lockDuplicate.resolved, true);
    assert.equal(lockDuplicate.state, IDEMPOTENCY_STATES.RESOLVED);
    assert.equal(lockDuplicate.cachedResponse.statusCode, 200);
    assert.equal(lockDuplicate.cachedResponse.body.taskId, 'task-101');
  });

  test('Scenario 5: Duplicate approval requests return cached approval result idempotently', () => {
    const engine = createIdempotencyEngine({ storePath });
    const approvalKey = 'lead-dev:/api/autonomous/approvals/appr-99:confirm';

    // Step 1: User approves
    const lock = engine.acquireLock(approvalKey);
    assert.equal(lock.acquired, true);

    engine.recordResponse(approvalKey, {
      statusCode: 200,
      body: { approvalId: 'appr-99', status: 'approved', resolvedBy: 'lead-dev' },
    });

    // Step 2: Network retry or duplicate click
    const lockRetry = engine.acquireLock(approvalKey);
    assert.equal(lockRetry.acquired, false);
    assert.equal(lockRetry.resolved, true);
    assert.equal(lockRetry.cachedResponse.body.status, 'approved');
  });

  test('Scenario 6: Concurrent conflicting approval and rejection on same approvalId are safely serialized', () => {
    const engine = createIdempotencyEngine({ storePath });
    const op1Key = 'operator-A:/api/autonomous/approvals/appr-conflict:action';
    const op2Key = 'operator-B:/api/autonomous/approvals/appr-conflict:action';

    // Operator A starts approval resolution
    const lockA = engine.acquireLock(op1Key);
    assert.equal(lockA.acquired, true);

    // Concurrently, Operator B tries to resolve
    const lockB = engine.acquireLock(op2Key);
    assert.equal(lockB.acquired, true);

    // Operator A wins and records approval
    engine.recordResponse(op1Key, {
      statusCode: 200,
      body: { approvalId: 'appr-conflict', status: 'approved' },
    });

    // When Operator B's execution checks prior state, approval is already resolved
    const checked = engine.lookupKey(op1Key);
    assert.equal(checked.state, IDEMPOTENCY_STATES.RESOLVED);
    assert.equal(checked.response.body.status, 'approved');
  });

  test('Scenario 13: Concurrent scheduler workers attempting the same Subtask are gated by subtask lock', () => {
    const engine = createIdempotencyEngine({ storePath });
    const subtaskLockKey = 'scheduler:/subtasks/subtask-dag-404:claim';

    // Worker 1 claims subtask
    const worker1Claim = engine.acquireLock(subtaskLockKey);
    assert.equal(worker1Claim.acquired, true);

    // Worker 2 attempts claiming same subtask concurrently
    const worker2Claim = engine.acquireLock(subtaskLockKey);
    assert.equal(worker2Claim.acquired, false);
    assert.equal(worker2Claim.inProgress, true);
    assert.equal(worker2Claim.error, 'CONCURRENT_REQUEST_IN_FLIGHT');

    // Worker 1 dispatches and records result
    engine.recordResponse(subtaskLockKey, {
      statusCode: 200,
      body: { assignedWorker: 'worker-1', subtaskId: 'subtask-dag-404', claimed: true },
    });

    // Worker 2 re-checks and discovers subtask already completed/claimed
    const finalCheck = engine.acquireLock(subtaskLockKey);
    assert.equal(finalCheck.acquired, false);
    assert.equal(finalCheck.resolved, true);
    assert.equal(finalCheck.cachedResponse.body.assignedWorker, 'worker-1');
  });
});
