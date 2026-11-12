import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { redact } from './redact.mjs';
import { createWorktreeManager } from './worktrees.mjs';

const ACTIVE = new Set(['starting', 'running']), MAX_RUNS = 100, LOG_MAX = 32_000;
const terminal = (r) => !!r.endedAt;
const clipLog = (value, old = '') => (old + redact(String(value ?? ''))).slice(-LOG_MAX);
const exec = promisify(execFile);
const childEnvironment = (source = process.env) => {
  const env = { ...source };
  delete env.CODEX_WINDOWS_REGISTERED_CORE;
  delete env.CODEX_PERMISSION_PROFILE;
  return env;
};
const inside = (base, target) => target === base || target.startsWith(base + path.sep);

export function parseCodexJsonl(r, chunk, final = false, onEvent = () => {}) {
  r.buf = (r.buf || '') + chunk;
  if (r.buf.length > 1_000_000) { r.buf = ''; r.error = 'JSONL line exceeded 1 MB'; return; }
  let i;
  while ((i = r.buf.indexOf('\n')) >= 0) { const line = r.buf.slice(0, i).trim(); r.buf = r.buf.slice(i + 1); parseLine(r, line, onEvent); }
  if (final && r.buf.trim()) { parseLine(r, r.buf.trim(), onEvent); r.buf = ''; }
}
function parseLine(r, line, onEvent) {
  if (!line) return;
  let e; try { e = JSON.parse(line); } catch { return; }
  if (!e || typeof e.type !== 'string') return;
  const key = JSON.stringify([e.type, e.thread_id || '', e.item?.id || '', e.item?.text || '']);
  if (r.seen.has(key)) return;
  r.seen.add(key);
  if (r.seen.size > 5000) r.seen.delete(r.seen.values().next().value);
  const now = Date.now(); r.lastAt = now;
  if (e.type === 'thread.started' && typeof e.thread_id === 'string') r.threadId = e.thread_id;
  if (e.type === 'turn.started') r.turnStarted = true;
  if (e.type === 'turn.completed') r.turnCompleted = true;
  if (e.type === 'turn.failed') r.turnFailed = true;
  if (e.type === 'item.completed' && (e.item?.status === 'failed' || e.item?.error)) {
    const noMatches = e.item?.type === 'command_execution' && e.item?.exit_code === 1 && /\brg(?:\.exe)?\s+/.test(e.item?.command || '');
    if (noMatches) { onEvent(e); return; }
    r.failedItems ||= []; r.failedItems.push({ type: e.item.type || 'tool', error: redact(String(e.item.error?.message || e.item.error || e.item.status)).slice(0, 300) });
    if (r.failedItems.length > 50) r.failedItems.shift();
  }
  if (e.type === 'item.completed' && e.item?.type === 'agent_message' && typeof e.item.text === 'string') r.messages.push({ at: now, text: redact(e.item.text.slice(0, 2000)) });
  onEvent(e);
}

