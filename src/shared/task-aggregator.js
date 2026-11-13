// Task-Centric Execution & Intelligent Event Aggregation Engine (Section 3 & 4)
// Aggregates raw office events into coherent, task-centric entities with truthful progress tracking.

export const TASK_STATUSES = [
  'queued',
  'running',
  'waiting',
  'succeeded',
  'failed',
  'cancelled',
  'stale',
  'unknown',
];

export const PROGRESS_MODES = ['quantitative', 'phase', 'activity_only'];

export const DEFAULT_STALE_MS = 10 * 60e3; // 10 minutes

export const PHASE_ORDER = ['Analyzing', 'Planning', 'Editing', 'Executing', 'Testing', 'Reviewing', 'Completed'];

export function determinePhase(type, action) {
  const t = (type || '').toLowerCase();
  const a = (action || '').toLowerCase();

  if (['read', 'grep', 'glob', 'skill', 'read_file'].includes(t) || ['read'].includes(a)) return 'Analyzing';
  if (['prompt', 'codex_prompt', 'plan', 'think'].includes(t)) return 'Planning';
  if (['edit', 'write', 'create', 'delete', 'apply_patch'].includes(t) || ['edit', 'write', 'create', 'delete'].includes(a)) return 'Editing';
  if (['bash', 'cmd', 'command'].includes(t) || ['bash', 'cmd'].includes(a)) return 'Executing';
  if (['test', 'testok', 'testfail'].includes(t) || ['test'].includes(a)) return 'Testing';
  if (['wait', 'ask', 'reviewing', 'approval'].includes(t)) return 'Reviewing';
  if (['stop', 'codexexit', 'succeeded'].includes(t)) return 'Completed';
  return null;
}

