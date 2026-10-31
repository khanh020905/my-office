// Phone work as Claude Code's own background sessions (agent view: code.claude.com/docs/en/agent-view), in place of
// `claude -p`: `claude --bg … -- <prompt>` starts one and prints its short id, `claude agents --json --all` says how each
// is doing, `claude stop <id>` stops one (its conversation kept: `claude attach <id>` opens it again). Such a session is a
// whole Claude Code: its hooks still reach the office, and it can wait for a person, so an approval waits on the phone
// until answered instead of the 45 s a `-p` run gets. All of it checked on Claude Code 2.1.311–2.1.316 (see the README).
// The pure parts (what it printed, what a row means, the settings it is given) are here for the unit tests.
import { execFile } from 'node:child_process';
import fs from 'node:fs';

/** Whether this Claude Code has background sessions: its --help lists --bg and the agents command. */
export const hasBg = (help) => /(^|\s)--bg\b/.test(String(help || '')) && /^\s+agents\b/m.test(String(help || ''));
/** "2.1.316 (Claude Code)" -> '2.1.316' */
export const versionOf = (out) => (/(\d+\.\d+\.\d+)/.exec(String(out || '')) || [])[1] || null;

/** What `claude --bg` printed: the session's short id, and whether it had to start a copy of the conversation you asked
    to carry on (it was running already, or keeps options of its own): { id, copy } or null */
export function parseBackgrounded(out) {
  const s = String(out || ''), m = /backgrounded\s+·\s+([0-9a-f]{6,16})\b/i.exec(s);
  return m ? { id: m[1], copy: /started a copy as\s+[0-9a-f]{6,16}/i.test(s) } : null;
}
/** Why it didn't start: a folder nobody accepted the trust prompt for ("Workspace not trusted"), or anything else */
export const bgRefusal = (out) => (/workspace not trusted|not trusted/i.test(String(out || '')) ? 'untrusted' : 'failed');

/** One row of `claude agents --json --all` the way the office tells it: { phase: 'work' | 'wait' | 'done' | 'fail' |
    'stopped' | 'gone', wait: what it waits for (Claude Code's words: 'permission prompt', 'input needed', …) | null } */
export function bgPhase(row) {
  if (!row || typeof row !== 'object') return { phase: 'gone', wait: null };
  const st = String(row.state || ''), wait = typeof row.waitingFor === 'string' ? row.waitingFor : null;
  if (st === 'failed') return { phase: 'fail', wait: null };
  if (st === 'stopped') return { phase: 'stopped', wait: null };
  if (st === 'done') return { phase: 'done', wait: null };
  if (st === 'blocked' || row.status === 'waiting') return { phase: 'wait', wait };
  return { phase: 'work', wait: null };
}
/** The rows `claude agents --json` printed (anything else: none) */
export function parseAgents(out) {
  const s = String(out || ''), i = s.indexOf('['), j = s.lastIndexOf(']');
  if (i < 0 || j < i) return [];
  try { const a = JSON.parse(s.slice(i, j + 1)); return Array.isArray(a) ? a.filter((r) => r && typeof r === 'object') : []; } catch { return []; }
}

// how long an approval or a question may wait in a background session the office started (its hook's own limit)
export const HOLD_S = 24 * 3600;
/** The settings each background session the office starts gets (`--settings`). Claude Code keeps them with the session
    and uses them again whenever it wakes it, so they say nothing about one task: it edits the working copy as `claude -p`
    does (no worktree of its own, nothing committed or pushed by itself); it tells the office which session it is when it
    starts (/hook/bind, with its short id and its inbox, server/steer.mjs); approvals and Claude's questions go to the office and wait until answered
    (`?long=1`; the office answers at once, with nothing, for a session that isn't a phone's work now). */
export function bgSettings({ port, win = false, send = '' }) {
  const url = (route) => `http://127.0.0.1:${port}${route}`;
  // (curl where the shell has it; the small node script on Windows, which reads the job's folder itself)
  const bind = win ? `${send} ${url('/hook/bind')} --async --job`
    : `curl -s -m 2 -o /dev/null -H 'Content-Type: application/json' -H "X-Office-Job: \${CLAUDE_JOB_DIR##*/}" -H "X-Office-Inbox: \$CLAUDE_CODE_MESSAGING_SOCKET" --data-binary @- ${url('/hook/bind')} || true`;
  const wait = (route) => (win ? `${send} ${url(route)} --wait ${HOLD_S}`
    : `curl -s --max-time ${HOLD_S} -H 'Content-Type: application/json' --data-binary @- '${url(route)}' || true`);
  return JSON.stringify({
    worktree: { bgIsolation: 'none' },
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: bind, timeout: 5 }] }],
      PermissionRequest: [{ hooks: [{ type: 'command', command: wait('/hook/permission?long=1'), timeout: HOLD_S + 10 }] }],
      PreToolUse: [{ matcher: 'AskUserQuestion|ExitPlanMode', hooks: [{ type: 'command', command: wait('/hook/question?long=1'), timeout: HOLD_S + 10 }] }],
    },
  });
}
/** The settings a `claude -p` run the office starts gets: only its SessionStart hook, telling the office which task it is
    and where its inbox is (a `-p` session writes no session file to find it in), so a note can reach it while it works. */
export function printSettings({ port, task, win = false, send = '' }) {
  const url = `http://127.0.0.1:${port}/hook/bind?task=${encodeURIComponent(task)}`;
  const command = win ? `${send} ${url} --async --job`
    : `curl -s -m 2 -o /dev/null -H 'Content-Type: application/json' -H "X-Office-Inbox: \$CLAUDE_CODE_MESSAGING_SOCKET" --data-binary @- '${url}' || true`;
  return JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command, timeout: 5 }] }] } });
}

/** Running Claude Code for these: { probe(bin) -> { ok, version }, run(bin, args, { cwd, env, timeout }), list(bin, env),
    stop(bin, id, env) }. The probe is kept per binary (and its date), so an update is looked at again. */
export function createBg() {
  const probes = new Map();   // file + mtime -> { promise, value (once known) }
  const run = (file, args, { cwd, env, timeout = 30_000 } = {}) => new Promise((resolve) => {
    execFile(file, args, { cwd, env, timeout, maxBuffer: 4_000_000, windowsHide: true }, (err, stdout, stderr) =>
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: String(stdout || ''), err: String(stderr || '') }));
  });
  const keyOf = (bin) => { let k = bin.file; try { k += `:${fs.statSync(bin.file).mtimeMs}`; } catch { /* gone: looked at again */ } return k; };
  function probe(bin) {
    if (!bin?.file) return Promise.resolve({ ok: false, version: null });
    const key = keyOf(bin);
    if (!probes.has(key)) {
      if (probes.size > 8) probes.clear();
      const p = { value: null };
      p.promise = Promise.all([run(bin.file, ['--help'], { timeout: 15_000 }), run(bin.file, ['--version'], { timeout: 15_000 })])
        .then(([h, v]) => (p.value = { ok: h.code === 0 && hasBg(h.out), version: versionOf(v.out) }));
      probes.set(key, p);
    }
    return probes.get(key).promise;
  }
  return {
    probe,
    /** what it said, once looked at (null until then) */
    known: (bin) => (bin?.file ? probes.get(keyOf(bin))?.value || null : null),
    run,
    list: async (file, env) => parseAgents((await run(file, ['agents', '--json', '--all'], { env, timeout: 20_000 })).out),
    stop: async (file, id, env) => (await run(file, ['stop', id], { env, timeout: 20_000 })).code === 0,
  };
}
