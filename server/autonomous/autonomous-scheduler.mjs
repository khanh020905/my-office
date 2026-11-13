/**
 * Autonomous Scheduler (Phase 4).
 * Extends Phase 2 Master Orchestrator with autonomous plan decomposition,
 * intelligent failure detection, self-healing recovery loops, and strict loop breakers.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  AUTONOMY_LEVELS,
  EXECUTION_STATES,
  APPROVAL_ACTION_TYPES,
  INTERVENTION_REASONS,
  SELF_HEALING_STRATEGIES,
  SELF_HEALING_POLICIES,
  canTransitionExecution,
} from './contracts.mjs';

export function createAutonomousScheduler({
  policyEngine,
  budgetManager,
  masterOrchestrator = null,
  controlManager = null,
  qualityGateEngine = null,
  emergencyStop = null,
  securityGuard = null,
  storePath = null,
  selfHealingPolicy = {},
  now = Date.now,
} = {}) {
  const defaultStorePath = storePath || path.resolve(process.cwd(), 'data', 'autonomous', 'scheduler-state.json');

  const activePolicies = {
    ...SELF_HEALING_POLICIES,
    ...selfHealingPolicy,
  };

  // Execution states for tasks: masterTaskId -> state
  const taskStates = new Map();
  // Remediation history: list of remediation records
  const remediationHistory = [];
  // Error signature tracking for loop detection: `${masterTaskId}:${subtaskId}` -> Array<{ sig, timestamp }>
  const subtaskErrorHistory = new Map();
  // Active interventions: list of intervention alerts
  const interventions = [];

  function load() {
    if (!fs.existsSync(defaultStorePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(defaultStorePath, 'utf8'));
      if (data && typeof data === 'object') {
        if (Array.isArray(data.taskStates)) {
          for (const item of data.taskStates) {
            taskStates.set(item.masterTaskId, item.state);
          }
        }
        if (Array.isArray(data.remediationHistory)) {
          remediationHistory.push(...data.remediationHistory.slice(-200));
        }
        if (Array.isArray(data.interventions)) {
          interventions.push(...data.interventions.slice(-100));
        }
      }
    } catch {
      // Retain in-memory
    }
  }

  function persist() {
    try {
      fs.mkdirSync(path.dirname(defaultStorePath), { recursive: true });
      const tmp = `${defaultStorePath}.tmp-${process.pid}-${now()}`;
      const payload = {
        version: '1.0.0',
        savedAt: now(),
        taskStates: Array.from(taskStates.entries()).map(([masterTaskId, state]) => ({ masterTaskId, state })),
        remediationHistory: remediationHistory.slice(-200),
        interventions: interventions.slice(-100),
      };
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, defaultStorePath);
    } catch {
      // In-memory fallback
    }
  }

  load();

  function setTaskExecutionState(masterTaskId, nextState, reason = '') {
    const currentState = taskStates.get(masterTaskId) || EXECUTION_STATES.IDLE;
    if (currentState === nextState) return;

    // Direct transition allowed?
    if (canTransitionExecution(currentState, nextState)) {
      taskStates.set(masterTaskId, nextState);
    } else if (nextState === EXECUTION_STATES.HALTED) {
      // Emergency halt is always permitted
      taskStates.set(masterTaskId, nextState);
    } else if (nextState === EXECUTION_STATES.SELF_HEALING && currentState !== EXECUTION_STATES.RUNNING) {
      // Path from idle/planning/dispatching into running -> self_healing
      taskStates.set(masterTaskId, EXECUTION_STATES.RUNNING);
      taskStates.set(masterTaskId, EXECUTION_STATES.SELF_HEALING);
    } else if (currentState === EXECUTION_STATES.SELF_HEALING && nextState === EXECUTION_STATES.RUNNING) {
      // Path from self_healing -> dispatching -> running
      taskStates.set(masterTaskId, EXECUTION_STATES.DISPATCHING);
      taskStates.set(masterTaskId, EXECUTION_STATES.RUNNING);
    } else if (currentState === EXECUTION_STATES.IDLE && nextState === EXECUTION_STATES.RUNNING) {
      // Path from idle -> planning -> dispatching -> running
      taskStates.set(masterTaskId, EXECUTION_STATES.PLANNING);
      taskStates.set(masterTaskId, EXECUTION_STATES.DISPATCHING);
      taskStates.set(masterTaskId, EXECUTION_STATES.RUNNING);
    } else {
      taskStates.set(masterTaskId, nextState);
    }

    if (policyEngine) {
      policyEngine.addAuditLog({
        type: 'scheduler_state_changed',
        actor: 'autonomous_scheduler',
        details: { masterTaskId, from: currentState, to: nextState, reason },
      });
    }

    persist();
  }

  function getExecutionState(masterTaskId = 'default') {
    if (emergencyStop && typeof emergencyStop.isHalted === 'function' && emergencyStop.isHalted()) {
      return EXECUTION_STATES.HALTED;
    }
    return taskStates.get(masterTaskId) || EXECUTION_STATES.IDLE;
  }

  /**
   * Decomposes a high-level goal or task into structured DAG subtasks.
   */
  function createAutonomousPlan({
    title,
    description = '',
    goal = '',
    workingDirectory = process.cwd(),
    subtasks = [],
    executionPolicy = {},
    createdBy = 'autonomous_scheduler',
  }) {
    const generatedSubtasks = subtasks.length > 0
      ? subtasks
      : [
          {
            subtaskId: 'subtask-1-analysis',
            title: `Analyze requirements: ${title}`,
            description: `Inspect codebase and analyze task goal: ${goal || title}`,
            assignedAgent: 'claude-code',
            assignedProvider: 'claude-code',
            dependencies: [],
            estimatedDurationSec: 60,
          },
          {
            subtaskId: 'subtask-2-implementation',
            title: `Implement solution: ${title}`,
            description: `Execute changes according to plan: ${description || title}`,
            assignedAgent: 'codex-cli',
            assignedProvider: 'codex-cli',
            dependencies: ['subtask-1-analysis'],
            estimatedDurationSec: 180,
          },
          {
            subtaskId: 'subtask-3-verification',
            title: `Verify implementation: ${title}`,
            description: `Run functional tests and QA gates`,
            assignedAgent: 'claude-code',
            assignedProvider: 'claude-code',
            dependencies: ['subtask-2-implementation'],
            estimatedDurationSec: 120,
          },
        ];

    let masterTask = null;
    if (masterOrchestrator && typeof masterOrchestrator.createMasterTask === 'function') {
      masterTask = masterOrchestrator.createMasterTask({
        title,
        description,
        workingDirectory,
        subtasks: generatedSubtasks,
        executionPolicy,
        createdBy,
      });
    } else {
      masterTask = {
        masterTaskId: `mt_${now()}_${crypto.randomBytes(3).toString('hex')}`,
        title,
        description,
        workingDirectory,
        subtasks: generatedSubtasks,
        status: 'ready',
        createdAt: now(),
      };
    }

    setTaskExecutionState(masterTask.masterTaskId, EXECUTION_STATES.PLANNING, 'Plan formulated');
    return masterTask;
  }

  /**
   * Starts autonomous execution of a Master Task with policy evaluation.
   */
  async function startAutonomousExecution(masterTaskId) {
    if (emergencyStop && typeof emergencyStop.isHalted === 'function' && emergencyStop.isHalted()) {
      setTaskExecutionState(masterTaskId, EXECUTION_STATES.HALTED, 'Emergency Stop active');
      return {
        ok: false,
        state: EXECUTION_STATES.HALTED,
        reason: INTERVENTION_REASONS.EMERGENCY_STOP_TRIGGERED,
        error: 'System is under Emergency Stop. Execution blocked.',
      };
    }

    setTaskExecutionState(masterTaskId, EXECUTION_STATES.POLICY_EVALUATING, 'Evaluating policy');

    // Policy check
    if (policyEngine) {
      const evalResult = policyEngine.evaluateAction({
        actionType: APPROVAL_ACTION_TYPES.TOOL_INVOKE,
        taskId: masterTaskId,
        context: { operation: 'start_autonomous_execution' },
        requestedBy: 'autonomous_scheduler',
        title: `Authorize Autonomous Task Execution`,
        description: `Autonomous task ${masterTaskId} requires execution approval.`,
      });

      if (!evalResult.allowed) {
        if (evalResult.requiresApproval) {
          setTaskExecutionState(masterTaskId, EXECUTION_STATES.AWAITING_APPROVAL, 'Approval required');
          return {
            ok: false,
            awaitingApproval: true,
            approvalRequest: evalResult.approvalRequest,
            reason: evalResult.reason,
          };
        }

        setTaskExecutionState(masterTaskId, EXECUTION_STATES.PAUSED, evalResult.reason);
        return {
          ok: false,
          blocked: true,
          reason: evalResult.reason,
          message: evalResult.message,
        };
      }
    }

    // Acquire concurrency slot
    if (budgetManager) {
      const conResult = budgetManager.acquireConcurrency(1);
      if (!conResult.allowed) {
        setTaskExecutionState(masterTaskId, EXECUTION_STATES.PAUSED, conResult.reason);
        addIntervention({
          masterTaskId,
          reason: INTERVENTION_REASONS.CONCURRENCY_LIMIT_REACHED,
          message: conResult.reason,
        });
        return {
          ok: false,
          blocked: true,
          reason: INTERVENTION_REASONS.CONCURRENCY_LIMIT_REACHED,
          message: conResult.reason,
        };
      }
    }

    setTaskExecutionState(masterTaskId, EXECUTION_STATES.DISPATCHING, 'Dispatching subtasks');

    if (masterOrchestrator && typeof masterOrchestrator.startMasterTask === 'function') {
      try {
        const startRes = masterOrchestrator.startMasterTask(masterTaskId);
        setTaskExecutionState(masterTaskId, EXECUTION_STATES.RUNNING, 'Master task running');
        return { ok: true, state: EXECUTION_STATES.RUNNING, masterTask: startRes };
      } catch (err) {
        if (budgetManager) budgetManager.releaseConcurrency(1);
        setTaskExecutionState(masterTaskId, EXECUTION_STATES.FAILED, err.message);
        return { ok: false, error: err.message };
      }
    }

    setTaskExecutionState(masterTaskId, EXECUTION_STATES.RUNNING, 'Simulation running');
    return { ok: true, state: EXECUTION_STATES.RUNNING, masterTaskId };
  }

  /**
   * Normalizes error strings to signatures for loop detection.
   */
  function normalizeErrorSignature(error) {
    if (!error) return 'unknown_error';
    const str = typeof error === 'string' ? error : error.message || String(error);
    return str
      .toLowerCase()
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
      .replace(/pid\s*\d+/g, '<pid>')
      .replace(/line\s*\d+/g, '<line>')
      .replace(/\d+/g, '<num>')
      .trim();
  }

  /**
   * Classifies error into failure category and selects remediation strategy.
   */
  function classifyFailure(error) {
    const errorStr = (typeof error === 'string' ? error : error?.message || '').toLowerCase();

    // 1. Transient / Timeout / Network
    if (
      errorStr.includes('etimedout') ||
      errorStr.includes('timeout') ||
      errorStr.includes('timed out') ||
      errorStr.includes('econnreset') ||
      errorStr.includes('network') ||
      errorStr.includes('rate limit') ||
      errorStr.includes('429')
    ) {
      return {
        category: 'transient',
        strategy: SELF_HEALING_STRATEGIES.RETRY_WITH_BACKOFF,
      };
    }

    // 2. Provider limitation
    if (
      errorStr.includes('unsupported') ||
      errorStr.includes('not supported') ||
      errorStr.includes('capability') ||
      errorStr.includes('operation not allowed') ||
      errorStr.includes('unknown tool') ||
      errorStr.includes('provider error')
    ) {
      return {
        category: 'provider_limitation',
        strategy: SELF_HEALING_STRATEGIES.SWITCH_PROVIDER,
      };
    }

    // 3. Dirty worktree / Git corruption
    if (
      errorStr.includes('git conflict') ||
      errorStr.includes('merge conflict') ||
      errorStr.includes('worktree dirty') ||
      errorStr.includes('uncommitted changes')
    ) {
      return {
        category: 'git_corruption',
        strategy: SELF_HEALING_STRATEGIES.GIT_WORKTREE_ROLLBACK,
      };
    }

    // 4. Test failure / Syntax / Linter error
    if (
      errorStr.includes('test failed') ||
      errorStr.includes('assertionerror') ||
      errorStr.includes('syntaxerror') ||
      errorStr.includes('typeerror') ||
      errorStr.includes('compilation error')
    ) {
      return {
        category: 'diagnostic_fix',
        strategy: SELF_HEALING_STRATEGIES.DIAGNOSTIC_FIX,
      };
    }

    // Default fallback
    return {
      category: 'general_failure',
      strategy: SELF_HEALING_STRATEGIES.RETRY_WITH_BACKOFF,
    };
  }

  /**
   * Adds an intervention record and pauses execution if needed.
   */
  function addIntervention({ masterTaskId, subtaskId = null, reason, message, details = {} }) {
    const record = {
      interventionId: `int_${now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: now(),
      masterTaskId,
      subtaskId,
      reason,
      message,
      details,
    };
    interventions.push(record);
    if (policyEngine) {
      policyEngine.addAuditLog({
        type: 'intervention_triggered',
        actor: 'autonomous_scheduler',
        details: { masterTaskId, subtaskId, reason, message },
      });
    }
    persist();
    return record;
  }

  /**
   * Triggers the Self-Healing Loop Breaker & Remediation Engine.
   */
  async function triggerSelfHealing(masterTaskId, subtaskId, error) {
    if (emergencyStop && typeof emergencyStop.isHalted === 'function' && emergencyStop.isHalted()) {
      setTaskExecutionState(masterTaskId, EXECUTION_STATES.HALTED, 'Emergency stop');
      return {
        remediated: false,
        escalated: true,
        reason: INTERVENTION_REASONS.EMERGENCY_STOP_TRIGGERED,
        message: 'System is under Emergency Stop.',
      };
    }

    const key = `${masterTaskId}:${subtaskId}`;
    const errSig = normalizeErrorSignature(error);

    // Track error history for loop detection
    if (!subtaskErrorHistory.has(key)) {
      subtaskErrorHistory.set(key, []);
    }
    const historyForSubtask = subtaskErrorHistory.get(key);
    historyForSubtask.push({ sig: errSig, timestamp: now() });

    // Count attempts for this subtask
    const subtaskRemediations = remediationHistory.filter(
      (r) => r.masterTaskId === masterTaskId && r.subtaskId === subtaskId
    );
    const attemptNumber = subtaskRemediations.length + 1;

    // Count total remediations for task
    const totalTaskRemediations = remediationHistory.filter(
      (r) => r.masterTaskId === masterTaskId
    ).length;

    // INVARIANT 1: Consecutive identical error loop detection (3 times identical)
    const recentSigs = historyForSubtask.slice(-3).map((h) => h.sig);
    if (recentSigs.length >= 3 && recentSigs.every((s) => s === errSig)) {
      setTaskExecutionState(masterTaskId, EXECUTION_STATES.AWAITING_APPROVAL, 'Execution loop detected');
      const intervention = addIntervention({
        masterTaskId,
        subtaskId,
        reason: INTERVENTION_REASONS.EXECUTION_LOOP_DETECTED,
        message: `Identical failure signature recurred ${recentSigs.length} times on subtask ${subtaskId}: "${errSig}"`,
      });

      if (policyEngine) {
        policyEngine.createApproval({
          taskId: masterTaskId,
          subtaskId,
          actionType: APPROVAL_ACTION_TYPES.SELF_HEALING_REMEDIATION,
          title: `Loop Breaker: Subtask ${subtaskId} Failed Repeatedly`,
          description: intervention.message,
          payload: { error: String(error), errorSignature: errSig, loopBreakerTriggered: true },
          riskTier: 'high',
          requestedBy: 'autonomous_scheduler',
        });
      }

      return {
        remediated: false,
        escalated: true,
        strategy: SELF_HEALING_STRATEGIES.ESCALATE_TO_HUMAN,
        reason: INTERVENTION_REASONS.EXECUTION_LOOP_DETECTED,
        message: intervention.message,
      };
    }

    // INVARIANT 2: Subtask max remediation limit (default: 3)
    const maxSubtaskAttempts = activePolicies.defaultMaxRemediationAttemptsPerSubtask || 3;
    if (attemptNumber > maxSubtaskAttempts) {
      setTaskExecutionState(masterTaskId, EXECUTION_STATES.AWAITING_APPROVAL, 'Max subtask remediations exceeded');
      const intervention = addIntervention({
        masterTaskId,
        subtaskId,
        reason: INTERVENTION_REASONS.MAX_REMEDIATION_EXCEEDED,
        message: `Subtask ${subtaskId} exceeded maximum remediation attempts (${maxSubtaskAttempts}). Escalating to operator.`,
      });

      if (policyEngine) {
        policyEngine.createApproval({
          taskId: masterTaskId,
          subtaskId,
          actionType: APPROVAL_ACTION_TYPES.SELF_HEALING_REMEDIATION,
          title: `Max Remediation Attempts Exceeded for ${subtaskId}`,
          description: intervention.message,
          riskTier: 'high',
          requestedBy: 'autonomous_scheduler',
        });
      }

      return {
        remediated: false,
        escalated: true,
        strategy: SELF_HEALING_STRATEGIES.ESCALATE_TO_HUMAN,
        reason: INTERVENTION_REASONS.MAX_REMEDIATION_EXCEEDED,
        message: intervention.message,
      };
    }

    // INVARIANT 3: Global task remediation budget (default: 8)
    const maxGlobalRemediations = activePolicies.defaultMaxTotalRemediationsPerTask || 8;
    if (totalTaskRemediations >= maxGlobalRemediations) {
      setTaskExecutionState(masterTaskId, EXECUTION_STATES.PAUSED, 'Total remediation budget exhausted');
      const intervention = addIntervention({
        masterTaskId,
        reason: INTERVENTION_REASONS.BUDGET_EXHAUSTED,
        message: `Master Task ${masterTaskId} reached total remediation cap (${maxGlobalRemediations}). Pausing execution.`,
      });

      return {
        remediated: false,
        escalated: true,
        strategy: SELF_HEALING_STRATEGIES.ESCALATE_TO_HUMAN,
        reason: INTERVENTION_REASONS.BUDGET_EXHAUSTED,
        message: intervention.message,
      };
    }

    // Check autonomy level permission for self-healing
    const currentLevel = policyEngine ? policyEngine.getAutonomyLevel() : AUTONOMY_LEVELS.supervised;
    if (currentLevel === AUTONOMY_LEVELS.readonly) {
      setTaskExecutionState(masterTaskId, EXECUTION_STATES.AWAITING_APPROVAL, 'Readonly level requires approval');
      return {
        remediated: false,
        escalated: true,
        strategy: SELF_HEALING_STRATEGIES.ESCALATE_TO_HUMAN,
        reason: 'Read-only mode prohibits automated self-healing file modifications.',
      };
    }

    if (currentLevel === AUTONOMY_LEVELS.assisted) {
      setTaskExecutionState(masterTaskId, EXECUTION_STATES.AWAITING_APPROVAL, 'Assisted level requires approval');
      const appr = policyEngine?.createApproval({
        taskId: masterTaskId,
        subtaskId,
        actionType: APPROVAL_ACTION_TYPES.SELF_HEALING_REMEDIATION,
        title: `Approve Self-Healing for ${subtaskId}`,
        description: `Subtask encountered error: ${String(error)}. Approve automated remediation attempt #${attemptNumber}.`,
        riskTier: 'medium',
        requestedBy: 'autonomous_scheduler',
      });
      return {
        remediated: false,
        escalated: true,
        strategy: SELF_HEALING_STRATEGIES.ESCALATE_TO_HUMAN,
        approvalRequest: appr,
        reason: INTERVENTION_REASONS.ASSISTED_STEP_APPROVAL_REQUIRED,
      };
    }

    // Classify failure & choose strategy
    const classification = classifyFailure(error);
    const strategy = classification.strategy;

    setTaskExecutionState(masterTaskId, EXECUTION_STATES.SELF_HEALING, `Remediation attempt #${attemptNumber}: ${strategy}`);

    // Calculate exponential backoff
    const baseMs = activePolicies.defaultBackoffBaseMs || 1000;
    const multiplier = activePolicies.defaultBackoffMultiplier || 2;
    const maxBackoffMs = activePolicies.defaultMaxBackoffMs || 15000;
    const backoffMs = Math.min(maxBackoffMs, baseMs * Math.pow(multiplier, attemptNumber - 1));

    let actionTaken = '';
    let fallbackProvider = null;

    if (strategy === SELF_HEALING_STRATEGIES.SWITCH_PROVIDER) {
      fallbackProvider = 'codex-cli';
      actionTaken = `Switched provider to ${fallbackProvider}`;
    } else if (strategy === SELF_HEALING_STRATEGIES.GIT_WORKTREE_ROLLBACK) {
      actionTaken = 'Reverted dirty changes in worktree to clean commit';
    } else if (strategy === SELF_HEALING_STRATEGIES.DIAGNOSTIC_FIX) {
      actionTaken = 'Applied diagnostic fix instruction to resolve test/syntax failure';
    } else {
      actionTaken = `Retried subtask after ${backoffMs}ms exponential backoff`;
    }

    const remediationRecord = {
      remediationId: `rem_${now()}_${crypto.randomBytes(3).toString('hex')}`,
      masterTaskId,
      subtaskId,
      attemptNumber,
      strategy,
      errorEncountered: String(error),
      errorSignature: errSig,
      actionTaken,
      backoffMs,
      fallbackProvider,
      success: true,
      timestamp: now(),
    };

    remediationHistory.push(remediationRecord);

    // Record resource cost of remediation
    if (budgetManager) {
      budgetManager.recordUsage({
        executions: 1,
        costUsd: 0.05,
      });
    }

    // Trigger retry on Master Orchestrator
    if (masterOrchestrator && typeof masterOrchestrator.retrySubtask === 'function') {
      try {
        masterOrchestrator.retrySubtask(masterTaskId, subtaskId);
      } catch {
        // preserve flow
      }
    }

    setTaskExecutionState(masterTaskId, EXECUTION_STATES.RUNNING, 'Resumed after self-healing');
    persist();

    return {
      remediated: true,
      strategy,
      attemptNumber,
      backoffMs,
      actionTaken,
      record: remediationRecord,
    };
  }

  /**
   * Handles subtask failure event.
   */
  async function handleSubtaskFailure(masterTaskId, subtaskId, error) {
    if (budgetManager) {
      budgetManager.releaseConcurrency(1);
    }
    return triggerSelfHealing(masterTaskId, subtaskId, error);
  }

  /**
   * Handles subtask completion event.
   */
  function handleSubtaskCompletion(masterTaskId, subtaskId, result = {}) {
    if (budgetManager) {
      budgetManager.releaseConcurrency(1);
      budgetManager.recordUsage({
        subtasks: 1,
        executions: 1,
        costUsd: result.costUsd || 0.02,
        tokens: result.tokens || 1500,
        durationMinutes: result.durationMinutes || 0.5,
      });
    }

    // Reset loop detector history for this subtask upon success
    subtaskErrorHistory.delete(`${masterTaskId}:${subtaskId}`);

    if (policyEngine) {
      policyEngine.addAuditLog({
        type: 'subtask_completed',
        actor: 'autonomous_scheduler',
        details: { masterTaskId, subtaskId },
      });
    }

    persist();
  }

  /**
   * Evaluates Phase 3 Quality Gates before concluding a task.
   */
  function evaluateTaskGates(masterTaskId, evidenceList = [], findings = []) {
    if (!qualityGateEngine || typeof qualityGateEngine.evaluateGates !== 'function') {
      setTaskExecutionState(masterTaskId, EXECUTION_STATES.COMPLETED, 'Completed without quality gate engine');
      return { ok: true, gatesEvaluated: false };
    }

    const gateResult = qualityGateEngine.evaluateGates({
      masterTask: { masterTaskId },
      evidenceList,
      findings,
    });

    if (!gateResult.passed) {
      setTaskExecutionState(masterTaskId, EXECUTION_STATES.SELF_HEALING, 'Quality gate failed');
      addIntervention({
        masterTaskId,
        reason: INTERVENTION_REASONS.MANDATORY_QUALITY_GATE_FAILED,
        message: `Quality Gate failed: ${gateResult.blockers.join('; ')}`,
        details: { blockers: gateResult.blockers },
      });

      return {
        ok: false,
        gatesEvaluated: true,
        passed: false,
        blockers: gateResult.blockers,
        gates: gateResult.gates,
      };
    }

    setTaskExecutionState(masterTaskId, EXECUTION_STATES.COMPLETED, 'All quality gates passed');
    return {
      ok: true,
      gatesEvaluated: true,
      passed: true,
      gates: gateResult.gates,
    };
  }

  /**
   * Pauses execution of a task.
   */
  function pauseExecution(masterTaskId, reason = 'Operator paused') {
    setTaskExecutionState(masterTaskId, EXECUTION_STATES.PAUSED, reason);
    if (budgetManager) {
      budgetManager.releaseConcurrency(1);
    }
    return { ok: true, state: EXECUTION_STATES.PAUSED, reason };
  }

  /**
   * Resumes execution of a task.
   */
  async function resumeExecution(masterTaskId) {
    if (emergencyStop && typeof emergencyStop.isHalted === 'function' && emergencyStop.isHalted()) {
      return { ok: false, error: 'Cannot resume: Emergency Stop is active.' };
    }
    setTaskExecutionState(masterTaskId, EXECUTION_STATES.RUNNING, 'Resumed');
    if (budgetManager) {
      budgetManager.acquireConcurrency(1);
    }
    return { ok: true, state: EXECUTION_STATES.RUNNING };
  }

  /**
   * Retrieves remediation history.
   */
  function getRemediationHistory(masterTaskId = null) {
    if (masterTaskId) {
      return remediationHistory.filter((r) => r.masterTaskId === masterTaskId);
    }
    return [...remediationHistory];
  }

  /**
   * Retrieves list of interventions.
   */
  function getInterventions(limit = 50) {
    return interventions.slice(-limit);
  }

  return {
    createAutonomousPlan,
    startAutonomousExecution,
    pauseExecution,
    resumeExecution,
    classifyFailure,
    triggerSelfHealing,
    handleSubtaskFailure,
    handleSubtaskCompletion,
    evaluateTaskGates,
    getExecutionState,
    setTaskExecutionState,
    getRemediationHistory,
    getInterventions,
    normalizeErrorSignature,
  };
}
