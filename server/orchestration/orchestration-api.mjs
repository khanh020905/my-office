/**
 * REST API Endpoints for Dynamic Task Orchestration & Automated Tool Selection (Phase 6).
 */

import { TASK_TYPES } from './task-analyzer.mjs';
import { SUPPORTED_AGENTS } from './agent-selector.mjs';

export async function handleOrchestrationRoutes(req, res, {
  url,
  orchestrator,
  analyzer,
  matcher,
  selector,
  planner,
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
  void selector;
  const pathname = url.pathname;
  const method = req.method;

  if (!pathname.startsWith('/api/orchestration')) {
    return false;
  }

  // Security authorization and loopback check
  if (!authorized(req, url) || !isLoopback(req)) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return true;
  }

  // 1. POST /api/orchestration/analyze - Analyze request into task specification
  if (method === 'POST' && pathname === '/api/orchestration/analyze') {
    try {
      const body = await readJson(req, 8_000_000);
      const spec = analyzer.analyzeTask(body);
      json(res, 200, { ok: true, task_spec: spec });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 2. POST /api/orchestration/match - Match candidate tools
  if (method === 'POST' && pathname === '/api/orchestration/match') {
    try {
      const body = await readJson(req, 8_000_000);
      const { task_spec, target_agent = null } = body || {};
      if (!task_spec) {
        json(res, 400, { ok: false, error: 'task_spec is required' });
        return true;
      }
      const matchResult = matcher.matchTools(task_spec, { targetAgent: target_agent });
      json(res, 200, { ok: true, match_result: matchResult });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 3. POST /api/orchestration/plan - Generate plan
  if (method === 'POST' && pathname === '/api/orchestration/plan') {
    try {
      const body = await readJson(req, 8_000_000);
      const { task_spec, selected_agent, matched_tools = [] } = body || {};
      if (!task_spec) {
        json(res, 400, { ok: false, error: 'task_spec is required' });
        return true;
      }
      const plan = planner.generatePlan({
        taskSpec: task_spec,
        selectedAgent: selected_agent,
        matchedTools: matched_tools,
      });
      json(res, 200, { ok: true, plan });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 4. POST /api/orchestration/submit - Submit full orchestration task
  if (method === 'POST' && pathname === '/api/orchestration/submit') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const body = await readJson(req, 8_000_000);
      const taskRecord = await orchestrator.submitTask(body);
      json(res, 201, { ok: true, task: taskRecord });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 5. GET /api/orchestration/tasks - List tasks
  if (method === 'GET' && pathname === '/api/orchestration/tasks') {
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const list = orchestrator.listTasks({ status, limit });
    json(res, 200, { ok: true, count: list.length, tasks: list });
    return true;
  }

  // 6. GET /api/orchestration/tasks/:id/trace - Get trace
  const traceMatch = pathname.match(/^\/api\/orchestration\/tasks\/([a-zA-Z0-9_-]+)\/trace$/);
  if (method === 'GET' && traceMatch) {
    const taskId = traceMatch[1];
    const trace = orchestrator.getTaskTrace(taskId);
    if (!trace) {
      json(res, 404, { ok: false, error: 'Task not found' });
      return true;
    }
    json(res, 200, { ok: true, trace });
    return true;
  }

  // 7. GET /api/orchestration/tasks/:id - Get single task
  const singleTaskMatch = pathname.match(/^\/api\/orchestration\/tasks\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && singleTaskMatch) {
    const taskId = singleTaskMatch[1];
    const task = orchestrator.getTask(taskId);
    if (!task) {
      json(res, 404, { ok: false, error: 'Task not found' });
      return true;
    }
    json(res, 200, { ok: true, task });
    return true;
  }

  // 8. POST /api/orchestration/tasks/:id/approve - Approve plan
  const approveMatch = pathname.match(/^\/api\/orchestration\/tasks\/([a-zA-Z0-9_-]+)\/approve$/);
  if (method === 'POST' && approveMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const taskId = approveMatch[1];
      const body = await readJson(req, 8_000_000);
      const task = await orchestrator.approveTask(taskId, {
        approvedBy: body?.approved_by || 'user',
        expectedPlanVersion: body?.expected_plan_version,
        expectedPlanHash: body?.expected_plan_hash,
      });
      json(res, 200, { ok: true, task });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 8b. POST /api/orchestration/tasks/:id/regenerate-plan - Regenerate plan with updated analyzer
  const regenMatch = pathname.match(/^\/api\/orchestration\/tasks\/([a-zA-Z0-9_-]+)\/regenerate-plan$/);
  if (method === 'POST' && regenMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const taskId = regenMatch[1];
      const body = await readJson(req, 8_000_000);
      const task = await orchestrator.regenerateTaskPlan(taskId, { reason: body?.reason || 'Plan regeneration requested' });
      json(res, 200, { ok: true, task });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 9. POST /api/orchestration/tasks/:id/cancel - Cancel task
  const cancelMatch = pathname.match(/^\/api\/orchestration\/tasks\/([a-zA-Z0-9_-]+)\/cancel$/);
  if (method === 'POST' && cancelMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const taskId = cancelMatch[1];
      const body = await readJson(req, 8_000_000);
      const resCancel = orchestrator.cancelTask(taskId, { reason: body?.reason || 'Cancelled by user' });
      json(res, 200, resCancel);
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 10. POST /api/orchestration/tasks/:id/retry - Retry task
  const retryMatch = pathname.match(/^\/api\/orchestration\/tasks\/([a-zA-Z0-9_-]+)\/retry$/);
  if (method === 'POST' && retryMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const taskId = retryMatch[1];
      const task = await orchestrator.retryTask(taskId);
      json(res, 200, { ok: true, task });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 10b. POST /api/orchestration/tasks/:id/user-input - Provide user input for tasks in NEEDS_USER_INPUT
  const userInputMatch = pathname.match(/^\/api\/orchestration\/tasks\/([a-zA-Z0-9_-]+)\/user-input$/);
  if (method === 'POST' && userInputMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const taskId = userInputMatch[1];
      const body = await readJson(req, 8_000_000);
      const task = await orchestrator.provideUserInput(taskId, {
        input: body?.input || body?.clarification,
        user: body?.user || 'user',
      });
      json(res, 200, { ok: true, task });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 11. GET /api/orchestration/capabilities - List standard capabilities
  if (method === 'GET' && pathname === '/api/orchestration/capabilities') {
    json(res, 200, {
      ok: true,
      task_types: Array.from(TASK_TYPES),
      capabilities: [
        'code_generation',
        'code_analysis',
        'refactoring',
        'testing',
        'git_review',
        'web_search',
        'documentation_lookup',
        'information_retrieval',
        'file_read',
        'file_write',
        'file_delete',
        'markdown_rendering',
        'video_qa',
        'media_transcode',
        'data_analysis',
        'data_transformation',
        'browser_automation',
        'api_access',
        'process_exec',
      ],
    });
    return true;
  }

  // 12. GET /api/orchestration/agents - List supported agents
  if (method === 'GET' && pathname === '/api/orchestration/agents') {
    json(res, 200, { ok: true, agents: SUPPORTED_AGENTS });
    return true;
  }

  return false;
}
