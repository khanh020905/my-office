import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';

// Phone work as Claude Code background sessions (server/bg-sessions.mjs), with tests/e2e/fake-claude.sh standing in for
// `claude --bg`, `claude agents --json` and `claude stop`, and for the hooks a background session fires. On an office of
// its own (its own port, home and data, the approval window cut to 4 s): its switch is the whole office's, and another
// file's tasks running beside it must not become background sessions.
const OUT = path.resolve(process.env.E2E_OUT || 'test-results', 'bg-tasks');
const PORT = (Number(process.env.E2E_PORT) || 4399) + 30, BASE = `http://127.0.0.1:${PORT}`;
const HOME = path.join(OUT, 'home'), PROJ = path.join(HOME, 'bg-project');
let server: ChildProcess | null = null;

test.beforeAll(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(PROJ, { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env, HOME, USERPROFILE: HOME, OFFICE_CLAUDE_BIN: path.resolve('tests/e2e/fake-claude.sh'), NODE_ENV: 'production', OFFICE_PORT: String(PORT),
    OFFICE_DATA_DIR: path.join(OUT, 'office-data'), OFFICE_LANG: 'en', OFFICE_TRANSLATE: '0', OFFICE_USAGE: '0', OFFICE_CI: '0', OFFICE_HOLD_MS: '4000' };
  delete env.CLAUDE_CONFIG_DIR;   // (never the real ~/.claude)
  server = spawn(process.execPath, ['server/index.mjs'], { env, stdio: 'ignore' });
  await expect.poll(async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } }, { timeout: 60_000 }).toBe(true);
});
test.afterAll(() => { server?.kill(); });
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } }); });

