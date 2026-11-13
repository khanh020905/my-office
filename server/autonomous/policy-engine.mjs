/**
 * Autonomous Policy Engine (Phase 4).
 * Enforces autonomy levels (readonly, assisted, supervised, autonomous),
 * manages human approval gates, evaluates actions against security invariants and budget limits,
 * and maintains an immutable audit trail.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  AUTONOMY_LEVELS,
  AUTONOMY_LEVEL_DEFINITIONS,
  APPROVAL_STATUSES,
  APPROVAL_ACTION_TYPES,
  INTERVENTION_REASONS,
  validateAutonomyLevel,
  actionRequiresApproval,
  createDefaultAutonomousPolicy,
  createApprovalRequest,
  validateApprovalRequest,
} from './contracts.mjs';

export function createPolicyEngine({
  storePath = null,
  budgetManager = null,
  securityGuard = null,
  emergencyStop = null,
  initialPolicy = {},
  now = Date.now,
} = {}) {
  const defaultStorePath = storePath || path.resolve(process.cwd(), 'data', 'autonomous', 'policy-state.json');

  let policy = createDefaultAutonomousPolicy(initialPolicy);
  const approvals = new Map(); // approvalId -> ApprovalRequest
  const auditTrail = [];

  function load() {
    if (!fs.existsSync(defaultStorePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(defaultStorePath, 'utf8'));
      if (data && typeof data === 'object') {
        if (data.policy && typeof data.policy === 'object') {
          policy = { ...policy, ...data.policy };
        }
        if (Array.isArray(data.approvals)) {
          for (const app of data.approvals) {
            approvals.set(app.approvalId, app);
          }
        }
        if (Array.isArray(data.auditTrail)) {
          auditTrail.push(...data.auditTrail);
        }
      }
    } catch {
      // In-memory fallback
    }
  }

  function persist() {
    try {
      fs.mkdirSync(path.dirname(defaultStorePath), { recursive: true });
      const tmp = `${defaultStorePath}.tmp-${process.pid}-${now()}`;
      const payload = {
        version: '1.0.0',
        savedAt: now(),
        policy,
        approvals: Array.from(approvals.values()).slice(-200),
        auditTrail: auditTrail.slice(-300),
      };
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, defaultStorePath);
    } catch {
      // In-memory fallback
    }
  }

  load();

  function addAuditLog({ type, details = {}, actor = 'system' }) {
    const entry = {
      id: `audit_${now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: now(),
      type,
      actor,
      autonomyLevel: policy.autonomyLevel,
      details,
    };
    auditTrail.push(entry);
    if (auditTrail.length > 500) {
      auditTrail.splice(0, auditTrail.length - 500);
    }
    persist();
    return entry;
  }

  /**
   * Retrieves the current autonomy level.
   */
  function getAutonomyLevel() {
    return policy.autonomyLevel;
  }

  /**
   * Sets the operational autonomy level with validation and audit logging.
   */
  function setAutonomyLevel(level, changedBy = 'operator') {
    validateAutonomyLevel(level);
    const prev = policy.autonomyLevel;
    if (prev === level) {
      return { ok: true, autonomyLevel: level, unchanged: true };
    }

    policy.autonomyLevel = level;
    addAuditLog({
      type: 'autonomy_level_changed',
      actor: changedBy,
      details: { previousLevel: prev, newLevel: level },
    });
    persist();

    return {
      ok: true,
      previousLevel: prev,
      autonomyLevel: level,
      definition: AUTONOMY_LEVEL_DEFINITIONS[level],
    };
  }

  /**
   * Retrieves the full active policy configuration.
   */
  function getPolicy() {
    return {
      ...policy,
      budget: budgetManager ? budgetManager.getLimits() : policy.budget,
    };
  }

  /**
   * Updates policy configuration parameters.
   */
  function updatePolicy(updates = {}, actor = 'operator') {
    if (updates.autonomyLevel) {
      validateAutonomyLevel(updates.autonomyLevel);
    }
    if (updates.budget && budgetManager) {
      budgetManager.updateLimits(updates.budget, actor);
    }

    policy = {
      ...policy,
      ...updates,
      budget: budgetManager ? budgetManager.getLimits() : { ...policy.budget, ...(updates.budget || {}) },
    };

    addAuditLog({
      type: 'policy_updated',
      actor,
      details: { updates },
    });
    persist();

    return getPolicy();
  }

  /**
   * Creates and registers a new human approval request.
   */
  function createApproval({
    taskId,
    subtaskId = null,
    actionType,
    title,
    description,
    payload = {},
    riskTier = 'medium',
    requestedBy = 'system',
    expiresAt = null,
  }) {
    const req = createApprovalRequest({
      taskId,
      subtaskId,
      actionType,
      title,
      description,
      payload,
      autonomyLevel: policy.autonomyLevel,
      riskTier,
      requestedBy,
      expiresAt: expiresAt || (now() + 1000 * 60 * 30),
    });

    approvals.set(req.approvalId, req);
    addAuditLog({
      type: 'approval_requested',
      actor: requestedBy,
      details: { approvalId: req.approvalId, actionType, taskId, subtaskId, riskTier },
    });
    persist();
    return req;
  }

  /**
   * Retrieves a single approval request by ID.
   */
  function getApproval(approvalId) {
    expireStaleApprovals();
    return approvals.get(approvalId) || null;
  }

  /**
   * Lists approval requests with optional status and task filtering.
   */
  function listApprovals({ status = null, taskId = null, limit = 50 } = {}) {
    expireStaleApprovals();
    let list = Array.from(approvals.values());

    if (status) {
      list = list.filter((a) => a.status === status);
    }
    if (taskId) {
      list = list.filter((a) => a.taskId === taskId);
    }

    list.sort((a, b) => b.createdAt - a.createdAt);
    return list.slice(0, Math.max(1, limit));
  }

  /**
   * Resolves an approval request with operator action ('approve' or 'reject').
   */
  function resolveApproval(approvalId, {
    action,
    reason = '',
    resolvedBy = 'operator',
  } = {}) {
    expireStaleApprovals();
    const req = approvals.get(approvalId);
    if (!req) {
      throw new Error(`Approval request not found: "${approvalId}"`);
    }

    if (req.status !== APPROVAL_STATUSES.PENDING) {
      throw new Error(`Approval request "${approvalId}" is already resolved (status: ${req.status})`);
    }

    const normalizedAction = String(action || '').toLowerCase().trim();
    if (normalizedAction !== 'approve' && normalizedAction !== 'reject') {
      throw new Error(`Invalid resolution action "${action}". Must be 'approve' or 'reject'.`);
    }

    req.status = normalizedAction === 'approve' ? APPROVAL_STATUSES.APPROVED : APPROVAL_STATUSES.REJECTED;
    req.resolvedAt = now();
    req.resolvedBy = resolvedBy;
    req.resolutionReason = reason || (normalizedAction === 'approve' ? 'Approved by operator' : 'Rejected by operator');

    addAuditLog({
      type: `approval_${normalizedAction}d`,
      actor: resolvedBy,
      details: { approvalId, status: req.status, reason: req.resolutionReason },
    });

    persist();
    return req;
  }

  /**
   * Cancels all pending approval requests for a specific task.
   */
  function cancelApprovalsForTask(taskId, reason = 'Task terminated') {
    let cancelledCount = 0;
    for (const req of approvals.values()) {
      if (req.taskId === taskId && req.status === APPROVAL_STATUSES.PENDING) {
        req.status = APPROVAL_STATUSES.CANCELLED;
        req.resolvedAt = now();
        req.resolutionReason = reason;
        cancelledCount++;
      }
    }
    if (cancelledCount > 0) {
      persist();
    }
    return cancelledCount;
  }

  /**
   * Automatically expires pending approvals that have exceeded their expiresAt timestamp.
   */
  function expireStaleApprovals() {
    const currentTime = now();
    let updated = false;
    for (const req of approvals.values()) {
      if (req.status === APPROVAL_STATUSES.PENDING && req.expiresAt && currentTime > req.expiresAt) {
        req.status = APPROVAL_STATUSES.EXPIRED;
        req.resolvedAt = currentTime;
        req.resolutionReason = 'Approval expired after timeout.';
        updated = true;
      }
    }
    if (updated) {
      persist();
    }
  }

  /**
   * Evaluates an intended action against Emergency Stop, Security Invariants, Budget,
   * and Autonomy Level requirements.
   */
  function evaluateAction({
    actionType,
    taskId = 'system_task',
    subtaskId = null,
    context = {},
    requestedBy = 'system',
    title = '',
    description = '',
    payload = {},
  }) {
    expireStaleApprovals();

    // 1. Check Emergency Stop
    if (emergencyStop) {
      const isHalted = typeof emergencyStop.isHalted === 'function' ? emergencyStop.isHalted() : false;
      if (isHalted) {
        addAuditLog({
          type: 'action_blocked_emergency_stop',
          actor: requestedBy,
          details: { actionType, taskId, subtaskId },
        });
        return {
          allowed: false,
          requiresApproval: false,
          blockedBy: 'emergency_stop',
          reason: INTERVENTION_REASONS.EMERGENCY_STOP_TRIGGERED,
          message: 'Action blocked: Emergency Stop is currently active.',
        };
      }
    }

    // 2. Check Security Guard Invariants
    if (securityGuard && typeof securityGuard.evaluateOperation === 'function') {
      const secEval = securityGuard.evaluateOperation({
        agentId: requestedBy,
        autonomyLevel: policy.autonomyLevel,
        operationType: actionType,
        targetPath: payload?.filePath || context?.filePath || null,
        command: payload?.command || context?.command || null,
        context,
        isHumanAuth: context?.isHumanAuthorized === true,
      });

      if (!secEval.allowed) {
        if (secEval.requiresApproval) {
          const appr = createApproval({
            taskId,
            subtaskId,
            actionType,
            title: title || `Security Approval: ${actionType}`,
            description: description || secEval.reason,
            payload: { ...payload, securityEvaluation: secEval },
            riskTier: secEval.riskTier || 'high',
            requestedBy,
          });
          return {
            allowed: false,
            requiresApproval: true,
            approvalRequest: appr,
            blockedBy: 'security_guard',
            reason: INTERVENTION_REASONS.SECURITY_POLICY_VIOLATION,
            message: secEval.reason,
          };
        }

        addAuditLog({
          type: 'action_blocked_security_guard',
          actor: requestedBy,
          details: { actionType, taskId, subtaskId, reason: secEval.reason },
        });
        return {
          allowed: false,
          requiresApproval: false,
          blockedBy: 'security_guard',
          reason: INTERVENTION_REASONS.SECURITY_POLICY_VIOLATION,
          message: secEval.reason,
        };
      }
    }

    // 3. Check Budget & Resource Quotas
    if (budgetManager) {
      const budgetCheck = budgetManager.checkBudget({
        subtasks: context?.projectedSubtasks || 0,
        costUsd: context?.projectedCostUsd || 0,
        executions: context?.projectedExecutions || 1,
        durationMinutes: context?.projectedDurationMinutes || 0,
        tokens: context?.projectedTokens || 0,
        concurrency: context?.projectedConcurrency || 0,
      });

      if (!budgetCheck.allowed) {
        const isConcurrency = budgetCheck.reasons.some((r) => r.includes('Concurrency'));
        const interventionReason = isConcurrency
          ? INTERVENTION_REASONS.CONCURRENCY_LIMIT_REACHED
          : INTERVENTION_REASONS.BUDGET_EXHAUSTED;

        addAuditLog({
          type: 'action_blocked_budget',
          actor: requestedBy,
          details: { actionType, taskId, subtaskId, reasons: budgetCheck.reasons },
        });

        return {
          allowed: false,
          requiresApproval: false,
          blockedBy: 'budget',
          reason: interventionReason,
          reasons: budgetCheck.reasons,
          message: budgetCheck.reasons.join('; '),
        };
      }
    }

    // 4. Check Autonomy Level Approval Trigger
    const needsApproval = actionRequiresApproval(policy.autonomyLevel, actionType, context);
    if (needsApproval) {
      let riskTier = 'medium';
      if (context.isDestructive) riskTier = 'high';
      if (policy.autonomyLevel === AUTONOMY_LEVELS.readonly) riskTier = 'low';

      const appr = createApproval({
        taskId,
        subtaskId,
        actionType,
        title: title || `Approval Required for ${actionType}`,
        description: description || `Executing ${actionType} requires approval at ${policy.autonomyLevel} level.`,
        payload,
        riskTier,
        requestedBy,
      });

      return {
        allowed: false,
        requiresApproval: true,
        approvalRequest: appr,
        reason: policy.autonomyLevel === AUTONOMY_LEVELS.assisted
          ? INTERVENTION_REASONS.ASSISTED_STEP_APPROVAL_REQUIRED
          : 'Human approval required by policy.',
      };
    }

    // All checks passed
    return {
      allowed: true,
      requiresApproval: false,
      autonomyLevel: policy.autonomyLevel,
    };
  }

  /**
   * Returns a lightweight status snapshot of the policy engine.
   */
  function getStatusSnapshot() {
    expireStaleApprovals();
    const pending = listApprovals({ status: APPROVAL_STATUSES.PENDING });
    return {
      autonomyLevel: policy.autonomyLevel,
      definition: AUTONOMY_LEVEL_DEFINITIONS[policy.autonomyLevel],
      pendingApprovalsCount: pending.length,
      pendingApprovals: pending,
      policy: getPolicy(),
      recentAudit: auditTrail.slice(-10),
    };
  }

  return {
    getAutonomyLevel,
    setAutonomyLevel,
    getPolicy,
    updatePolicy,
    evaluateAction,
    createApproval,
    getApproval,
    listApprovals,
    resolveApproval,
    cancelApprovalsForTask,
    expireStaleApprovals,
    addAuditLog,
    getAuditTrail: (limit = 100) => auditTrail.slice(-limit),
    getStatusSnapshot,
  };
}
