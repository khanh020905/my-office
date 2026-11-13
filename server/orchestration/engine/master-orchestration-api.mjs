/**
 * REST API Endpoints for Master Task Multi-Agent Orchestration (Phase 2).
 * Exposes /api/orchestration/master-tasks/* routes with loopback & authorization guards.
 */

export async function handleMasterOrchestrationRoutes(req, res, {
  url,
  masterOrchestrator,
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

  if (!pathname.startsWith('/api/orchestration/master-tasks')) {
    return false;
  }

  // Security check: loopback and authorization required
  if (!authorized(req, url) || !isLoopback(req)) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return true;
  }

  // 1. GET /api/orchestration/master-tasks - List master tasks
  if (method === 'GET' && pathname === '/api/orchestration/master-tasks') {
    const status = url.searchParams.get('status');
    const projectId = url.searchParams.get('project_id') || url.searchParams.get('projectId');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const list = masterOrchestrator.listMasterTasks({ status, projectId, limit });
    json(res, 200, { ok: true, count: list.length, masterTasks: list });
    return true;
  }

  // 2. POST /api/orchestration/master-tasks - Create new master task
  if (method === 'POST' && pathname === '/api/orchestration/master-tasks') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const body = await readJson(req, 8_000_000);
      const masterTask = masterOrchestrator.createMasterTask({
        title: body?.title,
        description: body?.description,
        projectId: body?.project_id || body?.projectId,
        workingDirectory: body?.working_directory || body?.workingDirectory,
        subtasks: body?.subtasks || [],
        executionPolicy: body?.execution_policy || body?.executionPolicy,
        createdBy: body?.created_by || 'user',
      });
      json(res, 201, { ok: true, masterTask });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 3. GET /api/orchestration/master-tasks/:id - Get single master task
  const singleMatch = pathname.match(/^\/api\/orchestration\/master-tasks\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && singleMatch) {
    const masterTaskId = singleMatch[1];
    const masterTask = masterOrchestrator.getMasterTask(masterTaskId);
    if (!masterTask) {
      json(res, 404, { ok: false, error: `Master task not found: ${masterTaskId}` });
      return true;
    }
    const handoffs = masterOrchestrator.getHandoffs(masterTaskId);
    json(res, 200, { ok: true, masterTask, handoffs });
    return true;
  }

  // 4. POST /api/orchestration/master-tasks/:id/start - Start master task orchestration
  const startMatch = pathname.match(/^\/api\/orchestration\/master-tasks\/([a-zA-Z0-9_-]+)\/start$/);
  if (method === 'POST' && startMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const masterTaskId = startMatch[1];
      const masterTask = await masterOrchestrator.startMasterTask(masterTaskId);
      json(res, 200, { ok: true, masterTask });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 5. POST /api/orchestration/master-tasks/:id/cancel - Cancel master task
  const cancelMatch = pathname.match(/^\/api\/orchestration\/master-tasks\/([a-zA-Z0-9_-]+)\/cancel$/);
  if (method === 'POST' && cancelMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const masterTaskId = cancelMatch[1];
      const body = await readJson(req, 8_000_000);
      const reason = body?.reason || 'Cancelled by user';
      const masterTask = await masterOrchestrator.cancelMasterTask(masterTaskId, reason);
      json(res, 200, { ok: true, masterTask });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 6. POST /api/orchestration/master-tasks/:id/subtasks/:subtaskId/retry - Retry failed subtask
  const retrySubtaskMatch = pathname.match(/^\/api\/orchestration\/master-tasks\/([a-zA-Z0-9_-]+)\/subtasks\/([a-zA-Z0-9_-]+)\/retry$/);
  if (method === 'POST' && retrySubtaskMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const [, masterTaskId, subtaskId] = retrySubtaskMatch;
      const subtask = await masterOrchestrator.retrySubtask(masterTaskId, subtaskId);
      json(res, 200, { ok: true, subtask });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  return false;
}

