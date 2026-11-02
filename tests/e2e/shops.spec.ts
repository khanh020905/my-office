import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR, HOME_DIR } from '../../playwright.config';

// Highlands Coffee and Thế Giới Di Động on the street (world/backdrops/shop-highlands.js, shop-tgdd.js): walking in,
// what each sends someone out for (the day's first cà phê; "lên đời" when Claude Code moves to a new version), and the
// server's watch on Claude Code's version (server/claude-version.mjs). SHOTS_DIR: where the fronts' pictures go.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
type Door = { key: string, x: number, z: number, face: number };
type Office = { street?: { doors: () => Door[], shop: { inside: () => unknown } }, fp: { street: boolean, pos?: { set: (x: number, z: number) => void }, yaw?: number },
  fpToStreet: () => void, goOut: (kind: string, key?: string) => boolean, outing: { stage: string, id?: string, shop?: string, item?: string } | null,
  sessions: Map<string, object>, upsert: (s: object) => void, pauseDemo: () => void, speed: (n: number) => void };
type Win = { __office?: Office };

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
// the office in first person, out on the street; at(): stand at a point of one shop (its frame: x along the front, z out
// to the street), looking in (or out, look > 0)
async function onTheStreet(page: Page, time: string) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); localStorage.setItem('office-tips', 'seen'); } catch { /* private mode */ } });
  await page.goto(`/?demo&debug&layout=pro&at=${time}`);
  await page.waitForFunction(() => (window as unknown as Win).__office?.street, null, { timeout: 30_000 });
  await page.click('#btn-fp');
  await page.evaluate(() => (window as unknown as Win).__office!.fpToStreet());
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.fp.street), { timeout: 10_000 }).toBe(true);
}
const atShop = (page: Page, key: string) => (lx: number, lz: number, look = -1) => page.evaluate(([key, lx, lz, look]) => {
  const o = (window as unknown as Win).__office!, d = o.street!.doors().find((x) => x.key === key)!;
  const rot = d.face === Math.PI ? 0 : Math.PI / 2, fx = d.x - (rot ? 0.45 : 0), fz = d.z - (rot ? 0 : 0.45);
  const w = (x: number, z: number) => (rot ? [fx + z, fz - x] : [fx + x, fz + z]), [x, z] = w(lx as number, lz as number), [ax, az] = w(lx as number, (lz as number) + (look as number));
  o.fp.pos!.set(x, z); o.fp.yaw = Math.atan2(ax - x, az - z);
}, [key, lx, lz, look] as const);
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = await page.addStyleTag({ content: '.fp-help, .zc-peek, .toast { visibility: hidden !important }' });
  await page.screenshot({ path: path.join(SHOTS, name) });
  await tag.evaluate((n) => (n as Element).remove());
}
async function walkIn(page: Page, at: (lx: number, lz: number) => Promise<void>, greeting: RegExp) {
  await at(0, 1.6);
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => !!(window as unknown as Win).__office!.street!.shop.inside()), { timeout: 20_000 }).toBe(true);
  await page.keyboard.up('KeyW');
  await expect(page.locator('.shop-say', { hasText: greeting }).first()).toBeVisible({ timeout: 5_000 });
}

test('walking into the Highlands Coffee: the deep red sign, a phin sữa đá ordered at the counter and paid', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await onTheStreet(page, '08:30');
  const at = atShop(page, 'highlands');
  await at(0, 5.5); await page.waitForTimeout(1500);
  await shot(page, 'highlands-front.png');
  await walkIn(page, at, /Highlands/);
  await at(1.2, -0.3); await page.waitForTimeout(800);
  await shot(page, 'highlands-inside.png');
  await at(0.9, -1.15);
  await expect(page.locator('#fp-near')).toHaveText(/iced milk coffee/i, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('#fp-near')).toHaveText(/1 item/i, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.toast').last()).toHaveText(/Highlands/, { timeout: 5_000 });
  expect(errors).toEqual([]);
});

test('walking into Thế Giới Di Động: the yellow sign, the dancer at the door, a phone case from the table paid at the till', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await onTheStreet(page, '15:00');
  const at = atShop(page, 'tgdd');
  await at(0, 6.5); await page.waitForTimeout(2000);
  await shot(page, 'tgdd-front.png');
  await at(-1.4, 3.2); await page.waitForTimeout(800);
  await shot(page, 'tgdd-sign-close.png');
  await walkIn(page, at, /Thế Giới Di Động/);
  await at(0.3, -0.4); await page.waitForTimeout(800);
  await shot(page, 'tgdd-inside.png');
  await at(-0.75, -1.6);
  await expect(page.locator('#fp-near')).toHaveText(/phone case/i, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await at(2.4, -1.95);
  await expect(page.locator('#fp-near')).toHaveText(/1 item/i, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.toast').last()).toHaveText(/Thế Giới Di Động/, { timeout: 5_000 });
  expect(errors).toEqual([]);
});

test('the day\'s first cà phê at the Highlands, and "lên đời" at Thế Giới Di Động when Claude Code moves to a new version', async ({ page }) => {
  test.setTimeout(380_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); localStorage.setItem('office-tips', 'seen'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=08:00');
  await page.waitForFunction(() => (window as unknown as Win).__office?.street, null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(6); });
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.goOut('morning')), { timeout: 45_000 }).toBe(true);
  let trip = await page.evaluate(() => (window as unknown as Win).__office!.outing);
  expect(trip?.shop).toBe('Highlands Coffee');
  expect(trip?.item).toBe('cup');
  await expect.poll(() => page.evaluate(() => !(window as unknown as Win).__office!.outing), { timeout: 250_000 }).toBe(true);   // (back up with it: the café is further than the nearest stores, Bách Hóa Xanh and Điện Máy Xanh among them, ~2–3 min at 6×)
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.goOut('upgrade', '2.1.313')), { timeout: 45_000 }).toBe(true);
  trip = await page.evaluate(() => (window as unknown as Win).__office!.outing);
  expect(trip?.shop).toBe('Thế Giới Di Động');
  expect(trip?.item).toBe('grocery');
  expect(errors).toEqual([]);
});

test('the server watches Claude Code\'s version: a newer extension folder is news (once), the first one seen is not', async ({ request }) => {
  test.setTimeout(90_000);
  const n = Math.floor(Date.now() / 1000) % 1_000_000, v1 = `9.${n}.1`, v2 = `9.${n}.2`;   // (newer than any earlier run's)
  const ext = path.join(HOME_DIR, '.vscode', 'extensions');
  fs.mkdirSync(path.join(ext, `anthropic.claude-code-${v1}-darwin-arm64`), { recursive: true });
  await expect.poll(async () => (await (await request.get('/api/claude-version')).json()).version, { timeout: 30_000, intervals: [2000] }).toBe(v1);
  fs.mkdirSync(path.join(ext, `anthropic.claude-code-${v2}-darwin-arm64`), { recursive: true });
  await expect.poll(async () => (await (await request.get('/api/claude-version')).json()).version, { timeout: 30_000, intervals: [2000] }).toBe(v2);
  const r = await (await request.get('/api/claude-version')).json();
  expect(r.prev).toBe(v1);
  expect(r.at).toBeGreaterThan(0);
});
