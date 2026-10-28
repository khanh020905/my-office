#!/usr/bin/env node
// My Office — local server.
// Claude Code hooks POST every event to /event (loopback only). The server keeps one record per
// open session (names come from ~/.claude/sessions/<pid>.json), strips anything that looks like a
// secret, and streams compact events to the office page over Server-Sent Events.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { sysSnapshot, sysAction, scanCleanups, trackOwners, setI18n } from './system.mjs';
import { OS } from './platform/index.mjs';
import { redact } from './redact.mjs';
import { scanUsage, blankUsage, ctxMax } from './usage.mjs';
import next from 'next';
import { buildTimeline } from '../src/shared/timeline.js';
import { createTrophies } from './trophies.mjs';
import { createGit } from './git.mjs';
import { weekSummary } from './wrapped.mjs';
import { createPrefs } from './prefs.mjs';
import { pickLang, createT } from '../src/i18n/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OFFICE_PORT) || 4310;
// Only this Mac by default; `my-office start --lan` (or OFFICE_HOST=0.0.0.0) opens it to the home wifi.
const HOST = process.env.OFFICE_HOST || '127.0.0.1';
const HOME = os.homedir();
// Claude Code's own config folder (CLAUDE_CONFIG_DIR moves it, as it does for Claude Code).
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const SESS_DIR = path.join(CLAUDE_DIR, 'sessions');
// OFFICE_LOG: append the server's output to a file (the Windows sign-in script has nowhere else to put it)
if (process.env.OFFICE_LOG) { const out = fs.createWriteStream(process.env.OFFICE_LOG, { flags: 'a' }); process.stdout.write = process.stderr.write = out.write.bind(out); }
const DATA_DIR = process.env.OFFICE_DATA_DIR ? path.resolve(process.env.OFFICE_DATA_DIR) : path.join(ROOT, 'data');   // tests and a second dev copy use their own
const PAGE_FILES = new Set(['/favicon.ico', '/icon.svg', '/apple-icon.png', '/opengraph-image.jpg', '/twitter-image.jpg']);   // (app/: the tab icons and the share card)
const prefs = createPrefs(DATA_DIR), { tr } = prefs;   // tr('area.key', vars): words in the office's language (src/i18n)
const num = (n, digits) => createT(prefs.lang()).num(n, digits);   // a number written the office's way (1,000 / 1.000)
setI18n({ tr, num, lang: prefs.lang });   // the Mac drawer's tips (system.mjs) speak the same language
const DESKS = 9;
const FEED_MAX = 80;

fs.mkdirSync(DATA_DIR, { recursive: true });

// Phones on the LAN need this token in the URL; requests from the Mac itself don't.
const TOKEN_FILE = path.join(DATA_DIR, 'token');
const TOKEN = fs.existsSync(TOKEN_FILE)
  ? fs.readFileSync(TOKEN_FILE, 'utf8').trim()
  : (() => { const t = crypto.randomBytes(9).toString('base64url'); fs.writeFileSync(TOKEN_FILE, t, { mode: 0o600 }); return t; })();
// Or a 6-digit PIN typed on /pin, which sets a signed 30-day cookie. The PIN is read from disk on each use, so
// `my-office pin --new` takes effect at once and signs out every phone (the cookie signature covers the PIN).
const PIN_FILE = path.join(DATA_DIR, 'pin');
function currentPin() {
  try { const p = fs.readFileSync(PIN_FILE, 'utf8').trim(); if (/^\d{6}$/.test(p)) return p; } catch { /* first run */ }
  const p = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  fs.writeFileSync(PIN_FILE, p, { mode: 0o600 });
  return p;
}
currentPin();

/* ---------- text helpers ---------- */
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
// Text pasted into a prompt arrives wrapped in <pasted_content id="…"> tags (the closing one may be cut off): keep the
// text, drop the tags, so a task reads "Failed to run…" rather than "<pasted_content id="afc8"> Failed…".
const unwrapPaste = (s) => String(s ?? '').replace(/<\/?pasted_content\b[^>]*>/g, ' ');
const base = (p) => (p ? path.basename(String(p)) : '');
const tilde = (p) => (p && p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p || '');

const host = (u) => { try { return new URL(u).hostname; } catch { return 'web'; } };

// Commands without a description get a name from their first words, in the office's language (server.cmd.*).
const CMD_LABELS = [
  [/^(npm|pnpm|yarn|bun)( run)? test\b|\bvitest\b|\bjest\b/, 'test'],
  [/^(npm|pnpm|yarn|bun)( run)? build\b|\bnext build\b/, 'build'],
  [/^(npm|pnpm|yarn|bun)( run)? dev\b|\bnext dev\b/, 'dev'],
  [/^(npm|pnpm|yarn|bun)( run)? lint\b|\beslint\b/, 'lint'],
  [/^(npm|pnpm|yarn|bun) (i|install|add|ci)\b/, 'install'],
  [/\btsc\b/, 'tsc'],
  [/^git (status|diff|log|show|blame)\b/, 'gitLog'],
  [/^git (add|commit)\b/, 'commit'],
  [/^git push\b/, 'push'],
  [/^git (pull|fetch|checkout|switch)\b/, 'sync'],
  [/^(curl|wget|http)\b/, 'api'],
  [/^(ssh|scp|rsync)\b/, 'remote'],
  [/^(psql|mysql|sqlite3|supabase)\b/, 'db'],
  [/^(docker|docker-compose)\b/, 'docker'],
  [/playwright/, 'ui'],
  [/^(python3?|node|tsx|ts-node|deno)\b/, 'script'],
  [/^(ls|cat|head|tail|find|grep|rg|wc|sed|awk|du|tree)\b/, 'files'],
  [/^(rm|mv|cp|mkdir|touch|chmod|ln)\b/, 'tidy'],
  [/^(kill|pkill|lsof|ps)\b/, 'procs'],
  [/^open\b/, 'open'],
];
function bashLabel(i) {
  if (i.description) return clip(redact(oneLine(i.description)), 60);
  let c = String(i.command || '').split('\n')[0].trim().replace(/^cd\s+\S+\s*&&\s*/, '');
  c = redact(c);
  const short = c.split(/\s+/).slice(0, 3).join(' ');
  const hit = CMD_LABELS.find(([re]) => re.test(c));
  return clip(hit ? `${tr(`server.cmd.${hit[1]}`)} · ${short}` : short, 48);
}

// When the office speaks Vietnamese, English descriptions (written by Claude) become Vietnamese via Google's free
// translate endpoint, cached on disk. OFFICE_TRANSLATE=0 keeps everything local.
const VI_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const TRANSLATE = process.env.OFFICE_TRANSLATE !== '0';
const VI_FILE = path.join(DATA_DIR, 'vi-cache.json');
let viCache = {};
try { viCache = JSON.parse(fs.readFileSync(VI_FILE, 'utf8')); } catch { /* first run */ }
let viDirty = false;
setInterval(() => {
  if (!viDirty) return;
  viDirty = false;
  const keys = Object.keys(viCache);
  if (keys.length > 3000) for (const k of keys.slice(0, keys.length - 3000)) delete viCache[k];
  fsp.writeFile(VI_FILE, JSON.stringify(viCache)).catch(() => {});
}, 15_000).unref();
// One request per text at a time, three tries a few seconds apart (the free endpoint rate-limits in bursts).
const viWait = new Map();
function fetchVi(text) {
  if (viWait.has(text)) return viWait.get(text);
  const job = (async () => {
    for (let k = 0; k < 3; k++) {
      try {
        const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(4000) });
        if (r.ok) { const j = await r.json(); const out = (j?.[0] || []).map((x) => x?.[0] || '').join('').trim(); if (out) { viCache[text] = out; viDirty = true; return out; } }
      } catch { /* offline or rate-limited */ }
      await new Promise((res) => setTimeout(res, 1500 * (k + 1)));
    }
    return null;
  })().finally(() => viWait.delete(text));
  viWait.set(text, job);
  return job;
}
// Waits up to 1.5 s; a translation that lands later is sent as {k:'vi', from, to} and the page swaps the words in.
async function toVi(text) {
  if (!TRANSLATE || prefs.lang() !== 'vi' || !text || VI_CHARS.test(text) || !/[a-z]{3}/i.test(text)) return text;
  if (viCache[text]) return viCache[text];
  const job = fetchVi(text);
  const out = await Promise.race([job, new Promise((res) => setTimeout(() => res(undefined), 1500))]);
  if (out) return out;
  if (out === undefined) job.then((late) => {
    if (!late) return;
    for (const x of feed) { if (x.label === text) x.label = late; if (x.desc === text) x.desc = late; }
    for (const s of sessions.values()) for (const o of [s, ...Object.values(s.subs || {})]) { if (o.last?.label === text) o.last.label = late; if (o.desc === text) o.desc = late; }
    broadcast({ k: 'vi', from: text, to: late });
  });
  return text;
}
async function classifyVi(name, input) {
  const c = classify(name, input);
  if (c.tr) c.label = await toVi(c.label);
  if (c.desc) c.desc = await toVi(c.desc);
  return c;
}

function classify(name = '', input = {}) {
  const i = input || {};
  switch (name) {
    case 'Read': return { type: 'read', label: base(i.file_path) };
    case 'NotebookRead': return { type: 'read', label: base(i.notebook_path) };
    case 'Grep': return { type: 'grep', label: clip(redact(oneLine(i.pattern)), 40) };
    case 'Glob': return { type: 'glob', label: clip(oneLine(i.pattern), 40) };
    case 'Edit': case 'MultiEdit': return { type: 'edit', label: base(i.file_path) };
    case 'NotebookEdit': return { type: 'edit', label: base(i.notebook_path) };
    case 'Write': return { type: 'write', label: base(i.file_path) };
    case 'Bash': return { type: 'bash', label: bashLabel(i), tr: !!i.description };
    case 'WebSearch': return { type: 'web', label: clip(redact(oneLine(i.query)), 48) };
    case 'WebFetch': return { type: 'fetch', label: host(i.url) };
    case 'Agent': case 'Task': return { type: 'agent', label: i.subagent_type || 'agent', desc: clip(redact(oneLine(i.description)), 50) };
    case 'TodoWrite': case 'TaskCreate': case 'TaskUpdate': case 'TaskList': return { type: 'plan', label: tr('server.tool.todos') };
    case 'EnterPlanMode': case 'ExitPlanMode': return { type: 'plan', label: tr('server.tool.plan') };
    case 'AskUserQuestion': return { type: 'ask', label: tr('server.tool.ask') };
    case 'Skill': return { type: 'skill', label: clip(oneLine(i.skill || i.name || 'skill'), 32) };
    case 'ToolSearch': return { type: 'skill', label: tr('server.tool.search') };
    default:
      if (name.startsWith('mcp__')) { const p = name.split('__'); return { type: 'mcp', label: clip(`${p[1]} · ${p.slice(2).join('__')}`, 40) }; }
      return { type: 'other', label: name || tr('server.tool.other') };
  }
}
const COUNT_OF = { Read: 'read', NotebookRead: 'read', Grep: 'read', Glob: 'read', Edit: 'edit', MultiEdit: 'edit', Write: 'edit', NotebookEdit: 'edit', Bash: 'cmd', WebSearch: 'web', WebFetch: 'web' };
const DEPLOY_RE = /\bgit\s+push\b[^\n;|&]*?\b(v\d+\.\d+\.\d+)\b/;

