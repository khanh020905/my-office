// "Ngắt vòng lặp kẹt": a session going round in circles, caught before it burns more. Three signs, read from the hooks
// and the status line (code.claude.com/docs/en/hooks, /statusline):
//   repeat   the same tool call failing the same way N times in a row (PostToolUseFailure's `error`);
//   compact  automatic compaction after compaction (PreCompact, trigger "auto"), 3 in half an hour;
//   cost     the session's cost (status line `cost.total_cost_usd`) rising for X minutes with no file edited.
// Only the first is acted on: the next identical call is denied by the synchronous PreToolUse hook (/hook/loop), with
// a reason Claude reads. The other two are shown, for you to decide. Anything you type (UserPromptSubmit) forgives all:
// a session you are driving is never denied unless the rule fires again after it.
// No files, no network, the clock passed in: the tests drive it (tests/unit/loops.test.mjs).
import crypto from 'node:crypto';

export const LOOP_DEFAULTS = { on: true, n: 3, min: 10 };
export const LOOP_N = [2, 3, 4, 5], LOOP_MIN = [5, 10, 20, 30];   // (the choices in Settings)
const SESS_MAX = 64, AGENTS_MAX = 8, HINT_MAX = 1000;
const COMPACT_N = 3, COMPACT_MS = 30 * 60e3;
// cost: at least this much spent in the window, and the cost still going up (a quiet spell longer than this starts
// the window again: a long test run is waiting, not burning)
const COST_MIN_USD = 0.5, QUIET_MS = 5 * 60e3;
const STOP_MS = 15 * 60e3;   // a Stop not taken up by then is dropped (the session never called a tool again)
const EDITS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
// a success of one of these is looking around, not another attempt: it doesn't break a run of failures
const LOOKS = new Set(['Read', 'NotebookRead', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'ToolSearch', 'BashOutput', 'TaskOutput']);

// The same call: its tool and its input, with whitespace evened out and the fields that don't change what runs left
// out (Claude words a Bash `description` afresh each time).
const IGNORE = new Set(['description', 'timeout', 'run_in_background']);
function canon(v, top = true) {
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim();
  if (Array.isArray(v)) return v.map((x) => canon(x, false));
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).filter((k) => !(top && IGNORE.has(k))).sort().map((k) => [k, canon(v[k], false)]));
  return v;
}
const digest = (s) => crypto.createHash('sha1').update(s).digest('base64url').slice(0, 16);
export const callKey = (name, input) => digest(`${name || ''}\0${JSON.stringify(canon(input || {}))}`);
// The same error: what changes from one run to the next (times, durations, process ids and ports, hex addresses,
// temporary folders, Claude Code's truncation marker) doesn't make it a different one. Small numbers stay: "3 failed"
// and "2 failed" are not the same result.
export function errKey(err) {
  const s = String(err ?? '')
    .replace(/\.\.\. \[\d+ characters truncated\] \.\.\./g, '…')
    .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z?/g, '#time').replace(/\b\d{1,2}:\d\d(:\d\d(\.\d+)?)?\b/g, '#time')
    .replace(/\b\d+(\.\d+)?\s?(ms|s|sec|m|min)\b/g, '#dur').replace(/\b0x[0-9a-f]+\b/gi, '#hex').replace(/\b\d{4,}\b/g, '#n')
    .replace(/\/(private\/)?(tmp|var\/folders)\/\S+/g, '/tmp/…').replace(/\s+/g, ' ').trim();
  return digest(s.slice(0, 8000));
}
const defaultLabel = (name, i = {}) => String(i.command || i.file_path || i.url || i.pattern || i.query || name || '').replace(/\s+/g, ' ').trim().slice(0, 60);

