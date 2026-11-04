import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { test, expect } from '@playwright/test';

// Approving from the Mac's notifications: with the menu bar app polling /api/panel and the Mac not idle (the test server fakes
// OFFICE_IDLE_SEC=1), a request is held with no office page open, listed in /api/panel, and answered the way the banner's
// buttons do (POST /api/panel/answer). A risky command gets no Allow there; turned off in Settings, nothing is held.
// On an office of its own (its own port, home and data), with the Mac's idle time faked at 1 s and a short hold.
const OUT = path.resolve(process.env.E2E_OUT || 'test-results', 'mac-notify');
const PORT = (Number(process.env.E2E_PORT) || 4399) + 37, BASE = `http://127.0.0.1:${PORT}`;
const HOME_DIR = path.join(OUT, 'home');
let server: ChildProcess | null = null;
test.beforeAll(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(HOME_DIR, '.claude', 'sessions'), { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: HOME_DIR, USERPROFILE: HOME_DIR, OFFICE_CLAUDE_BIN: path.resolve('tests/e2e/fake-claude.sh'), NODE_ENV: 'production', OFFICE_PORT: String(PORT),
    OFFICE_DATA_DIR: path.join(OUT, 'office-data'), OFFICE_LANG: 'en', OFFICE_TRANSLATE: '0', OFFICE_USAGE: '0', OFFICE_CI: '0', OFFICE_MENUBAR: '0', OFFICE_IDLE_SEC: '1', OFFICE_BAR_HOLD_MS: '8000' };
  delete env.CLAUDE_CONFIG_DIR;   // (never the real ~/.claude)
  server = spawn(process.execPath, ['server/index.mjs'], { env, stdio: 'ignore' });
  await expect.poll(async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } }, { timeout: 60_000 }).toBe(true);
});
test.afterAll(() => { server?.kill(); });
const at = (sid: string) => ({ session_id: sid, cwd: path.join(HOME_DIR, sid), transcript_path: path.join(HOME_DIR, `${sid}.jsonl`) });
const perm = (sid: string, command: string) => ({ ...at(sid), hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command } });

test('a request is held for the menu bar, listed, and answered from its banner', async ({ request }) => {
  test.setTimeout(60_000);
  await request.post(`${BASE}/api/macapprove`, { data: { on: true } });
  await request.post(`${BASE}/event`, { data: { ...at('notif-a'), hook_event_name: 'SessionStart', source: 'startup' } });
  await request.get(`${BASE}/api/panel`);                  // the app is alive; its first read starts the idle reading
  await expect.poll(async () => { await request.get(`${BASE}/api/panel`); return 1; }, { timeout: 2000 }).toBe(1);
  await new Promise((r) => setTimeout(r, 600));     // (the idle time is read in the background)
  const asked = request.post(`${BASE}/hook/permission`, { data: perm('notif-a', 'npm test') });
  let held: { id: string; kind: string; risky: boolean; detail: string; until: number } | undefined;
  await expect.poll(async () => { held = (await (await request.get(`${BASE}/api/panel`)).json()).held?.[0]; return !!held; }, { timeout: 8000 }).toBe(true);
  expect(held!.kind).toBe('perm'); expect(held!.risky).toBe(false); expect(held!.detail).toContain('npm test');
  expect(held!.until - Date.now()).toBeLessThanOrEqual(8500);   // (the short hold of the menu bar alone)
  const bar = await (await request.get(`${BASE}/api/panel`)).json();
  expect(bar.words.allow).toBe('Allow'); expect(bar.words.deny).toBe('Deny');
  const r = await request.post(`${BASE}/api/panel/answer`, { data: { id: held!.id, choice: 'allow' } });
  expect((await r.json()).ok).toBe(true);
  expect(await (await asked).text()).toContain('allow');
  expect((await (await request.get(`${BASE}/api/panel`)).json()).held).toHaveLength(0);
  expect((await request.post(`${BASE}/api/panel/answer`, { data: { id: held!.id, choice: 'allow' } })).status()).toBe(404);   // settled: gone

  // a risky command: the banner may deny, never allow
  const risky = request.post(`${BASE}/hook/permission`, { data: perm('notif-a', 'rm -rf /') });
  await expect.poll(async () => { held = (await (await request.get(`${BASE}/api/panel`)).json()).held?.[0]; return !!held; }, { timeout: 8000 }).toBe(true);
  expect(held!.risky).toBe(true);
  expect((await request.post(`${BASE}/api/panel/answer`, { data: { id: held!.id, choice: 'allow' } })).status()).toBe(403);
  await request.post(`${BASE}/api/panel/answer`, { data: { id: held!.id, choice: 'deny' } });
  expect(await (await risky).text()).toContain('deny');

  // "Answer in the IDE": handed back at once, empty
  const skipped = request.post(`${BASE}/hook/permission`, { data: perm('notif-a', 'ls') });
  await expect.poll(async () => { held = (await (await request.get(`${BASE}/api/panel`)).json()).held?.[0]; return !!held; }, { timeout: 8000 }).toBe(true);
  await request.post(`${BASE}/api/panel/answer`, { data: { id: held!.id, choice: 'skip' } });
  expect(await (await skipped).text()).toBe('');
  await request.post(`${BASE}/event`, { data: { ...at('notif-a'), hook_event_name: 'SessionEnd', reason: 'other' } });
});

test('turned off in Settings, nothing is held and Claude Code asks itself', async ({ request }) => {
  await request.post(`${BASE}/event`, { data: { ...at('notif-b'), hook_event_name: 'SessionStart', source: 'startup' } });
  await request.get(`${BASE}/api/panel`);
  const off = await (await request.post(`${BASE}/api/macapprove`, { data: { on: false } })).json();
  expect(off.on).toBe(false);
  try {
    const answer = await request.post(`${BASE}/hook/permission`, { data: perm('notif-b', 'npm test') });
    expect(await answer.text()).toBe('');
  } finally { await request.post(`${BASE}/api/macapprove`, { data: { on: true } }); }
  await request.post(`${BASE}/event`, { data: { ...at('notif-b'), hook_event_name: 'SessionEnd', reason: 'other' } });
});