/* ---------- state ---------- */
const sessions = new Map(); // key ('p<pid>' or 's<sessionId>') -> session
const sidToKey = new Map();
let feed = [];
let seq = 0;
const today = () => new Date().toLocaleDateString('sv-SE');
let stats = { day: today(), read: 0, edit: 0, cmd: 0, web: 0, prompts: 0, deploy: 0 };
let dirty = false;

const STATE_FILE = path.join(DATA_DIR, 'state.json');
try {
  const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  if (saved.stats?.day === stats.day) stats = saved.stats;
  if (Array.isArray(saved.feed)) feed = saved.feed.slice(-FEED_MAX);
  seq = saved.seq || 0;
} catch { /* first run */ }
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  fsp.writeFile(STATE_FILE, JSON.stringify({ stats, feed, seq })).catch(() => {});
}, 10_000).unref();

const trophies = createTrophies({ dataDir: DATA_DIR, claudeDir: CLAUDE_DIR, today, deployRe: DEPLOY_RE, tr, num, onChange: (t, earned) => broadcast({ k: 'trophies', t, earned }) });

// Git: the session most recently active in a repository gets its commit / push / CI animation
const sessionsIn = (root) => [...sessions.values()].filter((s) => s.cwd && git.repoOf(s.cwd)?.root === root).sort((a, b) => (b.lastEventAt || 0) - (a.lastEventAt || 0));
function gitEvent(r, type, label) {
  const s = sessionsIn(r.root)[0]; if (!s) return;
  const e = { id: ++seq, ts: Date.now(), sess: s.id, name: s.name, type, label, repo: r.name, branch: r.branch, url: r.ciUrl || undefined };
  pushFeed(e); broadcast({ k: 'ev', e, s: pub(s), stats });
}
const git = createGit({
  onRepo: (r) => { for (const s of sessionsIn(r.root)) broadcast({ k: 'sess', s: pub(s) }); },
  onCommit: (r, subject) => gitEvent(r, 'commit', clip(redact(oneLine(subject)), 64)),
  onPush: (r) => gitEvent(r, 'push', r.branch),
  onCi: (r) => gitEvent(r, r.ci === 'red' ? 'cired' : 'cigreen', r.ciName),
});
const pollGit = () => git.poll([...sessions.values()].map((s) => s.cwd));
setInterval(() => { if (clients.size) pollGit(); }, 20_000).unref();
setInterval(() => { if (clients.size) git.pollCi(); }, 120_000).unref();

function rollDay() { if (stats.day !== today()) stats = { day: today(), read: 0, edit: 0, cmd: 0, web: 0, prompts: 0, deploy: 0 }; }

function newSession(key) {
  return { id: crypto.randomUUID(), key, sid: null, pid: null, name: '', cwd: '', link: null, desk: freeDesk(), status: 'rest', busy: false,
    lastPrompt: '', taskStart: 0, counts: { read: 0, edit: 0, cmd: 0, web: 0 }, subs: {}, last: null, fromFile: false, lastEventAt: 0, createdAt: Date.now() };
}
function freeDesk() {
  const used = new Set([...sessions.values()].map((s) => s.desk));
  for (let i = 0; i < DESKS; i++) if (!used.has(i)) return i;
  return -1;
}
const pubSub = (x) => ({ id: x.id, type: x.type, desc: x.desc || '', last: x.last || null, startedAt: x.startedAt, endedAt: x.endedAt || null, steps: x.steps || 0 });
const pub = (s) => ({ id: s.id, pid: s.pid, name: s.name, title: s.title || '', dir: tilde(s.cwd), link: s.link, desk: s.desk, status: s.status, lastPrompt: s.lastPrompt && oneLine(unwrapPaste(s.lastPrompt)),
  taskStart: s.taskStart, counts: s.counts, subs: Object.values(s.subs).map(pubSub), doneSubs: (s.doneSubs || []).map(pubSub), last: s.last, acct: acctOf(s),
  lastAt: s.lastEventAt || s.createdAt, doneAt: s.doneAt || 0, todos: s.todos || [], lastReply: s.lastReply || '', origin: s.origin || '',
  bg: s.bg ? [...s.bg.values()].slice(0, 6) : [],
  git: gitOf(s),
  usage: s.usage?.model ? { cost: Math.round(s.usage.cost * 100) / 100, ...liveCtx(s), model: s.usage.model, out: s.usage.out } : null });
function gitOf(s) { const r = s.cwd && git.repoOf(s.cwd); return r ? { repo: r.name, branch: r.branch, dirty: r.dirty, ahead: r.ahead, ci: r.ci, ciName: r.ciName, ciUrl: r.ciUrl } : null; }
// context: exact from the status line while it reports (last 15 min), else estimated from the transcript
const liveCtx = (s) => (s.live?.ctxMax && s.live.ctx != null && Date.now() - s.live.at < 15 * 60e3 ? { ctx: s.live.ctx, ctxMax: s.live.ctxMax, exact: true } : { ctx: s.usage.ctx, ctxMax: ctxMax(s.usage) });

// Subagent transcripts live next to the session transcript: <project>/<sessionId>/subagents/agent-<id>.jsonl (+ .meta.json).
function subDir(s) {
  const t = s.transcript || (s.sid && s.cwd ? path.join(CLAUDE_DIR, 'projects', s.cwd.replace(/[^A-Za-z0-9-]/g, '-'), `${s.sid}.jsonl`) : null);
  return t && s.sid ? path.join(path.dirname(t), s.sid, 'subagents') : null;
}
async function subMeta(s, agentId) {
  const dir = subDir(s);
  if (!dir || !/^[A-Za-z0-9_-]+$/.test(agentId)) return null;
  try { return JSON.parse(await fsp.readFile(path.join(dir, `agent-${agentId}.meta.json`), 'utf8')); } catch { return null; }
}
function ensureSub(s, agentId, type, now) {
  let x = s.subs[agentId];
  if (!x) {
    x = s.subs[agentId] = { id: agentId, type: type || 'agent', desc: '', startedAt: now, seenAt: now, steps: 0, last: null };
    subMeta(s, agentId).then(async (m) => {
      if (!m) return;
      x.desc = clip(redact(oneLine(await toVi(m.description || ''))), 70);
      if (m.agentType) x.type = m.agentType;
      broadcast({ k: 'sess', s: pub(s) });
    });
  }
  if (type && x.type === 'agent') x.type = type;
  return x;
}
function finishSub(s, agentId, now) {
  const x = s.subs[agentId];
  if (!x) return null;
  delete s.subs[agentId];
  x.endedAt = now;
  s.doneSubs = [x, ...(s.doneSubs || [])].slice(0, 8);
  return x;
}
const bySid = (sid) => sessions.get(sidToKey.get(sid));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// Background work a session started (a shell with run_in_background, a monitor): PostToolUse reports a started
// shell's id, and every Stop lists the tasks still running. Idea from cubicle (MIT). While any runs, the session's
// character keeps working instead of napping.
function trackBackground(s, p) {
  const resp = p.tool_response && typeof p.tool_response === 'object' ? p.tool_response : null;
  s.bg ||= new Map();
  if (p.hook_event_name === 'PostToolUse' && resp?.backgroundTaskId) {
    const i = p.tool_input || {};
    s.bg.set(String(resp.backgroundTaskId).slice(0, 60), { id: String(resp.backgroundTaskId).slice(0, 60), desc: clip(redact(oneLine(i.description || i.command || tr('server.tool.background'))), 70), at: Date.now() });
  }
  if (p.hook_event_name === 'PostToolUse' && /^(KillShell|KillBash|TaskStop)$/.test(p.tool_name || '')) {
    const id = String((p.tool_input || {}).shell_id || (p.tool_input || {}).task_id || ''); if (id) s.bg.delete(id);
  }
  if (Array.isArray(p.background_tasks)) {
    const running = p.background_tasks.filter((t) => t && t.id && t.type !== 'subagent' && (!t.status || t.status === 'running'));
    const keep = new Set(running.map((t) => String(t.id).slice(0, 60)));
    for (const id of [...s.bg.keys()]) if (!keep.has(id)) s.bg.delete(id);
    for (const t of running) { const id = String(t.id).slice(0, 60); if (!s.bg.has(id)) s.bg.set(id, { id, desc: clip(redact(oneLine(t.description || t.command || t.type || tr('server.tool.background'))), 70), at: Date.now() }); }
  }
}
// Claude's last words of a turn, when the Stop hook didn't carry them: the newest assistant text in the transcript tail.
async function lastReplyOf(s) {
  const file = transcriptOf(s); if (!file) return '';
  let fh;
  try {
    fh = await fsp.open(file, 'r');
    const { size } = await fh.stat(), len = Math.min(size, 400_000), buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"assistant"')) continue;
      let j; try { j = JSON.parse(lines[i]); } catch { continue; }
      const c = j.type === 'assistant' && j.message?.content;
      const text = Array.isArray(c) ? c.filter((x) => x?.type === 'text').map((x) => x.text).join(' ').trim() : '';
      if (text) return text;
    }
  } catch { /* no transcript */ } finally { await fh?.close(); }
  return '';
}
// Where a session runs: Claude Code writes `entrypoint` into the transcript (claude-vscode, cli, …).
// (product names stay as they are; only the desktop app's name is words, written in the office's language)
const ORIGINS = { 'claude-vscode': 'IDE', cli: 'Terminal', 'claude-desktop': () => tr('server.originApp'), remote: 'Cloud', 'sdk-cli': 'Agent SDK', 'sdk-ts': 'Agent SDK', 'sdk-py': 'Agent SDK' };
const originName = (e) => { const o = Object.hasOwn(ORIGINS, e) ? ORIGINS[e] : null; return typeof o === 'function' ? o() : o || e; };
async function originOf(s) {
  const file = transcriptOf(s); if (!file) return '';
  let fh;
  try { fh = await fsp.open(file, 'r'); const buf = Buffer.alloc(65536); const { bytesRead } = await fh.read(buf, 0, buf.length, 0); const m = /"entrypoint":"([^"]+)"/.exec(buf.toString('utf8', 0, bytesRead)); return m ? originName(m[1]) : ''; }
  catch { return ''; } finally { await fh?.close(); }
}

