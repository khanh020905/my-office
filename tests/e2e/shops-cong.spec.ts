import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config';

// Cộng Cà Phê on the street (world/backdrops/shop-cong.js): walking in, ordering at the counter and sitting on its low
// stool; the painted front where it is further off (Hải Phòng); which cities have one; and the cốt dừa trips from the
// office (people/outings.js). SHOTS_DIR: where the pictures go.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
type Front = { key: string, x: number, z: number, face: number, room: boolean, far: boolean };
type Office = { street?: { shop: { inside: () => unknown, fronts: () => Front[] } }, fp: { street: boolean, pos?: { set: (x: number, z: number) => void }, yaw?: number, pitch?: number },
  fpToStreet: () => void, goOut: (kind: string, key?: string) => boolean, outing: { stage: string, id?: string, shop?: string, item?: string } | null, wx: { city: string },
  chat: { msgs: { text?: string }[] }, sessions: Map<string, { id: string }>, upsert: (s: object) => void, pauseDemo: () => void, speed: (n: number) => void };
type Win = { __office?: Office };

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
async function open(page: Page, query: string) {
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); localStorage.setItem('office-tips', 'seen'); } catch { /* private mode */ } });
  await page.goto(`/?demo&debug&layout=pro&${query}`);
  await page.waitForFunction(() => (window as unknown as Win).__office?.street, null, { timeout: 30_000 });
}
// the city whose shops line the street (as picked for the weather): set straight, no weather fetched
const city = (page: Page, c: string) => page.evaluate((c) => { (window as unknown as Win).__office!.wx.city = c; }, c);
async function toStreet(page: Page) {
  await page.click('#btn-fp');
  await page.evaluate(() => (window as unknown as Win).__office!.fpToStreet());
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.fp.street), { timeout: 10_000 }).toBe(true);
}
// stand at a point of Cộng's front (its frame: x along it, z out to the street), looking in (or out: look > 0)
const atCong = (page: Page) => (lx: number, lz: number, look = -1, pitch = 0) => page.evaluate(([lx, lz, look, pitch]) => {
  const o = (window as unknown as Win).__office!, d = o.street!.shop.fronts().find((f) => f.key === 'cong')!;
  const rot = d.face === Math.PI ? 0 : Math.PI / 2, fx = d.x - (rot ? 0.45 : 0), fz = d.z - (rot ? 0 : 0.45);
  const w = (x: number, z: number) => (rot ? [fx + z, fz - x] : [fx + x, fz + z]), [x, z] = w(lx as number, lz as number), [ax, az] = w(lx as number, (lz as number) + (look as number));
  o.fp.pos!.set(x, z); o.fp.yaw = Math.atan2(ax - x, az - z); o.fp.pitch = pitch as number;
}, [lx, lz, look, pitch] as const);
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = await page.addStyleTag({ content: '.fp-help, .zc-peek, .toast { visibility: hidden !important }' });
  await page.screenshot({ path: path.join(SHOTS, name) });
  await tag.evaluate((n) => (n as Element).remove());
}

