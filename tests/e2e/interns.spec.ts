import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR, HOME_DIR } from '../../playwright.config';

// Interns made permanent at HR's desk (people/interns.js, server/tenure.mjs). SHOTS_DIR: where the pictures go.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
type IState = { stage: string | null, name: string | null, contract: boolean, shook: boolean, last: { name: string, who: string, stage: string, shook: boolean } | null, interns: string[], plates: string[] };
type W = { anim: string, pos: { x: number, y: number }, lanyard?: { color: string } | null };
type Office = {
  intern: { ready: (name: string) => boolean, state: () => IState },
  chat: { msgs: { text?: string }[] }, sessions: Map<string, { name: string, desk: number, status?: string }>, workers: Map<string, W>,
  director: { station: string, job: unknown, queue: unknown[] }, upsert: (s: object) => void, pauseDemo: () => void, speed: (n: number) => void, view: (x: number, y: number, z: number, zoom: number) => void,
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
  await page.goto(`/?demo&debug&${query}`);
  await page.waitForFunction(() => (window as unknown as Win).__office?.intern && (window as unknown as Win).__office!.workers.size, null, { timeout: 30_000 });
}
const allResting = (page: Page, speed = 2) => page.evaluate((n) => {
  const o = (window as unknown as Win).__office!; o.pauseDemo();
  const rest = () => { for (const s of o.sessions.values()) if (s.status !== 'rest') o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); };
  for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] });
  setInterval(rest, 800); o.speed(n);
}, speed);
const st = (page: Page) => page.evaluate(() => (window as unknown as Win).__office!.intern.state());
const chatHas = (page: Page, re: RegExp) => page.evaluate((r) => (window as unknown as Win).__office!.chat.msgs.some((m) => new RegExp(r).test(m.text || '')), re.source);
async function shot(page: Page, name: string, at: { x: number, z: number } | null = null) {
  if (at) await page.evaluate((v) => (window as unknown as Win).__office!.view(v.x, 0.9, v.z, 9), at);
  await page.waitForTimeout(1200);
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = await page.addStyleTag({ content: '.zc-peek, .toast { visibility: hidden !important }' });
  await page.screenshot({ path: path.join(SHOTS, name) });
  await tag.evaluate((n) => (n as Element).remove());
}
const internAt = (page: Page) => page.evaluate(() => { const o = (window as unknown as Win).__office!, w = [...o.workers.entries()].find(([id]) => o.sessions.get(id)?.name === 'data-pipeline')![1]; return { x: w.pos.x, z: w.pos.y }; });

test('an intern: the orange lanyard and the plate; 20 turns on two days later, the contract signed and stamped at HR, the director\'s handshake, a name plate', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await open(page, 'layout=pro&at=2026-11-03T14:10&lang=vi');   // (a Tuesday afternoon, not the director's rounds; the demo's data-pipeline is new here)
  await expect.poll(async () => (await st(page)).interns.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(async () => (await st(page)).plates.some((p) => p.startsWith('intern')), { timeout: 20_000 }).toBe(true);
  await allResting(page, 4);
  await shot(page, 'intern-lanyard.png', await internAt(page));
  // (once the director has handed out the morning's work and is back at his desk)
  await expect.poll(() => page.evaluate(() => { const d = (window as unknown as Win).__office!.director as unknown as { station: string, job: unknown, queue: unknown[], phase: string, chore: unknown }; return `${d.station}|${d.job ? 'job' : '-'}|${d.queue.length}|${d.phase}|${d.chore ? 'chore' : '-'}`; }), { timeout: 90_000 }).toMatch(/^home\|-\|0\|idle\|-$/);
  expect(await page.evaluate(() => (window as unknown as Win).__office!.intern.ready('data-pipeline'))).toBe(true);
  await expect.poll(async () => (await st(page)).stage, { timeout: 60_000 }).toBe('sign');
  expect((await st(page)).contract).toBe(true);
  await shot(page, 'intern-contract.png', { x: 5.7, z: 7.9 });
  await expect.poll(async () => (await st(page)).shook, { timeout: 90_000 }).toBe(true);
  await shot(page, 'intern-handshake.png', { x: 5.9, z: 8.1 });
  await expect.poll(async () => (await st(page)).last?.stage, { timeout: 90_000 }).toBe('done');
  expect((await st(page)).last).toMatchObject({ name: 'data-pipeline', shook: true });
  await expect.poll(() => chatHas(page, /lên chính thức|chính thức là người nhà/), { timeout: 20_000 }).toBe(true);
  expect((await st(page)).interns).toEqual([]);   // (the lanyard off)
  await expect.poll(async () => (await st(page)).plates.some((p) => p.startsWith('name|')), { timeout: 20_000 }).toBe(true);
  await shot(page, 'intern-plate.png', await internAt(page));
  expect(errors).toEqual([]);
});

test('a new project from the hooks is an intern on the server; the projects there before are not', async ({ request }) => {
  const sid = `e2e-intern-${Date.now()}`, base = { session_id: sid, cwd: path.join(HOME_DIR, 'brand-new-proj'), transcript_path: path.join(HOME_DIR, `${sid}.jsonl`) };
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionStart', source: 'startup' } });
  await request.post('/event', { data: { ...base, hook_event_name: 'Stop', last_assistant_message: 'ok' } });
  await expect.poll(async () => ((await (await request.get('/api/tenure')).json()).projects as { name: string, intern: boolean, ready: boolean }[]).find((p) => p.name === 'brand-new-proj'), { timeout: 20_000 }).toMatchObject({ intern: true, ready: false });
  // one turn on one day: not ready, so HR can't sign it yet
  expect((await (await request.post('/api/tenure', { data: { op: 'official', name: 'brand-new-proj' }, headers: { Origin: test.info().project.use.baseURL! } })).json()).ok).toBe(false);
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionEnd', reason: 'other' } });
});

test('on a phone: the intern\'s lanyard and plate, nothing out of place', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'layout=pro&at=2026-11-03T14:10&lang=vi', { width: 390, height: 844 });
  await expect.poll(async () => (await st(page)).interns.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await shot(page, 'intern-phone.png', await internAt(page));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});
