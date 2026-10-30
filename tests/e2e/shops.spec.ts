import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config';

// Highlands Coffee on the street (world/backdrops/shop-highlands.js): walking in, and a phin sữa đá ordered at the
// counter and paid. SHOTS_DIR: where the fronts' pictures go.
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
