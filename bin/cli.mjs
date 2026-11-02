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
import { addOtel, collectorSnippet, managedEnvs, otelOwner, removeOtel } from '../server/otel-setup.mjs';
import { dataDir } from '../server/data-dir.mjs';
import { buildVsix, installPanel, uninstallPanel, panelIn } from '../server/vsix.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = os.homedir();
const PORT = Number(process.env.OFFICE_PORT || 4310);
// Words in the office's language (data/prefs.json, picked in Settings; OFFICE_LANG until then), same folder as the server's.
// the server's data folder (OFFICE_DATA_DIR for a second copy; the background service and the hooks always use the default
// one: data/ here, or ~/.my-office when npm installed the office: server/data-dir.mjs)
const DATA_DIR = dataDir(ROOT);
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
// A call auto mode refused (PermissionDenied): a card in the office, and while one is open, a moment to let Claude retry.
const DENY_CMD = hookCmd('/hook/denied', true);
// Before each step, a quick word with the office (server/loops.mjs): a call that keeps failing the same way is blocked.
// 0.3 s at most, and nothing printed when the office is down or slow: the call goes ahead as if there were no hook.
const LOOP_CMD = WIN ? `${SEND} http://127.0.0.1:${PORT}/hook/loop --fast`
  : `curl -s -m 0.3 -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:${PORT}/hook/loop || true`;
// After Claude Code compacts a conversation (SessionStart, source "compact"): what you pinned for it, said again. A few
// seconds at most, nothing printed when the office is down: the conversation goes on as if there were no hook.
const START_CMD = WIN ? `${SEND} http://127.0.0.1:${PORT}/hook/start --wait 3`
  : `curl -s -m 3 -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:${PORT}/hook/start || true`;
// The status line feeds the plan's 5-hour / 7-day usage; an existing status line keeps running through ours.
const STATUS_SCRIPT = path.join(ROOT, 'hooks', 'status-line.mjs'), STATUS_PREV = path.join(dataDir(ROOT, {}), 'statusline-prev.json');
const STATUS_CMD = WIN ? `"${fwd(process.execPath)}" "${fwd(STATUS_SCRIPT)}"` : `"${process.execPath}" "${STATUS_SCRIPT}"`;
const oursStatus = (s) => typeof s?.command === 'string' && s.command.includes('status-line.mjs') && (s.command.includes(ROOT) || s.command.includes(fwd(ROOT)));
const ours = (h) => typeof h?.command === 'string' && h.command.includes(`127.0.0.1:${PORT}/`);
// --lan opens the server to the home wifi so a phone can watch (QR code or PIN). Off by default.
const LAN = args.includes('--lan');
const service = () => serviceFor({ root: ROOT, server: path.join(ROOT, 'server', 'index.mjs'), log: path.join(dataDir(ROOT, {}), 'server.log'), host: LAN ? '0.0.0.0' : '127.0.0.1', port: PORT });
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
  const start = (cfg.hooks.SessionStart ||= []);
  if (!args.includes('--no-pins') && !start.some((e) => (e.hooks || []).some((h) => ours(h) && h.command.includes('/hook/start')))) { start.push({ matcher: 'compact', hooks: [{ type: 'command', command: START_CMD, timeout: 5 }] }); added++; }
  const denied = (cfg.hooks.PermissionDenied ||= []);
  if (!args.includes('--no-approve') && !denied.some((e) => (e.hooks || []).some((h) => ours(h) && h.command.includes('/hook/denied')))) { denied.push({ hooks: [{ type: 'command', command: DENY_CMD, timeout: 45 }] }); added++; }
  if (!args.includes('--no-status') && !oursStatus(cfg.statusLine)) {
    if (cfg.statusLine?.command) { await fsp.mkdir(path.dirname(STATUS_PREV), { recursive: true }); await fsp.writeFile(STATUS_PREV, JSON.stringify(cfg.statusLine)); ok(tr('cli.install.statusKept')); }
    cfg.statusLine = { type: 'command', command: STATUS_CMD, ...(cfg.statusLine?.padding != null ? { padding: cfg.statusLine.padding } : {}) };
    added++;
  }
  // "What eats the plan": Claude Code's own telemetry, to this office only, unless you already send it somewhere
  let otel = { added: 0, theirs: null };
  if (!args.includes('--no-otel')) otel = addOtel(cfg, PORT, { names: !args.includes('--no-otel-names'), shell: process.env, managed: managedEnvs(), file: SETTINGS });
  if (added || otel.added) { await writeSettings(cfg); if (added) ok(tr('cli.install.added', { n: added, file: SETTINGS })); } else ok(tr('cli.install.already'));
  if (otel.added) ok(tr('cli.install.otel', { file: SETTINGS }));
  if (otel.theirs) { warn(tr('cli.install.otelTheirs', { where: otel.theirs.join('; ') })); console.log(`\n${collectorSnippet(PORT).replace(/^/gm, '    ')}\n`); }
  if (args.includes('--service') && !opt('--settings')) {
    await fsp.mkdir(dataDir(ROOT, {}), { recursive: true });
    ensureBuild();
    const svc = service();
    if (await svc.install()) ok(tr('cli.install.service', { file: svc.file })); else warn(tr('cli.install.noService'));
    LAN ? warn(tr('cli.install.lan')) : ok(tr('cli.install.local'));
  }
  if (!args.includes('--no-panel') && !opt('--settings')) await panel();
  if (!args.includes('--no-menubar') && !opt('--settings') && process.platform === 'darwin') menubar();
  console.log(`\n${tr('cli.install.next', { port: PORT })}`);
}
/* The Mac's menu bar icon (menubar/MyOfficeBar.swift): built here with the Swift compiler of Xcode's command line tools
   into an app of its own in the data folder (no Dock icon; it may talk to 127.0.0.1), signed for this Mac only, and
   started; the office starts it again each time it starts. Its logo (menubar/AppIcon.icns, the building of app/icon.svg)
   is what macOS shows on its notifications. macOS remembers an app's logo for notifications by its identifier the first
   time it meets it: the first builds had no logo, so it kept a blank square under com.my-office.menubar however the
   app changed. Hence a new identifier; changing the logo again later needs another one. */