// Claude Code's own checklist (TodoWrite, or the newer TaskCreate / TaskUpdate), shown under the session's task on the
// whiteboard. Statuses become todo / doing / done.
const TODO_STATUS = { completed: 'done', in_progress: 'doing', pending: 'todo' };
function trackTodos(s, p) {
  const i = p.tool_input || {}, txt = (v) => clip(redact(oneLine(v)), 80);
  if (p.tool_name === 'TodoWrite' && Array.isArray(i.todos)) {
    s.todos = i.todos.slice(0, 20).map((t) => ({ text: txt(t.content || t.activeForm), status: TODO_STATUS[t.status] || 'todo' })).filter((t) => t.text);
  } else if (p.tool_name === 'TaskCreate' && i.subject) {
    s.tasks ||= [];
    const m = /#(\d+)/.exec(JSON.stringify(p.tool_response ?? ''));
    s.tasks.push({ id: m ? m[1] : String(s.tasks.length + 1), text: txt(i.subject), status: 'todo' });
    s.todos = s.tasks.slice(-20).map(({ text, status }) => ({ text, status }));
  } else if (p.tool_name === 'TaskUpdate' && s.tasks && i.taskId != null) {
    const t = s.tasks.find((x) => x.id === String(i.taskId));
    if (t) {
      if (i.status === 'deleted') s.tasks = s.tasks.filter((x) => x !== t);
      else { if (i.status) t.status = TODO_STATUS[i.status] || t.status; if (i.subject) t.text = txt(i.subject); }
    }
    s.todos = s.tasks.slice(-20).map(({ text, status }) => ({ text, status }));
  }
}

/* ---------- your own to-do list (sticky notes on the whiteboard) ----------
   Kept in data/todos.json. Any page that can open the office may add, tick or remove items: they never touch the Mac. */
const TODO_FILE = path.join(DATA_DIR, 'todos.json'), TODO_MAX = 60;
let todos = [];
try { const t = JSON.parse(fs.readFileSync(TODO_FILE, 'utf8')); if (Array.isArray(t)) todos = t.slice(0, TODO_MAX); } catch { /* first run */ }
function todoOp(b) {
  const item = todos.find((t) => t.id === String(b.id || ''));
  const text = clip(oneLine(b.text), 140);
  switch (b.op) {
    case 'add':
      if (!text) return tr('server.todo.empty');
      if (todos.length >= TODO_MAX) return tr('server.todo.full', { n: TODO_MAX });
      todos.push({ id: crypto.randomUUID().slice(0, 8), text, done: false, at: Date.now(), doneAt: 0 });
      break;
    case 'toggle':
      if (!item) return tr('server.todo.gone');
      item.done = typeof b.done === 'boolean' ? b.done : !item.done; item.doneAt = item.done ? Date.now() : 0;
      break;
    case 'edit':
      if (!item) return tr('server.todo.gone');
      if (!text) return tr('server.todo.empty');
      item.text = text;
      break;
    case 'del':
      if (!item) return tr('server.todo.gone');
      todos = todos.filter((t) => t !== item);
      break;
    case 'clear': todos = todos.filter((t) => !t.done); break;
    default: return tr('server.badRequest');
  }
  fsp.writeFile(TODO_FILE, JSON.stringify(todos)).catch(() => {});
  broadcast({ k: 'todos', todos });
  return null;
}

/* ---------- SSE ---------- */
const clients = new Set();
function send(res, obj) { res.write(`data: ${JSON.stringify(obj)}\n\n`); }
function broadcast(obj) { for (const c of clients) send(c.res, obj); if (RECORDED.has(obj.k)) record(obj); }

/* ---------- replay log ----------
   What the office shows is appended to data/replay/YYYY-MM-DD.jsonl, one {t, m} per line: session changes and events as
   broadcast (already redacted), plus a full snapshot when a file starts and at most every 10 minutes after, so a replay
   can begin at any minute. Permission prompts are not kept. Files older than 7 days are deleted. */
const REPLAY_DIR = path.join(DATA_DIR, 'replay');
const REPLAY_KEEP_DAYS = 7;
const RECORDED = new Set(['ev', 'sess', 'gone', 'stats']);
fs.mkdirSync(REPLAY_DIR, { recursive: true });
let rec = { day: '', out: null, snapAt: 0 };
const replaySnap = () => ({ k: 'snap', sessions: [...sessions.values()].map(pub), feed: feed.slice(-40), stats });
function record(m) {
  const t = Date.now(), day = today();
  if (day !== rec.day) {
    rec.out?.end();
    rec = { day, out: fs.createWriteStream(path.join(REPLAY_DIR, `${day}.jsonl`), { flags: 'a' }), snapAt: 0 };
    rec.out.on('error', (err) => console.error('replay log', err.message));
    pruneReplay();
  }
  rec.out.write(JSON.stringify({ t, m }) + '\n');
  // the snapshot goes after the message, so it already contains it
  if (t - rec.snapAt > 600_000) { rec.snapAt = t; rec.out.write(JSON.stringify({ t, m: replaySnap() }) + '\n'); }
}
function pruneReplay() {
  const cut = new Date(Date.now() - REPLAY_KEEP_DAYS * 86400e3).toLocaleDateString('sv-SE');
  fsp.readdir(REPLAY_DIR).then((names) => {
    for (const n of names) if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n) && n.slice(0, 10) < cut) fsp.rm(path.join(REPLAY_DIR, n)).catch(() => {});
  }).catch(() => {});
}
async function replayDays() {
  const out = [];
  for (const n of (await fsp.readdir(REPLAY_DIR).catch(() => [])).sort().reverse()) {
    if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)) continue;
    const st = await fsp.stat(path.join(REPLAY_DIR, n)).catch(() => null);
    if (st && st.size) out.push({ day: n.slice(0, 10), bytes: st.size });
  }
  return out;
}
// Lines from the last snapshot at or before `from` up to `to`: the page fast-forwards through the part before `from`.
async function replayRange(day, from, to, max = 80_000) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { items: [], truncated: false };
  const file = path.join(REPLAY_DIR, `${day}.jsonl`);
  let items = [], truncated = false;
  const rl = (await import('node:readline')).createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (!line) continue;
      let x; try { x = JSON.parse(line); } catch { continue; }   // the line being written right now
      if (x.t > to) break;
      if (x.t <= from && x.m.k === 'snap') items = [];
      items.push(x);
      if (items.length >= max) { truncated = true; break; }
    }
  } catch { /* no file for that day */ }
  finally { rl.close(); }
  return { items, truncated };
}

/* ---------- session discovery ---------- */
let scanning = null;
function scanSessions() { return (scanning ??= doScan().finally(() => { scanning = null; })); }
// The pid in a session file is that session only if the process started when the session did (a reboot reuses
// pids: without this a stale file shows a ghost). Start times come from ps, once per pid. Idea from W17ant (MIT).
const procStart = new Map();   // pid -> start (ms)
async function sameProcess(j) {
  if (!j.startedAt) return true;
  const key = `${j.pid}:${j.startedAt}`;
  let t = procStart.get(key);
  if (t == null) {
    t = await OS.startedAt(j.pid);
    if (t) procStart.set(key, t);
  }
  return !t || Math.abs(t - j.startedAt) < 10 * 60e3;
}
async function doScan() {
  let files = [];
  try { files = (await fsp.readdir(SESS_DIR)).filter((f) => f.endsWith('.json')); } catch { return; }
  const live = new Set();
  for (const f of files) {
    let j;
    try { j = JSON.parse(await fsp.readFile(path.join(SESS_DIR, f), 'utf8')); } catch { continue; }
    if (!j.pid || !alive(j.pid) || !(await sameProcess(j))) continue;
    const key = 'p' + j.pid;
    live.add(key);
    let s = sessions.get(key);
    let changed = false;
    if (!s) {
      const prevKey = j.sessionId && sidToKey.get(j.sessionId);
      if (prevKey && sessions.has(prevKey)) { s = sessions.get(prevKey); sessions.delete(prevKey); s.key = key; }
      else { s = newSession(key); s.createdAt = j.startedAt || Date.now(); }
      sessions.set(key, s);
      changed = true;
    }
    if (j.sessionId && s.sid !== j.sessionId) { if (s.sid) sidToKey.delete(s.sid); s.sid = j.sessionId; changed = true; }
    if (j.sessionId) sidToKey.set(j.sessionId, key);
    const link = j.bridgeSessionId ? 'https://claude.ai/code/' + j.bridgeSessionId : null;
    const name = j.name || base(j.cwd) || 'claude';
    if (s.name !== name || s.cwd !== j.cwd || s.link !== link) { s.name = name; s.cwd = j.cwd || ''; s.link = link; changed = true; }
    s.pid = j.pid; s.fromFile = true; s.busy = j.status === 'busy';
    // Claude's own session file says busy: trust it even if we missed the hook (e.g. the server restarted mid-turn).
    if (s.busy && s.status === 'rest') { s.status = 'work'; if (!s.taskStart) s.taskStart = j.statusUpdatedAt || Date.now(); s.lastEventAt = Math.max(s.lastEventAt, Date.now()); changed = true; }
    if (changed) broadcast({ k: 'sess', s: pub(s) });
    if (!s.lastPrompt && !s.recalled && s.sid && s.cwd) { s.recalled = true; recallTask(s); }
    if (s.sid && s.cwd && !s.titleAt) { refreshTitle(s, true); originOf(s).then((o) => { if (o && o !== s.origin) { s.origin = o; broadcast({ k: 'sess', s: pub(s) }); } }); }
  }
  for (const [key, s] of sessions) {
    if (s.fromFile && !live.has(key)) dropSession(key, s);
  }
}
// The chat's title as the IDE shows it: your rename (`custom-title`) wins over the generated one (`ai-title`). Both are
// lines in the transcript; the generated one repeats often, so the tail is enough. A rename is looked for once in
// the whole file, then in the tail as the transcript grows.
const transcriptOf = (s) => s.transcript || (s.sid && s.cwd ? path.join(CLAUDE_DIR, 'projects', s.cwd.replace(/[^A-Za-z0-9-]/g, '-'), `${s.sid}.jsonl`) : null);
const lastField = (text, field) => { let m, out = null; const re = new RegExp(`"${field}":"((?:[^"\\\\]|\\\\.)*)"`, 'g'); while ((m = re.exec(text))) out = m[1]; if (out == null) return null; try { return JSON.parse(`"${out}"`); } catch { return null; } };
async function refreshTitle(s, first = false) {
  const file = transcriptOf(s); if (!file) return;
  s.titleAt = Date.now();
  let fh;
  try {
    fh = await fsp.open(file, 'r');
    const { size } = await fh.stat();
    if (size === s.titleSize) return;
    s.titleSize = size;
    const len = Math.min(size, 600_000), buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, size - len);
    const tail = buf.toString('utf8');
    let custom = lastField(tail, 'customTitle');
    const ai = lastField(tail, 'aiTitle');
    if (custom == null && first && size > len) {   // a rename made long ago: one pass over the file, line by line
      const rl = (await import('node:readline')).createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
      for await (const line of rl) if (line.includes('"custom-title"')) custom = lastField(line, 'customTitle') ?? custom;
    }
    if (custom != null) s.customTitle = custom;
    const title = clip(redact(oneLine(s.customTitle || ai || s.aiTitle || '')), 80);
    if (ai) s.aiTitle = ai;
    if (title && title !== s.title) { s.title = title; broadcast({ k: 'sess', s: pub(s) }); }
  } catch { /* no transcript yet */ }
  finally { await fh?.close(); }
}

