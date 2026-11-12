/**
 * API Routes for Multi-Agent Tool Distribution.
 */

export async function handleToolDistributionRoutes(req, res, {
  url,
  distributionEngine,
  isLoopback,
  sameOriginOf,
  authorized,
  readJson,
  json,
} = {}) {
  // 1. GET /api/tools/distribution/matrix — Compatibility Matrix across tools and agents
  if (url.pathname === '/api/tools/distribution/matrix' && req.method === 'GET') {
    if (!authorized(req, url) || !isLoopback(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const matrix = distributionEngine.getCompatibilityMatrix();
      json(res, 200, { ok: true, matrix });
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 2. GET /api/tools/distribution/agents — Detected agents on host
  if (url.pathname === '/api/tools/distribution/agents' && req.method === 'GET') {
    if (!authorized(req, url) || !isLoopback(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const agents = distributionEngine.getDetectedAgents();
      json(res, 200, { ok: true, agents });
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 3. GET /api/tools/distribution/list — Active distribution records
  if (url.pathname === '/api/tools/distribution/list' && req.method === 'GET') {
    if (!authorized(req, url) || !isLoopback(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const toolId = url.searchParams.get('tool_id') || undefined;
      const agentId = url.searchParams.get('agent_id') || undefined;
      const distributions = distributionEngine.listDistributions({ toolId, agentId });
      json(res, 200, { ok: true, distributions });
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 4. POST /api/tools/distribution/plan — Generate distribution plan for user approval
  if (url.pathname === '/api/tools/distribution/plan' && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 64_000);
      const toolId = body?.tool_id;
      const agentId = body?.agent_id;
      const options = body?.options || {};

      if (!toolId || !agentId) {
        json(res, 400, { ok: false, error: 'missing_tool_id_or_agent_id' });
        return true;
      }

      const plan = distributionEngine.planDistribution(toolId, agentId, options);
      json(res, 200, { ok: true, plan });
      return true;
    } catch (e) {
      json(res, 400, { ok: false, error: e.message });
      return true;
    }
  }

  // 5. POST /api/tools/distribution/distribute — Execute approved distribution
  if (url.pathname === '/api/tools/distribution/distribute' && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 64_000);
      const toolId = body?.tool_id;
      const agentId = body?.agent_id;
      const userApproval = body?.user_approval;
      const options = body?.options || {};

      if (!toolId || !agentId || !userApproval) {
        json(res, 400, { ok: false, error: 'missing_required_distribution_params' });
        return true;
      }

      const result = await distributionEngine.distributeTool(toolId, agentId, { userApproval, options });
      json(res, result.ok ? 200 : 400, result);
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 6. POST /api/tools/distribution/enable & /disable
  if ((url.pathname === '/api/tools/distribution/enable' || url.pathname === '/api/tools/distribution/disable') && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 64_000);
      const distributionId = body?.distribution_id;
      if (!distributionId) {
        json(res, 400, { ok: false, error: 'missing_distribution_id' });
        return true;
      }

      const enable = url.pathname === '/api/tools/distribution/enable';
      const result = await distributionEngine.toggleDistributionEnabled(distributionId, enable);
      json(res, result.ok ? 200 : 400, result);
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 7. POST /api/tools/distribution/verify
  if (url.pathname === '/api/tools/distribution/verify' && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 64_000);
      const distributionId = body?.distribution_id;
      if (!distributionId) {
        json(res, 400, { ok: false, error: 'missing_distribution_id' });
        return true;
      }

      const result = await distributionEngine.verifyDistribution(distributionId);
      json(res, result.ok ? 200 : 400, result);
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 8. POST /api/tools/distribution/remove
  if (url.pathname === '/api/tools/distribution/remove' && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 64_000);
      const distributionId = body?.distribution_id;
      if (!distributionId) {
        json(res, 400, { ok: false, error: 'missing_distribution_id' });
        return true;
      }

      const result = await distributionEngine.removeDistribution(distributionId);
      json(res, result.ok ? 200 : 400, result);
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  // 9. POST /api/tools/distribution/rollback
  if (url.pathname === '/api/tools/distribution/rollback' && req.method === 'POST') {
    if (!authorized(req, url) || !isLoopback(req) || !sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden' });
      return true;
    }

    try {
      const body = await readJson(req, 64_000);
      const distributionId = body?.distribution_id;
      if (!distributionId) {
        json(res, 400, { ok: false, error: 'missing_distribution_id' });
        return true;
      }

      const result = await distributionEngine.rollbackDistribution(distributionId);
      json(res, result.ok ? 200 : 400, result);
      return true;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return true;
    }
  }

  return false;
}
