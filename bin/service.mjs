// Running the office in the background from login, one way per operating system:
//   macOS:   a launchd agent (~/Library/LaunchAgents/com.my-office.plist), restarted if it stops
//   Linux:   a systemd user service (~/.config/systemd/user/my-office.service), restarted on failure
//   Windows: a script in the Startup folder that starts the server without a window at sign-in
// Each returns the same shape: { file, install(), uninstall(), state() → 'running' | 'stopped' | 'missing', restart }.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const run = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); } catch (e) { return e.stdout || ''; } };
const has = (cmd) => { try { execFileSync(cmd, ['--version'], { stdio: 'ignore', windowsHide: true }); return true; } catch { return false; } };

/** @param {{ root: string, server: string, log: string, host: string, port: number }} o */
export function serviceFor({ root, server, log, host, port }) {
  const node = process.execPath, home = os.homedir();
  const env = { OFFICE_HOST: host, NODE_ENV: 'production' };
  const up = async () => { try { return (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };

  if (process.platform === 'darwin') {
    // (named com.claude-office until 28/10/2026: such an install is still found, and moved to the new name by install)
    const plist = (l) => path.join(home, 'Library', 'LaunchAgents', `${l}.plist`), OLD = 'com.claude-office', dom = `gui/${process.getuid()}`;
    const LABEL = !fs.existsSync(plist('com.my-office')) && fs.existsSync(plist(OLD)) ? OLD : 'com.my-office', file = plist(LABEL);
    const xmlEnv = Object.entries(env).map(([k, v]) => `<key>${k}</key><string>${v}</string>`).join('');
    return {
      file, restart: `launchctl kickstart -k ${dom}/${LABEL}`,
      async install() {
        if (fs.existsSync(plist(OLD))) { run('launchctl', ['bootout', `${dom}/${OLD}`]); await fsp.rm(plist(OLD), { force: true }); }
        const LABEL = 'com.my-office', file = plist(LABEL);
        await fsp.mkdir(path.dirname(file), { recursive: true });
        await fsp.writeFile(file, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${node}</string><string>${server}</string></array>
  <key>EnvironmentVariables</key><dict>${xmlEnv}</dict>
  <key>WorkingDirectory</key><string>${root}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${log}</string>
  <key>StandardErrorPath</key><string>${log}</string>
</dict>
</plist>
`);
        run('launchctl', ['bootout', `${dom}/${LABEL}`]);
        run('launchctl', ['bootstrap', dom, file]);
        return true;
      },
      async uninstall() { let any = false; for (const l of [OLD, 'com.my-office']) if (fs.existsSync(plist(l))) { run('launchctl', ['bootout', `${dom}/${l}`]); await fsp.rm(plist(l)); any = true; } return any; },
      async state() { if (/state = running/.test(run('launchctl', ['print', `${dom}/${LABEL}`]))) return 'running'; return fs.existsSync(file) ? 'stopped' : 'missing'; },
    };
  }

  if (process.platform === 'win32') {
    const startup = path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    const file = path.join(startup, 'My Office.vbs'), old = path.join(startup, 'Claude Office.vbs'), q = (s) => s.replace(/"/g, '""');   // (old: the name until 28/10/2026)
    return {
      file, restart: `wscript "${file}"`,
      async install() {
        await fsp.mkdir(startup, { recursive: true }); await fsp.rm(old, { force: true });
        await fsp.writeFile(file, [
          "' My Office: starts the office server at sign-in, without a window. Remove this file to stop that.",
          'Set sh = CreateObject("WScript.Shell")',
          'Set env = sh.Environment("Process")',
          ...Object.entries({ ...env, OFFICE_LOG: log }).map(([k, v]) => `env("${k}") = "${q(v)}"`),
          `sh.CurrentDirectory = "${q(root)}"`,
          `sh.Run """${q(node)}"" ""${q(server)}""", 0, False`,
          '',
        ].join('\r\n'));
        if (!(await up())) spawn('wscript.exe', [file], { detached: true, stdio: 'ignore', windowsHide: true }).unref();   // and start it now
        return true;
      },
      async uninstall() { await fsp.rm(old, { force: true }); if (!fs.existsSync(file)) return false; await fsp.rm(file); return true; },
      async state() { if (await up()) return 'running'; return fs.existsSync(file) ? 'stopped' : 'missing'; },
    };
  }

  // Linux and the rest: systemd's per-user manager
  const unit = 'my-office.service', dir = path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'systemd', 'user'), file = path.join(dir, unit);
  const OLD = 'claude-office.service';   // (the name until 28/10/2026: moved by install, removed by uninstall)
  const sysd = (...a) => run('systemctl', ['--user', ...a]);
  return {
    file, restart: `systemctl --user restart ${unit}`,
    async install() {
      if (!has('systemctl')) return false;   // no systemd (a container, WSL without it): run it by hand
      if (fs.existsSync(path.join(dir, OLD))) { sysd('disable', '--now', OLD); await fsp.rm(path.join(dir, OLD), { force: true }); }
      await fsp.mkdir(path.dirname(file), { recursive: true });
      await fsp.writeFile(file, [
        '[Unit]', 'Description=My Office (a 3D office for Claude Code sessions)', 'After=network.target', '',
        '[Service]', `ExecStart="${node}" "${server}"`, `WorkingDirectory=${root}`,
        ...Object.entries(env).map(([k, v]) => `Environment=${k}=${v}`),
        'Restart=on-failure', 'RestartSec=3', `StandardOutput=append:${log}`, `StandardError=append:${log}`, '',
        '[Install]', 'WantedBy=default.target', '',
      ].join('\n'));
      sysd('daemon-reload'); sysd('enable', '--now', unit);
      return true;
    },
    async uninstall() {
      if (fs.existsSync(path.join(dir, OLD))) { sysd('disable', '--now', OLD); await fsp.rm(path.join(dir, OLD), { force: true }); }
      if (!fs.existsSync(file)) return false; sysd('disable', '--now', unit); await fsp.rm(file); sysd('daemon-reload'); return true;
    },
    async state() { if (sysd('is-active', unit).trim() === 'active') return 'running'; return fs.existsSync(file) ? 'stopped' : 'missing'; },
  };
}
