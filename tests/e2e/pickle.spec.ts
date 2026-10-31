import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config';

// The pickleball court by the park (world/backdrops/street-pickle.js) and the office's game on a green-CI evening
// (people/pickle.js). SHOTS_DIR: where the pictures go.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
type View = { x: number, z: number, yaw: number, pitch?: number };
type Court = { at: number[], axis: string, size: number[], on: boolean, office: boolean, phase: string, n: number, points: number, lit: boolean, lastEnd: string, kinds: string[], run: { ready: boolean, point: boolean } | null,
  lastRun: { ok: boolean, pass: number, fail: number, shots: number, end: string } | null };
type Office = {
  street?: { spots: () => { kind: string, x: number, z: number }[], pickle: { booked: () => boolean } | null,
    pickleDebug: { state: () => Court, court: () => Record<string, number>, view: (far?: number) => View } },
  fp: { street: boolean, pos?: { set: (x: number, z: number) => void }, yaw?: number, pitch?: number },
  fpToStreet: () => void, chat: { msgs: { text?: string, photo?: string }[] }, sessions: Map<string, { id: string }>, upsert: (s: object) => void, pauseDemo: () => void, speed: (n: number) => void,
  emit: (m: object) => void,
  pickle: { go: () => number, end: () => boolean, green: () => boolean, state: () => { stage: string, booked: boolean, members: { role: string, stage: string }[] } | null },
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
const court = (page: Page) => page.evaluate(() => (window as unknown as Win).__office!.street!.pickleDebug.state());
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = await page.addStyleTag({ content: '.fp-help, .zc-peek, .toast { visibility: hidden !important }' });
  await page.screenshot({ path: path.join(SHOTS, name) });
  await tag.evaluate((n) => (n as Element).remove());
}
const chatHas = (page: Page, re: RegExp) => page.evaluate((r) => (window as unknown as Win).__office!.chat.msgs.some((m) => new RegExp(r).test(m.text || '')), re.source);
// a test run in a session (as the server sends it): the start, then its result with the runner's counts
const testEvent = (page: Page, type: string, extra: object = {}) => page.evaluate(([type, extra]) => {
  const o = (window as unknown as Win).__office!, s = [...o.sessions.values()][0];
  o.emit({ k: 'ev', s, e: { id: Math.floor(Math.random() * 1e9), ts: Date.now(), sess: s.id, type, label: 'npm test', runner: 'npm test', ...(extra as object) } });
}, [type, extra] as const);

test('the pickleball court: the real size, the neighbourhood playing doubles on a weekend afternoon, its board at the gate', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-07T16:10');   // (a Saturday: the neighbourhood plays 15:30–17:00 and in the evening)
  // the rule book's numbers, in metres
  const c = await page.evaluate(() => (window as unknown as Win).__office!.street!.pickleDebug.court());
  expect(c.W).toBeCloseTo(6.096, 3); expect(c.L).toBeCloseTo(13.411, 3); expect(c.K).toBeCloseTo(2.134, 3);
  expect(c.NET_C).toBeCloseTo(0.864, 3); expect(c.NET_P).toBeCloseTo(0.914, 3);
  const s0 = await court(page);
  expect(s0.size[0]).toBeGreaterThan(13.4 + 1);   // (room behind the baselines to serve from)
  expect(s0.on).toBe(true); expect(s0.office).toBe(false);
  await page.evaluate(() => (window as unknown as Win).__office!.speed(4));   // (a slow software renderer: fewer frames a second)
  await toStreet(page);
  await standAt(page, await page.evaluate(() => (window as unknown as Win).__office!.street!.pickleDebug.view(0.6)));
  await expect.poll(async () => (await court(page)).n, { timeout: 60_000 }).toBeGreaterThan(1);   // (a rally under way)
  await page.waitForTimeout(800);
  await shot(page, 'pickle-locals.png');
  // up to the gate: the price, and who is on it
  const gate = await page.evaluate(() => (window as unknown as Win).__office!.street!.spots().find((p) => p.kind === 'pickle')!);
  await standAt(page, { x: gate.x, z: gate.z, yaw: 0 });
  await expect(page.locator('#fp-near')).toHaveText(/Pickleball court/, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.toast').last()).toHaveText(/neighbours are playing doubles/, { timeout: 5_000 });
  expect(errors).toEqual([]);
});

