import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { HOME_DIR } from '../../playwright.config';

// "Việc bỏ quên" (forgotten work) in the Mac panel, on real git repositories made in the test's own home folder: an
// "origin" and a clone whose worktrees hold work in different ways, one with nothing left in it.
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
const G = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.email=e2e@example.com', '-c', 'user.name=e2e', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd, stdio: 'pipe' }).toString();

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } });
});

test('forgotten work: worktrees still holding work, open, give to Claude, delete only a clean one', async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  fs.mkdirSync(HOME_DIR, { recursive: true });
  const top = fs.realpathSync(fs.mkdtempSync(path.join(HOME_DIR, 'stranded-'))), origin = path.join(top, 'origin.git'), repo = path.join(top, 'shop');
  const wt = (n: string) => path.join(top, n);
  fs.mkdirSync(origin); G(origin, 'init', '-q', '--bare', '-b', 'main');
  G(top, 'clone', '-q', origin, repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n'); fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n');
  G(repo, 'add', '.'); G(repo, 'commit', '-q', '-m', 'one'); G(repo, 'push', '-q', '-u', 'origin', 'main');
  G(repo, 'worktree', 'add', '-q', wt('shop-dirty'), '-b', 'dirty'); G(wt('shop-dirty'), 'push', '-q', '-u', 'origin', 'dirty');
  fs.writeFileSync(path.join(wt('shop-dirty'), 'notes.md'), 'todo\n'); fs.writeFileSync(path.join(wt('shop-dirty'), 'plan.md'), 'todo\n');
  G(repo, 'worktree', 'add', '-q', wt('shop-ahead'), '-b', 'ahead'); G(wt('shop-ahead'), 'push', '-q', '-u', 'origin', 'ahead');
  fs.writeFileSync(path.join(wt('shop-ahead'), 'b.txt'), 'b\n'); G(wt('shop-ahead'), 'add', '.'); G(wt('shop-ahead'), 'commit', '-q', '-m', 'two');
  G(repo, 'worktree', 'add', '-q', wt('shop-clean'), '-b', 'clean'); G(wt('shop-clean'), 'push', '-q', '-u', 'origin', 'clean');
  fs.mkdirSync(path.join(wt('shop-clean'), 'node_modules')); fs.writeFileSync(path.join(wt('shop-clean'), 'node_modules', 'x.js'), '1');

  // a session that worked in the repository: the office knows it from then on
  const base = { session_id: `e2e-stranded-${Date.now()}`, cwd: repo, transcript_path: path.join(top, 'e2e.jsonl') };
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionStart', source: 'startup' } });
  type Item = { id: string, dir: string, dirty: number, ahead: number, removable: boolean };
  const items = async (): Promise<Item[]> => (await (await request.get('/api/stranded?fresh')).json()).items || [];
  await expect.poll(async () => (await items()).filter((it) => it.dir.includes(path.basename(top))).length, { timeout: 30_000 }).toBe(3);
  const list = (await items()).filter((it) => it.dir.includes(path.basename(top)));
  const of = (n: string) => list.find((it) => it.dir.endsWith(`/${n}`))!;
  expect([of('shop-dirty').dirty, of('shop-dirty').removable]).toEqual([2, false]);
  expect([of('shop-ahead').ahead, of('shop-ahead').removable]).toEqual([1, false]);
  expect(of('shop-clean').removable).toBe(true);

  // the server refuses: a worktree with work in it, a request from another site
  const dirtyTry = await (await request.post('/api/stranded/remove', { data: { id: of('shop-dirty').id } })).json();
  expect([dirtyTry.ok, dirtyTry.code]).toEqual([false, 'notClean']);
  expect(fs.existsSync(path.join(wt('shop-dirty'), 'notes.md'))).toBe(true);
  expect((await request.post('/api/stranded/remove', { headers: { Origin: 'https://evil.example' }, data: { id: of('shop-clean').id } })).status()).toBe(403);

  // the Mac panel: the three, what each holds, and Delete only on the clean one
  await page.goto('/');
  await expect(async () => { if (!(await page.locator('#dr-mac').isVisible())) await page.click('#btn-mac'); await expect(page.locator('#dr-mac')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });
  const sec = page.locator('#mac-stranded');
  await expect(sec.locator('h3')).toContainText('Forgotten work', { timeout: 30_000 });
  const row = (n: string) => sec.locator('.st-row', { has: page.locator('.row-sub', { hasText: new RegExp(`/${n}$`) }) });
  await expect(row('shop-dirty')).toContainText('2 files not committed', { timeout: 30_000 });
  await expect(row('shop-ahead')).toContainText('1 commit not pushed');
  await expect(row('shop-clean')).toContainText('nothing left to do');
  await expect(row('shop-dirty').locator('.st-del')).toHaveCount(0);
  await expect(row('shop-ahead').locator('.st-del')).toHaveCount(0);
  await expect(row('shop-dirty').getByRole('button', { name: 'Open' })).toBeVisible();

  // "Give it to Claude": the words ready, then a new conversation in that folder (the fake Claude answers)
  await row('shop-dirty').getByRole('button', { name: 'Give it to Claude' }).click();
  const ask = row('shop-dirty').locator('.st-ask');
  await expect(ask).toHaveValue(/still has unfinished work: 2 files not committed/);
  await ask.fill(`${await ask.inputValue()} (e2e)`);
  await row('shop-dirty').locator('.st-send').click();
  await expect(page.locator('#toast')).toContainText('Given to Claude', { timeout: 20_000 });
  await expect.poll(async () => JSON.stringify((await (await request.get('/api/chat')).json()).msgs), { timeout: 20_000 }).toContain('@shop-dirty This folder (dirty) still has unfinished work');

  // "Delete" on the clean one: what goes with it, then gone (its branch stays)
  await row('shop-clean').locator('.st-del').click();
  const form = row('shop-clean').locator('.st-form--del');
  await expect(form).toContainText('Nothing in it is uncommitted or unpushed');
  await expect(form).toContainText('node_modules/');
  await form.locator('.st-yes').click();
  await expect(page.locator('#toast')).toContainText('Deleted', { timeout: 30_000 });
  expect(fs.existsSync(wt('shop-clean'))).toBe(false);
  expect(G(repo, 'branch', '--list', 'clean')).toContain('clean');
  await expect(row('shop-clean')).toHaveCount(0, { timeout: 20_000 });
  expect(fs.existsSync(wt('shop-dirty'))).toBe(true);

  // on a phone, in Vietnamese: the actions fit, nothing runs off the side
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?lang=vi');
  await expect(async () => { if (!(await page.locator('#dr-mac').isVisible())) await page.click('#btn-mac'); await expect(page.locator('#dr-mac')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });
  await expect(sec.locator('h3')).toContainText('Việc bỏ quên', { timeout: 30_000 });
  await expect(row('shop-dirty')).toContainText('2 tệp chưa commit', { timeout: 30_000 });
  await expect(row('shop-dirty').getByRole('button', { name: 'Giao Claude làm nốt' })).toBeVisible();
  await sec.scrollIntoViewIfNeeded();
  expect(await sec.evaluate((n) => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
  await sec.screenshot({ path: test.info().outputPath('stranded-phone-vi.png') });
  expect(errors).toEqual([]);
});

test('forgotten work in the demo: fictional folders, nothing touched', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?demo&lang=en');
  await expect(async () => { if (!(await page.locator('#dr-mac').isVisible())) await page.click('#btn-mac'); await expect(page.locator('#dr-mac')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });
  const sec = page.locator('#mac-stranded');
  await expect(sec.locator('.st-row')).toHaveCount(3, { timeout: 30_000 });
  await expect(sec.locator('.st-del')).toHaveCount(1);
  await sec.locator('.st-del').click();
  await expect(sec.locator('.st-form--del')).toContainText('node_modules/, .next/');
  await sec.scrollIntoViewIfNeeded();
  await sec.screenshot({ path: test.info().outputPath('stranded-demo.png') });
  await sec.locator('.st-yes').click();
  await expect(page.locator('#toast')).toContainText('Demo');
  await expect(sec.locator('.st-row')).toHaveCount(3);
  expect(errors).toEqual([]);
});