// After a restart, a session's current task is the last thing you typed in its transcript.
async function recallTask(s) {
  const items = await readLog(s, 300).catch(() => []);
  const u = items.findLast((x) => x.role === 'user');
  if (!u || s.lastPrompt) return;
  s.lastPrompt = clip(oneLine(unwrapPaste(u.text)), 90);
  if (!s.taskStart) s.taskStart = u.ts || 0;
  if (s.status === 'rest') s.doneAt = items.at(-1)?.ts || 0;
  broadcast({ k: 'sess', s: pub(s) });
}
function dropSession(key, s) {
  sessions.delete(key);
  if (s.sid && sidToKey.get(s.sid) === key) sidToKey.delete(s.sid);
  broadcast({ k: 'gone', id: s.id });
}
setInterval(() => {
  scanSessions();
  rollDay();
  const now = Date.now();
  for (const [key, s] of sessions) {
    // Claude went quiet without a Stop event (e.g. interrupted): let the chibi rest. A long tool run (a build, a test
    // suite) is not quiet; a tool still open after 10 minutes probably lost its PostToolUse.
    if (s.status === 'work' && !s.busy && (!s.inTool || now - s.lastEventAt > 600_000) && now - s.lastEventAt > 20_000) { s.status = 'rest'; broadcast({ k: 'sess', s: pub(s) }); }
    // Sessions seen only through hooks (no session file) leave after 10 quiet minutes.
    if (!s.fromFile && now - s.lastEventAt > 600_000) dropSession(key, s);
    // A subagent that went quiet is finished: 90 s once its session rests, 5 min while the session still works.
    for (const [id, sub] of Object.entries(s.subs)) if (now - sub.seenAt > (s.status === 'rest' ? 90_000 : 300_000)) { finishSub(s, id, now); broadcast({ k: 'sess', s: pub(s) }); }
  }
}, 2000).unref();
// Token usage, context fill and API-price equivalent per session, read from the transcripts every few seconds.
let usageBusy = false;
setInterval(async () => {
  if (usageBusy) return; usageBusy = true;
  try {
    for (const s of sessions.values()) {
      const main = s.transcript || (s.sid && s.cwd ? path.join(CLAUDE_DIR, 'projects', s.cwd.replace(/[^A-Za-z0-9-]/g, '-'), `${s.sid}.jsonl`) : null);
      if (!main) continue;
      if (!s.usage) { s.usage = blankUsage(); s.usage.interrupted = 0; }
      const was = s.usage.interrupted;
      if (!(await scanUsage(s.usage, main, subDir(s)).catch(() => false))) continue;
      if (s.usage.interrupted !== was && was !== undefined && s.status !== 'rest') {
        s.status = 'rest'; s.inTool = false; s.taskStart = 0;
        const e = { id: ++seq, ts: Date.now(), sess: s.id, name: s.name, type: 'interrupt', label: '' };
        pushFeed(e); broadcast({ k: 'ev', e, s: pub(s), stats });
      } else broadcast({ k: 'sess', s: pub(s) });
    }
  } finally { usageBusy = false; }
}, 4000).unref();

/* ---------- hook events ---------- */
function pushFeed(e) { feed.push(e); if (feed.length > FEED_MAX) feed = feed.slice(-FEED_MAX); dirty = true; }
function count(s, tool, sub) {
  const k = COUNT_OF[tool];
  if (!k) return;
  s.counts[k]++; stats[k]++; dirty = true; trophies.bump(k);
  void sub;
}

let lastHookAt = 0;
const startedAt = Date.now();
async function onHook(p) {
  lastHookAt = Date.now();
  const ev = p.hook_event_name, sid = p.session_id;
  if (!ev || !sid) return;
  rollDay();
  let s = bySid(sid);
  if (!s) { await scanSessions(); s = bySid(sid); }
  if (!s) {
    const key = 's' + sid;
    s = newSession(key);
    s.sid = sid; s.cwd = p.cwd || ''; s.name = `${base(p.cwd) || 'claude'}-${sid.slice(0, 2)}`;
    sessions.set(key, s); sidToKey.set(sid, key);
    broadcast({ k: 'sess', s: pub(s) });
  }
  const now = Date.now();
  s.lastEventAt = now;
  if (p.transcript_path) s.transcript = p.transcript_path;
  const agent = p.agent_id || null;
  if (agent && ev !== 'SubagentStop') ensureSub(s, agent, p.agent_type, now).seenAt = now;
  const prevStatus = s.status;
  let e = null; // event for the page
  let toFeed = true;
  const mk = (type, label = '', extra = {}) => ({ id: ++seq, ts: now, sess: s.id, name: s.name, type, label, ...extra });

  switch (ev) {
    case 'SessionStart':
      e = mk('start', p.source || '');
      break;
    case 'SessionEnd':
      e = mk('end', p.reason || '');
      if (!s.fromFile) setTimeout(() => dropSession(s.key, s), 1500);
      break;
    case 'UserPromptSubmit': {
      s.status = 'work';
      // Reports from subagents and other sessions arrive as prompts too; they are not a new task from you.
      const said = oneLine(unwrapPaste(String(p.prompt || '').replace(STRIP_TAGS, '')));
      if (!said) break;
      s.lastPrompt = clip(redact(said), 90);
      s.taskStart = now;
      stats.prompts++; dirty = true; trophies.bump('prompts'); trophies.session(s.sid);
      e = mk('prompt', clip(s.lastPrompt, 64));
      break;
    }
    case 'PreToolUse': {
      const c = await classifyVi(p.tool_name, p.tool_input);
      if (!agent) { if (s.status === 'rest' && !s.taskStart) s.taskStart = now; s.status = 'work'; s.inTool = true; s.last = { type: c.type, label: c.label }; }
      else { const x = s.subs[agent]; x.last = { type: c.type, label: c.label }; x.steps++; }
      e = mk(c.type, c.label, { desc: c.desc, agent, agentType: p.agent_type || null, quiet: !!agent });
      if (agent) toFeed = false;
      break;
    }
    case 'PostToolUse': {
      if (!agent) { s.inTool = false; trackTodos(s, p); trackBackground(s, p); }
      count(s, p.tool_name, agent);
      if (s.status === 'wait') s.status = 'work';
      if (p.tool_name === 'Bash' && /\bgit\b/.test(String(p.tool_input?.command || ''))) setTimeout(pollGit, 1200);   // a commit or push shows up at once
      const m = p.tool_name === 'Bash' && DEPLOY_RE.exec(String(p.tool_input?.command || ''));
      if (m) { stats.deploy++; dirty = true; trophies.bump('deploy'); e = mk('deploy', m[1]); }
      break;
    }
    case 'PostToolUseFailure': {
      if (!agent) s.inTool = false;
      if (s.status === 'wait') s.status = 'work';
      const c = await classifyVi(p.tool_name, p.tool_input);
      e = mk('fail', c.label || p.tool_name || '', { agent, quiet: !!agent });
      if (agent) toFeed = false;
      break;
    }
    case 'PermissionRequest': {
      s.status = 'wait';
      const c = await classifyVi(p.tool_name, p.tool_input);
      e = mk('wait', c.label || p.tool_name || '');
      break;
    }
    case 'Notification': {
      const nt = p.notification_type || '';
      if (nt === 'permission_prompt' || nt === 'elicitation_dialog' || nt === 'agent_needs_input') {
        if (s.status !== 'wait') { s.status = 'wait'; e = mk('wait', tr('server.event.needYou')); }
      } else if (nt === 'idle_prompt') {
        s.status = 'rest'; e = mk('idle');
      }
      break;
    }
    case 'SubagentStart':
      e = mk('substart', p.agent_type || 'agent', { agent });
      break;
    case 'SubagentStop': {
      const x = agent ? finishSub(s, agent, now) : null;
      e = mk('substop', x?.type || p.agent_type || 'agent', { agent, desc: x?.desc || '' });
      break;
    }
    case 'Stop':
      setTimeout(() => refreshTitle(s), 4000); usageAfterTurn();
      s.inTool = false;
      s.status = 'rest'; s.doneAt = now;
      trackBackground(s, p);
      s.lastReply = clip(redact(oneLine(typeof p.last_assistant_message === 'string' ? p.last_assistant_message : await lastReplyOf(s))), 240);
      e = mk('stop', clip(s.lastReply, 90));
      break;
    case 'StopFailure':
      s.status = 'rest';
      e = mk('fail', tr('server.event.modelError'));
      break;
    case 'PreCompact':
      e = mk('compact', p.trigger || '');
      break;
    default:
      return;
  }
  if (e) {
    if (toFeed) pushFeed(e);
    broadcast({ k: 'ev', e, s: pub(s), stats });
  } else if (s.status !== prevStatus) {
    broadcast({ k: 'sess', s: pub(s), stats });
  } else if (ev === 'PostToolUse') {
    broadcast({ k: 'stats', stats, s: pub(s), post: agent || 'main' });   // `post`: whose tool finished (timeline)
  }
}