export function createCodexRuns({ bin, dataDir, onChange = () => {}, onEvent = () => {}, max = 2, timeoutMs = 30 * 60e3,
  spawnProcess = spawn, gitRun, gitStatus = null, worktreeRoot = path.join(os.tmpdir(), 'my-office-worktrees'), worktrees = null } = {}) {
  const runs = new Map(), owners = new Map(), store = dataDir ? path.join(dataDir, 'codex-runs.json') : '';
  worktrees ||= createWorktreeManager({ root: worktreeRoot, ...(gitRun ? { gitRun } : {}) });
  let saveTimer = null;
  const publicRun = (r) => ({ id: r.id, agent: 'codex', provider: 'codex-cli', workflowId: r.workflowId || null, taskId: r.taskId || null, dispatchId: r.dispatchId || null,
    threadId: r.threadId, dir: r.dir, workingDirectory: r.workingDirectory || '', repoRoot: r.repoRoot || '', worktreePath: r.worktreePath || '', branch: r.branch || '', task: r.task, status: r.status,
    outcome: r.outcome, processStatus: r.processStatus || r.status, taskStatus: r.taskStatus || 'pending', expectedArtifacts: r.expectedArtifacts || [], artifactChanges: r.artifactChanges || [], changedFiles: r.changedFiles || [], requestedTerminalState: r.requestedTerminalState || null, startedAt: r.startedAt, lastAt: r.lastAt,
    endedAt: r.endedAt || 0, messages: r.messages.slice(-20), output: r.output || '', stderr: r.stderr || '',
    exitCode: r.exitCode, signal: r.signal || null, error: r.error || '', pid: r.pid || null, events: (r.events || []).slice(-100) });
  const persistedRun = (r) => ({ ...publicRun(r), task: redact(r.task).slice(0, 4000), output: redact(r.output || ''), stderr: redact(r.stderr || '') });
  function trimRuns() {
    const old = [...runs.values()].filter(terminal).sort((a, b) => a.endedAt - b.endedAt);
    while (runs.size > MAX_RUNS && old.length) runs.delete(old.shift().id);
  }
  function persist() {
    if (!store) return;
    try {
      trimRuns();
      fs.mkdirSync(dataDir, { recursive: true });
      const tmp = `${store}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, runs: [...runs.values()].slice(-MAX_RUNS).map(persistedRun) }), { mode: 0o600 });
      fs.renameSync(tmp, store);
    } catch (e) { console.error('codex run persistence', e.message); }
  }
  function schedulePersist() { if (saveTimer) return; saveTimer = setTimeout(() => { saveTimer = null; persist(); }, 500); saveTimer.unref?.(); }
  function publish(r) { r.updatedAt = Date.now(); onChange(publicRun(r)); schedulePersist(); }
  function appendEvent(r, type, payload = {}) {
    const event = { id: crypto.randomUUID(), runId: r.id, provider: 'codex-cli', eventType: type, timestamp: new Date().toISOString(), payload };
    r.events ||= []; r.events.push(event); if (r.events.length > 100) r.events.shift();
    onEvent(publicRun(r), { type, ...payload });
    return event;
  }
  function finish(r, status, { code = null, signal = null, error = '', taskStatus = null } = {}) {
    if (terminal(r)) {
      if (r.exitCode == null && code != null) r.exitCode = code;
      if (!r.signal && signal) r.signal = signal;
      if (!r.error && error) r.error = redact(error).slice(0, 300);
      persist();
      return false;
    }
    r.status = r.outcome = status; r.endedAt = r.lastAt = Date.now();
    r.processStatus = status;
    r.exitCode = code; r.signal = signal || null; if (error) r.error = redact(error).slice(0, 300);
    r.taskStatus = taskStatus || (status === 'completed' ? 'incomplete' : ['cancelled', 'timeout', 'interrupted'].includes(status) ? 'incomplete' : 'failure');
    r.requestedTerminalState ||= null;
    if (r.worktreePath) { owners.delete(r.worktreePath); worktrees.release(r.worktreePath, r.id); }
    clearTimeout(r.timer); clearTimeout(r.persistTimer); r.timer = null;
    appendEvent(r, `run.${status}`, { exitCode: code, signal: signal || null, error: r.error || '' });
    publish(r); persist();
    return true;
  }
  function fresh(data) {
    const now = Date.now();
    return { ...data, agent: 'codex', provider: 'codex-cli', status: 'interrupted', outcome: 'interrupted', processStatus: 'interrupted', taskStatus: 'incomplete', requestedTerminalState: 'interrupted',
      endedAt: now, lastAt: now, pid: null, child: null, timer: null, persistTimer: null, seen: new Set(), buf: '',
      events: [...(data.events || []), { id: crypto.randomUUID(), runId: data.id, provider: 'codex-cli', eventType: 'run.interrupted', timestamp: new Date(now).toISOString(), payload: { reason: 'server restarted while run was active' } }].slice(-100) };
  }
  if (store) {
    try {
      const saved = JSON.parse(fs.readFileSync(store, 'utf8'));
      if (saved.version === 1 && Array.isArray(saved.runs)) for (const item of saved.runs.slice(-MAX_RUNS)) {
        const r = ACTIVE.has(item.status) ? fresh(item) : { ...item, processStatus: item.processStatus || item.status,
          taskStatus: item.taskStatus || (item.status === 'completed' ? 'incomplete' : 'failure'), child: null, timer: null, persistTimer: null, seen: new Set(), buf: '' };
        runs.set(r.id, r);
      }
      if ([...runs.values()].some((r) => r.status === 'interrupted')) persist();
    } catch { /* first run or an incomplete atomic write */ }
  }

  async function start({ dir, text, workflowId = null, taskId = null, dispatchId = '', timeoutMs: taskTimeout = timeoutMs, expectedArtifacts = [], seedArtifacts = [] } = {}) {
    text = String(text || '').trim().slice(0, 4000);
    if (!text) return { ok: false, code: 'empty' };
    if (!dir) return { ok: false, code: 'noDir' };
    if (!bin) return { ok: false, code: 'noCodex' };
    if (!Array.isArray(expectedArtifacts) || expectedArtifacts.length > 10 || expectedArtifacts.some((p) => typeof p !== 'string')) return { ok: false, code: 'invalidArtifact' };
    expectedArtifacts = [...new Set(expectedArtifacts.map((p) => p.replace(/\\/g, '/').trim()))];
    if (expectedArtifacts.some((p) => !p || path.isAbsolute(p) || /[:\0]/.test(p) || p.split('/').some((part) => part === '..' || part === '.git'))) return { ok: false, code: 'invalidArtifact' };
    if ([...runs.values()].filter((r) => ACTIVE.has(r.status)).length >= max) return { ok: false, code: 'busy' };
    const id = crypto.randomUUID(), r = { id, agent: 'codex', provider: 'codex-cli', workflowId, taskId, dispatchId, dir: path.resolve(dir), task: text,
      status: 'starting', outcome: 'unknown', startedAt: Date.now(), lastAt: Date.now(), messages: [], output: '', stderr: '', events: [],
      seen: new Set(), buf: '', threadId: '', turnStarted: false, turnCompleted: false, turnFailed: false, failedItems: [], expectedArtifacts, baselineArtifacts: {}, changedFiles: [], endedAt: 0, exitCode: null, signal: null, error: '', pid: null, requestedTerminalState: null };
    runs.set(id, r); appendEvent(r, 'run.starting'); publish(r); persist();
    try {
      const wt = await worktrees.create(r.dir, id, (allocated) => {
        r.repoRoot = allocated.repoRoot; r.worktreePath = allocated.worktreePath; r.branch = allocated.branch;
        r.workingDirectory = allocated.workingDirectory; persist();
      });
      if (seedArtifacts.length) await worktrees.seed(wt.worktreePath, wt.workingDirectory, seedArtifacts);
      let realWorktree, realCwd;
      try { realWorktree = fs.realpathSync(wt.worktreePath); realCwd = fs.realpathSync(wt.workingDirectory); }
      catch { throw Object.assign(new Error('Assigned worktree folder is missing.'), { code: 'invalidWorktree' }); }
      if (!inside(realWorktree, realCwd) || !fs.statSync(realCwd).isDirectory()) throw Object.assign(new Error('Assigned worktree folder is missing or outside the worktree.'), { code: 'invalidWorktree' });
      owners.set(wt.worktreePath, id); r.repoRoot = wt.repoRoot; r.worktreePath = wt.worktreePath; r.branch = wt.branch;
      r.workingDirectory = wt.workingDirectory; r.status = 'running'; r.lastAt = Date.now(); appendEvent(r, 'run.started', { cwd: wt.workingDirectory, branch: wt.branch }); publish(r); persist();
      for (const artifact of expectedArtifacts) r.baselineArtifacts[artifact] = await fingerprint(wt.workingDirectory, artifact);
      const child = spawnProcess(bin, ['exec', '--json', '--sandbox', 'workspace-write', '--cd', wt.workingDirectory, text],
        { cwd: wt.workingDirectory, env: childEnvironment(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      r.child = child; r.pid = child.pid || null;
      child.stdout.on('data', (chunk) => {
        const value = String(chunk); r.output = clipLog(value, r.output);
        parseCodexJsonl(r, value, false, (event) => { publish(r); onEvent(publicRun(r), event); });
        if (!r.persistTimer) { r.persistTimer = setTimeout(() => { r.persistTimer = null; persist(); }, 1000); r.persistTimer.unref?.(); }
      });
      child.stderr.on('data', (chunk) => { r.stderr = clipLog(chunk, r.stderr); publish(r); });
      child.on('error', (e) => { if (!terminal(r)) finish(r, 'failed', { error: e.message || e }); });
      child.on('close', async (code, signal) => {
        parseCodexJsonl(r, '', true, (event) => { publish(r); onEvent(publicRun(r), event); });
        if (terminal(r)) {
          r.exitCode ??= code; r.signal ||= signal || null;
          if (r.worktreePath) { owners.delete(r.worktreePath); worktrees.release(r.worktreePath, r.id); }
          persist(); return;
        }
        clearTimeout(r.timer); r.timer = null;
        const processStatus = signal ? (r.requestedTerminalState || 'unknown') : code === 0 ? 'completed' : 'failed';
        let taskError = '';
        try { await inspectResult(r); } catch (e) { r.verificationError = redact(e.message).slice(0, 300); taskError = `result verification failed: ${e.message}`; }
        if (terminal(r)) {
          r.exitCode ??= code; r.signal ||= signal || null;
          if (r.worktreePath) { owners.delete(r.worktreePath); worktrees.release(r.worktreePath, r.id); }
          persist(); return;
        }
        r.taskStatus = classifyTask(r, processStatus);
        if (r.taskStatus === 'blocked') taskError ||= r.failedItems.map((x) => x.error).filter(Boolean).join('; ') || 'Codex reported a tool execution failure.';
        else if (r.taskStatus === 'failure' && processStatus === 'completed') taskError ||= 'Codex reported a failed turn.';
        else if (r.taskStatus === 'incomplete' && processStatus === 'completed') taskError ||= r.expectedArtifacts.find((p) => !r.changedFiles.includes(p))
          ? `Expected artifact was not created or changed: ${r.expectedArtifacts.find((p) => !r.changedFiles.includes(p))}`
          : !r.turnCompleted ? 'Codex did not report a completed turn.' : 'Task completion could not be verified.';
        if (processStatus !== 'completed') taskError ||= r.error || (code === 0 ? `terminated (${signal})` : r.stderr.trim().split('\n').at(-1) || `exit ${code}`);
        finish(r, processStatus, { code, signal, error: taskError, taskStatus: r.taskStatus });
      });
      const limit = Math.max(1, Math.min(30 * 60e3, Number(taskTimeout) || timeoutMs));
      r.timer = setTimeout(() => terminate(r, 'timeout'), limit); r.timer.unref?.();
      publish(r); persist();
      return { ok: true, run: publicRun(r) };
    } catch (e) {
      if (!terminal(r)) finish(r, 'failed', { error: `${e.code || 'start'}: ${e.message || e}` });
      return { ok: false, code: e.code || 'start', error: r.error, run: publicRun(r) };
    }
  }

  async function fingerprint(cwd, relative) {
    const target = path.resolve(cwd, relative);
    if (!target.startsWith(`${path.resolve(cwd)}${path.sep}`)) throw new Error('artifact escapes worktree');
    try {
      const real = await fs.promises.realpath(target), root = await fs.promises.realpath(cwd);
      if (!real.startsWith(`${root}${path.sep}`)) throw new Error('artifact resolves outside worktree');
      const stat = await fs.promises.stat(real);
      if (!stat.isFile()) throw new Error('artifact is not a file');
      return crypto.createHash('sha256').update(await fs.promises.readFile(real)).digest('hex');
    } catch (e) { if (e.code === 'ENOENT') return ''; throw e; }
  }
  async function inspectResult(r) {
    if (!r.worktreePath) return;
    const stdout = gitStatus ? await gitStatus(r.worktreePath) : (await exec('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: r.worktreePath, timeout: 15_000, windowsHide: true, maxBuffer: 1 << 20 })).stdout;
    r.changedFiles = stdout.split('\0').filter(Boolean).map((entry) => entry.slice(3).replace(/\\/g, '/')).filter(Boolean);
    r.artifactChanges = [];
    for (const p of r.expectedArtifacts) {
      const after = await fingerprint(r.workingDirectory, p);
      if (after && after !== r.baselineArtifacts[p]) r.artifactChanges.push(p);
    }
    persist();
  }
  function classifyTask(r, processStatus) {
    if (['cancelled', 'timeout', 'interrupted', 'unknown'].includes(processStatus)) return 'incomplete';
    if (processStatus !== 'completed') return 'failure';
    if (r.verificationError) return 'incomplete';
    if (r.failedItems.length) return 'blocked';
    if (r.turnFailed) return 'failure';
    if (!r.turnCompleted) return 'incomplete';
    if (r.expectedArtifacts.some((p) => !r.artifactChanges.includes(p))) return 'incomplete';
    return 'success';
  }
  function terminate(r, status) {
    if (!r || terminal(r) || !r.child) return false;
    r.requestedTerminalState = status; r.status = r.outcome = r.processStatus = status; r.taskStatus = 'incomplete'; r.endedAt = r.lastAt = Date.now();
    appendEvent(r, `run.${status}`); clearTimeout(r.timer); r.timer = null; publish(r); persist();
    try { r.child.kill(); } catch { /* close/error may already be queued */ }
    return true;
  }
  function stop(id) { return terminate(runs.get(id), 'cancelled'); }
  async function cleanup(id) {
    const r = runs.get(id);
    if (!r || ACTIVE.has(r.status) || !r.worktreePath || owners.has(r.worktreePath)) return { ok: false, code: 'activeOrMissing' };
    const result = await worktrees.cleanup({ repoRoot: r.repoRoot, worktreePath: r.worktreePath, owner: r.id });
    if (!result.ok) return result;
    r.worktreePath = ''; persist(); return { ok: true };
  }
  function list() { return [...runs.values()].map(publicRun); }
  function get(id) { const r = runs.get(id); return r ? publicRun(r) : null; }
  function dispose() { clearTimeout(saveTimer); persist(); }
  return { start, list, get, stop, cleanup, dispose, flush: () => persist(), max };
}
