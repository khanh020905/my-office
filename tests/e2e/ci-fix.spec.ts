import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';

// "Sửa luôn" (server/index.mjs ciCard / ciFix): a repository's CI goes red, a card in the group chat, and its button
// hands Claude the failing run. GitHub is tests/e2e/fake-gh.sh (the runs each repository answers with are files this
// test writes), the sessions are stand-ins as in steer.spec.ts: one at work with an inbox socket this test listens on,
// one resting that tests/e2e/fake-claude.sh carries on. On an office of its own (its own port, home and data).
const OUT = path.resolve(process.env.E2E_OUT || 'test-results', 'ci-fix');
const PORT = (Number(process.env.E2E_PORT) || 4399) + 34, BASE = `http://127.0.0.1:${PORT}`;
const HOME = path.join(OUT, 'home'), RUNS = path.join(OUT, 'gh-runs');
const BUSY = path.join(HOME, 'ci-busy'), REST = path.join(HOME, 'ci-rest');
const SOCKS = fs.mkdtempSync(path.join(os.tmpdir(), 'ofc-')), INBOX = path.join(SOCKS, 'in.sock');   // (a socket path must stay short)
let server: ChildProcess | null = null, inbox: net.Server | null = null;
const got: string[] = [];
const procs: ChildProcess[] = [];

// a repository on branch main with one commit
function repo(dir: string) {
  fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'README.md'), 'e2e\n');
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com', ...a], { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'main'); git('add', '.'); git('commit', '-q', '-m', 'first');
}
// what `gh run list` answers in a repository: its latest run of the code
const ci = (dir: string, conclusion: 'failure' | 'success', run: number) => fs.writeFileSync(path.join(RUNS, `${path.basename(dir)}.json`),
  JSON.stringify([{ status: 'completed', conclusion, workflowName: 'CI', url: `https://github.com/e2e/${path.basename(dir)}/actions/runs/${run}`, event: 'push' }]));

test.beforeAll(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(HOME, '.claude', 'sessions'), { recursive: true }); fs.mkdirSync(RUNS, { recursive: true });
  repo(BUSY); repo(REST);
  inbox = net.createServer((c) => { let b = ''; c.on('data', (d) => { b += d; }); c.on('end', () => got.push(b)); });
  await new Promise<void>((r) => inbox!.listen(INBOX, r));
  const env: NodeJS.ProcessEnv = { ...process.env, HOME, USERPROFILE: HOME, OFFICE_CLAUDE_BIN: path.resolve('tests/e2e/fake-claude.sh'), NODE_ENV: 'production', OFFICE_PORT: String(PORT),
    OFFICE_DATA_DIR: path.join(OUT, 'office-data'), OFFICE_LANG: 'en', OFFICE_TRANSLATE: '0', OFFICE_USAGE: '0', OFFICE_CI: '1', GH_PATH: path.resolve('tests/e2e/fake-gh.sh'), FAKE_GH_DIR: RUNS, FAKE_INBOX: INBOX };
  delete env.CLAUDE_CONFIG_DIR;   // (never the real ~/.claude)
  server = spawn(process.execPath, ['server/index.mjs'], { env, stdio: 'ignore' });
  await expect.poll(async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } }, { timeout: 60_000 }).toBe(true);
});
test.afterAll(() => { server?.kill(); inbox?.close(); for (const p of procs) p.kill(); fs.rmSync(SOCKS, { recursive: true, force: true }); });
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } }); });

