import path from 'node:path';
import { test, expect, devices, type Page, type APIRequestContext } from '@playwright/test';
import { HOME_DIR } from '../../playwright.config';

// The stuck-loop breaker (server/loops.mjs, ui/stuck.js): the hooks of a session that runs the same failing command
// again and again, the call that gets denied, the card in the chat with Stop and a hint, and Settings.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } }); });

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
const openChat = (p: Page) => expect(async () => { if (!(await p.locator('#zchat').isVisible())) await p.click('#btn-chat'); await expect(p.locator('#zchat')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });

// a session, then `npm test` failing the same way `times` times (each try asked of the synchronous hook first)
async function loopingSession(request: APIRequestContext, sid: string, times = 3) {
  const base = { session_id: sid, cwd: path.join(HOME_DIR, sid), transcript_path: path.join(HOME_DIR, `${sid}.jsonl`) };   // (a folder of its own: the person is named after it)
  const call = { ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Run the tests' } };
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionStart', source: 'startup' } });
  await request.post('/event', { data: { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'make the tests pass' } });
  for (let i = 0; i < times; i++) {
    const r = await request.post('/hook/loop', { data: call });
    expect(await r.text()).toBe('');   // (let through: nothing to say)
    await request.post('/event', { data: call });
    await request.post('/event', { data: { ...call, hook_event_name: 'PostToolUseFailure', error: `Exit code 1\nError: connect ECONNREFUSED 127.0.0.1:5432 (after ${100 + i * 37}ms)`, is_interrupt: false } });
  }
  // another try: the synchronous hook's answer (Claude Code runs the async one beside it, which marks the step begun)
  const check = async () => {
    const [r] = await Promise.all([request.post('/hook/loop', { data: call }), request.post('/event', { data: call })]);
    const t = await r.text(); return t ? JSON.parse(t) : null;
  };
  const end = () => request.post('/event', { data: { ...base, hook_event_name: 'SessionEnd', reason: 'other' } });   // (gone: the next test's office has only its own)
  return { base, call, check, end, name: `${sid}-${sid.slice(0, 2)}` };
}

test('a command failing the same way three times: the fourth is denied, a card in the chat, Stop and a hint from it', async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const sid = `e2e-stuck-${Date.now()}`;
  const s = await loopingSession(request, sid);
  // the fourth try: denied, with a reason Claude reads; quickly (the hook waits 0.3 s at most)
  const t0 = Date.now();
  const out = await s.check();
  expect(Date.now() - t0).toBeLessThan(300);
  expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
  expect(out.hookSpecificOutput.permissionDecisionReason).toContain('3 times');
  // another command goes through
  expect(await (await request.post('/hook/loop', { data: { ...s.call, tool_input: { command: 'npm run lint' } } })).text()).toBe('');

  await page.goto('/');
  await openChat(page);
  const zc = page.locator('#zchat');
  const card = zc.locator('.zc-loop').last();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText('ran npm test and got the same error 3 times: try 4 blocked');
  await expect(card.locator('.zc-loop-t code')).toHaveText('npm test');
  await expect(card.locator('.zc-loop-stop')).toBeVisible();
  // the person is marked stuck in the list
  await expect(page.locator(`#rail-list .ri[data-stuck="1"]`)).toHaveCount(1);
  await expect(page.locator('#rail-list .ri[data-stuck="1"] .ri-doing')).toContainText('npm test');

  // a hint: Claude reads it with its next step (here the same call again, denied again)
  await card.locator('.zc-loop-hint-btn').click();
  await card.locator('.zc-loop-in').fill('The database is not running: use the in-memory one (DB=memory)');
  await card.locator('.zc-loop-form button[type="submit"]').click();
  await expect(card.locator('.zc-loop-hint')).toContainText('Hint sent', { timeout: 20_000 });
  const next = await s.check();
  expect(next.hookSpecificOutput.permissionDecision).toBe('deny');
  expect(next.hookSpecificOutput.permissionDecisionReason).toContain('DB=memory');
  await expect(card.locator('.zc-loop-hint')).toContainText('Claude got your hint', { timeout: 20_000 });
  await expect(card).toContainText('try 5 blocked');
  // a step that isn't the loop gets nothing more: the hint went once
  expect(await (await request.post('/hook/loop', { data: { ...s.call, tool_input: { command: 'ls' } } })).text()).toBe('');

  // Stop (tapped twice): the session's next step ends its turn
  await card.locator('.zc-loop-stop').click();
  await expect(card.locator('.zc-loop-stop')).toHaveText('Tap again to stop');
  await card.locator('.zc-loop-stop').click();
  await expect(card.locator('.zc-loop-note')).toHaveText('Stops at its next step', { timeout: 20_000 });
  expect(await s.check()).toEqual({ continue: false, stopReason: 'Stopped from My Office by the user.' });
  await expect(card.locator('.zc-loop-note')).toHaveText('Stopped', { timeout: 20_000 });
  // its turn over: no longer stuck, and the next prompt is yours to drive (nothing denied)
  await request.post('/event', { data: { ...s.base, hook_event_name: 'Stop', last_assistant_message: 'Stopped.' } });
  await expect(page.locator('#rail-list .ri[data-stuck="1"]')).toHaveCount(0, { timeout: 20_000 });
  await request.post('/event', { data: { ...s.base, hook_event_name: 'UserPromptSubmit', prompt: 'the database is up now, try again' } });
  expect(await s.check()).toBeNull();
  await s.end();
  expect(errors).toEqual([]);
});

test('Settings: the breaker can be turned off (then nothing is denied) and its threshold changed', async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(async () => { if (!(await page.locator('#pop-look').isVisible())) await page.click('#btn-look'); await expect(page.locator('#pop-look')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });
  await page.click('#st-tab-more');
  const box = page.locator('#st-loop');
  await expect(box).toBeVisible({ timeout: 20_000 });
  await expect(box.locator('[data-loop-n="3"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(box.locator('[data-loop-min="10"]')).toHaveAttribute('aria-pressed', 'true');
  await box.locator('[data-loop-n="2"]').click();
  await expect(box.locator('[data-loop-n="2"]')).toHaveAttribute('aria-pressed', 'true');
  const two = await loopingSession(request, `e2e-stuck-two-${Date.now()}`, 2);
  expect((await two.check()).hookSpecificOutput.permissionDecision).toBe('deny');
  await box.locator('[data-loop-tgl]').click();
  await expect(box.locator('[data-loop-tgl]')).toHaveAttribute('aria-checked', 'false');
  const off = await loopingSession(request, `e2e-stuck-off-${Date.now()}`, 5);
  expect(await off.check()).toBeNull();
  // back as it was, for the other tests
  await box.locator('[data-loop-tgl]').click();
  await box.locator('[data-loop-n="3"]').click();
  await expect(box.locator('[data-loop-n="3"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await (await request.get('/api/loop')).json())).toMatchObject({ on: true, n: 3, min: 10 });
  await two.end(); await off.end();
  expect(errors).toEqual([]);
});

test('in the office: the stuck person\'s name tag goes red with "stuck" on it, and back when it moves again', async ({ page, request }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => { try { localStorage.setItem('office-lite', 'off'); localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?layout=cozy');
  await expect(page.locator('#stage canvas')).toBeVisible({ timeout: 120_000 });
  const s = await loopingSession(request, `st-${Date.now() % 1e6}`);   // (a short name: the tag shows 26 characters)
  expect((await s.check()).hookSpecificOutput.permissionDecision).toBe('deny');
  const tag = page.locator('.tag.tag--stuck', { hasText: s.name });
  await expect(tag).toHaveCount(1, { timeout: 60_000 });
  await expect(tag.locator('.tag-stuck')).toHaveText('stuck');
  await page.screenshot({ path: path.join(test.info().project.outputDir, 'stuck-tag.png') });   // (kept after the run, to look at)
  // it edits a file: moving again
  await request.post('/event', { data: { ...s.base, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: '/e2e/db.js', old_string: 'a', new_string: 'b' } } });
  await expect(page.locator('.tag.tag--stuck', { hasText: s.name })).toHaveCount(0, { timeout: 20_000 });
  await s.end();
  expect(errors).toEqual([]);
});

test.describe('on a phone', () => {
  const { defaultBrowserType: _browser, ...iphone } = devices['iPhone 14'];
  void _browser;
  test.use({ ...iphone, deviceScaleFactor: 1 });
  test('the card and its hint box fit the screen', async ({ page, request }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    const s = await loopingSession(request, `e2e-stuck-phone-${Date.now()}`);
    await s.check();
    await page.goto('/?lang=vi');
    await expect(async () => { if (!(await page.locator('#zchat').isVisible())) await page.locator('.ph-tabs .ph-tab').nth(4).click(); await expect(page.locator('#zchat')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });
    const card = page.locator('#zchat .zc-loop').last();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toContainText('lỗi y hệt 3 lần — đã chặn lần 4');
    await card.locator('.zc-loop-hint-btn').click();
    await expect(card.locator('.zc-loop-in')).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: path.join(test.info().project.outputDir, 'stuck-phone.png') });   // (kept after the run, to look at)
    await s.end();
    expect(errors).toEqual([]);
  });
});
