import { test, expect, type APIRequestContext } from '@playwright/test';

// A fixed address on your own domain (server/index.mjs setTunnelDomain, tests/e2e/fake-cloudflared.sh): from a quick
// tunnel's random address to https://office.example.test (login, tunnel, DNS name, then run as that name), shown in the
// phone window; back to a quick one when dropped.
type T = { url: string, state: string, fixed: string, domain: { state: string } | null };
const tunnel = async (request: APIRequestContext) => (await (await request.get('/api/tunnel')).json()) as T;
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } }); });

test('a fixed address on your own domain, set up from the phone window', async ({ page, request }) => {
  test.setTimeout(150_000);
  await request.post('/api/tunnel', { data: { on: false } });   // (a clean start)
  await request.post('/api/tunnel', { data: { on: true } });
  await expect.poll(async () => (await tunnel(request)).url, { timeout: 30_000 }).toContain('trycloudflare.com');
  expect((await (await request.post('/api/tunnel/domain', { data: { host: 'not a host' } })).json()).ok).toBe(false);
  // from the phone window
  await page.goto('/');
  await page.click('#btn-phone-top');
  await page.locator('#pm-body .pm-tab', { hasText: 'out' }).click();
  const field = page.locator('.pm-fixed-in');
  await field.fill('office.example.test');
  await page.locator('.pm-fixed-form button').click();
  await expect.poll(async () => (await tunnel(request)).url, { timeout: 60_000 }).toBe('https://office.example.test');
  const t = await tunnel(request);
  expect(t).toMatchObject({ state: 'on', fixed: 'office.example.test' });
  await expect(page.locator('#pm-body')).toContainText('https://office.example.test', { timeout: 20_000 });
  await expect(page.locator('.pm-fixed')).toContainText('Back to a temporary address');
  // dropped: a quick one again
  await page.locator('.pm-fixed .btn').click();
  await expect.poll(async () => (await tunnel(request)).url, { timeout: 60_000 }).toContain('trycloudflare.com');
  expect((await tunnel(request)).fixed).toBe('');
  await request.post('/api/tunnel', { data: { on: false } });
  await expect.poll(async () => (await tunnel(request)).state).toBe('off');
});
