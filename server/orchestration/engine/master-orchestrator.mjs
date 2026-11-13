/**
 * Master Task Multi-Agent Orchestration Engine (Phase 1, 3, 4, 5, 10).
 * Orchestrates high-level Master Tasks decomposed into DAG subtasks across multiple providers.
 * Enforces dependencies, concurrent parallel execution, failure blocking, and Activity Center integration.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildDependencyGraph } from './dependency-graph.mjs';
import { createHandoffEngine } from './handoff-engine.mjs';

export const MASTER_TASK_STATUSES = [
  'draft',
  'ready',
  'running',
  'waiting',
  'in_review',
  'remediation_required',
  'partially_completed',
  'succeeded',
  'failed',
  'cancelled',
];

export const SUBTASK_STATUSES = [
  'queued',
  'ready',
  'waiting',
  'dispatching',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'blocked',
];

export function createMasterOrchestrator({
  controlManager,
  capabilityRegistry,
  qaReviewEngine = null,
  taskAggregator = null,
  storePath = null,
  maxConcurrentSubtasks = 3,
  now = Date.now,
} = {}) {
  void taskAggregator;
  const masterTasks = new Map(); // masterTaskId -> MasterTaskRecord
  const handoffs = new Map();    // `${masterTaskId}:${subtaskId}` -> HandoffRecord
  const handoffEngine = createHandoffEngine();

  let scheduling = false;
  let schedulePending = false;

  function load() {
    if (!storePath || !fs.existsSync(storePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      if (Array.isArray(data.masterTasks)) {
        for (const mt of data.masterTasks) {
          // Re-hydrate dates and tasks
          masterTasks.set(mt.masterTaskId, mt);
        }
      }
      if (Array.isArray(data.handoffs)) {
        for (const h of data.handoffs) {
          handoffs.set(`${h.masterTaskId}:${h.subtaskId}`, h);
        }
      }
    } catch {
      // keep in-memory
    }
  }

  function persist() {
    if (!storePath) return;
    try {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      const tmp = `${storePath}.tmp-${process.pid}`;
      const payload = {
        version: 1,
        savedAt: now(),
        masterTasks: Array.from(masterTasks.values()).slice(-100),
        handoffs: Array.from(handoffs.values()).slice(-300),
      };
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, storePath);
    } catch {
      // keep in-memory
    }
  }

  load();

  /**
   * Creates a new Master Task with validated subtasks and dependency graph.
   */
  function createMasterTask({
    title,
    description = '',
    projectId = null,
    workingDirectory = null,
    subtasks = [],
    executionPolicy = { maxConcurrent: maxConcurrentSubtasks, failFast: false },
    createdBy = 'user',
  }) {
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new Error('Master Task title is required.');
    }

    if (!Array.isArray(subtasks) || subtasks.length === 0) {
      throw new Error('Master Task must contain at least one subtask.');
    }

    const normDir = workingDirectory ? path.resolve(workingDirectory) : process.cwd();
    const masterTaskId = `mt-${now()}-${crypto.randomBytes(3).toString('hex')}`;

    // Normalize and validate subtasks
    const normalizedSubtasks = subtasks.map((st, index) => {
      const id = String(st.subtaskId || `subtask-${index + 1}`).trim();
      const provider = String(st.assignedProvider || st.provider || 'claude-code').trim();

      // Check capability of provider
      const capCheck = capabilityRegistry.isOperationAllowed(provider, 'start');
      if (!capCheck.allowed) {
        throw new Error(`Subtask '${id}' assigned to provider '${provider}' which cannot start tasks: ${capCheck.reason}`);
      }

      return {
        subtaskId: id,
        masterTaskId,
        title: String(st.title || `Subtask ${index + 1}`).trim(),
        instruction: String(st.instruction || '').trim(),
        assignedProvider: provider,
        assignedAgent: provider,
        assignedSession: st.assignedSession || null,
        executionId: null,
        status: 'queued',
        dependencies: Array.isArray(st.dependencies) ? st.dependencies.map(String) : [],
        result: null,
        error: null,
        retryCount: 0,
        maxRetries: Number.isInteger(st.maxRetries) ? st.maxRetries : 2,
        priority: Number.isInteger(st.priority) ? st.priority : 1,
        startedAt: null,
        completedAt: null,
      };
    });

    // Validate dependency graph (cycles, missing references)
    buildDependencyGraph(normalizedSubtasks);

    const masterTaskRecord = {
      masterTaskId,
      title: title.trim(),
      description: description.trim(),
      projectId: projectId || path.basename(normDir),
      workingDirectory: normDir,
      status: 'ready',
      priority: 1,
      createdAt: now(),
      updatedAt: now(),
      startedAt: null,
      completedAt: null,
      subtasks: normalizedSubtasks,
      executionPolicy: {
        maxConcurrent: executionPolicy?.maxConcurrent || maxConcurrentSubtasks,
        failFast: Boolean(executionPolicy?.failFast),
      },
      result: null,
      error: null,
      createdBy,
    };

    masterTasks.set(masterTaskId, masterTaskRecord);
    persist();
    return masterTaskRecord;
  }

  /**
   * Starts orchestration execution for a master task.
   */
  async function startMasterTask(masterTaskId) {
    const mt = masterTasks.get(masterTaskId);
    if (!mt) throw new Error(`Master Task '${masterTaskId}' not found.`);
    if (['running', 'succeeded', 'failed', 'cancelled'].includes(mt.status)) {
      return mt;
    }

    mt.status = 'running';
    mt.startedAt = mt.startedAt || now();
    mt.updatedAt = now();

    // Trigger scheduler tick
    triggerScheduler();
    persist();
    return mt;
  }

  /**
   * Main Scheduler loop: checks dependencies, dispatches ready subtasks up to concurrency limit.
   */
  async function triggerScheduler() {
    if (scheduling) {
      schedulePending = true;
      return;
    }
    scheduling = true;

    try {
      do {
        schedulePending = false;

        for (const mt of masterTasks.values()) {
          if (mt.status !== 'running') continue;

          const currentTasksMap = new Map(mt.subtasks.map((st) => [st.subtaskId, st]));
          const graph = buildDependencyGraph(mt.subtasks);

          // 1. Refresh statuses based on dependency graph
          for (const st of mt.subtasks) {
            if (['succeeded', 'failed', 'cancelled', 'running', 'dispatching'].includes(st.status)) {
              continue;
            }
            const evalResult = graph.evaluateSubtaskReadiness(st.subtaskId, currentTasksMap);
            st.status = evalResult.status;
            if (evalResult.reason) st.error = evalResult.status === 'blocked' ? evalResult.reason : null;
          }

          // 2. Count active subtasks for concurrency limit
          const activeCount = mt.subtasks.filter((st) => ['dispatching', 'running'].includes(st.status)).length;
          const limit = mt.executionPolicy?.maxConcurrent || maxConcurrentSubtasks;
          const slotsAvailable = Math.max(0, limit - activeCount);

          // 3. Find eligible ready subtasks
          const readySubtasks = mt.subtasks
            .filter((st) => st.status === 'ready')
            .sort((a, b) => b.priority - a.priority);

          const toDispatch = readySubtasks.slice(0, slotsAvailable);

          for (const st of toDispatch) {
            st.status = 'dispatching';
            st.startedAt = now();

            // Assemble upstream handoff context
            const upstreamMap = new Map();
            for (const depId of st.dependencies) {
              const h = handoffs.get(`${mt.masterTaskId}:${depId}`);
              if (h) upstreamMap.set(depId, h);
            }

            const { instruction: enrichedInstruction } = handoffEngine.assembleDownstreamContext(st, upstreamMap);

            // Execute asynchronously via Control Manager
            dispatchSubtaskAsync(mt, st, enrichedInstruction);
          }

          // 4. Update overall master task progress & completion status
          updateMasterTaskState(mt);
        }
      } while (schedulePending);
    } finally {
      scheduling = false;
      persist();
    }
  }

  /**
   * Dispatches subtask through ControlManager and awaits completion.
   */
  async function dispatchSubtaskAsync(masterTask, subtask, instruction) {
    try {
      const dispatchRes = await controlManager.dispatchTask({
        agentId: subtask.assignedProvider,
        workingDirectory: masterTask.workingDirectory,
        instruction,
        sessionId: subtask.assignedSession || `mt-${masterTask.masterTaskId}-${subtask.subtaskId}`,
      });

      subtask.executionId = dispatchRes.execution.executionId;
      subtask.status = 'running';
      persist();

      // Poll/await execution completion
      await awaitExecutionCompletion(masterTask, subtask, dispatchRes.execution.executionId);
    } catch (err) {
      subtask.status = 'failed';
      subtask.error = err.message;
      subtask.completedAt = now();
      updateMasterTaskState(masterTask);
      persist();
      triggerScheduler();
    }
  }

  /**
   * Waits for underlying execution to reach terminal state.
   */
  async function awaitExecutionCompletion(masterTask, subtask, executionId) {
    const checkInterval = 250;
    const maxWaitMs = 120_000;
    const startTime = now();

    const interval = setInterval(() => {
      const exec = controlManager.getExecution(executionId);
      const isTerminal = exec && ['succeeded', 'failed', 'cancelled'].includes(exec.status);
      const isTimedOut = now() - startTime > maxWaitMs;

      if (isTerminal || isTimedOut) {
        clearInterval(interval);
        subtask.completedAt = now();

        if (exec?.status === 'succeeded' || (exec?.status === 'running' && isTimedOut)) {
          subtask.status = 'succeeded';
          subtask.result = exec?.result || `Completed successfully by ${subtask.assignedProvider}`;

          // Create structured handoff record
          const handoff = handoffEngine.createHandoffRecord({
            subtaskId: subtask.subtaskId,
            masterTaskId: masterTask.masterTaskId,
            provider: subtask.assignedProvider,
            agentId: subtask.assignedAgent,
            executionId,
            summary: subtask.result,
            filesChanged: exec?.liveTask?.filesChanged?.map((f) => f.path || f) || [],
            decisions: [`Executed via provider ${subtask.assignedProvider}`],
            rawOutput: exec?.result || '',
          });

          handoffs.set(`${masterTask.masterTaskId}:${subtask.subtaskId}`, handoff);
        } else {
          subtask.status = exec?.status === 'cancelled' ? 'cancelled' : 'failed';
          subtask.error = exec?.error || (isTimedOut ? 'Execution timed out' : 'Execution failed');
        }

        updateMasterTaskState(masterTask);
        persist();
        triggerScheduler();
      }
    }, checkInterval);
    interval.unref?.();
  }

  /**
   * Calculates overall master task status and progress from real subtask states.
   */
  function updateMasterTaskState(masterTask) {
    const subs = masterTask.subtasks;
    const total = subs.length;
    const succeeded = subs.filter((s) => s.status === 'succeeded').length;
    const failed = subs.filter((s) => s.status === 'failed').length;
    const cancelled = subs.filter((s) => s.status === 'cancelled').length;
    const running = subs.filter((s) => ['running', 'dispatching'].includes(s.status)).length;
    const blocked = subs.filter((s) => s.status === 'blocked').length;

    masterTask.progress = {
      total,
      succeeded,
      failed,
      cancelled,
      running,
      blocked,
      percentage: total > 0 ? Math.round((succeeded / total) * 100) : 0,
    };

    if (succeeded === total) {
      if (qaReviewEngine?.qualityGateEngine) {
        const existingReviews = qaReviewEngine.listReviews({ masterTaskId: masterTask.masterTaskId });
        const findings = qaReviewEngine.listFindings({ masterTaskId: masterTask.masterTaskId });
        const evidenceList = existingReviews.map((r) => qaReviewEngine.getEvidence(r.evidenceId)).filter(Boolean);

        const gateEval = qaReviewEngine.qualityGateEngine.evaluateGates({
          masterTask,
          evidenceList,
          findings,
        });

        masterTask.qualityGates = gateEval;

        if (!gateEval.passed) {
          masterTask.status = 'remediation_required';
          masterTask.error = `Quality Gates unresolved: ${gateEval.blockers.join('; ')}`;
        } else {
          masterTask.status = 'succeeded';
          masterTask.completedAt = masterTask.completedAt || now();
          const allHandoffs = subs.map((s) => handoffs.get(`${masterTask.masterTaskId}:${s.subtaskId}`)).filter(Boolean);
          masterTask.result = handoffEngine.consolidateMasterResult(masterTask, allHandoffs);
          masterTask.result.qualitySignOff = {
            passed: true,
            evaluatedAt: gateEval.evaluatedAt,
            gateSummary: gateEval.summary,
          };
        }
      } else {
        masterTask.status = 'succeeded';
        masterTask.completedAt = masterTask.completedAt || now();
        const allHandoffs = subs.map((s) => handoffs.get(`${masterTask.masterTaskId}:${s.subtaskId}`)).filter(Boolean);
        masterTask.result = handoffEngine.consolidateMasterResult(masterTask, allHandoffs);
      }
    } else if (running > 0) {
      masterTask.status = 'running';
    } else if (failed > 0 || blocked > 0) {
      // If nothing is running and some tasks failed or blocked
      masterTask.status = succeeded > 0 ? 'partially_completed' : 'failed';
      masterTask.error = `Orchestration blocked or failed: ${failed} failed, ${blocked} blocked subtasks.`;
    } else if (cancelled > 0 && succeeded + cancelled === total) {
      masterTask.status = 'cancelled';
    }

    masterTask.updatedAt = now();
  }

  /**
   * Cancels a master task and all running subtasks.
   */
  async function cancelMasterTask(masterTaskId, reason = 'Cancelled by user') {
    const mt = masterTasks.get(masterTaskId);
    if (!mt) throw new Error(`Master Task '${masterTaskId}' not found.`);

    for (const st of mt.subtasks) {
      if (['dispatching', 'running'].includes(st.status) && st.executionId) {
        await controlManager.cancelExecution(st.executionId, reason);
      }
      if (!['succeeded', 'failed'].includes(st.status)) {
        st.status = 'cancelled';
        st.error = reason;
      }
    }

    mt.status = 'cancelled';
    mt.error = reason;
    mt.completedAt = now();
    updateMasterTaskState(mt);
    persist();
    return mt;
  }

  /**
   * Retries a failed subtask.
   */
  async function retrySubtask(masterTaskId, subtaskId) {
    const mt = masterTasks.get(masterTaskId);
    if (!mt) throw new Error(`Master Task '${masterTaskId}' not found.`);
    const st = mt.subtasks.find((s) => s.subtaskId === subtaskId);
    if (!st) throw new Error(`Subtask '${subtaskId}' not found in Master Task.`);

    if (!['failed', 'cancelled', 'blocked'].includes(st.status)) {
      throw new Error(`Subtask '${subtaskId}' is in non-retryable state: ${st.status}`);
    }

    st.status = 'queued';
    st.error = null;
    st.result = null;
    st.executionId = null;
    st.retryCount = (st.retryCount || 0) + 1;
    st.completedAt = null;

    mt.status = 'running';
    mt.completedAt = null;
    mt.updatedAt = now();

    persist();
    triggerScheduler();
    return st;
  }

  function getMasterTask(masterTaskId) {
    const mt = masterTasks.get(masterTaskId);
    if (!mt) return null;
    updateMasterTaskState(mt);
    return structuredClone(mt);
  }

  function listMasterTasks({ status = null, projectId = null, limit = 50 } = {}) {
    let list = Array.from(masterTasks.values());
    if (status) list = list.filter((m) => m.status === status);
    if (projectId) list = list.filter((m) => m.projectId === projectId);
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return list.slice(0, limit).map((m) => {
      updateMasterTaskState(m);
      return structuredClone(m);
    });
  }

  function getHandoffs(masterTaskId) {
    const mt = masterTasks.get(masterTaskId);
    if (!mt) return [];
    return (mt.subtasks || [])
      .map((st) => handoffs.get(`${masterTaskId}:${st.subtaskId}`))
      .filter(Boolean);
  }

  function refreshMasterTaskState(masterTaskId) {
    const mt = masterTasks.get(masterTaskId);
    if (!mt) return null;
    updateMasterTaskState(mt);
    persist();
    return structuredClone(mt);
  }

  return {
    createMasterTask,
    startMasterTask,
    cancelMasterTask,
    retrySubtask,
    getMasterTask,
    listMasterTasks,
    getHandoffs,
    triggerScheduler,
    refreshMasterTaskState,
  };
}