export function createTaskAggregator({ staleMs = DEFAULT_STALE_MS, maxEvents = 10000, maxTasks = 1000 } = {}) {
  const tasks = new Map(); // taskId -> Task
  const seenEventIds = new Set();
  const eventOrder = [];
  // Lookup active taskId by session: sess -> taskId
  const activeTaskBySession = new Map();

  function makeStableEventKey(e) {
    if (e.id != null) return `ev:${e.id}`;
    if (e.provider && e.sess && (e.toolUseId || e.turnId)) {
      return `prov:${e.provider}:${e.sess}:${e.toolUseId || e.turnId}:${e.type}`;
    }
    return `raw:${e.sess}:${e.ts}:${e.type}:${e.label || ''}`;
  }

  function resolveTaskId(e) {
    // 1. Explicit task or run ID if provided
    if (e.taskId) return String(e.taskId);

    const provider = e.provider || (e.sess?.startsWith('codex:') ? 'codex-cli' : e.sess?.startsWith('antigravity:') ? 'antigravity' : 'claude-code');

    // 2. Codex CLI: one run = one task
    if (provider === 'codex-cli') {
      const runId = e.codexRun || (e.sess.startsWith('codex:') ? e.sess.slice(6) : e.sess);
      return `codex-cli:${runId}`;
    }

    // 3. Antigravity: coarse observation task
    if (provider === 'antigravity') {
      const obsId = e.sess?.startsWith('antigravity:') ? e.sess.slice(12) : (e.sess || 'observer');
      return `antigravity:${obsId}`;
    }

    // 4. Codex App
    if (provider === 'codex-app') {
      const sessionId = e.sessionId || e.sess;
      if (e.type === 'codex_prompt' || e.event === 'UserPromptSubmit') {
        const turn = e.turnId || `turn-${e.id || e.ts}`;
        return `codex-app:${sessionId}:${turn}`;
      }
      if (e.turnId) {
        return `codex-app:${sessionId}:${e.turnId}`;
      }
      // Attach to active task for this Codex App session if one exists
      const existing = activeTaskBySession.get(`codex-app:${sessionId}`);
      if (existing) return existing;
      return `codex-app:${sessionId}:task-${e.id || e.ts}`;
    }

    // 5. Claude Code / default
    const sess = String(e.sess);
    const sessKey = `${provider}:${sess}`;
    const existing = activeTaskBySession.get(sessKey);
    if (existing) {
      const activeTask = tasks.get(existing);
      // If active task only had start/lifecycle events and no user prompt yet, evolve existing card
      if (e.type === 'prompt' && activeTask && (!activeTask.description || activeTask.title.endsWith('task') || activeTask.title === 'User task')) {
        return existing;
      }
    }
    if (e.type === 'prompt') {
      // New prompt starts a new task for this session
      return `${provider}:${sess}:task-${e.id || e.ts}`;
    }
    if (existing) return existing;
    return `${provider}:${sess}:task-${e.id || e.ts}`;
  }

  function computeProgress(task) {
    // A. Quantitative progress
    if (task.totalSteps != null && task.totalSteps > 0) {
      const completed = Math.max(0, task.completedSteps != null ? task.completedSteps : task.currentStep != null ? task.currentStep : 0);
      const pct = Math.min(100, Math.round((completed / task.totalSteps) * 100));
      return {
        mode: 'quantitative',
        percent: pct,
        phase: task.currentPhase,
        label: `${completed}/${task.totalSteps} (${pct}%)`,
      };
    }

    // C. Activity-only progress for Antigravity or coarse observation
    if (task.evidenceLevel === 'coarse_observation' || task.provider === 'antigravity') {
      return {
        mode: 'activity_only',
        percent: null,
        phase: null,
        label: task.status === 'stale' ? 'Stale observation' : 'Active (Coarse observations)',
      };
    }

    // B. Phase-based progress
    return {
      mode: 'phase',
      percent: null,
      phase: task.currentPhase || 'Running',
      label: task.currentPhase || (task.status === 'waiting' ? 'Waiting for approval' : 'Active'),
    };
  }

  function getProjectName(cwd, name) {
    if (cwd) {
      const parts = String(cwd).replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
    return name || 'unknown-project';
  }

  function ingest(e) {
    if (!e || typeof e !== 'object' || e.demo) return null;
    const evKey = makeStableEventKey(e);
    if (seenEventIds.has(evKey)) {
      // Idempotent: return existing task without inflating counters
      const taskId = resolveTaskId(e);
      return tasks.get(taskId) || null;
    }

    seenEventIds.add(evKey);
    eventOrder.push(evKey);
    if (eventOrder.length > maxEvents) {
      seenEventIds.delete(eventOrder.shift());
    }

    const provider = e.provider || (e.sess?.startsWith('codex:') ? 'codex-cli' : e.sess?.startsWith('antigravity:') ? 'antigravity' : 'claude-code');
    const taskId = resolveTaskId(e);
    const now = typeof e.ts === 'number' && Number.isFinite(e.ts) ? e.ts : Date.now();

    let task = tasks.get(taskId);
    const isNew = !task;

    if (isNew) {
      if (tasks.size >= maxTasks) {
        // Evict oldest completed task
        const doneTasks = [...tasks.values()].filter((t) => ['succeeded', 'failed', 'cancelled'].includes(t.status));
        const toEvict = doneTasks.sort((a, b) => a.updatedAt - b.updatedAt)[0];
        if (toEvict) tasks.delete(toEvict.taskId);
      }

      const proj = getProjectName(e.cwd, e.name);
      const isAntigravity = provider === 'antigravity';

      task = {
        taskId,
        runId: e.runId || e.codexRun || (provider === 'codex-cli' ? taskId.replace('codex-cli:', '') : null),
        agentId: e.agent ? `${e.sess}:${e.agent}` : String(e.sess || provider),
        provider,
        projectId: proj,
        conversationId: String(e.sess || e.sessionId || ''),
        title: e.label || (e.type === 'prompt' || e.type === 'codex_prompt' ? 'User task' : `${provider} task`),
        description: typeof e.full === 'string' ? e.full : typeof e.prompt === 'string' ? e.prompt : e.label || '',
        status: isAntigravity ? 'unknown' : 'running',
        currentPhase: isAntigravity ? null : 'Planning',
        currentStep: null,
        totalSteps: e.totalSteps != null ? Number(e.totalSteps) : null,
        completedSteps: e.completedSteps != null ? Number(e.completedSteps) : null,
        progress: null,
        startedAt: now,
        updatedAt: now,
        completedAt: null,
        lastEventAt: now,
        eventCount: 0,
        filesChanged: [],
        fileHistory: {},
        commandsExecuted: [],
        commandHistory: [],
        result: null,
        error: null,
        evidenceLevel: isAntigravity ? 'coarse_observation' : 'verified',
        events: [],
      };
      tasks.set(taskId, task);

      const sessKey = `${provider}:${e.sessionId || e.sess}`;
      activeTaskBySession.set(sessKey, taskId);
    }

    // Maintain chronological events inside the task
    task.events.push(e);
    task.events.sort((a, b) => (a.ts || 0) - (b.ts || 0) || (a.id || 0) - (b.id || 0));
    task.eventCount = task.events.length;
    task.lastEventAt = Math.max(task.lastEventAt, now);
    task.updatedAt = now;

    // Quantitative step information propagation
    if (e.totalSteps != null) task.totalSteps = Number(e.totalSteps);
    if (e.completedSteps != null) task.completedSteps = Number(e.completedSteps);
    if (e.currentStep != null) task.currentStep = Number(e.currentStep);

    // Track files
    if (Array.isArray(e.filePaths) && e.filePaths.length) {
      for (const p of e.filePaths) {
        if (typeof p === 'string' && p.trim()) {
          const norm = p.trim().replace(/\\/g, '/');
          if (!task.filesChanged.includes(norm)) task.filesChanged.push(norm);
          task.fileHistory[norm] ||= [];
          task.fileHistory[norm].push({ op: e.type, ts: now });
        }
      }
    } else if (e.file && typeof e.file === 'string') {
      const norm = e.file.trim().replace(/\\/g, '/');
      if (!task.filesChanged.includes(norm)) task.filesChanged.push(norm);
      task.fileHistory[norm] ||= [];
      task.fileHistory[norm].push({ op: e.type, ts: now });
    } else if (['edit', 'write', 'create', 'delete'].includes(e.type) && e.label) {
      const cleanPath = e.label.replace(/^[a-zA-Z]+:\s*/, '').trim().replace(/\\/g, '/');
      if (cleanPath && !cleanPath.includes(' ') && !cleanPath.includes('\n')) {
        if (!task.filesChanged.includes(cleanPath)) task.filesChanged.push(cleanPath);
        task.fileHistory[cleanPath] ||= [];
        task.fileHistory[cleanPath].push({ op: e.type, ts: now });
      }
    }

    // Track commands
    if (['bash', 'cmd', 'command'].includes(e.type) || e.runner) {
      const cmdStr = (e.command || e.label || e.runner || 'command').trim();
      if (cmdStr && !task.commandsExecuted.includes(cmdStr)) {
        task.commandsExecuted.push(cmdStr);
      }
      task.commandHistory.push({ cmd: cmdStr, ts: now, runner: e.runner, ok: e.type === 'testok' ? true : e.type === 'testfail' ? false : undefined });
    }

    // Phase determination
    const detectedPhase = determinePhase(e.type, e.action);
    if (detectedPhase && task.status !== 'succeeded' && task.status !== 'failed') {
      task.currentPhase = detectedPhase;
    }

    // Status transitions
    const t = e.type;
    if (t === 'prompt' || t === 'codex_prompt') {
      task.status = 'running';
      if (e.label) task.title = e.label;
      if (e.full) task.description = e.full;
    } else if (t === 'wait' || t === 'ask' || t === 'PermissionRequest') {
      task.status = 'waiting';
      task.error = e.label || 'Waiting for user input or approval';
    } else if (t === 'fail' || (t === 'testfail' && !e.agent)) {
      task.status = 'failed';
      task.error = e.label || 'Task execution failed';
      task.completedAt = now;
      activeTaskBySession.delete(`${provider}:${e.sessionId || e.sess}`);
    } else if (t === 'interrupt') {
      task.status = 'cancelled';
      task.error = e.label || 'Interrupted by user';
      task.completedAt = now;
      activeTaskBySession.delete(`${provider}:${e.sessionId || e.sess}`);
    } else if (t === 'stop' || t === 'codex_execution_end') {
      const isInterrupted = e.label && /interrupted/i.test(e.label);
      task.status = isInterrupted ? 'cancelled' : 'succeeded';
      task.completedAt = now;
      task.currentPhase = isInterrupted ? 'Cancelled' : 'Completed';
      task.result = e.label || 'Task completed successfully';
      activeTaskBySession.delete(`${provider}:${e.sessionId || e.sess}`);
    } else if (t === 'codex_execution_end') {
      if (e.outcome === 'failed') {
        task.status = 'failed';
        task.error = e.label || 'Codex execution failed';
      } else if (e.outcome === 'verified') {
        task.status = 'succeeded';
        task.result = e.label || 'Codex execution completed';
      } else {
        task.status = 'unknown'; // outcome unverified
        task.result = e.label || 'Execution ended; outcome unverified';
      }
      task.completedAt = now;
      activeTaskBySession.delete(`${provider}:${e.sessionId || e.sess}`);
    } else if (t === 'codexexit') {
      if (e.outcome === 'failed' || task.status === 'failed') {
        task.status = 'failed';
      } else if (e.outcome === 'verified') {
        task.status = 'succeeded';
      } else {
        task.status = 'unknown';
      }
      task.completedAt = now;
      activeTaskBySession.delete(`${provider}:${e.sessionId || e.sess}`);
    } else if (t === 'antigravity_observed') {
      task.evidenceLevel = 'coarse_observation';
      task.status = 'unknown';
      task.title = e.label || 'Antigravity activity observed; detailed events unavailable';
    } else {
      // Normal activity: if task was resting, waiting, or stale, resume running
      if (['waiting', 'stale'].includes(task.status) && ['testok', 'edit', 'write', 'bash', 'read', 'tool_use', 'tool_result'].includes(t)) {
        task.status = 'running';
        task.error = null;
      }
    }

    task.progress = computeProgress(task);
    return task;
  }

  function checkStale(now = Date.now()) {
    let changed = 0;
    for (const task of tasks.values()) {
      if (['running', 'waiting', 'unknown'].includes(task.status)) {
        if (now - task.lastEventAt > staleMs) {
          task.status = 'stale';
          task.progress = computeProgress(task);
          changed++;
        }
      }
    }
    return changed;
  }

  function getActiveTasks(now = Date.now()) {
    checkStale(now);
    return [...tasks.values()]
      .filter((t) => ['running', 'waiting', 'queued', 'stale', 'unknown'].includes(t.status))
      .sort((a, b) => (b.lastEventAt || 0) - (a.lastEventAt || 0));
  }

  function getHistoryTasks({
    limit = 20,
    offset = 0,
    provider = null,
    agentId = null,
    projectId = null,
    status = null,
    search = '',
    now = Date.now(),
  } = {}) {
    checkStale(now);
    let all = [...tasks.values()]
      .filter((t) => ['succeeded', 'failed', 'cancelled'].includes(t.status))
      .sort((a, b) => (b.completedAt || b.lastEventAt || 0) - (a.completedAt || a.lastEventAt || 0));

    if (provider) all = all.filter((t) => t.provider === provider);
    if (agentId) all = all.filter((t) => t.agentId === agentId || t.conversationId === agentId);
    if (projectId) all = all.filter((t) => t.projectId === projectId);
    if (status) all = all.filter((t) => t.status === status);
    if (search) {
      const q = search.toLowerCase();
      all = all.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.projectId.toLowerCase().includes(q) ||
        t.taskId.toLowerCase().includes(q)
      );
    }

    const total = all.length;
    const items = all.slice(offset, offset + limit);
    return {
      items,
      total,
      hasMore: offset + limit < total,
      offset,
      limit,
    };
  }

  function getStats(now = Date.now()) {
    checkStale(now);
    let active = 0, waiting = 0, completed = 0, failed = 0;
    for (const t of tasks.values()) {
      if (['running', 'queued', 'unknown', 'stale'].includes(t.status)) active++;
      else if (t.status === 'waiting') waiting++;
      else if (t.status === 'succeeded') completed++;
      else if (['failed', 'cancelled'].includes(t.status)) failed++;
    }
    return { active, waiting, completed, failed, totalTasks: tasks.size };
  }

  function load(events) {
    if (!Array.isArray(events)) return;
    const sorted = [...events].sort((a, b) => (a.ts || 0) - (b.ts || 0) || (a.id || 0) - (b.id || 0));
    for (const e of sorted) ingest(e);
  }

  function snapshot(now = Date.now()) {
    checkStale(now);
    return {
      activeTasks: getActiveTasks(now),
      history: getHistoryTasks({ limit: 50, now }),
      stats: getStats(now),
      totalTasks: tasks.size,
    };
  }

  function exportState() {
    return {
      version: 1,
      tasks: Array.from(tasks.values()),
      seenEventIds: Array.from(seenEventIds).slice(-10000),
      activeTaskBySession: Array.from(activeTaskBySession.entries()),
      timestamp: Date.now(),
    };
  }

  function registerImportedTask(t) {
    if (!t || !t.taskId) return;
    tasks.set(t.taskId, t);
    if (['running', 'waiting', 'queued', 'unknown', 'stale'].includes(t.status) && t.conversationId) {
      const sessKey = `${t.provider}:${t.conversationId}`;
      if (!activeTaskBySession.has(sessKey)) {
        activeTaskBySession.set(sessKey, t.taskId);
      }
    }
    if (Array.isArray(t.events)) {
      for (const ev of t.events) {
        if (ev) seenEventIds.add(makeStableEventKey(ev));
      }
    }
  }

  function importState(state) {
    if (!state || typeof state !== 'object') return false;
    if (Array.isArray(state.seenEventIds)) {
      for (const key of state.seenEventIds) seenEventIds.add(key);
    }
    if (Array.isArray(state.activeTaskBySession)) {
      for (const [sessKey, taskId] of state.activeTaskBySession) {
        activeTaskBySession.set(sessKey, taskId);
      }
    }
    if (Array.isArray(state.tasks)) {
      for (const t of state.tasks) {
        registerImportedTask(t);
      }
    }
    if (Array.isArray(state.activeTasks)) {
      for (const t of state.activeTasks) {
        registerImportedTask(t);
      }
    }
    if (Array.isArray(state.history?.items)) {
      for (const t of state.history.items) {
        registerImportedTask(t);
      }
    }
    return true;
  }

  return {
    ingest,
    load,
    exportState,
    importState,
    getTask: (id) => tasks.get(id) || null,
    getActiveTasks,
    getHistoryTasks,
    getStats,
    checkStale,
    snapshot,
    get size() { return tasks.size; },
  };
}