const asked = () => { try { return fs.readFileSync(path.join(HOME, '.fake-claude.log'), 'utf8').trim().split('\n'); } catch { return []; } };
const hooks = () => { try { return fs.readdirSync(path.join(HOME, '.fake-bg')).filter((f) => f.endsWith('.hooks')).map((f) => fs.readFileSync(path.join(HOME, '.fake-bg', f), 'utf8')).join(''); } catch { return ''; } };
async function openChat(page: Page) {
  await page.goto(`${BASE}/`);
  await expect(async () => { if (!(await page.locator('#zchat').isVisible())) await page.click('#btn-chat'); await expect(page.locator('#zchat')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });
  return page.locator('#zchat');
}

test('phone work as a background session: its steps, an approval that waits past the usual window, the answer, attach, carry on, stop, and the old way when it can\'t', async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // a session that worked in the folder: somewhere work can go
  await request.post(`${BASE}/event`, { data: { session_id: 'e2e-bg-seed', cwd: PROJ, hook_event_name: 'SessionStart', source: 'startup' } });
  await expect.poll(async () => (await (await request.get(`${BASE}/api/tasks`)).json()).projects.length, { timeout: 20_000 }).toBeGreaterThan(0);
  const dir = (await (await request.get(`${BASE}/api/tasks`)).json()).projects[0].dir;
  // switched on, on the Mac: this Claude Code has them (its --help and --version)
  const on = await (await request.post(`${BASE}/api/tasks/bg`, { data: { on: true } })).json();
  expect(on.bg).toEqual({ on: true, ok: true, version: '2.1.316' });
  // the phone window offers it under "give work from a phone", on
  await request.post(`${BASE}/api/tasks/allow`, { data: { on: true } });
  await page.goto(`${BASE}/`);
  await page.click('#btn-phone-top');
  const sw = page.locator('#pm-body .pm-toggle', { hasText: 'Run phone work as background sessions' });
  await expect(sw.locator('input')).toBeChecked({ timeout: 30_000 });
  await expect(sw).toContainText('2.1.257');
  const zc = await openChat(page);

  // work given (as a phone would, through /api/tasks): a background session, with the office's settings
  expect((await request.post(`${BASE}/api/tasks`, { data: { dir, text: 'tidy the docs, it needs approval' } })).ok()).toBe(true);
  const card = zc.locator('.zc-work').last();
  await expect(card.locator('.zc-work-attach code')).toContainText(/ attach [0-9a-f]{8}$/, { timeout: 30_000 });
  await expect(card.locator('.zc-work-attach')).toContainText('Back on the Mac, type');
  const first = asked().find((l) => l.includes('tidy the docs')) || '';
  expect(first).toMatch(/^--bg --settings \{.*"bgIsolation":"none".*\/hook\/permission\?long=1.* --append-system-prompt .* -- tidy the docs, it needs approval$/);
  // its steps come from its hooks
  await expect(card.locator('.zc-work-steps')).toContainText('README.md', { timeout: 20_000 });
  // an approval: its usual hook answered at once (empty), its own one held, with the card's buttons
  const allow = card.locator('.zc-work-btn.is-ok');
  await expect(allow).toBeVisible({ timeout: 20_000 });
  await expect.poll(hooks, { timeout: 20_000 }).toContain('short=[]');
  await expect(page.locator('#perm-stack .perm-card .pc-left').first()).toHaveText('waiting');
  // past the window an approval has otherwise (4 s here, 45 s for real): still there, nothing answered for it
  await page.waitForTimeout(7000);
  await expect(allow).toBeVisible();
  expect(hooks()).not.toContain('long=');
  await allow.click();
  await expect(zc.locator('.zc-row', { hasText: 'Done in the background: allowed.' })).toBeVisible({ timeout: 30_000 });
  await expect(card).toHaveClass(/is-done/, { timeout: 20_000 });
  await expect(card.locator('.zc-work-attach code')).toBeVisible();   // (how to carry on at the Mac stays on the card)
  expect(hooks()).toContain('"behavior":"allow"');

  // carrying on that conversation: woken in the background with the options it keeps (no --settings again)
  expect((await request.post(`${BASE}/api/tasks`, { data: { dir, text: 'and the tests too' } })).ok()).toBe(true);
  await expect.poll(() => asked().at(-1), { timeout: 20_000 }).toMatch(/^--bg --resume e2e-bg-[0-9a-f]{8} -- and the tests too$/);
  await expect(zc.locator('.zc-row', { hasText: 'Done in the background.' }).last()).toBeVisible({ timeout: 30_000 });

  // stopped from its card: `claude stop`, the card says stopped
  await expect.poll(async () => (await (await request.get(`${BASE}/api/tasks`)).json()).running.length, { timeout: 20_000 }).toBe(0);
  expect((await request.post(`${BASE}/api/tasks`, { data: { dir, text: 'take it slowly' } })).ok()).toBe(true);
  const slow = zc.locator('.zc-work').last();
  await expect(slow.locator('.zc-work-attach code')).toBeVisible({ timeout: 30_000 });
  await slow.locator('.zc-work-btn.is-stop').click();
  await expect(slow).toHaveClass(/is-stopped/, { timeout: 20_000 });
  await expect.poll(() => fs.readdirSync(path.join(HOME, '.fake-bg')).filter((f) => f.endsWith('.json')).map((f) => fs.readFileSync(path.join(HOME, '.fake-bg', f), 'utf8')).join(''), { timeout: 20_000 }).toContain('"state":"stopped"');

  // a folder Claude Code won't open one in: the old way (`claude -p`), and why, in the group
  expect((await request.post(`${BASE}/api/tasks`, { data: { dir, text: 'an untrusted one', fresh: true } })).ok()).toBe(true);
  await expect(zc.locator('.zc-sys', { hasText: 'doesn’t trust this folder' })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => asked().at(-1), { timeout: 20_000 }).toMatch(/^-p an untrusted one /);
  await expect(zc.locator('.zc-row', { hasText: 'Done: the e2e task.' }).last()).toBeVisible({ timeout: 30_000 });

  // on a phone (its width, its Chat tab): the card's command wraps inside it
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`);
  await page.locator('.ph-tabs .ph-tab').nth(4).click();
  const onPhone = page.locator('#zchat .zc-work', { has: page.locator('.zc-work-attach') }).first();
  await onPhone.scrollIntoViewIfNeeded();
  await expect(onPhone.locator('.zc-work-attach code')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: path.join(OUT, 'card-phone.png') });
  expect(await onPhone.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  // switched off: the old way again
  await request.post(`${BASE}/api/tasks/bg`, { data: { on: false } });
  expect((await request.post(`${BASE}/api/tasks`, { data: { dir, text: 'the old way', fresh: true } })).ok()).toBe(true);
  await expect.poll(() => asked().at(-1), { timeout: 20_000 }).toMatch(/^-p the old way /);
  expect(errors).toEqual([]);
});
