import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config';

// The fronts too far off to walk into, painted (world/backdrops/shops.js, WALK_INS): no door, and you cannot get in.
// SHOTS_DIR: where the pictures go.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
type Door = { key: string, x: number, z: number, face: number };
type Front = Door & { room: boolean, far: boolean };
type Office = { street?: { doors: () => Door[], shop: { inside: () => unknown, fronts: () => Front[] } }, fp: { street: boolean, pos?: { x: number, y: number, set: (x: number, z: number) => void }, yaw?: number },
  fpToStreet: () => void, goOut: (kind: string, key?: string) => boolean, outing: { stage: string, id?: string, shop?: string, item?: string } | null,
  sessions: Map<string, { id: string }>, workers: Map<string, { anim?: string, station?: string }>, upsert: (s: object) => void, emit: (m: object) => void, pauseDemo: () => void, speed: (n: number) => void };
type Win = { __office?: Office };

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
async function onTheStreet(page: Page, time: string) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); localStorage.setItem('office-tips', 'seen'); } catch { /* private mode */ } });
  await page.goto(`/?demo&debug&layout=pro&at=${time}`);
  await page.waitForFunction(() => (window as unknown as Win).__office?.street, null, { timeout: 30_000 });
  await page.click('#btn-fp');
  await page.evaluate(() => (window as unknown as Win).__office!.fpToStreet());
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.fp.street), { timeout: 10_000 }).toBe(true);
}
// stand at a point of one front (its frame: x along it, z out to the street), looking in (or out: look > 0)
const atFront = (page: Page, pickFront: { key?: string, far?: boolean }) => (lx: number, lz: number, look = -1) => page.evaluate(([want, lx, lz, look]) => {
  const o = (window as unknown as Win).__office!, w0 = want as { key?: string, far?: boolean };
  const d = o.street!.shop.fronts().find((f) => (!w0.key || f.key === w0.key) && (w0.far == null || f.far === w0.far))!;
  const rot = d.face === Math.PI ? 0 : Math.PI / 2, fx = d.x - (rot ? 0.45 : 0), fz = d.z - (rot ? 0 : 0.45);
  const w = (x: number, z: number) => (rot ? [fx + z, fz - x] : [fx + x, fz + z]), [x, z] = w(lx as number, lz as number), [ax, az] = w(lx as number, (lz as number) + (look as number));
  o.fp.pos!.set(x, z); o.fp.yaw = Math.atan2(ax - x, az - z);
}, [pickFront, lx, lz, look] as const);
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = await page.addStyleTag({ content: '.fp-help, .zc-peek, .toast { visibility: hidden !important }' });
  await page.screenshot({ path: path.join(SHOTS, name) });
  await tag.evaluate((n) => (n as Element).remove());
}

test('the fronts too far off to walk into: painted, no door, and you cannot get in', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await onTheStreet(page, '19:30');
  const fronts = await page.evaluate(() => (window as unknown as Win).__office!.street!.shop.fronts());
  const chains = fronts.filter((f) => f.room || f.far);
  expect(fronts.length).toBeGreaterThanOrEqual(10);
  expect(chains.filter((f) => f.room).length).toBe(8);   // (WALK_INS: the nearest eight chains are rooms)
  expect(chains.slice(0, 8).every((f) => f.room)).toBe(true);
  expect(chains.slice(8).every((f) => f.far && !f.room)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Win).__office!.street!.doors().length)).toBe(8);
  const at = atFront(page, { far: true });
  await at(0, 6.5); await page.waitForTimeout(2000);
  await shot(page, 'far-front.png');
  // walking at its glass: stopped at the front, never inside
  await at(0, 1.4);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => !!(window as unknown as Win).__office!.street!.shop.inside())).toBe(false);
  const z = await page.evaluate(() => { const o = (window as unknown as Win).__office!, d = o.street!.shop.fronts().find((f) => f.far)!, p = o.fp.pos!; return d.face === Math.PI ? p.y - (d.z - 0.45) : p.x - (d.x - 0.45); });   // (pos: x and z as a 2D vector's x, y)
  expect(z).toBeGreaterThan(0);   // (still on the pavement's side of the glass)
  expect(errors).toEqual([]);
});
