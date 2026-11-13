/**
 * Idempotency & Concurrency Engine (Phase 5).
 * Enforces Refinement 2: Scoped Idempotency Keys (operatorId:endpoint:clientUUID),
 * atomic lock acquisition, in-flight conflict detection (HTTP 409),
 * and cached deterministic response replays.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  IDEMPOTENCY_STATES,
  IDEMPOTENCY_DEFAULTS,
  parseIdempotencyKey,
  formatIdempotencyKey,
} from './contracts.mjs';

export function createIdempotencyEngine({
  storePath = null,
  ttlMs = IDEMPOTENCY_DEFAULTS.ttlMs,
  lockTimeoutMs = IDEMPOTENCY_DEFAULTS.lockTimeoutMs,
  now = Date.now,
} = {}) {
  const defaultStorePath = storePath || path.resolve(process.cwd(), 'data', 'reliability', 'idempotency-cache.json');

  // Key -> { key, state, createdAt, lockedAt, expiresAt, response: { statusCode, body, headers }, metadata }
  const cache = new Map();

  function load() {
    if (!fs.existsSync(defaultStorePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(defaultStorePath, 'utf8'));
      if (Array.isArray(data.entries)) {
        const currentTime = now();
        for (const entry of data.entries) {
          if (entry.expiresAt && currentTime < entry.expiresAt) {
            cache.set(entry.key, entry);
          }
        }
      }
    } catch {
      // In-memory fallback
    }
  }

  function persist() {
    try {
      fs.mkdirSync(path.dirname(defaultStorePath), { recursive: true });
      const tmp = `${defaultStorePath}.tmp-${process.pid}-${now()}`;
      const payload = {
        version: '1.0.0',
        savedAt: now(),
        entries: Array.from(cache.values()).slice(-500),
      };
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, defaultStorePath);
    } catch {
      // In-memory fallback
    }
  }

  load();

  function cleanExpiredKeys() {
    const currentTime = now();
    let cleaned = false;
    for (const [k, v] of cache.entries()) {
      if (v.expiresAt && currentTime >= v.expiresAt) {
        cache.delete(k);
        cleaned = true;
      }
    }
    if (cleaned) {
      persist();
    }
  }

  /**
   * Derives a deterministic fallback idempotency key if not explicitly supplied by client.
   */
  function deriveFallbackKey({ operatorId = 'operator', endpoint = '/api/mutation', payload = {} } = {}) {
    const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return formatIdempotencyKey(operatorId, endpoint, `hash-${hash.substring(0, 16)}`);
  }

  /**
   * Looks up an idempotency key record.
   */
  function lookupKey(key) {
    cleanExpiredKeys();
    return cache.get(key) || null;
  }

  /**
   * Attempts to acquire an execution lock for a scoped idempotency key.
   */
  function acquireLock(key, { customTtlMs = null, customLockTimeoutMs = null } = {}) {
    cleanExpiredKeys();

    const parseResult = parseIdempotencyKey(key);
    if (!parseResult.valid) {
      throw new Error(`Invalid idempotency key: ${parseResult.error}`);
    }

    const currentTime = now();
    const resolvedTtl = customTtlMs || ttlMs;
    const resolvedLockTimeout = customLockTimeoutMs || lockTimeoutMs;

    const existing = cache.get(key);

    if (existing) {
      // 1. Key already completed and resolved -> Replay cached response
      if (existing.state === IDEMPOTENCY_STATES.RESOLVED) {
        return {
          acquired: false,
          resolved: true,
          inProgress: false,
          state: IDEMPOTENCY_STATES.RESOLVED,
          cachedResponse: existing.response,
          key,
        };
      }

      // 2. Key currently in progress
      if (existing.state === IDEMPOTENCY_STATES.IN_PROGRESS) {
        const lockAge = currentTime - (existing.lockedAt || existing.createdAt);
        if (lockAge < resolvedLockTimeout) {
          // Still actively in progress -> Concurrent request in flight
          return {
            acquired: false,
            resolved: false,
            inProgress: true,
            state: IDEMPOTENCY_STATES.IN_PROGRESS,
            retryAfterMs: Math.max(500, resolvedLockTimeout - lockAge),
            key,
            error: 'CONCURRENT_REQUEST_IN_FLIGHT',
          };
        }

        // Lock expired / crashed worker -> Reclaim lock
        existing.lockedAt = currentTime;
        existing.expiresAt = currentTime + resolvedTtl;
        persist();
        return {
          acquired: true,
          resolved: false,
          inProgress: false,
          state: IDEMPOTENCY_STATES.IN_PROGRESS,
          reclaimed: true,
          key,
        };
      }
    }

    // 3. New key -> Acquire fresh lock
    const record = {
      key,
      parsed: parseResult,
      state: IDEMPOTENCY_STATES.IN_PROGRESS,
      createdAt: currentTime,
      lockedAt: currentTime,
      expiresAt: currentTime + resolvedTtl,
      response: null,
    };

    cache.set(key, record);
    persist();

    return {
      acquired: true,
      resolved: false,
      inProgress: false,
      state: IDEMPOTENCY_STATES.IN_PROGRESS,
      key,
    };
  }

  /**
   * Records completed HTTP response against the idempotency key.
   */
  function recordResponse(key, { statusCode = 200, body = {}, headers = {} } = {}) {
    const existing = cache.get(key);
    if (!existing) {
      throw new Error(`Cannot record response for untracked idempotency key: ${key}`);
    }

    existing.state = IDEMPOTENCY_STATES.RESOLVED;
    existing.resolvedAt = now();
    existing.response = {
      statusCode,
      body,
      headers: {
        'x-idempotency-key': key,
        'x-idempotency-state': 'RESOLVED',
        ...headers,
      },
    };

    persist();
    return existing;
  }

  /**
   * Releases an in-progress lock (e.g. on execution error).
   */
  function releaseLock(key, reason = 'Execution aborted') {
    const existing = cache.get(key);
    if (existing && existing.state === IDEMPOTENCY_STATES.IN_PROGRESS) {
      cache.delete(key);
      persist();
      return { released: true, reason };
    }
    return { released: false };
  }

  /**
   * Clears the cache (for testing).
   */
  function clear() {
    cache.clear();
    persist();
  }

  return {
    acquireLock,
    recordResponse,
    releaseLock,
    lookupKey,
    cleanExpiredKeys,
    deriveFallbackKey,
    clear,
  };
}

export { createIdempotencyEngine as createIdempotencyManager };
