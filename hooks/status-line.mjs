#!/usr/bin/env node
// Claude Code statusLine → My Office. Claude Code runs this on every status refresh with JSON on stdin (fields
// documented at code.claude.com/docs/en/statusline). We forward the plan's 5-hour / 7-day usage, the exact context
// window and the session cost to the office, then print a status line. If you had a status line before installing,
// that command still runs with the same input and its output is what you see. Idea from W17ant/Claude-Office (MIT).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPrefs } from '../server/prefs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OFFICE_PORT || 4310);

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const raw = Buffer.concat(chunks).toString('utf8');
let d = {};
try { d = JSON.parse(raw) || {}; } catch { /* print the default line anyway */ }

// Only what the office uses; a stopped office costs nothing (400 ms cap, errors ignored).
const body = JSON.stringify({ session_id: d.session_id, rate_limits: d.rate_limits, context_window: d.context_window, cost: d.cost });
const forward = fetch(`http://127.0.0.1:${PORT}/hook/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(400) }).catch(() => {});

let prev = null;
try { prev = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'statusline-prev.json'), 'utf8')); } catch { /* none */ }
const chained = prev?.command ? new Promise((resolve) => {
  const child = spawn(prev.command, { shell: true, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });   // sh on macOS / Linux, cmd on Windows
  let out = '';
  const timer = setTimeout(() => child.kill(), 3000);
  child.stdout.on('data', (c) => { out += c; });
  child.on('close', () => { clearTimeout(timer); resolve(out); });
  child.on('error', () => { clearTimeout(timer); resolve(''); });
  child.stdin.end(raw);
}) : Promise.resolve('');

const [, prevOut] = await Promise.all([forward, chained]);
if (prevOut.trim()) { process.stdout.write(prevOut); process.exit(0); }
const pct = (v) => (typeof v === 'number' ? `${Math.round(v)}%` : null);
const parts = [d.model?.display_name || 'Claude'];
const { tr } = createPrefs(path.join(ROOT, 'data'));   // in the office's language
const ctx = pct(d.context_window?.used_percentage); if (ctx) parts.push(tr('cli.status.context', { pct: ctx }));
const five = pct(d.rate_limits?.five_hour?.used_percentage); if (five) parts.push(tr('cli.status.fiveHour', { pct: five }));
const seven = pct(d.rate_limits?.seven_day?.used_percentage); if (seven) parts.push(tr('cli.status.week', { pct: seven }));
process.stdout.write(parts.join(' · ') + '\n');
