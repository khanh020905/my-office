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
import { execFile, execFileSync, spawn } from 'node:child_process';
import { sysSnapshot, sysAction, scanCleanups, trackOwners, startTrend, setI18n, fmtBytes as sysBytes } from './system.mjs';
import { OS } from './platform/index.mjs';
import { redact } from './redact.mjs';
import { testRunner } from './testrun.mjs';
import { scanUsage, blankUsage, ctxMax } from './usage.mjs';
import next from 'next';
import { buildTimeline } from '../src/shared/timeline.js';
import { dangerKey } from '../src/shared/danger.js';
import { createChatEngine, REACTIONS } from '../src/shared/chat-engine.js';
import { createTasks } from './tasks.mjs';
import { createPush } from './push.mjs';
import { SHOT_ASK, shoot, shotsIn } from './shots.mjs';
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
const PAGE_FILES = new Set(['/favicon.ico', '/icon.svg', '/apple-icon.png', '/opengraph-image.jpg', '/twitter-image.jpg', '/manifest.webmanifest', '/sw.js', '/icon-512.png']);   // (app/: the tab icons, the share card, the app on a phone's home screen; public/: its worker and big icon)
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
// Or a PIN typed on /pin (6 to 10 digits: a random 6 at first, or your own, set on the Mac), which sets a signed cookie:
// for a year, renewed as it's used, on a phone where you tick "Remember this device"; for this visit only otherwise.
// The PIN is read from disk on each use, so a new one takes effect at once and signs out every phone (the cookie
// signature covers the PIN).
const PIN_FILE = path.join(DATA_DIR, 'pin'), PIN_RE = /^\d{6,10}$/;
function currentPin() {
  try { const p = fs.readFileSync(PIN_FILE, 'utf8').trim(); if (PIN_RE.test(p)) return p; } catch { /* first run */ }
  const p = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  fs.writeFileSync(PIN_FILE, p, { mode: 0o600 });
  return p;
}
currentPin();
/** A PIN of your own that a stranger would try first: all one digit, or a run like 123456 or 987654 (or not 6–10 digits). */
function pinWeak(p) {
  if (!PIN_RE.test(p)) return true;
  const d = [...p].map(Number), steps = new Set(d.slice(1).map((x, i) => x - d[i]));
  return steps.size === 1 && [0, 1, -1].includes([...steps][0]);
}

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
/* ---------- images a session touched: the feed shows them, a click opens them (GET /api/image?id=) ----------
   Only files a session read, wrote or edited with an image's extension, looked up by an id (never a path sent by the
   page); the last 400 remembered across restarts (data/images.json). */
const IMG_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml' };
const IMG_FILE = path.join(DATA_DIR, 'images.json');
const images = (() => { try { return new Map(Object.entries(JSON.parse(fs.readFileSync(IMG_FILE, 'utf8')))); } catch { return new Map(); } })();
let imgSave = null;
function imageId(file) {
  if (!file || typeof file !== 'string' || !IMG_EXT[path.extname(file).slice(1).toLowerCase()]) return null;
  const abs = path.resolve(file), id = crypto.createHash('sha1').update(abs).digest('hex').slice(0, 16);
  if (images.get(id) === abs) return id;
  images.set(id, abs);
  while (images.size > 400) images.delete(images.keys().next().value);
  clearTimeout(imgSave); imgSave = setTimeout(() => fsp.mkdir(DATA_DIR, { recursive: true }).then(() => fsp.writeFile(IMG_FILE, JSON.stringify(Object.fromEntries(images)))).catch(() => {}), 2000);
  return id;
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
    case 'Read': return { type: 'read', label: base(i.file_path), file: i.file_path };
    case 'NotebookRead': return { type: 'read', label: base(i.notebook_path) };
    case 'Grep': return { type: 'grep', label: clip(redact(oneLine(i.pattern)), 40) };
    case 'Glob': return { type: 'glob', label: clip(oneLine(i.pattern), 40) };
    case 'Edit': case 'MultiEdit': return { type: 'edit', label: base(i.file_path), file: i.file_path };
    case 'NotebookEdit': return { type: 'edit', label: base(i.notebook_path) };
    case 'Write': return { type: 'write', label: base(i.file_path), file: i.file_path };
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
  if (type === 'commit') { rollDay(); stats.commit = (stats.commit || 0) + 1; dirty = true; }   // (today's letters in the lobby's post box)
  const e = { id: ++seq, ts: Date.now(), sess: s.id, name: s.name, type, label, repo: r.name, branch: r.branch, url: r.ciUrl || undefined };
  pushFeed(e); broadcast({ k: 'ev', e, s: pub(s), stats }); chat.onEvent(e);
}
const git = createGit({
  onRepo: (r) => { for (const s of sessionsIn(r.root)) broadcast({ k: 'sess', s: pub(s) }); },
  onCommit: (r, subject) => gitEvent(r, 'commit', clip(redact(oneLine(subject)), 64)),
  onPush: (r) => gitEvent(r, 'push', r.branch),
  onCi: (r) => gitEvent(r, r.ci === 'red' ? 'cired' : 'cigreen', r.ciName),
});
const pollGit = () => git.poll([...sessions.values()].map((s) => s.cwd));
setInterval(() => { if (watching()) pollGit(); }, 20_000).unref();
setInterval(() => { if (watching()) git.pollCi(); }, 120_000).unref();

function rollDay() { if (stats.day !== today()) stats = { day: today(), read: 0, edit: 0, cmd: 0, web: 0, prompts: 0, deploy: 0, commit: 0 }; }

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
  entry: s.entry || '', moved: s.parked ? { to: acctShown(s.parked.to), at: s.parked.at } : null,
  lastAt: s.lastEventAt || s.createdAt, doneAt: s.doneAt || 0, todos: s.todos || [], lastReply: s.lastReply || '', origin: s.origin || '',
  bg: s.bg ? [...s.bg.values()].slice(0, 6) : [],
  dayFirst: s.dayFirst || null,
  git: gitOf(s),
  usage: s.usage?.model ? { cost: Math.round(s.usage.cost * 100) / 100, ...liveCtx(s), model: s.usage.model, out: s.usage.out } : null });
function gitOf(s) { const r = s.cwd && git.repoOf(s.cwd); return r ? { repo: r.name, branch: r.branch, dirty: r.dirty, ahead: r.ahead, ci: r.ci, ciName: r.ciName, ciUrl: r.ciUrl, born: r.born || null } : null; }
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
/* The same messages for a page that asks instead of keeping a stream open: through the Cloudflare quick tunnel, which holds
   a stream's data back until it ends (quick tunnels don't do server-sent events), GET /api/live?since=<n> waits up to 25 s
   for what was broadcast after message n and answers as soon as there is something. The last 400 are kept. */
const backlog = [], waiting = new Set();
let sent = 0, polledAt = 0;   // (sent: how many messages so far, the number of the last)
const watching = () => clients.size > 0 || Date.now() - polledAt < 60_000;   // (a page open: a stream, or asking now and then)
function broadcast(obj) {
  for (const c of clients) send(c.res, obj);
  backlog.push([++sent, JSON.stringify(obj)]); if (backlog.length > 400) backlog.shift();
  for (const w of waiting) w();
  if (RECORDED.has(obj.k)) record(obj);
}

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

/* ---------- the company group chat (src/shared/chat-engine.js; the window: src/office/ui/group-chat*.js) ----------
   One conversation for every page, kept here (data/chat.json): what the sessions say about their work comes straight
   from the events below, so it goes on with no page open and a phone sees it too; the office's life is told by the
   Mac's page (POST /api/chat say); you write from any page. Pages get { k: 'chat', op, m | typing } and { k: 'chatact' }. */