/** config() -> { on, n, min } (Settings), labelOf(tool, input) -> the call in a few words, now() -> ms. */
export function createLoopGuard({ config = () => LOOP_DEFAULTS, labelOf = defaultLabel, now = Date.now } = {}) {
  const known = new Map();   // Claude's session id -> what we know of it (the 64 heard from last)
  function sess(sid) {
    let x = known.get(sid);
    if (x) { known.delete(sid); known.set(sid, x); return x; }   // (the newest last: the oldest are dropped first)
    x = { streaks: new Map(), compacts: [], cost: null, stuck: null, stop: 0, hint: null, mode: '' };
    known.set(sid, x);
    if (known.size > SESS_MAX) known.delete(known.keys().next().value);
    return x;
  }
  const cfg = () => {
    const c = config() || {};
    return { on: c.on !== false, n: LOOP_N.includes(c.n) ? c.n : LOOP_DEFAULTS.n, min: LOOP_MIN.includes(c.min) ? c.min : LOOP_DEFAULTS.min };
  };
  const rebase = (x, t) => { if (x.cost) Object.assign(x.cost, { usd0: x.cost.usd, at0: t, riseAt: t, fired: false }); };
  // the session is unstuck (you wrote, it edited, its turn ended): what was shown goes, and why
  function unstick(x, why) {
    const was = x.stuck; x.stuck = null;
    return was ? { type: 'clear', why, stuck: was } : null;
  }
  function fire(x, stuck) { x.stuck = { ...stuck, at: now() }; return { type: 'fire', stuck: x.stuck }; }

  /** A hook event (the async ones, as they arrive). -> a signal for the office, or null. */
  function onEvent(p) {
    const sid = p?.session_id, ev = p?.hook_event_name; if (!sid || !ev) return null;
    const x = sess(sid), t = now(), who = p.agent_id || 'main';
    if (typeof p.permission_mode === 'string') x.mode = p.permission_mode;
    switch (ev) {
      case 'UserPromptSubmit': case 'Stop': case 'StopFailure': case 'SessionEnd': {
        // you are driving now, or the turn is over: everything forgiven, a Stop or a hint not taken up dropped
        const lost = x.hint; x.streaks.clear(); x.compacts = []; x.stop = 0; x.hint = null; rebase(x, t);
        const sig = unstick(x, ev === 'UserPromptSubmit' ? 'you' : 'end');
        return sig ? { ...sig, hintLost: !!lost } : lost ? { type: 'hintLost' } : null;
      }
      case 'PostToolUseFailure': {
        if (p.is_interrupt) return null;   // (stopped by you: not a failure of its own)
        const key = callKey(p.tool_name, p.tool_input), err = errKey(p.error), cur = x.streaks.get(who);
        if (cur && cur.key === key && cur.err === err) { cur.fails++; cur.at = t; return null; }
        x.streaks.delete(who);
        x.streaks.set(who, { key, err, fails: 1, blocked: 0, at: t, tool: p.tool_name || '', label: labelOf(p.tool_name, p.tool_input || {}) });
        if (x.streaks.size > AGENTS_MAX) x.streaks.delete(x.streaks.keys().next().value);
        return null;
      }
      case 'PostToolUse': {
        if (EDITS.has(p.tool_name)) {   // a file changed: the next try may well work, and it is progress
          x.streaks.clear(); rebase(x, t);
          return x.stuck?.kind === 'repeat' || x.stuck?.kind === 'cost' ? unstick(x, 'edit') : null;
        }
        const cur = x.streaks.get(who);
        if (cur && (cur.key === callKey(p.tool_name, p.tool_input) || !LOOKS.has(p.tool_name))) {   // (it worked, or it tried something else)
          x.streaks.delete(who);
          return x.stuck?.kind === 'repeat' && x.stuck.agent === who ? unstick(x, 'ok') : null;
        }
        return null;
      }
      case 'PreCompact': {
        if (p.trigger === 'manual') return null;   // (you asked for it)
        x.compacts = x.compacts.filter((a) => t - a < COMPACT_MS); x.compacts.push(t);
        if (x.compacts.length < COMPACT_N || x.stuck || !cfg().on) return null;
        return fire(x, { kind: 'compact', n: x.compacts.length, mins: Math.max(1, Math.round((t - x.compacts[0]) / 60e3)) });
      }
      default: return null;
    }
  }

  /** The status line's `cost` for a session; working: it isn't resting. -> a signal, or null. */
  function onStatus(sid, cost, working) {
    if (!sid || !cost || typeof cost.total_cost_usd !== 'number' || !Number.isFinite(cost.total_cost_usd)) return null;
    const x = sess(sid), t = now(), usd = cost.total_cost_usd, lines = `${cost.total_lines_added ?? ''}/${cost.total_lines_removed ?? ''}`;
    const c = x.cost;
    if (!c || usd < c.usd) { x.cost = { usd0: usd, usd, at0: t, riseAt: t, lines, fired: false }; return null; }   // (first seen, or a new session after /clear)
    if (lines !== c.lines) {   // lines added or removed: it edited (the status line counts them)
      c.lines = lines; c.usd = usd; rebase(x, t);
      return x.stuck?.kind === 'cost' ? unstick(x, 'edit') : null;
    }
    if (usd > c.usd) { if (t - c.riseAt > QUIET_MS) Object.assign(c, { usd0: c.usd, at0: t, fired: false }); c.riseAt = t; c.usd = usd; }
    const { on, min } = cfg();
    if (!on || !working || c.fired || x.stuck || x.mode === 'plan') return null;   // (planning edits nothing, on purpose)
    if (t - c.at0 < min * 60e3 || usd - c.usd0 < COST_MIN_USD || t - c.riseAt > QUIET_MS) return null;
    c.fired = true;
    return fire(x, { kind: 'cost', usd: Math.round((usd - c.usd0) * 100) / 100, mins: Math.round((t - c.at0) / 60e3) });
  }

  /** The synchronous PreToolUse hook: what to do with this call. -> { stop, deny: { n, label, blocked } | null,
      hint: text | null, sig } (all empty: let it through, Claude Code's own permission flow decides). */
  function check(p) {
    const sid = p?.session_id, x = sid && known.get(sid);
    if (!x) return { stop: false, deny: null, hint: null, sig: null };
    const t = now(), who = p.agent_id || 'main';
    if (x.stop && t - x.stop < STOP_MS) return { stop: true, deny: null, hint: null, sig: { type: 'stopped' } };   // (every call until the turn ends)
    x.stop = 0;
    const c = cfg(), cur = x.streaks.get(who);
    let deny = null, sig = null;
    if (c.on && cur && cur.fails >= c.n && cur.key === callKey(p.tool_name, p.tool_input)) {
      cur.blocked++;
      deny = { n: cur.fails, label: cur.label, blocked: cur.blocked };
      if (x.stuck?.kind === 'repeat' && x.stuck.agent === who) { x.stuck.blocked = cur.blocked; sig = { type: 'blocked', stuck: x.stuck }; }
      else sig = fire(x, { kind: 'repeat', agent: who, label: cur.label, tool: cur.tool, n: cur.fails, blocked: cur.blocked });
    }
    // a hint from you goes to whoever is stuck (a subagent, maybe), else to the main conversation
    let hint = null;
    if (x.hint && who === (x.stuck?.agent || 'main')) { hint = x.hint; x.hint = null; sig ||= { type: 'hint' }; if (sig.type !== 'hint') sig.hint = true; }
    return { stop: false, deny, hint, sig };
  }

  return {
    onEvent, onStatus, check,
    /** You pressed Stop: every next call of the session ends its turn (continue: false), until the turn is over. */
    stop(sid) { if (!sid) return false; sess(sid).stop = now(); return true; },
    /** Your hint, for Claude at its next step (a turn already over can't take it: the chat carries the conversation on). */
    hint(sid, text) { const h = String(text || '').trim().slice(0, HINT_MAX); if (!sid || !h) return false; sess(sid).hint = h; return true; },
    stuckOf: (sid) => known.get(sid)?.stuck || null,
    config: cfg,
  };
}
