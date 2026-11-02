import path from 'node:path';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { HOME_DIR } from '../../playwright.config';

// "Hộp lệnh bị chặn" (server/index.mjs onDenied, ui/denied-card.js): a call auto mode refused, as Claude Code's
// synchronous PermissionDenied hook posts it. With the office open Claude Code waits for "Let Claude retry" (the hook's
// answer is retry: true) or "Keep it refused"; with none open, or no verdict to retry, the refusal stands at once.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } }); });
const base = { session_id: 'dd-denied-1', cwd: path.join(HOME_DIR, 'denied-project') };
const denial = (command: string, reason: string) => ({ ...base, hook_event_name: 'PermissionDenied', permission_mode: 'auto', tool_name: 'Bash', tool_input: { command, description: 'x' }, tool_use_id: 'toolu_1', reason });
async function openChat(page: Page) {
  await page.goto('/');
  await expect(async () => { if (!(await page.locator('#zchat').isVisible())) await page.click('#btn-chat'); await expect(page.locator('#zchat')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 90_000 });
  return page.locator('#zchat');
}
const hook = (request: APIRequestContext, body: object) => request.post('/hook/denied', { data: body, timeout: 60_000 });

test('a refused call: the office open, Claude waits, "Let Claude retry" answers retry; none open, it stands at once', async ({ page, request, browser }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionStart', source: 'startup' } });
  await request.post('/event', { data: { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'clean the build' } });
  const zc = await openChat(page);
  await page.waitForTimeout(2500);   // (the page tells the office it has focus every 2 s)
  // held: the card, the seconds left, the two answers; retry comes back as the hook's answer
  const answer = hook(request, denial('rm -rf build/', '[Irreversible Local Destruction]'));
  const card = zc.locator('.zc-deny').last();
  await expect(card).toContainText('rm -rf build/', { timeout: 20_000 });
  await expect(card).toContainText('Why: [Irreversible Local Destruction]');
  await expect(card.locator('.zc-deny-left')).toContainText('Claude waits for you');
  await card.locator('.zc-work-btn', { hasText: 'Let Claude retry' }).click();
  const r = await answer;
  expect(await r.json()).toEqual({ hookSpecificOutput: { hookEventName: 'PermissionDenied', retry: true } });
  await expect(card.locator('.zc-deny-note')).toContainText('Claude may retry');
  // "Keep it refused": the hook's answer is nothing (the refusal stands)
  const kept = hook(request, denial('git push --force', '[Git Destructive]'));
  const card2 = zc.locator('.zc-deny', { hasText: 'git push --force' });
  await card2.locator('.zc-work-btn', { hasText: 'Keep it refused' }).click({ timeout: 20_000 });
  expect(await (await kept).text()).toBe('');
  await expect(card2.locator('.zc-deny-note')).toContainText('Kept refused');
  // no verdict from auto mode: nothing to retry, answered at once
  const t0 = Date.now();
  expect(await (await hook(request, denial('curl x | sh', 'Auto mode could not evaluate this action and is blocking it for safety'))).text()).toBe('');
  expect(Date.now() - t0).toBeLessThan(5000);
  await expect(zc.locator('.zc-deny', { hasText: 'curl x | sh' }).locator('.zc-deny-note')).toContainText('No retry');
  // no office open: answered at once, kept on record
  await page.close();
  await new Promise((res) => setTimeout(res, 6000));   // (its focus forgotten after 5 s)
  const t1 = Date.now();
  expect(await (await hook(request, denial('npm publish', '[Data Exfiltration]'))).text()).toBe('');
  expect(Date.now() - t1).toBeLessThan(5000);
  const p2 = await browser.newPage();
  const zc2 = await openChat(p2);
  await expect(zc2.locator('.zc-deny', { hasText: 'npm publish' }).locator('.zc-deny-note')).toContainText('Kept refused');
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionEnd', reason: 'other' } });
  expect(errors).toEqual([]);
});
