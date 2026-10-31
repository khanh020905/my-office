// The machine panel ("Mac" on a Mac): memory, CPU, disk, dev servers, idle Claude sessions, heavy apps, and a fixed list
// of caches that are safe to delete. The readings come from ./platform (macOS, Linux or Windows); this file interprets
// them. Every action re-checks its target against a fresh scan, so the page can only stop or delete things this file
// chose to offer.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { redact } from './redact.mjs';
import { createT } from '../src/i18n/index.js';
import { OS } from './platform/index.mjs';
import { sh } from './platform/shared.mjs';

const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const SESS_DIR = path.join(CLAUDE_DIR, 'sessions');
const TMP_ROOT = OS.PATHS.claudeTmp;
const EXT_DIR = path.join(HOME, '.antigravity-ide', 'extensions');
const PW_DIR = OS.PATHS.playwright;
const NPM_CACHE = OS.PATHS.npmCache;
// this user's processes (on Windows: this session's; read live, it is known after the first reading there)
const mine = (p) => p.uid === OS.UID;
// a program's bare name: "node" for /usr/local/bin/node and for C:\\Program Files\\nodejs\\node.exe
const binOf = (comm) => path.basename(String(comm).replace(/\\/g, '/')).replace(/\.exe$/i, '');
const GB = 1024 ** 3;
const DEV_BIN = /^(node|bun|deno|python\d*(\.\d+)?|Python|ruby|php|java|redis-server|postgres|mysqld|uvicorn|gunicorn|hugo)$/;
const TREE_BIN = /^(node|npm|npx|pnpm|yarn|bun|sh)$/;
const KEEP_APPS = new Set(['Antigravity IDE', 'Finder', 'Claude']);

// Tips, cleanup names and action results are written in the office's language: index.mjs hands over its translator
// with setI18n({ tr, num, lang }). English until then (and for anything that imports this file on its own).
let tr = createT('en'), num = tr.num, langOf = () => 'en';
export function setI18n(o) { ({ tr, num, lang: langOf } = o); }

