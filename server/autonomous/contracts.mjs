/**
 * Autonomous Operations Contracts & Schemas (Phase 4).
 * Central source of truth for Autonomy Levels, State Machines, Policy Types,
 * Approvals, Budget Limits, Self-Healing Remediation, and Emergency Stop.
 */

// ============================================================================
// 1. AUTONOMY LEVELS & METADATA
// ============================================================================

export const AUTONOMY_LEVELS = {
  readonly: 'readonly',
  assisted: 'assisted',
  supervised: 'supervised',
  autonomous: 'autonomous',
};

export const AUTONOMY_LEVEL_ORDER = [
  AUTONOMY_LEVELS.readonly,
  AUTONOMY_LEVELS.assisted,
  AUTONOMY_LEVELS.supervised,
  AUTONOMY_LEVELS.autonomous,
];

export const AUTONOMY_LEVEL_DEFINITIONS = {
  [AUTONOMY_LEVELS.readonly]: {
    id: AUTONOMY_LEVELS.readonly,
    displayName: 'Read-Only',
    description: 'Agents may only inspect, search, and analyze. No writes, code edits, or modifying commands.',
    riskTier: 'none',
    allowExecution: true,
    autoApproveWrites: false,
    autoApproveCommands: false,
    autoApproveRemediation: false,
    requiresApprovalFor: [
      'write',
      'edit',
      'delete',
      'destructive_command',
      'shell_command',
      'git_commit',
      'deploy',
      'self_healing_write',
    ],
    badgeColor: 'blue',
    uiBadge: 'badge-info',
  },
  [AUTONOMY_LEVELS.assisted]: {
    id: AUTONOMY_LEVELS.assisted,
    displayName: 'Assisted (Step-by-Step)',
    description: 'Agents formulate plans and propose edits, but every write, tool execution, and code change requires explicit human approval before execution.',
    riskTier: 'low',
    allowExecution: true,
    autoApproveWrites: false,
    autoApproveCommands: false,
    autoApproveRemediation: false,
    requiresApprovalFor: [
      'write',
      'edit',
      'delete',
      'shell_command',
      'tool_execution',
      'git_commit',
      'self_healing_remediation',
    ],
    badgeColor: 'amber',
    uiBadge: 'badge-warning',
  },
  [AUTONOMY_LEVELS.supervised]: {
    id: AUTONOMY_LEVELS.supervised,
    displayName: 'Supervised (Safe Auto)',
    description: 'Agents execute safe operations, bounded workspace edits, and test suites autonomously. Destructive operations, permission escalations, external pushes, and critical actions require approval.',
    riskTier: 'medium',
    allowExecution: true,
    autoApproveWrites: true,
    autoApproveCommands: true, // within non-destructive whitelists
    autoApproveRemediation: true, // safe retries and test runs
    requiresApprovalFor: [
      'destructive_command',
      'permission_escalation',
      'git_push',
      'external_api',
      'out_of_bounds',
      'critical_security_override',
    ],
    badgeColor: 'indigo',
    uiBadge: 'badge-primary',
  },
  [AUTONOMY_LEVELS.autonomous]: {
    id: AUTONOMY_LEVELS.autonomous,
    displayName: 'Autonomous (Self-Driving)',
    description: 'Full autonomous execution with automated plan decomposition, failure detection, and self-healing loops, constrained strictly by budget limits, quality gates, and security invariants.',
    riskTier: 'high',
    allowExecution: true,
    autoApproveWrites: true,
    autoApproveCommands: true,
    autoApproveRemediation: true,
    requiresApprovalFor: [
      'critical_security_override',
      'budget_increase',
      'emergency_override',
      'permission_escalation',
    ],
    badgeColor: 'emerald',
    uiBadge: 'badge-success',
  },
};

// ============================================================================
// 2. POLICY TYPES & ENUMS
// ============================================================================

