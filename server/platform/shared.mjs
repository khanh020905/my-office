// Helpers every platform module uses: running a command quietly, reading a file or folder that may be gone.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fsp from 'node:fs/promises';

const exec = promisify(execFile);
/** stdout of a command, '' if it failed or timed out (never throws). */
export async function sh(cmd, args, timeout = 15000, opts = {}) {
  try { return (await exec(cmd, args, { maxBuffer: 64 * 1024 * 1024, timeout, windowsHide: true, ...opts })).stdout; }
  catch (e) { return e.stdout || ''; }
}
export const readText = async (p) => { try { return await fsp.readFile(p, 'utf8'); } catch { return ''; } };
export const readdir = async (p) => { try { return await fsp.readdir(p); } catch { return []; } };
// "[[dd-]hh:]mm:ss" (ps etime / time) in seconds
export function parseEtime(s) {
  let days = 0;
  if (s.includes('-')) { const [d, rest] = s.split('-'); days = Number(d); s = rest; }
  const p = s.split(':').map(Number);
  while (p.length < 3) p.unshift(0);
  return days * 86400 + p[0] * 3600 + p[1] * 60 + p[2];
}
/** parent pid -> child pids */
export function kidsOf(procs) {
  const kids = new Map();
  for (const p of procs.values()) { if (!kids.has(p.ppid)) kids.set(p.ppid, []); kids.get(p.ppid).push(p.pid); }
  return kids;
}
/** Instant CPU % per process from the change in its CPU seconds since the last reading (Linux and Windows have no
    recent-average figure of their own). `state` keeps the previous reading between calls. */
export function cpuFromDelta(state, procs) {
  const now = Date.now(), prev = state.prev, dt = (now - state.at) / 1000;
  for (const p of procs.values()) {
    const before = prev?.get(`${p.pid}:${p.start}`);
    p.cpu = before != null && dt > 0.5 ? Math.max(0, Math.round(((p.cpuSec - before) / dt) * 1000) / 10) : 0;
  }
  state.prev = new Map([...procs.values()].map((p) => [`${p.pid}:${p.start}`, p.cpuSec])); state.at = now;
}
