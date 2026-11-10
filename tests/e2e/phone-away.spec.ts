import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { test, expect } from '@playwright/test';

// Away from the Mac (the test server fakes OFFICE_IDLE_SEC=600) with approving from a phone on and a phone subscribed to
// push (OFFICE_PUSH_FAKE writes each push to a file): an approval or a question is held with no office page open, a push
// says so at once, a page blurring doesn't hand it back, and it waits as long as its hook says (X-Office-Wait), 45 s
// (here OFFICE_HOLD_MS) for a hook from before. With approving from a phone off, nothing is held, as before.
const OUT = path.resolve(process.env.E2E_OUT || 'test-results', 'phone-away');
const PORT = (Number(process.env.E2E_PORT) || 4399) + 38, BASE = `http://127.0.0.1:${PORT}`;
const HOME_DIR = path.join(OUT, 'home'), DATA = path.join(OUT, 'office-data'), PUSHES = path.join(OUT, 'pushes.jsonl');
let server: ChildProcess | null = null;
test.beforeAll(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(HOME_DIR, '.claude', 'sessions'), { recursive: true });
  fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(path.join(DATA, 'prefs.json'), JSON.stringify({ phoneApprove: true }));
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: HOME_DIR, USERPROFILE: HOME_DIR, OFFICE_CLAUDE_BIN: path.resolve('tests/e2e/fake-claude.sh'), NODE_ENV: 'production', OFFICE_PORT: String(PORT),
    OFFICE_DATA_DIR: DATA, OFFICE_LANG: 'en', OFFICE_TRANSLATE: '0', OFFICE_USAGE: '0', OFFICE_CI: '0', OFFICE_MENUBAR: '0', OFFICE_IDLE_SEC: '600', OFFICE_HOLD_MS: '4000', OFFICE_PUSH_FAKE: PUSHES };
  delete env.CLAUDE_CONFIG_DIR;   // (never the real ~/.claude)
  server = spawn(process.execPath, ['server/index.mjs'], { env, stdio: 'ignore' });
  await expect.poll(async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } }, { timeout: 60_000 }).toBe(true);
});
test.afterAll(() => { server?.kill(); });
const at = (sid: string) => ({ session_id: sid, cwd: path.join(HOME_DIR, sid), transcript_path: path.join(HOME_DIR, `${sid}.jsonl`) });
const perm = (sid: string, command: string) => ({ ...at(sid), hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command } });
const pushes = () => { try { return fs.readFileSync(PUSHES, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
type Held = { id: string; kind: string; detail: string; until: number };
const heldNow = async (request: import('@playwright/test').APIRequestContext) => ((await (await request.get(`${BASE}/api/panel`)).json()).held || []) as Held[];

test('away from the Mac, an approval waits for the phone, with a push', async ({ request }) => {
  test.setTimeout(60_000);
  await request.post(`${BASE}/event`, { data: { ...at('away-a'), hook_event_name: 'SessionStart', source: 'startup' } });
  const asked = request.post(`${BASE}/hook/permission`, { data: perm('away-a', 'npm run deploy'), headers: { 'X-Office-Wait': '40' } });
  let held: Held | undefined;
  await expect.poll(async () => { held = (await heldNow(request))[0]; return !!held; }, { timeout: 8000 }).toBe(true);
  expect(held!.until - Date.now()).toBeGreaterThan(20_000);   // (its hook waits 40 s: held ~35 s, not the 4 s a page gets here)
  await expect.poll(() => pushes().length, { timeout: 5000 }).toBe(1);
  const p = pushes()[0];
  expect(p.title).toContain('away-a'); expect(p.body).toContain('npm run deploy'); expect(p.urgent).toBe(true); expect(p.tag).toBe(`perm-${held!.id}`);
  // a page saying it lost focus doesn't hand it back (it does that for a request held for a page)
  await request.post(`${BASE}/api/presence`, { data: { page: 'p1', focused: false } });
  await new Promise((r) => setTimeout(r, 4500));   // (past the 4 s a page would hold it)
  expect((await heldNow(request)).map((x) => x.id)).toContain(held!.id);
  await request.post(`${BASE}/api/panel/answer`, { data: { id: held!.id, choice: 'allow' } });
  expect(await (await asked).text()).toContain('allow');
  await request.post(`${BASE}/event`, { data: { ...at('away-a'), hook_event_name: 'SessionEnd', reason: 'other' } });
});

test('a question waits for the phone too, and a hook from before gets its 45 s', async ({ request }) => {
  test.setTimeout(60_000);
  await request.post(`${BASE}/event`, { data: { ...at('away-b'), hook_event_name: 'SessionStart', source: 'startup' } });
  const before = pushes().length;
  const q = { ...at('away-b'), hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion',
    tool_input: { questions: [{ question: 'Which database?', header: 'DB', multiSelect: false, options: [{ label: 'Postgres', description: '' }, { label: 'SQLite', description: '' }] }] } };
  const asked = request.post(`${BASE}/hook/question`, { data: q });   // (no X-Office-Wait: an install from before)
  let held: Held | undefined;
  await expect.poll(async () => { held = (await heldNow(request))[0]; return !!held; }, { timeout: 8000 }).toBe(true);
  expect(held!.kind).toBe('ask');
  expect(held!.until - Date.now()).toBeLessThanOrEqual(4500);   // (OFFICE_HOLD_MS: what a 50 s curl allows)
  await expect.poll(() => pushes().length, { timeout: 5000 }).toBe(before + 1);
  expect(pushes().at(-1).title).toContain('question'); expect(pushes().at(-1).body).toContain('Which database?');
  const r = await request.post(`${BASE}/api/perm`, { data: { id: held!.id, choice: 'answer', answers: [{ q: 0, pick: [1], other: '' }] } });
  expect((await r.json()).ok).toBe(true);
  expect(await (await asked).text()).toContain('SQLite');
  await request.post(`${BASE}/event`, { data: { ...at('away-b'), hook_event_name: 'SessionEnd', reason: 'other' } });
});

test('approving from a phone off: nothing is held, Claude Code asks itself', async ({ request }) => {
  await request.post(`${BASE}/event`, { data: { ...at('away-c'), hook_event_name: 'SessionStart', source: 'startup' } });
  expect((await (await request.post(`${BASE}/api/phone`, { data: { approve: false } })).json()).approve).toBe(false);
  try {
    const before = pushes().length;
    const answer = await request.post(`${BASE}/hook/permission`, { data: perm('away-c', 'npm test'), headers: { 'X-Office-Wait': '40' } });
    expect(await answer.text()).toBe('');
    expect(pushes().length).toBe(before);
  } finally { await request.post(`${BASE}/api/phone`, { data: { approve: true } }); }
  await request.post(`${BASE}/event`, { data: { ...at('away-c'), hook_event_name: 'SessionEnd', reason: 'other' } });
});
