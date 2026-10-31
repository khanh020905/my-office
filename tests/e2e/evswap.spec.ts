import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config';

// The e-scooters in the office's row, their gauges following the computer's battery, the battery-swap cabinet on the
// corner, a swap when the battery is low, Hà Nội's low emission zone sign (world/backdrops/street-ev.js,
// people/evswap.js). SHOTS_DIR: where the pictures go.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
type View = { x: number, z: number, yaw: number, pitch?: number };
type Ev = { battery: { pct: number, charging: boolean } | null, bikes: { i: number, level: number, full: boolean, at: number[] }[], riding: number, swaps: number, cabinet: number[] | null, lez: boolean };
type Office = {
  street?: { spots: () => { kind: string, x: number, z: number }[], evDebug: { state: () => Ev, view: (far?: number) => View | null, lez: () => View | null } },
  fp: { street: boolean, pos?: { set: (x: number, z: number) => void }, yaw?: number, pitch?: number },
  fpToStreet: () => void, chat: { msgs: { text?: string }[] }, sessions: Map<string, { id: string }>, upsert: (s: object) => void, pauseDemo: () => void, speed: (n: number) => void,
  wx: { city: string },
  evswap: { go: (quick?: boolean) => boolean, state: () => { stage: string, full: boolean } | null },
};
type Win = { __office?: Office };

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
async function open(page: Page, query: string) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); localStorage.setItem('office-tips', 'seen'); } catch { /* private mode */ } });
  await page.goto(`/?demo&debug&layout=pro&${query}`);
  await page.waitForFunction(() => (window as unknown as Win).__office?.street, null, { timeout: 30_000 });
}
async function toStreet(page: Page) {
  await page.click('#btn-fp');
  await page.evaluate(() => (window as unknown as Win).__office!.fpToStreet());
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.fp.street), { timeout: 10_000 }).toBe(true);
}
const allResting = (page: Page, speed = 6) => page.evaluate((n) => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(n); }, speed);
const standAt = (page: Page, v: View) => page.evaluate((v) => { const o = (window as unknown as Win).__office!; o.fp.pos!.set(v.x, v.z); o.fp.yaw = v.yaw; if (v.pitch != null) o.fp.pitch = v.pitch; }, v);
const ev = (page: Page) => page.evaluate(() => (window as unknown as Win).__office!.street!.evDebug.state());
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = await page.addStyleTag({ content: '.fp-help, .zc-peek, .toast { visibility: hidden !important }' });
  await page.screenshot({ path: path.join(SHOTS, name) });
  await tag.evaluate((n) => (n as Element).remove());
}
const chatHas = (page: Page, re: RegExp) => page.evaluate((r) => (window as unknown as Win).__office!.chat.msgs.some((m) => new RegExp(r).test(m.text || '')), re.source);

test('e-scooters in the row show the battery; under 20% one rides to the swap cabinet and comes back full', async ({ page }) => {
  test.setTimeout(480_000);
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-04T09:30&battery=15');   // (a pretend reading: 15%, on battery)
  await expect.poll(async () => (await ev(page)).bikes.length, { timeout: 60_000 }).toBeGreaterThan(0);
  const e0 = await ev(page);
  expect(e0.battery?.pct).toBe(15); expect(e0.cabinet).not.toBeNull();
  expect(e0.bikes[0].level).toBeGreaterThanOrEqual(4); expect(e0.bikes[0].level).toBeLessThanOrEqual(26);   // (the computer's, give or take)
  await toStreet(page);
  const b = e0.bikes[0];
  await standAt(page, { x: b.at[0] + 1.6, z: b.at[1] + 1.4, yaw: Math.atan2(-1.6, -1.4), pitch: -0.45 });
  await page.waitForTimeout(1200);
  await shot(page, 'ev-row.png');
  await standAt(page, (await page.evaluate(() => (window as unknown as Win).__office!.street!.evDebug.view(1)))!);
  await page.waitForTimeout(800);
  await shot(page, 'ev-cabinet.png');
  // its owner goes when resting: the chat, the ride, the swap, back with it full
  await allResting(page, 8);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.evswap.state()?.stage ?? ''), { timeout: 120_000 }).not.toBe('');
  await expect.poll(() => chatHas(page, /down to \d+%|Battery at \d+%|out of battery/), { timeout: 60_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.evswap.state()?.stage), { timeout: 240_000 }).toBe('swap');
  await expect.poll(async () => (await ev(page)).swaps, { timeout: 120_000 }).toBe(1);   // (9.000đ paid at the cabinet)
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.evswap.state()?.stage), { timeout: 300_000 }).toBe('gone');
  expect((await ev(page)).bikes.some((x) => x.level === 100 && x.full)).toBe(true);
  expect(errors).toEqual([]);
});

test('charging: the gauges stay green and fill; the cabinet in first person; the low emission zone sign in Hà Nội', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-04T09:30&battery=60c');
  await expect.poll(async () => (await ev(page)).battery?.charging, { timeout: 120_000 }).toBe(true);
  expect((await ev(page)).lez).toBe(false);
  await page.evaluate(() => { (window as unknown as Win).__office!.wx.city = 'hn'; });
  await expect.poll(async () => (await ev(page)).lez, { timeout: 60_000 }).toBe(true);
  await toStreet(page);
  await standAt(page, { ...(await page.evaluate(() => (window as unknown as Win).__office!.street!.evDebug.lez()))!, pitch: 0.12 });
  await page.waitForTimeout(1200);
  await shot(page, 'ev-lez-hanoi.png');
  const cab = await page.evaluate(() => (window as unknown as Win).__office!.street!.spots().find((s) => s.kind === 'evswap')!);
  await standAt(page, { x: cab.x, z: cab.z, yaw: 0 });
  await expect(page.locator('#fp-near')).toHaveText(/battery swap/, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.toast').last()).toHaveText(/1\.5 kWh/, { timeout: 5_000 });
  expect(errors).toEqual([]);
});
