import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config';

// Làm bù, nghỉ bù: the office on the Government's swapped days (src/shared/workdays.js, life/day-swaps.js; the front
// desk: people/staff.js; lunch from home: src/shared/comnha.js; the duty board: people/duty.js). SHOTS_DIR: pictures.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
type Office = {
  daySwaps: { kind: () => string, swap: () => { off: string, work: string } | null, after: () => { days: number, makeup: string } },
  staff: { receptionist?: { offstage: boolean } }, micro: { state: () => { today: string[] } },
  duty: { state: () => { kind: string, who: Record<string, string> } },
  chat: { msgs: { text?: string }[] }, view: (x: number, y: number, z: number, zoom: number) => void,
};
type Win = { __office?: Office };
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
async function open(page: Page, at: string) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); localStorage.setItem('office-tips', 'seen'); } catch { /* private mode */ } });
  await page.goto(`/?demo&debug&layout=pro&lang=vi&at=${at}`);
  await page.waitForFunction(() => (window as unknown as Win).__office?.daySwaps && (window as unknown as Win).__office?.duty, null, { timeout: 120_000 });
}
const O = (page: Page) => page.evaluate(() => { const o = (window as unknown as Win).__office!; return { kind: o.daySwaps.kind(), swap: o.daySwaps.swap(), after: o.daySwaps.after(), reception: o.staff.receptionist ? !o.staff.receptionist.offstage : null, lunch: o.micro.state().today.length, duty: o.duty.state() }; });
const chatHas = (page: Page, re: RegExp) => page.evaluate((r) => (window as unknown as Win).__office!.chat.msgs.some((m) => new RegExp(r).test(m.text || '')), re.source);
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = await page.addStyleTag({ content: '.zc-peek, .toast { visibility: hidden !important }' });
  await page.screenshot({ path: path.join(SHOTS, name) });
  await tag.evaluate((n) => (n as Element).remove());
}

test('a make-up Saturday is a working day: the front desk open, lunch from home, the rota, and a grumble in the chat', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await open(page, '2026-01-10T08:40');   // (Saturday 10/1/2026, worked for Friday 2/1)
  await expect.poll(async () => (await O(page)).reception, { timeout: 180_000 }).toBe(true);
  const s = await O(page);
  expect(s.kind).toBe('makeup'); expect(s.swap!.off).toBe('2026-01-02');
  expect(s.lunch).toBeGreaterThan(0);
  await expect.poll(async () => Object.keys((await O(page)).duty.who).length, { timeout: 120_000 }).toBe(4);
  await expect.poll(() => chatHas(page, /Thứ Bảy mà vẫn phải lên công ty|làm bù/), { timeout: 180_000 }).toBe(true);
  await page.evaluate(() => (window as unknown as Win).__office!.view(-5.2, 1.0, 1.8, 3.6));
  await page.waitForTimeout(1500);
  await shot(page, 'lambu-saturday.png');
  // any other Saturday: the front desk shut, nobody brought lunch, no rota
  await page.goto('/?demo&debug&layout=pro&lang=vi&at=2026-01-17T08:40');
  await page.waitForFunction(() => (window as unknown as Win).__office?.daySwaps, null, { timeout: 120_000 });
  await page.waitForTimeout(15_000);
  const sat = await O(page);
  expect(sat.kind).toBe('weekend'); expect(sat.reception).toBe(false); expect(sat.lunch).toBe(0); expect(sat.duty.who).toEqual({});
  expect(errors).toEqual([]);
});

test('the swapped day off is a day off; the afternoon before the break says how long it is and when to make it up', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await open(page, '2026-08-31T09:30');   // (Monday 31/8/2026: off, swapped for Saturday 22/8)
  await page.waitForTimeout(15_000);
  const off = await O(page);
  expect(off.kind).toBe('swap'); expect(off.reception).toBe(false); expect(off.lunch).toBe(0); expect(off.duty.kind).toBe('swap');
  await page.evaluate(() => (window as unknown as Win).__office!.view(11.0, 2.4, -7.0, 5));
  await page.waitForTimeout(1500);
  await shot(page, 'lambu-swap-board.png');
  // the last afternoon before 1/1–4/1/2026 (with Friday 2/1 swapped): "nghỉ 4 ngày", and Saturday 10/1 to come back
  await page.goto('/?demo&debug&layout=pro&lang=vi&at=2025-12-31T16:40');
  await page.waitForFunction(() => (window as unknown as Win).__office?.daySwaps, null, { timeout: 120_000 });
  expect((await O(page)).after).toEqual({ days: 4, makeup: '2026-01-10' });
  await expect.poll(() => chatHas(page, /[Nn]ghỉ 4 ngày.*10\/01/), { timeout: 180_000 }).toBe(true);
  expect(errors).toEqual([]);
});
