import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config';

// Điện Máy Xanh, the ATM booth with its payday line and the quán cơm bình dân on the street (world/backdrops/shop-dmx.js,
// street-atm.js, eat-com.js; people/payday.js, comtrua.js). SHOTS_DIR: where the pictures go.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
type Door = { key: string, x: number, z: number, face: number };
type View = { x: number, z: number, yaw: number };
type Office = {
  street?: { doors: () => Door[], shop: { inside: () => unknown },
    atm: { payday: () => boolean, length: () => number } | null, atmDebug: { state: () => { payday: boolean, line: number, locals: number, office: number, used: number }, view: (far?: number) => View, fast: () => number },
    spots: () => { kind: string, x: number, z: number }[],
    com: { open: () => boolean, friday: () => boolean } | null, comDebug: { state: () => { open: boolean, friday: boolean, locals: number, office: { stage: string }[], served: number }, view: (far?: number) => View } },
  fp: { street: boolean, pos?: { set: (x: number, z: number) => void }, yaw?: number },
  fpToStreet: () => void, outing: { kind: string } | null, chat: { msgs: { text?: string }[] }, sessions: Map<string, object>, upsert: (s: object) => void, pauseDemo: () => void, speed: (n: number) => void,
  payday: { go: () => boolean, state: () => { stage: string, k: number } | null },
  com: { go: () => number, end: () => boolean, planned: () => boolean, state: () => { stage: string, friday: boolean, members: { id: string, stage: string }[] } | null },
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
// everyone done and napping, the demo stopped, time sped up
const allResting = (page: Page, speed = 6) => page.evaluate((n) => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(n); }, speed);
const standAt = (page: Page, v: View) => page.evaluate((v) => { const o = (window as unknown as Win).__office!; o.fp.pos!.set(v.x, v.z); o.fp.yaw = v.yaw; }, v);
// stand at a point of a shop (its frame: x along the front, z out to the street), looking in (or at a point of it)
const atShop = (page: Page, key: string) => (lx: number, lz: number, tx = lx, tz = lz - 1) => page.evaluate(([key, lx, lz, tx, tz]) => {
  const o = (window as unknown as Win).__office!, d = o.street!.doors().find((x) => x.key === key)!;
  const rot = d.face === Math.PI ? 0 : Math.PI / 2, fx = d.x - (rot ? 0.45 : 0), fz = d.z - (rot ? 0 : 0.45);
  const w = (x: number, z: number) => (rot ? [fx + z, fz - x] : [fx + x, fz + z]), [x, z] = w(lx as number, lz as number), [ax, az] = w(tx as number, tz as number);
  o.fp.pos!.set(x, z); o.fp.yaw = Math.atan2(ax - x, az - z);
}, [key, lx, lz, tx, tz] as const);
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = await page.addStyleTag({ content: '.fp-help, .zc-peek, .toast { visibility: hidden !important }' });
  await page.screenshot({ path: path.join(SHOTS, name) });
  await tag.evaluate((n) => (n as Element).remove());
}
// (the demo's chat runs in the page: what it says is in __office.chat)
const chatHas = (page: Page, re: RegExp) => page.evaluate((r) => (window as unknown as Win).__office!.chat.msgs.some((m) => new RegExp(r).test(m.text || '')), re.source);
// right by one of the street's walk-up places (kind: 'atm', 'com'), looking at it, from the side `v` is on
const standBy = (page: Page, kind: string, v: View) => page.evaluate(([kind, v]) => {
  const o = (window as unknown as Win).__office!, sp = o.street!.spots().find((p) => p.kind === kind)!, d = Math.hypot(v.x - sp.x, v.z - sp.z), x = sp.x + ((v.x - sp.x) / d) * 0.45, z = sp.z + ((v.z - sp.z) / d) * 0.45;
  o.fp.pos!.set(x, z); o.fp.yaw = Math.atan2(sp.x - x, sp.z - z);
}, [kind, v] as const);