const tilde = (p) => (p && p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p || '');
const exists = async (p) => { try { await fsp.access(p); return true; } catch { return false; } };
const readdir = async (p) => { try { return await fsp.readdir(p); } catch { return []; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

export function fmtBytes(b) {
  if (b >= GB) return tr('time.gb', { n: num(b / GB, b >= 10 * GB ? 0 : 1) });
  return tr('time.mb', { n: num(Math.max(1, Math.round(b / 1024 ** 2))) });
}
export function fmtDur(sec) {
  if (sec >= 86400) { const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600); return h ? tr('time.dayHour', { d, h }) : tr('time.day', { n: d }); }
  if (sec >= 3600) { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return m ? tr('time.hourMin', { h, m }) : tr('time.hour', { n: h }); }
  return tr('time.min', { n: Math.max(1, Math.floor(sec / 60)) });
}

/* ---------- raw readings: ./platform ---------- */
const { processes, memory, disk, listeners, cwds, liteProcs, established, footprints } = OS;
function descendants(kids, pid) {
  const out = [], stack = [...(kids.get(pid) || [])];
  while (stack.length) { const c = stack.pop(); out.push(c); stack.push(...(kids.get(c) || [])); }
  return out;
}
const treeMem = (P, root) => [root, ...descendants(P.kids, root)].reduce((s, pid) => s + (P.procs.get(pid)?.mem || 0), 0);
const treeCpu = (P, root) => [root, ...descendants(P.kids, root)].reduce((s, pid) => s + (P.procs.get(pid)?.cpu || 0), 0);

async function claudeFiles() {
  const out = [];
  for (const f of await readdir(SESS_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(await fsp.readFile(path.join(SESS_DIR, f), 'utf8'));
      if (j.pid && alive(j.pid)) out.push(j);
    } catch { /* half-written file */ }
  }
  return out;
}
const transcriptOf = (j) => path.join(CLAUDE_DIR, 'projects', String(j.cwd || '').replace(/[^A-Za-z0-9-]/g, '-'), `${j.sessionId}.jsonl`);

/* ---------- who started what ----------
   Every Bash call of a session runs in its own process group (a zsh group leader) under the session's claude process.
   Every 15 s the owner of each process group under a live session is noted, so a dev server can still be traced to
   its session after the session closed and launchd adopted it. A group id cannot be reused while any member lives;
   a record is kept only while it has a member that started before the record was last confirmed. */
const OWNERS_FILE = path.join(process.env.OFFICE_DATA_DIR ? path.resolve(process.env.OFFICE_DATA_DIR) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data'), 'owners.json');
const groups = new Map();   // pgid -> { sid, name, dir, seen (unix s) }
try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(OWNERS_FILE, 'utf8')))) groups.set(Number(k), v); } catch { /* first run */ }
let groupsDirty = false;
function sessionAncestor(P, pid, live) {
  for (let cur = P.procs.get(pid), hops = 0; cur && hops < 40; cur = P.procs.get(cur.ppid), hops++) {
    const j = live.get(cur.pid);
    if (j && cur.pid !== pid) return j;
  }
  return null;
}
function noteOwners(P, files) {
  const live = new Map(files.map((j) => [j.pid, j]));
  const now = Math.round(Date.now() / 1000);
  for (const p of P.procs.values()) {
    // Only groups the session created (their leader is below it): the claude process itself sits in the IDE's group.
    if (!mine(p) || p.pid !== p.pgid || live.has(p.pid)) continue;
    const j = sessionAncestor(P, p.pid, live);
    if (!j) continue;
    const g = groups.get(p.pgid);
    if (!g || g.sid !== j.sessionId) { groups.set(p.pgid, { sid: j.sessionId, name: j.name || path.basename(j.cwd || ''), dir: tilde(j.cwd), seen: now }); groupsDirty = true; }
    else g.seen = now;
  }
  const members = new Map();
  for (const p of P.procs.values()) if (groups.has(p.pgid)) members.set(p.pgid, Math.min(members.get(p.pgid) ?? Infinity, p.start));
  for (const [pgid, g] of groups) {
    const first = members.get(pgid);
    if (first == null || first > g.seen + 30) { groups.delete(pgid); groupsDirty = true; }
    else if (g.seen < now) g.seen = now;
  }
  if (groupsDirty) {
    groupsDirty = false;
    const tmp = OWNERS_FILE + '.tmp';
    fsp.writeFile(tmp, JSON.stringify(Object.fromEntries(groups))).then(() => fsp.rename(tmp, OWNERS_FILE)).catch(() => {});
  }
}
// Owner of one process: a live session above it, else the recorded owner of its process group.
function ownerOf(P, pid, files) {
  const live = new Map(files.map((j) => [j.pid, j]));
  const j = sessionAncestor(P, pid, live);
  if (j) return { sid: j.sessionId, name: j.name || path.basename(j.cwd || ''), alive: true };
  const p = P.procs.get(pid), g = p && groups.get(p.pgid);
  if (!g || p.start > g.seen + 30) return null;
  return { sid: g.sid, name: g.name, alive: files.some((f) => f.sessionId === g.sid) };
}
let tracking = null;
export function trackOwners() {
  if (tracking) return;
  const tick = async () => {
    try { const [P, files, est, foot] = await Promise.all([liteProcs(), claudeFiles(), established(), footprints(120_000)]); noteOwners(P, files); noteUsage(P, est, foot, OS.footprintAt()); }
    catch { /* next tick */ }
  };
  tick(); tracking = setInterval(tick, 15000); tracking.unref?.();
}

/* ---------- usage history: memory that keeps growing, CPU that stays pinned, dev servers nobody opens ----------
   Sampled every 15 s by the tracker above. Rules adapted from cc-reaper (Apache-2.0, github.com/Kanevry/cc-reaper):
   a runaway is measured from CPU time between samples, not ps %cpu (a decaying average); a dev server is in use while
   any ESTABLISHED connection touches its port, so an open browser tab counts. */