test('a green-CI evening: "Pickleball tonight?" in the chat, four go down, a test run is a point (the failing test into the net)', async ({ page }) => {
  test.setTimeout(480_000);   // (the court is a few blocks away: a minute or two there at 8×)
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-03T16:56');   // (a Tuesday, just before five; the online demo has no CI: a green day)
  expect(await page.evaluate(() => (window as unknown as Win).__office!.pickle.green())).toBe(true);
  await allResting(page, 8);
  await expect.poll(() => chatHas(page, /Pickleball tonight|pickleball tonight|Pickleball at 5:30/), { timeout: 90_000 }).toBe(true);
  // four (and a fifth to film) go down and take the court from the neighbourhood
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.pickle.go()), { timeout: 45_000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.pickle.state()?.stage), { timeout: 300_000 }).toBe('on');
  await expect.poll(async () => (await court(page)).office, { timeout: 10_000 }).toBe(true);
  const st = await page.evaluate(() => (window as unknown as Win).__office!.pickle.state()!);
  expect(st.members.filter((m) => m.role === 'play').length).toBeGreaterThanOrEqual(2);
  await toStreet(page);
  await standAt(page, await page.evaluate(() => (window as unknown as Win).__office!.street!.pickleDebug.view(0.7)));
  await page.waitForTimeout(1500);
  await shot(page, 'pickle-office.png');
  // a test run: 7 pass, then 1 fails: its point has 7 shots over the net and the 8th into it
  await page.evaluate(() => (window as unknown as Win).__office!.speed(3));
  await testEvent(page, 'test');
  await expect(page.locator('.pickle-tally')).toHaveText(/npm test/, { timeout: 5_000 });
  await testEvent(page, 'testfail', { pass: 7, fail: 1 });
  await expect.poll(async () => (await court(page)).run?.point ?? false, { timeout: 120_000 }).toBe(true);
  await expect(page.locator('.pickle-tally')).toHaveText(/✓ \d+\/7 tests/, { timeout: 60_000 });
  await shot(page, 'pickle-test-point.png');
  await page.evaluate(() => (window as unknown as Win).__office!.speed(8));   // (the rest of the point, quicker)
  await expect.poll(async () => (await court(page)).lastRun?.end, { timeout: 240_000 }).toBe('net');
  expect((await court(page)).lastRun).toMatchObject({ ok: false, pass: 7, fail: 1, shots: 8 });   // (7 over the net, the 8th into it)
  await expect(page.locator('.pickle-tally')).toHaveText(/1 failing · into the net after 7 shots/, { timeout: 5_000 });
  // the hour is up: the clip and everyone's share in the chat, and back up
  await page.evaluate(() => (window as unknown as Win).__office!.speed(8));
  expect(await page.evaluate(() => (window as unknown as Win).__office!.pickle.end())).toBe(true);
  const done = /Here’s the clip|Court time’s up|if you haven’t paid/;
  await expect.poll(() => chatHas(page, done), { timeout: 30_000 }).toBe(true);
  expect(await page.evaluate((r) => (window as unknown as Win).__office!.chat.msgs.some((m) => new RegExp(r).test(m.text || '') && !!m.photo), done.source)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.pickle.state()?.stage), { timeout: 240_000 }).toBe('end');
  expect(await page.evaluate(() => (window as unknown as Win).__office!.street!.pickle!.booked())).toBe(false);
  expect(errors).toEqual([]);
});
