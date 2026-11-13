/**
 * REST API Endpoints for Autonomous Operations Platform (Phase 4).
 * Mounted under /api/autonomous/*
 * Handles autonomy level toggles, approval workflow, emergency stop,
 * budget management, and operational consoles.
 */

import {
  isValidAutonomyLevel,
  AUTONOMY_LEVELS,
} from './contracts.mjs';

export async function handleAutonomousRoutes(req, res, {
  url,
  policyEngine,
  budgetManager,
  autonomousScheduler = null,
  emergencyStop = null,
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

  if (!pathname.startsWith('/api/autonomous')) {
    return false;
  }

  // 1. Loopback and authorization guard
  if (!authorized(req, url) || !isLoopback(req)) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return true;
  }

  // 2. GET /api/autonomous/status - Overall system operational status
  if (method === 'GET' && pathname === '/api/autonomous/status') {
    const autonomyLevel = policyEngine ? policyEngine.getAutonomyLevel() : AUTONOMY_LEVELS.supervised;
    const executionState = autonomousScheduler ? autonomousScheduler.getExecutionState() : 'idle';
    const policy = policyEngine ? policyEngine.getPolicy() : null;
    const emergencyState = emergencyStop ? emergencyStop.getStatus() : { halted: false, state: 'idle' };
    const budgetSummary = budgetManager ? budgetManager.getBudgetSummary() : null;
    const pendingApprovals = policyEngine ? policyEngine.listApprovals({ status: 'pending' }) : [];
    const interventions = autonomousScheduler ? autonomousScheduler.getInterventions(10) : [];

    json(res, 200, {
      ok: true,
      timestamp: Date.now(),
      autonomyLevel,
      executionState,
      emergencyStop: emergencyState,
      budget: budgetSummary,
      pendingApprovalsCount: pendingApprovals.length,
      pendingApprovals,
      interventionsCount: interventions.length,
      recentInterventions: interventions,
      policy,
    });
    return true;
  }

  // 3. POST /api/autonomous/set-level - Set autonomy level
  if (method === 'POST' && pathname === '/api/autonomous/set-level') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const body = await readJson(req, 1_000_000);
      const level = body?.level;
      if (!level || !isValidAutonomyLevel(level)) {
        json(res, 400, {
          ok: false,
          error: `Invalid autonomy level "${level}". Supported: ${Object.values(AUTONOMY_LEVELS).join(', ')}`,
        });
        return true;
      }

      const result = policyEngine.setAutonomyLevel(level, body?.changedBy || 'operator');
      json(res, 200, { ok: true, autonomyLevel: level, result });
      return true;
    } catch (err) {
      json(res, 500, { ok: false, error: err.message });
      return true;
    }
  }

  // 4. GET /api/autonomous/approvals - List approvals
  if (method === 'GET' && pathname === '/api/autonomous/approvals') {
    const status = url.searchParams.get('status');
    const taskId = url.searchParams.get('taskId') || url.searchParams.get('task_id');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);

    const approvals = policyEngine ? policyEngine.listApprovals({ status, taskId, limit }) : [];
    json(res, 200, { ok: true, count: approvals.length, approvals });
    return true;
  }

  // 5. POST /api/autonomous/approvals/:id/resolve - Approve or reject
  const approvalMatch = pathname.match(/^\/api\/autonomous\/approvals\/([a-zA-Z0-9_-]+)\/resolve$/);
  if (method === 'POST' && approvalMatch) {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const approvalId = approvalMatch[1];
      const body = await readJson(req, 1_000_000);
      const action = body?.action;
      const reason = body?.reason || '';
      const resolvedBy = body?.resolvedBy || 'operator';

      const resolved = policyEngine.resolveApproval(approvalId, { action, reason, resolvedBy });

      // If approved and was an assisted task step or scheduler was waiting, resume
      if (action === 'approve' && autonomousScheduler && resolved.taskId) {
        try {
          autonomousScheduler.resumeExecution(resolved.taskId);
        } catch {
          // preserve flow
        }
      }

      json(res, 200, { ok: true, approval: resolved });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 6. POST /api/autonomous/emergency-stop - Trigger emergency stop
  if (method === 'POST' && pathname === '/api/autonomous/emergency-stop') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const body = await readJson(req, 1_000_000);
      const reason = body?.reason || 'Operator triggered emergency stop';
      const authorizedBy = body?.authorizedBy || 'operator';

      let result = null;
      if (emergencyStop && typeof emergencyStop.triggerEmergencyStop === 'function') {
        result = await emergencyStop.triggerEmergencyStop({ reason, authorizedBy });
      }

      if (autonomousScheduler && typeof autonomousScheduler.setTaskExecutionState === 'function') {
        autonomousScheduler.setTaskExecutionState('default', 'halted', reason);
      }

      json(res, 200, { ok: true, emergencyStop: result || { state: 'halted', reason } });
      return true;
    } catch (err) {
      json(res, 500, { ok: false, error: err.message });
      return true;
    }
  }

  // 7. POST /api/autonomous/emergency-stop/reset - Reset emergency stop
  if (method === 'POST' && pathname === '/api/autonomous/emergency-stop/reset') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const body = await readJson(req, 1_000_000);
      const authorizedBy = body?.authorizedBy || 'operator';
      const resumeReason = body?.reason || body?.resumeReason || 'Operator cleared emergency stop';

      let result = null;
      if (emergencyStop && typeof emergencyStop.resumeEmergencyStop === 'function') {
        result = emergencyStop.resumeEmergencyStop({ authorizedBy, reason: resumeReason });
      }

      if (autonomousScheduler && typeof autonomousScheduler.setTaskExecutionState === 'function') {
        autonomousScheduler.setTaskExecutionState('default', 'idle', 'Emergency stop cleared');
      }

      json(res, 200, { ok: true, emergencyStop: result || { state: 'idle' } });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 8. GET /api/autonomous/budget - Get budget status and remaining quotas
  if (method === 'GET' && pathname === '/api/autonomous/budget') {
    const summary = budgetManager ? budgetManager.getBudgetSummary() : null;
    json(res, 200, { ok: true, budget: summary });
    return true;
  }

  // 9. POST /api/autonomous/budget/update - Update budget limits
  if (method === 'POST' && pathname === '/api/autonomous/budget/update') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const body = await readJson(req, 1_000_000);
      if (!budgetManager) {
        json(res, 500, { ok: false, error: 'Budget manager unavailable' });
        return true;
      }
      const updated = budgetManager.updateLimits(body || {}, 'operator');
      json(res, 200, { ok: true, limits: updated });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 10. POST /api/autonomous/plan - Create autonomous execution plan
  if (method === 'POST' && pathname === '/api/autonomous/plan') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const body = await readJson(req, 4_000_000);
      if (!autonomousScheduler) {
        json(res, 500, { ok: false, error: 'Autonomous scheduler unavailable' });
        return true;
      }
      const plan = autonomousScheduler.createAutonomousPlan(body || {});
      json(res, 201, { ok: true, plan });
      return true;
    } catch (err) {
      json(res, 400, { ok: false, error: err.message });
      return true;
    }
  }

  // 11. POST /api/autonomous/start - Start autonomous task execution
  if (method === 'POST' && pathname === '/api/autonomous/start') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const body = await readJson(req, 1_000_000);
      const masterTaskId = body?.masterTaskId || body?.taskId;
      if (!masterTaskId) {
        json(res, 400, { ok: false, error: 'masterTaskId is required' });
        return true;
      }
      const startRes = await autonomousScheduler.startAutonomousExecution(masterTaskId);
      json(res, 200, { ok: true, result: startRes });
      return true;
    } catch (err) {
      json(res, 500, { ok: false, error: err.message });
      return true;
    }
  }

  // 12. POST /api/autonomous/pause - Pause execution
  if (method === 'POST' && pathname === '/api/autonomous/pause') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const body = await readJson(req, 1_000_000);
      const masterTaskId = body?.masterTaskId || 'default';
      const reason = body?.reason || 'Operator paused';
      const pauseRes = autonomousScheduler.pauseExecution(masterTaskId, reason);
      json(res, 200, { ok: true, result: pauseRes });
      return true;
    } catch (err) {
      json(res, 500, { ok: false, error: err.message });
      return true;
    }
  }

  // 13. POST /api/autonomous/resume - Resume execution
  if (method === 'POST' && pathname === '/api/autonomous/resume') {
    if (!sameOriginOf(req)) {
      json(res, 403, { ok: false, error: 'forbidden_origin' });
      return true;
    }
    try {
      const body = await readJson(req, 1_000_000);
      const masterTaskId = body?.masterTaskId || 'default';
      const resumeRes = await autonomousScheduler.resumeExecution(masterTaskId);
      json(res, 200, { ok: true, result: resumeRes });
      return true;
    } catch (err) {
      json(res, 500, { ok: false, error: err.message });
      return true;
    }
  }

  // 14. GET /api/autonomous/remediations - Remediation history
  if (method === 'GET' && pathname === '/api/autonomous/remediations') {
    const taskId = url.searchParams.get('taskId');
    const remediations = autonomousScheduler ? autonomousScheduler.getRemediationHistory(taskId) : [];
    json(res, 200, { ok: true, count: remediations.length, remediations });
    return true;
  }

  // 15. GET /api/autonomous/audit - Audit trail
  if (method === 'GET' && pathname === '/api/autonomous/audit') {
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const audit = policyEngine ? policyEngine.getAuditTrail(limit) : [];
    json(res, 200, { ok: true, count: audit.length, audit });
    return true;
  }

  return false;
}