const GROW_WINDOW = 15 * 60e3, GROW_BYTES = 512 * 1024 ** 2, HOT_PCT = 80, HOT_FOR = 10 * 60e3;
const hist = new Map();       // `${pid}:${start}` -> { s: [[t, rss, cpuSec]], f: [[t, footprint]], hotSince, pct }
const portSeen = new Map();   // local port -> last time an ESTABLISHED socket used it
const usageSince = Date.now();
function noteUsage(P, est, foot, fAt) {
  const now = Date.now(), live = new Set();
  for (const p of P.procs.values()) {
    if (!mine(p) || p.cpuSec == null) continue;
    const k = `${p.pid}:${p.start}`; live.add(k);
    let h = hist.get(k);
    if (!h) hist.set(k, (h = { s: [], f: [], hotSince: 0, pct: 0 }));
    const fp = foot?.get(p.pid);
    if (fp && h.f.at(-1)?.[0] !== fAt) { h.f.push([fAt, fp]); while (h.f.length > 2 && fAt - h.f[1][0] > GROW_WINDOW) h.f.shift(); }
    const last = h.s.at(-1);
    if (last) {
      const dt = now - last[0];
      if (dt < 10e3) continue;
      if (dt > 20 * 60e3) h.hotSince = 0;   // a gap (the Mac slept) restarts the streak
      else { h.pct = ((p.cpuSec - last[2]) * 100) / (dt / 1000); if (h.pct >= HOT_PCT) h.hotSince ||= last[0]; else h.hotSince = 0; }
    }
    h.s.push([now, p.rss, p.cpuSec]);
    while (h.s.length > 2 && now - h.s[1][0] > GROW_WINDOW) h.s.shift();
  }
  for (const k of hist.keys()) if (!live.has(k)) hist.delete(k);
  for (const port of est.keys()) portSeen.set(port, now);
}
// Growth of one process over the last 15 minutes, and how long it has kept a core busy.
function usageOf(p) {
  const h = hist.get(`${p.pid}:${p.start}`);
  if (!h || !h.s.length) return { grow: 0, growMs: 0, hotMs: 0, pct: 0 };
  const now = Date.now();
  // growth from the lowest point in the window to now, on RSS and on footprint (whichever shows more)
  const rise = (xs) => { if (!xs.length) return [0, 0]; let low = xs[0]; for (const x of xs) if (x[1] < low[1]) low = x; const last = xs.at(-1); return [last[1] - low[1], last[0] - low[0]]; };
  const [g1, m1] = rise(h.s), [g2, m2] = rise(h.f);
  const [grow, growMs] = g2 > g1 ? [g2, m2] : [g1, m1];
  return { grow, growMs, hotMs: h.hotSince ? now - h.hotSince : 0, pct: Math.round(h.pct) };
}
// The worst growth / longest CPU streak inside a process tree.
function treeUsage(P, root) {
  let grow = 0, growMs = 0, hotMs = 0, pct = 0;
  for (const pid of [root, ...descendants(P.kids, root)]) {
    const p = P.procs.get(pid); if (!p) continue;
    const u = usageOf(p);
    if (u.grow > grow) { grow = u.grow; growMs = u.growMs; }
    if (u.hotMs > hotMs) { hotMs = u.hotMs; pct = u.pct; }
  }
  return { grow, growMs, hotMs, pct };
}
const growing = (u) => u.grow >= GROW_BYTES && u.growMs <= GROW_WINDOW + 60e3;
const pinned = (u) => u.hotMs >= HOT_FOR;

/* ---------- interpretation ---------- */
function devLabel(p) {
  const a = p.args;
  if (/next-server|next(\/dist\/bin\/next)?\s+dev|next dev/.test(a)) return 'next dev';
  if (/\bvite\b/.test(a)) return 'vite';
  if (/webpack/.test(a)) return 'webpack';
  if (/storybook/.test(a)) return 'storybook';
  const bin = binOf(p.comm);
  const script = a.split(/\s+/).slice(1).find((x) => x && !x.startsWith('-'));
  return script ? `${bin} ${path.basename(script)}` : bin;
}
function rootOf(P, pid) {
  // Climb through npm/pnpm/node wrappers so "Stop" stops the whole dev server, not just its worker.
  let cur = P.procs.get(pid);
  while (cur) {
    const parent = P.procs.get(cur.ppid);
    if (!parent || parent.pid <= 1 || !mine(parent) || !TREE_BIN.test(binOf(parent.comm)) || parent.comm.includes('.app/')) break;
    cur = parent;
  }
  return cur ? cur.pid : pid;
}
const appOf = (comm) => OS.appOf(comm);
function protectedPids(P) {
  const set = new Set([1, process.pid]);
  let cur = P.procs.get(process.pid);
  while (cur && cur.ppid > 1) { set.add(cur.ppid); cur = P.procs.get(cur.ppid); }
  return set;
}

/* ---------- disk cleanups (slow: scanned in the background) ----------
   Each item keeps its kind and numbers (`words`); its title and note are written when a snapshot is sent, so they
   follow the language even though the scan runs only every 15 minutes. */
const cleanupWords = (c) => ({ title: tr(`server.sys.clean.${c.words[0]}.title`, c.words[1]), note: tr(`server.sys.clean.${c.words[0]}.note`, c.words[1]) });
const duBytes = (p) => OS.folderBytes(p);
function semverCmp(a, b) { const pa = a.split('.').map(Number), pb = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); return 0; }

