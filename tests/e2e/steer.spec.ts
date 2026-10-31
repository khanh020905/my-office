import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';

// "Chen lời giữa chừng" (server/steer.mjs): a note into a conversation while it works, through its inbox socket. The
// sessions here are stand-ins (a session file and hook events, tests/e2e/fake-claude.sh for the runs the office starts),
// and their inbox is a socket this test listens on: what reaches it is what a real session would read. On an office of
// its own (its own port, home and data).
const OUT = path.resolve(process.env.E2E_OUT || 'test-results', 'steer');
const PORT = (Number(process.env.E2E_PORT) || 4399) + 31, BASE = `http://127.0.0.1:${PORT}`;
const HOME = path.join(OUT, 'home'), PROJ = path.join(HOME, 'steer-project');
const SOCKS = fs.mkdtempSync(path.join(os.tmpdir(), 'ofs-')), INBOX = path.join(SOCKS, 'in.sock');   // (a socket path must stay short)
let server: ChildProcess | null = null, inbox: net.Server | null = null;
const got: string[] = [];
const procs: ChildProcess[] = [];

test.beforeAll(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(HOME, '.claude', 'sessions'), { recursive: true }); fs.mkdirSync(PROJ, { recursive: true });
  inbox = net.createServer((c) => { let b = ''; c.on('data', (d) => { b += d; }); c.on('end', () => got.push(b)); });
  await new Promise<void>((r) => inbox!.listen(INBOX, r));
  const env: NodeJS.ProcessEnv = { ...process.env, HOME, USERPROFILE: HOME, OFFICE_CLAUDE_BIN: path.resolve('tests/e2e/fake-claude.sh'), NODE_ENV: 'production', OFFICE_PORT: String(PORT),
    OFFICE_DATA_DIR: path.join(OUT, 'office-data'), OFFICE_LANG: 'en', OFFICE_TRANSLATE: '0', OFFICE_USAGE: '0', OFFICE_CI: '0', FAKE_INBOX: INBOX };
  delete env.CLAUDE_CONFIG_DIR;   // (never the real ~/.claude)
  server = spawn(process.execPath, ['server/index.mjs'], { env, stdio: 'ignore' });
  await expect.poll(async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } }, { timeout: 60_000 }).toBe(true);
});
test.afterAll(() => { server?.kill(); inbox?.close(); for (const p of procs) p.kill(); fs.rmSync(SOCKS, { recursive: true, force: true }); });
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } }); });

