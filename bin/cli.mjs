#!/usr/bin/env node
// My Office command line: start the server, add/remove the Claude Code hooks, install the login service, and
// check that everything is wired ("doctor"). Settings are backed up before every change and written atomically.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPrefs } from '../server/prefs.mjs';
import { serviceFor } from './service.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = os.homedir();
const PORT = Number(process.env.OFFICE_PORT || 4310);
// Words in the office's language (data/prefs.json, picked in Settings; OFFICE_LANG until then), same folder as the server's.
// the server's data folder (OFFICE_DATA_DIR for a second copy; the launchd service and the hooks always use data/)
const DATA_DIR = process.env.OFFICE_DATA_DIR ? path.resolve(process.env.OFFICE_DATA_DIR) : path.join(ROOT, 'data');
const { tr } = createPrefs(DATA_DIR);
const minutesAgo = (ms) => tr('time.ago', { time: tr('time.min', { n: Math.max(0, Math.round((Date.now() - ms) / 60000)) }) });
const args = process.argv.slice(2), cmd = args[0] && !args[0].startsWith('-') ? args[0] : 'start';
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] || true : null; };
const SETTINGS = path.resolve(String(opt('--settings') || path.join(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'), 'settings.json')));
const EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest',
  'Notification', 'SubagentStart', 'SubagentStop', 'Stop', 'StopFailure', 'PreCompact'];
// The hooks post each event to the office: curl where the shell has it (macOS, Linux), a small node script on Windows.
// Paths use forward slashes there, which both cmd and Git Bash accept.
const WIN = process.platform === 'win32', fwd = (p) => p.replace(/\\/g, '/');
const SEND = WIN ? `"${fwd(process.execPath)}" "${fwd(path.join(ROOT, 'hooks', 'send.mjs'))}"` : '';
const hookCmd = (route, wait) => (WIN ? `${SEND} http://127.0.0.1:${PORT}${route}${wait ? '' : ' --async'}`
  : wait ? `curl -s --max-time 50 -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:${PORT}${route} || true`
    : `curl -s -m 2 -o /dev/null -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:${PORT}${route} || true`);
const EVENT_CMD = hookCmd('/event', false);
const PERM_CMD = hookCmd('/hook/permission', true);
// Claude's questions (AskUserQuestion) and plans (ExitPlanMode) are answered through PreToolUse, the documented way.
const ASK_CMD = hookCmd('/hook/question', true);
const ASK_MATCHER = 'AskUserQuestion|ExitPlanMode';
// Before each step, a quick word with the office (server/loops.mjs): a call that keeps failing the same way is blocked.
// 0.3 s at most, and nothing printed when the office is down or slow: the call goes ahead as if there were no hook.
const LOOP_CMD = WIN ? `${SEND} http://127.0.0.1:${PORT}/hook/loop --fast`
  : `curl -s -m 0.3 -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:${PORT}/hook/loop || true`;
// The status line feeds the plan's 5-hour / 7-day usage; an existing status line keeps running through ours.
const STATUS_SCRIPT = path.join(ROOT, 'hooks', 'status-line.mjs'), STATUS_PREV = path.join(ROOT, 'data', 'statusline-prev.json');
const STATUS_CMD = WIN ? `"${fwd(process.execPath)}" "${fwd(STATUS_SCRIPT)}"` : `"${process.execPath}" "${STATUS_SCRIPT}"`;
const oursStatus = (s) => typeof s?.command === 'string' && s.command.includes('status-line.mjs') && (s.command.includes(ROOT) || s.command.includes(fwd(ROOT)));
const ours = (h) => typeof h?.command === 'string' && h.command.includes(`127.0.0.1:${PORT}/`);
// --lan opens the server to the home wifi so a phone can watch (QR code or PIN). Off by default.
const LAN = args.includes('--lan');
const service = () => serviceFor({ root: ROOT, server: path.join(ROOT, 'server', 'index.mjs'), log: path.join(ROOT, 'data', 'server.log'), host: LAN ? '0.0.0.0' : '127.0.0.1', port: PORT });
const ok = (s) => console.log(`  ✓ ${s}`), warn = (s) => console.log(`  ⚠ ${s}`), bad = (s) => console.log(`  ✗ ${s}`);

async function readSettings() { try { return JSON.parse(await fsp.readFile(SETTINGS, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return {}; throw new Error(tr('cli.readFailed', { file: SETTINGS, error: e.message })); } }
async function writeSettings(cfg) {
  await fsp.mkdir(path.dirname(SETTINGS), { recursive: true });
  if (fs.existsSync(SETTINGS)) { const bak = `${SETTINGS}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`; await fsp.copyFile(SETTINGS, bak); console.log(`  ${tr('cli.backedUp', { file: bak })}`); }
  const tmp = `${SETTINGS}.tmp-${process.pid}`;
  await fsp.writeFile(tmp, JSON.stringify(cfg, null, 2) + '\n'); await fsp.rename(tmp, SETTINGS);
}
const SERVER = path.join(ROOT, 'server', 'index.mjs');
// The page is a Next.js build: make it once (and after an update) before the server can show the office.
function ensureBuild() {
  if (fs.existsSync(path.join(ROOT, '.next', 'BUILD_ID'))) return;
  console.log(tr('cli.building'));
  execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
}

async function install() {
  console.log(tr('cli.install.title'));
  const cfg = await readSettings(); cfg.hooks ||= {};
  let added = 0;
  for (const ev of EVENTS) {
    const list = (cfg.hooks[ev] ||= []);
    if (!list.some((e) => (e.hooks || []).some((h) => ours(h) && h.command.includes('/event')))) { list.push({ hooks: [{ type: 'command', command: EVENT_CMD, timeout: 5, async: true }] }); added++; }
  }
  const perm = (cfg.hooks.PermissionRequest ||= []);
  if (!args.includes('--no-approve') && !perm.some((e) => (e.hooks || []).some((h) => ours(h) && h.command.includes('/hook/permission')))) { perm.push({ hooks: [{ type: 'command', command: PERM_CMD, timeout: 55 }] }); added++; }
  const pre = (cfg.hooks.PreToolUse ||= []);
  if (!args.includes('--no-approve') && !pre.some((e) => (e.hooks || []).some((h) => ours(h) && h.command.includes('/hook/question')))) { pre.push({ matcher: ASK_MATCHER, hooks: [{ type: 'command', command: ASK_CMD, timeout: 55 }] }); added++; }
  if (!args.includes('--no-loop-guard') && !pre.some((e) => (e.hooks || []).some((h) => ours(h) && h.command.includes('/hook/loop')))) { pre.push({ hooks: [{ type: 'command', command: LOOP_CMD, timeout: 2 }] }); added++; }
  if (!args.includes('--no-status') && !oursStatus(cfg.statusLine)) {
    if (cfg.statusLine?.command) { await fsp.mkdir(path.dirname(STATUS_PREV), { recursive: true }); await fsp.writeFile(STATUS_PREV, JSON.stringify(cfg.statusLine)); ok(tr('cli.install.statusKept')); }
    cfg.statusLine = { type: 'command', command: STATUS_CMD, ...(cfg.statusLine?.padding != null ? { padding: cfg.statusLine.padding } : {}) };
    added++;
  }
  if (added) { await writeSettings(cfg); ok(tr('cli.install.added', { n: added, file: SETTINGS })); } else ok(tr('cli.install.already'));
  if (args.includes('--service') && !opt('--settings')) {
    await fsp.mkdir(path.join(ROOT, 'data'), { recursive: true });
    ensureBuild();
    const svc = service();
    if (await svc.install()) ok(tr('cli.install.service', { file: svc.file })); else warn(tr('cli.install.noService'));
    LAN ? warn(tr('cli.install.lan')) : ok(tr('cli.install.local'));
  }
  console.log(`\n${tr('cli.install.next', { port: PORT })}`);
}
async function uninstall() {
  console.log(tr('cli.uninstall.title'));
  const cfg = await readSettings(); let removed = 0;
  for (const [ev, list] of Object.entries(cfg.hooks || {})) {
    const kept = list.map((e) => ({ ...e, hooks: (e.hooks || []).filter((h) => !ours(h)) })).filter((e) => e.hooks.length);
    removed += list.reduce((n, e) => n + (e.hooks || []).filter(ours).length, 0);
    if (kept.length) cfg.hooks[ev] = kept; else delete cfg.hooks[ev];
  }
  if (oursStatus(cfg.statusLine)) {
    let prev = null; try { prev = JSON.parse(await fsp.readFile(STATUS_PREV, 'utf8')); } catch { /* none */ }
    if (prev?.command) cfg.statusLine = prev; else delete cfg.statusLine;
    await fsp.rm(STATUS_PREV, { force: true }); removed++;
  }
  if (removed) { await writeSettings(cfg); ok(tr('cli.uninstall.removed', { n: removed, file: SETTINGS })); } else ok(tr('cli.uninstall.none'));
  // The login service is machine-wide: only touch it when working on the real settings (not a --settings copy).
  if (!opt('--settings') && (await service().uninstall())) ok(tr('cli.uninstall.service'));
  if (!opt('--settings') && unwrapEditors()) ok(tr('cli.uninstall.editors'));
}
// the editors' Claude Code started through the office's account script (the plan card's "Use" / switching): taken out,
// or Claude Code wouldn't start once the office is gone
function unwrapEditors() {
  const script = path.join(DATA_DIR, 'claude-switch.sh'), home = os.homedir(), key = 'claudeCode.claudeProcessWrapper';
  const base = process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support') : path.join(home, '.config');
  let n = 0;
  for (const app of ['Code', 'Code - Insiders', 'Cursor', 'Windsurf', 'Antigravity', 'Antigravity IDE', 'Kiro', 'Trae', 'Positron']) {
    try {
      const f = fs.realpathSync(path.join(base, app, 'User', 'settings.json')), cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (cfg[key] !== script) continue;
      delete cfg[key]; fs.writeFileSync(f, `${JSON.stringify(cfg, null, 4)}\n`); n++;
    } catch { /* no such editor, or a file with comments */ }
  }
  try { fs.writeFileSync(path.join(DATA_DIR, 'account-now'), '\n'); } catch { /* none */ }
  return n;
}
async function doctor() {
  console.log(`${tr('cli.doctor.title')}\n`);
  const major = Number(process.versions.node.split('.')[0]);
  major >= 20 ? ok(`Node ${process.versions.node}`) : bad(tr('cli.doctor.nodeOld', { version: process.versions.node }));
  if (!WIN) { try { execFileSync('curl', ['--version'], { stdio: 'ignore' }); ok(tr('cli.doctor.curl')); } catch { bad(tr('cli.doctor.noCurl')); } }
  let info = null;
  try { const r = await fetch(`http://127.0.0.1:${PORT}/api/doctor`); info = await r.json(); ok(tr('cli.doctor.serverUp', { port: PORT, time: tr('time.min', { n: Math.round(info.uptime / 60) }) })); }
  catch { bad(tr('cli.doctor.serverDown', { port: PORT })); }
  const cfg = await readSettings().catch((e) => (bad(e.message), {}));
  const have = EVENTS.filter((ev) => (cfg.hooks?.[ev] || []).some((e) => (e.hooks || []).some((h) => ours(h) && h.command.includes('/event'))));
  have.length === EVENTS.length ? ok(tr('cli.doctor.hooksAll', { n: EVENTS.length, file: SETTINGS })) : warn(tr('cli.doctor.hooksSome', { have: have.length, total: EVENTS.length, missing: EVENTS.filter((e) => !have.includes(e)).join(', ') }));
  const perm = (cfg.hooks?.PermissionRequest || []).some((e) => (e.hooks || []).some((h) => ours(h) && h.command.includes('/hook/permission')));
  perm ? ok(tr('cli.doctor.perm')) : warn(tr('cli.doctor.noPerm'));
  const ask = (cfg.hooks?.PreToolUse || []).some((e) => (e.hooks || []).some((h) => ours(h) && h.command.includes('/hook/question')));
  ask ? ok(tr('cli.doctor.ask')) : warn(tr('cli.doctor.noAsk'));
  const loop = (cfg.hooks?.PreToolUse || []).some((e) => (e.hooks || []).some((h) => ours(h) && h.command.includes('/hook/loop')));
  loop ? ok(tr('cli.doctor.loop')) : warn(tr('cli.doctor.noLoop'));
  oursStatus(cfg.statusLine) ? ok(tr('cli.doctor.status')) : warn(tr('cli.doctor.noStatus'));
  if (info) {
    if (!info.lastEventAt) warn(tr('cli.doctor.noEvents'));
    else ok(tr('cli.doctor.lastEvent', { ago: minutesAgo(info.lastEventAt), n: info.sessions }));
    if (oursStatus(cfg.statusLine)) {
      if (info.limitsAt) ok(tr('cli.doctor.limits', { ago: minutesAgo(info.limitsAt) }));
      else if (info.statusAt) warn(tr('cli.doctor.noLimits'));
      else warn(tr('cli.doctor.statusSilent'));
    }
  }
  const svc = service(), st = await svc.state();
  if (st === 'running') ok(tr('cli.doctor.serviceUp'));
  else if (st === 'stopped') warn(tr('cli.doctor.serviceDown', { restart: svc.restart }));
  else warn(tr('cli.doctor.noService'));
}
async function pin() {
  const file = path.join(DATA_DIR, 'pin');
  if (args.includes('--new') || !fs.existsSync(file)) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const { randomInt } = await import('node:crypto');
    await fsp.writeFile(file, String(randomInt(0, 1e6)).padStart(6, '0'), { mode: 0o600 });
    if (args.includes('--new')) ok(tr('cli.pin.changed'));
  }
  const p = (await fsp.readFile(file, 'utf8')).trim();
  const shown = p.length % 4 === 0 && p.length % 3 ? p.match(/\d{4}/g).join(' ') : p.replace(/\d{3}(?=\d{2})/g, '$& ');   // (as the phone window shows it)
  console.log(`  ${tr('cli.pin.show', { pin: shown })}`);
}
function start() {
  if (LAN) process.env.OFFICE_HOST = '0.0.0.0';
  ensureBuild();
  process.env.NODE_ENV ||= 'production';
  return import(SERVER);
}
const run = { start, install, uninstall, doctor, pin }[cmd];
if (!run) { console.log(tr('cli.usage')); process.exit(1); }
Promise.resolve(run()).catch((e) => { console.error(tr('cli.error', { message: e.message })); process.exit(1); });