let cleanups = [];
let cleanupsAt = 0;
let scanningCleanups = null;
export function scanCleanups() { return (scanningCleanups ??= doScanCleanups().finally(() => { scanningCleanups = null; })); }
async function doScanCleanups() {
  const files = await claudeFiles();
  const liveSids = new Set(files.map((j) => j.sessionId));
  const P = await processes();
  const allArgs = [...P.procs.values()].map((p) => p.comm + ' ' + p.args).join('\n');
  const list = [];

  const stale = []; let staleSize = 0;
  for (const proj of await readdir(TMP_ROOT)) {
    const pdir = path.join(TMP_ROOT, proj);
    for (const sid of await readdir(pdir)) {
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(sid) || liveSids.has(sid)) continue;
      const d = path.join(pdir, sid);
      stale.push(d); staleSize += await duBytes(d);
    }
  }
  if (stale.length) list.push({ id: 'claude-tmp', words: ['claudeTmp', { n: stale.length }], size: staleSize, paths: stale });

  const groups = new Map();
  for (const d of await readdir(EXT_DIR)) {
    const m = /^(.+?)-(\d+\.\d+\.\d+)(?:-.+)?$/.exec(d);
    if (!m) continue;
    if (!groups.has(m[1])) groups.set(m[1], []);
    groups.get(m[1]).push({ dir: path.join(EXT_DIR, d), ver: m[2] });
  }
  const oldExt = []; let extSize = 0;
  for (const versions of groups.values()) {
    if (versions.length < 2) continue;
    versions.sort((a, b) => semverCmp(b.ver, a.ver));
    for (const v of versions.slice(1)) {
      if (allArgs.includes(v.dir)) continue; // a running session still uses this version
      oldExt.push(v.dir); extSize += await duBytes(v.dir);
    }
  }
  if (oldExt.length) list.push({ id: 'ext-old', words: ['extOld', { list: oldExt.map((d) => path.basename(d).replace(/-darwin-arm64|-universal/, '')).join(', ') }], size: extSize, paths: oldExt });

  const projects = new Set();
  for (const j of files) if (j.cwd) { projects.add(j.cwd); for (const sub of await readdir(j.cwd)) projects.add(path.join(j.cwd, sub)); }
  for (const proj of projects) {
    const cache = path.join(proj, '.next', 'cache');
    if (!(await exists(cache))) continue;
    const size = await duBytes(cache);
    if (size < 150 * 1024 ** 2) continue;
    list.push({ id: 'next:' + cache, words: ['next', { dir: tilde(proj) }], size, paths: [cache] });
  }

  if (await exists(NPM_CACHE)) {
    const size = await duBytes(NPM_CACHE);
    if (size > 150 * 1024 ** 2) list.push({ id: 'npm-cache', words: ['npm', {}], size, cmd: OS.PATHS.npmClean });
  }

  const pw = (await readdir(PW_DIR)).filter((d) => /^(firefox|webkit)-/.test(d)).map((d) => path.join(PW_DIR, d));
  if (pw.length) {
    let size = 0; for (const d of pw) size += await duBytes(d);
    list.push({ id: 'pw-extra', words: ['playwright', {}], size, paths: pw });
  }

  cleanups = list.sort((a, b) => b.size - a.size);
  cleanupsAt = Date.now();
}
setInterval(() => { scanCleanups(); }, 15 * 60 * 1000).unref();

