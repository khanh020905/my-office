import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  CURRENT_SCHEMA_VERSION,
  INITIAL_CATEGORIES,
  validateTool,
  validateCapability,
  createDefaultToolRecord,
} from './schemas.mjs';

const DEFAULT_LEASE_MS = 60_000;
const MAX_USAGE_HISTORY = 100;
const MAX_SNAPSHOTS = 10;

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/**
 * Creates an instance of the Universal Tool Registry.
 */
export function createToolRegistry({
  dataDir,
  file = null,
  lockLeaseMs = DEFAULT_LEASE_MS,
  onEvent = () => {},
  now = Date.now,
} = {}) {
  const store = file ? path.resolve(file) : dataDir ? path.join(path.resolve(dataDir), 'tools', 'registry.json') : '';
  const lockFile = store ? `${store}.lock` : '';
  const snapshotsDir = store ? path.join(path.dirname(store), 'snapshots') : '';

  const ownerId = crypto.randomUUID();
  let lockOwned = !store;
  let lockFd = null;
  let lockHeartbeat = null;

  const tools = new Map();
  const categories = new Map(INITIAL_CATEGORIES.map((c) => [c.id, { ...c }]));
  const snapshots = new Map(); // tool_id -> snapshot[]

  function refreshLock() {
    if (!lockOwned || lockFd === null) return;
    try {
      fs.ftruncateSync(lockFd, 0);
      fs.writeSync(lockFd, JSON.stringify({ ownerId, pid: process.pid, at: now(), expiresAt: now() + lockLeaseMs }), 0, 'utf8');
      fs.fsyncSync(lockFd);
    } catch {
      /* retain exclusive lock */
    }
  }

  function acquireLock() {
    if (!store) return true;
    fs.mkdirSync(path.dirname(store), { recursive: true });
    for (let i = 0; i < 2; i++) {
      try {
        lockFd = fs.openSync(lockFile, 'wx', 0o600);
        lockOwned = true;
        refreshLock();
        lockHeartbeat = setInterval(refreshLock, lockLeaseMs / 3);
        lockHeartbeat.unref?.();
        process.on('exit', releaseLock);
        return true;
      } catch (e) {
        if (e.code !== 'EEXIST') return false;
        try {
          const owner = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
          if (pidAlive(Number(owner.pid))) return false;
          fs.unlinkSync(lockFile);
        } catch (readError) {
          if (readError.code === 'ENOENT') continue;
          try {
            if (now() - fs.statSync(lockFile).mtimeMs < lockLeaseMs) return false;
            fs.unlinkSync(lockFile);
          } catch {
            return false;
          }
        }
      }
    }
    return false;
  }

  function releaseLock() {
    if (!lockOwned || !lockFile) return;
    clearInterval(lockHeartbeat);
    lockHeartbeat = null;
    try {
      const owner = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (owner.ownerId === ownerId) fs.unlinkSync(lockFile);
    } catch {
      /* already released */
    }
    if (lockFd !== null) {
      try {
        fs.closeSync(lockFd);
      } catch {
        /* already closed */
      }
      lockFd = null;
    }
    lockOwned = false;
    process.removeListener('exit', releaseLock);
  }

  function persist() {
    if (!store || !lockOwned) return;
    const tmp = `${store}.${process.pid}.${ownerId}.tmp`;
    try {
      fs.mkdirSync(path.dirname(store), { recursive: true });
      refreshLock();
      const payload = {
        schema_version: CURRENT_SCHEMA_VERSION,
        updated_at: new Date(now()).toISOString(),
        categories: [...categories.values()],
        tools: [...tools.values()],
      };
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, store);
    } catch (e) {
      console.error('Universal Tool Registry persistence error:', e.message);
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* absent */
      }
    }
  }

  function load() {
    if (!store || !fs.existsSync(store)) return;
    try {
      const raw = fs.readFileSync(store, 'utf8');
      const data = JSON.parse(raw);
      migrateAndIngest(data);
    } catch (e) {
      console.error('Failed to load Universal Tool Registry:', e.message);
    }
  }

  function migrateAndIngest(data) {
    if (!data || typeof data !== 'object') return;
    // Schema version checks and forward migrations
    const version = data.schema_version || '1.0.0';
    if (version !== CURRENT_SCHEMA_VERSION) {
      // Future migrations between schema versions can be handled here
    }

    if (Array.isArray(data.categories)) {
      for (const cat of data.categories) {
        if (cat && cat.id && cat.name) {
          categories.set(cat.id, { ...cat });
        }
      }
    }

    if (Array.isArray(data.tools)) {
      tools.clear();
      for (const rawTool of data.tools) {
        const tool = createDefaultToolRecord(rawTool);
        const val = validateTool(tool);
        if (val.valid) {
          tools.set(tool.tool_id, tool);
        } else {
          console.warn(`Skipping invalid tool record '${rawTool?.tool_id}':`, val.errors);
        }
      }
    }
  }

  // Initial startup lock & load
  acquireLock();
  if (store && !fs.existsSync(store)) {
    persist();
  } else {
    load();
  }

  function notify(eventType, payload = {}) {
    onEvent({
      id: crypto.randomUUID(),
      timestamp: new Date(now()).toISOString(),
      type: eventType,
      payload,
    });
  }

  // --- Public Registry API ---

  function registerTool(rawTool) {
    const record = createDefaultToolRecord(rawTool);
    record.updated_at = new Date(now()).toISOString();

    const val = validateTool(record);
    if (!val.valid) {
      return { ok: false, errors: val.errors };
    }

    // Automatically synchronize integration_protocols from capabilities
    const protocols = new Set(record.capabilities.map((c) => c.protocol));
    record.integration_protocols = [...protocols];

    tools.set(record.tool_id, record);
    persist();
    notify('tool.registered', { tool_id: record.tool_id, name: record.name });
    return { ok: true, tool: structuredClone(record) };
  }

  function getTool(toolId) {
    const t = tools.get(String(toolId));
    return t ? structuredClone(t) : null;
  }

  function hasTool(toolId) {
    return tools.has(String(toolId));
  }

  function listTools(filter = {}) {
    let result = [...tools.values()];

    if (filter.category) {
      const cat = String(filter.category).toLowerCase();
      result = result.filter((t) => t.categories.some((c) => c.toLowerCase() === cat));
    }

    if (filter.protocol) {
      const proto = String(filter.protocol).toLowerCase();
      result = result.filter((t) => t.integration_protocols.includes(proto));
    }

    if (filter.enabled != null) {
      const isEnabled = Boolean(filter.enabled);
      result = result.filter((t) => t.enabled_status === isEnabled);
    }

    if (filter.health) {
      result = result.filter((t) => t.health_status === filter.health);
    }

    if (filter.agent) {
      const agent = String(filter.agent);
      result = result.filter(
        (t) => t.compatible_agents.includes(agent) || t.supported_agents.includes(agent)
      );
    }

    if (filter.search) {
      const q = String(filter.search).toLowerCase();
      result = result.filter(
        (t) =>
          t.tool_id.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      );
    }

    return result.map((t) => structuredClone(t));
  }

  function updateTool(toolId, patch = {}) {
    const current = tools.get(String(toolId));
    if (!current) {
      return { ok: false, error: 'tool_not_found' };
    }

    const merged = {
      ...current,
      ...patch,
      tool_id: current.tool_id, // Prevent altering identity
      updated_at: new Date(now()).toISOString(),
    };

    if (patch.capabilities) {
      const protocols = new Set(merged.capabilities.map((c) => c.protocol));
      merged.integration_protocols = [...protocols];
    }

    const val = validateTool(merged);
    if (!val.valid) {
      return { ok: false, errors: val.errors };
    }

    tools.set(toolId, merged);
    persist();
    notify('tool.updated', { tool_id: toolId, patch });
    return { ok: true, tool: structuredClone(merged) };
  }

  function deleteTool(toolId) {
    const id = String(toolId);
    if (!tools.has(id)) return false;
    tools.delete(id);
    persist();
    notify('tool.deleted', { tool_id: id });
    return true;
  }

  function setToolEnabled(toolId, enabled) {
    return updateTool(toolId, { enabled_status: Boolean(enabled) });
  }

  // --- Capability Management ---

  function addCapability(toolId, capData) {
    const tool = tools.get(String(toolId));
    if (!tool) return { ok: false, error: 'tool_not_found' };

    const val = validateCapability(capData);
    if (!val.valid) return { ok: false, errors: val.errors };

    if (tool.capabilities.some((c) => c.capability_id === capData.capability_id)) {
      return { ok: false, error: 'duplicate_capability_id' };
    }

    const newCaps = [...tool.capabilities, structuredClone(capData)];
    return updateTool(toolId, { capabilities: newCaps });
  }

  function removeCapability(toolId, capabilityId) {
    const tool = tools.get(String(toolId));
    if (!tool) return { ok: false, error: 'tool_not_found' };

    const newCaps = tool.capabilities.filter((c) => c.capability_id !== capabilityId);
    if (newCaps.length === 0) {
      return { ok: false, error: 'tool_must_have_at_least_one_capability' };
    }

    return updateTool(toolId, { capabilities: newCaps });
  }

  // --- Category Management ---

  function listCategories() {
    return [...categories.values()].map((c) => structuredClone(c));
  }

  function addCategory(cat) {
    if (!cat || typeof cat !== 'object' || !cat.id || !cat.name) {
      return { ok: false, error: 'invalid_category' };
    }
    const cleanId = String(cat.id).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const record = {
      id: cleanId,
      name: String(cat.name).trim(),
      description: String(cat.description || '').trim(),
    };
    categories.set(cleanId, record);
    persist();
    notify('category.added', { category: record });
    return { ok: true, category: structuredClone(record) };
  }

  // --- Health & Verification ---

  function recordHealthCheck(toolId, { status, evidence = '', error = '' } = {}) {
    const tool = tools.get(String(toolId));
    if (!tool) return { ok: false, error: 'tool_not_found' };

    const ts = new Date(now()).toISOString();
    const patch = {
      health_status: status || 'unknown',
      verification_evidence: [
        ...(tool.verification_evidence || []),
        { at: ts, status, evidence, error },
      ].slice(-20),
    };

    return updateTool(toolId, patch);
  }

  // --- Snapshot & Rollback Engine ---

  function createSnapshot(toolId, reason = 'manual_snapshot') {
    const tool = tools.get(String(toolId));
    if (!tool) return { ok: false, error: 'tool_not_found' };

    const snapshotId = `${toolId}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const snap = {
      snapshot_id: snapshotId,
      tool_id: toolId,
      created_at: new Date(now()).toISOString(),
      reason: String(reason),
      tool_state: structuredClone(tool),
    };

    if (!snapshots.has(toolId)) snapshots.set(toolId, []);
    const list = snapshots.get(toolId);
    list.push(snap);
    if (list.length > MAX_SNAPSHOTS) list.shift();

    if (snapshotsDir) {
      try {
        const toolDir = path.join(snapshotsDir, toolId);
        fs.mkdirSync(toolDir, { recursive: true });
        fs.writeFileSync(
          path.join(toolDir, `${snapshotId}.json`),
          JSON.stringify(snap, null, 2),
          { mode: 0o600 }
        );
      } catch (e) {
        console.error('Snapshot write failed:', e.message);
      }
    }

    notify('tool.snapshot_created', { tool_id: toolId, snapshot_id: snapshotId });
    return { ok: true, snapshot: snap };
  }

  function listSnapshots(toolId) {
    const list = snapshots.get(String(toolId)) || [];
    return list.map((s) => ({
      snapshot_id: s.snapshot_id,
      tool_id: s.tool_id,
      created_at: s.created_at,
      reason: s.reason,
      version: s.tool_state?.version,
    }));
  }

  function restoreSnapshot(toolId, snapshotId) {
    const list = snapshots.get(String(toolId)) || [];
    const target = list.find((s) => s.snapshot_id === snapshotId);
    if (!target) return { ok: false, error: 'snapshot_not_found' };

    const restoredState = structuredClone(target.tool_state);
    restoredState.updated_at = new Date(now()).toISOString();

    tools.set(toolId, restoredState);
    persist();
    notify('tool.snapshot_restored', { tool_id: toolId, snapshot_id: snapshotId });
    return { ok: true, tool: structuredClone(restoredState) };
  }

  // --- Dynamic Capability Matching (Orchestration Interface) ---

  /**
   * Discovers tools providing the required capabilities for a task.
   * Consumed by the workflow scheduler without direct filesystem access.
   */
  function findToolsForCapabilities({
    capabilities = [],
    protocols = [],
    agent = null,
    healthyOnly = true,
    enabledOnly = true,
  } = {}) {
    const matches = [];

    for (const tool of tools.values()) {
      if (enabledOnly && !tool.enabled_status) continue;
      if (healthyOnly && tool.health_status === 'unhealthy') continue;

      if (agent) {
        const isCompatible =
          tool.compatible_agents.includes(agent) || tool.supported_agents.includes(agent);
        if (!isCompatible) continue;
      }

      for (const cap of tool.capabilities) {
        const matchesCap =
          capabilities.length === 0 ||
          capabilities.some(
            (c) =>
              c === cap.capability_id ||
              cap.capability_id.startsWith(c) ||
              cap.name.toLowerCase().includes(c.toLowerCase())
          );

        const matchesProto =
          protocols.length === 0 || protocols.includes(cap.protocol);

        if (matchesCap && matchesProto) {
          matches.push({
            tool_id: tool.tool_id,
            tool_name: tool.name,
            version: tool.version,
            health_status: tool.health_status,
            capability: structuredClone(cap),
            required_permissions: structuredClone(tool.required_permissions),
          });
        }
      }
    }

    return matches;
  }

  // --- Usage Analytics Recording ---

  function recordUsage(toolId, { invocationId, agent, durationMs = 0, success = true, error = '' } = {}) {
    const tool = tools.get(String(toolId));
    if (!tool) return false;

    const entry = {
      id: invocationId || crypto.randomUUID(),
      at: new Date(now()).toISOString(),
      agent: agent || 'unknown',
      duration_ms: Math.max(0, Number(durationMs) || 0),
      success: Boolean(success),
      error: error ? String(error).slice(0, 300) : '',
    };

    tool.usage_history = [entry, ...(tool.usage_history || [])].slice(0, MAX_USAGE_HISTORY);

    // Update usage summary
    const total = (tool.usage_summary?.total_invocations || 0) + 1;
    const history = tool.usage_history;
    const successes = history.filter((h) => h.success).length;
    const avgDuration =
      history.reduce((acc, h) => acc + h.duration_ms, 0) / (history.length || 1);

    tool.usage_summary = {
      total_invocations: total,
      last_used: entry.at,
      success_rate: successes / (history.length || 1),
      average_duration_ms: Math.round(avgDuration),
    };

    persist();
    return true;
  }

  function close() {
    releaseLock();
  }

  return {
    registerTool,
    getTool,
    hasTool,
    listTools,
    updateTool,
    deleteTool,
    setToolEnabled,
    addCapability,
    removeCapability,
    listCategories,
    addCategory,
    recordHealthCheck,
    createSnapshot,
    listSnapshots,
    restoreSnapshot,
    findToolsForCapabilities,
    recordUsage,
    close,
    get size() {
      return tools.size;
    },
  };
}