const asked = () => { try { return fs.readFileSync(path.join(HOME, '.fake-claude.log'), 'utf8').trim().split('\n'); } catch { return []; } };
const notes = () => got.map((x) => JSON.parse(x).message.content as string);
// a conversation open on the Mac and at work: its process, the session file Claude Code writes (with its inbox or
// without), and the hooks that say it is working
async function busySession(request: import('@playwright/test').APIRequestContext, sid: string, name: string, withInbox: boolean, mode = 'default') {
  const p = spawn('sleep', ['600'], { stdio: 'ignore' }); procs.push(p);
  fs.writeFileSync(path.join(HOME, '.claude', 'sessions', `${p.pid}.json`), JSON.stringify({ pid: p.pid, sessionId: sid, cwd: PROJ, startedAt: Date.now(), kind: 'interactive', entrypoint: 'cli', name, status: 'busy', updatedAt: Date.now(),
    ...(withInbox ? { peerProtocol: 1, messagingSocketPath: INBOX } : {}) }));
  const base = { session_id: sid, cwd: PROJ, permission_mode: mode };
  await request.post(`${BASE}/event`, { data: { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'refactor the parser' } });
  await request.post(`${BASE}/event`, { data: { ...base, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/e2e/parser.ts' } } });
  await expect.poll(async () => (await (await request.get(`${BASE}/api/tasks`)).json()).sessions.some((s: { sid: string, status: string }) => s.sid === sid && s.status === 'work'), { timeout: 20_000 }).toBe(true);
  return p;
}
async function openChat(page: Page) {
  await page.goto(`${BASE}/`);
  await expect(async () => { if (!(await page.locator('#zchat').isVisible())) await page.click('#btn-chat'); await expect(page.locator('#zchat')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });
  return page.locator('#zchat');
}
async function writeTo(page: Page, sid: string, text: string) {
  const zc = page.locator('#zchat');
  await zc.locator('.zc-to-chip').click();
  await zc.locator(`.zc-to-pick .zc-to-o[data-sid="${sid}"]`).click();
  await zc.locator('.zc-in').fill(text);
  await zc.locator('.zc-in').press('Enter');
}

test('cutting in on a conversation at work: from "To", from a run\'s card, and kept for later where it can\'t get in', async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const zc = await openChat(page);

  // "To" a conversation busy on the Mac: asked, then into its inbox now
  await busySession(request, 'e2e-steer-1', 'e2e-busy', true);
  await writeTo(page, 'e2e-steer-1', 'fix the tests too');
  const ask = zc.locator('.zc-steer-ask');
  await expect(ask).toContainText('e2e-busy is in the middle of something', { timeout: 20_000 });
  await ask.locator('.zc-ask-yes').click();
  await expect.poll(notes, { timeout: 20_000 }).toContainEqual(expect.stringContaining('fix the tests too'));
  expect(notes()[0]).toMatch(/^\[The user, cutting in through My Office/);
  await expect(zc.locator('.zc-sys', { hasText: 'Your note is in: e2e-busy' })).toBeVisible({ timeout: 20_000 });
  // "Later": nothing sent, the words back in the input
  await writeTo(page, 'e2e-steer-1', 'and the docs');
  await zc.locator('.zc-steer-ask .zc-ask-no').last().click();
  await expect(zc.locator('.zc-in')).toHaveValue('and the docs');
  await zc.locator('.zc-in').fill('');
  await zc.locator('.zc-to-x').click();

  // a run the office started (its card): 💬 Cut in, the note into its inbox (told by its SessionStart hook), on the card
  await request.post(`${BASE}/event`, { data: { session_id: 'e2e-steer-seed', cwd: PROJ, hook_event_name: 'SessionStart', source: 'startup' } });
  const dir = (await (await request.get(`${BASE}/api/tasks`)).json()).projects[0].dir;
  expect((await request.post(`${BASE}/api/tasks`, { data: { dir, text: 'take it slowly' } })).ok()).toBe(true);
  const card = zc.locator('.zc-work.is-work').last();
  await card.locator('.zc-work-btn.is-steer').click({ timeout: 30_000 });
  await expect(zc.locator('.zc-reply')).toContainText('A note for');
  await expect(zc.locator('.zc-in')).toHaveAttribute('placeholder', /fix the tests too, wrong file, stop/);
  const before = got.length;
  await zc.locator('.zc-in').fill('wrong file, stop');
  await zc.locator('.zc-in').press('Enter');
  await expect.poll(() => got.length, { timeout: 20_000 }).toBe(before + 1);
  expect(notes().at(-1)).toContain('wrong file, stop');
  await expect(zc.locator('.zc-reply')).toBeHidden();
  await expect(zc.locator('.zc-work').last().locator('.zc-work-steps')).toContainText('💬 wrong file, stop', { timeout: 20_000 });
  await zc.locator('.zc-work.is-work .zc-work-btn.is-stop').last().click();
  await expect(zc.locator('.zc-work').last()).toHaveClass(/is-stopped/, { timeout: 20_000 });

  // one that skips permission prompts would only hold it: said so, kept, and sent as a message once it is done
  const p2 = await busySession(request, 'e2e-steer-2', 'e2e-bypass', true, 'bypassPermissions');
  const n = got.length;
  await writeTo(page, 'e2e-steer-2', 'then run the linter');
  await zc.locator('.zc-steer-ask .zc-ask-yes').last().click({ timeout: 20_000 });
  await expect(zc.locator('.zc-sys', { hasText: 'e2e-bypass can’t take a note mid-way (the session skips every approval)' })).toBeVisible({ timeout: 20_000 });
  expect(got.length).toBe(n);   // (nothing into its inbox)
  // done: it closes on the Mac (gone from its folder), its last turn over: the note goes, carrying it on
  p2.kill();
  fs.rmSync(path.join(HOME, '.claude', 'sessions', `${p2.pid}.json`), { force: true });
  await expect.poll(async () => (await (await request.get(`${BASE}/api/tasks`)).json()).sessions.some((s: { sid: string }) => s.sid === 'e2e-steer-2'), { timeout: 20_000 }).toBe(false);
  await request.post(`${BASE}/event`, { data: { session_id: 'e2e-steer-2', cwd: PROJ, hook_event_name: 'Stop', last_assistant_message: 'Parser done.' } });
  await expect.poll(() => asked().at(-1), { timeout: 30_000 }).toMatch(/^-p then run the linter .*--resume e2e-steer-2( |$)/);
  await expect(zc.locator('.zc-row', { hasText: 'Done: the e2e task.' }).last()).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});
