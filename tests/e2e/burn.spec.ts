import fs from 'node:fs';
import path from 'node:path';
import { test, expect, devices, type Page, type APIRequestContext } from '@playwright/test';
import { HOME_DIR } from '../../playwright.config';

// What eats your plan (server/otel.mjs, ui/burn.js): the office's OpenTelemetry receiver fed the way Claude Code feeds it
// (the OTLP/HTTP JSON fixtures of tests/fixtures/otel, moved to now), then the panel, the plan card's line, the chat's
// way in on a phone, and what the receiver refuses. In order: the empty state first, before anything is sent.
test.describe.configure({ mode: 'serial' });

const FIX = path.resolve('tests/fixtures/otel');
const A = '6f1c2a0e-1b7d-4c55-9a3e-2d8f0b9c1a11', B = '9b2e4d71-3c8a-4f20-8e1d-5a6c7b8d9e22', C = 'c0ffee00-4a4a-4b4b-8c8c-0d0d0e0e0f0f';
// the fixtures' last moment (12:02 UTC on 30/10) becomes 5 s ago: every time and timestamp moved by the same amount
const SHIFT = Date.now() - 5000 - Date.parse('2026-10-30T12:02:00Z');
function moved(file: string) {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (!x || typeof x !== 'object') return x;
    const o = x as Record<string, unknown>;
    if (o.key === 'event.timestamp') return { key: o.key, value: { stringValue: new Date(Date.parse((o.value as { stringValue: string }).stringValue) + SHIFT).toISOString() } };
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, /UnixNano$/.test(k) && typeof v === 'string' ? String(BigInt(v) + BigInt(SHIFT) * 1_000_000n) : walk(v)]));
  };
  return walk(JSON.parse(fs.readFileSync(path.join(FIX, file), 'utf8')));
}
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
const otlp = (request: APIRequestContext, kind: 'metrics' | 'logs', data: unknown, headers: Record<string, string> = {}) =>
  request.post(`/v1/${kind}`, { headers: { 'Content-Type': 'application/json', ...headers }, data: JSON.stringify(data) });

test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } }); });