const asked = () => { try { return fs.readFileSync(path.join(HOME, '.fake-claude.log'), 'utf8'); } catch { return ''; } };
const notes = () => got.map((x) => JSON.parse(x).message.content as string);
// a conversation open on the Mac and at work in `dir`, with its inbox (as steer.spec.ts)
async function busySession(request: import('@playwright/test').APIRequestContext, sid: string, dir: string) {
  const p = spawn('sleep', ['600'], { stdio: 'ignore' }); procs.push(p);
  fs.writeFileSync(path.join(HOME, '.claude', 'sessions', `${p.pid}.json`), JSON.stringify({ pid: p.pid, sessionId: sid, cwd: dir, startedAt: Date.now(), kind: 'interactive', entrypoint: 'cli', name: 'ci-busy', status: 'busy', updatedAt: Date.now(), peerProtocol: 1, messagingSocketPath: INBOX }));
  const base = { session_id: sid, cwd: dir, permission_mode: 'default' };
  await request.post(`${BASE}/event`, { data: { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'add the export button' } });
  await request.post(`${BASE}/event`, { data: { ...base, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: path.join(dir, 'README.md') } } });
  await expect.poll(async () => (await (await request.get(`${BASE}/api/tasks`)).json()).sessions.some((s: { sid: string, status: string }) => s.sid === sid && s.status === 'work'), { timeout: 20_000 }).toBe(true);
}
// a conversation that worked in `dir` and is done (no window open on the Mac): "Sửa luôn" carries it on
async function restingSession(request: import('@playwright/test').APIRequestContext, sid: string, dir: string) {
  const base = { session_id: sid, cwd: dir, permission_mode: 'default' };
  await request.post(`${BASE}/event`, { data: { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'bump the version' } });
  await request.post(`${BASE}/event`, { data: { ...base, hook_event_name: 'Stop', last_assistant_message: 'Bumped.' } });
  await expect.poll(async () => (await (await request.get(`${BASE}/api/tasks`)).json()).sessions.some((s: { sid: string, status: string }) => s.sid === sid && s.status === 'rest'), { timeout: 20_000 }).toBe(true);
}
// the chat open (a page that connects also has the office look at the repositories and their CI)
async function openChat(page: Page) {
  await page.goto(`${BASE}/`);
  await expect(async () => { if (!(await page.locator('#zchat').isVisible())) await page.click('#btn-chat'); await expect(page.locator('#zchat')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });
  return page.locator('#zchat');
}

test('a red CI: a card in the chat, "Fix it" hands Claude the failing run, and the card says when it is green again', async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // at work: the run goes into its conversation as a note, now
  await busySession(request, 'e2e-ci-1', BUSY);
  ci(BUSY, 'failure', 101);
  let zc = await openChat(page);
  const card = zc.locator('.zc-ci', { hasText: 'ci-busy' });
  await expect(card).toContainText('CI failed on ci-busy, branch main', { timeout: 60_000 });
  await expect(card.locator('.zc-ci-link')).toHaveAttribute('href', 'https://github.com/e2e/ci-busy/actions/runs/101');
  await zc.screenshot({ path: path.join(OUT, 'ci-card-red.png') });
  await card.locator('.zc-ci-fix').click();
  await expect.poll(notes, { timeout: 20_000 }).toContainEqual(expect.stringContaining('gh run view 101 --log-failed'));
  expect(notes().at(-1)).toContain("Don't push until I say so");
  await expect(card.locator('.zc-ci-note')).toHaveText('Noted: Claude fixes it right after its current step', { timeout: 20_000 });
  await expect(card.locator('.zc-ci-fix')).toHaveCount(0);
  // green again: the card says so (the office looks again when a page connects)
  ci(BUSY, 'success', 102);
  zc = await openChat(page);
  await expect(zc.locator('.zc-ci', { hasText: 'ci-busy' }).locator('.zc-ci-note')).toHaveText('✓ CI is green again', { timeout: 60_000 });
  // the same run red after the office starts again would not make a second card: one card per run
  expect(await zc.locator('.zc-ci', { hasText: 'ci-busy' }).count()).toBe(1);

  // resting: "Fix it" carries its conversation on with the run
  await restingSession(request, 'e2e-ci-2', REST);
  ci(REST, 'failure', 201);
  zc = await openChat(page);
  const card2 = zc.locator('.zc-ci', { hasText: 'ci-rest' });
  await card2.locator('.zc-ci-fix').click({ timeout: 60_000 });
  await expect.poll(asked, { timeout: 30_000 }).toContain('gh run view 201 --log-failed');
  expect(asked()).toMatch(/--resume e2e-ci-2( |$)/m);
  await expect(card2.locator('.zc-ci-note')).toHaveText('Handed to Claude to fix', { timeout: 20_000 });
  await zc.screenshot({ path: path.join(OUT, 'ci-card-sent.png') });
  expect(errors).toEqual([]);
});
