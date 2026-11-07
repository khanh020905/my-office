import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config';

// Cloudflare can take a quick tunnel back while cloudflared lives on, retrying for ever ("Tunnel not found" in its log;
// tests/e2e/fake-cloudflared.sh with FAKE_REVOKE): the office notices, stops it, starts another and has its new address
// (server/index.mjs tunnelRevoked), instead of showing a dead one as on.
const tunnel = async (request: APIRequestContext) => (await (await request.get('/api/tunnel')).json()) as { url: string, state: string };
test('a tunnel Cloudflare took back is started again, with a new address', async ({ request }) => {
  test.setTimeout(120_000);
  await request.post('/api/tunnel', { data: { on: false } });   // (a clean start: the switch only starts one that is off)
  fs.writeFileSync(path.join(DATA_DIR, 'fake-revoke'), '');
  await request.post('/api/tunnel', { data: { on: true } });
  await expect.poll(async () => (await tunnel(request)).url, { timeout: 30_000 }).toContain('e2e-revoked');
  await expect.poll(async () => (await tunnel(request)).url, { timeout: 60_000 }).toContain('e2e-office-test');
  expect((await tunnel(request)).state).toBe('on');
  expect(fs.readFileSync(path.join(DATA_DIR, 'actions.log'), 'utf8')).toMatch(/tunnel taken back by Cloudflare https:\/\/e2e-revoked\.trycloudflare\.com/);
  await request.post('/api/tunnel', { data: { on: false } });
  await expect.poll(async () => (await tunnel(request)).state).toBe('off');
});