/* ---------- conversation view ---------- */
const STRIP_TAGS = /<(system-reminder|ide_selection|ide_opened_file|command-message|command-name|command-args|local-command-stdout|local-command-stderr|local-command-caveat|task-notification|user-prompt-submit-hook|agent-message)[^>]*>[\s\S]*?<\/\1>/g;
async function readLog(s, n = 120, agentId = null) {
  let file = s.transcript || (s.sid && s.cwd ? path.join(CLAUDE_DIR, 'projects', s.cwd.replace(/[^A-Za-z0-9-]/g, '-'), `${s.sid}.jsonl`) : null);
  if (agentId) {
    const dir = subDir(s);
    file = dir && /^[A-Za-z0-9_-]+$/.test(agentId) ? path.join(dir, `agent-${agentId}.jsonl`) : null;
  }
  if (!file) return [];
  let fh;
  try { fh = await fsp.open(file, 'r'); } catch { return []; }
  try {
    const { size } = await fh.stat();
    const len = Math.min(size, 4_000_000);
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    if (size > len) lines.shift();
    const items = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      let j;
      try { j = JSON.parse(line); } catch { continue; }
      if ((j.isSidechain && !agentId) || j.isMeta) continue;
      const ts = j.timestamp ? Date.parse(j.timestamp) : 0;
      const c = j.message?.content;
      if (j.type === 'user') {
        const texts = typeof c === 'string' ? [c] : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text) : [];
        const imgs = Array.isArray(c) ? c.filter((b) => b.type === 'image').length : 0;
        const raw = texts.join('\n'), t = unwrapPaste(raw.replace(STRIP_TAGS, '')).trim();
        if (!t && !imgs) { if (/<agent-message/.test(raw)) items.push({ role: 'note', text: tr('server.note.subReport'), ts }); continue; }
        // Claude Code writes a summary into a user turn when it compacts or continues a long session.
        if (j.isCompactSummary || /^This session is being continued from a previous conversation/.test(t)) { items.push({ role: 'summary', text: clip(redact(t), 12000), ts }); continue; }
        if (/^\[Request interrupted by user/.test(t)) { items.push({ role: 'note', text: tr('server.note.interrupted'), ts }); continue; }
        items.push({ role: 'user', text: clip(redact(t), 8000), imgs, ts });
      } else if (j.type === 'assistant' && Array.isArray(c)) {
        for (const b of c) {
          if (b.type === 'text' && b.text?.trim()) items.push({ role: 'claude', text: clip(redact(b.text.trim()), 12000), ts });
          else if (b.type === 'tool_use') {
            // Bash descriptions are already translated when the hook saw them; reuse the cache, never wait on the network here.
            const k = classify(b.name, b.input);
            items.push({ role: 'tool', type: k.type, label: (k.tr && viCache[k.label]) || k.label, desc: k.desc ? viCache[k.desc] || k.desc : '', ts });
          }
        }
      }
    }
    return items.slice(-n);
  } finally { await fh.close(); }
}