test('Cộng Cà Phê: the army-green front and the logo box, a coconut coffee at the counter, a low stool by the window', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page, 'at=15:00&lang=vi');
  await page.evaluate(() => (window as unknown as Win).__office!.pauseDemo());   // (no deploy toast over the till's)
  await toStreet(page);
  const at = atCong(page);
  expect((await page.evaluate(() => (window as unknown as Win).__office!.street!.shop.fronts().find((f) => f.key === 'cong')))?.room).toBe(true);   // (Ho Chi Minh City: a room)
  await at(0, 6.5); await page.waitForTimeout(2000);
  await shot(page, 'cong-front.png');
  await at(0.6, 3.6, -1, 0.12); await page.waitForTimeout(800);
  await shot(page, 'cong-sign-close.png');
  // in through the door: greeted, the counter, the menu of coupons
  await at(0, 1.6);
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => !!(window as unknown as Win).__office!.street!.shop.inside()), { timeout: 20_000 }).toBe(true);
  await page.keyboard.up('KeyW');
  await expect(page.locator('.shop-say', { hasText: /Cộng/ }).first()).toBeVisible({ timeout: 5_000 });
  await at(-0.3, -0.25); await page.evaluate(() => { (window as unknown as Win).__office!.fp.yaw! -= 0.55; }); await page.waitForTimeout(800);
  await shot(page, 'cong-inside.png');
  await at(-0.6, -0.5); await page.evaluate(() => { (window as unknown as Win).__office!.fp.yaw! += 0.9; }); await page.waitForTimeout(800);
  await shot(page, 'cong-seats.png');
  // a cốt dừa cà phê, ordered at the counter and paid by QR there
  await at(0.6, -1.15);
  await expect(page.locator('#fp-near')).toHaveText(/cốt dừa cà phê · 59\.000đ/i, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('#fp-near')).toHaveText(/1 món/i, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.toast').last()).toHaveText(/59\.000đ.*Cộng Cà Phê/, { timeout: 5_000 });
  // the low wooden stool by the glass
  await at(-2.2, -0.75, 1);
  await expect(page.locator('#fp-near')).toHaveText(/ghế đẩu/i, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.toast').last()).toHaveText(/ghế đẩu gỗ/i, { timeout: 5_000 });
  expect(errors).toEqual([]);
});

test('which cities have one: a room in Hà Nội, painted further down the street in Đà Lạt and Hải Phòng, none in Cần Thơ', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page, 'at=20:00&lang=vi');
  const cong = () => page.evaluate(() => (window as unknown as Win).__office!.street!.shop.fronts().find((f) => f.key === 'cong') || null);
  // (each city's street is built again when it changes: a while on a machine drawing without a GPU)
  for (const [c, want] of [['hn', { room: true }], ['dl', { room: false, far: true }]] as const) {
    await city(page, c);
    await expect.poll(cong, { timeout: 40_000 }).toMatchObject(want);
  }
  await city(page, 'ct');
  await expect.poll(cong, { timeout: 40_000 }).toBe(null);
  // the painted front, at night: the letters lit, the inside behind the glass; and no way in
  await city(page, 'hp');
  await expect.poll(cong, { timeout: 40_000 }).toMatchObject({ far: true });
  await toStreet(page);
  const at = atCong(page);
  await at(0, 6.5); await page.waitForTimeout(2000);
  await shot(page, 'cong-far.png');
  await at(0, 1.4);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(2500); await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => !!(window as unknown as Win).__office!.street!.shop.inside())).toBe(false);
  expect(errors).toEqual([]);
});

// the office at a time, the demo's people all resting, sped up
async function resting(page: Page, time: string) {
  await open(page, `at=${time}`);
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(6); });
}

test('a weekday afternoon: "Cộng for a coconut coffee, anyone?", someone resting goes for one', async ({ page }) => {
  test.setTimeout(210_000);
  const errors = watchErrors(page);
  await resting(page, '2026-11-04T15:00');   // (a Wednesday)
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.goOut('cong')), { timeout: 45_000 }).toBe(true);
  const trip = await page.evaluate(() => (window as unknown as Win).__office!.outing);
  expect([trip?.shop, trip?.item]).toEqual(['Cộng Cà Phê', 'cup']);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.chat.msgs.some((m) => /Cộng/.test(m.text || ''))), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.outing?.stage), { timeout: 140_000 }).toBe('in');   // (at the counter: in Ho Chi Minh City two fronts further than it was, past Bách Hóa Xanh and Điện Máy Xanh)
  expect(errors).toEqual([]);
});

test('a weekend morning: a cốt dừa at Cộng before work', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await resting(page, '2026-11-07T09:30');   // (a Saturday)
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.goOut('congWeekend')), { timeout: 45_000 }).toBe(true);
  expect((await page.evaluate(() => (window as unknown as Win).__office!.outing))?.shop).toBe('Cộng Cà Phê');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.chat.msgs.some((m) => /weekend|Saturday/i.test(m.text || ''))), { timeout: 20_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('on a phone: the front of Cộng', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'at=18:30&lang=vi');
  await toStreet(page);
  await atCong(page)(0, 7.5); await page.waitForTimeout(2000);
  await shot(page, 'cong-phone.png');
  expect(errors).toEqual([]);
});