/* ---------- snapshot ---------- */
let cache = null;
let cacheAt = 0;
let building = null;
let cacheLang = '';
// open: the Mac panel is open, so the memory footprints are read again if older than 25 s (top costs ~1.3 s of CPU);
// for the top bar's reading alone (every 30 s from each open page) the 15-second sampler's, up to 2 minutes old, do
export async function sysSnapshot({ open = false } = {}) {
  if (cache && Date.now() - cacheAt < 3000 && cacheLang === langOf() && (!open || cache.open)) return cache;
  building ??= buildSnapshot(open).then((s) => { s.open = open; return s; }).then((s) => { cache = s; cacheAt = Date.now(); cacheLang = langOf(); return s; }).finally(() => { building = null; });
  return building;
}
async function buildSnapshot(open = true) {
  const [P, mem, dsk, ports, files, est, battery] = await Promise.all([processes(open ? 25_000 : 120_000), memory(), disk(), listeners(), claudeFiles(), established(), OS.battery?.().catch(() => null) ?? null]);
  const cores = os.cpus().length;
  const guard = protectedPids(P);
  noteOwners(P, files);
  const now = Date.now();

  // dev servers
  const devRoots = new Map();
  for (const [pid, set] of ports) {
    const p = P.procs.get(pid);
    if (!p || !mine(p) || guard.has(pid) || p.comm.includes('.app/')) continue;
    if (!DEV_BIN.test(binOf(p.comm)) && !/next-server|vite|webpack/.test(p.args)) continue;
    const root = rootOf(P, pid);
    if (guard.has(root)) continue;
    const d = devRoots.get(root) || { pid: root, ports: new Set(), listener: pid };
    for (const port of set) d.ports.add(port);
    devRoots.set(root, d);
  }
  const cwdMap = await cwds([...devRoots.values()].map((d) => d.listener));
  const devServers = [...devRoots.values()].map((d) => {
    const p = P.procs.get(d.listener), r = P.procs.get(d.pid);
    const conns = [...d.ports].reduce((n, port) => n + (est.get(port) || 0), 0);
    const lastUse = Math.max(0, ...[...d.ports].map((port) => portSeen.get(port) || 0));
    // nobody connected since: the last time we saw a connection, else since it (or our watching) started
    const idle = conns ? 0 : Math.round((now - Math.max(lastUse, usageSince, now - r.up * 1000)) / 1000);
    return { pid: d.pid, start: r.start, label: redact(devLabel(p)), ports: [...d.ports].sort((a, b) => a - b), dir: tilde(cwdMap.get(d.listener) || ''),
      up: r.up, cpu: Math.round(treeCpu(P, d.pid)), mem: treeMem(P, d.pid), owner: ownerOf(P, d.listener, files) || ownerOf(P, d.pid, files),
      conns, idle, watched: Math.round((now - usageSince) / 1000), use: treeUsage(P, d.pid) };
  }).sort((a, b) => b.mem - a.mem);

  // Claude sessions
  const claude = [];
  for (const j of files) {
    let last = j.statusUpdatedAt || j.updatedAt || j.startedAt || now;
    try { last = Math.max(last, (await fsp.stat(transcriptOf(j))).mtimeMs); } catch { /* no transcript yet */ }
    claude.push({ pid: j.pid, start: P.procs.get(j.pid)?.start, name: j.name || path.basename(j.cwd || ''), dir: tilde(j.cwd), busy: j.status === 'busy',
      idle: Math.max(0, Math.round((now - last) / 1000)), mem: treeMem(P, j.pid), remote: !!j.bridgeSessionId });
  }
  claude.sort((a, b) => b.idle - a.idle);

  // apps
  const apps = new Map();
  for (const p of P.procs.values()) {
    if (!mine(p)) continue;
    const name = appOf(p.comm);
    if (!name) continue;
    const a = apps.get(name) || { name, mem: 0, cpu: 0, count: 0, main: null };
    a.mem += p.mem; a.cpu += p.cpu; a.count++;
    if (name !== 'Claude Code' && p.comm.includes(`${name}.app/Contents/MacOS/`) && !p.comm.includes('/Frameworks/')) { a.main = p.pid; a.user = /^(\/Applications\/|~?\/Users\/[^/]+\/Applications\/)/.test(p.comm); }
    apps.set(name, a);
  }
  const appList = [...apps.values()].map(({ main, user, ...a }) => ({ ...a, cpu: Math.round(a.cpu), quit: !!main && !!user && !KEEP_APPS.has(a.name) }))
    .sort((a, b) => b.mem - a.mem).slice(0, 10);

  // headless browsers left behind by test scripts
  const orphans = [];
  for (const p of P.procs.values()) {
    if (!mine(p) || guard.has(p.pid) || p.up < 1800) continue;
    if (!/chrome-headless-shell|Chromium\.app|Google Chrome for Testing|ms-playwright[\\/]chromium/.test(p.comm)) continue;
    const parent = P.procs.get(p.ppid);
    if (parent && /headless|Chromium|Testing/.test(parent.comm)) continue; // only the top of each browser tree
    orphans.push({ pid: p.pid, start: p.start, label: binOf(p.comm), up: p.up, mem: treeMem(P, p.pid), owner: ownerOf(P, p.pid, files) });
  }

  const editor = ideParts(P, appList, claude);
  // everything your own processes hold (footprints: compressed and swapped memory included), for "who holds the RAM"
  const held = [...P.procs.values()].reduce((s, p) => s + (mine(p) ? p.mem : 0), 0);

  const totalCpu = [...P.procs.values()].reduce((s, p) => s + p.cpu, 0);
  const tight = mem.pressure !== 'normal' || mem.swapUsed > 4 * GB;
  const diskTight = dsk.free / dsk.total < 0.15;

  // How long something may sit unused before we suggest closing it shrinks as memory gets tight.
  const lv = mem.pressure === 'critical' ? 2 : tight ? 1 : 0;
  const SESSION_IDLE = [2 * 3600, 45 * 60, 20 * 60][lv], DEV_IDLE = [6 * 3600, 2 * 3600, 45 * 60][lv];
  const growText = (u) => tr('server.sys.grew', { size: fmtBytes(u.grow), time: fmtDur(Math.max(60, u.growMs / 1000)) });
  const hotText = (u) => tr('server.sys.hot', { pct: u.pct, time: fmtDur(u.hotMs / 1000) });
  const tips = [], covered = new Set();
  for (const d of devServers) {
    for (const pid of [d.pid, ...descendants(P.kids, d.pid)]) covered.add(pid);
    const reasons = [], u = d.use;
    const left = d.owner && !d.owner.alive && d.up > 120 && !d.conns;
    if (left) reasons.push(tr('server.sys.leftBy', { name: d.owner.name }));
    if (growing(u)) reasons.push(growText(u));
    if (pinned(u)) reasons.push(hotText(u));
    if (!d.conns && d.idle > DEV_IDLE) reasons.push(tr('server.sys.unused', { time: fmtDur(d.idle) }));
    if (d.mem > 1.5 * GB && !d.conns) reasons.push(`RAM ${fmtBytes(d.mem)}`);
    if (!reasons.length) continue;
    if (d.conns) reasons.push(tr('server.sys.conns', { n: d.conns }));
    tips.push({ id: `kill:${d.pid}`, action: 'kill', target: d.pid, start: d.start, gain: d.mem,
      level: growing(u) || pinned(u) || d.mem > 4 * GB || (left && d.mem > 500 * 1024 ** 2) ? 'high' : 'mid',
      title: tr('server.sys.stopDev', { label: d.label, state: left ? tr('server.sys.devState.left') : growing(u) ? tr('server.sys.devState.growing') : pinned(u) ? tr('server.sys.devState.hot') : '', ports: d.ports.join(', '), n: d.ports.length }),
      detail: `${d.dir || 'dev server'} · ${reasons.join(' · ')}`, verb: tr('mac.verb.stop') });
  }
  // any other process of yours that keeps growing or keeps a core busy (apps are only named, never killed from here)
  const claudePids = new Set(claude.map((c) => c.pid));
  for (const p of P.procs.values()) {
    if (!mine(p) || guard.has(p.pid) || covered.has(p.pid) || claudePids.has(p.pid)) continue;
    const u = usageOf(p);
    const app = appOf(p.comm);
    // apps (browsers, the IDE) breathe a lot: name them only for a 1 GB rise or a pinned core
    if (!(growing(u) && p.mem > GB && (!app || u.grow >= GB)) && !pinned(u)) continue;
    const why = [growing(u) && growText(u), pinned(u) && hotText(u)].filter(Boolean).join(' · ');
    const name = app || binOf(p.comm);
    if (tips.some((t) => t.app === name)) continue;
    if (app) { tips.push({ id: `info:grow:${name}`, action: null, app: name, gain: p.mem, level: 'mid', title: tr(growing(u) ? 'server.sys.appGrowing' : 'server.sys.appHot', { name }), detail: tr('server.sys.appDetail', { why, size: fmtBytes(p.mem) }) }); continue; }
    tips.push({ id: `kill:${p.pid}`, action: 'kill', target: p.pid, start: p.start, gain: p.mem, level: 'high',
      title: tr(growing(u) ? 'server.sys.stopGrowing' : 'server.sys.stopHot', { name }), detail: tr('server.sys.procDetail', { what: redact(p.args).slice(0, 90) || name, why, size: fmtBytes(p.mem) }), verb: tr('mac.verb.stop') });
  }
  for (const c of claude) {
    if (c.busy || c.idle < SESSION_IDLE) continue;
    tips.push({ id: `kill:${c.pid}`, action: 'kill', target: c.pid, start: c.start, gain: c.mem, level: 'mid',
      title: tr('server.sys.closeSession', { name: c.name }), detail: tr('server.sys.sessionDetail', { time: fmtDur(c.idle), size: fmtBytes(c.mem) }), verb: tr('common.close') });
  }
  for (const o of orphans) {
    tips.push({ id: `kill:${o.pid}`, action: 'kill', target: o.pid, start: o.start, gain: o.mem, level: 'mid',
      title: tr('server.sys.stopOrphan', { label: o.label }), verb: tr('mac.verb.stop'),
      detail: tr('server.sys.orphanDetail', { time: fmtDur(o.up), size: fmtBytes(o.mem), owner: o.owner ? tr(o.owner.alive ? 'server.sys.orphanOwner' : 'server.sys.orphanOwnerClosed', { name: o.owner.name }) : '' }) });
  }
  if (tight) for (const a of appList) {
    if (!a.quit || a.mem < 1.2 * GB) continue;
    tips.push({ id: `quit:${a.name}`, action: 'quit', target: a.name, gain: a.mem, level: 'low',
      title: tr('server.sys.quitApp', { name: a.name }), detail: tr('server.sys.quitDetail', { size: fmtBytes(a.mem), n: a.count }), verb: tr('mac.verb.quit') });
  }
  const ide = appList.find((a) => a.name === 'Antigravity IDE');
  if (ide && ide.mem > 6 * GB) {
    tips.push({ id: 'info:ide', action: null, gain: ide.mem, level: 'low', title: tr('server.sys.ideTitle', { size: fmtBytes(ide.mem) }), detail: tr('server.sys.ideDetail') });
  }
  for (const c of cleanups) {
    if (c.size < 300 * 1024 ** 2) continue;
    const w = cleanupWords(c);
    tips.push({ id: `clean:${c.id}`, action: 'clean', target: c.id, gain: c.size, disk: true, level: diskTight ? 'high' : 'low',
      title: w.title, detail: tr('server.sys.cleanDetail', { size: fmtBytes(c.size), note: w.note }), verb: tr('mac.verb.clean') });
  }
  const rank = { high: 0, mid: 1, low: 2 };
  const group = (t) => (t.disk ? 2 : t.action ? 0 : 1);
  tips.sort((a, b) => group(a) - group(b) || rank[a.level] - rank[b.level] || b.gain - a.gain);

  return {
    at: now,
    mem, disk: dsk, tight, diskTight, battery,   // (battery: { pct, charging, ac } or null; the street's e-scooters show it)
    cpu: { cores, percent: Math.min(100, Math.round(totalCpu / cores)), load: os.loadavg()[0] },
    rules: { sessionIdle: SESSION_IDLE, devIdle: DEV_IDLE, pressure: mem.pressure },
    devServers, claude, apps: appList, orphans, tips, ide: editor, held, trend: trend.slice(),
    cleanups: cleanups.map(({ paths, cmd, words, ...c }) => ({ ...c, ...cleanupWords({ words }), count: paths ? paths.length : undefined })),
    cleanupsAt,
  };
}