/* ---------- HTTP ---------- */
const isLoopback = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
// Only answer to our own host names: stops DNS-rebinding pages from reaching this server.
function hostAllowed(req) {
  const h = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  if (['localhost', '127.0.0.1', '::1', `${os.hostname().toLowerCase()}`, `${os.hostname().toLowerCase().replace(/\.local$/, '')}.local`].includes(h)) return true;
  return Object.values(os.networkInterfaces()).flat().some((n) => n && n.address === h);
}
function readJson(req, max = 64_000) {
  return new Promise((resolve) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size <= max) chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); } });
  });
}
const json = (res, code, obj) => res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(obj));
const ACTION_LOG = path.join(DATA_DIR, 'actions.log');
function lanUrl(withToken = true) {
  const nets = os.networkInterfaces();
  const order = ['en0', 'en1', ...Object.keys(nets)];
  for (const name of order) for (const n of nets[name] || []) if (n.family === 'IPv4' && !n.internal) return `http://${n.address}:${PORT}/${withToken ? `?k=${TOKEN}` : ''}`;
  return null;
}
const COOKIE = 'office_pin', COOKIE_DAYS = 30;
const sign = (exp) => crypto.createHmac('sha256', TOKEN).update(`pin:${exp}:${currentPin()}`).digest('base64url');
const sameBytes = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function pinCookie() {
  const exp = Date.now() + COOKIE_DAYS * 86400e3;
  return `${COOKIE}=${exp}.${sign(exp)}; Max-Age=${COOKIE_DAYS * 86400}; Path=/; HttpOnly; SameSite=Strict`;
}
function cookieOk(req) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)\\.([\\w-]+)`).exec(String(req.headers.cookie || ''));
  return !!m && Number(m[1]) > Date.now() && sameBytes(m[2], sign(m[1]));
}
function authorized(req, url) { return isLoopback(req) || sameBytes(url.searchParams.get('k') || '', TOKEN) || cookieOk(req); }

// 6 digits is a million guesses: 5 wrong tries lock that address for 15 minutes, and 20 wrong tries from anywhere
// lock the PIN page for everyone for 15 minutes, so guessing it would take years.
const LOCK_MS = 15 * 60e3;
const pinFails = new Map();   // ip -> { n, until }
let allFails = [];
function pinLockedUntil(ip) {
  const now = Date.now();
  allFails = allFails.filter((t) => now - t < LOCK_MS);
  if (allFails.length >= 20) return allFails[0] + LOCK_MS;
  const f = pinFails.get(ip);
  return f && f.until > now ? f.until : 0;
}
function pinFailed(ip) {
  const now = Date.now();
  allFails.push(now);
  const f = pinFails.get(ip) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 5) { f.n = 0; f.until = now + LOCK_MS; }
  pinFails.set(ip, f);
  return f.until > now ? 0 : 5 - f.n;
}
function readForm(req, max = 2_000) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { if (body.length <= max) body += c; });
    req.on('end', () => resolve(new URLSearchParams(body.slice(0, max))));
  });
}
const PIN_CSS = `*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f1ea;color:#1d1b16;
font:16px/1.5 system-ui,-apple-system,sans-serif;padding:16px}@media (prefers-color-scheme:dark){body{background:#16151a;color:#ece9e2}
.card{background:#211f26!important;border-color:#3a3742!important}input{background:#16151a!important;color:#ece9e2!important;border-color:#4a4654!important}}
.card{width:100%;max-width:360px;background:#fff;border:1px solid #e3ddd0;border-radius:20px;padding:28px 24px;box-shadow:0 10px 40px rgba(0,0,0,.08)}
h1{font-size:1.25rem;margin:0 0 4px}p{margin:0 0 18px;color:#7a7468;font-size:.92rem}
input{width:100%;font:600 2rem/1 ui-monospace,Menlo,monospace;letter-spacing:.5em;text-align:center;padding:14px 0 14px .5em;border:1.5px solid #d8d1c2;
border-radius:14px;background:#fbfaf7;outline:none}input:focus{border-color:#d97757;box-shadow:0 0 0 4px rgba(217,119,87,.18)}
button{margin-top:14px;width:100%;height:48px;border:0;border-radius:14px;background:#d97757;color:#fff;font:600 1rem system-ui;cursor:pointer}
button:disabled{opacity:.5;cursor:default}.err{color:#c0392b;margin:12px 0 0;font-size:.9rem}.ico{font-size:2rem;margin-bottom:8px}`;
function pinPage(res, code, msg = '', locked = false) {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' }).end(`<!doctype html>
<html lang="${prefs.lang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My Office</title><style>${PIN_CSS}</style></head>
<body><form class="card" method="post" action="/pin" autocomplete="off"><div class="ico">🏢</div><h1>${esc(tr('server.pin.title'))}</h1>
<p>${esc(tr('server.pin.help'))}</p>
<input name="pin" inputmode="numeric" pattern="\\d{6}" maxlength="6" autocomplete="one-time-code" required autofocus aria-label="${esc(tr('server.pin.label'))}" ${locked ? 'disabled' : ''}>
<button type="submit" ${locked ? 'disabled' : ''}>${esc(tr('server.pin.submit'))}</button>${msg ? `<p class="err" role="alert">${esc(msg)}</p>` : ''}</form></body></html>`);
}
const lockMsg = (until) => tr('server.pin.locked', { n: Math.max(1, Math.ceil((until - Date.now()) / 60e3)) });


/* ---------- approve / deny from the office ----------
   A synchronous PermissionRequest hook (curl, at most 50 s) posts here. The request is held only while an office page
   has focus: pages report focus every 2 s and on blur, so a prompt in the IDE or terminal is never held up by a page
   nobody is looking at. Unanswered after 45 s, the page blurred, or the hook went away: the reply is empty and Claude
   Code shows its own prompt as usual. "Always allow" echoes Claude Code's own suggestion back (documented). */
const presence = new Map();   // page id -> { focused, at }
const officeFocused = () => { const now = Date.now(); for (const p of presence.values()) if (p.focused && now - p.at < 5000) return true; return false; };
const pending = new Map();    // request id -> held request
const permPub = (p) => ({ id: p.id, sess: p.sess, name: p.name, tool: p.tool, type: p.type, label: p.label, detail: p.detail, remember: p.remember, at: p.at, until: p.until,
  kind: p.kind || 'perm', questions: p.questions, plan: p.plan });
function settlePerm(id, body = '') {
  const p = pending.get(id); if (!p) return;
  pending.delete(id); clearTimeout(p.timer);
  try { p.res.writeHead(200, { 'Content-Type': 'application/json' }).end(body); } catch { /* hook already gone */ }
  broadcast({ k: 'permDone', id });
  // answered here: the session goes back to work (an empty reply means Claude Code now asks itself, still waiting)
  const s = body && p.sess && [...sessions.values()].find((x) => x.id === p.sess);
  if (s && s.status === 'wait' && ![...pending.values()].some((x) => x.sess === s.id)) { s.status = 'work'; broadcast({ k: 'sess', s: pub(s) }); }
}
function permDecision(p, choice) {
  if (choice === 'deny') return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: tr('server.perm.denied') } } };
  const decision = { behavior: 'allow' };
  if (choice === 'always' && p.suggestion) decision.updatedPermissions = [p.suggestion];
  return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } };
}
function permDetail(p) {
  const i = p.tool_input || {};
  const d = i.command || i.file_path || i.url || i.pattern || i.query || i.prompt || JSON.stringify(i);
  return clip(redact(String(d)), 400);
}
function ruleText(sug) {
  const r0 = sug.rules?.[0]; if (!r0) return null;
  const where = ['session', 'localSettings', 'projectSettings', 'userSettings'].includes(sug.destination) ? tr(`server.rule.${sug.destination}`) : '';
  return `${r0.toolName}${r0.ruleContent ? `(${clip(redact(r0.ruleContent), 60)})` : ''} ${where}`.trim();
}
async function onPermission(p, res) {
  if (!p || !p.session_id || ASK_TOOLS.has(p.tool_name) || !officeFocused()) { res.writeHead(200).end(''); return; }
  let s = bySid(p.session_id); if (!s) { await scanSessions(); s = bySid(p.session_id); }
  const c = await classifyVi(p.tool_name, p.tool_input);
  const suggestion = Array.isArray(p.permission_suggestions) ? p.permission_suggestions.find((x) => x && x.type === 'addRules' && x.behavior === 'allow') || null : null;
  const id = crypto.randomUUID(), now = Date.now();
  const entry = { id, res, sess: s?.id || null, name: s?.name || base(p.cwd) || 'claude', tool: p.tool_name, type: c.type, label: c.label, detail: permDetail(p),
    remember: suggestion ? ruleText(suggestion) : null, suggestion, at: now, until: now + 45_000 };
  entry.timer = setTimeout(() => settlePerm(id), 45_000);
  pending.set(id, entry);
  res.on('close', () => { if (pending.get(id) === entry) { pending.delete(id); clearTimeout(entry.timer); broadcast({ k: 'permDone', id }); } });
  if (s && s.status !== 'wait') { s.status = 'wait'; broadcast({ k: 'sess', s: pub(s) }); }
  broadcast({ k: 'perm', p: permPub(entry) });
}

/* ---------- questions and plans from Claude, answered in the office ----------
   A synchronous PreToolUse hook (matcher AskUserQuestion|ExitPlanMode) posts here, under the same rule as approvals:
   held only while an office page has focus, 45 s at most, otherwise Claude Code asks as usual. Documented answer
   (code.claude.com/docs/en/hooks): permissionDecision "allow" with updatedInput = the original input plus `answers`
   (question text -> chosen label, several labels joined with ", "). A plan is approved by allowing ExitPlanMode, or
   sent back with your note by denying it. The page sends indexes; texts are taken from the original input here. */
const ASK_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode']);
async function onQuestion(p, res) {
  if (!p || !p.session_id || !ASK_TOOLS.has(p.tool_name) || !officeFocused()) { res.writeHead(200).end(''); return; }
  let s = bySid(p.session_id); if (!s) { await scanSessions(); s = bySid(p.session_id); }
  const i = p.tool_input || {}, id = crypto.randomUUID(), now = Date.now(), txt = (v, n) => clip(redact(oneLine(v)), n);
  const entry = { id, res, sess: s?.id || null, name: s?.name || base(p.cwd) || 'claude', tool: p.tool_name, input: i, at: now, until: now + 45_000 };
  if (p.tool_name === 'AskUserQuestion') {
    const qs = Array.isArray(i.questions) ? i.questions.slice(0, 4) : [];
    if (!qs.length) { res.writeHead(200).end(''); return; }
    Object.assign(entry, { kind: 'ask', type: 'ask', label: tr('server.tool.ask') });
    entry.questions = qs.map((q) => ({ question: txt(q.question, 400), header: txt(q.header, 30), multi: !!q.multiSelect,
      options: (Array.isArray(q.options) ? q.options.slice(0, 6) : []).map((o) => ({ label: txt(o.label, 80), description: txt(o.description, 240) })) }));
    entry.detail = entry.questions.map((q) => q.question).join('\n');
  } else {
    Object.assign(entry, { kind: 'plan', type: 'plan', label: tr('server.tool.plan') });
    entry.plan = clip(redact(String(i.plan || '')), 20000); entry.detail = clip(oneLine(entry.plan), 200);
  }
  entry.timer = setTimeout(() => settlePerm(id), 45_000);
  pending.set(id, entry);
  res.on('close', () => { if (pending.get(id) === entry) { pending.delete(id); clearTimeout(entry.timer); broadcast({ k: 'permDone', id }); } });
  if (s && s.status !== 'wait') { s.status = 'wait'; broadcast({ k: 'sess', s: pub(s) }); }
  broadcast({ k: 'perm', p: permPub(entry) });
}
// The reply for a question card: `answers` from the page is [{ q, pick: [option indexes], other }].
function askDecision(p, b) {
  const qs = Array.isArray(p.input.questions) ? p.input.questions : [], answers = {};
  for (const a of Array.isArray(b.answers) ? b.answers : []) {
    const q = qs[a?.q]; if (!q || typeof q.question !== 'string') continue;
    const labels = (Array.isArray(a.pick) ? a.pick : []).map((k) => q.options?.[k]?.label).filter((x) => typeof x === 'string');
    const other = oneLine(a.other).slice(0, 500);
    const val = [...(q.multiSelect ? labels : labels.slice(0, 1)), ...(other ? [other] : [])].join(', ');
    if (val) answers[q.question] = val;
  }
  if (Object.keys(answers).length < qs.length) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { ...p.input, answers } } };
}
function planDecision(p, choice, note) {
  if (choice === 'approve') return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: p.input } };
  const why = oneLine(note).slice(0, 1000);
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: why ? tr('server.perm.planReviseWhy', { why }) : tr('server.perm.planRevise') } };
}

/* ---------- plan usage from Claude Code's status line ----------
   bin/cli.mjs installs hooks/status-line.mjs as the statusLine command; it posts the documented fields here: the
   5-hour and 7-day windows (Pro / Max), the exact context window, the session's cost. Kept in data/limits.json. */
const LIMITS_FILE = path.join(DATA_DIR, 'limits.json');
let planLimits = null, statusAt = 0;
try { planLimits = JSON.parse(fs.readFileSync(LIMITS_FILE, 'utf8')); } catch { /* none yet */ }
const numOr = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// windows: [{ key, label, pct, resetsAt, weekOf? }]; `five` / `seven` stay for the TV and older pages
function setLimits(windows, source, account = planLimits?.account || null) {
  const next = { at: Date.now(), source, windows, account, five: windows.find((w) => w.key === 'session') || null, seven: windows.find((w) => w.key === 'weekly') || null };
  const sig = (l) => JSON.stringify(l?.windows?.map((w) => [w.key, w.pct, w.resetsAt]) || null);
  const moved = sig(planLimits) !== sig(next);
  planLimits = next;
  if (moved) broadcast({ k: 'limits', limits: limitsOut(), note: '' });
  fsp.writeFile(LIMITS_FILE, JSON.stringify(planLimits)).catch(() => {});
}
// A window's label is words: "5 h", "Week", "Opus (week)" (weekOf: the model). Written when a reading arrives and again
// each time the limits are sent, so a reading saved before a language switch reads in the new language.
const winLabel = (w) => clip(String(w.key === 'session' ? tr('server.limits.fiveHour') : w.key === 'weekly' ? tr('server.limits.week') : w.weekOf ? tr('server.limits.modelWeek', { model: w.weekOf }) : w.label), 30);
function limitsOut() {
  const l = planLimits, more = othersOut();
  if (!l) return more.length ? { windows: [], others: more } : l;
  return { ...l, windows: Array.isArray(l.windows) ? l.windows.map((w) => ({ ...w, label: winLabel(w) })) : l.windows,
    five: l.five && { ...l.five, label: tr('server.limits.fiveHour') }, seven: l.seven && { ...l.seven, label: tr('server.limits.week') }, others: more };
}
function onStatus(p) {
  if (!p || typeof p !== 'object') return;
  statusAt = Date.now();
  const win = (key, label, w) => (w && numOr(w.used_percentage) != null ? { key, label, pct: Math.round(w.used_percentage * 10) / 10, resetsAt: numOr(w.resets_at) ? w.resets_at * 1000 : null } : null);
  const rl = p.rate_limits;
  // the status line only knows the two big windows; the account's own reading (below) wins while it works
  if (rl && typeof rl === 'object' && planLimits?.source !== 'api') {
    const windows = [win('session', tr('server.limits.fiveHour'), rl.five_hour), win('weekly', tr('server.limits.week'), rl.seven_day)].filter(Boolean);
    if (windows.length) setLimits(windows, 'statusline');
  }
  const s = p.session_id && bySid(p.session_id);
  if (s) {
    const cw = p.context_window || {}, size = numOr(cw.context_window_size), pctUsed = numOr(cw.used_percentage);
    s.live = { at: statusAt, ctxMax: size, ctx: size && pctUsed != null ? Math.round((size * pctUsed) / 100) : null, cost: numOr(p.cost?.total_cost_usd) };
  }
}

/* ---------- plan usage read from Anthropic, the way the IDE's Usage panel does (allowed by the user, 27/10/2026) ----------
   Claude Code's own login is read from the macOS Keychain each time (never stored, logged or sent anywhere else), then
   GET api.anthropic.com/api/oauth/usage. Undocumented: on any failure the office keeps the status-line numbers. Asked
   every 2 minutes while a page is open, and 15 s after a session finishes a turn. OFFICE_USAGE=0 turns it off. */
// usageNote: why the limits can't be read, as [key, vars] for tr(); written out when it is sent (noteText)
let planBusy = null, usageNote = null, usageWait = 0, usageBackoff = 0;
const noteText = () => (usageNote ? tr(...usageNote) : '');
// Which account Claude Code is logged into (one login per Mac, shared by every session): ~/.claude.json oauthAccount.
// A personal account's organisation is named after the email, so only the plan is shown for it.
const ACCOUNT_FILE = process.env.CLAUDE_CONFIG_DIR ? path.join(CLAUDE_DIR, '.claude.json') : path.join(os.homedir(), '.claude.json');
const PLAN_NAME = { max: 'Max', pro: 'Pro', team: 'Team', enterprise: 'Enterprise' };
function loginAccount(login, file = ACCOUNT_FILE) {
  let a = {}; try { a = JSON.parse(fs.readFileSync(file, 'utf8')).oauthAccount || {}; } catch { /* not logged in with claude.ai */ }
  const plan = PLAN_NAME[String(login?.subscriptionType || '').toLowerCase()] || (login?.subscriptionType ? String(login.subscriptionType) : '');
  const org = String(a.organizationName || '');
  const personal = !org || org.includes('@') || /'s Organi[sz]ation$/i.test(org);
  return { id: `${a.accountUuid || ''}:${a.organizationUuid || ''}`, plan, org: personal ? '' : clip(org, 40) };
}
// Claude Code's sign-in: the login keychain on a Mac, its credentials file elsewhere (server/platform)
const keychainLogin = () => OS.claudeLogin();
function usageWindows(j) {
  const out = [], iso = (t) => (t ? Date.parse(t) || null : null);
  for (const l of Array.isArray(j.limits) ? j.limits : []) {
    if (typeof l?.percent !== 'number') continue;
    // personal plans (Pro / Max) have a weekly limit over all models; org plans (Team / Enterprise) may only have the
    // 5-hour one and per-model weeks. Whatever rows come back are shown, in that order.
    const model = l.scope?.model?.display_name, kind = String(l.kind || ''), group = String(l.group || '');
    const session = kind === 'session' || /five|5h|session/i.test(kind), weekly = !session && (group === 'weekly' || /week|seven|7d/i.test(kind));
    const key = session ? 'session' : weekly && !model ? 'weekly' : `${kind}:${model || group}`;
    const w = { key, label: model || group || kind, pct: l.percent, resetsAt: iso(l.resets_at), active: l.is_active !== false, ...(weekly && model ? { weekOf: model } : {}) };
    out.push({ ...w, label: winLabel(w) });
  }
  // the older top-level fields fill whatever the list left out (a personal plan's week may only be there; on an org
  // plan seven_day is null, so no week shows)
  const has = (k) => out.some((w) => w.key === k);
  if (!has('session') && typeof j.five_hour?.utilization === 'number') out.unshift({ key: 'session', label: tr('server.limits.fiveHour'), pct: j.five_hour.utilization, resetsAt: iso(j.five_hour.resets_at) });
  if (!has('weekly') && typeof j.seven_day?.utilization === 'number') out.push({ key: 'weekly', label: tr('server.limits.week'), pct: j.seven_day.utilization, resetsAt: iso(j.seven_day.resets_at) });
  for (const [k, name] of [['seven_day_opus', 'Opus'], ['seven_day_sonnet', 'Sonnet']]) {
    if (typeof j[k]?.utilization !== 'number' || out.some((w) => w.weekOf === name)) continue;
    out.push({ key: `weekly:${name}`, label: tr('server.limits.modelWeek', { model: name }), weekOf: name, pct: j[k].utilization, resetsAt: iso(j[k].resets_at) });
  }
  return out;
}
function fetchPlanUsage(force = false) {
  if (process.env.OFFICE_USAGE === '0') return Promise.resolve();
  // the endpoint rate-limits: never more than once every 2 minutes (a restart or a new page reuses the saved reading),
  // and after a 429 wait 5, 10, then up to 30 minutes
  if (Date.now() < usageWait || (!force && planLimits?.source === 'api' && Date.now() - planLimits.at < 110_000)) return Promise.resolve();
  return (planBusy ??= (async () => {
    const login = await keychainLogin();
    if (!login?.accessToken) { usageNote = ['server.usage.keychain']; return; }
    try {
      const r = await fetch('https://api.anthropic.com/api/oauth/usage', { headers: { Authorization: `Bearer ${login.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20' }, signal: AbortSignal.timeout(10000) });
      if (r.status === 429) { usageBackoff = Math.min(30, (usageBackoff || 2.5) * 2); usageWait = Date.now() + usageBackoff * 60e3; usageNote = ['server.usage.rateLimited', { n: usageBackoff }]; return; }
      if (!r.ok) { usageNote = r.status === 401 ? ['server.usage.expired'] : ['server.usage.httpError', { status: r.status }]; return; }
      usageBackoff = 0;
      const body = await r.json();
      // the raw limit rows (no tokens, no personal data) help when a plan shows a limit the office doesn't know yet
      try { fs.writeFileSync(path.join(DATA_DIR, 'usage-raw.json'), JSON.stringify({ at: Date.now(), plan: loginAccount(login).plan, keys: Object.keys(body || {}), limits: body?.limits ?? null, five_hour: body?.five_hour ?? null, seven_day: body?.seven_day ?? null, seven_day_opus: body?.seven_day_opus ?? null, seven_day_sonnet: body?.seven_day_sonnet ?? null }, null, 1)); } catch { /* best effort */ }
      const windows = usageWindows(body);
      usageNote = null;
      setLimits(windows, 'api', loginAccount(login));
    } catch { usageNote = ['server.usage.offline']; }
    if (usageNote) broadcast({ k: 'limits', limits: limitsOut(), note: noteText() });
  })().finally(() => { planBusy = null; }));
}
setInterval(() => { if (clients.size) { fetchPlanUsage(); for (const d of otherDirs) fetchOtherUsage(d); } }, 120_000).unref();

/* ---------- other accounts on this machine ----------
   A second Claude Code login lives in its own config folder (CLAUDE_CONFIG_DIR, e.g. ~/.claude-org2): found as the
   ~/.claude-* folders that are logged in (their .claude.json has an account), plus any listed in OFFICE_CLAUDE_DIRS.
   Each one's usage is read the same way as the main account's, on its own schedule; a session belongs to the account
   whose folder its transcript is in (Claude Code writes it there even when projects/ is shared by a link). */
let otherDirs = [];
const others = new Map();   // folder -> { at, windows, account, note, wait, backoff }
const accName = (d) => clip(path.basename(d).replace(/^\.claude-?/, '') || path.basename(d), 16);
const loggedIn = (d) => { try { return !!JSON.parse(fs.readFileSync(path.join(d, '.claude.json'), 'utf8')).oauthAccount; } catch { return false; } };
function scanAccounts() {
  const home = os.homedir(), found = new Set();
  for (const d of String(process.env.OFFICE_CLAUDE_DIRS || '').split(path.delimiter).filter(Boolean)) found.add(path.resolve(d.replace(/^~(?=$|[\\/])/, home)));
  try { for (const e of fs.readdirSync(home, { withFileTypes: true })) if (/^\.claude-./.test(e.name) && (e.isDirectory() || e.isSymbolicLink())) found.add(path.join(home, e.name)); } catch { /* no home */ }
  const next = [...found].filter((d) => path.resolve(d) !== path.resolve(CLAUDE_DIR) && loggedIn(d)).sort();
  if (next.join('|') !== otherDirs.join('|')) { otherDirs = next; for (const d of others.keys()) if (!next.includes(d)) others.delete(d); for (const d of next) fetchOtherUsage(d, true); }
}
function othersOut() {
  return otherDirs.map((d) => { const o = others.get(d) || {};
    return { name: accName(d), at: o.at || 0, account: o.account || null, windows: (o.windows || []).map((w) => ({ ...w, label: winLabel(w) })), note: o.note ? tr(...o.note) : '' }; });
}
const otherBusy = new Map();
function fetchOtherUsage(dir, force = false) {
  if (process.env.OFFICE_USAGE === '0') return Promise.resolve();
  const o = others.get(dir) || {}; others.set(dir, o);
  if (Date.now() < (o.wait || 0) || (!force && o.at && Date.now() - o.at < 110_000) || otherBusy.has(dir)) return Promise.resolve();
  const job = (async () => {
    const login = await OS.claudeLogin(dir);
    if (!login?.accessToken) { o.note = ['server.usage.keychain']; return; }
    try {
      const r = await fetch('https://api.anthropic.com/api/oauth/usage', { headers: { Authorization: `Bearer ${login.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20' }, signal: AbortSignal.timeout(10000) });
      if (r.status === 429) { o.backoff = Math.min(30, (o.backoff || 2.5) * 2); o.wait = Date.now() + o.backoff * 60e3; o.note = ['server.usage.rateLimited', { n: o.backoff }]; return; }
      if (!r.ok) { o.note = r.status === 401 ? ['server.usage.expired'] : ['server.usage.httpError', { status: r.status }]; return; }
      o.backoff = 0; o.note = null; o.windows = usageWindows(await r.json()); o.at = Date.now(); o.account = loginAccount(login, path.join(dir, '.claude.json'));
    } catch { o.note = ['server.usage.offline']; }
  })().finally(() => { otherBusy.delete(dir); broadcast({ k: 'limits', limits: limitsOut(), note: noteText() }); });
  otherBusy.set(dir, job);
  return job;
}
// the account a session belongs to, by its transcript's folder ('' for the main one)
const acctOf = (s) => { const t = s.transcript || ''; const d = otherDirs.find((x) => t.startsWith(x + path.sep)); return d ? accName(d) : ''; };
scanAccounts();
setInterval(scanAccounts, 60_000).unref();
let accountMtime = 0;
setInterval(() => {   // /login to another account rewrites ~/.claude.json: notice within 15 s
  fs.stat(ACCOUNT_FILE, (err, st) => {
    if (err || st.mtimeMs === accountMtime) return;
    accountMtime = st.mtimeMs;
    const now = loginAccount(null).id;
    if (planLimits?.account?.id && planLimits.account.id !== now) {
      planLimits = null; usageNote = ['server.usage.newAccount'];
      broadcast({ k: 'limits', limits: null, note: noteText() });
      usageWait = 0; fetchPlanUsage(true);
    }
  });
}, 15_000).unref();
let usageSoon = 0;
const usageAfterTurn = () => { clearTimeout(usageSoon); usageSoon = setTimeout(fetchPlanUsage, 15_000); };

/* ---------- bring a session's own window to the front ----------
   Walk up from the session's claude process to the app that hosts it (the IDE, Terminal, iTerm…) and `open -a` it,
   with the session's folder for an editor so the right window comes forward. Idea from cubicle-crew (MIT, focus.js). */
const psLine = (pid) => new Promise((resolve) => execFile('ps', ['-o', 'ppid=,comm=', '-p', String(pid)], { timeout: 4000 }, (err, out) => {
  const m = !err && /^\s*(\d+)\s+(.+)$/.exec(String(out).trim()); resolve(m ? { ppid: +m[1], comm: m[2] } : null);
}));
async function hostApp(pid) {
  for (let cur = pid, hops = 0; cur > 1 && hops < 15; hops++) {
    const l = await psLine(cur); if (!l) return null;
    const m = /^(\/.*?\.app)\//.exec(l.comm);
    if (m) return m[1];
    cur = l.ppid;
  }
  return null;
}
async function openWindow(s) {
  if (process.platform !== 'darwin') return { ok: false, message: tr('server.open.macOnly') };
  if (!s?.pid) return { ok: false, message: tr('server.open.noPid') };
  const app = await hostApp(s.pid);
  if (!app) return { ok: false, message: tr('server.open.noApp') };
  const editor = !/Terminal|iTerm|Warp|Ghostty|kitty|Alacritty|WezTerm/i.test(app);
  const args = ['-a', app, ...(editor && s.cwd ? [s.cwd] : [])];
  return new Promise((resolve) => execFile('open', args, { timeout: 8000 }, (err) => resolve(err ? { ok: false, message: tr('server.open.failed') } : { ok: true, app: path.basename(app, '.app') })));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/event') {
    if (!isLoopback(req)) { res.writeHead(403).end(); return; }
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size <= 8_000_000) chunks.push(c); });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
      try { onHook(JSON.parse(Buffer.concat(chunks).toString('utf8'))).catch((err) => console.error('hook', err)); }
      catch { /* not JSON: ignore */ }
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/doctor') {
    if (!isLoopback(req)) { res.writeHead(403).end(); return; }
    json(res, 200, { uptime: Math.round((Date.now() - startedAt) / 1000), lastEventAt: lastHookAt, sessions: sessions.size, pending: pending.size, node: process.versions.node, statusAt, limitsAt: planLimits?.at || 0, limitsSource: planLimits?.source || null, usageNote: noteText() });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/hook/question') {
    if (!isLoopback(req) || req.headers.origin) { res.writeHead(403).end(); return; }
    readJson(req, 4_000_000).then((p) => onQuestion(p, res)).catch(() => { try { res.writeHead(200).end(''); } catch { /* gone */ } });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/hook/status') {
    if (!isLoopback(req) || req.headers.origin) { res.writeHead(403).end(); return; }
    readJson(req, 200_000).then((p) => { onStatus(p); res.writeHead(200).end('{}'); }).catch(() => { try { res.writeHead(200).end('{}'); } catch { /* gone */ } });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/hook/permission') {
    if (!isLoopback(req) || req.headers.origin) { res.writeHead(403).end(); return; }
    readJson(req, 4_000_000).then((p) => onPermission(p, res)).catch(() => { try { res.writeHead(200).end(''); } catch { /* gone */ } });
    return;
  }
  if (!hostAllowed(req)) { res.writeHead(421).end(); return; }
  if (url.pathname === '/pin' && (req.method === 'GET' || req.method === 'POST')) {
    const ip = req.socket.remoteAddress;
    if (isLoopback(req) || cookieOk(req)) { res.writeHead(303, { Location: '/' }).end(); return; }
    const until = pinLockedUntil(ip);
    if (until) { pinPage(res, 429, lockMsg(until), true); return; }
    if (req.method === 'GET') { pinPage(res, 200); return; }
    const sameOrigin = !req.headers.origin || req.headers.origin === `http://${req.headers.host}`;
    if (!sameOrigin) { res.writeHead(403).end(); return; }
    readForm(req).then((f) => {
      if (sameBytes(String(f.get('pin') || '').replace(/\D/g, ''), currentPin())) {
        pinFails.delete(ip);
        fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} pin ok ${ip}\n`).catch(() => {});
        res.writeHead(303, { Location: '/', 'Set-Cookie': pinCookie(), 'Cache-Control': 'no-store' }).end();
        return;
      }
      const left = pinFailed(ip);
      fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} pin wrong ${ip}\n`).catch(() => {});
      const lockedNow = pinLockedUntil(ip);
      if (lockedNow) pinPage(res, 429, lockMsg(lockedNow), true);
      else pinPage(res, 401, tr('server.pin.wrong', { n: left }));
    });
    return;
  }
  if (req.method === 'POST' && (url.pathname === '/api/presence' || url.pathname === '/api/perm')) {
    const sameOrigin = !req.headers.origin || req.headers.origin === `http://${req.headers.host}`;
    if (!authorized(req, url) || !sameOrigin || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false }); return; }
    readJson(req).then((b) => {
      if (!b) { json(res, 400, { ok: false }); return; }
      // Approving tool calls stays on the Mac: a phone never holds a request and cannot answer one.
      if (!isLoopback(req)) { json(res, url.pathname === '/api/presence' ? 200 : 403, { ok: false, message: tr('server.api.approveOnMac') }); return; }
      if (url.pathname === '/api/presence') {
        const page = String(b.page || '').slice(0, 64);
        if (b.focused) presence.set(page, { focused: true, at: Date.now() }); else presence.delete(page);
        if (!officeFocused()) for (const id of [...pending.keys()]) settlePerm(id);   // nobody is looking: give the prompt back
        json(res, 200, { ok: true, pending: pending.size });
        return;
      }
      const p = pending.get(String(b.id || ''));
      const CHOICES = { perm: ['allow', 'always', 'deny'], ask: ['answer', 'skip'], plan: ['approve', 'revise', 'skip'] }[p?.kind || 'perm'];
      if (!p || !CHOICES.includes(b.choice)) { json(res, 404, { ok: false, message: tr('server.api.expired') }); return; }
      if (b.choice === 'skip') { settlePerm(p.id); json(res, 200, { ok: true }); return; }   // Claude Code asks in the IDE as usual
      const out = p.kind === 'ask' ? askDecision(p, b) : p.kind === 'plan' ? planDecision(p, b.choice, b.note) : permDecision(p, b.choice);
      if (!out) { json(res, 400, { ok: false, message: tr('server.api.answerAll') }); return; }
      settlePerm(p.id, JSON.stringify(out));
      fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} ${p.kind || 'perm'} ${b.choice} ${p.name} ${p.tool} ${p.kind === 'perm' || !p.kind ? p.detail.slice(0, 120) : ''}\n`).catch(() => {});
      json(res, 200, { ok: true });
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/sys/action') {
    const sameOrigin = !req.headers.origin || req.headers.origin === `http://${req.headers.host}`;
    if (!authorized(req, url) || !sameOrigin || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false, message: tr('server.forbidden') }); return; }
    readJson(req).then(async (body) => {
      if (!body) { json(res, 400, { ok: false, message: tr('server.badRequest') }); return; }
      const result = await sysAction(body).catch((err) => ({ ok: false, message: String(err.message || err) }));
      fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} ${req.socket.remoteAddress} ${JSON.stringify(body)} -> ${JSON.stringify(result)}\n`).catch(() => {});
      json(res, 200, result);
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/open') {
    const sameOrigin = !req.headers.origin || req.headers.origin === `http://${req.headers.host}`;
    if (!isLoopback(req) || !sameOrigin || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false, message: tr('server.api.openOnMac') }); return; }
    readJson(req).then(async (b) => {
      const s = [...sessions.values()].find((x) => x.id === String(b?.id || ''));
      const r = await openWindow(s);
      fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} open ${s?.name || '?'} -> ${r.ok ? r.app : r.message}\n`).catch(() => {});
      json(res, 200, r);
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/prefs') {
    const sameOrigin = !req.headers.origin || req.headers.origin === `http://${req.headers.host}`;
    if (!authorized(req, url) || !sameOrigin || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false, message: tr('server.forbidden') }); return; }
    readJson(req).then((b) => {
      if (!b || !prefs.setLang(b.lang)) { json(res, 400, { ok: false, message: tr('server.badRequest') }); return; }
      json(res, 200, { ok: true, lang: prefs.lang() });
      broadcast({ k: 'lang', lang: prefs.lang() });   // every open page reloads in the new language
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/todos') {
    const sameOrigin = !req.headers.origin || req.headers.origin === `http://${req.headers.host}`;
    if (!authorized(req, url) || !sameOrigin || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false, message: tr('server.forbidden') }); return; }
    readJson(req).then((b) => {
      const err = b ? todoOp(b) : tr('server.badRequest');
      json(res, err ? 400 : 200, err ? { ok: false, message: err, todos } : { ok: true, todos });
    });
    return;
  }
  // The page's own files (bundles, fonts, the QR library, the icons and share card in app/): public, no token needed.
  // In development also Next's overlay.
  if (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/assets/') || PAGE_FILES.has(url.pathname) || (DEV && url.pathname.startsWith('/__nextjs'))) { nextHandle(req, res); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  if (url.pathname === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok'); return; }
  if (!authorized(req, url)) {
    if (url.pathname === '/' || url.pathname === '/index.html') res.writeHead(303, { Location: '/pin' }).end();
    else json(res, 401, { ok: false, message: tr('server.pin.needed') });
    return;
  }
  if (url.pathname === '/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const local = isLoopback(req);
    const client = { res };
    clients.add(client);
    fetchPlanUsage();   // skipped when the saved reading is fresh
    pollGit().then(() => git.pollCi());
    scanSessions().then(() => {
      const lanOn = HOST !== '127.0.0.1' && HOST !== 'localhost';
      send(res, { k: 'snap', lang: prefs.lang(), sessions: [...sessions.values()].map(pub), perms: [...pending.values()].map(permPub), feed, stats, local, todos, limits: limitsOut(), limitsNote: noteText(), trophies: trophies.pub(),
        lan: local && lanOn ? lanUrl() : null, lanBase: local && lanOn ? lanUrl(false) : null, pin: local ? currentPin() : null });
    });
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => { clearInterval(ping); clients.delete(client); });
    return;
  }
  if (url.pathname === '/api/log') {
    const s = [...sessions.values()].find((x) => x.id === url.searchParams.get('id'));
    if (!s) { json(res, 404, { items: [] }); return; }
    readLog(s, 120, url.searchParams.get('agent')).then((items) => json(res, 200, { items })).catch(() => json(res, 200, { items: [] }));
    return;
  }
  if (url.pathname === '/api/timeline') {
    const to = Math.min(Number(url.searchParams.get('to')) || Date.now(), Date.now()), from = Math.max(Number(url.searchParams.get('from')) || to - 3600e3, to - 2 * 86400e3);
    const dayOf = (t) => new Date(t).toLocaleDateString('sv-SE');
    (async () => {
      let items = [], truncated = false;
      for (const d of [...new Set([dayOf(from), dayOf(to)])]) { const r = await replayRange(d, from, to, 400_000); items = items.concat(r.items); truncated ||= r.truncated; }
      json(res, 200, { ...buildTimeline(items, from, to), truncated });
    })().catch(() => json(res, 200, { from, to, rows: [], totals: { work: 0, wait: 0, turn: 0, prompts: 0 }, truncated: false }));
    return;
  }
  if (url.pathname === '/api/wrapped') {
    weekSummary({ replayDir: REPLAY_DIR, buildTimeline }).then((d) => json(res, 200, d)).catch((err) => json(res, 500, { error: String(err.message || err) }));
    return;
  }
  if (url.pathname === '/api/replay/days') { replayDays().then((days) => json(res, 200, { days, today: today() })); return; }
  if (url.pathname === '/api/replay') {
    const from = Number(url.searchParams.get('from')) || 0, to = Number(url.searchParams.get('to')) || Date.now();
    replayRange(String(url.searchParams.get('day') || ''), from, to).then((r) => json(res, 200, r)).catch(() => json(res, 200, { items: [], truncated: false }));
    return;
  }
  if (url.pathname === '/api/sys') {
    sysSnapshot().then((snap) => json(res, 200, snap)).catch((err) => json(res, 500, { error: String(err.message || err) }));
    return;
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    // the office page itself is rendered by Next.js (app/page.tsx); our headers go on before it starts the response
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!isLoopback(req) && !cookieOk(req)) res.setHeader('Set-Cookie', pinCookie());
    if (url.pathname === '/index.html') req.url = '/' + url.search;
    req.headers['x-office-lang'] = pickLang(url.searchParams.get('lang') || prefs.lang());   // ?lang=vi: one visit in another language
    nextHandle(req, res);
    return;
  }
  res.writeHead(404).end();
});

// Next.js renders the page and bundles the office's code: `--dev` runs it with Turbopack and hot reload, otherwise it
// serves the production build made by `npm run build`.
const DEV = process.argv.includes('--dev');
const nextApp = next({ dev: DEV, dir: ROOT, hostname: HOST, port: PORT, httpServer: server });
const nextHandle = nextApp.getRequestHandler();
try { await nextApp.prepare(); }
catch (err) {
  console.error(DEV ? err : `${tr('server.console.noBuild')}\n${err.message || err}`);
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  scanSessions();
  scanCleanups().catch(() => {});   // macOS paths; elsewhere there may be nothing to scan
  trackOwners();
  console.log(tr('server.console.listening', { port: PORT, phone: HOST === '127.0.0.1' ? tr('server.console.lanOff') : lanUrl(false) || tr('server.console.noLan') }));
});
