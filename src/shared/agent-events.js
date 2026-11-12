// Normalised agent events (spec §7): turns the office's own events (server/index.mjs mk(): start, prompt, read, edit, bash,
// testok, wait, substart, stop, …) into one vocabulary — agent.started, agent.tool_started, agent.awaiting_approval, … —
// and keeps an honest state per agent (main session or subagent). Shared by the server (/api/production/agents) and the
// page, so it carries no words: the page names kinds and states in its own language.
// Honesty rules: a state comes only from a real event; an agent with no event for STALE_MS shows 'unknown', never 'running';
// events marked demo are refused, so demo mode can never enter the production model.

import { deptOf } from './departments.js';

export const KINDS =['agent.started', 'agent.stopped', 'agent.task_assigned', 'agent.turn_started', 'agent.message', 'agent.execution_ended', 'agent.status.unknown', 'agent.tool_started', 'agent.tool_completed', 'agent.tool_failed',
  'agent.file_created', 'agent.file_modified', 'agent.file_deleted', 'agent.awaiting_approval', 'agent.waiting', 'agent.completed', 'agent.failed'];
export const STATES = ['running', 'reviewing', 'waiting', 'blocked', 'done', 'failed', 'unknown'];
// source: how we know (spec §7 data accuracy) — 'execution' is a hook Claude Code sent; 'inferred' is read from a tool's
// input (an edit was asked for, not yet confirmed on disk).
const BY_TYPE = {
  start: 'agent.started', substart: 'agent.started', end: 'agent.stopped', substop: 'agent.stopped', interrupt: 'agent.stopped',
  prompt: 'agent.task_assigned', stop: 'agent.completed', fail: 'agent.failed', testfail: 'agent.tool_failed',
  codexmessage: 'agent.message',
  codexturn: 'agent.turn_started',
  codexexit: 'agent.execution_ended',
  codex_start: 'agent.started', codex_prompt: 'agent.task_assigned',
  codex_tool_start: 'agent.tool_started', codex_tool_complete: 'agent.tool_completed', codex_tool_fail: 'agent.tool_failed',
  codex_execution_end: 'agent.execution_ended',
  antigravity_observed: 'agent.status.unknown',
  testok: 'agent.tool_completed', deploy: 'agent.tool_completed', wait: 'agent.awaiting_approval', idle: 'agent.waiting',
  edit: 'agent.file_modified', write: 'agent.file_modified',
  create: 'agent.file_created', delete: 'agent.file_deleted',
};
const NOT_TOOLS = new Set(['compact', 'other']);
export const STALE_MS = 10 * 60e3;
const SEEN_MAX = 5000;

export const agentId = (e) => (e.agent ? `${e.sess}:${e.agent}` : String(e.sess));

// One office event -> one normalised event, or null when it is not an agent event (or malformed).
export function normalize(e) {
  if (!e || typeof e !== 'object' || e.demo) return null;
  if (!Number.isFinite(e.id) || !Number.isFinite(e.ts) || !e.sess || typeof e.type !== 'string') return null;
  const type = e.type;
  let kind = BY_TYPE[type];
  if (!kind && !NOT_TOOLS.has(type)) kind = 'agent.tool_started';   // read, grep, bash, web, agent, test, skill, mcp, …
  if (!kind) return null;
  // a failure on a subagent's tool is that tool failing; on the main session without a tool it is the turn failing
  if (type === 'fail' && e.agent) kind = 'agent.tool_failed';
  const sub = e.agent || null;
  return {
    id: e.id, ts: e.ts, kind, type,
    agent: agentId(e), parent: sub ? String(e.sess) : null, sess: String(e.sess),
    name: sub ? e.agentType || '' : e.name || '',
    label: typeof e.label === 'string' ? e.label : '',
    source: kind === 'agent.file_modified' ? 'inferred' : 'execution',
    ...(e.runner ? { runner: e.runner } : {}),
  };
}

const STATE_OF = {
  'agent.started': 'running', 'agent.task_assigned': 'running', 'agent.tool_started': 'running', 'agent.tool_completed': 'running',
  'agent.file_modified': 'running', 'agent.file_created': 'running', 'agent.file_deleted': 'running', 'agent.tool_failed': 'running',
  'agent.message': 'running',
  'agent.turn_started': 'running',
  'agent.execution_ended': 'unknown',
  'agent.status.unknown': 'unknown',
  'agent.awaiting_approval': 'blocked', 'agent.waiting': 'waiting', 'agent.completed': 'done', 'agent.stopped': 'done', 'agent.failed': 'failed',
};

// The live model: ingest() each office event once (duplicates and demo events are refused), snapshot() for the page.
export function createAgentModel({ max = 200 } = {}) {
  const agents = new Map(), seen = new Set(), order = [];
  const ingest = (raw) => {
    const n = normalize(raw);
    if (!n || seen.has(n.id)) return null;
    seen.add(n.id); order.push(n.id);
    if (order.length > SEEN_MAX) seen.delete(order.shift());
    let a = agents.get(n.agent);
    if (!a) {
      if (agents.size >= max) { const oldest = [...agents.values()].sort((x, y) => x.lastAt - y.lastAt)[0]; agents.delete(oldest.id); }
      a = { id: n.agent, parent: n.parent, sess: n.sess, name: n.name, state: 'unknown', since: n.ts, lastAt: 0, lastId: 0, last: null, tools: 0, fails: 0, files: 0, dept: null };
      agents.set(n.agent, a);
    }
    if (n.name && !a.name) a.name = n.name;
    if (n.kind === 'agent.tool_started') a.tools++;
    if (n.kind === 'agent.tool_failed') a.fails++;
    if (['agent.file_created', 'agent.file_modified', 'agent.file_deleted'].includes(n.kind)) a.files++;
    const d = deptOf(n); if (d) a.dept = d;   // the last department a real event placed it in; unplaceable events keep it
    // an event that arrives late (lower id than the last one applied) counts, but does not move the state back
    if (n.id > a.lastId) {
      const st = n.runner && n.kind === 'agent.tool_started' ? 'reviewing' : STATE_OF[n.kind];
      if (st !== a.state) { a.state = st; a.since = n.ts; }
      a.lastId = n.id; a.lastAt = n.ts; a.last = { kind: n.kind, type: n.type, label: n.label };
    }
    return n;
  };
  const stateAt = (a, now) => (a.state !== 'done' && a.state !== 'failed' && now - a.lastAt > STALE_MS ? 'unknown' : a.state);
  const snapshot = (now = Date.now()) => [...agents.values()].map((a) => ({ ...a, state: stateAt(a, now) })).sort((x, y) => y.lastAt - x.lastAt);
  const load = (events) => { for (const e of [...events].sort((x, y) => x.id - y.id)) ingest(e); };   // recovery: the office's saved feed
  return { ingest, snapshot, load, get size() { return agents.size; } };
}