test('walking into Điện Máy Xanh: the blue sign with the yellow runner, the người xanh dancing, a kettle paid at the till', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  // (in Ho Chi Minh City it is the fourth chain from the office: a room you walk into)
  await open(page, 'at=17:40');
  await toStreet(page);
  const at = atShop(page, 'dmx');
  await at(0, 6.5); await page.waitForTimeout(2000);
  await shot(page, 'dmx-front.png');
  await at(-1.2, 3.0); await page.waitForTimeout(800);
  await shot(page, 'dmx-sign-close.png');
  await at(0, 1.6);
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => !!(window as unknown as Win).__office!.street!.shop.inside()), { timeout: 20_000 }).toBe(true);
  await page.keyboard.up('KeyW');
  await expect(page.locator('.shop-say', { hasText: /Điện máy XANH/ }).first()).toBeVisible({ timeout: 5_000 });
  await at(0.4, -0.35); await page.waitForTimeout(800);
  await shot(page, 'dmx-inside.png');
  await at(1.6, -0.5, -2.8, -2.6); await page.waitForTimeout(600);   // (the fridges and the massage chairs along the left)
  await shot(page, 'dmx-inside-left.png');
  await at(-1.0, -0.6, 3.2, -1.4); await page.waitForTimeout(600);   // (the fans, the air conditioners and the till on the right)
  await shot(page, 'dmx-inside-right.png');
  // a kettle from the table by the TV wall, paid at the till
  await at(-0.7, -3.05);
  await expect(page.locator('#fp-near')).toHaveText(/electric kettle/i, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await at(2.4, -1.95);
  await expect(page.locator('#fp-near')).toHaveText(/1 item/i, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.toast').last()).toHaveText(/Điện Máy Xanh/, { timeout: 5_000 });
  expect(errors).toEqual([]);
});

test('Điện Máy Xanh further off: its painted front (the sign, the TV wall behind the glass)', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  // where its front is (the same city, the same fronts), then with fewer walk-ins: too far off to walk into, painted
  await open(page, 'at=16:00');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.street!.doors().some((x) => x.key === 'dmx')), { timeout: 20_000 }).toBe(true);
  const d = await page.evaluate(() => (window as unknown as Win).__office!.street!.doors().find((x) => x.key === 'dmx')!);
  await open(page, 'at=16:00&walkins=3');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.street!.doors().length), { timeout: 20_000 }).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as unknown as Win).__office!.street!.doors().some((x) => x.key === 'dmx'))).toBe(false);
  await toStreet(page);
  const rot = d.face === Math.PI ? 0 : Math.PI / 2, fx = d.x - (rot ? 0.45 : 0), fz = d.z - (rot ? 0 : 0.45);
  const w = (x: number, z: number) => (rot ? [fx + z, fz - x] : [fx + x, fz + z]), [x, z] = w(0, 7), [ax, az] = w(0, 0);
  await standAt(page, { x, z, yaw: Math.atan2(ax - x, az - z) }); await page.waitForTimeout(1500);
  await shot(page, 'dmx-far.png');
  expect(errors).toEqual([]);
});

test('payday at the ATM: "Lương về rồi", a line along the pavement, someone from the office waits their turn and withdraws', async ({ page }) => {
  test.setTimeout(480_000);   // (the booth is a block or two away: ~1½ min there at 8×, then the line)
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-05T12:05');   // (the 5th: a payday)
  // the booth is there, today is a payday, and the line builds up
  expect(await page.evaluate(() => (window as unknown as Win).__office!.street!.atm?.payday())).toBe(true);
  await allResting(page, 8);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.street!.atmDebug.state().locals), { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
  await expect.poll(() => chatHas(page, /Salary’s in|payday, everyone/), { timeout: 60_000 }).toBe(true);
  // someone resting goes down and joins the line
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.payday.go()), { timeout: 45_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.payday.state()?.stage), { timeout: 200_000 }).toBe('line');
  await toStreet(page);
  await standAt(page, await page.evaluate(() => (window as unknown as Win).__office!.street!.atmDebug.view()));
  await page.waitForTimeout(1500);
  await shot(page, 'atm-payday-line.png');
  await standAt(page, await page.evaluate(() => (window as unknown as Win).__office!.street!.atmDebug.view(0.45)));
  await page.waitForTimeout(800);
  await shot(page, 'atm-booth-close.png');
  // at the front of the line, in the booth, and back up with the cash (the line served in seconds from here: it moves in real time)
  await page.evaluate(() => (window as unknown as Win).__office!.street!.atmDebug.fast());
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.payday.state()?.k), { timeout: 90_000, intervals: [250] }).toBe(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.payday.state()?.stage), { timeout: 200_000 }).toBe('gone');
  // walking up to it yourself
  await standBy(page, 'atm', await page.evaluate(() => (window as unknown as Win).__office!.street!.atmDebug.view()));
  await expect(page.locator('#fp-near')).toHaveText(/ATM/, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.toast').last()).toHaveText(/2,000,000/, { timeout: 5_000 });
  expect(errors).toEqual([]);
});