const CHAT_FILE = path.join(DATA_DIR, 'chat.json');
let chat = null, chatSaveT = null;
const STAFF_NAME = { __reception: 'people.staff.receptionist', __hr: 'people.staff.hr', __cleaner: 'people.staff.cleaner', __accountant: 'people.accountant.name', __guard: 'people.guard.name', __director: 'people.director', __courier: 'people.staff.shipper', __claude: 'chat.claudeTag' };   // (__claude: a new conversation's answers, before it has a person)
chat = createChatEngine({
  tr, now: () => Date.now(),
  members: () => [...sessions.values()].map((s) => ({ id: s.id, name: s.title || s.name || 'claude', status: s.status, task: s.lastPrompt ? clip(oneLine(unwrapPaste(s.lastPrompt)), 80) : '', last: s.last, project: path.basename(s.cwd || '') })),
  staffName: (key) => (STAFF_NAME[key] ? tr(STAFF_NAME[key]) : null),
  store: {
    load: () => { try { return JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8')); } catch { return null; } },
    save: (d) => { clearTimeout(chatSaveT); chatSaveT = setTimeout(() => { fsp.writeFile(`${CHAT_FILE}.tmp`, JSON.stringify(d)).then(() => fsp.rename(`${CHAT_FILE}.tmp`, CHAT_FILE)).catch(() => {}); }, 800); },
  },
  emit: (op, x) => broadcast(op === 'typing' ? { k: 'chat', op, typing: x } : { k: 'chat', op, m: x, pinned: chat?.state.pinned ?? null }),
  act: (what) => broadcast({ k: 'chatact', what }),
});
setInterval(() => chat.clock(), 30_000).unref();
const chatOut = () => ({ ok: true, msgs: chat.state.msgs, pinned: chat.state.pinned, typing: chat.state.typing });

/* ---------- "Giao việc" (server/tasks.mjs): Claude Code runs started from the office ---------- */
const taskSids = new Set(), taskQuote = new Map();   // the sessions those runs became (their leaving isn't announced: their result is); your task, quoted in the answer
const tasks = createTasks({
  dataDir: DATA_DIR, claude: () => findClaude(),
  env: () => { const e = { ...process.env }; if (nowDir) e.CLAUDE_CONFIG_DIR = nowDir; return e; },   // (the account new sessions start on)
  onStep: (t, x) => cardStep(t.id, stepOf(x.name, x.input)),
  onDone: (t) => {
    if (t.sid) taskSids.add(t.sid);
    const card = cards.get(t.id); cards.delete(t.id);
    if (card) { clearTimeout(card.timer); chat.setWork(card.id, { state: t.stopped ? 'stopped' : t.error && !t.result ? 'fail' : 'done', steps: card.steps, n: card.n, end: Date.now(), perm: null, ask: null }); }
    for (const x of sessions.values()) if (x.viaOffice === t.id) delete x.viaOffice;   // (its events are its own again)
    const dm = t.from?.chat, folder = path.basename(t.dir);
    // the answer from whoever you asked (the conversation's person; Claude itself for a new conversation, or if that one has gone)
    const all = [...sessions.values()], who = (t.from?.id && all.some((x) => x.id === t.from.id) && t.from.id) || (dm ? 'claude' : t.sid && all.find((x) => x.sid === t.sid)?.id);
    // the pages it changed (its SCREENSHOT lines): named under the answer, then their pictures at a phone's size
    const { text: said, urls } = shotsIn(t.result);
    const text = t.stopped && !t.result ? tr('chat.task.stopped') : t.error && !t.result ? tr('chat.task.failed', { folder, error: clip(oneLine(t.error), 200) }) : clip(`${said || tr('chat.task.doneEmpty')}${urls.length ? `\n\n📸 ${tr('chat.task.shots', { pages: urls.map((u) => new URL(u).pathname).join(', ') })}` : ''}`, dm ? 3800 : 560);
    const quote = taskQuote.get(t.id) || null; taskQuote.delete(t.id);
    if (dm) { chat.working(t.from.id || 'claude', false); if (t.sid) threads.set(t.from.orig, { sid: t.sid, at: Date.now(), running: false }); else threads.delete(t.from.orig); }   // (no branch made: the next message makes one)
    if (who) chat.say(who, text, { now: true, long: true, reply: quote, tag: 'claude', react: ['❤️', '👍'], reacts: 2 });
    else chat.system(`📋 ${folder}: ${clip(oneLine(text), 300)}`);
    pushOut({ title: `💬 ${t.from?.name || folder}`, body: clip(oneLine(text), 180), tag: `task-${t.id}`, url: '/?chat' });
    if (who && urls.length) (async () => { for (const u of urls) { const photo = await shoot(u).catch(() => null); if (photo) chat.say(who, '', { photo, now: true }); } })();
  },
});
/* ---------- notifications on the phones that said yes (server/push.mjs): Claude's answers, and an approval a run started
   from the office needs while nobody has the office open; none while an office page is looked at ---------- */
const push = createPush({ dataDir: DATA_DIR, log: (l) => fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} ${l}\n`).catch(() => {}) });
const pushOut = (msg) => { if (push.count() && !officeFocused()) push.notify(msg).catch(() => {}); };

/* Writing to a conversation from the chat ("Gửi tới"): the first message branches it (its whole context, the one open in
   your editor left as it is); what you write next carries on that branch, so it remembers what you said (for 6 hours). */
const threads = new Map();   // the conversation's own id (or 'dir:' a project) -> { sid: the one carried on, at, running }
// each run's card in the chat (Claude at work: its steps as they come, then done): task id -> { id, steps, n, at, timer }
const cards = new Map();
function cardStep(taskId, step) {
  const c = cards.get(taskId); if (!c) return;
  c.steps.push(step); c.n++; if (c.steps.length > 40) c.steps.shift();
  if (!c.timer) c.timer = setTimeout(() => { c.timer = 0; chat.setWork(c.id, { steps: c.steps, n: c.n }); }, 700);   // (a burst of steps: one update; its state is set where it changes)
}
// one line for a step on the card: what Claude does (its tool), on what (a file, a command, a search)
function stepOf(name, i = {}) {
  const f = (p) => path.basename(String(p || '')), c = (t, n = 70) => clip(redact(oneLine(String(t || ''))), n);
  switch (name) {
    case 'Read': return `📖 ${tr('chat.step.read', { f: f(i.file_path) })}`;
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return `✏️ ${tr('chat.step.edit', { f: f(i.file_path || i.notebook_path) })}`;
    case 'Write': return `📝 ${tr('chat.step.write', { f: f(i.file_path) })}`;
    case 'Bash': return `▶ ${c(i.description || i.command)}`;
    case 'Grep': case 'Glob': return `🔍 ${c(i.pattern, 50)}`;
    case 'WebSearch': return `🌐 ${c(i.query, 60)}`;
    case 'WebFetch': try { return `🌐 ${new URL(i.url).host}`; } catch { return '🌐'; }
    case 'Task': case 'Agent': return `🤖 ${c(i.description, 60)}`;
    case 'TodoWrite': return `☑️ ${tr('chat.step.todo')}`;
    default: return `⚙️ ${c(name, 40)}`;
  }
}
// the run started from the office that a session's events belong to (its card shows them, not the chat's chatter)
function runOf(sid, cwd, now = Date.now()) {
  const list = tasks.list();
  return list.find((t) => t.sid === sid) || list.find((t) => t.from?.sid === sid) || list.find((t) => !t.sid && !t.from?.sid && t.dir === cwd && now - t.at < 30e3) || null;
}
// a run on the conversation's own account (its history is there): null for the main one (~/.claude)
const acctEnv = (slug) => ({ CLAUDE_CONFIG_DIR: slug ? dirOfSlug(slug) : null });
/* Carrying on, from a phone, a conversation open in the editor and resting: it is closed there first (safely: the process
   it is, still resting) and parked on its account, so its tab takes it up again (the editor's script, --resume) the next
   time you write there, with what was said on the phone. One in a terminal can't be: it would just end. */
async function parkForPhone(s) {
  const name = s.title || s.name;
  if (s.entry !== 'claude-vscode') return { ok: false, message: tr('chat.task.macTerminal', { name }) };
  const eds = setEditorWrapper(true), host = eds.find((e) => e.app === s.origin);
  if (!(host ? host.ok : eds.some((e) => e.ok))) return { ok: false, message: tr('server.move.noScript') };
  editorsNow = eds;
  const proc = (await sysSnapshot().catch(() => null))?.claude?.find((c) => c.pid === s.pid);
  if (!proc) return { ok: true };   // (already gone: nothing to close)
  const acct = acctOf(s) || '', pin = path.join(PIN_DIR, s.sid);
  try { fs.mkdirSync(PIN_DIR, { recursive: true }); fs.writeFileSync(pin, `${acct ? dirOfSlug(acct) : ''}\n`); } catch { return { ok: false, message: tr('server.move.failed') }; }
  s.parked = { to: acct, at: Date.now(), phone: true };   // (before the process goes: the scan must not see it leave)
  closingOnPurpose([s.pid]);
  const r = await sysAction({ action: 'closeIdle', items: [{ target: s.pid, start: proc.start }] }).catch(() => null);
  if (!r?.closed?.length) { delete s.parked; fs.rmSync(pin, { force: true }); return { ok: false, message: tr('server.move.failed') }; }
  s.pid = null;
  chat.system(tr('chat.task.parked', { name }));
  fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} phone carries on ${name} (${s.sid})\n`).catch(() => {});
  broadcast({ k: 'sess', s: pub(s) });
  return { ok: true };
}
const tasksOut = (local) => ({ ok: true, allowed: local || !!prefs.get('phoneTasks'), running: tasks.list(),
  projects: knownDirs.filter((d) => fs.existsSync(d)).map((d) => ({ dir: tilde(d), name: path.basename(d) })),
  sessions: [...sessions.values()].filter((s) => s.sid && s.cwd).map((s) => ({ id: s.id, sid: s.sid, name: s.title || s.name, dir: tilde(s.cwd), status: s.status })) });

/* ---------- the project folders sessions have worked in: where "Giao việc" may start a new conversation (a phone
   picks one of these, never a path of its own); the last 30, kept in data/projects.json ---------- */
const DIRS_FILE = path.join(DATA_DIR, 'projects.json');
let knownDirs = []; try { knownDirs = JSON.parse(fs.readFileSync(DIRS_FILE, 'utf8')).filter((d) => typeof d === 'string'); } catch { /* none yet */ }
function noteDir(dir) {
  if (!dir || !path.isAbsolute(dir) || knownDirs[0] === dir) return;
  knownDirs = [dir, ...knownDirs.filter((d) => d !== dir)].slice(0, 30);
  fsp.writeFile(DIRS_FILE, JSON.stringify(knownDirs)).catch(() => {});
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
      if (prevKey && sessions.has(prevKey)) { s = sessions.get(prevKey); sessions.delete(prevKey); s.key = key; unpark(s); }
      else { s = newSession(key); s.createdAt = j.startedAt || Date.now(); }
      sessions.set(key, s);
      changed = true;
    }
    if (j.sessionId && s.sid !== j.sessionId) { if (s.sid) sidToKey.delete(s.sid); s.sid = j.sessionId; changed = true; }
    if (j.sessionId) sidToKey.set(j.sessionId, key);
    const link = j.bridgeSessionId ? 'https://claude.ai/code/' + j.bridgeSessionId : null;
    const name = j.name || base(j.cwd) || 'claude';
    if (s.name !== name || s.cwd !== j.cwd || s.link !== link) { s.name = name; s.cwd = j.cwd || ''; s.link = link; changed = true; noteDir(s.cwd); }
    s.pid = j.pid; s.fromFile = true; s.busy = j.status === 'busy'; s.entry = j.entrypoint || '';
    // Claude's own session file says busy: trust it even if we missed the hook (e.g. the server restarted mid-turn).
    if (s.busy && s.status === 'rest') { s.status = 'work'; if (!s.taskStart) s.taskStart = j.statusUpdatedAt || Date.now(); s.lastEventAt = Math.max(s.lastEventAt, Date.now()); changed = true; }
    if (changed) broadcast({ k: 'sess', s: pub(s) });
    if (!s.lastPrompt && !s.recalled && s.sid && s.cwd) { s.recalled = true; recallTask(s); }
    if (s.sid && s.cwd && !s.titleAt) { refreshTitle(s, true); originOf(s).then((o) => { if (o && o !== s.origin) { s.origin = o; broadcast({ k: 'sess', s: pub(s) }); } }); }
  }
  for (const [key, s] of sessions) {
    if (s.fromFile && !live.has(key) && !(s.parked && Date.now() - s.parked.at < PARK_MS)) dropSession(key, s);   // (a moved one waits at its desk)
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
  if (s.fromFile && !taskSids.has(s.sid) && !s.viaOffice) chat.onLeft(s.title || s.name);
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
    s.sid = sid; s.cwd = p.cwd || ''; s.name = `${base(p.cwd) || 'claude'}-${sid.slice(0, 2)}`; noteDir(s.cwd);
    sessions.set(key, s); sidToKey.set(sid, key);
    broadcast({ k: 'sess', s: pub(s) });
  }
  const now = Date.now();
  s.lastEventAt = now;
  { const day = new Date(now).toLocaleDateString('sv'); if (ev !== 'SessionEnd' && s.dayFirst?.day !== day) s.dayFirst = { day, at: now }; }   // (its first sign of life each day: the lobby's attendance terminal)
  if (p.transcript_path) s.transcript = p.transcript_path;
  { const run = runOf(sid, p.cwd, now); if (run && !s.viaOffice) s.viaOffice = run.id; }   // (a run from the office: its card tells it)
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
      Object.defineProperty(e, 'full', { value: clip(redact(unwrapPaste(String(p.prompt || '').replace(STRIP_TAGS, '')).trim()), 4000), enumerable: false });   // (the chat shows it whole)
      break;
    }
    case 'PreToolUse': {
      const c = await classifyVi(p.tool_name, p.tool_input);
      const runner = p.tool_name === 'Bash' && testRunner(p.tool_input?.command);   // a test run: the test board lights up for it
      if (runner) Object.assign(c, { type: 'test', runner });
      if (!agent) { if (s.status === 'rest' && !s.taskStart) s.taskStart = now; s.status = 'work'; s.inTool = true; s.last = { type: c.type, label: c.label }; }
      else { const x = s.subs[agent]; if (x) { x.last = { type: c.type, label: c.label }; x.steps++; } }   // (it may have stopped while the call was being read)
      const img = imageId(c.file);
      e = mk(c.type, c.label, { desc: c.desc, agent, agentType: p.agent_type || null, quiet: !!agent, ...(c.runner ? { runner: c.runner } : {}), ...(img ? { img } : {}) });
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
      const runner = !e && p.tool_name === 'Bash' && testRunner(p.tool_input?.command);
      if (runner) { e = mk('testok', runner, { agent, quiet: !!agent }); if (agent) toFeed = false; }
      break;
    }
    case 'PostToolUseFailure': {
      if (!agent) s.inTool = false;
      if (s.status === 'wait') s.status = 'work';
      const c = await classifyVi(p.tool_name, p.tool_input), runner = p.tool_name === 'Bash' && testRunner(p.tool_input?.command);
      // (a failing test run is the test board's red lamp, not a failure that counts towards an incident)
      e = runner ? mk('testfail', runner, { agent, quiet: !!agent }) : mk('fail', c.label || p.tool_name || '', { agent, quiet: !!agent });
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
    case 'StopFailure': {
      s.status = 'rest';
      // out of usage: that account takes no new session until it resets; with switching on, the next one takes over
      const acct = acctOf(s), out = p.error === 'rate_limit' ? limitHit(acct) : null;
      if (out) autoMoveSoon(acct);   // (with switching on, this conversation and the others resting on it move over)
      const moves = out?.to && prefs.get('autoMove') !== false && s.entry === 'claude-vscode' && untilOf(acct) - Date.now() >= 15 * 60e3;
      e = mk('fail', !out ? tr('server.event.modelError') : out.to ? tr(moves ? 'server.event.limitMove' : 'server.event.limitSwitch', { to: out.to }) : tr('server.event.limitHit'), { limit: !!out });
      break;
    }
    case 'PreCompact':
      e = mk('compact', p.trigger || '');
      break;
    default:
      return;
  }
  if (e) {
    if (toFeed) pushFeed(e);
    broadcast({ k: 'ev', e, s: pub(s), stats });
    if (!s.viaOffice) chat.onEvent(e);
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
// (a request through the Cloudflare tunnel comes from cloudflared on 127.0.0.1 but is from the internet: never this Mac)
const isLoopback = (req) => !req.viaTunnel && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
// who is asking, for the PIN's lockouts and the action log: through the tunnel, the address Cloudflare saw
const clientIp = (req) => (req.viaTunnel ? String(req.headers['cf-connecting-ip'] || 'tunnel').slice(0, 64) : req.socket.remoteAddress);
// a POST from this office's own page (not another site's): http on this computer and the LAN, https through the tunnel
function sameOriginOf(req) {
  const o = req.headers.origin;
  return !o || o === `http://${req.headers.host}` || (req.viaTunnel && !!tunnel.url && o === tunnel.url);
}
// Only answer to our own host names: stops DNS-rebinding pages from reaching this server.
function hostAllowed(req) {
  const h = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  if (req.viaTunnel) return h === tunnel.host || h === '127.0.0.1';   // (the tunnel's own name, or its listener as cloudflared calls it)
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
/* ---------- closing idle Claude sessions on a timer (the Mac drawer's switch; off unless turned on) ----------
   Every 5 minutes: the sessions idle longer than the chosen hours, never one that is working, waiting for an answer
   from you, or driven from a phone (Remote Control). The same checks as the drawer's buttons (system.mjs, closeIdle). */
const autoLast = [];   // the last closings: { at, names, n, size }
async function autoCloseIdle() {
  const hours = prefs.autoClose();
  if (!hours) return;
  const snap = await sysSnapshot().catch(() => null);
  if (!snap) return;
  const waiting = new Set([...sessions.values()].filter((s) => s.pid && (s.status === 'wait' || [...pending.values()].some((p) => p.sess === s.id))).map((s) => s.pid));
  const items = snap.claude.filter((c) => !c.busy && !c.remote && c.idle >= hours * 3600 && !waiting.has(c.pid)).map((c) => ({ target: c.pid, start: c.start }));
  if (!items.length) return;
  closingOnPurpose(items.map((i) => i.target));
  const r = await sysAction({ action: 'closeIdle', items }).catch(() => null);
  if (!r?.closed?.length) return;
  const size = sysBytes(r.closed.reduce((a, c) => a + c.mem, 0)), names = r.closed.map((c) => c.name).join(', ');
  const message = tr('server.sys.result.autoClosed', { n: r.closed.length, hours, names, size });
  autoLast.unshift({ at: Date.now(), n: r.closed.length, names, size }); autoLast.length = Math.min(autoLast.length, 5);
  fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} auto-close ${hours}h -> ${names}\n`).catch(() => {});
  broadcast({ k: 'sysauto', message });
}
setInterval(() => { autoCloseIdle().catch(() => {}); }, 5 * 60_000).unref();
// The Mac's address on a Tailscale network (100.64.0.0/10), when it is on one: the office from anywhere, privately
function tsUrl() {
  for (const n of Object.values(os.networkInterfaces()).flat()) {
    const m = n && n.family === 'IPv4' && /^100\.(\d+)\./.exec(n.address);
    if (m && +m[1] >= 64 && +m[1] <= 127) return `http://${n.address}:${PORT}/`;
  }
  return null;
}
function lanUrl(withToken = true) {
  const nets = os.networkInterfaces();
  const order = ['en0', 'en1', ...Object.keys(nets)];
  for (const name of order) for (const n of nets[name] || []) if (n.family === 'IPv4' && !n.internal) return `http://${n.address}:${PORT}/${withToken ? `?k=${TOKEN}` : ''}`;
  return null;
}
// The cookie: <expiry>.<k: a device you trust, kept a year | s: this visit, until the browser closes (12 h at most)>.<signature>.
// SameSite=Lax, not Strict: opening the address from another app (the camera's QR code, a link in a chat) is a visit from
// elsewhere, and Strict would leave the cookie behind and ask for the PIN again. A POST from another site still goes
// without it, and every POST checks its Origin as well.
const COOKIE = 'office_pin', KEEP_DAYS = 365, VISIT_MS = 12 * 3600e3;
const sign = (exp, kind = '') => crypto.createHmac('sha256', TOKEN).update(`pin:${exp}:${kind ? `${kind}:` : ''}${currentPin()}`).digest('base64url');
const sameBytes = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function pinCookie(req, keep = true) {
  const kind = keep ? 'k' : 's', exp = Date.now() + (keep ? KEEP_DAYS * 86400e3 : VISIT_MS);
  return `${COOKIE}=${exp}.${kind}.${sign(exp, kind)};${keep ? ` Max-Age=${KEEP_DAYS * 86400};` : ''} Path=/; HttpOnly; SameSite=Lax${req?.viaTunnel ? '; Secure' : ''}`;
}
/** The phone's cookie when it's good: { exp, keep } (one from before "Remember this device" counts as kept). */
function pinCookieOf(req) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)\\.(?:([ks])\\.)?([\\w-]+)`).exec(String(req.headers.cookie || ''));
  return m && Number(m[1]) > Date.now() && sameBytes(m[3], sign(m[1], m[2] || '')) ? { exp: Number(m[1]), keep: m[2] !== 's' } : null;
}
const cookieOk = (req) => !!pinCookieOf(req);
function authorized(req, url) { return isLoopback(req) || (!req.viaTunnel && sameBytes(url.searchParams.get('k') || '', TOKEN)) || cookieOk(req); }

// 6 digits (at least) is a million guesses: 5 wrong tries lock that address for 15 minutes, and 20 wrong tries from anywhere
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
const PIN_CSS = `*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;background:#f4f1ea;color:#1d1b16;
font:16px/1.5 system-ui,-apple-system,sans-serif;padding:16px;padding-bottom:max(16px,env(safe-area-inset-bottom))}@media (prefers-color-scheme:dark){body{background:#16151a;color:#ece9e2}
.card{background:#211f26!important;border-color:#3a3742!important}input[name=pin]{background:#16151a!important;color:#ece9e2!important;border-color:#4a4654!important}.keep small{color:#9a948a!important}}
.card{width:100%;max-width:360px;background:#fff;border:1px solid #e3ddd0;border-radius:20px;padding:28px 24px;box-shadow:0 10px 40px rgba(0,0,0,.08)}
h1{font-size:1.25rem;margin:0 0 4px}p{margin:0 0 18px;color:#7a7468;font-size:.92rem}
input[name=pin]{width:100%;font:600 1.75rem/1 ui-monospace,Menlo,monospace;letter-spacing:.3em;text-align:center;padding:14px 0 14px .3em;border:1.5px solid #d8d1c2;
border-radius:14px;background:#fbfaf7;outline:none}input[name=pin]:focus{border-color:#d97757;box-shadow:0 0 0 4px rgba(217,119,87,.18)}
.keep{display:flex;gap:10px;align-items:flex-start;margin:14px 0 0;cursor:pointer;font-size:.95rem;line-height:1.35}.keep input{width:22px;height:22px;margin:0;flex:none;accent-color:#d97757}
.keep small{display:block;color:#7a7468;font-size:.8rem;margin-top:2px}
button{margin-top:14px;width:100%;height:48px;border:0;border-radius:14px;background:#d97757;color:#fff;font:600 1rem system-ui;cursor:pointer}
button:disabled{opacity:.5;cursor:default}.err{color:#c0392b;margin:12px 0 0;font-size:.9rem}.ico{font-size:2rem;margin-bottom:8px}`;
function pinPage(res, code, msg = '', locked = false) {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' }).end(`<!doctype html>
<html lang="${prefs.lang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>My Office</title><style>${PIN_CSS}</style></head>
<body><form class="card" method="post" action="/pin" autocomplete="off"><div class="ico">🏢</div><h1>${esc(tr('server.pin.title'))}</h1>
<p>${esc(tr('server.pin.help'))}</p>
<input name="pin" inputmode="numeric" pattern="\\d{6,10}" maxlength="10" autocomplete="one-time-code" required autofocus aria-label="${esc(tr('server.pin.label'))}" ${locked ? 'disabled' : ''}>
<label class="keep"><input type="checkbox" name="keep" value="1" checked ${locked ? 'disabled' : ''}><span>${esc(tr('server.pin.keep'))}<small>${esc(tr('server.pin.keepHint'))}</small></span></label>
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
  // a run started from the office (a phone's work) may wait for a phone to answer even with no office open: they get a push
  const ours = !!p?.session_id && push.count() > 0 && !!prefs.get('phoneApprove') && tasks.list().some((t) => t.sid === p.session_id || t.from?.sid === p.session_id);
  if (!p || !p.session_id || ASK_TOOLS.has(p.tool_name) || (!officeFocused() && !ours)) { res.writeHead(200).end(''); return; }
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
  if (ours) pushOut({ title: tr('server.push.permTitle', { name: entry.name }), body: clip(`${c.label}: ${oneLine(entry.detail)}`, 180), tag: `perm-${id}`, url: '/', urgent: true });
  { const run = tasks.list().find((t) => t.sid === p.session_id || t.from?.sid === p.session_id), card = run && cards.get(run.id);
    if (card) { card.wait = clip(`${c.label}: ${oneLine(entry.detail)}`, 120); chat.setWork(card.id, { state: 'wait', ask: card.wait, perm: id, risky: !!dangerKey(entry), steps: card.steps, n: card.n });   // (perm: its Allow / Deny buttons)
      res.on('close', () => { if (cards.get(run.id) === card) { card.wait = null; chat.setWork(card.id, { state: 'work', ask: null, perm: null }); } }); } }
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
  if (moved) { broadcast({ k: 'limits', limits: limitsOut(), note: '' }); repick(); }
  fsp.writeFile(LIMITS_FILE, JSON.stringify(planLimits)).catch(() => {});
}
// A window's label is words: "5 h", "Week", "Opus (week)" (weekOf: the model). Written when a reading arrives and again
// each time the limits are sent, so a reading saved before a language switch reads in the new language.
const winLabel = (w) => clip(String(w.key === 'session' ? tr('server.limits.fiveHour') : w.key === 'weekly' ? tr('server.limits.week') : w.weekOf ? tr('server.limits.modelWeek', { model: w.weekOf }) : w.label), 30);
function limitsOut() {
  const l = planLimits, more = othersOut(), main = { label: acctLabel(''), until: blockedUntil(l?.windows, hits.get('')), auto: autoOut() };
  if (!l) return more.length ? { windows: [], others: more, ...main } : l;
  return { ...l, windows: Array.isArray(l.windows) ? l.windows.map((w) => ({ ...w, label: winLabel(w) })) : l.windows,
    five: l.five && { ...l.five, label: tr('server.limits.fiveHour') }, seven: l.seven && { ...l.seven, label: tr('server.limits.week') }, others: more, ...main };
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
      if (r.status === 429) { usageBackoff = Math.min(30, (usageBackoff || 2.5) * 2); usageWait = Date.now() + Math.max(usageBackoff * 60e3, (Number(r.headers.get('retry-after')) || 0) * 1000); usageNote = ['server.usage.rateLimited', { n: usageBackoff }]; return; }
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
setInterval(() => { if (watching()) { fetchPlanUsage(); for (const d of otherDirs) setTimeout(() => fetchOtherUsage(d), Math.random() * 40e3).unref(); } }, 120_000).unref();

/* ---------- other accounts on this machine ----------
   A second Claude Code login lives in its own config folder (CLAUDE_CONFIG_DIR, e.g. ~/.claude-org2): found as the
   ~/.claude-* folders that are logged in (their .claude.json has an account), plus any listed in OFFICE_CLAUDE_DIRS.
   Each one's usage is read the same way as the main account's, on its own schedule; a session belongs to the account
   whose folder its transcript is in (Claude Code writes it there even when projects/ is shared by a link). */
// (switching accounts, further down: kept up here because the first scan below already reads them)
const hits = new Map();   // account ('' = the main one) -> until when a session was told it is out of usage
const NOW_FILE = path.join(DATA_DIR, 'account-now'), SWITCH_FILE = path.join(DATA_DIR, 'claude-switch.sh');
const CLOSING_DIR = path.join(DATA_DIR, 'closing');   // the Claude processes the office is closing on purpose (the editor's script reads it)
// before closing them: their ids, so the editor's script tells the editor they ended well (no red "exited with code 143")
function closingOnPurpose(pids) { try { fs.mkdirSync(CLOSING_DIR, { recursive: true }); for (const p of pids) if (p) fs.writeFileSync(path.join(CLOSING_DIR, String(p)), ''); } catch { /* read-only data: the editor shows its message */ } }
setInterval(() => { try { for (const f of fs.readdirSync(CLOSING_DIR)) { const p = path.join(CLOSING_DIR, f); if (Date.now() - fs.statSync(p).mtimeMs > 10 * 60e3) fs.rmSync(p, { force: true }); } } catch { /* none */ } }, 10 * 60e3).unref();
const PIN_DIR = path.join(DATA_DIR, 'resume-on'), PARK_MS = 24 * 3600e3;   // a conversation moved to another account: <its id> -> that account's folder
const FULL_PCT = 98;   // a limit this used: no new session on that account
// what an account's folder takes from the main one, by a link (when the main one has it): a session on any account has
// the same history (resume), memory, settings, skills and plugins
const SHARED = ['projects', 'sessions', 'ide', 'plugins', 'skills', 'agents', 'commands', 'output-styles', 'file-history', 'todos', 'plans', 'settings.json', 'CLAUDE.md', 'keybindings.json'];
let nowDir = '', modelAt = 0, modelNow = '', editorsNow = [], switchAlias = '';
try { nowDir = fs.readFileSync(NOW_FILE, 'utf8').split('\n')[0].trim(); } catch { /* the main account */ }
let otherDirs = [];
const others = new Map();   // folder -> { at, windows, account, note, wait, backoff }
const accName = (d) => clip(path.basename(d).replace(/^\.claude-?/, '') || path.basename(d), 16);
const loggedIn = (d) => { try { return !!JSON.parse(fs.readFileSync(path.join(d, '.claude.json'), 'utf8')).oauthAccount; } catch { return false; } };
function scanAccounts() {
  const home = os.homedir(), found = new Set();
  for (const d of String(process.env.OFFICE_CLAUDE_DIRS || '').split(path.delimiter).filter(Boolean)) found.add(path.resolve(d.replace(/^~(?=$|[\\/])/, home)));
  try { for (const e of fs.readdirSync(home, { withFileTypes: true })) if (/^\.claude-./.test(e.name) && (e.isDirectory() || e.isSymbolicLink())) found.add(path.join(home, e.name)); } catch { /* no home */ }
  const next = [...found].filter((d) => path.resolve(d) !== path.resolve(CLAUDE_DIR) && loggedIn(d)).sort();
  if (next.join('|') !== otherDirs.join('|')) {
    otherDirs = next; for (const d of others.keys()) if (!next.includes(d)) others.delete(d); for (const d of next) fetchOtherUsage(d, true);
    broadcast({ k: 'limits', limits: limitsOut(), note: noteText() });   // (a new login shows at once, before its usage is read)
    repick();
  }
}
function othersOut() {
  return otherDirs.map((d) => { const o = others.get(d) || {}, slug = accName(d);
    return { name: slug, label: acctLabel(slug), until: blockedUntil(o.windows, hits.get(slug)), at: o.at || 0, account: o.account || null, windows: (o.windows || []).map((w) => ({ ...w, label: winLabel(w) })), note: o.note ? tr(...o.note) : '' }; });
}
const otherBusy = new Map();
const OTHERS_FILE = path.join(DATA_DIR, 'others-usage.json');
function saveOthers() {
  const keep = Object.fromEntries([...others].filter(([, o]) => o.windows).map(([d, o]) => [d, { windows: o.windows, at: o.at, account: o.account }]));
  fsp.writeFile(OTHERS_FILE, JSON.stringify(keep)).catch(() => {});
}
try { for (const [d, o] of Object.entries(JSON.parse(fs.readFileSync(OTHERS_FILE, 'utf8')))) others.set(d, { ...o }); } catch { /* none yet */ }
function fetchOtherUsage(dir, force = false) {
  if (process.env.OFFICE_USAGE === '0') return Promise.resolve();
  const o = others.get(dir) || {}; others.set(dir, o);
  // the endpoint rate-limits each account: every 5 minutes at most (a forced read, when one runs out, still goes), and
  // after a 429 Anthropic's own wait or 5, 10, then up to 30 minutes; the last reading stays on show meanwhile
  if (Date.now() < (o.wait || 0) || (!force && o.at && Date.now() - o.at < 290_000) || otherBusy.has(dir)) return Promise.resolve();
  const job = (async () => {
    const login = await OS.claudeLogin(dir);
    if (!login?.accessToken) { o.note = ['server.usage.keychain']; return; }
    try {
      const r = await fetch('https://api.anthropic.com/api/oauth/usage', { headers: { Authorization: `Bearer ${login.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20' }, signal: AbortSignal.timeout(10000) });
      if (r.status === 429) { o.backoff = Math.min(30, (o.backoff || 2.5) * 2); const ms = Math.max(o.backoff * 60e3, (Number(r.headers.get('retry-after')) || 0) * 1000); o.wait = Date.now() + ms; o.note = ['server.usage.rateLimited', { n: Math.ceil(ms / 60e3) }]; return; }
      if (!r.ok) { o.note = r.status === 401 ? ['server.usage.expired'] : ['server.usage.httpError', { status: r.status }]; return; }
      o.backoff = 0; o.note = null; o.windows = usageWindows(await r.json()); o.at = Date.now(); o.account = loginAccount(login, path.join(dir, '.claude.json'));
      saveOthers();
    } catch { o.note = ['server.usage.offline']; }
  })().finally(() => { otherBusy.delete(dir); broadcast({ k: 'limits', limits: limitsOut(), note: noteText() }); repick(); });
  otherBusy.set(dir, job);
  return job;
}
// the account a session belongs to, by its transcript's folder ('' for the main one); one moved to another account and
// not started again yet: that one
const acctOf = (s) => { if (s.parked) return s.parked.to; const t = s.transcript || ''; const d = otherDirs.find((x) => t.startsWith(x + path.sep)); return d ? accName(d) : ''; };
scanAccounts();
setInterval(scanAccounts, 60_000).unref();   // (a login made in a terminal shows up without a restart)

/* ---------- adding an account (the plan card's "Add a Claude account") ----------
   prepareAccount(name): a config folder of its own (~/.claude-<name>), the office's hooks and status line in its
   settings.json (the CLI's own install, --settings: the same entries as the main account's), and the command that opens
   Claude Code with it, to log in. Then the office looks for that login every few seconds for a while. */
const slugOf = (name) => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20).replace(/-+$/, '');
/* Claude Code's CLI: on the PATH, else the usual install places and the editors' extensions (VS Code, Cursor, Windsurf,
   Antigravity…: the newest), where it often is when Claude Code came with an editor and was never put on the PATH */
let claudeBin = null;
function findClaude() {
  if (claudeBin && fs.existsSync(claudeBin.file)) return claudeBin;
  const home = os.homedir(), exe = process.platform === 'win32' ? 'claude.exe' : 'claude', isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
  if (process.env.OFFICE_CLAUDE_BIN && isFile(process.env.OFFICE_CLAUDE_BIN)) return (claudeBin = { file: process.env.OFFICE_CLAUDE_BIN, onPath: false });
  for (const d of String(process.env.PATH || '').split(path.delimiter)) if (d && isFile(path.join(d, exe))) return (claudeBin = { file: path.join(d, exe), onPath: true });
  for (const f of [path.join(home, '.local', 'bin', exe), path.join(home, '.claude', 'local', exe), '/opt/homebrew/bin/claude', '/usr/local/bin/claude', path.join(home, '.npm-global', 'bin', exe), path.join(home, '.bun', 'bin', exe)]) if (isFile(f)) return (claudeBin = { file: f, onPath: false });
  const ver = (f) => (/claude-code-(\d+)\.(\d+)\.(\d+)/.exec(f) || [0, 0, 0, 0]).slice(1).reduce((a, n) => a * 1000 + Number(n), 0), found = [];
  for (const ide of ['.vscode', '.vscode-insiders', '.cursor', '.windsurf', '.antigravity', '.antigravity-ide', '.kiro', '.trae', '.positron']) {
    try { for (const e of fs.readdirSync(path.join(home, ide, 'extensions'))) if (/^anthropic\.claude-code-/.test(e)) found.push(path.join(home, ide, 'extensions', e, 'resources', 'native-binary', exe)); } catch { /* not installed */ }
  }
  const best = found.filter(isFile).sort((a, b) => ver(b) - ver(a))[0];
  return (claudeBin = best ? { file: best, onPath: false } : null);
}
// the command that starts Claude Code with an account's folder (for working with it later): `claude` when the PATH has it
function accountCmd(slug) {
  const bin = findClaude(), cli = !bin || bin.onPath ? 'claude' : `"${bin.file}"`;
  return process.platform === 'win32'
    ? { run: `$env:CLAUDE_CONFIG_DIR="$HOME\\.claude-${slug}"; ${bin && !bin.onPath ? `& ${cli}` : cli}`, alias: `function claude-${slug} { $env:CLAUDE_CONFIG_DIR="$HOME\\.claude-${slug}"; ${bin && !bin.onPath ? `& ${cli}` : cli} @args }` }
    : { run: `CLAUDE_CONFIG_DIR="$HOME/.claude-${slug}" ${cli}`, alias: `alias claude-${slug}='CLAUDE_CONFIG_DIR="$HOME/.claude-${slug}" ${cli}'` };
}
/* Logging an account in without a terminal: Claude Code's own `claude auth login`, with the account's folder as its
   CLAUDE_CONFIG_DIR. It opens the sign-in page through a little BROWSER script that also hands the office the page's
   address ("open it again", "copy the link" for a private window) and finishes by itself when the browser comes back to
   it; a code from the page's fallback goes to its stdin. Each step goes to the page as { k: 'acctlogin' }. */
const logins = new Map();   // slug -> { child, state: 'waiting' | 'done' | 'failed' | 'cancelled', url, note }
function browserScript() {
  const f = path.join(DATA_DIR, 'open-login.sh');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(f, '#!/bin/sh\n[ -n "$OFFICE_LOGIN_URL_FILE" ] && printf \'%s\\n\' "$1" > "$OFFICE_LOGIN_URL_FILE"\nif command -v open >/dev/null 2>&1; then exec open "$1"; else exec xdg-open "$1"; fi\n', { mode: 0o755 });
  return f;
}
const pushLogin = (L) => broadcast({ k: 'acctlogin', name: L.slug, state: L.state, url: L.url || '', note: L.note || '' });
function startLogin(slug) {
  const was = logins.get(slug);
  if (was?.state === 'waiting') return was;
  const bin = findClaude();
  if (!bin) return { slug, state: 'failed', note: tr('server.account.noCli') };
  const urlFile = path.join(DATA_DIR, `login-${slug}.url`), env = { ...process.env, CLAUDE_CONFIG_DIR: path.join(os.homedir(), `.claude-${slug}`) };
  try { fs.rmSync(urlFile, { force: true }); } catch { /* none */ }
  if (process.platform !== 'win32') Object.assign(env, { BROWSER: browserScript(), OFFICE_LOGIN_URL_FILE: urlFile });
  const L = { slug, state: 'waiting', url: '', note: '' };
  try { L.child = spawn(bin.file, ['auth', 'login', '--claudeai'], { env, stdio: ['pipe', 'pipe', 'pipe'] }); } catch { return { slug, state: 'failed', note: tr('server.account.noCli') }; }
  logins.set(slug, L);
  let out = '';
  const seen = (d) => { out = (out + d).slice(-4000); const m = !L.url && /visit:\s*(https:\/\/\S+)/.exec(out); if (m) { L.url = m[1]; pushLogin(L); } };
  L.child.stdout.on('data', seen); L.child.stderr.on('data', seen); L.child.stdin.on('error', () => {});
  const look = setInterval(() => { try { const u = fs.readFileSync(urlFile, 'utf8').trim(); if (u && u !== L.url) { L.url = u; pushLogin(L); } } catch { /* not yet */ } }, 500);
  const stop = setTimeout(() => L.child.kill(), 15 * 60e3);
  L.child.on('error', () => { L.state = 'failed'; L.note = tr('server.account.noCli'); });
  L.child.on('exit', (code) => {
    clearInterval(look); clearTimeout(stop);
    if (L.state === 'waiting') { L.state = code === 0 ? 'done' : 'failed'; if (code !== 0) L.note = clip(oneLine(out.trim().split('\n').filter(Boolean).pop() || ''), 140); }
    scanAccounts(); pushLogin(L);
  });
  watchLogins();
  return L;
}
let watchUntil = 0, watchTimer = null;
function watchLogins() {   // every 4 s for 15 minutes: the new account appears in the card as soon as it has logged in
  watchUntil = Date.now() + 15 * 60e3;
  if (watchTimer) return;
  watchTimer = setInterval(() => { scanAccounts(); if (Date.now() > watchUntil) { clearInterval(watchTimer); watchTimer = null; } }, 4000);
  watchTimer.unref();
}
async function prepareAccount(name) {
  const slug = slugOf(name);
  if (!slug) return { ok: false, message: tr('server.account.badName') };
  const dir = path.join(os.homedir(), `.claude-${slug}`), settings = path.join(dir, 'settings.json');
  if (path.resolve(dir) === path.resolve(CLAUDE_DIR)) return { ok: false, message: tr('server.account.isMain') };
  await fsp.mkdir(dir, { recursive: true });
  let ownStatus = false;   // (a status line of its own there already: left alone)
  try { ownStatus = !!JSON.parse(await fsp.readFile(settings, 'utf8')).statusLine; } catch { /* a new folder */ }
  const res = await new Promise((resolve) => execFile(process.execPath, [path.join(ROOT, 'bin', 'cli.mjs'), 'install', '--settings', settings, ...(ownStatus ? ['--no-status'] : [])],
    { timeout: 20000, env: { ...process.env, OFFICE_PORT: String(PORT) } }, (err) => resolve(!err)));
  if (!res) return { ok: false, message: tr('server.account.installFailed') };
  const done = loggedIn(dir), L = done ? null : startLogin(slug);
  watchLogins();
  return { ok: true, name: slug, dir: `~/.claude-${slug}`, loggedIn: done, login: L && { state: L.state, url: L.url || '', note: L.note || '' }, win: process.platform === 'win32', ...accountCmd(slug) };
}
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

/* ---------- the accounts' names, and which account new sessions start on ----------
   A name: the user's own, for the plan card (prefs accountNames, by the account's folder name; '' = the main one).
   Which account: the one the user picked in the card (prefs accountPick, the main one by default), and with switching
   on (prefs autoSwitch) the next one with room when it runs out, back to the picked one once it resets. The editors'
   Claude Code extension starts the CLI through a little script of the office's (the editor's
   claudeCode.claudeProcessWrapper), which sets CLAUDE_CONFIG_DIR to that account's folder (data/account-now; empty: the
   main one). The other accounts' folders take the main one's projects, settings, skills… by links (SHARED), so a
   session on any account has the same history, memory and settings. A running session stays on its account (Claude
   Code reads its folder once, at start): when it runs out, closing and reopening it continues it on the one picked. */
// (declared as functions: the first scan of the accounts, further up, already calls them)
function acctLabel(slug) { return clip(String(prefs.get('accountNames')?.[slug] || ''), 24); }
function acctShown(slug) { return acctLabel(slug) || slug || tr('server.account.main'); }
function mainModel() {   // the model the sessions use (settings.json "model"): its own week counts too
  if (Date.now() - modelAt > 60e3) { modelAt = Date.now(); try { modelNow = String(JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, 'settings.json'), 'utf8')).model || '').toLowerCase(); } catch { modelNow = ''; } }
  return modelNow;
}
// until when an account can't take a new session: a limit nearly used up (5 hours, the week, the week of the model in
// use), or a session just told it is out; 0: it has room
function blockedUntil(windows, hit = 0) {
  const now = Date.now(), model = mainModel();
  let until = hit > now ? hit : 0;
  for (const w of windows || []) {
    if (!(w.pct >= FULL_PCT) || (w.resetsAt && w.resetsAt <= now)) continue;
    if (w.key === 'session' || w.key === 'weekly' || (w.weekOf && model.includes(String(w.weekOf).toLowerCase()))) until = Math.max(until, w.resetsAt || now + 15 * 60e3);
  }
  return until;
}
function dirOfSlug(slug) { return otherDirs.find((d) => accName(d) === slug) || ''; }
function nowSlug() { const d = nowDir && otherDirs.find((x) => path.resolve(x) === path.resolve(nowDir)); return d ? accName(d) : ''; }
// the accounts top to bottom as the user ordered them in the card (prefs accountOrder; a new one goes last, the main one
// first by default): new sessions start on the first, and with switching on move down the list when one runs out
function orderOf() {
  const all = ['', ...otherDirs.map(accName)], pick = prefs.get('accountPick');   // (accountPick: the one "Use" picked before there was an order)
  const saved = (prefs.get('accountOrder') || (pick ? [pick] : [])).filter((s) => all.includes(s));
  return [...new Set([...saved, ...all])];
}
function pickSlug() { return orderOf()[0] || ''; }
function switching() { return !!prefs.get('autoSwitch') || !!pickSlug(); }
function writeNow(dir) {
  nowDir = dir;
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(NOW_FILE, `${dir}\n`); } catch { /* read-only data: the script keeps the last one */ }
}
// the first account in the user's order; with switching on, the first of them with room (none: stay)
function repick(why = 'auto') {
  if (!switching()) { if (nowDir) writeNow(''); return; }
  const all = [{ slug: '', dir: '', until: blockedUntil(planLimits?.windows, hits.get('')) },
    ...otherDirs.map((d) => ({ slug: accName(d), dir: d, until: blockedUntil(others.get(d)?.windows, hits.get(accName(d))) }))];
  const order = orderOf(), list = [...all].sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
  const cur = all.find((a) => a.dir === nowDir), next = !prefs.get('autoSwitch') ? list[0] : list.find((a) => !a.until) || cur || list[0];
  if (next.dir === nowDir && fs.existsSync(NOW_FILE)) return;
  if (next.dir) shareWithMain(next.dir);
  writeNow(next.dir);
  if (cur !== next) broadcast({ k: 'acctswitch', why, from: cur ? acctShown(cur.slug) : '', to: acctShown(next.slug), until: cur?.until || 0 });
  if (cur && cur !== next && cur.until) autoMoveSoon(cur.slug);
  broadcast({ k: 'limits', limits: limitsOut(), note: noteText() });
}
setInterval(repick, 60_000).unref();   // (a reset time passing frees an account without a new reading)
// a session was told "out of usage": its account waits for the latest reset among its limits that are nearly used up
// (a few minutes when none is: a short rate limit), and is read again at once
function limitHit(slug) {
  const dir = dirOfSlug(slug), ws = slug ? others.get(dir)?.windows : planLimits?.windows, now = Date.now();
  hits.set(slug, Math.max(0, ...(ws || []).filter((w) => w.pct >= 90 && w.resetsAt > now).map((w) => w.resetsAt)) || now + 5 * 60e3);
  if (slug && dir) fetchOtherUsage(dir, true); else if (!slug) fetchPlanUsage(true);
  repick();
  const to = nowSlug();
  return { to: prefs.get('autoSwitch') && to !== slug ? acctShown(to) : '' };
}
// an account's folder takes the main one's things by links; what it has of its own stays (only the office's own hooks
// file, from adding the account, gives way to the main settings, which carry the same hooks)
function shareWithMain(dir) {
  if (!otherDirs.includes(dir)) return;
  const officeOnly = (f) => { try {
    const own = JSON.parse(fs.readFileSync(f, 'utf8')), main = fs.readFileSync(path.join(CLAUDE_DIR, 'settings.json'), 'utf8');
    return Object.keys(own).every((k) => ['hooks', 'statusLine', '$schema'].includes(k)) && main.includes(`:${PORT}/event`);
  } catch { return false; } };
  for (const n of SHARED) {
    const from = path.join(CLAUDE_DIR, n), to = path.join(dir, n);
    if (!fs.existsSync(from)) continue;
    try {
      let st = null; try { st = fs.lstatSync(to); } catch { /* not there */ }
      if (st?.isSymbolicLink()) continue;
      if (st && n === 'settings.json' && officeOnly(to)) fs.renameSync(to, path.join(dir, 'settings.office-bak.json'));
      else if (st && st.isDirectory() && !fs.readdirSync(to).length) fs.rmdirSync(to);
      else if (st) continue;
      fs.symlinkSync(from, to);
    } catch { /* left as it is */ }
  }
  // the main account's own MCP servers (its .claude.json stays per account: it holds the login)
  try {
    const servers = JSON.parse(fs.readFileSync(ACCOUNT_FILE, 'utf8')).mcpServers, f = path.join(dir, '.claude.json'), acc = JSON.parse(fs.readFileSync(f, 'utf8'));
    const merged = { ...(servers || {}), ...(acc.mcpServers || {}) };
    if (servers && JSON.stringify(merged) !== JSON.stringify(acc.mcpServers || {})) { acc.mcpServers = merged; fs.writeFileSync(`${f}.office-tmp`, JSON.stringify(acc, null, 2), { mode: 0o600 }); fs.renameSync(`${f}.office-tmp`, f); }
  } catch { /* not logged in yet, or busy */ }
}
// the script each new Claude Code goes through: the account picked, else what it would have used. A conversation moved
// to another account (moveSession) is resumed by the editor with --resume=<its id>: that one starts on its own account.
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
function switchScript() {
  const pin = `${shq(PIN_DIR + path.sep)}"$sid"`;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SWITCH_FILE, [
    '#!/bin/sh',
    '# My Office: Claude Code started on the account the office picked (the plan card). The editor passes the claude',
    '# program first (claudeCode.claudeProcessWrapper). A CLAUDE_CONFIG_DIR set already is kept. A conversation the office',
    '# moved to another account (its id in data/resume-on) starts on that one when the editor resumes it.',
    'if [ -z "$CLAUDE_CONFIG_DIR" ]; then',
    '  sid= prev=',
    '  for a in "$@"; do',
    '    case "$a" in --resume=*) sid=${a#--resume=} ;; *) [ "$prev" = --resume ] && sid=$a ;; esac',
    '    prev=$a',
    '  done',
    '  case "$sid" in *[!0-9A-Fa-f-]*) sid= ;; esac',
    `  if [ -n "$sid" ] && [ -f ${pin} ]; then d=$(head -n 1 ${pin})`,
    `  elif [ -r ${shq(NOW_FILE)} ]; then d=$(head -n 1 ${shq(NOW_FILE)})`,
    '  else d=',
    '  fi',
    '  if [ -n "$d" ] && [ -d "$d" ]; then CLAUDE_CONFIG_DIR=$d; export CLAUDE_CONFIG_DIR; fi',
    'fi',
    '[ -t 0 ] && exec "$@"   # (in a terminal: Claude Code itself, as always)',
    '# From the editor: Claude Code under this script, so that a conversation the office closes on purpose (carried on from',
    '# a phone, moved to another account, closed when idle: its process id in data/closing) ends well for the editor rather',
    '# than "exited with code 143". The editor\'s own stops are passed on. (Started with &, a program would ignore Ctrl+C:',
    '# perl puts that back, then becomes Claude Code.)',
    `if command -v perl >/dev/null 2>&1; then perl -e '$SIG{INT} = $SIG{QUIT} = "DEFAULT"; exec { $ARGV[0] } @ARGV or exit 127' -- "$@" <&0 &`,
    'else "$@" <&0 &',
    'fi',
    'child=$!',
    `trap 'kill -TERM "$child" 2>/dev/null' TERM`,
    "trap ':' INT",
    `trap 'kill -HUP "$child" 2>/dev/null' HUP`,
    'while :; do',
    '  wait "$child"; status=$?',
    '  kill -0 "$child" 2>/dev/null || break',
    'done',
    `if [ -f ${shq(CLOSING_DIR + path.sep)}"$child" ]; then rm -f ${shq(CLOSING_DIR + path.sep)}"$child"; exit 0; fi`,
    'exit "$status"',
    '',
  ].join('\n'));
  fs.chmodSync(SWITCH_FILE, 0o755);
  return SWITCH_FILE;
}
// the editors that have Claude Code's extension, and their user settings
const EDITORS = [['.vscode', 'Code', 'VS Code'], ['.vscode-insiders', 'Code - Insiders', 'VS Code Insiders'], ['.cursor', 'Cursor'], ['.windsurf', 'Windsurf'], ['.antigravity', 'Antigravity'], ['.antigravity-ide', 'Antigravity IDE'], ['.kiro', 'Kiro'], ['.trae', 'Trae'], ['.positron', 'Positron']];
const WRAP_KEY = 'claudeCode.claudeProcessWrapper';
function editorSettings() {
  const home = os.homedir(), base = process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support') : path.join(home, '.config');
  return EDITORS.filter(([dot]) => { try { return fs.readdirSync(path.join(home, dot, 'extensions')).some((e) => /^anthropic\.claude-code-/.test(e)); } catch { return false; } })
    .map(([, app, shown]) => ({ app: shown || app, file: path.join(base, app, 'User', 'settings.json') }));
}
// on: the office's script as each editor's wrapper (a wrapper of the user's own is left alone); off: taken out again.
// -> [{ app, ok, other }] (ok false: a settings file the office can't read, e.g. with comments: the card shows the way by hand)
function setEditorWrapper(on) {
  if (process.platform === 'win32') return [];
  const script = on ? switchScript() : SWITCH_FILE;
  return editorSettings().map(({ app, file }) => {
    let cfg = {}, real = file;
    try { real = fs.realpathSync(file); const t = fs.readFileSync(real, 'utf8'); cfg = t.trim() ? JSON.parse(t) : {}; } catch (e) { if (e.code !== 'ENOENT') return { app, ok: false }; }
    const cur = cfg[WRAP_KEY];
    if (on ? cur === script : cur !== script) return { app, ok: true };
    if (on && cur) return { app, ok: false, other: true };
    if (on) cfg[WRAP_KEY] = script; else delete cfg[WRAP_KEY];
    try { fs.mkdirSync(path.dirname(real), { recursive: true }); fs.writeFileSync(`${real}.office-tmp`, `${JSON.stringify(cfg, null, 4)}\n`); fs.renameSync(`${real}.office-tmp`, real); } catch { return { app, ok: false }; }
    return { app, ok: true };
  });
}
function autoOut() {
  return { on: !!prefs.get('autoSwitch'), move: prefs.get('autoMove') !== false, pick: pickSlug(), order: orderOf(), now: nowSlug(), editors: editorsNow, script: SWITCH_FILE, alias: switchAlias, win: process.platform === 'win32' };
}
// the card's switch, "use this one" (it goes to the top) and the order dragged into place: the editors' script goes in
// while switching is on, the top account isn't the main one or a moved conversation is still to start again, and out
// again after. move: whether the conversations open on an account that runs out move too (on unless turned off)
function setSwitch({ auto, pick, order, move } = {}) {
  if (auto !== undefined) prefs.set('autoSwitch', auto || undefined);
  if (move !== undefined) prefs.set('autoMove', move ? undefined : false);
  if (pick !== undefined) order = [pick, ...orderOf().filter((s) => s !== pick)];
  if (order !== undefined) { prefs.set('accountOrder', order); prefs.set('accountPick', undefined); }
  const on = switching() || pinned().length > 0;
  editorsNow = setEditorWrapper(on);
  const bin = on && findClaude();
  switchAlias = bin ? `alias claude='${SWITCH_FILE} "${bin.file}"'` : '';
  if (on && prefs.get('autoSwitch')) for (const d of otherDirs) shareWithMain(d);
  repick(pick !== undefined || order !== undefined ? 'pick' : 'auto');
  broadcast({ k: 'limits', limits: limitsOut(), note: noteText() });
  return { ok: true, ...autoOut() };
}
if (switching() || pinned().length) setSwitch();   // (the script written again, in case the office moved)

/* ---------- an open conversation, to another account ----------
   Claude Code reads its account once, at start, so a conversation stays on its account while its process lives. The
   editor's extension starts a new process for a conversation whose process has gone, with --resume=<its id>, as soon
   as you write in it again, and through the office's script: so the office notes the account for that conversation
   (data/resume-on/<id>, read by the script) and stops its process while it rests, the same safe way as "Close session"
   (only the process seen, matched by its start time; never one at work). The conversation is the same file on every
   account (projects/ is shared by a link), so it goes on where it was, on the new account. Its person stays at the desk
   meanwhile (parked) and is the same person when it starts again. A session in a terminal can't be started again from
   here: the command that resumes it there is handed back instead. With switching on, the conversations resting on an
   account out for a while move by themselves to the one new sessions start on now (autoMove). */
const SID_RE = /^[0-9a-f-]{36}$/i;
function pinned() { try { return fs.readdirSync(PIN_DIR).filter((f) => SID_RE.test(f)); } catch { return []; } }
const homeOf = (slug) => (slug ? dirOfSlug(slug) : CLAUDE_DIR);
function sharesHistory(slug) { try { return fs.realpathSync(path.join(homeOf(slug), 'projects')) === fs.realpathSync(path.join(CLAUDE_DIR, 'projects')); } catch { return false; } }
const untilOf = (slug) => blockedUntil(slug ? others.get(dirOfSlug(slug))?.windows : planLimits?.windows, hits.get(slug));
async function moveSession(s, to, why = 'you') {
  if (s.moving) return { ok: false, message: tr('server.move.busy') };
  s.moving = true;
  try { return await moveNow(s, to, why); } finally { s.moving = false; }
}
async function moveNow(s, to, why) {
  const from = acctOf(s), name = s.title || s.name;
  if (!s.pid || !s.sid || !SID_RE.test(s.sid) || s.parked) return { ok: false, message: tr('server.move.notOpen') };
  if (to && !dirOfSlug(to)) return { ok: false, message: tr('server.move.noAccount') };
  if (to === from) return { ok: false, message: tr('server.move.same', { to: acctShown(to) }) };
  if (s.status !== 'rest' || s.busy || [...pending.values()].some((p) => p.sess === s.id)) return { ok: false, message: tr('server.move.busy') };
  if (to) shareWithMain(dirOfSlug(to));
  if (!sharesHistory(from) || !sharesHistory(to)) return { ok: false, message: tr('server.move.noShare') };
  if (s.entry !== 'claude-vscode') {
    const cmd = `cd ${shq(s.cwd)} && ${to ? `CLAUDE_CONFIG_DIR=${shq(dirOfSlug(to))} ` : ''}claude --resume ${s.sid}`;
    return { ok: true, terminal: true, cmd, message: tr('server.move.terminal', { to: acctShown(to) }) };
  }
  // the script in the editor that hosts it (else in any), or the new start would not go through it
  const eds = setEditorWrapper(true), host = eds.find((e) => e.app === s.origin);
  if (!(host ? host.ok : eds.some((e) => e.ok))) return { ok: false, message: tr('server.move.noScript') };
  editorsNow = eds;
  const proc = (await sysSnapshot().catch(() => null))?.claude?.find((c) => c.pid === s.pid);
  if (!proc) return { ok: false, message: tr('server.move.notOpen') };
  const pin = path.join(PIN_DIR, s.sid);
  try { fs.mkdirSync(PIN_DIR, { recursive: true }); fs.writeFileSync(pin, `${to ? dirOfSlug(to) : ''}\n`); } catch { return { ok: false, message: tr('server.move.failed') }; }
  s.parked = { to, at: Date.now() };   // (before the process goes: the scan must not see it leave)
  closingOnPurpose([s.pid]);
  const r = await sysAction({ action: 'closeIdle', items: [{ target: s.pid, start: proc.start }] }).catch(() => null);
  if (!r?.closed?.length) { delete s.parked; fs.rmSync(pin, { force: true }); return { ok: false, message: tr('server.move.failed') }; }
  s.pid = null;
  chat.onMoved(s.id, acctShown(to));
  fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} move ${name} ${from || 'main'} -> ${to || 'main'} (${why})\n`).catch(() => {});
  broadcast({ k: 'sess', s: pub(s) });
  return { ok: true, name, to: acctShown(to), message: tr('server.move.done', { name, to: acctShown(to) }) };
}
// switching on: the editor's conversations resting on an account out for a while (not a short rate limit) move to the
// one new sessions start on now, if it has room. Called a few seconds after the account ran out (the session that
// hit the limit needs a moment to rest), and once more a little later for one that was still finishing.
async function autoMove(slug) {
  const to = nowSlug(), now = Date.now();
  if (!prefs.get('autoSwitch') || prefs.get('autoMove') === false || to === slug || untilOf(slug) - now < 15 * 60e3 || untilOf(to)) return;
  const moved = [];
  for (const s of [...sessions.values()]) {
    if (acctOf(s) !== slug || s.entry !== 'claude-vscode' || s.status !== 'rest' || s.parked || !s.pid) continue;
    const r = await moveSession(s, to, 'auto');
    if (r.ok) moved.push(r.name);
  }
  if (moved.length) broadcast({ k: 'acctmove', names: moved, from: acctShown(slug), to: acctShown(to) });
}
function autoMoveSoon(slug) { for (const ms of [5000, 30000]) setTimeout(() => { autoMove(slug).catch(() => {}); }, ms).unref(); }
// and every minute while an account stays out: a conversation that was busy when it ran out (a long turn, agents of its
// own running in the background) moves as soon as it comes to rest
setInterval(() => { for (const slug of ['', ...otherDirs.map(accName)]) if (untilOf(slug) - Date.now() >= 15 * 60e3) autoMove(slug).catch(() => {}); }, 60_000).unref();
// a parked conversation started again (the same id, a new process): the note is spent. Notes left for a day go.
function unpark(s) {
  if (!s.parked) return;
  s.transcript = path.join(homeOf(s.parked.to), 'projects', s.cwd.replace(/[^A-Za-z0-9-]/g, '-'), `${s.sid}.jsonl`);
  delete s.parked;
  fs.rmSync(path.join(PIN_DIR, s.sid), { force: true });
}
setInterval(() => {
  for (const f of pinned()) { try { const p = path.join(PIN_DIR, f); if (Date.now() - fs.statSync(p).mtimeMs > PARK_MS) fs.rmSync(p, { force: true }); } catch { /* gone */ } }
}, 3600e3).unref();

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
  // through the tunnel (the internet), only what a phone may send: the PIN (and a new one, with the one it has now), its
  // answers to approvals (when the Mac allows them), the page's presence, the chat and work (when the Mac allows it). Everything else that changes something stays on the Mac and the home network.
  if (req.viaTunnel && req.method !== 'GET' && req.method !== 'HEAD' && !['/pin', '/api/pin', '/api/perm', '/api/presence', '/api/chat', '/api/tasks', '/api/tasks/stop', '/api/push'].includes(url.pathname)) { json(res, 403, { ok: false, message: tr('server.api.approveOnMac') }); return; }
  if (url.pathname === '/pin' && (req.method === 'GET' || req.method === 'POST')) {
    const ip = clientIp(req);
    if (isLoopback(req) || cookieOk(req)) { res.writeHead(303, { Location: '/' }).end(); return; }
    const until = pinLockedUntil(ip);
    if (until) { pinPage(res, 429, lockMsg(until), true); return; }
    if (req.method === 'GET') { pinPage(res, 200); return; }
    const sameOrigin = sameOriginOf(req);
    if (!sameOrigin) { res.writeHead(403).end(); return; }
    readForm(req).then((f) => {
      if (sameBytes(String(f.get('pin') || '').replace(/\D/g, ''), currentPin())) {
        pinFails.delete(ip);
        fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} pin ok ${ip}${f.get('keep') === '1' ? ' remembered' : ''}\n`).catch(() => {});
        res.writeHead(303, { Location: '/', 'Set-Cookie': pinCookie(req, f.get('keep') === '1'), 'Cache-Control': 'no-store' }).end();
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
    const sameOrigin = sameOriginOf(req);
    if (!authorized(req, url) || !sameOrigin || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false }); return; }
    readJson(req).then((b) => {
      if (!b) { json(res, 400, { ok: false }); return; }
      // Approving tool calls stays on the Mac unless you turned on approving from a phone (on the Mac: POST /api/phone).
      // Then a phone looking at the office holds requests too, and may allow once, deny, answer a question or a plan;
      // never "always", and a risky command (src/shared/danger.js) only deny.
      const phone = !isLoopback(req);
      if (phone && !prefs.get('phoneApprove')) { json(res, url.pathname === '/api/presence' ? 200 : 403, { ok: false, message: tr('server.api.approveOnMac') }); return; }
      if (url.pathname === '/api/presence') {
        const page = String(b.page || '').slice(0, 64);
        if (b.focused) presence.set(page, { focused: true, at: Date.now() }); else presence.delete(page);
        if (!officeFocused()) for (const id of [...pending.keys()]) settlePerm(id);   // nobody is looking: give the prompt back
        json(res, 200, { ok: true, pending: pending.size });
        return;
      }
      const p = pending.get(String(b.id || ''));
      let CHOICES = { perm: ['allow', 'always', 'deny'], ask: ['answer', 'skip'], plan: ['approve', 'revise', 'skip'] }[p?.kind || 'perm'];
      if (phone && p) CHOICES = (p.kind || 'perm') !== 'perm' ? CHOICES : dangerKey(p) ? ['deny', 'skip'] : ['allow', 'deny', 'skip'];
      if (phone && p && !CHOICES.includes(b.choice)) { json(res, 403, { ok: false, message: tr('server.api.riskyOnMac') }); return; }
      if (!p || !CHOICES.includes(b.choice)) { json(res, 404, { ok: false, message: tr('server.api.expired') }); return; }
      if (b.choice === 'skip') { settlePerm(p.id); json(res, 200, { ok: true }); return; }   // Claude Code asks in the IDE as usual
      const out = p.kind === 'ask' ? askDecision(p, b) : p.kind === 'plan' ? planDecision(p, b.choice, b.note) : permDecision(p, b.choice);
      if (!out) { json(res, 400, { ok: false, message: tr('server.api.answerAll') }); return; }
      settlePerm(p.id, JSON.stringify(out));
      fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} ${phone ? `phone ${clientIp(req)} ` : ''}${p.kind || 'perm'} ${b.choice} ${p.name} ${p.tool} ${p.kind === 'perm' || !p.kind ? p.detail.slice(0, 120) : ''}\n`).catch(() => {});
      json(res, 200, { ok: true });
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/pin' && !isLoopback(req)) {   // a phone signed in, changing the PIN: { current, pin }
    if (!authorized(req, url) || !sameOriginOf(req) || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false }); return; }
    const ip = clientIp(req), until = pinLockedUntil(ip);
    if (until) { json(res, 200, { ok: false, message: lockMsg(until) }); return; }
    readJson(req).then((b) => {
      // the PIN it has now, as on the PIN page (wrong ones count toward the same lock), then one that isn't easy to guess
      if (!sameBytes(String(b?.current || '').replace(/\D/g, ''), currentPin())) {
        const left = pinFailed(ip), lockedNow = pinLockedUntil(ip);
        fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} phone pin change wrong ${ip}\n`).catch(() => {});
        json(res, 200, { ok: false, message: lockedNow ? lockMsg(lockedNow) : tr('server.pin.wrong', { n: left }) }); return;
      }
      const own = String(b?.pin || '').replace(/\s/g, '');
      if (pinWeak(own)) { json(res, 200, { ok: false, message: tr('server.pin.weak') }); return; }
      pinFails.delete(ip);
      fs.writeFileSync(PIN_FILE, own, { mode: 0o600 });
      fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} phone pin set ${ip}\n`).catch(() => {});
      // this phone stays in (a new cookie, signed with the new PIN); every other one is cut off once the answer has gone
      res.on('finish', () => { for (const srv of [...lanServers.values(), tunnel.srv]) srv?.closeAllConnections?.(); });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': pinCookie(req) }).end(JSON.stringify({ ok: true }));
    });
    return;
  }
  if (req.method === 'POST' && (url.pathname === '/api/lan' || url.pathname === '/api/pin')) {   // phones on the home network: { on }; a new PIN (this computer only)
    const sameOrigin = sameOriginOf(req);
    if (!isLoopback(req) || !sameOrigin || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false, message: tr('server.api.approveOnMac') }); return; }
    readJson(req).then((b) => {
      if (url.pathname === '/api/pin') {   // { pin } of your own, or a random one; every phone signed out (the cookie's signature covers the PIN), open pages cut off now
        const own = b?.pin == null ? '' : String(b.pin).replace(/\s/g, '');
        if (own && pinWeak(own)) { json(res, 200, { ok: false, message: tr('server.pin.weak') }); return; }   // (turned down, not an error: the page shows why)
        fs.writeFileSync(PIN_FILE, own || String(crypto.randomInt(0, 1e6)).padStart(6, '0'), { mode: 0o600 });
        for (const srv of [...lanServers.values(), tunnel.srv]) srv?.closeAllConnections?.();
        fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} phone pin ${own ? 'set' : 'new'}\n`).catch(() => {});
        json(res, 200, { ok: true, pin: currentPin() });
        return;
      }
      if (!lanFixed) { prefs.set('lan', b?.on ? true : undefined); syncLan(); }
      fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} phone lan ${b?.on ? 'on' : 'off'}\n`).catch(() => {});
      const on = lanIsOn();
      json(res, 200, { ok: true, on, fixed: lanFixed, lan: on ? lanUrl() : null, lanBase: on ? lanUrl(false) : null, ts: on ? tsUrl() : null, pin: currentPin() });
    });
    return;
  }
  if (url.pathname === '/api/push' && req.method === 'POST') {   // a phone saying yes ({ op: 'add', sub }) or no ({ op: 'remove', endpoint }); { op: 'test', endpoint? }
    if (!authorized(req, url) || !sameOriginOf(req) || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false }); return; }
    readJson(req).then(async (b) => {
      const op = String(b?.op || ''), endpoint = String(b?.endpoint || b?.sub?.endpoint || '');
      if (op === 'add') {
        if (!push.add(b?.sub, req.headers['user-agent'])) { json(res, 400, { ok: false }); return; }
        fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} push on ${isLoopback(req) ? 'mac' : clientIp(req)} ${new URL(endpoint).host}\n`).catch(() => {});
      } else if (op === 'remove') push.remove(endpoint);
      else if (op === 'report') {   // a phone that couldn't turn them on: why, for looking into it
        fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} push trouble ${clip(oneLine(String(b?.why || '')), 20)} ${clip(oneLine(String(b?.detail || '')), 160)} ${isLoopback(req) ? 'mac' : clientIp(req)} ${clip(oneLine(String(req.headers['user-agent'] || '')), 120)}\n`).catch(() => {});
      } else if (op === 'test') {
        const st = await push.test(endpoint || (isLoopback(req) ? '' : 'none'), { title: tr('server.push.testTitle'), body: tr('server.push.testBody'), tag: 'test', url: '/' });
        json(res, 200, { ok: st.length > 0 && st.every((x) => x >= 200 && x < 300), statuses: st, count: push.count() }); return;
      }
      json(res, 200, { ok: true, count: push.count(), on: push.has(endpoint) });
    });
    return;
  }
  if (url.pathname.startsWith('/api/tasks') && req.method === 'POST') {   // giving Claude work: start (from a phone only when allowed on the Mac), stop, allow
    if (!authorized(req, url) || !sameOriginOf(req) || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false }); return; }
    const mac = isLoopback(req);
    readJson(req, 8_000_000).then(async (b) => {
      if (url.pathname === '/api/tasks/allow') {
        if (!mac) { json(res, 403, { ok: false, message: tr('server.api.approveOnMac') }); return; }
        prefs.set('phoneTasks', b?.on ? true : undefined);
        fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} tasks from phones ${b?.on ? 'on' : 'off'}\n`).catch(() => {});
        broadcast({ k: 'phone', approve: !!prefs.get('phoneApprove'), tasks: !!b?.on });
        json(res, 200, tasksOut(true)); return;
      }
      if (url.pathname === '/api/tasks/stop') { json(res, 200, { ok: tasks.stop(String(b?.id || '')) }); return; }
      if (url.pathname !== '/api/tasks') { json(res, 404, { ok: false }); return; }
      if (!mac && !prefs.get('phoneTasks')) { json(res, 403, { ok: false, code: 'notAllowed', message: tr('chat.task.notAllowed') }); return; }
      // who it goes to: a conversation the office knows (carried on itself, the very one), or a project folder (a new
      // conversation there, or the one you started there); one way for both the chat's "Gửi tới" and 📋 Giao việc
      const s = b?.sid && [...sessions.values()].find((x) => x.sid === String(b.sid) && x.cwd);
      const want = String(b?.dir || '').replace(/^~(?=$|\/)/, os.homedir()), pdir = !s && knownDirs.find((d) => d === want);
      if (!s && !pdir) { json(res, 400, { ok: false, code: 'noDir', message: tr('chat.task.noDir') }); return; }
      const text = String(b?.text || '').trim().slice(0, 4000), images = (Array.isArray(b?.images) ? b.images : []).slice(0, 4).map(String);
      if (!text) { json(res, 400, { ok: false, code: 'empty' }); return; }
      const name = s ? s.title || s.name : path.basename(pdir), key = s ? s.sid : `dir:${pdir}`, th = threads.get(key);
      if (th?.running) { json(res, 409, { ok: false, code: 'busy', message: tr('chat.task.threadBusy', { name }) }); return; }
      let from;
      if (s) {   // the conversation itself: open in the editor and resting, it is closed there first; at work there: not now
        const open = s.pid && !s.parked;
        if (open && (s.status !== 'rest' || s.busy || [...pending.values()].some((p) => p.sess === s.id))) { json(res, 409, { ok: false, code: 'macBusy', message: tr('chat.task.macBusy', { name }) }); return; }
        if (open) { const pk = await parkForPhone(s); if (!pk.ok) { json(res, 409, { ok: false, code: 'macOpen', message: pk.message }); return; } }
        from = { sid: s.sid, fork: false, name, id: s.id, orig: key, chat: true, acct: acctOf(s) || '' };
      } else {   // a project: a new conversation, or the one you started there (for 6 hours; ＋ asks for a new one)
        const on = th?.sid && !b.fresh && Date.now() - th.at < 6 * 3600e3 ? th.sid : null;
        from = { sid: on, fork: false, name, orig: key, chat: true };
      }
      chat.say('me', `@${name} ${text}`, { now: true, long: true });
      const mine = chat.state.msgs.at(-1);
      for (const img of images) if (/^data:image\/jpeg;base64,/.test(img) && img.length < 500_000) chat.photo(img);
      const r = tasks.start({ dir: s ? s.cwd : pdir, text, images, from, env: s ? acctEnv(from.acct) : null, system: SHOT_ASK });
      if (r.ok) {
        threads.set(key, { sid: from.sid, at: Date.now(), running: true });
        if (s) s.viaOffice = r.task.id;
        const card = chat.workCard(s ? s.id : 'claude', { state: 'work', steps: [], n: 0, at: Date.now(), task: r.task.id });   // (task: its Stop button)
        if (card) cards.set(r.task.id, { id: card.id, steps: [], n: 0, at: Date.now(), timer: 0 });
        taskQuote.set(r.task.id, mine ? { id: mine.id, name: tr('chat.boss'), text: clip(text, 90) } : null);
      } else chat.system(tr('chat.task.notStarted', { why: tr(`chat.task.why.${r.code}`) }));
      fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} message ${mac ? 'mac' : `phone ${clientIp(req)}`} ${s ? `${s.sid}${from.acct ? ` on ${from.acct}` : ''}` : from.sid ? `carry ${from.sid}` : `new in ${pdir}`} ${r.ok ? 'started' : r.code} ${clip(oneLine(text), 100)}\n`).catch(() => {});
      json(res, r.ok ? 200 : 409, r.ok ? { ok: true, task: r.task } : { ok: false, code: r.code, message: tr(`chat.task.why.${r.code}`) });
    });
    return;
  }
  if (url.pathname === '/api/chat' && req.method === 'POST') {   // the group chat: { op, … } (say and photo only from this computer)
    if (!authorized(req, url) || !sameOriginOf(req) || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false }); return; }
    readJson(req, 600_000).then((b) => {
      const mac = isLoopback(req), op = String(b?.op || ''), str = (x, n) => String(x ?? '').slice(0, n);
      if (op === 'send') chat.send({ text: str(b.text, 600), sticker: Number.isInteger(b.sticker) ? b.sticker : null, replyTo: str(b.replyTo, 40) || null });
      else if (op === 'react') chat.react(str(b.id, 40), 'me', str(b.emoji, 8));
      else if (op === 'vote') chat.vote(str(b.id, 40), 'me', Number(b.i));
      else if (op === 'rsvp') chat.rsvp(str(b.id, 40), 'me', !!b.yes);
      else if (op === 'recall') chat.recall(str(b.id, 40));
      else if (op === 'poll') chat.poll('me', str(b.q, 120), (Array.isArray(b.opts) ? b.opts : []).slice(0, 6).map((x) => str(x, 60)));
      else if (op === 'photo' && mac && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(String(b.data || '')) && b.data.length < 500_000) chat.photo(b.data);
      else if (op === 'say' && mac) {
        const photo = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(String(b.photo || '')) && b.photo.length < 500_000 ? b.photo : null;
        chat.say(str(b.from, 60), str(b.text, 600), { key: str(b.key, 120) || undefined, sticker: Number.isInteger(b.sticker) ? b.sticker : undefined, photo, pin: !!b.pin, delay: Number.isFinite(b.delay) ? Math.min(60_000, Math.max(0, b.delay)) : undefined,
          react: (Array.isArray(b.react) ? b.react : []).filter((e) => REACTIONS.includes(e)), reacts: Math.min(6, Number(b.reacts) || 2),
          answer: (Array.isArray(b.answer) ? b.answer : []).slice(0, 4).map((a) => ({ key: str(a?.key, 30).replace(/[^\w]/g, ''), chance: Math.min(1, Math.max(0, Number(a?.chance ?? 1))) })).filter((a) => a.key) });
      } else { json(res, 400, { ok: false }); return; }
      json(res, 200, { ok: true });
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/rc') {   // every new session with Remote Control: { on } (this computer only)
    if (!isLoopback(req) || !sameOriginOf(req) || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false, message: tr('server.api.approveOnMac') }); return; }
    readJson(req).then((b) => {
      const ok = setRcAtStartup(!!b?.on);
      fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} remote control at startup ${b?.on ? 'on' : 'off'} -> ${ok ? 'ok' : 'failed'}\n`).catch(() => {});
      json(res, ok ? 200 : 500, { ok, rc: rcAtStartup() });
    });
    return;
  }
  if (url.pathname === '/api/tunnel' && (req.method === 'POST' || req.method === 'GET')) {   // the office from anywhere: { on } (this computer only)
    const sameOrigin = sameOriginOf(req);
    if (!isLoopback(req) || !sameOrigin || (req.method === 'POST' && !String(req.headers['content-type'] || '').startsWith('application/json'))) { json(res, 403, { ok: false, message: tr('server.api.approveOnMac') }); return; }
    if (req.method === 'GET') { json(res, 200, tunnelOut()); return; }
    readJson(req).then((b) => {
      prefs.set('tunnel', b?.on ? true : undefined);
      fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} tunnel ${b?.on ? 'on' : 'off'}\n`).catch(() => {});
      if (b?.on) startTunnel(); else stopTunnel();
      json(res, 200, tunnelOut());
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/phone') {   // approving from a phone: { approve } (this computer only)
    const sameOrigin = sameOriginOf(req);
    if (!isLoopback(req) || !sameOrigin || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false, message: tr('server.api.approveOnMac') }); return; }
    readJson(req).then((b) => {
      prefs.set('phoneApprove', b?.approve ? true : undefined);
      fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} phone approve ${b?.approve ? 'on' : 'off'}\n`).catch(() => {});
      broadcast({ k: 'phone', approve: !!b?.approve, tasks: !!prefs.get('phoneTasks') });
      json(res, 200, { ok: true, approve: !!b?.approve });
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/sys/auto') {   // close idle sessions on a timer: { hours: 0 | 2 | 4 | 8 }
    const sameOrigin = sameOriginOf(req);
    if (!authorized(req, url) || !sameOrigin || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false, message: tr('server.forbidden') }); return; }
    readJson(req).then((b) => {
      if (!b || !prefs.setAutoClose(Number(b.hours))) { json(res, 400, { ok: false, message: tr('server.badRequest') }); return; }
      fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} ${req.socket.remoteAddress} auto-close ${prefs.autoClose()}h\n`).catch(() => {});
      json(res, 200, { ok: true, hours: prefs.autoClose() });
      autoCloseIdle().catch(() => {});
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/sys/action') {
    const sameOrigin = sameOriginOf(req);
    if (!authorized(req, url) || !sameOrigin || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false, message: tr('server.forbidden') }); return; }
    readJson(req).then(async (body) => {
      if (!body) { json(res, 400, { ok: false, message: tr('server.badRequest') }); return; }
      if (body.action === 'closeIdle' && Array.isArray(body.items)) closingOnPurpose(body.items.map((i) => Number(i?.target)).filter((n) => n > 0));   // (closed from the Mac panel: no red line in the editor)
      const result = await sysAction(body).catch((err) => ({ ok: false, message: String(err.message || err) }));
      fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} ${req.socket.remoteAddress} ${JSON.stringify(body)} -> ${JSON.stringify(result)}\n`).catch(() => {});
      json(res, 200, result);
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/open') {
    const sameOrigin = sameOriginOf(req);
    if (!isLoopback(req) || !sameOrigin || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false, message: tr('server.api.openOnMac') }); return; }
    readJson(req).then(async (b) => {
      const s = [...sessions.values()].find((x) => x.id === String(b?.id || ''));
      const r = await openWindow(s);
      fsp.appendFile(ACTION_LOG, `${new Date().toISOString()} open ${s?.name || '?'} -> ${r.ok ? r.app : r.message}\n`).catch(() => {});
      json(res, 200, r);
    });
    return;
  }
  if (req.method === 'POST' && /^\/api\/accounts(\/(code|cancel|login|rename|use|auto|order|move))?$/.test(url.pathname)) {   // (this computer only, from this page)
    const sameOrigin = sameOriginOf(req);
    if (!isLoopback(req) || !sameOrigin || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false, message: tr('server.account.onMac') }); return; }
    readJson(req).then(async (b) => {
      if (url.pathname === '/api/accounts') { json(res, 200, await prepareAccount(b?.name)); return; }
      if (url.pathname === '/api/accounts/auto') { json(res, 200, setSwitch({ ...(b?.on !== undefined && { auto: !!b.on }), ...(b?.move !== undefined && { move: !!b.move }) })); return; }
      if (url.pathname === '/api/accounts/move') {   // { id: the session, to: the account ('' = the main one) }
        const s = [...sessions.values()].find((x) => x.id === String(b?.id || '')), to = b?.to ? slugOf(b.to) : '';
        json(res, 200, s ? await moveSession(s, to) : { ok: false, message: tr('server.move.notOpen') });
        return;
      }
      if (url.pathname === '/api/accounts/order') {   // (every account once: '' is the main one)
        const all = orderOf(), order = Array.isArray(b?.order) ? b.order.map((s) => (s ? slugOf(s) : '')) : [];
        if (order.length !== all.length || !all.every((s) => order.includes(s))) { json(res, 400, { ok: false }); return; }
        json(res, 200, setSwitch({ order }));
        return;
      }
      if (/\/(rename|use)$/.test(url.pathname)) {   // ('' = the main account)
        const which = b?.name ? slugOf(b.name) : '';
        if (which && !dirOfSlug(which)) { json(res, 404, { ok: false }); return; }
        if (url.pathname.endsWith('/use')) { json(res, 200, setSwitch({ pick: which })); return; }
        const label = clip(oneLine(b?.label), 24), names = { ...(prefs.get('accountNames') || {}) };
        if (label && label !== which) names[which] = label; else delete names[which];
        prefs.set('accountNames', Object.keys(names).length ? names : undefined);
        broadcast({ k: 'limits', limits: limitsOut(), note: noteText() });
        json(res, 200, { ok: true, label: acctLabel(which) });
        return;
      }
      const slug = slugOf(b?.name), L = logins.get(slug);
      if (url.pathname === '/api/accounts/login') { const n = startLogin(slug); json(res, 200, { ok: n.state === 'waiting', state: n.state, url: n.url || '', note: n.note || '' }); return; }   // (again, after a failure)
      if (!L || L.state !== 'waiting') { json(res, 200, { ok: false }); return; }
      if (url.pathname === '/api/accounts/code') L.child.stdin.write(`${String(b?.code || '').trim().slice(0, 400)}\n`);
      else { L.state = 'cancelled'; L.child.kill(); }
      json(res, 200, { ok: true });
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/prefs') {
    const sameOrigin = sameOriginOf(req);
    if (!authorized(req, url) || !sameOrigin || !String(req.headers['content-type'] || '').startsWith('application/json')) { json(res, 403, { ok: false, message: tr('server.forbidden') }); return; }
    readJson(req).then((b) => {
      if (!b || !prefs.setLang(b.lang)) { json(res, 400, { ok: false, message: tr('server.badRequest') }); return; }
      json(res, 200, { ok: true, lang: prefs.lang() });
      broadcast({ k: 'lang', lang: prefs.lang() });   // every open page reloads in the new language
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/todos') {
    const sameOrigin = sameOriginOf(req);
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
  if (url.pathname === '/api/chat') { json(res, 200, chatOut()); return; }
  if (url.pathname === '/api/tasks') { json(res, 200, tasksOut(isLoopback(req))); return; }
  if (url.pathname === '/api/push') { json(res, 200, { ok: true, key: push.publicKey, count: push.count(), on: push.has(String(url.searchParams.get('endpoint') || '')) }); return; }
  if (url.pathname === '/api/image') {   // (sandboxed and never sniffed: an SVG can't run anything opened on its own)
    const file = images.get(String(url.searchParams.get('id') || '')), type = file && IMG_EXT[path.extname(file).slice(1).toLowerCase()];
    if (!type) { res.writeHead(404).end(); return; }
    fsp.stat(file).then((st) => {
      if (!st.isFile() || st.size > 40e6) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'private, max-age=30', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    }).catch(() => { res.writeHead(404).end(); });
    return;
  }
  // everything as it is now, the first message a page gets (the Mac's own addresses and PIN only for the Mac)
  const snapNow = (local) => {
    const lanOn = lanIsOn();
    return { k: 'snap', lang: prefs.lang(), sessions: [...sessions.values()].map(pub), perms: [...pending.values()].map(permPub), feed, stats, local, todos, limits: limitsOut(), limitsNote: noteText(), trophies: trophies.pub(),
      lan: local && lanOn ? lanUrl() : null, lanBase: local && lanOn ? lanUrl(false) : null, pin: local ? currentPin() : null,
      ts: local && lanOn ? tsUrl() : null, tsHere: !!tsUrl(), phoneApprove: !!prefs.get('phoneApprove'), phoneTasks: !!prefs.get('phoneTasks'), lanFixed: local && lanFixed, build: BUILD };
  };
  if (url.pathname === '/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const local = isLoopback(req);
    const client = { res };
    clients.add(client);
    fetchPlanUsage();   // skipped when the saved reading is fresh
    pollGit().then(() => git.pollCi());
    scanSessions().then(() => send(res, snapNow(local)));
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => { clearInterval(ping); clients.delete(client); });
    return;
  }
  if (url.pathname === '/api/live') {   // { seq, msgs }: the snapshot first (or when too far behind), then what came after `since`
    const at = url.searchParams.get('since'), since = at == null ? -1 : Number(at), fresh = !watching();
    polledAt = Date.now();
    if (!(since >= 0) || since > sent || (backlog.length && since < backlog[0][0] - 1)) {
      if (fresh) { fetchPlanUsage(); pollGit().then(() => git.pollCi()); }
      scanSessions().then(() => json(res, 200, { seq: sent, msgs: [snapNow(isLoopback(req))] }));
      return;
    }
    let timer = 0;
    const answer = () => {
      waiting.delete(answer); clearTimeout(timer);
      if (res.writableEnded || res.destroyed) return;
      const msgs = backlog.filter(([n]) => n > since).map(([, d]) => d);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(`{"seq":${sent},"msgs":[${msgs.join(',')}]}`);
    };
    if (sent > since) { answer(); return; }
    timer = setTimeout(answer, 25_000); waiting.add(answer);
    req.on('close', () => { waiting.delete(answer); clearTimeout(timer); });
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
    sysSnapshot({ open: url.searchParams.has('open') }).then((snap) => json(res, 200, { ...snap, auto: { hours: prefs.autoClose(), last: autoLast[0] || null } })).catch((err) => json(res, 500, { error: String(err.message || err) }));
    return;
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    // the office page itself is rendered by Next.js (app/page.tsx); our headers go on before it starts the response
    res.setHeader('Referrer-Policy', 'no-referrer');
    // a phone in by a token link gets a cookie; a remembered one, renewed once a month, so it stays while it's used
    const ck = isLoopback(req) ? null : pinCookieOf(req);
    if (!isLoopback(req) && (!ck || (ck.keep && ck.exp - Date.now() < (KEEP_DAYS - 30) * 86400e3))) res.setHeader('Set-Cookie', pinCookie(req));
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
// this build's id: a page from an older one (the office was updated and restarted) loads the new one by itself
const BUILD = (() => { try { return fs.readFileSync(path.join(ROOT, process.env.OFFICE_DIST_DIR || '.next', 'BUILD_ID'), 'utf8').trim(); } catch { return ''; } })();
const nextApp = next({ dev: DEV, dir: ROOT, hostname: HOST, port: PORT, httpServer: server });
const nextHandle = nextApp.getRequestHandler();
try { await nextApp.prepare(); }
catch (err) {
  console.error(DEV ? err : `${tr('server.console.noBuild')}\n${err.message || err}`);
  process.exit(1);
}

/* ---------- phones on the home network, switched on in the office (the phone window) ----------
   Besides 127.0.0.1 the office then listens on each of the Mac's own network addresses (Wi-Fi, Ethernet, a Tailscale
   network), never on "every address", and only while the switch is on (prefs lan; `install --lan` / OFFICE_HOST still
   works the old way, and the switch then shows it on for good). Phones still need the PIN. The Mac's addresses change
   with its network: looked at again every 30 seconds. Off: the listeners close and the phones' pages are cut off. */
const lanFixed = HOST !== '127.0.0.1' && HOST !== 'localhost';
const lanServers = new Map();   // address -> its http.Server
function syncLan() {
  const want = new Set(!lanFixed && prefs.get('lan') ? Object.values(os.networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address) : []);
  for (const [addr, srv] of lanServers) if (!want.has(addr)) { srv.close(); srv.closeAllConnections?.(); lanServers.delete(addr); }
  for (const addr of want) {
    if (lanServers.has(addr)) continue;
    const srv = http.createServer(server.listeners('request')[0]);
    srv.on('error', () => { if (lanServers.get(addr) === srv) lanServers.delete(addr); });   // (the address went away, or the port is taken on it)
    srv.listen(PORT, addr); lanServers.set(addr, srv);
  }
}
function lanIsOn() { return lanFixed || lanServers.size > 0; }
setInterval(syncLan, 30_000).unref();

/* ---------- the office from anywhere (mobile data, another Wi-Fi): a Cloudflare quick tunnel, switched on in the phone
   window ----------
   cloudflared (the one installed, else downloaded once from Cloudflare's GitHub releases into data/bin) connects out to
   Cloudflare and gets an https address, *.trycloudflare.com: no account and no domain, a new address each time it
   starts. It leads to a listener of its own on 127.0.0.1, and everything that comes that way is from the internet
   whatever its address looks like (req.viaTunnel): it needs the PIN (no token links), its cookie is https-only, and all
   that only the Mac may do (hooks, stopping processes, accounts, these switches) refuses it, as it refuses a phone.
   Off: cloudflared stops and the listener closes, cutting off whoever was in. OFFICE_TUNNEL_CMD: a stand-in (tests). */
const tunnel = { state: 'off', url: '', host: '', error: '', pid: 0, srv: null, port: 0, tries: 0, gen: 0, watch: null };
const TUNNEL_PID = path.join(DATA_DIR, 'tunnel.pid'), CF_BIN = path.join(DATA_DIR, 'bin', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
const tunnelOut = () => ({ ok: true, on: !!prefs.get('tunnel'), state: tunnel.state, url: tunnel.url, error: tunnel.error, port: tunnel.port, pin: currentPin(),
  awake: process.platform === 'darwin' ? { held: !!awakeProc, ac: powerAC } : null, rc: rcAtStartup(), tasks: !!prefs.get('phoneTasks') });
// Giving Claude work from a phone is Claude Code's own Remote Control: with remoteControlAtStartup in its settings every
// new session opens its bridge by itself (the other accounts share these settings by a link), and the office shows each
// session's link. Switched in the phone window, by you, on the Mac; the rest of the file is left as it is.
const CC_SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
function rcAtStartup() { try { return JSON.parse(fs.readFileSync(CC_SETTINGS, 'utf8')).remoteControlAtStartup === true; } catch { return false; } }
function setRcAtStartup(on) {
  let real = CC_SETTINGS, cfg = {};
  try { real = fs.realpathSync(CC_SETTINGS); cfg = JSON.parse(fs.readFileSync(real, 'utf8') || '{}'); } catch (e) { if (e.code !== 'ENOENT') return false; }   // (a file it can't read, with comments say: left alone)
  if (on) cfg.remoteControlAtStartup = true; else delete cfg.remoteControlAtStartup;
  try { fs.mkdirSync(path.dirname(real), { recursive: true }); fs.writeFileSync(`${real}.office-tmp`, `${JSON.stringify(cfg, null, 2)}\n`); fs.renameSync(`${real}.office-tmp`, real); return true; } catch { return false; }
}
// While the tunnel is on, the Mac stays awake so it can be reached (macOS): `caffeinate -s` holds off system sleep on the
// power adapter only (on battery it sleeps as usual), and the display still turns off; `-w` ends it with this server,
// however that ends. Turning the tunnel off lets it go. Nothing is changed in the system settings.
let awakeProc = null, powerAC = null, powerT = null;
function readPower() { execFile('pmset', ['-g', 'batt'], { timeout: 4000 }, (err, out) => { powerAC = err ? null : /AC Power/.test(String(out)); }); }
function keepAwake(on) {
  if (process.platform !== 'darwin') return;
  if (on && !awakeProc) {
    const p = awakeProc = spawn('caffeinate', ['-s', '-w', String(process.pid)], { stdio: 'ignore' });
    p.on('error', () => { if (awakeProc === p) awakeProc = null; }); p.on('exit', () => { if (awakeProc === p) awakeProc = null; });
    readPower(); clearInterval(powerT); powerT = setInterval(readPower, 60_000); powerT.unref();
  } else if (!on) {
    if (awakeProc) { try { awakeProc.kill(); } catch { /* gone */ } awakeProc = null; }
    clearInterval(powerT); powerT = null;
  }
}
async function cloudflared() {
  if (process.env.OFFICE_TUNNEL_CMD) return process.env.OFFICE_TUNNEL_CMD;
  if (fs.existsSync(CF_BIN)) return CF_BIN;
  const onPath = await new Promise((resolve) => execFile(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], { timeout: 4000 }, (err, out) => resolve(err ? '' : String(out).split('\n')[0].trim())));
  if (onPath) return onPath;
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const asset = { darwin: `cloudflared-darwin-${arch}.tgz`, linux: `cloudflared-linux-${arch}`, win32: 'cloudflared-windows-amd64.exe' }[process.platform];
  if (!asset) throw new Error(tr('server.tunnel.noPlatform'));
  tunnel.state = 'download';
  const r = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`, { signal: AbortSignal.timeout(180_000) });
  if (!r.ok) throw new Error(tr('server.tunnel.downloadFailed', { status: r.status }));
  fs.mkdirSync(path.dirname(CF_BIN), { recursive: true });
  const tmp = `${CF_BIN}.download`;
  fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
  if (asset.endsWith('.tgz')) { await new Promise((resolve, reject) => execFile('tar', ['-xzf', tmp, '-C', path.dirname(CF_BIN)], (err) => (err ? reject(err) : resolve()))); fs.rmSync(tmp, { force: true }); }
  else fs.renameSync(tmp, CF_BIN);
  fs.chmodSync(CF_BIN, 0o755);
  return CF_BIN;
}
// a cloudflared left running by an office that stopped without stopping it (only if that pid is still a cloudflared:
// pids get reused)
function killStaleTunnel() {
  try {
    const pid = Number(fs.readFileSync(TUNNEL_PID, 'utf8'));
    const comm = pid > 1 && alive(pid) && process.platform !== 'win32' ? execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], { timeout: 4000 }).toString() : '';
    if (/cloudflared|tunnel/i.test(path.basename(comm.trim()))) process.kill(pid, 'SIGTERM');
  } catch { /* none, or gone */ }
  fs.rmSync(TUNNEL_PID, { force: true });
}
// The tunnel outlives a restart of the office (an update, say): cloudflared runs on its own, writing to data/tunnel.log, and
// leads to a port that doesn't change (OFFICE_TUNNEL_PORT, else the office's + 7), so the office coming back takes the
// same cloudflared and the same address (data/tunnel.json) and the phone's link still works. Only the switch stops it.
const TUNNEL_FILE = path.join(DATA_DIR, 'tunnel.json'), TUNNEL_LOG = path.join(DATA_DIR, 'tunnel.log'), TUNNEL_PORT = Number(process.env.OFFICE_TUNNEL_PORT) || PORT + 7;
const isCloudflared = (pid) => { try { return process.platform !== 'win32' && /cloudflared/.test(path.basename(execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], { timeout: 4000 }).toString().trim())); } catch { return false; } };
const readJsonFile = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
async function listenTunnel() {
  if (tunnel.srv) return;
  const handle = server.listeners('request')[0], srv = http.createServer((req, res) => { req.viaTunnel = true; handle(req, res); });
  await new Promise((resolve, reject) => { srv.once('error', reject); srv.listen(TUNNEL_PORT, '127.0.0.1', resolve); });
  tunnel.srv = srv; tunnel.port = TUNNEL_PORT;
}
function tunnelUp(pid, url) {
  Object.assign(tunnel, { pid, url, host: new URL(url).host, state: 'on', tries: 0, error: '' });
  try { fs.writeFileSync(TUNNEL_FILE, JSON.stringify({ pid, url, port: tunnel.port })); } catch { /* read-only data */ }
  console.log(`[my-office] ${tr('server.tunnel.ready', { url })}`);
  clearInterval(tunnel.watch);
  tunnel.watch = setInterval(() => {   // (it may drop: the network went away, Cloudflare closed it; again, later each time)
    if (!tunnel.pid || alive(tunnel.pid)) return;
    clearInterval(tunnel.watch); Object.assign(tunnel, { pid: 0, url: '', host: '' }); fs.rmSync(TUNNEL_FILE, { force: true });
    if (!prefs.get('tunnel')) { tunnel.state = 'off'; return; }
    tunnel.state = 'error'; tunnel.error = tr('server.tunnel.dropped');
    if (++tunnel.tries <= 6) setTimeout(() => { if (prefs.get('tunnel')) startTunnel(); }, Math.min(60_000, 3000 * 2 ** tunnel.tries)).unref();
  }, 5000);
  tunnel.watch.unref();
}
async function startTunnel() {
  if (tunnel.pid || tunnel.state === 'download' || tunnel.state === 'starting') return;
  keepAwake(true);
  const gen = ++tunnel.gen;
  tunnel.state = 'starting'; tunnel.error = ''; tunnel.url = ''; tunnel.host = '';
  try {
    await listenTunnel();
    // the one left running before a restart, to the same port: the same address
    const saved = readJsonFile(TUNNEL_FILE);
    if (saved?.url && saved.port === tunnel.port && saved.pid > 1 && alive(saved.pid) && isCloudflared(saved.pid)) { tunnelUp(saved.pid, saved.url); return; }
    killStaleTunnel();
    const cmd = await cloudflared();
    if (gen !== tunnel.gen || !prefs.get('tunnel')) return;
    tunnel.state = 'starting';
    fs.writeFileSync(TUNNEL_LOG, '');
    const out = fs.openSync(TUNNEL_LOG, 'a');
    const proc = spawn(cmd, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${tunnel.port}`], { stdio: ['ignore', out, out], detached: true, windowsHide: true });
    fs.closeSync(out); proc.unref();
    proc.on('error', (err) => { tunnel.error = String(err.message || err).slice(0, 200); });
    try { fs.writeFileSync(TUNNEL_PID, String(proc.pid)); } catch { /* read-only data */ }
    // its address, from its log
    const t0 = Date.now();
    await new Promise((resolve) => {
      const look = () => {
        if (gen !== tunnel.gen) { resolve(); return; }
        let log = ''; try { log = fs.readFileSync(TUNNEL_LOG, 'utf8'); } catch { /* not yet */ }
        const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(log);
        if (m) { tunnelUp(proc.pid, m[0]); resolve(); return; }
        if (!alive(proc.pid) || Date.now() - t0 > 90_000) { tunnel.state = 'error'; tunnel.error ||= clip(oneLine(log.split('\n').filter(Boolean).pop() || tr('server.tunnel.dropped')), 200); try { process.kill(proc.pid); } catch { /* gone */ } resolve(); return; }
        setTimeout(look, 500);
      };
      look();
    });
  } catch (err) {
    if (gen !== tunnel.gen) return;
    tunnel.state = 'error'; tunnel.error = String(err.message || err).slice(0, 200);
  }
}
function stopTunnel() {
  tunnel.gen++;
  keepAwake(false); clearInterval(tunnel.watch);
  if (tunnel.pid) { try { process.kill(tunnel.pid, 'SIGTERM'); } catch { /* gone */ } }
  fs.rmSync(TUNNEL_PID, { force: true }); fs.rmSync(TUNNEL_FILE, { force: true });
  if (tunnel.srv) { tunnel.srv.close(); tunnel.srv.closeAllConnections?.(); tunnel.srv = null; tunnel.port = 0; }
  Object.assign(tunnel, { state: 'off', url: '', host: '', error: '', tries: 0, pid: 0 });
}
// (the office stopping: cloudflared keeps going for when it comes back; staying awake ends with it, caffeinate -w)
process.on('exit', () => { try { awakeProc?.kill(); } catch { /* gone */ } });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => process.exit(0));

server.listen(PORT, HOST, () => {
  syncLan();
  if (prefs.get('tunnel')) startTunnel(); else killStaleTunnel();
  scanSessions();
  scanCleanups().catch(() => {});   // macOS paths; elsewhere there may be nothing to scan
  trackOwners();
  startTrend();
  console.log(tr('server.console.listening', { port: PORT, phone: HOST === '127.0.0.1' ? tr('server.console.lanOff') : lanUrl(false) || tr('server.console.noLan') }));
});