export const POLICY_TYPES = {
  AUTONOMY_LEVEL: 'autonomy_level',
  BUDGET_LIMIT: 'budget_limit',
  CONCURRENCY_LIMIT: 'concurrency_limit',
  HUMAN_APPROVAL_GATE: 'human_approval_gate',
  SELF_HEALING: 'self_healing',
  FILE_BOUNDARY: 'file_boundary',
  QUALITY_GATE_ENFORCEMENT: 'quality_gate_enforcement',
  SECURITY_INVARIANT: 'security_invariant',
};

export const APPROVAL_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  SUPERSEDED: 'superseded',
};

export const APPROVAL_ACTION_TYPES = {
  CODE_EDIT: 'code_edit',
  COMMAND_EXEC: 'command_exec',
  TOOL_INVOKE: 'tool_invoke',
  PERMISSION_GRANT: 'permission_grant',
  BUDGET_OVERRIDE: 'budget_override',
  QUALITY_GATE_OVERRIDE: 'quality_gate_override',
  SELF_HEALING_REMEDIATION: 'self_healing_remediation',
  DESTRUCTIVE_OPERATION: 'destructive_operation',
  OUT_OF_BOUNDS_ACCESS: 'out_of_bounds_access',
};

export const INTERVENTION_REASONS = {
  BUDGET_EXHAUSTED: 'budget_exhausted',
  EXECUTION_LOOP_DETECTED: 'execution_loop_detected',
  CONCURRENCY_LIMIT_REACHED: 'concurrency_limit_reached',
  SECURITY_POLICY_VIOLATION: 'security_policy_violation',
  MANDATORY_QUALITY_GATE_FAILED: 'mandatory_quality_gate_failed',
  OUT_OF_BOUNDS_FILE_ACCESS: 'out_of_bounds_file_access',
  DESTRUCTIVE_ACTION_DETECTED: 'destructive_action_detected',
  EMERGENCY_STOP_TRIGGERED: 'emergency_stop_triggered',
  MAX_REMEDIATION_EXCEEDED: 'max_remediation_exceeded',
  MANUAL_OPERATOR_PAUSE: 'manual_operator_pause',
  ASSISTED_STEP_APPROVAL_REQUIRED: 'assisted_step_approval_required',
};

export const EMERGENCY_STOP_STATES = {
  IDLE: 'idle',
  TRIPPING: 'tripping',
  CANCELLING: 'cancelling',
  HALTED: 'halted',
  RECOVERING: 'recovering',
};

// ============================================================================
// 3. SELF-HEALING STRATEGIES & POLICIES
// ============================================================================

export const SELF_HEALING_STRATEGIES = {
  RETRY_WITH_BACKOFF: 'retry_with_backoff',
  SWITCH_PROVIDER: 'switch_provider',
  GIT_WORKTREE_ROLLBACK: 'git_worktree_rollback',
  DIAGNOSTIC_FIX: 'diagnostic_fix',
  ESCALATE_TO_HUMAN: 'escalate_to_human',
};

export const SELF_HEALING_POLICIES = {
  defaultMaxRemediationAttemptsPerSubtask: 3,
  defaultMaxTotalRemediationsPerTask: 8,
  defaultBackoffBaseMs: 1000,
  defaultBackoffMultiplier: 2,
  defaultMaxBackoffMs: 15000,
  allowProviderFallback: true,
  allowGitRollback: true,
  allowedStrategies: [
    SELF_HEALING_STRATEGIES.RETRY_WITH_BACKOFF,
    SELF_HEALING_STRATEGIES.SWITCH_PROVIDER,
    SELF_HEALING_STRATEGIES.GIT_WORKTREE_ROLLBACK,
    SELF_HEALING_STRATEGIES.DIAGNOSTIC_FIX,
    SELF_HEALING_STRATEGIES.ESCALATE_TO_HUMAN,
  ],
};

// ============================================================================
// 4. BUDGET LIMITS DEFAULTS
// ============================================================================

export const BUDGET_LIMIT_DEFAULTS = {
  maxSubtasks: 25,
  maxCostUsd: 10.00,
  maxExecutions: 50,
  maxDurationMinutes: 60,
  maxConcurrentSubtasks: 3,
  maxTokens: 500000,
};

