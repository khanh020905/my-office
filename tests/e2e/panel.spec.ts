import path from 'node:path';
import { test, expect } from '@playwright/test';
import { DATA_DIR, HOME_DIR } from '../../playwright.config';

// The small panel (app/panel, src/panel/main.js), as in the editor's side bar: the sessions, one at work first, and a
// request to approve held for it while it is looked at; "Allow" answers Claude Code's hook.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); } catch { /* private mode */ } }); });

test('the panel: who works, who rests, a request to approve, allowed from it', async ({ page, request }) => {
  test.setTimeout(120_000);
  const at = (sid: string) => ({ session_id: sid, cwd: path.join(HOME_DIR, sid), transcript_path: path.join(HOME_DIR, `${sid}.jsonl`) });
  for (const sid of ['panel-api', 'panel-docs']) await request.post('/event', { data: { ...at(sid), hook_event_name: 'SessionStart', source: 'startup' } });
  await request.post('/event', { data: { ...at('panel-api'), hook_event_name: 'UserPromptSubmit', prompt: 'make the tests pass' } });
  await request.post('/event', { data: { ...at('panel-api'), hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: path.join(HOME_DIR, 'panel-api', 'cart.ts') } } });
  await page.setViewportSize({ width: 340, height: 720 });
  await page.goto('/panel?embed=ide');
  const rows = page.locator('.pn-sess');
  await expect(rows.filter({ hasText: 'panel-api' })).toHaveClass(/is-work/);
  await expect(rows.filter({ hasText: 'panel-docs' })).toHaveClass(/is-rest/);
  await expect(page.locator('#pn-sum')).toContainText('1 working');
  await page.locator('.pn-body').click({ position: { x: 5, y: 5 } });   // (looked at: requests are held for it)
  expect(await page.evaluate(() => document.hasFocus())).toBe(true);
  await page.waitForTimeout(2500);   // (it says so every 2 s)
  // Claude Code asks: the hook waits for the answer
  const asked = request.post('/hook/permission', { data: { ...at('panel-api'), hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Run the tests' } } });
  const card = page.locator('.pn-perm');
  await expect(card).toContainText('npm test');
  await expect(rows.filter({ hasText: 'panel-api' })).toHaveClass(/is-wait/);
  await page.screenshot({ path: path.join(SHOTS, 'panel.png') });
  await card.locator('.pn-btn--ok').click();
  expect(await (await asked).text()).toContain('allow');
  await expect(card).toHaveCount(0);
  for (const sid of ['panel-api', 'panel-docs']) await request.post('/event', { data: { ...at(sid), hook_event_name: 'SessionEnd', reason: 'other' } });
});
