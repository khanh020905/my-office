import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config';

// Diễn tập PCCC: the quarterly fire drill (life/drill.js; the guard's part: people/guard.js; the lift and the stairs:
// world/entrance.js). SHOTS_DIR: where the pictures go.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
type Member = { id: string, stage: string, hr: boolean, street: boolean, x: number, z: number };
type Drill = { phase: string, q: string, secs: number | null, fire: number, lift: boolean, members: Member[], ended?: boolean };
type Office = {
  drill: { start: () => boolean, state: () => Drill | null, day: (iso: string) => { day: boolean, first: string } },
  chat: { msgs: { text?: string }[] }, sessions: Map<string, { status: string }>, workers: Map<string, { chore?: { drill?: object } | null }>,
  pauseDemo: () => void, speed: (n: number) => void, view: (x: number, y: number, z: number, zoom: number) => void,
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
  await page.goto(`/?demo&debug&layout=pro&lang=vi&${query}`);
  await page.waitForFunction(() => (window as unknown as Win).__office?.drill, null, { timeout: 120_000 });
}
const st = (page: Page) => page.evaluate(() => (window as unknown as Win).__office!.drill.state());
const chatHas = (page: Page, re: RegExp) => page.evaluate((r) => (window as unknown as Win).__office!.chat.msgs.some((m) => new RegExp(r).test(m.text || '')), re.source);
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = await page.addStyleTag({ content: '.zc-peek { visibility: hidden !important }' });
  await page.screenshot({ path: path.join(SHOTS, name) });
  await tag.evaluate((n) => (n as Element).remove());
}
// the camera on the assembly point (the members out on the pavement)
const onStreet = (page: Page, zoom = 2.6) => page.evaluate((z) => {
  const o = (window as unknown as Win).__office!, d = o.drill.state(), out = d?.members.filter((m) => m.street) || [];
  if (out.length) o.view(out.reduce((a, m) => a + m.x, 0) / out.length, 0.8, out.reduce((a, m) => a + m.z, 0) / out.length, z);
  return out.length;
}, zoom);

test('the drill day: the first working day of each quarter, 15:00; the morning notice; the setting turns it off', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await open(page, 'at=2026-10-01T09:00');   // (Thursday 1/10: the fourth quarter's first working day, in the morning)
  const days = await page.evaluate(() => { const d = (window as unknown as Win).__office!.drill.day; return [d('2026-10-01'), d('2026-10-02'), d('2027-01-01'), d('2027-01-04')]; });
  expect(days.map((x) => x.day)).toEqual([true, false, false, true]);
  await expect.poll(() => chatHas(page, /diễn tập PCCC quý IV/i), { timeout: 180_000 }).toBe(true);   // (HR's notice)
  expect(await st(page)).toBeNull();
  // 15:00 the same day: the alarm
  await page.goto('/?demo&debug&layout=pro&lang=vi&at=2026-10-01T15:00');
  await page.waitForFunction(() => (window as unknown as Win).__office?.drill, null, { timeout: 120_000 });
  await expect.poll(async () => (await st(page))?.phase ?? '', { timeout: 180_000 }).toBe('alarm');
  expect((await st(page))!.lift).toBe(true);
  // turned off in Settings → More: nothing on the day
  await page.evaluate(() => { localStorage.setItem('office-drill', 'off'); localStorage.removeItem('office-drill-day'); });   // (and as if it had not run today)
  await page.goto('/?demo&debug&layout=pro&lang=vi&at=2026-10-01T15:01');
  await page.waitForFunction(() => (window as unknown as Win).__office?.drill, null, { timeout: 120_000 });
  await page.waitForTimeout(20_000);
  expect(await st(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('alarm, strobes, everyone down the stairs to the assembly point, the roll call, the extinguisher, back up', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = watchErrors(page);
  await open(page, 'drill&at=2026-11-04T15:00');   // (?drill: one now)
  await page.evaluate(() => (window as unknown as Win).__office!.speed(8));
  await expect.poll(async () => (await st(page))?.phase ?? '', { timeout: 180_000 }).toBe('alarm');
  const s0 = (await st(page))!;
  expect(s0.members.length).toBeGreaterThan(3);
  expect(s0.members.some((m) => m.hr)).toBe(true);
  expect(s0.lift).toBe(true);
  await page.evaluate(() => (window as unknown as Win).__office!.view(-6.2, 1.2, 3.8, 3.2));
  await page.waitForTimeout(3000);
  await shot(page, 'drill-alarm.png');
  // the sessions go on working: some are at work while their people are in the drill
  await expect.poll(() => page.evaluate(() => { const o = (window as unknown as Win).__office!; return [...o.sessions.entries()].filter(([id, s]) => s.status === 'work' && o.workers.get(id)?.chore?.drill).length; }), { timeout: 60_000 }).toBeGreaterThan(0);
  // out on the pavement; the roll call
  await expect.poll(async () => (await st(page))!.members.filter((m) => m.street).length, { timeout: 300_000 }).toBeGreaterThan(2);
  await expect.poll(async () => (await st(page))!.phase, { timeout: 300_000 }).toBe('muster');
  await onStreet(page); await page.waitForTimeout(2500);
  await shot(page, 'drill-muster.png');
  expect((await st(page))!.secs).toBeGreaterThan(0);
  // the guard and the practice fire
  await expect.poll(async () => (await st(page))!.fire, { timeout: 200_000 }).toBeGreaterThan(0.5);
  await onStreet(page, 3.4); await page.waitForTimeout(1200);
  await shot(page, 'drill-fire.png');
  await expect.poll(async () => { const d = await st(page); return d!.phase === 'demo' && d!.fire < 0.6; }, { timeout: 200_000 }).toBe(true);
  await page.waitForTimeout(1500);
  await shot(page, 'drill-spray.png');
  // back up, the lift in service again, HR's report in the chat
  await expect.poll(async () => (await st(page))?.ended ?? false, { timeout: 400_000 }).toBe(true);
  expect((await st(page))!.lift).toBe(false);
  await expect.poll(() => chatHas(page, /Diễn tập PCCC quý IV xong|Xong diễn tập quý IV/), { timeout: 60_000 }).toBe(true);
  expect(await page.evaluate(() => [...(window as unknown as Win).__office!.workers.values()].filter((w) => w.chore?.drill).length)).toBe(0);
  expect(errors).toEqual([]);
});
