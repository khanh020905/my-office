/**
 * Central Permission Registry (Phase 5 Master Architecture §2 & §4).
 * Tracks granular permission grants per tool, agent, and distribution.
 * Persists atomically to data/tools/permission-registry.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWriteJsonSync, acquireLockSync } from './fs-utils.mjs';
import { isValidPermissionScope } from './schemas.mjs';

const DEFAULT_STORE_PATH = path.resolve(process.cwd(), 'data', 'tools', 'permission-registry.json');
const MAX_USAGE_HISTORY_PER_GRANT = 50;

export function createPermissionRegistry({ storePath = null } = {}) {
  const store = storePath || DEFAULT_STORE_PATH;
  const lockPath = `${store}.lock`;
  fs.mkdirSync(path.dirname(store), { recursive: true });

  let grants = new Map();

  function load() {
    if (!fs.existsSync(store)) {
      grants = new Map();
      return;
    }
    try {
      const data = JSON.parse(fs.readFileSync(store, 'utf8'));
      if (Array.isArray(data.grants)) {
        grants = new Map(data.grants.map((g) => [g.permission_id, g]));
      } else {
        grants = new Map();
      }
    } catch {
      grants = new Map();
    }
  }

  function save() {
    const releaseLock = acquireLockSync(lockPath);
    try {
      const payload = {
        version: '1.0.0',
        updated_at: new Date().toISOString(),
        grants: Array.from(grants.values()),
      };
      atomicWriteJsonSync(store, payload);
    } finally {
      releaseLock();
    }
  }

  // Initial load
  load();

  function isGrantValid(grant) {
    if (!grant) return false;
    if (grant.revocation_status !== 'active') return false;
    if (grant.expiration && new Date(grant.expiration).getTime() <= Date.now()) {
      return false;
    }
    return true;
  }

  return {
    /**
     * Grants granular permissions to a tool for a specific agent.
     */
    grantPermission({
      tool_id,
      agent_id,
      distribution_id = null,
      scopes = [],
      expiration = null,
      approval_reference = null,
    }) {
      if (!tool_id || typeof tool_id !== 'string') {
        throw new Error('grantPermission requires a valid tool_id');
      }
      if (!agent_id || typeof agent_id !== 'string') {
        throw new Error('grantPermission requires a valid agent_id (permissions must be strictly agent-scoped)');
      }
      if (!Array.isArray(scopes) || scopes.length === 0) {
        throw new Error('grantPermission requires at least one permission scope');
      }

      // Validate all scopes
      for (const scope of scopes) {
        if (!isValidPermissionScope(scope)) {
          throw new Error(`Invalid permission scope '${scope}'`);
        }
      }

      const permission_id = `perm_${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      const grant = {
        permission_id,
        tool_id,
        agent_id,
        distribution_id: distribution_id || null,
        granted_scopes: Array.from(new Set(scopes)),
        grant_timestamp: now,
        expiration: expiration || null,
        approval_reference: approval_reference || `appr_${crypto.randomUUID().slice(0, 8)}`,
        revocation_status: 'active',
        revocation_reason: null,
        revoked_at: null,
        usage_history: [],
      };

      grants.set(permission_id, grant);
      save();
      return grant;
    },

    /**
     * Revokes an existing permission grant.
     */
    revokePermission(permission_id, { reason = 'Revoked by user', revoked_by = 'user' } = {}) {
      load();
      const grant = grants.get(permission_id);
      if (!grant) {
        return { ok: false, error: `Permission '${permission_id}' not found` };
      }

      grant.revocation_status = 'revoked';
      grant.revocation_reason = reason;
      grant.revoked_at = new Date().toISOString();
      grant.revoked_by = revoked_by;

      save();
      return { ok: true, grant };
    },

    /**
     * Gets a single permission grant by ID.
     */
    getPermission(permission_id) {
      load();
      return grants.get(permission_id) || null;
    },

    /**
     * Lists permissions with optional filtering.
     */
    listPermissions({
      tool_id = null,
      agent_id = null,
      distribution_id = null,
      status = null,
    } = {}) {
      load();
      let list = Array.from(grants.values());

      // Auto-update expired grants
      const now = Date.now();
      let modified = false;
      for (const g of list) {
        if (g.revocation_status === 'active' && g.expiration && new Date(g.expiration).getTime() <= now) {
          g.revocation_status = 'expired';
          modified = true;
        }
      }
      if (modified) save();

      if (tool_id) {
        list = list.filter((g) => g.tool_id === tool_id);
      }
      if (agent_id) {
        list = list.filter((g) => g.agent_id === agent_id);
      }
      if (distribution_id) {
        list = list.filter((g) => g.distribution_id === distribution_id);
      }
      if (status) {
        list = list.filter((g) => g.revocation_status === status);
      }

      return list;
    },

    /**
     * Finds active grants for a specific tool and agent.
     */
    getActiveGrants(tool_id, agent_id, distribution_id = null) {
      load();
      const now = Date.now();
      return Array.from(grants.values()).filter((g) => {
        if (g.tool_id !== tool_id) return false;
        if (g.agent_id !== agent_id) return false;
        if (distribution_id && g.distribution_id && g.distribution_id !== distribution_id) {
          return false;
        }
        if (g.revocation_status !== 'active') return false;
        if (g.expiration && new Date(g.expiration).getTime() <= now) return false;
        return true;
      });
    },

    /**
     * Records a usage event on a grant.
     */
    recordUsage(permission_id, { operation, agent_id, allowed = true, reason = '' } = {}) {
      load();
      const grant = grants.get(permission_id);
      if (!grant) return false;

      grant.usage_history = grant.usage_history || [];
      grant.usage_history.unshift({
        timestamp: new Date().toISOString(),
        operation: operation || 'unknown',
        agent_id: agent_id || grant.agent_id,
        allowed: Boolean(allowed),
        reason: reason || '',
      });

      if (grant.usage_history.length > MAX_USAGE_HISTORY_PER_GRANT) {
        grant.usage_history = grant.usage_history.slice(0, MAX_USAGE_HISTORY_PER_GRANT);
      }

      save();
      return true;
    },

    /**
     * Checks if a grant is currently active.
     */
    isGrantValid,

    /**
     * Resets or clears memory for test isolation.
     */
    _resetForTesting() {
      grants.clear();
      if (fs.existsSync(store)) {
        try { fs.unlinkSync(store); } catch {}
      }
      if (fs.existsSync(lockPath)) {
        try { fs.unlinkSync(lockPath); } catch {}
      }
    },
  };
}