// ============================================================================
// 5. STATE MACHINE TRANSITION MATRICES
// ============================================================================

/**
 * Autonomy Execution State Machine.
 * Tracks lifecycle of an autonomous master orchestration job.
 */
export const EXECUTION_STATES = {
  IDLE: 'idle',
  PLANNING: 'planning',
  POLICY_EVALUATING: 'policy_evaluating',
  AWAITING_APPROVAL: 'awaiting_approval',
  DISPATCHING: 'dispatching',
  RUNNING: 'running',
  SELF_HEALING: 'self_healing',
  PAUSED: 'paused',
  HALTED: 'halted',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const EXECUTION_TRANSITIONS = {
  [EXECUTION_STATES.IDLE]: [EXECUTION_STATES.PLANNING, EXECUTION_STATES.HALTED],
  [EXECUTION_STATES.PLANNING]: [
    EXECUTION_STATES.POLICY_EVALUATING,
    EXECUTION_STATES.AWAITING_APPROVAL,
    EXECUTION_STATES.FAILED,
    EXECUTION_STATES.HALTED,
  ],
  [EXECUTION_STATES.POLICY_EVALUATING]: [
    EXECUTION_STATES.AWAITING_APPROVAL,
    EXECUTION_STATES.DISPATCHING,
    EXECUTION_STATES.PAUSED,
    EXECUTION_STATES.FAILED,
    EXECUTION_STATES.HALTED,
  ],
  [EXECUTION_STATES.AWAITING_APPROVAL]: [
    EXECUTION_STATES.DISPATCHING,
    EXECUTION_STATES.PAUSED,
    EXECUTION_STATES.FAILED,
    EXECUTION_STATES.HALTED,
  ],
  [EXECUTION_STATES.DISPATCHING]: [
    EXECUTION_STATES.RUNNING,
    EXECUTION_STATES.FAILED,
    EXECUTION_STATES.HALTED,
  ],
  [EXECUTION_STATES.RUNNING]: [
    EXECUTION_STATES.SELF_HEALING,
    EXECUTION_STATES.POLICY_EVALUATING,
    EXECUTION_STATES.AWAITING_APPROVAL,
    EXECUTION_STATES.COMPLETED,
    EXECUTION_STATES.PAUSED,
    EXECUTION_STATES.FAILED,
    EXECUTION_STATES.HALTED,
  ],
  [EXECUTION_STATES.SELF_HEALING]: [
    EXECUTION_STATES.DISPATCHING,
    EXECUTION_STATES.AWAITING_APPROVAL,
    EXECUTION_STATES.FAILED,
    EXECUTION_STATES.HALTED,
  ],
  [EXECUTION_STATES.PAUSED]: [
    EXECUTION_STATES.PLANNING,
    EXECUTION_STATES.POLICY_EVALUATING,
    EXECUTION_STATES.DISPATCHING,
    EXECUTION_STATES.RUNNING,
    EXECUTION_STATES.HALTED,
  ],
  [EXECUTION_STATES.HALTED]: [
    EXECUTION_STATES.IDLE, // after operator resets emergency stop
  ],
  [EXECUTION_STATES.COMPLETED]: [],
  [EXECUTION_STATES.FAILED]: [
    EXECUTION_STATES.IDLE, // retry from idle
  ],
};

/**
 * Emergency Stop State Machine Transitions.
 */
export const EMERGENCY_STOP_TRANSITIONS = {
  [EMERGENCY_STOP_STATES.IDLE]: [EMERGENCY_STOP_STATES.TRIPPING],
  [EMERGENCY_STOP_STATES.TRIPPING]: [EMERGENCY_STOP_STATES.CANCELLING, EMERGENCY_STOP_STATES.HALTED],
  [EMERGENCY_STOP_STATES.CANCELLING]: [EMERGENCY_STOP_STATES.HALTED],
  [EMERGENCY_STOP_STATES.HALTED]: [EMERGENCY_STOP_STATES.RECOVERING],
  [EMERGENCY_STOP_STATES.RECOVERING]: [EMERGENCY_STOP_STATES.IDLE, EMERGENCY_STOP_STATES.HALTED],
};

/**
 * Approval State Transitions.
 */
export const APPROVAL_TRANSITIONS = {
  [APPROVAL_STATUSES.PENDING]: [
    APPROVAL_STATUSES.APPROVED,
    APPROVAL_STATUSES.REJECTED,
    APPROVAL_STATUSES.EXPIRED,
    APPROVAL_STATUSES.CANCELLED,
    APPROVAL_STATUSES.SUPERSEDED,
  ],
  [APPROVAL_STATUSES.APPROVED]: [],
  [APPROVAL_STATUSES.REJECTED]: [],
  [APPROVAL_STATUSES.EXPIRED]: [],
  [APPROVAL_STATUSES.CANCELLED]: [],
  [APPROVAL_STATUSES.SUPERSEDED]: [],
};

// ============================================================================
// 6. VALIDATION & UTILITY FUNCTIONS
// ============================================================================

/**
 * Validates if a string is a recognized autonomy level.
 * @param {string} level
 * @returns {boolean}
 */
export function isValidAutonomyLevel(level) {
  return typeof level === 'string' && Object.values(AUTONOMY_LEVELS).includes(level);
}

/**
 * Validates autonomy level with detailed error throw if invalid.
 * @param {string} level
 * @throws {Error}
 */
export function validateAutonomyLevel(level) {
  if (!isValidAutonomyLevel(level)) {
    throw new Error(`Invalid autonomy level: "${level}". Supported: ${Object.values(AUTONOMY_LEVELS).join(', ')}`);
  }
  return true;
}

/**
 * Validates an approval status.
 * @param {string} status
 * @returns {boolean}
 */
export function isValidApprovalStatus(status) {
  return typeof status === 'string' && Object.values(APPROVAL_STATUSES).includes(status);
}

/**
 * Checks if a transition between execution states is permitted.
 * @param {string} currentState
 * @param {string} nextState
 * @returns {boolean}
 */
export function canTransitionExecution(currentState, nextState) {
  const allowed = EXECUTION_TRANSITIONS[currentState] || [];
  return allowed.includes(nextState);
}

/**
 * Checks if a transition in emergency stop state is permitted.
 * @param {string} currentState
 * @param {string} nextState
 * @returns {boolean}
 */
export function canTransitionEmergencyStop(currentState, nextState) {
  const allowed = EMERGENCY_STOP_TRANSITIONS[currentState] || [];
  return allowed.includes(nextState);
}

/**
 * Checks whether an action requires approval at a given autonomy level.
 * @param {string} autonomyLevel
 * @param {string} actionType
 * @param {Object} [context={}]
 * @returns {boolean}
 */
export function actionRequiresApproval(autonomyLevel, actionType, context = {}) {
  validateAutonomyLevel(autonomyLevel);
  const def = AUTONOMY_LEVEL_DEFINITIONS[autonomyLevel];
  if (!def) return true;

  // Read-only requires approval for ANY state-modifying action
  if (autonomyLevel === AUTONOMY_LEVELS.readonly) {
    if (context.isReadOnly === true) return false;
    return true;
  }

  // Assisted requires approval for every actionable step
  if (autonomyLevel === AUTONOMY_LEVELS.assisted) {
    if (context.isReadOnly === true) return false;
    return true;
  }

  // Supervised allows safe edits & non-destructive tasks, but guards critical actions
  if (autonomyLevel === AUTONOMY_LEVELS.supervised) {
    if (context.isDestructive || context.isOutOfBounds || context.isPermissionEscalation) {
      return true;
    }
    return def.requiresApprovalFor.includes(actionType);
  }

  // Autonomous auto-approves routine actions, guarded by security invariants and budget
  if (autonomyLevel === AUTONOMY_LEVELS.autonomous) {
    if (context.isPermissionEscalation || context.isSecurityOverride || context.isBudgetIncrease) {
      return true;
    }
    return def.requiresApprovalFor.includes(actionType);
  }

  return true;
}

/**
 * Validates budget configuration object.
 * @param {Object} budget
 * @returns {boolean}
 */
export function validateBudgetConfig(budget) {
  if (!budget || typeof budget !== 'object') {
    throw new Error('Budget configuration must be an object.');
  }
  const numericFields = ['maxSubtasks', 'maxCostUsd', 'maxExecutions', 'maxDurationMinutes', 'maxConcurrentSubtasks'];
  for (const field of numericFields) {
    if (field in budget) {
      if (typeof budget[field] !== 'number' || isNaN(budget[field]) || budget[field] < 0) {
        throw new Error(`Budget field "${field}" must be a non-negative number.`);
      }
    }
  }
  return true;
}

/**
 * Validates an approval request payload.
 * @param {Object} req
 * @returns {boolean}
 */
export function validateApprovalRequest(req) {
  if (!req || typeof req !== 'object') {
    throw new Error('Approval request must be an object.');
  }
  if (!req.approvalId || typeof req.approvalId !== 'string') {
    throw new Error('Approval request missing approvalId.');
  }
  if (!req.actionType || !Object.values(APPROVAL_ACTION_TYPES).includes(req.actionType)) {
    throw new Error(`Invalid or missing actionType: "${req.actionType}".`);
  }
  if (req.status && !isValidApprovalStatus(req.status)) {
    throw new Error(`Invalid approval status: "${req.status}".`);
  }
  return true;
}

// ============================================================================
// 7. FACTORY CONSTRUCTORS
// ============================================================================

/**
 * Creates default Autonomous Policy configuration.
 * @param {Object} [overrides={}]
 * @returns {Object}
 */
export function createDefaultAutonomousPolicy(overrides = {}) {
  return {
    autonomyLevel: AUTONOMY_LEVELS.supervised,
    allowAutoRemediation: true,
    requireHumanApprovalForCritical: true,
    strictQualityGates: true,
    enforceFileBoundaries: true,
    budget: { ...BUDGET_LIMIT_DEFAULTS, ...(overrides.budget || {}) },
    selfHealing: { ...SELF_HEALING_POLICIES, ...(overrides.selfHealing || {}) },
    allowedActionTypes: Object.values(APPROVAL_ACTION_TYPES),
    ...overrides,
  };
}

/**
 * Creates an initial operational state container.
 * @param {Object} [initialPolicy={}]
 * @returns {Object}
 */
export function createInitialAutonomousState(initialPolicy = {}) {
  const policy = createDefaultAutonomousPolicy(initialPolicy);
  return {
    executionState: EXECUTION_STATES.IDLE,
    autonomyLevel: policy.autonomyLevel,
    emergencyStop: {
      state: EMERGENCY_STOP_STATES.IDLE,
      trippedAt: null,
      trippedBy: null,
      reason: null,
      cancellationsPending: 0,
      cancellationsConfirmed: 0,
    },
    policy,
    budgetUsage: {
      subtasksCompleted: 0,
      totalCostUsd: 0.0,
      executionCount: 0,
      durationMinutes: 0.0,
      activeConcurrent: 0,
      tokensUsed: 0,
    },
    activeInterventions: [],
    pendingApprovals: [],
    remediationHistory: [],
    auditTrail: [],
  };
}

/**
 * Creates a structured Approval Request object.
 * @param {Object} params
 * @returns {Object}
 */
export function createApprovalRequest({
  approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  taskId,
  subtaskId = null,
  actionType,
  title,
  description,
  payload = {},
  autonomyLevel = AUTONOMY_LEVELS.supervised,
  riskTier = 'medium',
  requestedBy = 'system',
  expiresAt = Date.now() + 1000 * 60 * 30, // 30 minutes default
}) {
  const req = {
    approvalId,
    taskId,
    subtaskId,
    actionType,
    title: title || `Approval Required for ${actionType}`,
    description: description || '',
    payload,
    autonomyLevel,
    riskTier,
    requestedBy,
    status: APPROVAL_STATUSES.PENDING,
    createdAt: Date.now(),
    expiresAt,
    resolvedAt: null,
    resolvedBy: null,
    resolutionReason: null,
  };
  validateApprovalRequest(req);
  return req;
}
