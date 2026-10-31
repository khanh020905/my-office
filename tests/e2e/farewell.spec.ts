import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR, HOME_DIR } from '../../playwright.config';

// The farewell for a project gone quiet, and its return (people/farewell.js, server/tenure.mjs). SHOTS_DIR: pictures.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
type FState = { stage: string | null, name: string | null, u: number | null, card: boolean, signs: number, lanyard: boolean, carry: string | null, last: { name: string, stage: string, carried?: boolean } | null, marks: number, rugs: string[] };
type Office = {
  farewell: { set: (list: object[], days?: number) => void, back: (name: string) => boolean, state: () => FState, at: () => { x: number, z: number } | null },
  chat: { msgs: { text?: string, photo?: string | null }[] }, sessions: Map<string, { name: string, desk: number }>, workers: Map<string, { pos: { x: number, y: number } }>,
  upsert: (s: object) => void, pauseDemo: () => void, speed: (n: number) => void, view: (x: number, y: number, z: number, zoom: number) => void,
};
type Win = { __office?: Office };

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
async function open(page: Page, query: string, size = { width: 1280, height: 720 }, areas: Record<string, number[]> = {}) {
  await page.setViewportSize(size);
  await page.addInitScript((a) => { try { localStorage.setItem('office-quality', 'low'); localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-areas', a); } catch { /* private mode */ } }, JSON.stringify(areas));
  await page.goto(`/?demo&debug&${query}`);
  await page.waitForFunction(() => (window as unknown as Win).__office?.farewell && (window as unknown as Win).__office!.workers.size, null, { timeout: 30_000 });
}
const allResting = (page: Page, speed = 4) => page.evaluate((n) => {
  const o = (window as unknown as Win).__office!; o.pauseDemo();
  const rest = () => { for (const s of o.sessions.values()) if ((s as { status?: string }).status !== 'rest') o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); };
  for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] });
  setInterval(rest, 1000); o.speed(n);
}, speed);
const st = (page: Page) => page.evaluate(() => (window as unknown as Win).__office!.farewell.state());
const chatHas = (page: Page, re: RegExp, photo = false) => page.evaluate(([r, p]) => (window as unknown as Win).__office!.chat.msgs.some((m) => new RegExp(r as string).test(m.text || '') && (!p || !!m.photo)), [re.source, photo] as const);
async function shot(page: Page, name: string, at?: () => Promise<{ x: number, z: number } | null>) {
  if (at) { const a = await at(); if (a) await page.evaluate((v) => (window as unknown as Win).__office!.view(v.x, 0.9, v.z, 9), a); }
  await page.waitForTimeout(1200);
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = await page.addStyleTag({ content: '.zc-peek, .toast { visibility: hidden !important }' });
  await page.screenshot({ path: path.join(SHOTS, name) });
  await tag.evaluate((n) => (n as Element).remove());
}
const deskAt = (page: Page) => () => page.evaluate(() => (window as unknown as Win).__office!.farewell.at());

test('a project quiet for a month: its person packs the desk, the card, the cake, the photo, the badge back, out with the box, "Bàn trống"', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  // (the headquarters: room for the old project's area, which this device remembers)
  await open(page, 'layout=hq&at=2026-11-03T16:00&lang=vi&farewell', { width: 1280, height: 720 }, { 'old-landing': [2] });   // (?farewell: a shorter party)
  await allResting(page, 4);
  await page.evaluate(() => (window as unknown as Win).__office!.farewell.set([{ name: 'old-landing', due: true, last: Date.now() - 40 * 864e5, days: 12 }]));
  await expect.poll(async () => (await st(page)).stage, { timeout: 150_000 }).toBe('pack');   // (up in the lift and to the desk: slow on a busy machine)
  expect(await st(page)).toMatchObject({ name: 'old-landing', u: 2, lanyard: true });
  expect((await st(page)).rugs.some((r) => r.startsWith('2:'))).toBe(true);   // (the area's carpet out, in its colour)
  await shot(page, 'farewell-pack.png', deskAt(page));
  await expect.poll(() => chatHas(page, /chia tay old-landing/), { timeout: 30_000 }).toBe(true);
  // round the meeting table: the card signed in turn, the photo in the group chat, the badge handed back
  await expect.poll(async () => (await st(page)).signs, { timeout: 120_000 }).toBeGreaterThan(2);
  expect((await st(page)).card).toBe(true);
  await shot(page, 'farewell-card.png', async () => ({ x: 0.2, z: -5.5 }));
  await expect.poll(() => chatHas(page, /Ảnh chia tay old-landing|Ảnh kỷ niệm/, true), { timeout: 90_000 }).toBe(true);
  await expect.poll(async () => (await st(page)).lanyard, { timeout: 90_000 }).toBe(false);
  // out by the lift with the box; the carpet rolled up, the desk free
  await expect.poll(async () => (await st(page)).last?.stage, { timeout: 180_000 }).toBe('done');
  expect((await st(page)).last?.carried).toBe(true);   // (the box in the arms, out by the lift)
  expect((await st(page)).marks).toBe(1);
  expect((await st(page)).rugs.some((r) => r.startsWith('2:'))).toBe(false);
  await shot(page, 'farewell-empty.png', deskAt(page));
  expect(errors).toEqual([]);
});

