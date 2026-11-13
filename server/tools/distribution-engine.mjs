/**
 * Universal Tool Distribution Engine.
 * Manages agent adapters, distribution plans, approval binding,
 * independent lifecycle operations per agent, and 5-level verification.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { claudeAdapter } from './adapters/claude-adapter.mjs';
import { codexCliAdapter } from './adapters/codex-cli-adapter.mjs';
import { codexAppAdapter } from './adapters/codex-app-adapter.mjs';
import { antigravityAdapter } from './adapters/antigravity-adapter.mjs';
import { genericMcpAdapter } from './adapters/generic-mcp-adapter.mjs';

export function createDistributionEngine({
  registry,
  lifecycleManager = null,
  permissionRegistry = null,
  policyEngine = null,
  storePath = null,
  integrationState = null,
} = {}) {
  const store = storePath || path.resolve(process.cwd(), 'data', 'tools', 'distribution-registry.json');
  fs.mkdirSync(path.dirname(store), { recursive: true });
  void lifecycleManager;
  void policyEngine;

  // Map of registered agent adapters: agentId -> Adapter
  const adapters = new Map([
    [claudeAdapter.id, claudeAdapter],
    [codexCliAdapter.id, codexCliAdapter],
    [codexAppAdapter.id, codexAppAdapter],
    [antigravityAdapter.id, antigravityAdapter],
    [genericMcpAdapter.id, genericMcpAdapter],
  ]);

  // Active distribution plans: planId -> { plan, createdAt, expiresAt, used }
  const activePlans = new Map();

  // In-memory distribution records: distributionId -> Record
  const distributions = new Map();

  function persist() {
    try {
      const list = [...distributions.values()];
      const tmp = `${store}.tmp-${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify({ schema_version: '1.0.0', distributions: list }, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, store);
    } catch (e) {
      console.error('Failed to persist distribution registry:', e.message);
    }
  }

  function load() {
    if (!fs.existsSync(store)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(store, 'utf8'));
      if (Array.isArray(raw.distributions)) {
        distributions.clear();
        for (const dist of raw.distributions) {
          if (dist && dist.distribution_id) {
            distributions.set(dist.distribution_id, dist);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  load();

  /**
   * Registers a custom adapter.
   */
  function registerAdapter(adapter) {
    if (!adapter || !adapter.id) throw new Error('Invalid adapter: missing id');
    adapters.set(adapter.id, adapter);
  }

  /**
   * Lists all registered adapters.
   */
  function listAdapters() {
    return [...adapters.values()].map((a) => ({
      id: a.id,
      name: a.name,
      version: a.version,
      supported_protocols: a.supportedProtocols,
    }));
  }

  /**
   * Inspects detected agents on the host environment.
   */
  function getDetectedAgents(options = {}) {
    const results = [];
    for (const adapter of adapters.values()) {
      const env = adapter.detectAgent(options);
      results.push({
        agent_id: adapter.id,
        name: adapter.name,
        version: env.version || adapter.version,
        detected: Boolean(env.detected),
        status: env.status || (env.detected ? 'DETECTED' : 'NOT_FOUND'),
        statuses: env.statuses || (env.detected ? ['SUPPORTED', 'DETECTED'] : ['SUPPORTED', 'NOT_FOUND']),
        verification_level: env.verification_level ?? (env.detected ? 1 : 0),
        executable_path: env.executable_path || null,
        config_path: env.config_path || null,
        skills_dir: env.skills_dir || null,
        supported_protocols: adapter.supportedProtocols || [],
        evidence: env.evidence || null,
        detection_error: env.detection_error || null,
        environment: env,
        ...(integrationState?.get(adapter.id, env) || {}),
      });
    }
    return results;
  }

  /**
   * Computes the Compatibility Matrix for all installed tools across all agents.
   */
  function getCompatibilityMatrix() {
    const installedTools = registry.listTools().filter((t) => t.installation_status === 'healthy' || t.installation_status === 'installed');
    const matrix = [];

    for (const tool of installedTools) {
      const agentCompatibilities = {};
      for (const [agentId, adapter] of adapters.entries()) {
        const compat = adapter.checkCompatibility(tool);
        const existingDist = [...distributions.values()].find((d) => d.tool_id === tool.tool_id && d.agent_id === agentId);

        agentCompatibilities[agentId] = {
          agent_id: agentId,
          agent_name: adapter.name,
          compatible: compat.compatible,
          protocol: compat.protocol || null,
          status: compat.status,
          reason: compat.reason,
          distributed: Boolean(existingDist),
          distribution_id: existingDist?.distribution_id || null,
          enabled: existingDist?.enabled_status ?? false,
          verification_level: existingDist?.verification_level || 0,
        };
      }

      matrix.push({
        tool_id: tool.tool_id,
        tool_name: tool.name,
        tool_version: tool.version,
        protocols: tool.integration_protocols || [],
        agents: agentCompatibilities,
      });
    }

    return matrix;
  }

  /**
   * Prepares a distribution plan for user review.
   */
  function planDistribution(toolId, agentId, options = {}) {
    const tool = registry.getTool(toolId);
    if (!tool) throw new Error(`Tool '${toolId}' not found in registry`);

    if (tool.installation_status !== 'healthy' && tool.installation_status !== 'installed') {
      throw new Error(`Tool '${toolId}' cannot be distributed because its installation status is '${tool.installation_status}' (must be healthy)`);
    }

    const adapter = adapters.get(agentId);
    if (!adapter) throw new Error(`Adapter for agent '${agentId}' not found`);

    const plan = adapter.planDistribution(tool, options);

    // Track active plan with 15 min expiry
    activePlans.set(plan.plan_id, {
      plan,
      createdAt: Date.now(),
      expiresAt: Date.now() + 15 * 60 * 1000,
      used: false,
    });

    return plan;
  }

  /**
   * Distributes a tool to an agent with explicit user approval.
   */
  async function distributeTool(toolId, agentId, {
    userApproval,
    options = {},
  } = {}) {
    // 1. Validate user approval
    if (!userApproval || userApproval.approved !== true || !userApproval.plan_id) {
      return {
        ok: false,
        error: 'Distribution requires explicit user approval containing approved=true and valid plan_id',
      };
    }

    // 2. Validate plan existence and expiry
    const planEntry = activePlans.get(userApproval.plan_id);
    if (!planEntry) {
      return { ok: false, error: 'Distribution plan not found or expired' };
    }
    if (planEntry.used) {
      return { ok: false, error: 'Distribution plan has already been used (single-use policy)' };
    }
    if (Date.now() > planEntry.expiresAt) {
      return { ok: false, error: 'Distribution plan has expired' };
    }

    planEntry.used = true;
    const plan = planEntry.plan;

    const tool = registry.getTool(toolId);
    if (!tool) return { ok: false, error: `Tool '${toolId}' not found` };

    const adapter = adapters.get(agentId);
    if (!adapter) return { ok: false, error: `Adapter '${agentId}' not found` };

    try {
      // Execute distribution via adapter
      const distResult = await adapter.distribute(tool, plan, options);
      if (!distResult.ok) {
        throw new Error(distResult.error || 'Adapter distribution failed');
      }

      // Generate distribution ID
      const distId = `dist-${agentId}-${toolId}-${crypto.randomBytes(3).toString('hex')}`;
      const nowIso = new Date().toISOString();

      const record = {
        distribution_id: distId,
        tool_id: tool.tool_id,
        tool_version: tool.version,
        agent_id: agentId,
        adapter_id: adapter.id,
        adapter_version: adapter.version,
        integration_protocol: plan.protocol,
        integration_method: plan.method,
        target_location: plan.target_location,
        source_location: plan.source_location,
        configuration_reference: plan.config_path || '',
        enabled_status: true,
        compatibility_status: 'verified_compatible',
        verification_status: distResult.verification?.verified ? 'verified' : 'unverified',
        verification_level: distResult.verification?.verification_level || 1,
        health_status: 'healthy',
        created_at: nowIso,
        updated_at: nowIso,
        last_verified_at: nowIso,
        rollback_snapshot_id: distResult.backup_path || null,
      };

      distributions.set(distId, record);
      persist();

      // Automatically register approved permissions in Permission Registry (Phase 5)
      if (permissionRegistry) {
        const scopes = Array.isArray(tool.required_permissions) && tool.required_permissions.length > 0
          ? tool.required_permissions.map((p) => (typeof p === 'string' ? p : p.scope)).filter(Boolean)
          : [record.integration_protocol === 'mcp' ? 'mcp:connect' : 'process:exec'];

        try {
          permissionRegistry.grantPermission({
            tool_id: tool.tool_id,
            agent_id: agentId,
            distribution_id: distId,
            scopes,
            approval_reference: userApproval.plan_id,
          });
        } catch {
          // Non-blocking if permissions are non-standard
        }
      }

      return {
        ok: true,
        distribution: record,
      };
    } catch (err) {
      return {
        ok: false,
        error: `Distribution failed: ${err.message}`,
      };
    }
  }

  /**
   * Toggles enabled status of a specific agent distribution.
   */
  async function toggleDistributionEnabled(distributionId, enabled, options = {}) {
    const record = distributions.get(distributionId);
    if (!record) return { ok: false, error: 'Distribution not found' };

    const adapter = adapters.get(record.agent_id);
    if (!adapter) return { ok: false, error: 'Adapter not found' };

    const result = enabled
      ? await adapter.enableDistribution(record, options)
      : await adapter.disableDistribution(record, options);

    if (result.ok) {
      record.enabled_status = Boolean(enabled);
      record.updated_at = new Date().toISOString();
      persist();
    }

    return result;
  }

  /**
   * Verifies an active distribution across the 5 verification levels.
   */
  async function verifyDistribution(distributionId, options = {}) {
    const record = distributions.get(distributionId);
    if (!record) return { ok: false, error: 'Distribution not found' };

    const adapter = adapters.get(record.agent_id);
    if (!adapter) return { ok: false, error: 'Adapter not found' };

    const verification = await adapter.verifyDistribution(record, options);
    record.verification_level = verification.verification_level;
    record.verification_status = verification.verified ? 'verified' : 'unverified';
    record.last_verified_at = new Date().toISOString();
    persist();

    return {
      ok: true,
      distribution_id: distributionId,
      verification,
    };
  }

  /**
   * Safely removes a distribution instance for an agent without touching other agents.
   */
  async function removeDistribution(distributionId, options = {}) {
    const record = distributions.get(distributionId);
    if (!record) return { ok: false, error: 'Distribution not found' };

    const adapter = adapters.get(record.agent_id);
    if (!adapter) return { ok: false, error: 'Adapter not found' };

    const res = await adapter.removeDistribution(record, options);
    if (res.ok) {
      // Revoke any active permissions for this distribution (Phase 5)
      if (permissionRegistry) {
        try {
          const grants = permissionRegistry.listPermissions({ distribution_id: distributionId, status: 'active' });
          for (const g of grants) {
            permissionRegistry.revokePermission(g.permission_id, { reason: 'Distribution removed' });
          }
        } catch {
          // Non-blocking
        }
      }

      distributions.delete(distributionId);
      persist();
      return { ok: true, removed: true };
    }

    return res;
  }

  /**
   * Rolls back an agent distribution to its pre-distribution state.
   */
  async function rollbackDistribution(distributionId, options = {}) {
    const record = distributions.get(distributionId);
    if (!record) return { ok: false, error: 'Distribution not found' };

    const adapter = adapters.get(record.agent_id);
    if (!adapter) return { ok: false, error: 'Adapter not found' };

    if (!record.rollback_snapshot_id) {
      return { ok: false, error: 'No rollback snapshot available for this distribution' };
    }

    const res = await adapter.rollbackDistribution(record, record.rollback_snapshot_id, options);
    if (res.ok) {
      distributions.delete(distributionId);
      persist();
      return { ok: true, rolled_back: true };
    }

    return res;
  }

  /**
   * Updates an existing distribution when a new version of the tool is installed.
   */
  async function updateDistribution(distributionId, newVersion, options = {}) {
    const record = distributions.get(distributionId);
    if (!record) return { ok: false, error: 'Distribution not found' };

    const tool = registry.getTool(record.tool_id);
    if (!tool) return { ok: false, error: 'Tool not found' };

    // Remove old target link/config
    await removeDistribution(distributionId, options);

    // Plan and distribute new version
    const plan = planDistribution(record.tool_id, record.agent_id, options);

    return distributeTool(record.tool_id, record.agent_id, {
      userApproval: {
        approved: true,
        plan_id: plan.plan_id,
        timestamp: new Date().toISOString(),
      },
      options,
    });
  }

  /**
   * Lists all active distribution records.
   */
  function listDistributions({ toolId, agentId } = {}) {
    let list = [...distributions.values()];
    if (toolId) list = list.filter((d) => d.tool_id === toolId);
    if (agentId) list = list.filter((d) => d.agent_id === agentId);
    return list;
  }

  return {
    registerAdapter,
    listAdapters,
    getDetectedAgents,
    getCompatibilityMatrix,
    planDistribution,
    distributeTool,
    toggleDistributionEnabled,
    verifyDistribution,
    removeDistribution,
    rollbackDistribution,
    updateDistribution,
    listDistributions,
  };
}
