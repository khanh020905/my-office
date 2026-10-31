// Windows readings: one PowerShell run per reading (CIM for processes and the page file, Get-NetTCPConnection for
// sockets: its states are numbers, so a German or Vietnamese Windows reads the same), shared for two seconds because
// starting PowerShell takes a moment. Windows has no user ids or process groups: a process's "uid" is its session
// (services run in session 0) and each process is its own group. Claude Code keeps its sign-in in a file here.
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { cpuFromDelta, kidsOf, readText, sh } from './shared.mjs';

export const NAME = 'Windows';
const HOME = os.homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude');
const LOCAL = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
export const PATHS = {
  claudeTmp: path.join(os.tmpdir(), 'claude'),
  playwright: path.join(LOCAL, 'ms-playwright'),
  npmCache: path.join(LOCAL, 'npm-cache', '_cacache'),
  // npm.cmd cannot be started without a shell: run npm's own script with this node instead
  npmClean: [process.execPath, [path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'), 'cache', 'clean', '--force']],
};
export let UID = -1;   // this server's session, known after the first reading

const SCRIPT = `$ErrorActionPreference='SilentlyContinue'
$e=[datetime]'1970-01-01'
$p=Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ i=$_.ProcessId; pp=$_.ParentProcessId; n=$_.Name; x=$_.ExecutablePath; c=$_.CommandLine; w=$_.WorkingSetSize; t=[double]($_.KernelModeTime+$_.UserModeTime); s=$(if($_.CreationDate){[int64]($_.CreationDate.ToUniversalTime()-$e).TotalSeconds}else{0}); se=$_.SessionId } }
$f=Get-CimInstance Win32_PageFileUsage | Measure-Object -Property AllocatedBaseSize,CurrentUsage -Sum
$t=Get-NetTCPConnection | ForEach-Object { [pscustomobject]@{ l=$_.LocalPort; s=[int]$_.State; o=$_.OwningProcess } }
[pscustomobject]@{ p=@($p); fa=($f|Where-Object Property -eq 'AllocatedBaseSize').Sum; fu=($f|Where-Object Property -eq 'CurrentUsage').Sum; t=@($t) } | ConvertTo-Json -Compress -Depth 3`;
const LISTEN = 2, ESTABLISHED = 5;   // MSFT_NetTCPConnection.State

/** The parsed reading: procs (Map), page file (bytes), TCP rows. Exported for tests. */
export function parseReading(json, now = Date.now()) {
  let j; try { j = JSON.parse(json); } catch { return null; }
  const procs = new Map(), list = Array.isArray(j.p) ? j.p : j.p ? [j.p] : [];
  for (const r of list) {
    if (!r || r.i == null) continue;
    const start = Number(r.s) || 0;
    procs.set(r.i, { pid: r.i, ppid: r.pp ?? 0, pgid: r.i, uid: r.se ?? 0, rss: Number(r.w) || 0, mem: Number(r.w) || 0, start,
      up: start ? Math.max(0, Math.round(now / 1000 - start)) : 0, cpuSec: (Number(r.t) || 0) / 1e7, comm: r.x || r.n || '', args: r.c || r.n || '' });
  }
  const tcp = (Array.isArray(j.t) ? j.t : j.t ? [j.t] : []).map((r) => ({ port: Number(r.l), state: Number(r.s), pid: Number(r.o) }));
  return { procs, pageTotal: (Number(j.fa) || 0) * 1024 ** 2, pageUsed: (Number(j.fu) || 0) * 1024 ** 2, tcp };
}
let last = null, lastAt = 0, reading = null;
const cpuState = { prev: null, at: 0 };
function read() {
  if (last && Date.now() - lastAt < 2000) return Promise.resolve(last);
  reading ??= sh('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], 30000).then((out) => {
    const r = parseReading(out);
    if (r) {
      cpuFromDelta(cpuState, r.procs);
      const me = r.procs.get(process.pid); if (me) UID = me.uid;
      last = r; lastAt = Date.now();
    }
    return last || { procs: new Map(), pageTotal: 0, pageUsed: 0, tcp: [] };
  }).finally(() => { reading = null; });
  return reading;
}
export async function processes() { const r = await read(); return { procs: r.procs, kids: kidsOf(r.procs) }; }
export async function liteProcs() { return { procs: (await read()).procs }; }
export const footprints = async () => new Map();
export const footprintAt = () => 0;
export async function memory() {
  const r = await read(), total = os.totalmem(), used = total - os.freemem(), left = 1 - used / total;
  return { total, used, compressed: 0, swapTotal: r.pageTotal, swapUsed: r.pageUsed, pressure: left < 0.08 ? 'critical' : left < 0.18 ? 'warn' : 'normal' };
}
// the battery: not read on Windows (the e-scooters' gauges in the street are hidden there)
export async function battery() { return null; }
export async function disk() {
  try { const s = await fsp.statfs(`${process.env.SystemDrive || 'C:'}\\`); const total = s.blocks * s.bsize, free = s.bavail * s.bsize; return { total, free, used: total - free }; }
  catch { return { total: 0, free: 0, used: 0 }; }
}
export async function listeners() {
  const map = new Map();
  for (const t of (await read()).tcp) if (t.state === LISTEN && t.port && t.pid) { if (!map.has(t.pid)) map.set(t.pid, new Set()); map.get(t.pid).add(t.port); }
  return map;
}
export async function established() {
  const ports = new Map();
  for (const t of (await read()).tcp) if (t.state === ESTABLISHED && t.port) ports.set(t.port, (ports.get(t.port) || 0) + 1);
  return ports;
}
export async function cwds() { return new Map(); }   // Windows does not show another process's working folder
export async function startedAt(pid) { const p = (await read()).procs.get(pid); return p?.start ? p.start * 1000 : 0; }
/** Bytes in a folder, walked in JavaScript (no du on Windows). */
export async function folderBytes(p) {
  let total = 0;
  const walk = async (d) => {
    let items = []; try { items = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const f = path.join(d, it.name);
      if (it.isDirectory()) await walk(f); else if (it.isFile()) { try { total += (await fsp.stat(f)).size; } catch { /* gone */ } }
    }
  };
  await walk(p);
  return total;
}
export function appOf() { return null; }
export async function claudeLogin(dir = CLAUDE_DIR) {
  try { return JSON.parse(await readText(path.join(dir, '.credentials.json'))).claudeAiOauth || null; } catch { return null; }
}