test('before any numbers: an honest empty state that says what to do', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?burn&layout=cozy');
  await expect(page.locator('#dr-burn')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#burn-body .bn-empty')).toContainText('No numbers yet');
  await expect(page.locator('#burn-body .bn-empty code')).toHaveText('my-office install');
  await page.click('#dr-burn [data-close]');
  await expect(page.locator('#dr-burn')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the receiver: this computer only, OTLP JSON only, 4 MB at most, the right body for the path', async ({ request }) => {
  const m = moved('metrics-delta-1.json');
  expect((await otlp(request, 'metrics', m, { Origin: 'http://evil.example' })).status()).toBe(403);   // (a web page)
  expect((await request.post('/v1/metrics', { headers: { 'Content-Type': 'application/x-protobuf' }, data: Buffer.from([10, 0]) })).status()).toBe(415);
  expect((await otlp(request, 'metrics', { resourceLogs: [] })).status()).toBe(400);
  expect((await request.post('/v1/logs', { headers: { 'Content-Type': 'application/json' }, data: '{not json' })).status()).toBe(400);
  const big = await request.post('/v1/logs', { headers: { 'Content-Type': 'application/json' }, data: `{"resourceLogs":[],"pad":"${'x'.repeat(4_100_000)}"}` }).catch(() => null);
  if (big) expect(big.status()).toBe(413);   // (or the connection closed on it: either way nothing was read)
  // through the Cloudflare tunnel's listener: from 127.0.0.1, and still the internet
  await request.post('/api/tunnel', { data: { on: true } });
  await expect.poll(async () => (await (await request.get('/api/tunnel')).json()).state, { timeout: 20_000 }).toBe('on');
  const t = await (await request.get('/api/tunnel')).json();
  const via = await request.post(`http://127.0.0.1:${t.port}/v1/metrics`, { headers: { Host: 'e2e-office-test.trycloudflare.com', 'Content-Type': 'application/json' }, data: JSON.stringify(m) });
  expect(via.status()).toBe(403);
  await request.post('/api/tunnel', { data: { on: false } });
  await expect.poll(async () => (await (await request.get('/api/tunnel')).json()).state).toBe('off');
  // nothing of that was counted
  expect((await (await request.get('/api/burn?range=today')).json()).total.usd).toBe(0);
});

test('fed like Claude Code feeds it: the panel ranks who eats the plan, and the sessions add up to the total', async ({ page, request }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  // the sessions' folders: two from the hooks (one a worktree of the same repository), one only from its transcript
  const code = path.join(HOME_DIR, 'code');
  await request.post('/event', { data: { hook_event_name: 'SessionStart', session_id: A, cwd: path.join(code, 'shop-api'), source: 'startup' } });
  await request.post('/event', { data: { hook_event_name: 'SessionStart', session_id: B, cwd: path.join(code, 'shop-api', '.claude', 'worktrees', 'fix-cart'), source: 'startup' } });
  const tdir = path.join(HOME_DIR, '.claude', 'projects', '-e2e-code-landing');
  fs.mkdirSync(tdir, { recursive: true });
  fs.writeFileSync(path.join(tdir, `${C}.jsonl`), `${JSON.stringify({ type: 'user', cwd: path.join(code, 'landing'), sessionId: C })}\n`);
  // the plan's week, from the status line: 46 % used, resetting in three days
  await request.post('/hook/status', { data: { rate_limits: { five_hour: { used_percentage: 12, resets_at: Math.round(Date.now() / 1000) + 3600 }, seven_day: { used_percentage: 46, resets_at: Math.round(Date.now() / 1000) + 3 * 86400 } } } });
  // the events first (every 5 s), then the counters (every minute), and the first counters sent twice (a retry)
  expect((await otlp(request, 'logs', moved('logs.json'))).status()).toBe(200);
  for (const f of ['metrics-delta-1.json', 'metrics-delta-1.json', 'metrics-delta-2.json']) expect((await otlp(request, 'metrics', moved(f))).status()).toBe(200);

  const d = await (await request.get('/api/burn?range=today')).json();
  expect(d.total.usd).toBeCloseTo(1.77, 9);   // (A and B from their counters, C from its events: nothing twice)
  const sum = (xs: { usd: number }[]) => xs.reduce((a, x) => a + x.usd, 0);
  expect(sum(d.sessions) + d.rest.usd).toBeCloseTo(d.total.usd, 9);
  expect(sum(d.by.model)).toBeCloseTo(d.total.usd, 9);
  expect(sum(d.projects)).toBeCloseTo(d.total.usd, 9);
  expect(d.projects.map((p: { name: string }) => p.name)).toEqual(['shop-api', 'landing']);
  expect(d.plan.pct).toBe(46);

  await page.goto('/?layout=cozy');
  await expect(page.locator('#btn-plan')).toBeVisible({ timeout: 60_000 });
  // the plan card's line: today's cost and the two that eat most, a way into the panel
  await page.click('#btn-plan');
  await expect(page.locator('#plan-burn')).toContainText('Today: $1.77 · MCP github 17%');
  await page.click('#plan-burn');
  const body = page.locator('#burn-body');
  await expect(page.locator('#dr-burn')).toBeVisible();
  await expect(page.locator('#pop-plan')).toBeHidden();
  await expect(body.locator('.bn-total')).toHaveText('$1.77');
  await expect(body.locator('.bn-plan')).toHaveText('≈ 46% of your weekly limit');
  const rank = body.locator('.bn-rank li');
  await expect(rank.first()).toContainText('MCP');
  await expect(rank.first()).toContainText('github');
  await expect(rank.first()).toContainText('17%');
  await expect(rank.last()).toContainText('Claude on its own');
  await expect(body).toContainText('Opus 5.5');
  await expect(body).toContainText('Subagents');
  // the session rows, as shown, add up to the total shown
  const costs = await body.locator('.bn-sec').filter({ hasText: 'By session' }).locator('li small').allTextContents();
  expect(costs).toHaveLength(3);
  expect(costs.reduce((a, c) => a + Number(c.replace(/[^\d.]/g, '')), 0)).toBeCloseTo(1.77, 2);
  await expect(body.locator('.bn-sum')).toHaveText('The sessions add up to the total: $1.77.');
  await page.screenshot({ path: test.info().outputPath('burn-today.png') });
  // 7 days: a column a day
  await page.click('#burn-range [data-range="7d"]');
  await expect(body.locator('.bn-days .bn-day')).toHaveCount(7);
  await expect(body.locator('.bn-total')).toHaveText('$1.77');
  await page.screenshot({ path: test.info().outputPath('burn-7d.png') });
  // Escape closes it; the Mac drawer opening closes it too
  await page.keyboard.press('Escape');
  await expect(page.locator('#dr-burn')).toBeHidden();
  expect(errors).toEqual([]);
});

test.describe('on a phone', () => {
  const { defaultBrowserType: _browser, ...iphone } = devices['iPhone 14'];
  void _browser;
  test.use({ ...iphone, deviceScaleFactor: 1 });
  test('from the group chat: the panel as a full-screen sheet, nothing wider than the screen, in Vietnamese', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await page.goto('/?layout=cozy&lang=vi');
    await expect(page.locator('html')).toHaveClass(/is-phone/, { timeout: 60_000 });
    await page.locator('.ph-tabs .ph-tab').nth(4).click();   // (Chat)
    await expect(page.locator('#zchat')).toBeVisible();
    await page.locator('#zchat .zc-bar button[title="Thêm"]').click();
    await page.locator('#zchat .zc-more-o', { hasText: 'Cái gì đang ăn gói' }).click();
    await expect(page.locator('#zchat')).toBeHidden();
    const sheet = page.locator('#dr-burn');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.bn-total')).toHaveText('$1,77');
    await expect(sheet.locator('.bn-plan')).toHaveText('≈ 46% hạn mức tuần');
    await expect(sheet).toContainText('Ai ăn nhiều nhất');
    const box = (await sheet.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)).toBeLessThanOrEqual(0);
    expect(await sheet.evaluate((n) => [...n.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).length)).toBe(0);
    await page.screenshot({ path: test.info().outputPath('burn-phone.png'), fullPage: false });
    await page.locator('.ph-tabs .ph-tab').nth(0).click();   // (Văn phòng: shuts what is open)
    await expect(sheet).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test('the demo shows the panel with made-up numbers that add up', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?demo&layout=cozy&burn=7d');
  const body = page.locator('#burn-body');
  await expect(body.locator('.bn-total')).toBeVisible({ timeout: 60_000 });
  await expect(body.locator('.bn-days .bn-day')).toHaveCount(7);
  await expect(body.locator('.bn-rank li').first()).toContainText('github');
  await expect(body.locator('.bn-plan')).toHaveText('≈ 46% of your weekly limit');
  await body.locator('.bn-week').scrollIntoViewIfNeeded();
  await page.locator('#dr-burn').screenshot({ path: test.info().outputPath('burn-demo-week.png') });
  expect(errors).toEqual([]);
});
