import fs from 'node:fs';
import path from 'node:path';
import { test, expect, devices } from '@playwright/test';
import { HOME_DIR } from '../../playwright.config';

// A session's own page on a phone (src/office/ui/session-compose.js): the six tiles are one line of chips, and a box under
// the conversation writes to the session the way the group chat's "Gửi tới" does (POST /api/tasks { sid, text, chat }),
// with what was sent and its progress above the box and the answer in the conversation. tests/e2e/fake-claude.sh answers.
const { defaultBrowserType: _browser, ...iphone } = devices['iPhone 14'];
void _browser;
test.use({ ...iphone, deviceScaleFactor: 1 });

const PROJ = path.join(HOME_DIR, 'compose-proj'), TRANSCRIPT = path.join(HOME_DIR, 'e2e-compose.jsonl');
const line = (type: string, content: unknown) => JSON.stringify({ type, timestamp: new Date().toISOString(), message: { content } });

test('a session page on a phone: one line of chips, a box that writes to the session, what was sent, and its answer', async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'on'); localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  fs.mkdirSync(PROJ, { recursive: true });
  fs.writeFileSync(TRANSCRIPT, `${line('user', 'first question')}\n${line('assistant', [{ type: 'text', text: 'first answer' }])}\n`);
  const sid = `e2e-compose-${Date.now()}`;
  await request.post('/event', { data: { session_id: sid, cwd: PROJ, transcript_path: TRANSCRIPT, hook_event_name: 'SessionStart', source: 'startup' } });
  await expect.poll(async () => (await (await request.get('/api/tasks')).json()).sessions.some((s: { sid: string }) => s.sid === sid), { timeout: 20_000 }).toBe(true);

  const bodies: Record<string, unknown>[] = [];
  await page.route('**/api/tasks?*', (r) => r.continue());
  await page.route(/\/api\/tasks(\?.*)?$/, (r) => { if (r.request().method() === 'POST') bodies.push(r.request().postDataJSON()); return r.continue(); });
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/is-phone/, { timeout: 60_000 });
  // (on a phone the sessions are the "Phiên" tab's list: the 2D list makes way for the Tổng quan sheet)
  await page.locator('.ph-tabs .ph-tab').nth(1).click();
  await page.locator('.side-left').getByText('compose-proj').first().click();
  const drawer = page.locator('#dr-session');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('.chat')).toContainText('first answer', { timeout: 20_000 });

  // the stats: one line of chips, the conversation tabs right under them
  const tops = await drawer.locator('.counts li').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops).toHaveLength(6);
  expect(new Set(tops).size).toBe(1);
  expect((await drawer.locator('.counts').boundingBox())!.height).toBeLessThan(60);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

  // writing to it: the very conversation (its sid), as the chat does
  const box = drawer.locator('.ds-cmp-in');
  await expect(box).toBeVisible();
  await expect(drawer.locator('.ds-cmp-send')).toBeDisabled();
  await box.fill('what are you on?');
  await drawer.locator('.ds-cmp-send').click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toMatchObject({ sid, text: 'what are you on?', chat: true });
  expect(bodies[0].images).toEqual([]);
  await expect(box).toHaveValue('');
  const sent = drawer.locator('.ds-sent-i').first();
  await expect(sent).toContainText('what are you on?');
  // the run answers (its transcript gets the new turn): it is done, and the answer is on this page
  fs.appendFileSync(TRANSCRIPT, `${line('user', 'what are you on?')}\n${line('assistant', [{ type: 'text', text: 'answer on the page' }])}\n`);
  await expect(sent).toHaveAttribute('data-state', 'done', { timeout: 40_000 });
  await expect(drawer.locator('.chat')).toContainText('answer on the page', { timeout: 20_000 });
  // the box stays inside the sheet on a phone (above the tab bar)
  const b = (await drawer.locator('.ds-compose').boundingBox())!, tab = (await page.locator('.ph-tabs').boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(tab.y + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
