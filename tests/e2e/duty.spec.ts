import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config';

// Trực nhật: the pantry's daily duty rota (people/duty.js, world/props/duty-board.js, src/shared/duty.js). SHOTS_DIR:
// where the pictures go.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
type Duty = { day: string, who: Record<string, string>, names: Record<string, string>, done: Record<string, number>, owe: { chore: string, who: string }[], pile: number, kind: string,
  job: { chore: string, id: string, stage: string, owed: boolean, left: number } | null, bin: number | null };
type Office = {
  duty: { state: () => Duty, go: (c: string) => boolean, look: () => void },
  chat: { msgs: { text?: string }[] }, sessions: Map<string, object>, upsert: (s: object) => void, pauseDemo: () => void, speed: (n: number) => void,
  view: (x: number, y: number, z: number, zoom: number) => void,
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
  await page.goto(`/?demo&debug&layout=pro&lang=vi&${query}`);
  await page.waitForFunction(() => (window as unknown as Win).__office?.duty, null, { timeout: 90_000 });
}
// everyone done and resting, the demo stopped (and kept resting), time sped up
const allResting = (page: Page, speed = 4) => page.evaluate((n) => {
  const o = (window as unknown as Win).__office!; o.pauseDemo();
  const rest = () => { for (const s of o.sessions.values()) if ((s as { status: string }).status !== 'rest') o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); };
  rest(); setInterval(rest, 1000); o.speed(n);
}, speed);
const st = (page: Page) => page.evaluate(() => (window as unknown as Win).__office!.duty.state());
const chatHas = (page: Page, re: RegExp) => page.evaluate((r) => (window as unknown as Win).__office!.chat.msgs.some((m) => new RegExp(r).test(m.text || '')), re.source);
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = await page.addStyleTag({ content: '.zc-peek, .toast { visibility: hidden !important }' });
  await page.screenshot({ path: path.join(SHOTS, name) });
  await tag.evaluate((n) => (n as Element).remove());
}
const pantry = (page: Page, zoom = 3.4) => page.evaluate((z) => (window as unknown as Win).__office!.view(11.6, 1.4, -6.6, z), zoom);

test('no duty at the weekend or on a holiday: the board says so, no cups pile up', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-07T15:00');   // (a Saturday)
  await page.waitForTimeout(3000);
  let s = await st(page);
  expect(s.kind).toBe('weekend'); expect(s.who).toEqual({}); expect(s.pile).toBe(0);
  await pantry(page); await page.waitForTimeout(1200);
  await shot(page, 'duty-weekend.png');
  await page.goto('/?demo&debug&layout=pro&lang=vi&at=2026-11-24T10:00');   // (Ngày Văn hóa Việt Nam)
  await page.waitForFunction(() => (window as unknown as Win).__office?.duty, null, { timeout: 90_000 });
  await page.waitForTimeout(3000);
  s = await st(page);
  expect(s.kind).toBe('holiday'); expect(s.who).toEqual({});
  expect(errors).toEqual([]);
});

test('a working afternoon: the rota on the board, the cups piled at the sink, washed one by one after the nap', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-02T16:20');   // (a Monday afternoon: the morning's cups, lunch's glasses, the afternoon's coffee)
  await expect.poll(async () => Object.keys((await st(page)).who).length, { timeout: 120_000 }).toBe(4);
  const before = await st(page);
  expect(before.pile).toBeGreaterThan(5);
  await pantry(page); await page.waitForTimeout(1500);
  await shot(page, 'duty-board-pile.png');
  // whoever has the cups, once resting, washes them: the pile goes down, the board ticks it
  await allResting(page, 4);
  await page.evaluate(() => (window as unknown as Win).__office!.duty.look());
  await expect.poll(async () => (await st(page)).job?.stage ?? '', { timeout: 120_000 }).toBe('wash');
  const washing = await st(page);
  expect(washing.job!.chore).toBe('cups'); expect(washing.job!.id).toBeTruthy();
  await page.waitForTimeout(2500);
  await shot(page, 'duty-washing.png');
  await expect.poll(async () => (await st(page)).done.cups ?? -1, { timeout: 120_000 }).toBeGreaterThan(0);
  expect((await st(page)).pile).toBe(0);
  await page.waitForTimeout(1500);
  await shot(page, 'duty-washed.png');
  expect(errors).toEqual([]);
});

test('at five: the bag out of the bin to the stairs landing, the tables wiped; the cleaner leaves the bin to the rota', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-02T17:05&duty');   // (?duty: every chore due now, quickly)
  await expect.poll(async () => Object.keys((await st(page)).who).length, { timeout: 120_000 }).toBe(4);
  await allResting(page, 6);
  await page.evaluate(() => (window as unknown as Win).__office!.view(9.2, 1.2, -4.6, 3.2));
  await expect.poll(async () => (await st(page)).job?.chore ?? '', { timeout: 300_000 }).toBe('trash');
  await page.waitForTimeout(2500);
  await shot(page, 'duty-trash.png');
  await expect.poll(async () => (await st(page)).done.trash ?? -1, { timeout: 300_000 }).toBeGreaterThan(0);
  expect((await st(page)).bin).toBeLessThan(0.1);   // (the bin emptied by the rota, not by the cleaner)
  await expect.poll(async () => { const d = (await st(page)).done; return ['cups', 'trash', 'plants', 'table'].filter((c) => d[c] != null).length; }, { timeout: 400_000 }).toBe(4);
  await pantry(page, 2.4); await page.waitForTimeout(1500);
  await shot(page, 'duty-all-done.png');
  expect(errors).toEqual([]);
});

test('the morning after a chore was missed: a grumble in the chat, a sorry, and it is done first thing', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await open(page, 'at=2026-11-02T18:25');   // (Monday evening, every chore's time gone by, nobody got round to any)
  await expect.poll(async () => Object.keys((await st(page)).who).length, { timeout: 120_000 }).toBe(4);
  const mon = await st(page);
  expect(mon.done).toEqual({});
  await page.goto('/?demo&debug&layout=pro&lang=vi&at=2026-11-03T08:20');   // (the same browser the next morning)
  await page.waitForFunction(() => (window as unknown as Win).__office?.duty, null, { timeout: 90_000 });
  await expect.poll(async () => (await st(page)).owe.length, { timeout: 120_000 }).toBe(4);
  const tue = await st(page);
  expect(tue.owe.map((o) => o.who).sort()).toEqual(Object.values(mon.who).sort());
  expect(tue.pile).toBeGreaterThan(5);   // (Monday's cups, still there)
  expect(tue.bin).toBeGreaterThan(1);    // (the bin spilling over)
  await expect.poll(() => chatHas(page, /ai trực|ai rửa ly/), { timeout: 120_000 }).toBe(true);
  await expect.poll(() => chatHas(page, /Trực nhật hôm nay|Phân công trực nhật/), { timeout: 120_000 }).toBe(true);
  await pantry(page); await page.waitForTimeout(1500);
  await shot(page, 'duty-owed.png');
  await allResting(page, 4);
  await page.evaluate(() => (window as unknown as Win).__office!.duty.look());
  await expect.poll(async () => (await st(page)).job?.owed ?? false, { timeout: 120_000 }).toBe(true);
  expect(errors).toEqual([]);
});