/* ---------- what a VS Code-family editor (Antigravity, VS Code, Cursor…) holds ----------
   Its processes say what they are: a renderer per window and per webview (the Claude chat panels), an extension host
   per window, a TypeScript server per project with TypeScript open. The windows are told apart by the window id each
   renderer carries. The Claude Code chats it holds: the sessions whose process sits under it. */
function ideParts(P, appList, claude) {
  const first = [...P.procs.values()].find((p) => mine(p) && /--vscode-window-config=/.test(p.args));
  const name = first && appOf(first.comm), app = name && appList.find((a) => a.name === name);
  if (!app) return null;
  const parts = { ui: { mem: 0, n: 0 }, ts: { mem: 0, n: 0 }, ext: { mem: 0, n: 0 } }, windows = new Set();
  let known = 0;
  for (const p of P.procs.values()) {
    if (!mine(p) || appOf(p.comm) !== name) continue;
    const k = /--type=renderer/.test(p.args) ? 'ui' : /tsserver\.js/.test(p.args) ? 'ts' : /utility-sub-type=node\.mojom\.NodeService/.test(p.args) && /\(Plugin\)/.test(p.comm) ? 'ext' : null;
    const w = /--vscode-window-config=vscode:([0-9a-f-]+)/.exec(p.args)?.[1];
    if (w) windows.add(w);
    if (!k) continue;
    parts[k].mem += p.mem; known += p.mem;
    if (k !== 'ts' || !/partialSemantic/.test(p.args)) parts[k].n++;   // (a project's TypeScript runs as two servers: count it once)
  }
  const under = (pid) => { for (let p = P.procs.get(pid), i = 0; p && i < 12; p = P.procs.get(p.ppid), i++) if (p.comm.includes(`${name}.app/`)) return true; return false; };
  const chats = claude.filter((c) => under(c.pid));
  return { name, mem: app.mem, windows: windows.size, ui: parts.ui, ts: parts.ts, ext: parts.ext, other: Math.max(0, app.mem - known),
    chats: chats.length, idleChats: chats.filter((c) => !c.busy).length };
}

