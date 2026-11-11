import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { test, expect, type APIRequestContext } from '@playwright/test';

// Nobody at the Mac for a minute (OFFICE_IDLE_SEC=60: past the 20 s that counts as "using the Mac", short of the 2 minutes
// that count as away), approving from a phone on and a phone getting pushes (OFFICE_PUSH_FAKE): a request a page held
// isn't handed to an IDE nobody is in front of when the page stops looking or its time is up, it stays for the phone with a
// push. One that did go back to Claude Code tells a phone answering it when and why. On an office of its own.
const OUT = path.resolve(process.env.E2E_OUT || 'test-results', 'phone-keep');
const PORT = (Number(process.env.E2E_PORT) || 4399) + 40, BASE = `http://127.0.0.1:${PORT}`;
const HOME_DIR = path.join(OUT, 'home'), DATA = path.join(OUT, 'office-data'), PUSHES = path.join(OUT, 'pushes.jsonl');
let server: ChildProcess | null = null;
test.beforeAll(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(HOME_DIR, '.claude', 'sessions'), { recursive: true });
  fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(path.join(DATA, 'prefs.json'), JSON.stringify({ phoneApprove: true }));
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: HOME_DIR, USERPROFILE: HOME_DIR, OFFICE_CLAUDE_BIN: path.resolve('tests/e2e/fake-claude.sh'), NODE_ENV: 'production', OFFICE_PORT: String(PORT),
    OFFICE_DATA_DIR: DATA, OFFICE_LANG: 'en', OFFICE_TRANSLATE: '0', OFFICE_USAGE: '0', OFFICE_CI: '0', OFFICE_MENUBAR: '0', OFFICE_IDLE_SEC: '60', OFFICE_HOLD_MS: '4000', OFFICE_PUSH_FAKE: PUSHES };
  delete env.CLAUDE_CONFIG_DIR;   // (never the real ~/.claude)
  server = spawn(process.execPath, ['server/index.mjs'], { env, stdio: 'ignore' });
  await expect.poll(async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } }, { timeout: 60_000 }).toBe(true);
});
test.afterAll(() => { server?.kill(); });
const at = (sid: string) => ({ session_id: sid, cwd: path.join(HOME_DIR, sid), transcript_path: path.join(HOME_DIR, `${sid}.jsonl`) });
const perm = (sid: string, command: string) => ({ ...at(sid), hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command } });
const pushes = () => { try { return fs.readFileSync(PUSHES, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
type Held = { id: string; until: number };
const heldNow = async (request: APIRequestContext) => ((await (await request.get(`${BASE}/api/panel`)).json()).held || []) as Held[];
const looking = (request: APIRequestContext, focused: boolean) => request.post(`${BASE}/api/presence`, { data: { page: 'p1', focused } });
const firstHeld = async (request: APIRequestContext) => { let h: Held | undefined; await expect.poll(async () => { h = (await heldNow(request))[0]; return !!h; }, { timeout: 8000 }).toBe(true); return h!; };

test('the page stops looking: the request stays, for the phone, with a push', async ({ request }) => {
  test.setTimeout(60_000);
  await request.post(`${BASE}/event`, { data: { ...at('keep-a'), hook_event_name: 'SessionStart', source: 'startup' } });
  await looking(request, true);
  const before = pushes().length;
  const asked = request.post(`${BASE}/hook/permission`, { data: perm('keep-a', 'npm run build'), headers: { 'X-Office-Wait': '40' } });
  let held = await firstHeld(request);
  expect(held.until - Date.now()).toBeLessThanOrEqual(4500);   // (a page's hold: here 4 s)
  expect(pushes().length).toBe(before);                        // (someone is looking: no push)
  await looking(request, false);                               // the phone locked, the page left
  await expect.poll(() => pushes().length, { timeout: 8000 }).toBe(before + 1);
  held = (await heldNow(request))[0];
  expect(held.until - Date.now()).toBeGreaterThan(20_000);     // (now the phone's: as long as its hook waits)
  await new Promise((r) => setTimeout(r, 4500));
  expect((await heldNow(request)).map((x) => x.id)).toContain(held.id);
  await request.post(`${BASE}/api/perm`, { data: { id: held.id, choice: 'allow' } });
  expect(await (await asked).text()).toContain('allow');
  await request.post(`${BASE}/event`, { data: { ...at('keep-a'), hook_event_name: 'SessionEnd', reason: 'other' } });
});

test("a page's time runs out with nobody at the Mac: the phone's turn", async ({ request }) => {
  test.setTimeout(60_000);
  await request.post(`${BASE}/event`, { data: { ...at('keep-b'), hook_event_name: 'SessionStart', source: 'startup' } });
  await looking(request, true);
  const before = pushes().length;
  const asked = request.post(`${BASE}/hook/permission`, { data: perm('keep-b', 'npm test'), headers: { 'X-Office-Wait': '40' } });
  const held = await firstHeld(request);
  await expect.poll(() => pushes().length, { timeout: 10_000 }).toBe(before + 1);   // (after the page's 4 s)
  expect((await heldNow(request))[0].until - Date.now()).toBeGreaterThan(20_000);
  await request.post(`${BASE}/api/perm`, { data: { id: held.id, choice: 'deny' } });
  expect(await (await asked).text()).toContain('deny');
  await looking(request, false);
  await request.post(`${BASE}/event`, { data: { ...at('keep-b'), hook_event_name: 'SessionEnd', reason: 'other' } });
});

test('gone back to Claude Code: a phone answering it is told when and why, and the log says so', async ({ request }) => {
  test.setTimeout(60_000);
  await request.post(`${BASE}/event`, { data: { ...at('keep-c'), hook_event_name: 'SessionStart', source: 'startup' } });
  expect((await (await request.post(`${BASE}/api/phone`, { data: { approve: false } })).json()).approve).toBe(false);   // (no phone to keep it for)
  // (reading /api/panel, as this test does, is what the menu bar app does: with its banners off, nothing holds it but the page)
  await request.post(`${BASE}/api/macapprove`, { data: { on: false } });
  try {
    await looking(request, true);
    const asked = request.post(`${BASE}/hook/permission`, { data: perm('keep-c', 'ls -la'), headers: { 'X-Office-Wait': '40' } });
    const held = await firstHeld(request);
    await looking(request, false);
    expect(await (await asked).text()).toBe('');                // handed back: Claude Code asks itself
    const r = await request.post(`${BASE}/api/perm`, { data: { id: held.id, choice: 'allow' } });
    expect(r.status()).toBe(404);
    const msg = (await r.json()).message as string;
    expect(msg).toContain('went back to Claude Code'); expect(msg).toContain('nobody was looking');
    expect(fs.readFileSync(path.join(DATA, 'actions.log'), 'utf8')).toMatch(/back to Claude Code \(blur\) perm keep-c\S* Bash/);
  } finally { await request.post(`${BASE}/api/phone`, { data: { approve: true } }); await request.post(`${BASE}/api/macapprove`, { data: { on: true } }); }
  await request.post(`${BASE}/event`, { data: { ...at('keep-c'), hook_event_name: 'SessionEnd', reason: 'other' } });
});
