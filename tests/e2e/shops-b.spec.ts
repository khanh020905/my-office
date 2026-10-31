import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config';

// Katinat, Phúc Long and Long Châu on the street (world/backdrops/shop-katinat.js, shop-phuclong.js, shop-longchau.js):
// walking in and buying at each; the fronts too far off to walk into, painted (shops.js, WALK_INS); and what sends
// someone out to them (people/outings.js): the afternoon trà sữa at Phúc Long, and the work failing again and again
// (something for the headache from Long Châu). SHOTS_DIR: where the pictures go.
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
async function walkIn(page: Page, at: (lx: number, lz: number) => Promise<void>, greeting: RegExp) {
  await at(0, 1.6);
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => !!(window as unknown as Win).__office!.street!.shop.inside()), { timeout: 20_000 }).toBe(true);
  await page.keyboard.up('KeyW');
  await expect(page.locator('.shop-say', { hasText: greeting }).first()).toBeVisible({ timeout: 5_000 });
}
// at a spot by the counter: what it offers, taken, then paid there
async function buy(page: Page, at: (lx: number, lz: number) => Promise<void>, x: number, what: RegExp, shop: RegExp) {
  await at(x, -1.15);
  await expect(page.locator('#fp-near')).toHaveText(what, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('#fp-near')).toHaveText(/1 item/i, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.toast').last()).toHaveText(shop, { timeout: 5_000 });
}

test('Katinat: the navy sign, the evening queue, a roasted oolong ordered at the counter and paid', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await onTheStreet(page, '18:30');
  const at = atFront(page, { key: 'katinat' });
  await at(0, 6.5); await page.waitForTimeout(2000);
  await shot(page, 'katinat-front.png');
  await at(0, 4.6); await page.waitForTimeout(800);
  await shot(page, 'katinat-sign-close.png');
  await walkIn(page, at, /Katinat/);
  await at(1.0, -0.3); await page.waitForTimeout(800);
  await shot(page, 'katinat-inside.png');
  await at(-1.2, -0.95); await page.waitForTimeout(800);   // (the navy wall with the name, where the pictures are taken)
  await shot(page, 'katinat-wall.png');
  await buy(page, at, 0.9, /roasted oolong/i, /Katinat/);
  expect(errors).toEqual([]);
});

test('Phúc Long: the green sign and its crest, a peach tea at the counter', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await onTheStreet(page, '15:00');
  const at = atFront(page, { key: 'phuclong' });
  await at(0, 6.5); await page.waitForTimeout(2000);
  await shot(page, 'phuclong-front.png');
  await at(0, 4.6); await page.waitForTimeout(800);
  await shot(page, 'phuclong-sign-close.png');
  await walkIn(page, at, /Phúc Long/);
  await at(-0.2, -0.3); await page.waitForTimeout(800);
  await shot(page, 'phuclong-inside.png');
  await buy(page, at, 2.3, /peach tea/i, /Phúc Long/);
  expect(errors).toEqual([]);
});

test('Long Châu: the blue sign, the pharmacists in white, a strip of Panadol from the counter', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await onTheStreet(page, '10:00');
  const at = atFront(page, { key: 'longchau' });
  await at(0, 6.5); await page.waitForTimeout(2000);
  await shot(page, 'longchau-front.png');
  await at(0, 4.6); await page.waitForTimeout(800);
  await shot(page, 'longchau-sign-close.png');
  await walkIn(page, at, /Long Châu/);
  await at(0.6, -0.3); await page.waitForTimeout(800);
  await shot(page, 'longchau-inside.png');
  await buy(page, at, 0.9, /Panadol/i, /Long Châu/);
  expect(errors).toEqual([]);
});

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

// the office at a time, the demo's people all resting, sped up
async function resting(page: Page, time: string) {
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); localStorage.setItem('office-tips', 'seen'); } catch { /* private mode */ } });
  await page.goto(`/?demo&debug&layout=pro&at=${time}`);
  await page.waitForFunction(() => (window as unknown as Win).__office?.street, null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(6); });
}

test('the work failing again and again: the office goes red, and someone resting goes down to Long Châu for the headache', async ({ page }) => {
  test.setTimeout(560_000);
  const errors = watchErrors(page);
  await resting(page, '14:00');
  await expect(page.locator('#incident')).toBeHidden({ timeout: 120_000 });   // (the demo's own incident at the start, over)
  // as soon as nobody is out and two are napping at their desks: one session back at work fails three times in a row
  // (incidents.js), in the same breath, so no other trip can start in between
  await expect.poll(() => page.evaluate(() => {
    const o = (window as unknown as Win).__office!;
    if (o.outing || [...o.workers.values()].filter((w) => w.anim === 'sleep' && w.station === 'desk').length < 2) return false;
    const all = [...o.sessions.values()], s = { ...(all.find((x) => o.workers.get(x.id)?.anim !== 'sleep') || all[0]), status: 'work' };
    o.upsert(s);
    for (let k = 0; k < 3; k++) o.emit({ k: 'ev', s, e: { type: 'fail', sess: s.id, text: 'npm test: 3 failed' } });
    return true;
  }), { timeout: 240_000, intervals: [1000] }).toBe(true);
  await expect(page.locator('#incident')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.outing?.shop || ''), { timeout: 20_000 }).toBe('Long Châu');
  const trip = await page.evaluate(() => (window as unknown as Win).__office!.outing);
  expect(trip?.item).toBe('grocery');
  // there, in through the door to the counter (it is the 6th front out: a room, not a painted one)
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.outing?.stage || ''), { timeout: 180_000, intervals: [1000] }).toMatch(/in|back/);
  expect(errors).toEqual([]);
});

test('the afternoon trà sữa: someone resting goes to Phúc Long', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await resting(page, '15:00');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.goOut('tea')), { timeout: 45_000 }).toBe(true);
  const trip = await page.evaluate(() => (window as unknown as Win).__office!.outing);
  expect(trip?.shop).toBe('Phúc Long');
  expect(trip?.item).toBe('cup');
  expect(errors).toEqual([]);
});
