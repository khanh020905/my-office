import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config';

// Cơm nhà: lunch from home warmed at the pantry's microwaves at noon (people/comnha.js, world/props/microwave.js,
// src/shared/comnha.js). SHOTS_DIR: where the pictures go.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
type Oven = { stage: string, by: string | null, left: number, smell: number, popped: boolean, open: number, box: boolean };
type State = { line: string[], served: number, ovens: Oven[], people: { id: string, stage: string, kind: string }[], eating: { id: string, at: string }[], today: string[] };
type Office = {
  micro: { go: (n?: number) => number, next: (o: object) => void, state: () => State },
  chat: { msgs: { text?: string }[] }, sessions: Map<string, object>,  upsert: (s: object) => void, pauseDemo: () => void, speed: (n: number) => void,
  view: (x: number, y: number, z: number, zoom: number) => void, outing: { kind: string } | null,
  renderer: { info: { render: { calls: number, triangles: number } } },
};
type Win = { __office?: Office };

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
async function open(page: Page, query: string, size = { width: 1280, height: 720 }) {
  await page.setViewportSize(size);
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); localStorage.setItem('office-tips', 'seen'); } catch { /* private mode */ } });
  await page.goto(`/?demo&debug&layout=pro&${query}`);
  await page.waitForFunction(() => (window as unknown as Win).__office?.micro, null, { timeout: 30_000 });
}
// everyone done and napping, the demo stopped (and kept resting), time sped up
const allResting = (page: Page, speed = 6) => page.evaluate((n) => {
  const o = (window as unknown as Win).__office!; o.pauseDemo();
  const rest = () => { for (const s of o.sessions.values()) if ((s as { status: string }).status !== 'rest') o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); };
  for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] });
  setInterval(rest, 1000); o.speed(n);
}, speed);
const st = (page: Page) => page.evaluate(() => (window as unknown as Win).__office!.micro.state());
const chatHas = (page: Page, re: RegExp) => page.evaluate((r) => (window as unknown as Win).__office!.chat.msgs.some((m) => new RegExp(r).test(m.text || '')), re.source);
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = await page.addStyleTag({ content: '.zc-peek, .toast { visibility: hidden !important }' });
  await page.screenshot({ path: path.join(SHOTS, name) });
  await tag.evaluate((n) => (n as Element).remove());
}

test('who brought lunch from home: half the office on a Monday, nobody on a Saturday', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-07T11:58');   // (a Saturday: nobody, and no line forms)
  expect((await st(page)).today).toEqual([]);
  await allResting(page, 8);
  await page.waitForTimeout(8000);
  expect((await st(page)).people).toEqual([]);
  await page.goto('/?demo&debug&layout=pro&at=2026-11-02T11:58');   // (a Monday: the same people every time it is asked)
  await page.waitForFunction(() => (window as unknown as Win).__office?.micro, null, { timeout: 30_000 });
  const mon = (await st(page)).today;
  expect(mon.length).toBeGreaterThan(0);
  expect((await st(page)).today).toEqual(mon);
  expect(errors).toEqual([]);
});

test('noon at the microwaves: a line, the door, the plate turning, cá kho and a lid that pops, "tít tít tít", lunch at a table', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-02T11:50&comnha&lang=vi');   // (a Monday: everyone has brought lunch with ?comnha)
  expect((await st(page)).today.length).toBeGreaterThan(0);
  await page.evaluate(() => (window as unknown as Win).__office!.micro.next({ smelly: true, pop: true, pantry: true }));
  await allResting(page, 3);
  // up from the nap with the lunch bag, into the line (all at once here, once they are napping); two at the microwaves
  await page.evaluate(() => setInterval(() => (window as unknown as Win).__office!.micro.go(6), 1500));   // (whoever is napping joins at once)
  await expect.poll(async () => { const s = await st(page); return s.people.length + s.served; }, { timeout: 150_000 }).toBeGreaterThan(2);
  await expect.poll(async () => (await st(page)).line.length, { timeout: 90_000 }).toBeGreaterThan(0);
  expect((await st(page)).ovens.filter((o) => o.stage === 'run' || o.by).length).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as unknown as Win).__office!.outing?.kind ?? null)).not.toBe('lunch');   // (no GrabFood for them)
  await page.evaluate(() => (window as unknown as Win).__office!.view(9.6, 0.9, -4.8, 4.5));
  await page.waitForTimeout(1500);
  await shot(page, 'comnha-line.png');
  // the first box: cá kho (smell lines, a grumble in the group) with its lid clipped shut (it pops)
  await expect.poll(async () => (await st(page)).ovens.some((o) => o.smell > 0), { timeout: 60_000 }).toBe(true);
  await expect.poll(() => chatHas(page, /hâm cá|hâm mắm|cá kho/), { timeout: 90_000 }).toBe(true);
  await expect.poll(async () => (await st(page)).ovens.some((o) => o.popped), { timeout: 90_000 }).toBe(true);
  await shot(page, 'comnha-smell.png');
  // done: the door opens, the box comes out, the next one steps up; lunch eaten at a pantry table (or the desk)
  await expect.poll(async () => (await st(page)).served, { timeout: 120_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await st(page)).eating.length, { timeout: 120_000 }).toBeGreaterThan(0);
  await page.evaluate(() => (window as unknown as Win).__office!.view(10.6, 0.9, -4.0, 4));
  await page.waitForTimeout(1200);
  await shot(page, 'comnha-eat.png');
  expect(errors).toEqual([]);
});

test('on a phone: the microwave line in the company floor, nothing out of place', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-02T11:50&comnha&lang=vi', { width: 390, height: 844 });
  await allResting(page, 6);
  await expect.poll(async () => (await st(page)).ovens.filter((o) => o.stage === 'run').length, { timeout: 120_000 }).toBeGreaterThan(0);
  await page.evaluate(() => (window as unknown as Win).__office!.view(9.6, 0.9, -4.8, 3));
  await page.waitForTimeout(1500);
  await shot(page, 'comnha-phone.png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});
