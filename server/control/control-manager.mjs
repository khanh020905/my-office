/**
 * Agent Control Center Execution & Session Manager (Master Task Phase 2, 4, 5, 6).
 * Manages Agents, Sessions, Executions, Dispatches, and Controls with strict validation,
 * persistence, and bidirectional synchronization with Activity Center's TaskAggregator.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const EXECUTION_STATUSES = [
  'queued',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'cancelled',
];

export function createControlManager({
  capabilityRegistry,
  taskAggregator,
  tasksRunner = null,   // Claude tasks manager (server/tasks.mjs)
  codexRuns = null,     // Codex CLI runs manager (server/codex-runs.mjs)
  sessionsMap = null,   // Live office sessions map
  storePath = null,
  knownDirs = [],
} = {}) {
  const executions = new Map(); // executionId -> ExecutionRecord
  const sessions = new Map();   // sessionId -> SessionRecord

  function load() {
    if (!storePath || !fs.existsSync(storePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      if (Array.isArray(data.executions)) {
        for (const ex of data.executions) executions.set(ex.executionId, ex);
      }
      if (Array.isArray(data.sessions)) {
        for (const s of data.sessions) sessions.set(s.sessionId, s);
      }
    } catch {
      // retain in-memory state
    }
  }

  function persist() {
    if (!storePath) return;
    try {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      const tmp = `${storePath}.tmp-${process.pid}`;
      const payload = {
        version: 1,
        savedAt: Date.now(),
        executions: Array.from(executions.values()).slice(-200),
        sessions: Array.from(sessions.values()).slice(-200),
      };
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, storePath);
    } catch {
      // keep in-memory
    }
  }

  load();

  /**
   * Dispatches a new task execution to a supported provider.
   */
  async function dispatchTask({
    agentId,
    workingDirectory,
    instruction,
    sessionId = null,
    expectedArtifacts = [],
    env = {},
  }) {
    void env;
    // 1. Check operation allowance in Capability Registry
    const opCheck = capabilityRegistry.isOperationAllowed(agentId, 'start');
    if (!opCheck.allowed) {
      throw new Error(`Agent '${agentId}' cannot start tasks: ${opCheck.reason}`);
    }

    // 2. Validate working directory (security check against knownDirs)
    const normDir = path.resolve(workingDirectory || process.cwd());
    if (!fs.existsSync(normDir) || !fs.statSync(normDir).isDirectory()) {
      throw new Error(`Working directory does not exist: ${normDir}`);
    }

    if (knownDirs.length > 0) {
      const isAllowed = knownDirs.some((kd) => {
        const root = path.resolve(kd);
        return normDir === root || normDir.startsWith(root + path.sep);
      });
      if (!isAllowed) {
        throw new Error(`Working directory is outside authorized project roots: ${normDir}`);
      }
    }

    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      throw new Error('Instruction text is required and cannot be empty.');
    }

    const trimmedText = instruction.trim();
    const executionId = `exec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const resolvedSessionId = sessionId || `sess-${agentId}-${Date.now()}`;
    const projectId = path.basename(normDir);

    let providerResult = null;
    let providerRunId = null;

    // 3. Dispatch through underlying provider runner
    if (agentId === 'claude-code') {
      if (!tasksRunner) {
        throw new Error('Claude Code tasks runner is not available on server.');
      }
      const r = tasksRunner.start({
        dir: normDir,
        text: trimmedText,
        system: '',
      });
      if (!r.ok) {
        throw new Error(`Claude Code failed to start task: ${r.code || 'unknown'}`);
      }
      providerResult = r;
      providerRunId = r.task?.id || executionId;
    } else if (agentId === 'codex-cli') {
      if (!codexRuns) {
        throw new Error('Codex CLI runner is not available on server.');
      }
      const r = await codexRuns.start({
        dir: normDir,
        text: trimmedText,
        expectedArtifacts,
      });
      if (!r.ok) {
        throw new Error(`Codex CLI failed to start run: ${r.error || r.message || 'unknown'}`);
      }
      providerResult = r;
      providerRunId = r.id || executionId;
    } else {
      throw new Error(`Provider '${agentId}' does not support direct automated task dispatch.`);
    }

    // 4. Create authoritative Execution Record
    const executionRecord = {
      executionId,
      taskId: providerRunId, // Bound to TaskAggregator taskId
      sessionId: resolvedSessionId,
      agentId,
      provider: agentId,
      projectId,
      workingDirectory: normDir,
      instruction: trimmedText,
      status: 'running',
      createdAt: Date.now(),
      startedAt: Date.now(),
      completedAt: null,
      result: null,
      error: null,
      retryOf: null,
      expectedArtifacts,
      providerRunId,
    };

    executions.set(executionId, executionRecord);

    // 5. Update Session Record
    let sessionRecord = sessions.get(resolvedSessionId);
    if (!sessionRecord) {
      sessionRecord = {
        sessionId: resolvedSessionId,
        agentId,
        provider: agentId,
        projectId,
        workingDirectory: normDir,
        status: 'working',
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
        activeExecutionId: executionId,
        executionIds: [executionId],
      };
    } else {
      sessionRecord.status = 'working';
      sessionRecord.lastActivityAt = Date.now();
      sessionRecord.activeExecutionId = executionId;
      sessionRecord.executionIds = Array.from(new Set([...sessionRecord.executionIds, executionId]));
    }
    sessions.set(resolvedSessionId, sessionRecord);

    // 6. Notify Activity Center TaskAggregator
    if (taskAggregator?.ingest) {
      taskAggregator.ingest({
        id: `ev-disp-${Date.now()}`,
        taskId: providerRunId,
        sess: resolvedSessionId,
        provider: agentId,
        type: 'prompt',
        label: trimmedText,
        projectId,
        dir: normDir,
        ts: Date.now(),
      });
    }

    persist();
    return { execution: executionRecord, session: sessionRecord, providerResult };
  }

  /**
   * Sends a follow-up instruction to an active session.
   */
  async function sendFollowUp(sessionId, text) {
    const s = sessions.get(sessionId);
    if (!s) throw new Error(`Session '${sessionId}' not found.`);

    const agentId = s.agentId || s.provider;
    const opCheck = capabilityRegistry.isOperationAllowed(agentId, 'steer');
    if (!opCheck.allowed) {
      throw new Error(`Agent '${agentId}' does not support mid-session follow-up instructions: ${opCheck.reason}`);
    }

    const trimmed = (text || '').trim();
    if (!trimmed) throw new Error('Follow-up instruction cannot be empty.');

    // Look up live execution
    const activeExec = s.activeExecutionId ? executions.get(s.activeExecutionId) : null;
    const targetTaskId = activeExec?.taskId || s.sessionId;

    if (taskAggregator?.ingest) {
      taskAggregator.ingest({
        id: `ev-steer-${Date.now()}`,
        taskId: targetTaskId,
        sess: sessionId,
        provider: agentId,
        type: 'prompt',
        label: `Follow-up: ${trimmed}`,
        ts: Date.now(),
      });
    }

    s.lastActivityAt = Date.now();
    persist();

    return { ok: true, sessionId, message: 'Follow-up instruction dispatched to active session.' };
  }

  /**
   * Cancels a running execution.
   */
  async function cancelExecution(executionId, reason = 'Cancelled by user') {
    const exec = executions.get(executionId);
    if (!exec) throw new Error(`Execution '${executionId}' not found.`);

    const agentId = exec.agentId;
    const opCheck = capabilityRegistry.isOperationAllowed(agentId, 'cancel');
    if (!opCheck.allowed) {
      throw new Error(`Agent '${agentId}' does not support execution cancellation: ${opCheck.reason}`);
    }

    if (exec.status !== 'running' && exec.status !== 'queued' && exec.status !== 'waiting') {
      return { ok: false, message: `Execution is already in terminal state: ${exec.status}` };
    }

    // Call underlying runner cancellation
    let cancelled = false;
    if (agentId === 'claude-code' && tasksRunner) {
      cancelled = tasksRunner.stop(exec.providerRunId || exec.taskId);
    } else if (agentId === 'codex-cli' && codexRuns) {
      cancelled = codexRuns.stop(exec.providerRunId || exec.taskId);
    }

    exec.status = 'cancelled';
    exec.completedAt = Date.now();
    exec.error = reason;

    // Update session state
    const s = sessions.get(exec.sessionId);
    if (s && s.activeExecutionId === executionId) {
      s.status = 'idle';
      s.activeExecutionId = null;
      s.lastActivityAt = Date.now();
    }

    // Synchronize to TaskAggregator
    if (taskAggregator?.ingest) {
      taskAggregator.ingest({
        id: `ev-cancel-${Date.now()}`,
        taskId: exec.taskId,
        sess: exec.sessionId,
        provider: agentId,
        type: 'stop',
        label: `Execution cancelled: ${reason}`,
        ts: Date.now(),
      });
    }

    persist();
    return { ok: true, executionId, cancelled, status: 'cancelled' };
  }

  /**
   * Retries a failed or cancelled execution.
   */
  async function retryExecution(executionId) {
    const orig = executions.get(executionId);
    if (!orig) throw new Error(`Execution '${executionId}' not found.`);

    const agentId = orig.agentId;
    const opCheck = capabilityRegistry.isOperationAllowed(agentId, 'retry');
    if (!opCheck.allowed) {
      throw new Error(`Agent '${agentId}' does not support task retrying: ${opCheck.reason}`);
    }

    // Create a new execution attempt linked to original
    const newExec = await dispatchTask({
      agentId: orig.agentId,
      workingDirectory: orig.workingDirectory,
      instruction: orig.instruction,
      sessionId: orig.sessionId,
      expectedArtifacts: orig.expectedArtifacts,
    });

    newExec.execution.retryOf = orig.executionId;
    persist();

    return newExec;
  }

  function getExecution(executionId) {
    const ex = executions.get(executionId);
    if (!ex) return null;
    // Correlate with TaskAggregator live task if available
    const liveTask = taskAggregator?.getTask ? taskAggregator.getTask(ex.taskId) : null;
    return {
      ...ex,
      liveTask: liveTask || null,
    };
  }

  function listExecutions({ agentId = null, sessionId = null, status = null, limit = 50 } = {}) {
    let list = Array.from(executions.values());
    if (agentId) list = list.filter((e) => e.agentId === agentId);
    if (sessionId) list = list.filter((e) => e.sessionId === sessionId);
    if (status) list = list.filter((e) => e.status === status);
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return list.slice(0, limit).map((e) => {
      const live = taskAggregator?.getTask ? taskAggregator.getTask(e.taskId) : null;
      return { ...e, liveTask: live || null };
    });
  }

  function getSession(sessionId) {
    const s = sessions.get(sessionId);
    if (!s) return null;
    const sessionExecs = (s.executionIds || []).map((id) => executions.get(id)).filter(Boolean);
    return { ...s, executions: sessionExecs };
  }

  function listSessions({ agentId = null, status = null, limit = 50 } = {}) {
    // Merge persisted sessions with any live sessions from sessionsMap
    const merged = new Map(sessions);
    if (sessionsMap && typeof sessionsMap.values === 'function') {
      for (const ls of sessionsMap.values()) {
        if (!ls || !ls.id) continue;
        const sid = ls.sid || ls.id;
        const agent = ls.agent || (ls.provider === 'codex' ? 'codex-app' : 'claude-code');
        if (!merged.has(sid)) {
          merged.set(sid, {
            sessionId: sid,
            agentId: agent,
            provider: agent,
            projectId: ls.name || path.basename(ls.cwd || ''),
            workingDirectory: ls.cwd || '',
            status: ls.status === 'work' ? 'working' : ls.status === 'wait' ? 'waiting' : 'idle',
            startedAt: ls.lastAt || Date.now(),
            lastActivityAt: ls.lastAt || Date.now(),
            activeExecutionId: null,
            executionIds: [],
          });
        }
      }
    }

    let list = Array.from(merged.values());
    if (agentId) list = list.filter((s) => s.agentId === agentId || s.provider === agentId);
    if (status) list = list.filter((s) => s.status === status);
    list.sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));
    return list.slice(0, limit);
  }

  return {
    dispatchTask,
    sendFollowUp,
    cancelExecution,
    retryExecution,
    getExecution,
    listExecutions,
    getSession,
    listSessions,
  };
}
