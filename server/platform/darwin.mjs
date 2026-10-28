// macOS readings: ps for processes, top for memory footprints, vm_stat / sysctl for memory, df for the data volume,
// lsof for listening ports, connections and working folders, the login keychain for Claude Code's sign-in.
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { kidsOf, parseEtime, sh } from './shared.mjs';

export const NAME = 'macOS';
export const UID = process.getuid?.() ?? -1;   // (this module is also loaded, unused, on Windows)
const HOME = os.homedir();
export const PATHS = {
  claudeTmp: `/private/tmp/claude-${UID}`,                   // Claude Code's scratch folders
  playwright: path.join(HOME, 'Library', 'Caches', 'ms-playwright'),
  npmCache: path.join(HOME, '.npm', '_cacache'),
  npmClean: [path.join(path.dirname(process.execPath), 'npm'), ['cache', 'clean', '--force']],
};

function parseMem(v) {
  const m = /^([\d.]+)([BKMGT])/.exec(v || '');
  if (!m) return 0;
  return Math.round(parseFloat(m[1]) * { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[m[2]]);
}
// top's MEM is the memory footprint (compressed + swapped included); ps RSS badly undercounts it under memory pressure.
// One top run costs ~1.2 s of CPU, so readings are shared: at most every 25 s for the open panel, every 2 min otherwise.
let footMap = new Map(), footAt = 0, footing = null;
export function footprints(maxAge) {
  if (footMap.size && Date.now() - footAt < maxAge) return Promise.resolve(footMap);
  footing ??= sh('top', ['-l', '1', '-o', 'mem', '-n', '400', '-stats', 'pid,mem']).then((out) => {
    const m = new Map(); let table = false;
    for (const line of out.split('\n')) {
      if (/^PID\s+MEM/.test(line.trim())) { table = true; continue; }
      const r = table && /^\s*(\d+)\s+(\S+)/.exec(line);
      if (r) m.set(+r[1], parseMem(r[2]));
    }
    if (m.size) { footMap = m; footAt = Date.now(); }
    return footMap;
  }).finally(() => { footing = null; });
  return footing;
}
export const footprintAt = () => footAt;

/** Every process: pid, ppid, pgid, uid, cpu (%), rss, mem (footprint), up (s), start (unix s), comm, args. */
export async function processes() {
  const [psOut, argsOut, foot] = await Promise.all([
    sh('ps', ['-axo', 'pid=,ppid=,pgid=,uid=,%cpu=,rss=,etime=,comm=']),
    sh('ps', ['-axo', 'pid=,args=']),
    footprints(25_000),
  ]);
  const procs = new Map();
  for (const line of psOut.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
    if (!m) continue;
    procs.set(+m[1], { pid: +m[1], ppid: +m[2], pgid: +m[3], uid: +m[4], cpu: +m[5], rss: +m[6] * 1024, up: parseEtime(m[7]), start: Math.round(Date.now() / 1000 - parseEtime(m[7])), comm: m[8].trim(), args: '', mem: 0 });
  }
  for (const line of argsOut.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (m && procs.has(+m[1])) procs.get(+m[1]).args = m[2];
  }
  for (const p of procs.values()) p.mem = Math.max(foot.get(p.pid) || 0, p.rss);
  return { procs, kids: kidsOf(procs) };
}
/** A cheap listing for the 15-second sampler: pid, ppid, pgid, uid, rss, start, cpuSec. */
export async function liteProcs() {
  const out = await sh('ps', ['-axo', 'pid=,ppid=,pgid=,uid=,rss=,etime=,time=']);
  const procs = new Map(), now = Date.now() / 1000;
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)/.exec(line);
    if (m) procs.set(+m[1], { pid: +m[1], ppid: +m[2], pgid: +m[3], uid: +m[4], rss: +m[5] * 1024, start: Math.round(now - parseEtime(m[6])), cpuSec: parseEtime(m[7]) });
  }
  return { procs };
}
export async function memory() {
  const [vm, swap, pressure] = await Promise.all([sh('vm_stat', []), sh('sysctl', ['-n', 'vm.swapusage']), sh('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'])]);
  const page = Number(/page size of (\d+)/.exec(vm)?.[1] || 16384);
  const g = (k) => Number(new RegExp(k + ':\\s+(\\d+)').exec(vm)?.[1] || 0) * page;
  const total = os.totalmem();
  const used = Math.min(total, g('Anonymous pages') - g('Pages purgeable') + g('Pages wired down') + g('Pages occupied by compressor'));
  const sw = /total = ([\d.]+)M\s+used = ([\d.]+)M/.exec(swap);
  return {
    total, used, compressed: g('Pages occupied by compressor'),
    swapTotal: sw ? Number(sw[1]) * 1024 ** 2 : 0, swapUsed: sw ? Number(sw[2]) * 1024 ** 2 : 0,
    pressure: { 1: 'normal', 2: 'warn', 4: 'critical' }[Number(pressure.trim())] || 'normal',
  };
}
export async function disk() {
  const out = await sh('df', ['-k', '/System/Volumes/Data']);
  const f = out.trim().split('\n').pop().split(/\s+/);
  const total = Number(f[1]) * 1024, free = Number(f[3]) * 1024;
  return { total, free, used: total - free };
}
/** pid -> listening TCP ports */
export async function listeners() {
  const out = await sh('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pn'], 10000);
  const map = new Map(); let pid = 0;
  for (const line of out.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1));
    else if (line[0] === 'n' && pid) {
      const port = Number(line.slice(line.lastIndexOf(':') + 1));
      if (port) { if (!map.has(pid)) map.set(pid, new Set()); map.get(pid).add(port); }
    }
  }
  return map;
}
/** local port -> number of ESTABLISHED sockets on it (a server's side of a connection carries its listening port) */
export async function established() {
  const out = await sh('lsof', ['-nP', '-iTCP', '-sTCP:ESTABLISHED', '-F', 'n'], 10000);
  const ports = new Map();
  for (const line of out.split('\n')) {
    if (line[0] !== 'n') continue;
    const local = line.slice(1).split('->')[0], port = Number(local.slice(local.lastIndexOf(':') + 1));
    if (port) ports.set(port, (ports.get(port) || 0) + 1);
  }
  return ports;
}
/** pid -> working folder */
export async function cwds(pids) {
  const map = new Map();
  if (!pids.length) return map;
  const out = await sh('lsof', ['-a', '-p', pids.join(','), '-d', 'cwd', '-F', 'pn']);
  let pid = 0;
  for (const line of out.split('\n')) { if (line[0] === 'p') pid = Number(line.slice(1)); else if (line[0] === 'n' && pid) map.set(pid, line.slice(1)); }
  return map;
}
/** When a process started (ms), 0 if unknown. */
export async function startedAt(pid) {
  const out = await sh('ps', ['-o', 'lstart=', '-p', String(pid)], 5000, { env: { ...process.env, LC_ALL: 'C' } });
  return Date.parse(out.trim()) || 0;
}
/** Bytes a folder takes on disk. */
export async function folderBytes(p) { const out = await sh('du', ['-sk', p], 300000); return (Number(out.split('\t')[0]) || 0) * 1024; }
/** The app a process belongs to ("Google Chrome"), or null. */
export function appOf(comm) {
  if (comm.includes('native-binary/claude')) return 'Claude Code';
  const i = comm.indexOf('.app/');
  return i < 0 ? null : comm.slice(comm.lastIndexOf('/', i) + 1, i);
}
/** Claude Code's sign-in, read fresh each time and never kept: the login keychain item it writes. With
    CLAUDE_CONFIG_DIR set, Claude Code names the item after that folder ("Claude Code-credentials-1a2b3c4d"); dir: another
    account's folder (server/index.mjs, other accounts). */
export async function claudeLogin(dir = process.env.CLAUDE_CONFIG_DIR) {
  // (no fallback to the plain name when the folder is set: that item belongs to another account)
  const name = dir ? `Claude Code-credentials-${createHash('sha256').update(dir.normalize('NFC')).digest('hex').slice(0, 8)}` : 'Claude Code-credentials';
  for (const s of [name]) {
    const out = await sh('security', ['find-generic-password', '-s', s, '-w'], 15000);
    if (!out.trim()) continue;
    try { return JSON.parse(out).claudeAiOauth || null; } catch { /* not JSON */ }
  }
  return null;
}