const MENUBAR_APP = path.join(dataDir(ROOT, {}), 'menubar', 'My Office.app'), MENUBAR_BIN = 'My Office.app/Contents/MacOS/MyOfficeBar';
const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.my-office.bar</string>
  <key>CFBundleName</key><string>My Office</string>
  <key>CFBundleDisplayName</key><string>My Office</string>
  <key>CFBundleExecutable</key><string>MyOfficeBar</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
`;
function menubar() {
  try { execFileSync('xcrun', ['--find', 'swiftc'], { stdio: 'ignore' }); } catch { warn(tr('cli.install.noSwift')); return; }
  const mac = path.join(MENUBAR_APP, 'Contents', 'MacOS');
  try {
    fs.mkdirSync(mac, { recursive: true });
    execFileSync('xcrun', ['swiftc', '-O', '-o', path.join(mac, 'MyOfficeBar'), path.join(ROOT, 'menubar', 'MyOfficeBar.swift')], { stdio: 'ignore', timeout: 300_000 });
    fs.writeFileSync(path.join(MENUBAR_APP, 'Contents', 'Info.plist'), PLIST);
    fs.mkdirSync(path.join(MENUBAR_APP, 'Contents', 'Resources'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'menubar', 'AppIcon.icns'), path.join(MENUBAR_APP, 'Contents', 'Resources', 'AppIcon.icns'));
    execFileSync('codesign', ['-s', '-', '--force', MENUBAR_APP], { stdio: 'ignore' });
  } catch { warn(tr('cli.install.menubarFailed')); return; }
  // tell macOS the app changed, so notifications pick up the new logo instead of the blank one it remembered
  try { execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', MENUBAR_APP], { stdio: 'ignore', timeout: 15_000 }); } catch { /* only the logo waits */ }
  try { execFileSync('pkill', ['-f', MENUBAR_BIN], { stdio: 'ignore' }); } catch { /* not running */ }
  // `open` right after pkill fails (-600) while the old copy is still quitting, which left no icon at all: wait it out
  const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  for (let i = 0; i < 25; i++) { try { execFileSync('pgrep', ['-f', MENUBAR_BIN], { stdio: 'ignore' }); nap(200); } catch { break; } }
  for (let i = 0; i < 3; i++) {
    try { execFileSync('open', ['-g', MENUBAR_APP, '--args', String(PORT)], { stdio: 'ignore', timeout: 15_000 }); break; } catch { nap(1000); }   // else the office starts it next time
  }
  ok(tr('cli.install.menubar'));
}
// the small panel in the side bar of each editor on this computer (vscode-extension/, packed by server/vsix.mjs)
async function panel() {
  let vsix;
  try { vsix = buildVsix(path.join(ROOT, 'vscode-extension'), path.join(dataDir(ROOT, {}), 'my-office-panel.vsix')); } catch { warn(tr('cli.install.noPanel')); return; }
  const done = await installPanel(vsix);
  for (const e of done) e.ok ? ok(tr('cli.install.panel', { app: e.app })) : warn(tr('cli.install.panelFailed', { app: e.app }));
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
  const otel = removeOtel(cfg);   // (only the keys install added, still as it wrote them)
  if (otel.kept.length) warn(tr('cli.uninstall.otelKept', { keys: otel.kept.join(', ') }));
  if (removed || otel.removed) { await writeSettings(cfg); ok(tr('cli.uninstall.removed', { n: removed + otel.removed, file: SETTINGS })); } else ok(tr('cli.uninstall.none'));
  // The login service is machine-wide: only touch it when working on the real settings (not a --settings copy).
  if (!opt('--settings') && (await service().uninstall())) ok(tr('cli.uninstall.service'));
  if (!opt('--settings') && unwrapEditors()) ok(tr('cli.uninstall.editors'));
  if (!opt('--settings')) for (const e of await uninstallPanel()) if (e.ok) ok(tr('cli.uninstall.panel', { app: e.app }));
  if (!opt('--settings') && fs.existsSync(MENUBAR_APP)) {
    try { execFileSync('pkill', ['-f', MENUBAR_BIN], { stdio: 'ignore' }); } catch { /* not running */ }
    fs.rmSync(path.dirname(MENUBAR_APP), { recursive: true, force: true }); ok(tr('cli.uninstall.menubar'));
  }
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
  const pinsHook = (cfg.hooks?.SessionStart || []).some((e) => (e.hooks || []).some((h) => ours(h) && h.command.includes('/hook/start')));
  pinsHook ? ok(tr('cli.doctor.pins')) : warn(tr('cli.doctor.noPins'));
  const deny = (cfg.hooks?.PermissionDenied || []).some((e) => (e.hooks || []).some((h) => ours(h) && h.command.includes('/hook/denied')));
  deny ? ok(tr('cli.doctor.denied')) : warn(tr('cli.doctor.noDenied'));
  oursStatus(cfg.statusLine) ? ok(tr('cli.doctor.status')) : warn(tr('cli.doctor.noStatus'));
  const own = otelOwner({ settings: cfg, file: SETTINGS, shell: process.env, managed: managedEnvs() });
  if (own.state === 'ours') ok(tr('cli.doctor.otel'));
  else if (own.state === 'theirs') warn(tr('cli.doctor.otelTheirs', { where: own.where.join('; ') }));
  else warn(tr('cli.doctor.noOtel'));
  if (info) {
    if (!info.lastEventAt) warn(tr('cli.doctor.noEvents'));
    else ok(tr('cli.doctor.lastEvent', { ago: minutesAgo(info.lastEventAt), n: info.sessions }));
    const otelAt = Math.max(info.otel?.lastMetricsAt || 0, info.otel?.lastLogsAt || 0);
    if (own.state !== 'none') otelAt ? ok(tr('cli.doctor.otelAt', { ago: minutesAgo(otelAt) })) : warn(tr('cli.doctor.otelSilent'));
    if (oursStatus(cfg.statusLine)) {
      if (info.limitsAt) ok(tr('cli.doctor.limits', { ago: minutesAgo(info.limitsAt) }));
      else if (info.statusAt) warn(tr('cli.doctor.noLimits'));
      else warn(tr('cli.doctor.statusSilent'));
    }
  }
  const inEditors = panelIn();
  inEditors.length ? ok(tr('cli.doctor.panel', { apps: inEditors.join(', ') })) : warn(tr('cli.doctor.noPanel'));
  if (process.platform === 'darwin') fs.existsSync(MENUBAR_APP) ? ok(tr('cli.doctor.menubar')) : warn(tr('cli.doctor.noMenubar'));
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
