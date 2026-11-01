import path from 'node:path';
import { test, expect } from '@playwright/test';
import { HOME_DIR } from '../../playwright.config';

// "Ghi nhớ cho Claude" (server: /api/pins, /hook/start; ui/pins.js): notes pinned for a conversation in the session
// drawer, said to Claude again by the SessionStart hook each time Claude Code compacts it.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'off'); localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } }); });
const base = { session_id: 'pn-pins-0000-1111', cwd: path.join(HOME_DIR, 'pins-project') };
const start = async (request: import('@playwright/test').APIRequestContext, source: string) => {
  const t = await (await request.post('/hook/start', { data: { ...base, hook_event_name: 'SessionStart', source } })).text();
  return t ? JSON.parse(t).hookSpecificOutput?.additionalContext || '' : '';
};

test('pinned in the drawer, said to Claude again after a compaction (only then), unpinned with ✕', async ({ page, request }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionStart', source: 'startup' } });
  await request.post('/event', { data: { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'refactor the parser' } });
  expect(await start(request, 'compact')).toBe('');   // (nothing pinned yet: nothing said)
  await page.goto('/?layout=cozy');
  await page.locator('#rail-list .ri', { hasText: 'pins-project' }).click({ timeout: 120_000 });
  await page.click('#tab-pins');
  const pins = page.locator('#ds-body .pins');
  await expect(pins.locator('.pins-empty')).toBeVisible();
  for (const note of ['commit messages in Vietnamese', 'never push without asking']) { await pins.locator('.pins-in').fill(note); await pins.locator('.pins-in').press('Enter'); }
  await expect(page.locator('#ds-body .pins-list li')).toHaveCount(2);
  await expect(page.locator('#tab-pins')).toHaveText('Pinned (2)');
  // compacted: both said again, and the chat says so; a session that only starts: nothing
  const said = await start(request, 'compact');
  expect(said).toContain('This conversation was just compacted');
  expect(said).toContain('- commit messages in Vietnamese\n- never push without asking');
  expect(await start(request, 'startup')).toBe('');
  expect(await start(request, 'resume')).toBe('');
  await expect.poll(async () => (await (await request.get('/api/chat')).json()).msgs.some((m: { kind: string, text?: string }) => m.kind === 'sys' && /the 2 notes you pinned were said again/.test(m.text || '')), { timeout: 10_000 }).toBe(true);
  // ✕ unpins one; the tab says when they were last said again
  await page.click('#tab-act'); await page.click('#tab-pins');
  await expect(page.locator('#ds-body .pins-said')).toContainText('Last said again at');
  await page.locator('#ds-body .pins-list li', { hasText: 'never push' }).locator('.pins-x').click();
  await expect(page.locator('#ds-body .pins-list li')).toHaveCount(1);
  expect(await start(request, 'compact')).not.toContain('never push');
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionEnd', reason: 'other' } });
  expect(errors).toEqual([]);
});
