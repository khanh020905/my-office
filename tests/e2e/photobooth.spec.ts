import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config';

// The photo studio across the street (world/backdrops/street-photo.js), four of the office there for a strip on each
// release (people/photobooth.js) and the strips on the whiteboard (life/photostrips.js). SHOTS_DIR: where the pictures go.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
type View = { x: number, z: number, yaw: number };
type Trip = { tag: string, stage: string, weekend: boolean, frame: number, strip: boolean, waitMin: number | null, members: { stage: string, prop: boolean }[] };
type Office = {
  street?: { spots: () => { kind: string, x: number, z: number }[], photoDebug: { state: () => { open: boolean, weekend: boolean, queue: number, shots: number, prints: number }, view: (far?: number) => View } },
  fp: { street: boolean, pos?: { set: (x: number, z: number) => void }, yaw?: number },
  fpToStreet: () => void, chat: { msgs: { text?: string, photo?: string }[] }, sessions: Map<string, { id: string }>, upsert: (s: object) => void, pauseDemo: () => void, speed: (n: number) => void,
  emit: (m: object) => void, feed: { type: string, label: string }[],
  photo: { release: (tag?: string) => number, quick: () => boolean, state: () => Trip | null },
  strips: { list: () => { tag: string, day: string, n: number }[], mesh: () => boolean },
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
const standAt = (page: Page, v: View) => page.evaluate((v) => { const o = (window as unknown as Win).__office!; o.fp.pos!.set(v.x, v.z); o.fp.yaw = v.yaw; }, v);
const trip = (page: Page) => page.evaluate(() => (window as unknown as Win).__office!.photo.state());
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = await page.addStyleTag({ content: '.fp-help, .zc-peek, .toast { visibility: hidden !important }' });
  await page.screenshot({ path: path.join(SHOTS, name) });
  await tag.evaluate((n) => (n as Element).remove());
}
const chatHas = (page: Page, re: RegExp, photo = false) => page.evaluate(([r, ph]) => (window as unknown as Win).__office!.chat.msgs.some((m) => new RegExp(r as string).test(m.text || '') && (!ph || !!m.photo)), [re.source, photo] as const);
// a release, as the server sends it (server/git.mjs: a new version tag)
const release = (page: Page, tag: string) => page.evaluate((tag) => {
  const o = (window as unknown as Win).__office!, s = [...o.sessions.values()][1];
  o.emit({ k: 'ev', s, e: { id: Math.floor(Math.random() * 1e9), ts: Date.now(), sess: s.id, type: 'release', label: tag, repo: 'shop' } });
}, tag);

test('the photo studio: pink neon over the glass, two curtained booths, the price board; walking up for a strip of your own', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-07T15:10');   // (a Saturday afternoon: a queue along the pavement)
  const st = await page.evaluate(() => (window as unknown as Win).__office!.street!.photoDebug.state());
  expect(st.open).toBe(true); expect(st.weekend).toBe(true);
  await toStreet(page);
  await standAt(page, await page.evaluate(() => (window as unknown as Win).__office!.street!.photoDebug.view(1.4)));
  await page.waitForTimeout(1500);
  await shot(page, 'photo-studio.png');
  const door = await page.evaluate(() => (window as unknown as Win).__office!.street!.spots().find((p) => p.kind === 'photo')!);
  await standAt(page, { x: door.x, z: door.z, yaw: 0 });
  await expect(page.locator('#fp-near')).toHaveText(/photo booth/, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.toast').last()).toHaveText(/four-frame strip/, { timeout: 5_000 });
  expect(errors).toEqual([]);
});

test('a release: four go to the booth, four frames with the props, the strip in the chat and pinned on the whiteboard', async ({ page }) => {
  test.setTimeout(540_000);
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-04T14:10');   // (a Wednesday: a short wait)
  await allResting(page, 8);
  await release(page, 'v2.5.0');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.feed.some((e) => e.type === 'release' && e.label === 'v2.5.0'))).toBe(true);
  await expect.poll(() => chatHas(page, /v2\.5\.0 is out|v2\.5\.0 released|Release v2\.5\.0/), { timeout: 90_000 }).toBe(true);
  await expect.poll(async () => (await trip(page))?.stage, { timeout: 300_000 }).toMatch(/^(queue|in|shoot)$/);
  expect((await trip(page))!.waitMin).toBeLessThan(5);
  await page.evaluate(() => (window as unknown as Win).__office!.photo.quick());
  await expect.poll(async () => (await trip(page))?.frame ?? -1, { timeout: 200_000 }).toBeGreaterThanOrEqual(1);
  expect((await trip(page))!.members.some((m) => m.prop)).toBe(true);   // (a prop on each head)
  await toStreet(page);
  await standAt(page, await page.evaluate(() => (window as unknown as Win).__office!.street!.photoDebug.view(0.5)));
  await page.waitForTimeout(800);
  await shot(page, 'photo-booth-shoot.png');
  // four flashes, the print, the strip in the chat; then up, and pinned on the board
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.street!.photoDebug.state().shots), { timeout: 200_000 }).toBeGreaterThanOrEqual(4);
  await expect.poll(() => chatHas(page, /v2\.5\.0/, true), { timeout: 200_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.strips.list().map((s) => s.tag)), { timeout: 300_000 }).toContain('v2.5.0');
  expect(await page.evaluate(() => (window as unknown as Win).__office!.strips.mesh())).toBe(true);
  expect(errors).toEqual([]);
});

test('at the weekend the queue is long: back nearly two hours later', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-07T15:10');
  await allResting(page, 8);
  await release(page, 'v3.0.0');
  await expect.poll(async () => (await trip(page))?.stage, { timeout: 240_000 }).toBe('queue');
  const t = (await trip(page))!;
  expect(t.weekend).toBe(true); expect(t.waitMin).toBeGreaterThan(100);
  await page.evaluate(() => (window as unknown as Win).__office!.photo.quick());
  await expect.poll(() => chatHas(page, /two hours/), { timeout: 60_000 }).toBe(true);
  expect(errors).toEqual([]);
});
