/**
 * API Routes for Tool Lifecycle Management & Execution Isolation.
 */

import { performToolHealthCheck } from './health-checker.mjs';
import { detectToolConflicts } from './conflict-detector.mjs';

/**
 * Handles API routes for Tool Lifecycle Management.
 */
export async function handleToolLifecycleRoutes(req, res, {
  url,
  registry,
  lifecycleManager,
  isLoopback,
  sameOriginOf,
  authorized,
  readJson,
  json,
} = {}) {
  // 1. POST /api/tools/install/plan — Prepares execution plan for user review
  if (url.pathname === '/api/tools/install/plan' && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 256_000);
      const candidate = body?.candidate_tool;
      if (!candidate || !candidate.tool_id) {
        json(res, 400, { ok: false, error: 'missing_candidate_tool' });
        return true;
      }

      const planResult = lifecycleManager.prepareInstallationPlan(candidate);
      json(res, 200, planResult);
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 2. POST /api/tools/install — Execute approved installation
  if (url.pathname === '/api/tools/install' && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 512_000);
      const candidate = body?.candidate_tool;
      const userApproval = body?.user_approval;
      const files = body?.files || {};

      if (!candidate || !candidate.tool_id) {
        json(res, 400, { ok: false, error: 'missing_candidate_tool' });
        return true;
      }

      const result = await lifecycleManager.installTool(candidate, {
        userApproval,
        files,
      });

      if (!result.ok) {
        json(res, 400, result);
        return true;
      }

      json(res, 200, result);
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 3. POST /api/tools/enable & POST /api/tools/disable
  if ((url.pathname === '/api/tools/enable' || url.pathname === '/api/tools/disable') && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 64_000);
      const toolId = body?.tool_id;
      if (!toolId) {
        json(res, 400, { ok: false, error: 'missing_tool_id' });
        return true;
      }

      const enable = url.pathname === '/api/tools/enable';
      const result = lifecycleManager.toggleToolEnabled(toolId, enable);
      json(res, result.ok ? 200 : 400, result);
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 4. POST /api/tools/pin & POST /api/tools/unpin
  if ((url.pathname === '/api/tools/pin' || url.pathname === '/api/tools/unpin') && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 64_000);
      const toolId = body?.tool_id;
      if (!toolId) {
        json(res, 400, { ok: false, error: 'missing_tool_id' });
        return true;
      }

      let result;
      if (url.pathname === '/api/tools/pin') {
        const version = body?.version;
        if (!version) {
          json(res, 400, { ok: false, error: 'missing_version_to_pin' });
          return true;
        }
        result = lifecycleManager.pinVersion(toolId, version);
      } else {
        result = lifecycleManager.unpinVersion(toolId);
      }

      json(res, result.ok ? 200 : 400, result);
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 5. POST /api/tools/update — Update an installed tool
  if (url.pathname === '/api/tools/update' && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 512_000);
      const toolId = body?.tool_id;
      const newVersion = body?.new_version;
      const userApproval = body?.user_approval;
      const files = body?.files || {};

      if (!toolId || !newVersion) {
        json(res, 400, { ok: false, error: 'missing_tool_id_or_version' });
        return true;
      }

      const result = await lifecycleManager.updateTool(toolId, newVersion, {
        userApproval,
        files,
      });

      json(res, result.ok ? 200 : 400, result);
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 6. POST /api/tools/rollback — Roll back tool to previous snapshot
  if (url.pathname === '/api/tools/rollback' && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 64_000);
      const toolId = body?.tool_id;
      const snapshotId = body?.snapshot_id || null;

      if (!toolId) {
        json(res, 400, { ok: false, error: 'missing_tool_id' });
        return true;
      }

      const result = await lifecycleManager.rollbackTool(toolId, snapshotId);
      json(res, result.ok ? 200 : 400, result);
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 7. POST /api/tools/uninstall — Safe uninstallation with boundary validation
  if (url.pathname === '/api/tools/uninstall' && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 64_000);
      const toolId = body?.tool_id;
      const userConfirmation = Boolean(body?.user_confirmation);

      if (!toolId) {
        json(res, 400, { ok: false, error: 'missing_tool_id' });
        return true;
      }

      const result = await lifecycleManager.uninstallTool(toolId, { userConfirmation });
      json(res, result.ok ? 200 : 400, result);
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 8. POST /api/tools/verify — Run health check and verification
  if (url.pathname === '/api/tools/verify' && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 64_000);
      const toolId = body?.tool_id;
      if (!toolId) {
        json(res, 400, { ok: false, error: 'missing_tool_id' });
        return true;
      }

      const tool = registry.getTool(toolId);
      if (!tool) {
        json(res, 404, { ok: false, error: 'tool_not_found' });
        return true;
      }

      const health = await performToolHealthCheck(tool);
      registry.recordHealthCheck(toolId, health.healthy, health.message);
      json(res, 200, { ok: true, tool_id: toolId, health });
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 9. GET /api/tools/health — Check health of all installed tools
  if (url.pathname === '/api/tools/health' && req.method === 'GET') {
    if (!authorized(req, url) || !isLoopback(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    const all = registry.listTools();
    const installed = all.filter((t) => t.installation_status === 'healthy' || t.installation_status === 'installed');
    const healthSummaries = [];

    for (const tool of installed) {
      const h = await performToolHealthCheck(tool);
      healthSummaries.push({
        tool_id: tool.tool_id,
        name: tool.name,
        healthy: h.healthy,
        message: h.message,
        checked_at: h.checked_at,
      });
    }

    json(res, 200, { ok: true, tools: healthSummaries });
    return true;
  }

  // 10. GET /api/tools/audit — Query lifecycle audit logs
  if (url.pathname === '/api/tools/audit' && req.method === 'GET') {
    if (!authorized(req, url) || !isLoopback(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    const toolId = url.searchParams.get('tool_id');
    const limit = Number(url.searchParams.get('limit')) || 50;
    const logs = lifecycleManager.getAuditLogs({ toolId: toolId || undefined, limit });
    json(res, 200, { ok: true, logs });
    return true;
  }

  // 11. POST /api/tools/conflicts — Check conflicts for candidate
  if (url.pathname === '/api/tools/conflicts' && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 256_000);
      const candidate = body?.candidate_tool;
      if (!candidate || !candidate.tool_id) {
        json(res, 400, { ok: false, error: 'missing_candidate_tool' });
        return true;
      }

      const conflicts = detectToolConflicts(candidate, registry.listTools());
      json(res, 200, { ok: true, conflicts });
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  return false;
}

