// Linux readings, straight from /proc (no ps, lsof or ss needed, so it also works in a slim container): processes from
// /proc/<pid>/stat, memory from /proc/meminfo and the kernel's pressure figures, TCP sockets from /proc/net/tcp(6),
// the disk from statfs, Claude Code's sign-in from ~/.claude/.credentials.json.
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { cpuFromDelta, kidsOf, readText, readdir, sh } from './shared.mjs';

export const NAME = 'Linux';
export const UID = process.getuid?.() ?? -1;   // (this module is also loaded, unused, on Windows)
const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
export const PATHS = {
  claudeTmp: `/tmp/claude-${UID}`,
  playwright: path.join(process.env.XDG_CACHE_HOME || path.join(HOME, '.cache'), 'ms-playwright'),
  npmCache: path.join(HOME, '.npm', '_cacache'),
  npmClean: [path.join(path.dirname(process.execPath), 'npm'), ['cache', 'clean', '--force']],
};

let consts = null;   // clock ticks a second, page size, boot time (unix s)
async function sys() {
  if (consts) return consts;
  const [tck, page, stat] = await Promise.all([sh('getconf', ['CLK_TCK'], 3000), sh('getconf', ['PAGESIZE'], 3000), readText('/proc/stat')]);
  consts = { hz: Number(tck) || 100, page: Number(page) || 4096, boot: Number(/^btime (\d+)/m.exec(stat)?.[1]) || Math.round(Date.now() / 1000 - os.uptime()) };
  return consts;
}
/** One /proc/<pid>/stat line: fields after the command name (which may hold spaces and brackets). */
export function parseStat(line) {
  const close = line.lastIndexOf(')');
  if (close < 0) return null;
  const name = line.slice(line.indexOf('(') + 1, close), f = line.slice(close + 2).split(' ');
  return { name, ppid: +f[1], pgid: +f[2], ticks: +f[11] + +f[12], startTicks: +f[19], rssPages: +f[21] };
}
const cpuState = { prev: null, at: 0 };
async function readProcs(full) {
  const { hz, page, boot } = await sys(), now = Date.now() / 1000, procs = new Map();
  const pids = (await readdir('/proc')).filter((d) => /^\d+$/.test(d));
  await Promise.all(pids.map(async (d) => {
    const base = `/proc/${d}`, st = parseStat(await readText(`${base}/stat`));
    if (!st) return;
    let uid = -1; try { uid = (await fsp.stat(base)).uid; } catch { return; }
    const start = Math.round(boot + st.startTicks / hz);
    const p = { pid: +d, ppid: st.ppid, pgid: st.pgid, uid, rss: st.rssPages * page, start, cpuSec: st.ticks / hz };
    if (full) {
      // the executable's path when it is ours to read (a process title such as "next-server (v16)" would hide "node")
      let exe = ''; try { exe = await fsp.readlink(`${base}/exe`); } catch { /* another user's */ }
      Object.assign(p, { comm: exe || st.name, args: (await readText(`${base}/cmdline`)).split('\0').filter(Boolean).join(' ') || st.name, up: Math.max(0, Math.round(now - start)), mem: p.rss });
    }
    procs.set(p.pid, p);
  }));
  return procs;
}
export async function processes() {
  const procs = await readProcs(true);
  cpuFromDelta(cpuState, procs);
  return { procs, kids: kidsOf(procs) };
}
export async function liteProcs() { return { procs: await readProcs(false) }; }
export const footprints = async () => new Map();   // RSS is the figure Linux has
export const footprintAt = () => 0;

/** kB lines of /proc/meminfo, in bytes */
export function parseMeminfo(text) {
  const kb = (k) => Number(new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(text)?.[1] || 0) * 1024;
  return { total: kb('MemTotal'), available: kb('MemAvailable') || kb('MemFree'), swapTotal: kb('SwapTotal'), swapFree: kb('SwapFree') };
}
export async function memory() {
  const [info, psi] = await Promise.all([readText('/proc/meminfo'), readText('/proc/pressure/memory')]);
  const m = parseMeminfo(info), total = m.total || os.totalmem(), used = Math.max(0, total - (m.available || os.freemem()));
  // the kernel's own pressure figures when it has them (share of time tasks stalled on memory), else how much is left
  const some = Number(/some avg10=([\d.]+)/.exec(psi)?.[1]), full = Number(/full avg10=([\d.]+)/.exec(psi)?.[1]);
  const left = 1 - used / total;
  const pressure = psi ? (full >= 5 || some >= 30 ? 'critical' : some >= 10 ? 'warn' : 'normal') : left < 0.08 ? 'critical' : left < 0.18 ? 'warn' : 'normal';
  return { total, used, compressed: 0, swapTotal: m.swapTotal, swapUsed: Math.max(0, m.swapTotal - m.swapFree), pressure };
}
export async function disk() {
  try { const s = await fsp.statfs('/'); const total = s.blocks * s.bsize, free = s.bavail * s.bsize; return { total, free, used: total - free }; }
  catch { return { total: 0, free: 0, used: 0 }; }
}
/** Rows of /proc/net/tcp and tcp6: { state ('0A' listening, '01' established), port, inode } */
export function parseNetTcp(text) {
  const out = [];
  for (const line of text.split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 10) continue;
    out.push({ state: f[3], port: parseInt(f[1].split(':').pop(), 16), inode: f[9] });
  }
  return out;
}
const tcpRows = async () => [...parseNetTcp(await readText('/proc/net/tcp')), ...parseNetTcp(await readText('/proc/net/tcp6'))];
export async function listeners() {
  const listen = new Map((await tcpRows()).filter((r) => r.state === '0A' && r.port).map((r) => [r.inode, r.port]));
  const map = new Map();
  if (!listen.size) return map;
  // which process holds each listening socket: look through our own processes' open files
  for (const d of (await readdir('/proc')).filter((x) => /^\d+$/.test(x))) {
    const fds = await readdir(`/proc/${d}/fd`);
    for (const fd of fds) {
      let link = ''; try { link = await fsp.readlink(`/proc/${d}/fd/${fd}`); } catch { continue; }
      const inode = /^socket:\[(\d+)\]$/.exec(link)?.[1];
      if (inode && listen.has(inode)) { const pid = +d; if (!map.has(pid)) map.set(pid, new Set()); map.get(pid).add(listen.get(inode)); }
    }
  }
  return map;
}
export async function established() {
  const ports = new Map();
  for (const r of await tcpRows()) if (r.state === '01' && r.port) ports.set(r.port, (ports.get(r.port) || 0) + 1);
  return ports;
}
export async function cwds(pids) {
  const map = new Map();
  await Promise.all(pids.map(async (pid) => { try { map.set(pid, await fsp.readlink(`/proc/${pid}/cwd`)); } catch { /* gone or not ours */ } }));
  return map;
}
export async function startedAt(pid) {
  const st = parseStat(await readText(`/proc/${pid}/stat`)); if (!st) return 0;
  const { hz, boot } = await sys();
  return Math.round((boot + st.startTicks / hz) * 1000);
}
export async function folderBytes(p) { const out = await sh('du', ['-sk', p], 300000); return (Number(out.split('\t')[0]) || 0) * 1024; }
export function appOf(comm) { return comm.includes('native-binary/claude') ? 'Claude Code' : null; }
/** Claude Code keeps its sign-in in a file on Linux (read fresh each time, never kept). */
export async function claudeLogin(dir = CLAUDE_DIR) {
  try { return JSON.parse(await readText(path.join(dir, '.credentials.json'))).claudeAiOauth || null; } catch { return null; }
}
