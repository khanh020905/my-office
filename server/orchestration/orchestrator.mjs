/**
 * Dynamic Task Orchestrator (Phase 6 Master Architecture §8, §9, §10, §11).
 * Coordinates task analysis, dynamic capability matching, agent selection, execution planning,
 * user approval gates, step-by-step DAG execution, mandatory Phase 5 security evaluation,
 * transparent fallback handling, and auditable trace generation.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { atomicWriteJsonSync, acquireLockSync } from '../tools/fs-utils.mjs';
import { createTaskAnalyzer } from './task-analyzer.mjs';
import { createCapabilityMatcher } from './capability-matcher.mjs';
import { createAgentSelector } from './agent-selector.mjs';
import { createPlanGenerator, computePlanHash } from './plan-generator.mjs';
import { createNativeAgentExecutor } from './native-agent-executor.mjs';

const DEFAULT_STORE_PATH = path.resolve(process.cwd(), 'data', 'orchestration', 'orchestration-tasks.json');

export const ORCHESTRATION_STATES = new Set([
  'RECEIVED',
  'ANALYZING',
  'MATCHING',
  'PLANNING',
  'AWAITING_APPROVAL',
  'READY',
  'RUNNING',
  'VALIDATING',
  'COMPLETED',
  'FAILED',
  'BLOCKED',
  'CANCELLED',
  'NEEDS_USER_INPUT',
  'PARTIALLY_COMPLETED',
]);

export function createOrchestrator({
  registry,
  distributionEngine = null,
  policyEngine = null,
  permissionRegistry = null,
  auditLogger = null,
  workflowEngine = null,
  nativeAgentExecutor = null,
  storePath = null,
} = {}) {
  // Retain references for event journaling and underlying workflow binding
  void auditLogger;
  void workflowEngine;
  const store = storePath || DEFAULT_STORE_PATH;
  const lockPath = `${store}.lock`;
  fs.mkdirSync(path.dirname(store), { recursive: true });

  const analyzer = createTaskAnalyzer();
  const matcher = createCapabilityMatcher({
    registry,
    distributionEngine,
    policyEngine,
    permissionRegistry,
  });
  const selector = createAgentSelector({ distributionEngine, policyEngine });
  const planner = createPlanGenerator();
  const agentExecutor = nativeAgentExecutor || createNativeAgentExecutor({ policyEngine });

  const tasks = new Map();
  // Task ids inside executePlan: load() must not swap their record for the older copy on disk,
  // or the run's result is written to an object nobody saves.
  const executing = new Set();

  function load() {
    if (!fs.existsSync(store)) {
      tasks.clear();
      return;
    }
    try {
      const data = JSON.parse(fs.readFileSync(store, 'utf8'));
      if (Array.isArray(data.tasks)) {
        const live = [...executing].map((id) => tasks.get(id)).filter(Boolean);
        tasks.clear();
        for (const t of data.tasks) {
          tasks.set(t.task_id, t);
        }
        for (const r of live) tasks.set(r.task_id, r);
      }
    } catch {
      // Keep in-memory
    }
  }

  function save() {
    const releaseLock = acquireLockSync(lockPath);
    try {
      const payload = {
        version: '1.0.0',
        updated_at: new Date().toISOString(),
        tasks: Array.from(tasks.values()).slice(-100),
      };
      atomicWriteJsonSync(store, payload);
    } finally {
      releaseLock();
    }
  }

  load();

  function addTraceEvent(record, eventType, message, details = {}) {
    const event = {
      timestamp: new Date().toISOString(),
      type: eventType,
      message,
      details: policyEngine ? JSON.parse(policyEngine.redactSensitiveOutput(JSON.stringify(details))) : details,
    };
    record.trace.push(event);
    record.updated_at = event.timestamp;
  }

  function updateStatus(record, newStatus, reason = '') {
    if (!ORCHESTRATION_STATES.has(newStatus)) {
      throw new Error(`Invalid orchestration status '${newStatus}'`);
    }
    const previous = record.status;
    record.status = newStatus;
    addTraceEvent(record, `STATE_${newStatus}`, `State transition: ${previous} -> ${newStatus}. ${reason}`, { previous, newStatus, reason });
    save();
  }

  return {
    /**
     * Submits a user task request for dynamic orchestration.
     */
    async submitTask(request, { autoStartIfApproved = true } = {}) {
      load();

      const taskId = typeof request === 'object' && request.task_id
        ? request.task_id
        : `orch_${crypto.randomUUID()}`;
      if (tasks.has(taskId)) throw new Error(`Task '${taskId}' already exists`);

      const now = new Date().toISOString();
      const record = {
        task_id: taskId,
        status: 'RECEIVED',
        created_at: now,
        updated_at: now,
        original_request: typeof request === 'string' ? request : request.prompt || request.text || '',
        // Kept on the record: original_request is only the prompt text, and re-planning needs both.
        target_agent: typeof request === 'object' ? (request.target_agent || request.agent_override || null) : null,
        require_approval: typeof request === 'object' && (request.require_approval === true || request.execution_mode === 'manual_approval'),
        task_spec: null,
        matched_tools: [],
        rejected_tools: [],
        selected_agent: null,
        execution_plan: null,
        approval: {
          required: false,
          approved: false,
          approved_at: null,
          approved_by: null,
        },
        execution_results: {
          completed_steps: 0,
          total_steps: 0,
          artifacts_produced: [],
          step_results: {},
        },
        error: null,
        trace: [],
      };

      tasks.set(taskId, record);
      addTraceEvent(record, 'TASK_RECEIVED', 'User task received for dynamic orchestration');

      // 1. ANALYZE
      updateStatus(record, 'ANALYZING');
      const spec = analyzer.analyzeTask(request);
      record.task_spec = spec;
      addTraceEvent(record, 'ANALYSIS_COMPLETE', `Task classified as '${spec.task_type}' requiring capabilities: ${spec.required_capabilities.join(', ')}`, { spec });

      // Check if task needs explicit user input or clarification
      if (spec.needs_user_input || (spec.uncertainty_notes && spec.uncertainty_notes.some((n) => n.includes('clarification')))) {
        record.clarification_prompt = spec.clarification_prompt || spec.uncertainty_notes.join('; ');
        updateStatus(record, 'NEEDS_USER_INPUT', record.clarification_prompt);
        save();
        return record;
      }

      // 2. MATCH & SELECT AGENT
      updateStatus(record, 'MATCHING');
      const matchResult = matcher.matchTools(spec);
      record.matched_tools = matchResult.ranked_candidates;
      record.rejected_tools = matchResult.rejected_candidates;
      addTraceEvent(record, 'MATCHING_COMPLETE', matchResult.explanation, {
        matched_count: matchResult.ranked_candidates.length,
        rejected_count: matchResult.rejected_candidates.length,
        missing_capabilities: matchResult.missing_capabilities,
      });

      // If all candidate tools were rejected by security policy, block task safely
      if (matchResult.ranked_candidates.length === 0 && matchResult.rejected_candidates.length > 0) {
        const securityDenied = matchResult.rejected_candidates.some((r) =>
          r.rejection_reasons.some((reason) => reason.includes('denied by security policy') || reason.includes('quarantined'))
        );
        if (securityDenied) {
          record.error = 'All candidate tools were rejected by security policy';
          updateStatus(record, 'BLOCKED', record.error);
          save();
          return record;
        }
      }

      const targetAgentId = record.target_agent;
      let agentResult;
      if (targetAgentId) {
        agentResult = {
          selected_agent: { agent_id: targetAgentId, name: targetAgentId === 'claude-code' ? 'Claude Code' : targetAgentId },
          explanation: `Explicitly selected target agent: '${targetAgentId}' by user request`,
          ranked_agents: [{ agent_id: targetAgentId, score: 1.0 }],
          rejected_agents: [],
        };
      } else {
        agentResult = selector.selectAgent(spec, matchResult.ranked_candidates);
      }
      record.selected_agent = agentResult.selected_agent;
      addTraceEvent(record, 'AGENT_SELECTED', agentResult.explanation, { agent: agentResult.selected_agent });

      // 3. GENERATE PLAN
      updateStatus(record, 'PLANNING');
      const plan = planner.generatePlan({
        taskSpec: spec,
        selectedAgent: agentResult.selected_agent,
        matchedTools: matchResult.ranked_candidates,
        fallbackTools: matchResult.ranked_candidates.length > 1 ? matchResult.ranked_candidates.slice(1) : [],
      });
      record.execution_plan = plan;
      record.execution_results.total_steps = plan.steps.length;
      if (record.require_approval) {
        plan.requires_human_approval = true;
      }
      record.approval.required = plan.requires_human_approval;

      addTraceEvent(record, 'PLAN_GENERATED', `Execution plan generated with ${plan.steps.length} step(s). Requires approval: ${plan.requires_human_approval}`, {
        plan_id: plan.plan_id,
        steps: plan.steps.map((s) => ({ id: s.step_id, tool: s.tool_id, permissions: s.required_permissions })),
      });

      // 4. CHECK APPROVAL
      if (plan.requires_human_approval) {
        updateStatus(record, 'AWAITING_APPROVAL', 'Human approval required due to requested permissions or side-effects');
        save();
        return record;
      }

      // Auto-approved
      record.approval.approved = true;
      record.approval.approved_at = new Date().toISOString();
      record.approval.approved_by = 'system_auto_policy';
      updateStatus(record, 'READY', 'Plan auto-approved by platform policy');

      if (autoStartIfApproved) {
        return this.executePlan(taskId);
      }

      save();
      return record;
    },

    /**
     * Approves an awaiting task plan with cryptographic and version binding.
     */
    async approveTask(taskId, { approvedBy = 'user', expectedPlanVersion = null, expectedPlanHash = null } = {}) {
      load();
      const record = tasks.get(taskId);
      if (!record) throw new Error(`Task '${taskId}' not found`);

      if (record.status !== 'AWAITING_APPROVAL') {
        throw new Error(`Task '${taskId}' is in state '${record.status}', cannot approve`);
      }

      const plan = record.execution_plan;
      if (!plan) {
        throw new Error(`Task '${taskId}' does not have an execution plan to approve`);
      }

      // Cryptographic and version binding verification
      if (expectedPlanVersion != null && plan.plan_version !== expectedPlanVersion) {
        throw new Error(`Approval rejected: Plan version mismatch (expected v${expectedPlanVersion}, but active plan is v${plan.plan_version})`);
      }

      if (expectedPlanHash != null && plan.plan_hash && plan.plan_hash !== expectedPlanHash) {
        throw new Error(`Approval rejected: Cryptographic plan hash mismatch (plan was modified or regenerated)`);
      }

      record.approval = {
        required: true,
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: approvedBy,
        bound_plan_version: plan.plan_version,
        bound_plan_hash: plan.plan_hash || null,
        bound_agent_id: plan.selected_agent,
        bound_permissions: [...(plan.required_permissions || [])],
      };

      addTraceEvent(record, 'APPROVAL_GRANTED', `Execution plan (v${plan.plan_version}, hash: ${plan.plan_hash ? plan.plan_hash.slice(0, 12) : 'none'}) approved by ${approvedBy}`, {
        approved_by: approvedBy,
        plan_version: plan.plan_version,
        plan_hash: plan.plan_hash,
        agent_id: plan.selected_agent,
        permissions: plan.required_permissions,
      });
      updateStatus(record, 'READY', 'Approval confirmed with plan binding');

      // Auto-execute on approval
      return this.executePlan(taskId);
    },

    /**
     * Executes an approved execution plan step-by-step with Phase 5 Security evaluation.
     */
    async executePlan(taskId) {
      load();
      if (executing.has(taskId)) throw new Error(`Task '${taskId}' is already executing`);
      executing.add(taskId);
      try {
        return await this._executePlan(taskId);
      } finally {
        executing.delete(taskId);
      }
    },

    async _executePlan(taskId) {
      load();
      const record = tasks.get(taskId);
      if (!record) throw new Error(`Task '${taskId}' not found`);

      if (record.status !== 'READY') {
        throw new Error(`Task '${taskId}' is not READY for execution (current status: ${record.status})`);
      }

      const plan = record.execution_plan;
      if (!plan) {
        throw new Error(`Task '${taskId}' has no execution plan to execute`);
      }

      // Verification of approval binding integrity before running
      if (record.approval?.required) {
        if (!record.approval.approved) {
          throw new Error(`Execution blocked: Human approval is required but not granted`);
        }
        if (record.approval.bound_plan_version != null && record.approval.bound_plan_version !== plan.plan_version) {
          throw new Error(`Execution blocked: Approval was granted for plan v${record.approval.bound_plan_version}, but executing plan v${plan.plan_version}`);
        }
        // Recomputed from the plan about to run, not read from its stored plan_hash field.
        if (record.approval.bound_plan_hash != null && record.approval.bound_plan_hash !== computePlanHash(plan)) {
          throw new Error(`Execution blocked: Approval cryptographic hash mismatch against active plan`);
        }
      }

      updateStatus(record, 'RUNNING', 'Starting step execution');

      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        step.status = 'running';
        addTraceEvent(record, 'STEP_START', `Executing step ${step.step_id}: ${step.title}`, { step });

        let toolId = step.tool_id;
        const agentId = step.agent_id;
        let attempt = 1;
        const maxAttempts = step.retry_policy?.max_attempts || 1;
        let stepSucceeded = false;
        let stepOutput = null;
        let stepMetadata = null;
        let lastError = null;

        while (attempt <= maxAttempts && !stepSucceeded) {
          // MANDATORY PHASE 5 SECURITY EVALUATION AT EXECUTION GATE
          if (policyEngine && toolId) {
            const requestedScopes = step.required_permissions || ['process:exec'];
            const securityDecision = policyEngine.evaluateOperation({
              toolId,
              agentId,
              distributionId: null,
              operation: requestedScopes[0] || 'process:exec',
              requestedScopes,
              target: step.entry_point || step.tool_id,
              taskContext: { task_id: taskId, step_id: step.step_id, attempt },
            });

            if (!securityDecision.allowed) {
              addTraceEvent(record, 'SECURITY_GATE_DENIED', `Security Policy Engine blocked execution of ${toolId} on ${agentId}: ${securityDecision.reason}`, {
                toolId,
                agentId,
                decision: securityDecision,
              });

              // Check if fallback tool is available
              if (step.fallback_tools && step.fallback_tools.length > 0) {
                const fallbackToolId = step.fallback_tools.shift();
                addTraceEvent(record, 'FALLBACK_ATTEMPT', `Attempting fallback tool: ${fallbackToolId} for step ${step.step_id}`);
                toolId = fallbackToolId;
                attempt++;
                continue; // Fresh evaluation loop on fallback tool!
              } else {
                step.status = 'blocked';
                record.error = `Security policy blocked tool ${toolId}: ${securityDecision.reason}`;
                updateStatus(record, 'BLOCKED', record.error);
                save();
                return record;
              }
            }
          }

          // Execute Step
          try {
            if (step.protocol === 'system_verify') {
              // Artifact verification step
              stepSucceeded = true;
              stepOutput = 'System artifact verification passed';
            } else if (step.entry_point || step.tool_id) {
              // No tool runner exists yet: fail at once rather than report work that never ran.
              attempt = maxAttempts;
              throw new Error(`Tool step execution is not implemented (tool '${toolId || step.entry_point}')`);
            } else {
              // Real Native Agent Execution (Phase 8 Architecture)
              const nativeRes = await agentExecutor.executeAgentStep({
                step,
                taskContext: {
                  task_id: taskId,
                  step_id: step.step_id,
                  attempt,
                  plan_id: plan.plan_id,
                  plan_hash: plan.plan_hash,
                  plan_version: plan.plan_version,
                  approval: record.approval,
                },
                workspaceDir: process.cwd(),
              });

              if (nativeRes.ok) {
                stepSucceeded = true;
                stepOutput = nativeRes.stdout || `Completed natively by ${agentId} with exit code 0`;
                stepMetadata = {
                  pid: nativeRes.pid,
                  duration_ms: nativeRes.duration_ms,
                  exit_code: nativeRes.exit_code,
                  start_time: nativeRes.start_time,
                  end_time: nativeRes.end_time,
                };
              } else {
                record.execution_results.step_results[step.step_id] = {
                  tool_id: toolId,
                  agent_id: agentId,
                  output: nativeRes.stdout || '',
                  error: nativeRes.error || nativeRes.stderr,
                  metadata: {
                    pid: nativeRes.pid,
                    duration_ms: nativeRes.duration_ms,
                    exit_code: nativeRes.exit_code,
                    start_time: nativeRes.start_time,
                    end_time: nativeRes.end_time,
                  },
                  failed_at: new Date().toISOString(),
                };
                throw new Error(nativeRes.error || nativeRes.stderr || `Agent execution failed with code ${nativeRes.exit_code}`);
              }
            }
          } catch (err) {
            lastError = err.message;
            addTraceEvent(record, 'STEP_RETRY', `Step ${step.step_id} failed on attempt ${attempt}: ${err.message}`, { error: err.message, attempt });
            attempt++;
            if (attempt <= maxAttempts) {
              await new Promise((r) => setTimeout(r, step.retry_policy?.backoff_ms || 500));
            }
          }
        }

        if (!stepSucceeded) {
          step.status = 'failed';
          record.error = `Step ${step.step_id} failed after ${maxAttempts} attempt(s): ${lastError}`;
          // If some prior steps completed, mark as PARTIALLY_COMPLETED, otherwise FAILED
          const finalState = record.execution_results.completed_steps > 0 ? 'PARTIALLY_COMPLETED' : 'FAILED';
          updateStatus(record, finalState, record.error);
          save();
          return record;
        }

        step.status = 'completed';
        record.execution_results.completed_steps++;
        record.execution_results.step_results[step.step_id] = {
          tool_id: toolId,
          agent_id: agentId,
          output: stepOutput,
          metadata: stepMetadata || null,
          completed_at: new Date().toISOString(),
        };

        addTraceEvent(record, 'STEP_COMPLETED', `Step ${step.step_id} completed successfully`, {
          step_id: step.step_id,
          tool_id: toolId,
          pid: stepMetadata?.pid,
          exit_code: stepMetadata?.exit_code,
          duration_ms: stepMetadata?.duration_ms,
        });
      }

      // 5. VALIDATING ARTIFACTS
      updateStatus(record, 'VALIDATING', 'Validating completion criteria and expected artifacts');
      const expectedArtifacts = record.task_spec?.expected_output_artifacts || [];
      const producedArtifacts = [];
      const missingArtifacts = [];

      for (const art of expectedArtifacts) {
        // Physical artifact verification on disk, or non-simulated artifact output
        if (fs.existsSync(path.resolve(process.cwd(), art))) {
          producedArtifacts.push(art);
        } else if (record.execution_results.step_results && Object.values(record.execution_results.step_results).some((s) => s.output && s.output.includes(`[CREATED] ${art}`))) {
          producedArtifacts.push(art);
        } else {
          missingArtifacts.push(art);
        }
      }

      record.execution_results.artifacts_produced = producedArtifacts;

      if (missingArtifacts.length > 0) {
        record.error = `Output validation failed: Expected artifact(s) not found: ${missingArtifacts.join(', ')}`;
        addTraceEvent(record, 'VALIDATION_FAILED', record.error, { expected: expectedArtifacts, missing: missingArtifacts });
        // Transition to PARTIALLY_COMPLETED or FAILED
        const validationState = record.execution_results.completed_steps > 0 ? 'PARTIALLY_COMPLETED' : 'FAILED';
        updateStatus(record, validationState, record.error);
        save();
        return record;
      }

      // 6. COMPLETED
      updateStatus(record, 'COMPLETED', 'All execution steps completed and verified successfully');
      save();
      return record;
    },

    /**
     * Cancels an active or waiting task.
     */
    cancelTask(taskId, { reason = 'Cancelled by user' } = {}) {
      load();
      const record = tasks.get(taskId);
      if (!record) throw new Error(`Task '${taskId}' not found`);

      if (['COMPLETED', 'FAILED', 'CANCELLED', 'PARTIALLY_COMPLETED'].includes(record.status)) {
        return { ok: false, error: `Task '${taskId}' is already in terminal state '${record.status}'` };
      }

      updateStatus(record, 'CANCELLED', reason);
      save();
      return { ok: true, task: record };
    },

    /**
     * Retries a failed or blocked task.
     */
    /**
     * Retries a failed or cancelled task.
     */
    async retryTask(taskId) {
      load();
      const record = tasks.get(taskId);
      if (!record) throw new Error(`Task '${taskId}' not found`);

      if (!['FAILED', 'BLOCKED', 'CANCELLED', 'PARTIALLY_COMPLETED'].includes(record.status)) {
        throw new Error(`Cannot retry task in state '${record.status}'`);
      }

      addTraceEvent(record, 'RETRY_INITIATED', 'Retrying task execution from beginning');
      record.error = null;
      record.execution_results.completed_steps = 0;
      if (record.execution_plan) {
        for (const s of record.execution_plan.steps) {
          s.status = 'pending';
        }
      }

      // If plan requires human approval and has not been approved, transition to AWAITING_APPROVAL
      if (record.approval?.required && !record.approval?.approved) {
        updateStatus(record, 'AWAITING_APPROVAL', 'Retrying plan awaiting user approval');
        return record;
      }

      updateStatus(record, 'READY', 'Retrying plan');
      return this.executePlan(taskId);
    },

    /**
     * Responds to a task in NEEDS_USER_INPUT state with the requested clarification or input,
     * allowing the task to resume planning and execution.
     */
    async provideUserInput(taskId, { input, user = 'user' } = {}) {
      load();
      const record = tasks.get(taskId);
      if (!record) throw new Error(`Task '${taskId}' not found`);

      if (record.status !== 'NEEDS_USER_INPUT') {
        throw new Error(`Task '${taskId}' is in state '${record.status}', not 'NEEDS_USER_INPUT'`);
      }

      if (!input || typeof input !== 'string') {
        throw new Error('Valid string input is required to resume task');
      }

      record.user_input = input;
      addTraceEvent(record, 'USER_INPUT_PROVIDED', `User provided input: "${input}" by ${user}`, { input, user });

      // Merge input into request and re-analyze
      const enrichedRequest = `${record.original_request}\n[Clarification]: ${input}`;
      updateStatus(record, 'ANALYZING', 'Re-analyzing with provided user clarification');
      const spec = analyzer.analyzeTask(enrichedRequest);
      record.task_spec = spec;

      // Re-run matching, planning, and resume execution flow
      updateStatus(record, 'MATCHING');
      const matchResult = matcher.matchTools(spec);
      record.matched_tools = matchResult.ranked_candidates;
      record.rejected_tools = matchResult.rejected_candidates;

      const targetAgentId = record.target_agent || null;
      let agentResult;
      if (targetAgentId) {
        agentResult = {
          selected_agent: { agent_id: targetAgentId, name: targetAgentId === 'claude-code' ? 'Claude Code' : targetAgentId },
          explanation: `Explicitly selected target agent: '${targetAgentId}' by user request`,
          ranked_agents: [{ agent_id: targetAgentId, score: 1.0 }],
          rejected_agents: [],
        };
      } else {
        agentResult = selector.selectAgent(spec, matchResult.ranked_candidates);
      }
      record.selected_agent = agentResult.selected_agent;

      updateStatus(record, 'PLANNING');
      const plan = planner.generatePlan({
        taskSpec: spec,
        selectedAgent: agentResult.selected_agent,
        matchedTools: matchResult.ranked_candidates,
      });
      record.execution_plan = plan;
      record.execution_results.total_steps = plan.steps.length;
      if (record.require_approval) {
        plan.requires_human_approval = true;
      }
      record.approval.required = plan.requires_human_approval;

      if (plan.requires_human_approval) {
        updateStatus(record, 'AWAITING_APPROVAL', 'Human approval required after clarification');
        save();
        return record;
      }

      record.approval.approved = true;
      record.approval.approved_at = new Date().toISOString();
      record.approval.approved_by = 'system_auto_policy';
      updateStatus(record, 'READY', 'Plan ready after clarification');
      return this.executePlan(taskId);
    },

    /**
     * Gets a single task record.
     */
    getTask(taskId) {
      load();
      return tasks.get(taskId) || null;
    },

    /**
     * Gets the full execution trace for a task with secret redaction.
     */
    getTaskTrace(taskId) {
      load();
      const record = tasks.get(taskId);
      if (!record) return null;

      const rawTrace = {
        task_id: record.task_id,
        status: record.status,
        original_request: record.original_request,
        created_at: record.created_at,
        updated_at: record.updated_at,
        task_spec: record.task_spec,
        selected_agent: record.selected_agent,
        execution_plan: record.execution_plan,
        approval: record.approval,
        execution_results: record.execution_results,
        error: record.error,
        events: record.trace,
      };

      if (policyEngine) {
        return JSON.parse(policyEngine.redactSensitiveOutput(JSON.stringify(rawTrace)));
      }
      return rawTrace;
    },

    /**
     * Lists tasks with optional filtering.
     */
    listTasks({ status = null, limit = 50 } = {}) {
      load();
      let list = Array.from(tasks.values()).reverse();
      if (status) {
        list = list.filter((t) => t.status === status);
      }
      return list.slice(0, limit);
    },

    /**
     * Testing helper to reset state.
     */
    _resetForTesting() {
      tasks.clear();
      if (fs.existsSync(store)) {
        try { fs.unlinkSync(store); } catch {}
      }
      if (fs.existsSync(lockPath)) {
        try { fs.unlinkSync(lockPath); } catch {}
      }
    },

    /**
     * Regenerates an execution plan for an existing task.
     * Invalidates any prior approval, increments plan version, computes new plan hash,
     * re-analyzes with current analyzer/selector/planner rules, and updates trace history.
     */
    async regenerateTaskPlan(taskId, { reason = 'Plan regeneration requested' } = {}) {
      load();
      const record = tasks.get(taskId);
      if (!record) throw new Error(`Task '${taskId}' not found`);

      if (record.status === 'RUNNING' || record.status === 'COMPLETED') {
        throw new Error(`Cannot regenerate plan for task in status '${record.status}'`);
      }

      const priorPlan = record.execution_plan;
      const priorApproval = { ...record.approval };
      const newVersion = (priorPlan?.plan_version || 1) + 1;

      // Invalidate prior approval
      record.approval = {
        required: true,
        approved: false,
        approved_at: null,
        approved_by: null,
        invalidated_previous_approval: priorApproval.approved ? priorApproval : null,
      };

      addTraceEvent(record, 'APPROVAL_INVALIDATED', `Previous approval invalidated for plan regeneration: ${reason}`, {
        prior_plan_version: priorPlan?.plan_version,
        prior_plan_hash: priorPlan?.plan_hash,
      });

      // Re-analyze
      updateStatus(record, 'ANALYZING', 'Re-analyzing task with updated classifier');
      const spec = analyzer.analyzeTask(record.original_request);
      record.task_spec = spec;

      // Re-match
      updateStatus(record, 'MATCHING', 'Re-matching tools');
      const matchResult = matcher.matchTools(spec);
      record.matched_tools = matchResult.ranked_candidates;
      record.rejected_tools = matchResult.rejected_candidates;

      // Re-select agent
      const targetAgentId = record.target_agent || null;
      let agentResult;
      if (targetAgentId) {
        agentResult = {
          selected_agent: { agent_id: targetAgentId, name: targetAgentId === 'claude-code' ? 'Claude Code' : targetAgentId },
          explanation: `Explicitly selected target agent: '${targetAgentId}' by user request`,
          ranked_agents: [{ agent_id: targetAgentId, score: 1.0 }],
          rejected_agents: [],
        };
      } else {
        agentResult = selector.selectAgent(spec, matchResult.ranked_candidates);
      }
      record.selected_agent = agentResult.selected_agent;

      // Re-generate plan
      updateStatus(record, 'PLANNING', 'Re-generating execution DAG');
      const newPlan = planner.generatePlan({
        taskSpec: spec,
        selectedAgent: agentResult.selected_agent,
        matchedTools: matchResult.ranked_candidates,
        fallbackTools: matchResult.ranked_candidates.length > 1 ? matchResult.ranked_candidates.slice(1) : [],
        planVersion: newVersion,
      });

      record.execution_plan = newPlan;
      record.execution_results.total_steps = newPlan.steps.length;
      record.execution_results.completed_steps = 0;
      record.approval.required = newPlan.requires_human_approval;

      addTraceEvent(record, 'PLAN_REGENERATED', `Plan regenerated to v${newVersion} with ${newPlan.steps.length} steps (hash: ${newPlan.plan_hash ? newPlan.plan_hash.slice(0, 12) : 'none'})`, {
        plan_id: newPlan.plan_id,
        plan_version: newPlan.plan_version,
        plan_hash: newPlan.plan_hash,
        task_type: newPlan.task_type,
        steps: newPlan.steps.map((s) => ({ id: s.step_id, permissions: s.required_permissions })),
      });

      updateStatus(record, 'AWAITING_APPROVAL', 'Regenerated plan awaiting user review and explicit approval');
      save();
      return record;
    },
  };
}
