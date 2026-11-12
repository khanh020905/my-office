/**
 * Security Audit & Monitoring System (Phase 5 Master Architecture §7).
 * Tracks permission requests, grants, denials, revocations, unauthorized access attempts,
 * tool execution decisions, and suspicious activity.
 * Persists atomically to data/tools/security-audit.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWriteJsonSync, acquireLockSync } from './fs-utils.mjs';

const DEFAULT_AUDIT_PATH = path.resolve(process.cwd(), 'data', 'tools', 'security-audit.json');
const MAX_AUDIT_EVENTS = 1000;

export const AUDIT_EVENT_TYPES = new Set([
  'PERMISSION_REQUESTED',
  'PERMISSION_GRANTED',
  'PERMISSION_DENIED',
  'PERMISSION_REVOKED',
  'PERMISSION_EXPIRED',
  'POLICY_EVALUATION',
  'EXECUTION_ALLOWED',
  'EXECUTION_BLOCKED',
  'UNAUTHORIZED_ACCESS_ATTEMPT',
  'CROSS_AGENT_LEAK_PREVENTED',
  'SUSPICIOUS_ACTIVITY_DETECTED',
  'POLICY_UPDATED',
]);

export function createSecurityAuditLogger({ storePath = null } = {}) {
  const store = storePath || DEFAULT_AUDIT_PATH;
  const lockPath = `${store}.lock`;
  fs.mkdirSync(path.dirname(store), { recursive: true });

  let events = [];

  function load() {
    if (!fs.existsSync(store)) {
      events = [];
      return;
    }
    try {
      const data = JSON.parse(fs.readFileSync(store, 'utf8'));
      if (Array.isArray(data.events)) {
        events = data.events;
      } else {
        events = [];
      }
    } catch {
      events = [];
    }
  }

  function save() {
    const releaseLock = acquireLockSync(lockPath);
    try {
      if (events.length > MAX_AUDIT_EVENTS) {
        events = events.slice(0, MAX_AUDIT_EVENTS);
      }
      const payload = {
        version: '1.0.0',
        updated_at: new Date().toISOString(),
        total_events: events.length,
        events,
      };
      atomicWriteJsonSync(store, payload);
    } finally {
      releaseLock();
    }
  }

  load();

  return {
    /**
     * Logs a security audit event.
     */
    logEvent({
      type,
      severity = 'info', // 'info' | 'warning' | 'critical'
      tool_id = null,
      agent_id = null,
      distribution_id = null,
      operation = null,
      decision = null, // 'ALLOW' | 'DENY' | 'BLOCKED' | 'REQUIRES_APPROVAL'
      reason = '',
      details = {},
    }) {
      if (!type) {
        throw new Error('Audit event requires a valid event type');
      }

      load();

      const event = {
        event_id: `aud_${crypto.randomUUID()}`,
        timestamp: new Date().toISOString(),
        type,
        severity: severity || 'info',
        tool_id: tool_id || null,
        agent_id: agent_id || null,
        distribution_id: distribution_id || null,
        operation: operation || null,
        decision: decision || null,
        reason: reason || '',
        details: details || {},
      };

      events.unshift(event);
      save();
      return event;
    },

    /**
     * Queries audit events with filtering.
     */
    queryEvents({
      type = null,
      severity = null,
      tool_id = null,
      agent_id = null,
      limit = 50,
      offset = 0,
    } = {}) {
      load();
      let filtered = events;

      if (type) {
        filtered = filtered.filter((e) => e.type === type);
      }
      if (severity) {
        filtered = filtered.filter((e) => e.severity === severity);
      }
      if (tool_id) {
        filtered = filtered.filter((e) => e.tool_id === tool_id);
      }
      if (agent_id) {
        filtered = filtered.filter((e) => e.agent_id === agent_id);
      }

      const total = filtered.length;
      const paginated = filtered.slice(offset, offset + limit);

      return {
        total,
        offset,
        limit,
        events: paginated,
      };
    },

    /**
     * Summarizes recent security metrics.
     */
    getSummary() {
      load();
      const summary = {
        total_events: events.length,
        critical_count: 0,
        warning_count: 0,
        blocked_executions: 0,
        denied_permissions: 0,
        granted_permissions: 0,
      };

      for (const e of events) {
        if (e.severity === 'critical') summary.critical_count++;
        if (e.severity === 'warning') summary.warning_count++;
        if (e.decision === 'DENY' || e.decision === 'BLOCKED' || e.type === 'EXECUTION_BLOCKED') {
          summary.blocked_executions++;
        }
        if (e.type === 'PERMISSION_DENIED') summary.denied_permissions++;
        if (e.type === 'PERMISSION_GRANTED') summary.granted_permissions++;
      }

      return summary;
    },

    /**
     * Resets or clears memory for test isolation.
     */
    _resetForTesting() {
      events = [];
      if (fs.existsSync(store)) {
        try { fs.unlinkSync(store); } catch {}
      }
      if (fs.existsSync(lockPath)) {
        try { fs.unlinkSync(lockPath); } catch {}
      }
    },
  };
}