test('lunch at the quán cơm bình dân: no GrabFood that day, down for a plate, the bill, back up for the nap', async ({ page }) => {
  test.setTimeout(480_000);
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-03T11:25&com');   // (a Tuesday)
  expect(await page.evaluate(() => (window as unknown as Win).__office!.street!.com?.open())).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Win).__office!.com.planned())).toBe(true);
  await allResting(page, 8);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.com.go()), { timeout: 45_000 }).toBeGreaterThan(0);
  await expect.poll(() => chatHas(page, /rice place|cô Ba|Lunch time/), { timeout: 20_000 }).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Win).__office!.outing?.kind ?? null)).not.toBe('lunch');   // (no GrabFood ordered today)
  // over the street and onto the stools: a plate each on the table
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.com.state()?.stage), { timeout: 200_000 }).toBe('on');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.street!.comDebug.state().office.filter((m) => m.stage === 'sit').length), { timeout: 60_000 }).toBeGreaterThan(0);
  await toStreet(page);
  await standAt(page, await page.evaluate(() => (window as unknown as Win).__office!.street!.comDebug.view()));
  await page.waitForTimeout(1500);
  await shot(page, 'com-lunch.png');
  await standAt(page, await page.evaluate(() => (window as unknown as Win).__office!.street!.comDebug.view(0.35)));
  await page.waitForTimeout(800);
  await shot(page, 'com-cabinet.png');
  // walking up to the cabinet yourself: a plate, with the office's lot there
  await standBy(page, 'com', await page.evaluate(() => (window as unknown as Win).__office!.street!.comDebug.view()));
  await expect(page.locator('#fp-near')).toHaveText(/plate of rice/i, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.toast').last()).toHaveText(/eat with/i, { timeout: 5_000 });
  // the bill, and everyone back up
  expect(await page.evaluate(() => (window as unknown as Win).__office!.com.end())).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.com.state()?.members.every((m) => m.stage === 'gone')), { timeout: 200_000 }).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Win).__office!.street!.comDebug.state().served)).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('Friday at the quán: bún đậu mắm tôm, the board says so, a mẹt on the table', async ({ page }) => {
  test.setTimeout(360_000);
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-06T11:25&bundau');   // (a Friday)
  expect(await page.evaluate(() => (window as unknown as Win).__office!.street!.com?.friday())).toBe(true);
  await allResting(page, 8);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.com.go()), { timeout: 45_000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.com.state()?.stage), { timeout: 200_000 }).toBe('on');
  expect(await page.evaluate(() => (window as unknown as Win).__office!.com.state()?.friday)).toBe(true);
  await toStreet(page);
  await standAt(page, await page.evaluate(() => (window as unknown as Win).__office!.street!.comDebug.view(0.5)));
  await page.waitForTimeout(1500);
  await shot(page, 'com-bundau.png');
  await standBy(page, 'com', await page.evaluate(() => (window as unknown as Win).__office!.street!.comDebug.view()));
  await expect(page.locator('#fp-near')).toHaveText(/bún đậu/i, { timeout: 5_000 });
  expect(errors).toEqual([]);
});