/* ---------- RAM and swap over the last half hour: one reading a minute ---------- */
const trend = [];
let trendTimer = null;
export function startTrend() {
  if (trendTimer) return;
  const take = () => memory().then((m) => { trend.push({ t: Date.now(), used: m.used, total: m.total, swap: m.swapUsed }); if (trend.length > 31) trend.shift(); }).catch(() => {});
  take(); trendTimer = setInterval(take, 60_000); trendTimer.unref();
}

/* ---------- actions ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function within(p, roots) { const r = path.resolve(p); return roots.some((root) => r.startsWith(root + path.sep)); }

export async function sysAction({ action, target, force, start, items }) {
  // several idle Claude sessions at once (the drawer's main button, and closing idle sessions on a timer): the same checks
  // as closing one, never forced, never a session that is working
  if (action === 'closeIdle') {
    const list = (Array.isArray(items) ? items : []).slice(0, 40).map((x) => ({ pid: Number(x?.target), start: Number(x?.start) }));
    const snap = await buildSnapshot(), P = await processes(), guard = protectedPids(P);
    const idle = new Map(snap.claude.filter((c) => !c.busy).map((c) => [c.pid, c]));
    const go = list.filter(({ pid, start: st }) => { const cur = P.procs.get(pid); return idle.has(pid) && !guard.has(pid) && cur && Number.isFinite(st) && Math.abs(cur.start - st) <= 3; });
    if (!go.length) { cache = null; return { ok: false, closed: [], message: tr('server.sys.result.notOffered') }; }
    const trees = go.map(({ pid }) => [...descendants(P.kids, pid).reverse(), pid]);
    for (const t of trees.flat()) { try { process.kill(t, 'SIGTERM'); } catch { /* already gone */ } }
    await sleep(1500);
    cache = null;
    const closed = go.filter((_, i) => !trees[i].some(alive)).map(({ pid }) => ({ name: idle.get(pid).name, mem: idle.get(pid).mem }));
    const size = fmtBytes(closed.reduce((a, c) => a + c.mem, 0));
    const left = go.length - closed.length;
    return { ok: !left, closed, message: left ? tr('server.sys.result.closedSome', { n: closed.length, left }) : tr('server.sys.result.closedIdle', { n: closed.length, size }) };
  }
  if (action === 'kill') {
    const pid = Number(target);
    const snap = await buildSnapshot();
    const offered = new Set([...snap.devServers.map((d) => d.pid), ...snap.claude.filter((c) => !c.busy || force).map((c) => c.pid), ...snap.orphans.map((o) => o.pid)]);
    if (!offered.has(pid)) return { ok: false, message: tr('server.sys.result.notOffered') };
    const P = await processes();
    if (protectedPids(P).has(pid)) return { ok: false, message: tr('server.sys.result.protected') };
    // A PID can be reused once its process exits: only signal the process the user actually saw (same start time).
    const cur = P.procs.get(pid);
    if (!cur) { cache = null; return { ok: true, message: tr('server.sys.result.gone') }; }
    if (!Number.isFinite(Number(start)) || Math.abs(cur.start - Number(start)) > 3) { cache = null; return { ok: false, message: tr('server.sys.result.restarted', { refresh: tr('ui.macDrawer.refresh') }) }; }
    const tree = [...descendants(P.kids, pid).reverse(), pid];
    const sig = force ? 'SIGKILL' : 'SIGTERM';
    for (const t of tree) { try { process.kill(t, sig); } catch { /* already gone */ } }
    await sleep(1500);
    const left = tree.filter(alive);
    cache = null;
    if (left.length) return { ok: false, stubborn: true, message: tr('server.sys.result.stubborn', { force: tr('mac.action.forceStop') }) };
    return { ok: true, message: tr('server.sys.result.stopped') };
  }
  if (action === 'quit') {
    const snap = await buildSnapshot();
    const app = snap.apps.find((a) => a.name === target && a.quit);
    const P = await processes();
    const main = [...P.procs.values()].find((p) => mine(p) && p.comm.includes(`${target}.app/Contents/MacOS/`) && !p.comm.includes('/Frameworks/'));
    if (!app || !main) return { ok: false, message: tr('server.sys.result.noApp') };
    try { process.kill(main.pid, force ? 'SIGKILL' : 'SIGTERM'); } catch { /* gone */ }
    await sleep(2500);
    cache = null;
    if (alive(main.pid)) return { ok: false, stubborn: true, message: tr('server.sys.result.appStubborn', { app: target, force: tr('mac.action.forceQuit') }) };
    return { ok: true, message: tr('server.sys.result.quit', { app: target }) };
  }
  if (action === 'clean') {
    await scanCleanups();
    const c = cleanups.find((x) => x.id === target);
    if (!c) return { ok: false, message: tr('server.sys.result.noItem') };
    if (c.cmd) {
      await sh(c.cmd[0], c.cmd[1], 300000);
    } else {
      const live = new Set((await claudeFiles()).map((j) => j.sessionId));
      const roots = [TMP_ROOT, EXT_DIR, PW_DIR, ...c.paths.filter((p) => p.endsWith(`${path.sep}.next${path.sep}cache`)).map((p) => path.dirname(p))];
      for (const p of c.paths) {
        if (!within(p, roots)) continue;
        if (c.id === 'claude-tmp' && live.has(path.basename(p))) continue; // session reopened since the scan
        await fsp.rm(p, { recursive: true, force: true }).catch(() => {});
      }
    }
    const freed = c.size;
    await scanCleanups();
    cache = null;
    return { ok: true, message: tr('server.sys.result.cleaned', { size: fmtBytes(freed) }) };
  }
  return { ok: false, message: tr('server.sys.result.unknown') };
}
