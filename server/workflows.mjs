import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { redact } from './redact.mjs';

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'timeout', 'interrupted', 'incomplete', 'blocked']);
const ACTIVE = new Set(['dispatching', 'running']);
const CLAIMED = new Set(['queued', 'dispatching', 'running']);
const UNSUCCESSFUL = new Set(['failed', 'cancelled', 'timeout', 'interrupted', 'incomplete', 'blocked']);
const PROVIDERS = new Set(['claude', 'codex-cli']);
const clip = (v, n) => redact(String(v ?? '').trim()).slice(0, n);
const active = (t) => ACTIVE.has(t.status);

export function createWorkflows({ file, maxConcurrent = 2, dispatch = async () => ({ ok: false, code: 'noProvider' }), cancel = () => false,
  onEvent = () => {}, now = Date.now } = {}) {
  const workflows = new Map(), ownerId = crypto.randomUUID();
  const store = file ? path.resolve(file) : '';
  const lockFile = store ? `${store}.scheduler.lock` : '';
  let lockOwned = !store, lockFd = null, lockHeartbeat = null, scheduling = false, scheduleAgain = false;
  const lockLeaseMs = 60_000;
  function refreshLock() {
    if (!lockOwned || lockFd === null) return;
    try {
      fs.ftruncateSync(lockFd, 0);
      fs.writeSync(lockFd, JSON.stringify({ ownerId, pid: process.pid, at: now(), expiresAt: now() + lockLeaseMs }), 0, 'utf8');
      fs.fsyncSync(lockFd);
    } catch { /* retain the exclusive lock rather than let another process steal a live scheduler */ }
  }

  function pidAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
  }
  function acquireLock() {
    if (!store) return true;
    fs.mkdirSync(path.dirname(store), { recursive: true });
    for (let i = 0; i < 2; i++) {
      try {
        lockFd = fs.openSync(lockFile, 'wx', 0o600);
        lockOwned = true;
        refreshLock();
        lockHeartbeat = setInterval(refreshLock, lockLeaseMs / 3); lockHeartbeat.unref?.();
        process.on('exit', releaseLock);
        return true;
      } catch (e) {
        if (e.code !== 'EEXIST') return false;
        try {
          const owner = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
          if (pidAlive(Number(owner.pid))) return false;
          fs.unlinkSync(lockFile);
        } catch (readError) {
          if (readError.code === 'ENOENT') continue;
          try {
            if (now() - fs.statSync(lockFile).mtimeMs < lockLeaseMs) return false;
            fs.unlinkSync(lockFile);
          } catch { return false; }
        }
      }
    }
    return false;
  }
  function releaseLock() {
    if (!lockOwned || !lockFile) return;
    clearInterval(lockHeartbeat); lockHeartbeat = null;
    try {
      const owner = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (owner.ownerId === ownerId) fs.unlinkSync(lockFile);
    } catch { /* another owner already released it */ }
    if (lockFd !== null) { try { fs.closeSync(lockFd); } catch { /* already closed */ } lockFd = null; }
    lockOwned = false;
    process.removeListener('exit', releaseLock);
  }

  function persist() {
    if (!store || !lockOwned) return;
    const tmp = `${store}.${process.pid}.${ownerId}.tmp`;
    try {
      fs.mkdirSync(path.dirname(store), { recursive: true });
      refreshLock();
      fs.writeFileSync(tmp, JSON.stringify({ version: 2, workflows: [...workflows.values()].slice(-100) }), { mode: 0o600 });
      fs.renameSync(tmp, store);
    } catch (e) { console.error('workflow persistence', e.message); try { fs.unlinkSync(tmp); } catch { /* absent */ } }
  }
  const publicWorkflow = (w) => w ? structuredClone(w) : null;
  const getTask = (w, id) => w?.tasks.find((t) => t.id === id) || null;
  const event = (w, type, task = null, payload = {}) => {
    const e = { id: crypto.randomUUID(), workflowId: w.id, taskId: task?.id || null, runId: task?.runId || null,
      agentId: task?.runId || task?.provider || null, provider: task?.provider || null, timestamp: new Date(now()).toISOString(), eventType: type, payload };
    w.events.push(e); if (w.events.length > 500) w.events.shift();
    onEvent(e); persist(); return e;
  };

  function cycle(tasks) {
    const byId = new Map(tasks.map((t) => [t.id, t])), visiting = new Set(), done = new Set();
    function visit(id) {
      if (visiting.has(id)) return true;
      if (done.has(id)) return false;
      visiting.add(id);
      for (const dep of byId.get(id).dependsOn) if (visit(dep)) return true;
      visiting.delete(id); done.add(id); return false;
    }
    return tasks.some((t) => visit(t.id));
  }
  function transition(w, t, to, payload = {}) {
    const allowed = {
      pending: new Set(['ready', 'blocked', 'cancelled']), ready: new Set(['queued', 'blocked', 'cancelled']),
      queued: new Set(['dispatching', 'failed', 'cancelled', 'interrupted']), dispatching: new Set(['running', 'failed', 'cancelled', 'timeout', 'interrupted', 'incomplete']),
      running: new Set(['completed', 'failed', 'cancelled', 'timeout', 'interrupted', 'incomplete']),
      blocked: new Set(['ready', 'cancelled']), failed: new Set(['pending']), incomplete: new Set(['pending']),
      timeout: new Set(['pending']), interrupted: new Set(['pending']), completed: new Set(), cancelled: new Set(),
    };
    if (t.status === to) return false;
    if (!allowed[t.status]?.has(to)) return false;
    const from = t.status; t.status = to; t.updatedAt = now();
    event(w, `task.${to}`, t, { from, to, ...payload });
    return true;
  }
  const dependencies = (t, w) => t.dependsOn.map((id) => getTask(w, id));
  function refreshDependencies(w) {
    let changed;
    do {
      changed = false;
      for (const t of w.tasks) {
        if (TERMINAL.has(t.status) && t.status !== 'blocked') continue;
        const deps = dependencies(t, w), failed = deps.filter((d) => UNSUCCESSFUL.has(d.status));
        if (failed.length) {
          t.blockedBy = failed.map((d) => d.id);
          t.blockReason = `Dependency ${t.blockedBy.join(', ')} did not complete successfully.`;
          if (t.status !== 'blocked') { changed = transition(w, t, 'blocked', { blockedBy: t.blockedBy, reason: t.blockReason }) || changed; }
        } else if (deps.every((d) => d.status === 'completed')) {
          t.blockedBy = []; t.blockReason = '';
          if (t.status === 'pending' || t.status === 'blocked') changed = transition(w, t, 'ready', { reason: 'dependencies completed' }) || changed;
        } else if (t.status === 'blocked') {
          // Keep it blocked while a failed prerequisite is being retried or is otherwise unresolved.
          const unresolved = deps.filter((d) => d.status !== 'completed').map((d) => d.id);
          if (JSON.stringify(unresolved) !== JSON.stringify(t.blockedBy)) {
            t.blockedBy = unresolved; t.blockReason = `Waiting for dependencies: ${unresolved.join(', ')}.`; t.updatedAt = now(); persist();
          }
        }
      }
    } while (changed);
  }
  function updateWorkflow(w) {
    if (w.tasks.every((t) => TERMINAL.has(t.status))) {
      const previous = w.status;
      w.status = w.tasks.some((t) => UNSUCCESSFUL.has(t.status)) ? 'failed'
        : w.tasks.some((t) => t.status === 'cancelled') ? 'cancelled' : 'completed';
      w.completedAt ||= now();
      if (previous !== w.status) event(w, `workflow.${w.status}`);
    } else if (w.tasks.some(active)) {
      w.status = 'running'; w.completedAt = null;
    }
    w.updatedAt = now(); persist();
  }
  function countActive() { return [...workflows.values()].reduce((n, w) => n + w.tasks.filter(active).length, 0); }
  function currentAttempt(t) { return t.attempts.find((a) => a.dispatchId === t.dispatchId) || null; }
  function recordRun(t, a, run = {}) {
    if (!a || !run.id) return null;
    let r = t.runs.find((x) => x.dispatchId === t.dispatchId);
    if (!r) { r = { workflowId: run.workflowId || a.workflowId, taskId: run.taskId || t.id, dispatchId: t.dispatchId }; t.runs.push(r); }
    Object.assign(r, { workflowId: run.workflowId || a.workflowId || r.workflowId, taskId: run.taskId || t.id, runId: run.id,
      provider: run.provider || t.provider, workingDirectory: run.workingDirectory || a.workingDirectory || t.workingDirectory,
      worktreePath: run.worktreePath || t.worktreePath || '', branchName: run.branch || t.branch || '', attemptNumber: t.attempt,
      processId: run.pid || run.processId || t.processId || null, startedAt: run.startedAt || a.startedAt || r.startedAt || null,
      completedAt: run.endedAt || r.completedAt || null, exitCode: run.exitCode ?? r.exitCode ?? null,
      terminationSignal: run.signal || r.terminationSignal || null, processStatus: run.processStatus || run.status || r.processStatus || 'starting',
      taskStatus: run.taskStatus || r.taskStatus || 'pending', providerTaskStatus: run.providerTaskStatus || r.providerTaskStatus || run.taskStatus || '',
      outputRef: run.outputRef || run.id, error: clip(run.error || r.error, 500) });
    const output = run.output || run.stderr;
    if (output) r.output = clip(output, 16_000);
    return r;
  }
  function releaseClaim(w, t, status, fields = {}) {
    const a = currentAttempt(t);
    if (a) Object.assign(a, fields, { status, completedAt: fields.completedAt || now() });
    t.claimOwner = ''; t.claimPid = null; t.claimedAt = null; t.claimExpiresAt = null;
  }
  function schedule() {
    if (!lockOwned) return false;
    if (scheduling) { scheduleAgain = true; return false; }
    scheduling = true;
    try {
      do {
        scheduleAgain = false;
        for (const w of workflows.values()) {
          if (w.status !== 'running') continue;
          refreshDependencies(w);
          while (countActive() < maxConcurrent) {
            const t = w.tasks.filter((x) => x.status === 'ready' && x.attempt < x.maxAttempts)
              .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)[0];
            if (!t) break;
            const dispatchId = crypto.randomUUID(), at = now();
            t.attempt++; t.dispatchId = t.claimId = dispatchId; t.claimOwner = ownerId; t.claimPid = process.pid;
            t.claimedAt = at; t.claimExpiresAt = at + t.timeout;
            t.runId = null; t.currentRunId = null; t.startedAt = at; t.completedAt = null;
            t.attempts.push({ dispatchId, attempt: t.attempt, provider: t.provider, claimOwner: ownerId, claimPid: process.pid,
              claimExpiresAt: t.claimExpiresAt, workflowId: w.id, workingDirectory: t.workingDirectory, status: 'dispatching', dispatchAt: at,
              startedAt: null, completedAt: null, runId: null, processId: null, worktreePath: '', repoRoot: '', branch: '',
              processStatus: 'starting', taskStatus: 'pending', exitCode: null, signal: null, result: '', error: '' });
            transition(w, t, 'queued', { dispatchId, attempt: t.attempt, claimOwner: ownerId, claimedAt: at });
            transition(w, t, 'dispatching', { dispatchId, attempt: t.attempt });
            // The exclusive scheduler lease and this atomic snapshot make the claim durable before provider code runs.
            persist();
            const snapshot = publicWorkflow(w), claimed = structuredClone(t);
            Promise.resolve().then(() => dispatch(snapshot, claimed)).then((r) => {
              const cw = workflows.get(w.id), current = getTask(cw, t.id);
              if (!current || current.dispatchId !== dispatchId) return;
              if (TERMINAL.has(current.status)) {
                if (current.status === 'cancelled' && r?.ok && (r.runId || r.id)) cancel(current.provider, r.runId || r.id);
                return;
              }
              if (!r?.ok) {
                settle(w.id, t.id, { status: current.cancelRequested ? 'cancelled' : 'failed', error: r?.error || r?.code || (current.cancelRequested ? '' : 'provider failed'), dispatchId });
                return;
              }
              const a = currentAttempt(current);
              Object.assign(a || {}, { runId: r.runId || r.id || null, worktreePath: r.worktreePath || '', repoRoot: r.repoRoot || '',
                branch: r.branch || '', processId: r.processId || r.pid || null, startedAt: r.startedAt || (a?.startedAt ?? now()), processStatus: 'running' });
              current.runId = current.currentRunId = r.runId || r.id || null;
              current.worktreePath = r.worktreePath || current.worktreePath; current.repoRoot = r.repoRoot || current.repoRoot;
              current.branch = r.branch || current.branch;
              current.processId = r.processId || r.pid || current.processId;
              recordRun(current, a, { ...r, id: r.runId || r.id, processStatus: r.processStatus || 'running', status: 'running' });
              if (current.cancelRequested && current.runId) {
                if (cancel(current.provider, current.runId)) settle(w.id, t.id, { status: 'cancelled', runId: current.runId,
                  worktreePath: current.worktreePath, repoRoot: current.repoRoot, branch: current.branch, processId: current.processId, dispatchId });
                else settle(w.id, t.id, { status: 'failed', error: 'Provider cancellation failed.', runId: current.runId, dispatchId });
                return;
              }
              if (current.status === 'dispatching') transition(cw, current, 'running', { runId: current.runId });
              persist();
            }).catch((e) => settle(w.id, t.id, { status: 'failed', error: e?.message || 'provider failed', dispatchId }));
          }
          refreshDependencies(w); updateWorkflow(w);
        }
      } while (scheduleAgain);
    } finally { scheduling = false; }
    return true;
  }
  function create({ name, description = '', tasks = [] } = {}) {
    if (store && !lockOwned) return { ok: false, code: 'schedulerBusy' };
    if (!String(name || '').trim() || !Array.isArray(tasks) || !tasks.length || tasks.length > 40) return { ok: false, code: 'invalidWorkflow' };
    const normalized = tasks.map((t, i) => {
      const id = String(t.id || `task-${i + 1}`).slice(0, 80);
      const provider = t.provider === 'codex' ? 'codex-cli' : String(t.provider || 'claude');
      const expectedArtifacts = t.expectedArtifacts === undefined ? [] : Array.isArray(t.expectedArtifacts) && t.expectedArtifacts.every((x) => typeof x === 'string')
        ? [...new Set(t.expectedArtifacts.map((x) => x.trim()))] : null;
      return { id, title: clip(t.title || `Task ${i + 1}`, 120), description: clip(t.description, 4000), provider, expectedArtifacts,
        priority: Math.max(0, Math.min(10, Number(t.priority) || 0)), attempt: 0, maxAttempts: Math.max(1, Math.min(3, Number(t.maxAttempts) || 2)),
        timeout: Math.max(1000, Math.min(30 * 60_000, Number(t.timeout) || 30 * 60_000)), workingDirectory: String(t.workingDirectory || ''),
        dependsOn: Array.isArray(t.dependsOn) ? [...new Set(t.dependsOn.map(String))] : [], status: 'pending', runId: null, currentRunId: null,
        dispatchId: '', claimId: '', claimOwner: '', claimPid: null, claimedAt: null, claimExpiresAt: null, runs: [], attempts: [], blockedBy: [], blockReason: '',
        worktreePath: '', repoRoot: '', branch: '', processId: null, result: '', error: '', createdAt: now(), updatedAt: now(), startedAt: null, completedAt: null };
    });
    const idsFinal = new Set(normalized.map((t) => t.id));
    if (idsFinal.size !== normalized.length || normalized.some((t) => !t.title || !PROVIDERS.has(t.provider) || t.expectedArtifacts === null
      || t.expectedArtifacts.length > 10 || t.expectedArtifacts.some((p) => !p || path.isAbsolute(p) || /[:\0]/.test(p) || p.split(/[\\/]/).some((part) => part === '..' || part === '.git'))
      || (t.expectedArtifacts.length && t.provider !== 'codex-cli') || t.dependsOn.some((d) => !idsFinal.has(d) || d === t.id))) return { ok: false, code: 'invalidTask' };
    if (cycle(normalized)) return { ok: false, code: 'cycle' };
    const at = now(), w = { id: crypto.randomUUID(), name: clip(name, 120), description: clip(description, 1000), status: 'draft',
      createdAt: at, updatedAt: at, startedAt: null, completedAt: null, tasks: normalized, events: [] };
    workflows.set(w.id, w); event(w, 'workflow.created'); for (const t of normalized) event(w, 'task.created', t, { title: t.title, provider: t.provider });
    return { ok: true, workflow: publicWorkflow(w) };
  }
  function start(id) {
    if (!lockOwned) return { ok: false, code: 'schedulerBusy' };
    const w = workflows.get(String(id)); if (!w) return { ok: false, code: 'notFound' };
    if (w.status === 'running') { schedule(); return { ok: true, workflow: publicWorkflow(w) }; }
    if (!['draft', 'interrupted'].includes(w.status)) return { ok: false, code: 'notStartable' };
    w.status = 'running'; w.startedAt ||= now(); w.completedAt = null; w.updatedAt = now(); event(w, 'workflow.started');
    refreshDependencies(w); schedule(); return { ok: true, workflow: publicWorkflow(w) };
  }
  function settle(workflowId, taskId, { status, result = '', error = '', runId = null, worktreePath = '', repoRoot = '', branch = '',
    processId = null, startedAt = null, completedAt = null, exitCode = null, signal = null, processStatus = '', output = '', dispatchId = '' } = {}) {
    const w = workflows.get(String(workflowId)), t = getTask(w, String(taskId));
    if (!w || !t || !ACTIVE.has(t.status) || (dispatchId && t.dispatchId !== dispatchId) || !TERMINAL.has(status)) return false;
    t.result = clip(result, 4000); t.error = clip(error, 500); t.runId = runId || t.runId; t.currentRunId = t.runId;
    t.worktreePath = worktreePath || t.worktreePath; t.repoRoot = repoRoot || t.repoRoot; t.branch = branch || t.branch; t.processId = processId || t.processId;
    const a = currentAttempt(t);
    if (a) Object.assign(a, { runId: t.runId, worktreePath: t.worktreePath, repoRoot: t.repoRoot, branch: t.branch,
      processId: t.processId, startedAt: startedAt || a.startedAt || t.startedAt, completedAt: now(), processStatus: processStatus || status,
      taskStatus: status, exitCode, signal, result: t.result, error: t.error });
    recordRun(t, a, { id: runId || t.runId, provider: t.provider, status, processStatus: processStatus || status, taskStatus: status,
      worktreePath: t.worktreePath, branch: t.branch, pid: t.processId, startedAt: startedAt || a?.startedAt,
      workflowId: w.id, taskId: t.id, endedAt: completedAt || now(), exitCode, signal, output, error: t.error });
    releaseClaim(w, t, status);
    const ok = transition(w, t, status, { error: t.error, attempt: t.attempt, runId: t.runId });
    if (!ok) return false;
    t.completedAt = t.updatedAt = now();
    refreshDependencies(w); updateWorkflow(w); schedule(); return true;
  }
  function providerChanged(run) {
    if (!run?.workflowId || !run?.taskId || !run.id) return false;
    const w = workflows.get(run.workflowId), t = getTask(w, run.taskId);
    if (!t || !ACTIVE.has(t.status) || (run.provider && run.provider !== t.provider) || run.dispatchId !== t.dispatchId) return false;
    const a = currentAttempt(t); if (!a) return false;
    t.runId = t.currentRunId = run.id; t.worktreePath = run.worktreePath || t.worktreePath;
    t.repoRoot = run.repoRoot || t.repoRoot; t.branch = run.branch || t.branch;
    t.processId = run.pid || run.processId || t.processId;
    Object.assign(a, { runId: run.id, worktreePath: t.worktreePath, repoRoot: t.repoRoot, branch: t.branch,
      processId: t.processId, processStatus: run.processStatus || run.status, exitCode: run.exitCode ?? a.exitCode, signal: run.signal || a.signal,
      taskStatus: run.taskStatus || a.taskStatus, error: clip(run.error || a.error, 500), result: clip(run.messages?.at(-1)?.text || run.result || a.result, 4000) });
    a.workingDirectory = run.workingDirectory || a.workingDirectory || t.workingDirectory;
    a.startedAt = run.startedAt || a.startedAt;
    recordRun(t, a, run);
    if (ACTIVE.has(run.status)) {
      if (run.status === 'running' && t.status === 'dispatching') {
        a.startedAt = run.startedAt || now(); t.startedAt = a.startedAt; transition(w, t, 'running', { runId: run.id, processId: t.processId });
      }
      persist(); return true;
    }
    const status = run.status === 'completed'
      ? (run.taskStatus === 'success' ? 'completed' : 'failed')
      : run.status === 'unknown' ? 'interrupted' : run.status === 'failed' ? 'failed' : run.status;
    return settle(run.workflowId, run.taskId, { status, result: a.result, error: run.error, runId: run.id,
      worktreePath: t.worktreePath, repoRoot: t.repoRoot, branch: t.branch, processId: t.processId,
      startedAt: run.startedAt || a.startedAt, exitCode: run.exitCode, signal: run.signal, processStatus: run.processStatus || run.status,
      output: run.output || run.stderr || '', completedAt: run.endedAt, dispatchId: t.dispatchId });
  }
  function retry(workflowId, taskId) {
    if (!lockOwned) return { ok: false, code: 'schedulerBusy' };
    const w = workflows.get(String(workflowId)), t = getTask(w, String(taskId));
    if (!w || !t) return { ok: false, code: 'notFound' };
    if (!['failed', 'timeout', 'interrupted', 'incomplete'].includes(t.status) || t.attempt >= t.maxAttempts) return { ok: false, code: 'notRetryable' };
    t.error = ''; t.result = ''; t.completedAt = null; t.runId = t.currentRunId = null; t.dispatchId = t.claimId = '';
    t.claimedAt = null; t.claimExpiresAt = null; t.claimOwner = ''; t.claimPid = null;
    transition(w, t, 'pending', { retry: true, attempt: t.attempt + 1 });
    w.status = 'running'; w.completedAt = null; w.updatedAt = now(); event(w, 'task.retried', t, { attempt: t.attempt + 1 });
    refreshDependencies(w); schedule(); return { ok: true, task: structuredClone(t) };
  }
  function cancelTask(workflowId, taskId) {
    if (!lockOwned) return { ok: false, code: 'schedulerBusy' };
    const w = workflows.get(String(workflowId)), t = getTask(w, String(taskId));
    if (!w || !t || TERMINAL.has(t.status)) return { ok: false, code: 'notFoundOrTerminal' };
    if (t.status === 'running' && t.runId) {
      if (!cancel(t.provider, t.runId)) return { ok: false, code: 'cancelFailed' };
      return { ok: true, task: structuredClone(t) };
    }
    if (t.status === 'dispatching') { t.cancelRequested = true; t.updatedAt = now(); persist(); return { ok: true, task: structuredClone(t) }; }
    transition(w, t, 'cancelled'); t.completedAt = now();
    refreshDependencies(w); updateWorkflow(w); schedule(); return { ok: true, task: structuredClone(t) };
  }
  function cancelWorkflow(id) {
    const w = workflows.get(String(id)); if (!w) return { ok: false, code: 'notFound' };
    for (const t of w.tasks) if (!TERMINAL.has(t.status)) cancelTask(w.id, t.id);
    if (w.status === 'draft') { w.status = 'cancelled'; w.completedAt = now(); event(w, 'workflow.cancelled'); }
    return { ok: true, workflow: publicWorkflow(w) };
  }
  function load() {
    if (!store) return;
    try {
      const data = JSON.parse(fs.readFileSync(store, 'utf8'));
      if (!Array.isArray(data.workflows)) return;
      for (const w of data.workflows.slice(-100)) {
        for (const t of w.tasks) {
          t.attempts ||= []; t.runs ||= []; t.blockedBy ||= []; t.currentRunId ??= t.runId || null;
          if (lockOwned && CLAIMED.has(t.status)) {
            const old = t.status; t.status = 'interrupted'; t.completedAt = t.updatedAt = now(); t.error = 'Server restarted while task was active.';
            const a = t.attempts.find((x) => x.dispatchId === t.dispatchId);
            if (a) Object.assign(a, { status: 'interrupted', completedAt: now(), processStatus: 'interrupted', error: t.error });
            t.claimOwner = ''; t.claimPid = null; t.claimedAt = null; t.claimExpiresAt = null;
            w.events.push({ id: crypto.randomUUID(), workflowId: w.id, taskId: t.id, runId: t.runId || null, agentId: t.provider,
              provider: t.provider, timestamp: new Date(now()).toISOString(), eventType: 'task.interrupted', payload: { from: old, reason: t.error } });
          }
        }
        if (lockOwned && w.tasks.some((t) => t.status === 'interrupted')) {
          w.status = 'interrupted'; w.completedAt = null;
          refreshDependencies(w);
        }
        workflows.set(w.id, w);
      }
      if (lockOwned) persist();
    } catch { /* first run or an incomplete atomic write */ }
  }
  const schedulerAvailable = acquireLock();
  load();
  return { create, start, get: (id) => publicWorkflow(workflows.get(String(id))), list: () => [...workflows.values()].map(publicWorkflow),
    events: (id) => workflows.get(String(id))?.events.slice() || null, retry, cancelTask, cancelWorkflow, settle, providerChanged,
    schedule, persist, dispose: releaseLock, maxConcurrent, schedulerAvailable };
}
