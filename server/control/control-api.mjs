/**
 * REST API Endpoints for My Office Agent Control Center.
 * Handles /api/control/* routes with strict origin, loopback, and permission verification.
 */

export async function handleControlRoutes(req, res, {
  url,
  capabilityRegistry,
  controlManager,
  isLoopback = () => true,
  sameOriginOf = () => true,
  authorized = () => true,
  readJson = async () => ({}),
  json = (r, code, data) => {
    r.statusCode = code;
    r.setHeader?.('Content-Type', 'application/json');
    r.end?.(JSON.stringify(data));
  },
} = {}) {
  const pathname = url.pathname;
  const method = req.method;

  if (!pathname.startsWith('/api/control')) {
    return false;
  }

  // Security check: loopback and authorization required
  if (!authorized(req, url) || !isLoopback(req)) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return true;
  }

  // 1. GET /api/control/agents - List all agents with truthful capabilities
  if (method === 'GET' && pathname === '/api/control/agents') {
    const list = capabilityRegistry.listAgents();
    json(res, 200, { ok: true, count: list.length, agents: list });
    return true;
  }

  // 2. GET /api/control/agents/:id - Get single agent with capabilities
  const agentMatch = pathname.match(/^\/api\/control\/agents\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && agentMatch) {
    const agentId = agentMatch[1];
    const agent = capabilityRegistry.getAgent(agentId);
    if (!agent) {
      json(res, 404, { ok: false, error: `Agent not found: ${agentId}` });
      return true;
    }
    json(res, 200, { ok: true, agent });
    return true;
  }

  // 3. GET /api/control/sessions - List sessions
  if (method === 'GET' && pathname === '/api/control/sessions') {
    const agentId = url.searchParams.get('agent_id') || url.searchParams.get('agentId');
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const sessions = controlManager.listSessions({ agentId, status, limit });
    json(res, 200, { ok: true, count: sessions.length, sessions });
    return true;
  }

  // 4. GET /api/control/sessions/:id - Get session details
  const sessionMatch = pathname.match(/^\/api\/control\/sessions\/([a-zA-Z0-9_.:-]+)$/);
  if (method === 'GET' && sessionMatch) {
    const sessionId = sessionMatch[1];
    const session = controlManager.getSession(sessionId);
    if (!session) {
      json(res, 404, { ok: false, error: `Session not found: ${sessionId}` });
      return true;
    }
    json(res, 200, { ok: true, session });
    return true;
  }

  // 5. POST /api/control/dispatch - Dispatch a new task
  if (method === 'POST' && pathname === '/api/control/dispatch') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const body = await readJson(req, 8_000_000);
      const {
        agent_id,
        agentId,
        working_directory,
        workingDirectory,
        instruction,
        session_id,
        sessionId,
        expected_artifacts,
        expectedArtifacts,
      } = body || {};

      const targetAgent = agent_id || agentId;
      const targetDir = working_directory || workingDirectory;
      const targetSess = session_id || sessionId;
      const targetArtifacts = expected_artifacts || expectedArtifacts || [];

      const result = await controlManager.dispatchTask({
        agentId: targetAgent,
        workingDirectory: targetDir,
        instruction,
        sessionId: targetSess,
        expectedArtifacts: targetArtifacts,
      });

      json(res, 201, { ok: true, ...result });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 6. POST /api/control/sessions/:id/steer - Send follow-up instruction
  const steerMatch = pathname.match(/^\/api\/control\/sessions\/([a-zA-Z0-9_.:-]+)\/steer$/);
  if (method === 'POST' && steerMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const sessionId = steerMatch[1];
      const body = await readJson(req, 8_000_000);
      const text = body?.instruction || body?.text;
      const result = await controlManager.sendFollowUp(sessionId, text);
      json(res, 200, result);
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 7. GET /api/control/executions - List executions
  if (method === 'GET' && pathname === '/api/control/executions') {
    const agentId = url.searchParams.get('agent_id') || url.searchParams.get('agentId');
    const sessionId = url.searchParams.get('session_id') || url.searchParams.get('sessionId');
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const executions = controlManager.listExecutions({ agentId, sessionId, status, limit });
    json(res, 200, { ok: true, count: executions.length, executions });
    return true;
  }

  // 8. GET /api/control/executions/:id - Get single execution
  const executionMatch = pathname.match(/^\/api\/control\/executions\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && executionMatch) {
    const executionId = executionMatch[1];
    const execution = controlManager.getExecution(executionId);
    if (!execution) {
      json(res, 404, { ok: false, error: `Execution not found: ${executionId}` });
      return true;
    }
    json(res, 200, { ok: true, execution });
    return true;
  }

  // 9. POST /api/control/executions/:id/cancel - Cancel execution
  const cancelMatch = pathname.match(/^\/api\/control\/executions\/([a-zA-Z0-9_-]+)\/cancel$/);
  if (method === 'POST' && cancelMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const executionId = cancelMatch[1];
      const body = await readJson(req, 8_000_000);
      const reason = body?.reason || 'Cancelled by user via Agent Control Center';
      const result = await controlManager.cancelExecution(executionId, reason);
      json(res, 200, result);
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 10. POST /api/control/executions/:id/retry - Retry execution
  const retryMatch = pathname.match(/^\/api\/control\/executions\/([a-zA-Z0-9_-]+)\/retry$/);
  if (method === 'POST' && retryMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const executionId = retryMatch[1];
      const result = await controlManager.retryExecution(executionId);
      json(res, 201, { ok: true, ...result });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  return false;
}