test('not at lunch, the nap or after hours; and opened again it comes back to the old company: teased, the box unpacked, the carpet unrolled', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await open(page, 'layout=pro&at=2026-11-03T12:10&lang=vi');
  await allResting(page, 4);
  await page.evaluate(() => (window as unknown as Win).__office!.farewell.set([{ name: 'old-crm', due: true, last: Date.now() - 40 * 864e5, days: 6 }]));
  await page.waitForTimeout(6000);
  expect((await st(page)).stage).toBeNull();   // (lunchtime: it waits)
  // mobile-app said goodbye a while ago and has a session again
  await page.evaluate(() => (window as unknown as Win).__office!.farewell.set([{ name: 'mobile-app', farewell: Date.now() - 2 * 864e5, days: 9 }]));
  await page.evaluate(() => { const o = (window as unknown as Win).__office!, w = [...o.workers.entries()].find(([id]) => o.sessions.get(id)?.name === 'mobile-app')![1]; o.view(w.pos.x, 0.9, w.pos.y, 9); });
  expect(await page.evaluate(() => (window as unknown as Win).__office!.farewell.back('mobile-app'))).toBe(true);
  await expect.poll(() => chatHas(page, /quay lại|về lại công ty cũ|quay về/), { timeout: 30_000 }).toBe(true);
  await shot(page, 'farewell-back.png');
  await expect.poll(async () => (await st(page)).rugs.filter((r) => r.endsWith('1.00')).length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Settings → More: farewells after 14, 30, 60 or 90 days, or off, kept by the server; the hooks keep each project\'s working life', async ({ page, request }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  const sid = `e2e-tenure-${Date.now()}`, base = { session_id: sid, cwd: path.join(HOME_DIR, 'tenure-proj'), transcript_path: path.join(HOME_DIR, `${sid}.jsonl`) };
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionStart', source: 'startup' } });
  await request.post('/event', { data: { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'hello' } });
  await request.post('/event', { data: { ...base, hook_event_name: 'Stop', last_assistant_message: 'Hi' } });
  await page.goto('/');
  await expect(async () => { if (!(await page.locator('#pop-look').isVisible())) await page.click('#btn-look'); await expect(page.locator('#pop-look')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });
  await page.click('#st-tab-more');
  const box = page.locator('#st-farewell');
  await expect(box).toBeVisible({ timeout: 20_000 });
  await expect(box.locator('[data-fw-days="30"]')).toHaveAttribute('aria-pressed', 'true');
  await box.locator('[data-fw-days="60"]').click();
  await expect(box.locator('[data-fw-days="60"]')).toHaveAttribute('aria-pressed', 'true');
  expect((await (await request.get('/api/tenure')).json()).days).toBe(60);
  await box.locator('[data-fw-tgl]').click();
  await expect(box.locator('[data-fw-tgl]')).toHaveAttribute('aria-checked', 'false');
  await expect(box.locator('[data-fw-days="60"]')).toBeDisabled();
  expect((await (await request.get('/api/tenure')).json()).days).toBe(0);
  await box.locator('[data-fw-tgl]').click();
  await box.locator('[data-fw-days="30"]').click();
  await expect(box.locator('[data-fw-days="30"]')).toHaveAttribute('aria-pressed', 'true');
  // the ledger: the project, a day of work and a finished turn (only the office's own file; written within ten seconds)
  await expect.poll(() => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'tenure.json'), 'utf8')).projects['tenure-proj']; } catch { return null; } }, { timeout: 30_000 }).toMatchObject({ days: 1, turns: 1 });
  // a farewell only when it is due: not for this one
  expect((await (await request.post('/api/tenure', { data: { op: 'farewell', name: 'tenure-proj' }, headers: { Origin: new URL(page.url()).origin } })).json()).ok).toBe(false);
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionEnd', reason: 'other' } });
  expect(errors).toEqual([]);
});

test('on a phone: the farewell plays, nothing out of place', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await open(page, 'layout=hq&at=2026-11-03T16:00&lang=vi&farewell', { width: 390, height: 844 }, { 'old-landing': [2] });
  await allResting(page, 4);
  await page.evaluate(() => (window as unknown as Win).__office!.farewell.set([{ name: 'old-landing', due: true, last: Date.now() - 40 * 864e5, days: 12 }]));
  await expect.poll(async () => (await st(page)).signs, { timeout: 150_000 }).toBeGreaterThan(1);
  await shot(page, 'farewell-phone.png', async () => ({ x: 0.2, z: -5.5 }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});
