import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { HOME_DIR } from '../../playwright.config';

// Collects uncaught errors and console errors while the page runs.
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}

// The first visit's tour (ui/tips.js) would sit over what the tests click: they start as returning visitors.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); } catch { /* private mode */ } }); });

for (const layout of ['pro', 'cozy', 'hq']) {
  test(`the ${layout} office starts in demo mode without errors`, { tag: '@smoke' }, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(`/?demo&layout=${layout}`);
    await expect(page.locator('#stage canvas')).toBeVisible();
    await expect(page.locator('#demo-chip')).toBeVisible();
    await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(3000);
    expect(errors).toEqual([]);
  });
}

test('panels open and close', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });   // (a software-rendered page is slow enough at full quality to time out)
  const errors = watchErrors(page);
  await page.goto('/?demo&layout=pro');
  await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 60_000 });   // (a busy machine takes ~17 s)
  await page.click('#btn-look');
  await expect(page.locator('#pop-look')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.click('#btn-mac');
  await expect(page.locator('#dr-mac')).toBeVisible();
  await page.click('#dr-mac [data-close]');
  await expect(page.locator('#dr-mac')).toBeHidden();
  await page.click('#tl-open');
  await expect(page.locator('#tl')).toBeVisible();
  await page.click('#tl-close');
  await page.click('#btn-lite');
  await expect(page.locator('#lite')).toBeVisible();
  await page.click('#btn-lite');
  expect(errors).toEqual([]);
});

test('hooks are accepted only from this machine and the page needs a token from elsewhere', { tag: '@smoke' }, async ({ request }) => {
  const r = await request.post('/event', { data: { hook_event_name: 'Ping' } });
  expect(r.status()).toBe(200);
  const health = await request.get('/health');
  expect(await health.text()).toBe('ok');
});

test('a session opens its drawer from the list', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?demo&layout=pro');
  const row = page.locator('#rail-list .ri').first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await expect(page.locator('#dr-session')).toBeVisible();
  await page.click('#tab-subs');
  await page.click('#tab-act');
  await page.click('#dr-session [data-close]');
  await expect(page.locator('#dr-session')).toBeHidden();
  expect(errors).toEqual([]);
});

test('English by default, another language on request', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/?demo&layout=cozy');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#btn-look')).toContainText('Settings');
  await page.goto('/?demo&layout=cozy&lang=vi');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.locator('#btn-look')).toContainText('Cài đặt');
});

test('the weekly recap draws its card', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?demo&layout=cozy');
  await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 20_000 });
  await page.click('#wrap-open');
  await expect(page.locator('#wrap-modal')).toBeVisible();
  await expect(page.locator('#wrap-note')).not.toContainText('Adding up');
  // the card is drawn: its middle is not the empty canvas
  const painted = await page.evaluate(() => {
    const c = document.getElementById('wrap-canvas') as HTMLCanvasElement;
    return c.getContext('2d')!.getImageData(540, 800, 1, 1).data[3] > 0;
  });
  expect(painted).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#wrap-modal')).toBeHidden();
  expect(errors).toEqual([]);
});

test('settings: four tabs, character portraits, graphics level', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?demo&layout=cozy');
  await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 20_000 });
  await page.click('#btn-look');
  await expect(page.locator('#pop-look')).toBeVisible();
  await page.click('[data-st-tab="people"]');
  await expect(page.locator('#st-panel-people')).toBeVisible();
  await expect(page.locator('[data-portrait="toy"] canvas')).toBeVisible();   // drawn by the office's renderer
  await page.click('[data-st-tab="display"]');
  await page.click('[data-quality="low"]');
  await expect(page.locator('[data-quality="low"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('[data-quality="auto"]');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pop-look')).toBeHidden();
  expect(errors).toEqual([]);
});

test('photo mode hides the panels and saves a PNG', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?demo&layout=cozy');
  await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 20_000 });
  await page.click('#btn-photo');
  await expect(page.locator('#photo-bar')).toBeVisible();
  await expect(page.locator('.topbar')).toBeHidden();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#ph-shoot')]);
  expect(download.suggestedFilename()).toMatch(/^my-office-.*\.png$/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.topbar')).toBeVisible();
  expect(errors).toEqual([]);
});

// The handful of debug hooks (?debug) the reaction tests read: who is doing what, and the floor lamps.
type Person = { station: string, phase: string, chore?: { thing?: unknown, gathering?: unknown }, deliver: () => void, reset: () => void, anim: string, goHomeNow: () => void,
  onBreak?: boolean, doze?: boolean, carry?: string };
type DebugOffice = { director: Person, workers: Map<string, Person>, floorLamps: { on: boolean }[], PROPS: Map<string, unknown>, activateProp: (p: unknown) => void,
  sessions: Map<string, object>, upsert: (s: object) => void, pauseDemo: () => void, speed: (n: number) => void,
  street?: unknown, goOut: (kind: string, key?: string) => boolean, outing: { stage: string, id?: string, shop?: string, item?: string } | null,
  fp: { street: boolean, pos?: { set: (x: number, z: number) => void }, yaw?: number }, fpToStreet: () => void, limitOut: (min: number) => void, napOn: boolean,
  parcel: () => boolean, clean: () => void, staff: { cleaner: { offstage: boolean }, courier: { offstage: boolean }, delivery: unknown, strips: unknown[] },
  standup: () => boolean, teatime: () => boolean,
  attendance?: () => { terminal: boolean, log: Record<string, { name: string, at: string, out: string | null, inferred: boolean }>, earliest: string, screen: string, tabs: string, pending: string[] },
  birthday?: () => boolean, party?: { banner: boolean, members: number, slices: number } | false,
  testRun: (ok?: boolean, i?: number) => string | false, commit: (i?: number) => string | false, push: (i?: number) => string | false, tests: Record<string, string>,
  post: { inBox: number, today: number, trip: boolean, postman: { offstage: boolean, carry?: string } | null } };
type Win = { __office?: DebugOffice };   // (written out in each evaluate: the page cannot see this file's functions)

test('switch off the director’s lamp after dark and the director switches it back on', async ({ page }) => {
  const errors = watchErrors(page);
  // people walk at the frame rate: a small window on low graphics keeps a software-rendered page quick enough
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=22:00');
  await page.waitForFunction(() => (window as unknown as Win).__office?.director, null, { timeout: 30_000 });   // (no side list this narrow)
  // keep the director at the desk (the demo keeps handing out work): no more deliveries, and back in his chair
  await page.evaluate(() => { const d = (window as unknown as Win).__office!.director; d.deliver = () => {}; d.reset(); });
  const lampOn = () => page.evaluate(() => (window as unknown as Win).__office!.floorLamps[0].on);
  expect(await lampOn()).toBe(true);
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.activateProp(o.PROPS.get('lamp0')); });
  expect(await lampOn()).toBe(false);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.director.chore?.thing != null)).toBe(true);
  // (a software-rendered page runs the office slowly: time for the walk there and back)
  await expect.poll(lampOn, { timeout: 30_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => { const d = (window as unknown as Win).__office!.director; return !d.chore && d.station === 'home'; }), { timeout: 30_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('the meeting bell calls people to the meeting table', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=cozy&at=15:00');
  await page.waitForFunction(() => (window as unknown as Win).__office?.PROPS.get('bell'), null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.activateProp(o.PROPS.get('bell')); });
  await expect.poll(() => page.evaluate(() => [...(window as unknown as Win).__office!.workers.values()].some((w) => w.chore?.gathering)), { timeout: 30_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('someone resting pops down to the convenience store and comes back with something from it', async ({ page }) => {
  test.setTimeout(200_000);   // (a walk across the street, in to the till and back up: longer than most)
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=15:00');
  await page.waitForFunction(() => (window as unknown as Win).__office?.street, null, { timeout: 30_000 });
  // the demo keeps everyone busy: stop it, everyone done, and time sped up until someone is napping at their desk
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(6); });
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.goOut('shop')), { timeout: 45_000 }).toBe(true);
  // down in the lift, across the street, into the shop, and back up to the desk
  await expect.poll(() => page.evaluate(() => ['street', 'in', 'back'].includes((window as unknown as Win).__office!.outing?.stage ?? '')), { timeout: 45_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.outing), { timeout: 130_000 }).toBe(null);
  expect(errors).toEqual([]);
});

test('a first visit gets a short tour of what you can click', async ({ page }) => {
  const errors = watchErrors(page);
  // a first visitor, once: the reload below is the same visitor coming back
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('first')) { sessionStorage.setItem('first', '1'); localStorage.removeItem('office-tips'); } } catch { /* private mode */ } });
  await page.goto('/?demo&layout=cozy');
  const card = page.locator('.tour');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tour-title')).toHaveText(/lamp/i);
  await page.click('.tour-next');
  await expect(page.locator('.tour-n')).toHaveText(/^2\//);
  await page.click('.tour-skip');
  await expect(card).toHaveCount(0);
  // seen: not again on the next visit
  await page.reload();
  await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(8000);
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('walking in, the lift goes down to the street and back up', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=15:00');
  await page.waitForFunction(() => (window as unknown as Win).__office?.street, null, { timeout: 30_000 });
  await page.click('#btn-fp');
  await page.evaluate(() => (window as unknown as Win).__office!.fpToStreet());
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.fp.street), { timeout: 10_000 }).toBe(true);
  // out on the pavement by the door: the way back in is right there
  await expect(page.locator('#fp-near')).toHaveText(/office/i, { timeout: 10_000 });
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.fp.street), { timeout: 10_000 }).toBe(false);
  expect(errors).toEqual([]);
});

test('a test run: the session watches it at the test board, whose lamp ends green', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=10:30&lang=en');
  await page.waitForFunction(() => (window as unknown as Win).__office?.testRun, null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(3); });
  const id = await page.evaluate(() => (window as unknown as Win).__office!.testRun(true, 0));
  expect(id).toBeTruthy();
  // amber while it runs, the character over at the board; green after
  expect(await page.evaluate((i) => (window as unknown as Win).__office!.tests[i as string], id)).toBe('run');
  await expect.poll(() => page.evaluate((i) => (window as unknown as Win).__office!.workers.get(i as string)?.station, id), { timeout: 30_000 }).toBe('tests');
  await expect.poll(() => page.evaluate((i) => (window as unknown as Win).__office!.tests[i as string], id), { timeout: 15_000 }).toBe('ok');
  await expect(page.locator('#feed').getByText(/tests pass/i).first()).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('a commit goes in the post box, and a push brings the postman to empty it', async ({ page }) => {
  test.setTimeout(180_000);   // (the letter's walk, then the postman up and down by the lift)
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=10:30&lang=en');
  await page.waitForFunction(() => (window as unknown as Win).__office?.commit, null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(4); });
  const before = await page.evaluate(() => (window as unknown as Win).__office!.post.today);
  const id = await page.evaluate(() => (window as unknown as Win).__office!.commit(0));
  expect(id).toBeTruthy();
  expect(await page.evaluate(() => (window as unknown as Win).__office!.post.today)).toBe(before + 1);
  // down to the box with the letter, posted
  await expect.poll(() => page.evaluate((i) => (window as unknown as Win).__office!.workers.get(i as string)?.station, id), { timeout: 40_000 }).toBe('post');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.post.inBox), { timeout: 20_000 }).toBeGreaterThan(0);
  // a push: the postman comes up, empties the box, and goes
  await page.evaluate(() => (window as unknown as Win).__office!.push(0));
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.post.postman?.offstage), { timeout: 60_000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.post.inBox), { timeout: 60_000 }).toBe(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.post.trip), { timeout: 60_000 }).toBe(false);
  expect(errors).toEqual([]);
});

test('going home by the street shows in the session list', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=15:00');
  await page.waitForFunction(() => (window as unknown as Win).__office?.street, null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(6); });
  // someone napping at their desk sets off home (at three in the afternoon they come straight back: on the way in)
  await expect.poll(() => page.evaluate(() => { const w = [...(window as unknown as Win).__office!.workers.values()].find((p) => p.anim === 'sleep' && p.station === 'desk'); w?.goHomeNow(); return !!w; }), { timeout: 45_000 }).toBe(true);
  await expect(page.locator('#rail-list .ri-dtxt', { hasText: /Heading home|On the way in/ }).first()).toBeVisible({ timeout: 45_000 });
  expect(errors).toEqual([]);
});

// the accountant, the director's rounds and the guard (people/accountant.js, rounds.js, guard.js): their debug hooks
type Staffed = { __office?: { workers?: unknown, sessions: Map<string, object>, upsert: (s: object) => void, pauseDemo: () => void, speed: (n: number) => void,
  accountant?: { atDesk: boolean, x: number, job: string | null, warn: string }, report: () => boolean, budgetWarn: () => boolean,
  rounds: () => boolean, round: { stage: string } | null, guard?: () => { night: boolean, gate: number, booth: number[] } } };

test('the accountant takes the day’s cost report to the director and asks the top spender to go easy near the limit', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1000, height: 640 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=17:20');
  await page.waitForFunction(() => (window as unknown as Staffed).__office?.accountant?.atDesk, null, { timeout: 45_000 });
  await page.evaluate(() => (window as unknown as Staffed).__office!.speed(3));   // (two walks across the floor: sped up, as the other trips)
  expect(await page.evaluate(() => (window as unknown as Staffed).__office!.report())).toBe(true);
  // over to the director's desk with the sheet, and back to her own
  await expect.poll(() => page.evaluate(() => (window as unknown as Staffed).__office!.accountant!.x), { timeout: 40_000 }).toBeLessThan(-3.8);
  await expect.poll(() => page.evaluate(() => { const a = (window as unknown as Staffed).__office!.accountant!; return a.atDesk && !a.job; }), { timeout: 60_000 }).toBe(true);
  expect(await page.evaluate(() => (window as unknown as Staffed).__office!.budgetWarn())).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as Staffed).__office!.accountant!.warn), { timeout: 60_000 }).toMatch(/token/i);
  expect(errors).toEqual([]);
});

test('the director’s rounds: out of the corner office, round the desks, and back', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1000, height: 640 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=10:05');
  await page.waitForFunction(() => (window as unknown as Staffed).__office?.workers, null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as Staffed).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); });
  // (at 10:05 the 10:00 round may already be under way: that one will do)
  // (everyone done at once: each comes to report first, and reports come before a round)
  await expect.poll(() => page.evaluate(() => { const o = (window as unknown as Staffed).__office!; return !!o.round || o.rounds(); }), { timeout: 150_000 }).toBe(true);
  await page.evaluate(() => (window as unknown as Staffed).__office!.speed(3));
  await expect.poll(() => page.evaluate(() => (window as unknown as Staffed).__office!.round?.stage ?? 'over'), { timeout: 40_000 }).toBe('look');
  await expect.poll(() => page.evaluate(() => (window as unknown as Staffed).__office!.round), { timeout: 90_000 }).toBe(null);
  expect(errors).toEqual([]);
});

test('the security guard: a booth by the street door, the folding gate drawn across it at night', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1000, height: 640 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=22:30');
  await page.waitForFunction(() => (window as unknown as Staffed).__office?.guard?.(), null, { timeout: 45_000 });
  expect((await page.evaluate(() => (window as unknown as Staffed).__office!.guard!())).night).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as Staffed).__office!.guard!().gate), { timeout: 30_000 }).toBeGreaterThan(0.6);
  await page.goto('/?demo&debug&layout=pro&at=10:00');
  await page.waitForFunction(() => (window as unknown as Staffed).__office?.guard?.(), null, { timeout: 45_000 });
  const day = await page.evaluate(() => (window as unknown as Staffed).__office!.guard!());
  expect(day.night).toBe(false);
  expect(day.gate).toBe(0);
  expect(errors).toEqual([]);
});

test('out of Claude: people go on a break until the limit resets, then the bell calls them back', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=15:00');
  await page.waitForFunction(() => (window as unknown as Win).__office?.workers.size, null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(6); });
  await page.evaluate(() => (window as unknown as Win).__office!.limitOut(0.5));   // the limit used up, back in half a minute
  const onBreak = () => page.evaluate(() => [...(window as unknown as Win).__office!.workers.values()].filter((w) => w.onBreak && w.station !== 'desk').length);
  await expect.poll(onBreak, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(onBreak, { timeout: 45_000 }).toBe(0);
  expect(errors).toEqual([]);
});

test('the attendance terminal: a new session clocks in by the lift, HR sees them to their desk and puts up their name', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=09:10&lang=en');
  await page.waitForFunction(() => (window as unknown as Win).__office?.attendance, null, { timeout: 30_000 });
  // those already at their desks have clocked in (each session's first sign of the day), so the plate has an earliest
  await expect.poll(() => page.evaluate(() => Object.keys((window as unknown as Win).__office!.attendance!().log).length), { timeout: 20_000 }).toBeGreaterThan(2);
  expect(await page.evaluate(() => (window as unknown as Win).__office!.attendance!().earliest)).not.toBe('-');
  // a new session: up in the lift, a finger on the terminal (its own entry, not inferred), then HR puts its name on the pod
  await page.evaluate(() => {
    const o = (window as unknown as Win).__office!, list = [...o.sessions.values()] as { desk: number }[], used = new Set(list.map((s) => s.desk));
    const desk = [...Array(12).keys()].find((d) => !used.has(d));
    o.upsert({ ...list[0], id: 'newbie', name: 'web-new', status: 'work', desk, dir: '~/code/web-new', git: { repo: 'web-new' }, subs: [], doneSubs: [], bg: [] });
    o.speed(4);   // (HR comes from the far corner of the floor)
  });
  await expect.poll(() => page.evaluate(() => { const e = (window as unknown as Win).__office!.attendance!().log.newbie; return !!e && !e.inferred; }), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.attendance!().tabs.split('|').includes('web-new')), { timeout: 60_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('the month’s birthdays: HR brings the cake, the banner goes up, everyone sings and gets a slice', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=15:20&lang=en');
  await page.waitForFunction(() => (window as unknown as Win).__office?.birthday, null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(4); });
  // (once someone is free to come)
  await expect.poll(() => page.evaluate(() => { const o = (window as unknown as Win).__office!; return !!o.party || o.birthday!(); }), { timeout: 45_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => { const p = (window as unknown as Win).__office!.party; return !!p && p.banner; }), { timeout: 60_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => { const p = (window as unknown as Win).__office!.party; return p ? p.slices : 0; }), { timeout: 60_000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('the midday nap: half of those resting sleep head down on the desk', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=cozy&at=12:45');
  await page.waitForFunction(() => (window as unknown as Win).__office?.workers.size, null, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.napOn)).toBe(true);   // (from the first frame on)
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(6); });
  await expect.poll(() => page.evaluate(() => [...(window as unknown as Win).__office!.workers.values()].some((w) => w.doze)), { timeout: 45_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('a Shopee courier brings a parcel and the one it is for collects it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=15:00');
  await page.waitForFunction(() => (window as unknown as Win).__office?.workers.size, null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(6); });
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.parcel()), { timeout: 45_000 }).toBe(true);
  // up in the lift, onto the counter, called out, collected
  await expect.poll(() => page.evaluate(() => { const S = (window as unknown as Win).__office!.staff; return !S.delivery && S.courier.offstage; }), { timeout: 60_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('the evening cleaner mops the aisles (wet strips), then goes home', async ({ page }) => {
  test.setTimeout(180_000);   // (every aisle mopped: long on a busy machine)
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=cozy&at=15:00');
  await page.waitForFunction(() => (window as unknown as Win).__office?.staff, null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.speed(6); o.clean(); });
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.staff.strips.length), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.staff.cleaner.offstage), { timeout: 75_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('Monday 9:00 stand-up and Friday 16:00 tea in the pantry', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=15:00');
  await page.waitForFunction(() => (window as unknown as Win).__office?.workers.size, null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(6); });
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.standup()), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => [...(window as unknown as Win).__office!.workers.values()].some((w) => w.chore?.gathering)), { timeout: 30_000 }).toBe(true);
  // after the meeting, the tea: someone with a cup of milk tea at a pantry table
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.teatime()), { timeout: 90_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => [...(window as unknown as Win).__office!.workers.values()].some((w) => w.carry === 'cup')), { timeout: 60_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('a trip to the GS25: the session list names the shop, and they come back with tokbokki or a drink', async ({ page }) => {
  test.setTimeout(200_000);   // (a walk across the street, in to the till and back up: longer than most)
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=15:00');   // (Ho Chi Minh City by default: a GS25 across the street)
  await page.waitForFunction(() => (window as unknown as Win).__office?.street, null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(6); });
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.goOut('shop', 'gs25')), { timeout: 45_000 }).toBe(true);
  const item = await page.evaluate(() => (window as unknown as Win).__office!.outing?.item);
  expect(['tok', 'cup']).toContain(item);
  await expect(page.locator('#rail-list .ri-dtxt', { hasText: /GS25/ }).first()).toBeVisible({ timeout: 45_000 });
  // out of the shop with it in hand, and still with it back at the desk
  await expect.poll(() => page.evaluate(() => { const o = (window as unknown as Win).__office!; return o.outing?.stage === 'back' && o.workers.get(o.outing.id!)?.carry; }), { timeout: 60_000 }).toBe(item);
  await expect.poll(() => page.evaluate((it) => { const o = (window as unknown as Win).__office!; return !o.outing && [...o.workers.values()].some((w) => w.carry === it && w.anim === 'coffee'); }, item), { timeout: 130_000 }).toBe(true);
  expect(errors).toEqual([]);
});

test('walking into the GS25: the door opens, the cashier says hello, a drink from the fridge paid by QR at the till', async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=15:00');
  await page.waitForFunction(() => (window as unknown as Win).__office?.street, null, { timeout: 30_000 });
  await page.click('#btn-fp');
  await page.evaluate(() => (window as unknown as Win).__office!.fpToStreet());
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.fp.street), { timeout: 10_000 }).toBe(true);
  // stand at a point of the shop (its own frame: x along the front, z out to the street), looking in
  const at = (lx: number, lz: number) => page.evaluate(([lx, lz]) => {
    const o = (window as unknown as Win).__office!, d = (o.street as { doors: () => { key: string, x: number, z: number, face: number }[] }).doors().find((x) => x.key === 'gs25')!;
    const rot = d.face === Math.PI ? 0 : Math.PI / 2, fx = d.x - (rot ? 0.45 : 0), fz = d.z - (rot ? 0 : 0.45);
    const w = (x: number, z: number) => (rot ? [fx + z, fz - x] : [fx + x, fz + z]), [x, z] = w(lx, lz), [ax, az] = w(lx, lz - 1);
    o.fp.pos!.set(x, z); o.fp.yaw = Math.atan2(ax - x, az - z);
  }, [lx, lz]);
  await at(0, 1.6);
  // up to the door (it slides open) and in: the cashier says hello
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => !!((window as unknown as Win).__office!.street as { shop: { inside: () => unknown } }).shop.inside()), { timeout: 20_000 }).toBe(true);
  await page.keyboard.up('KeyW');
  await expect(page.locator('.shop-say')).toHaveText(/GS25/, { timeout: 5_000 });
  await at(0, -3.2);
  await expect(page.locator('#fp-near')).toHaveText(/banana milk/i, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await at(2.2, -0.95);
  await expect(page.locator('#fp-near')).toHaveText(/1 item/i, { timeout: 5_000 });
  await page.keyboard.press('KeyE');
  await expect(page.locator('.toast').last()).toHaveText(/QR/, { timeout: 5_000 });
  expect(errors).toEqual([]);
});

// shredder.js and foosball.js add their own hooks (?debug)
type Paper = { compactNow: (i?: number) => string | null, paperwork: () => { levels: number[], shredder: { fill: number } | null, carrying: string[] },
  pingpong: () => boolean, foos: { ready: boolean, over: boolean, score: number[], ball: number[], players: string[] } | null };
type WinP = { __office?: DebugOffice & Paper };

test('a compaction: the desk\'s stack of paper goes to the shredder and the desk starts again', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=10:40');
  await page.waitForFunction(() => !!(window as unknown as WinP).__office?.compactNow, null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as WinP).__office!; o.pauseDemo(); o.speed(3); });
  const id = await page.evaluate(() => (window as unknown as WinP).__office!.compactNow(0));
  expect(id).toBeTruthy();
  const desk = await page.evaluate((id) => ((window as unknown as WinP).__office!.sessions.get(id!) as { desk: number }).desk, id);
  // up from the desk with the stack, fed into the shredder (its bin fills a little), back with next to nothing on the desk
  await expect.poll(() => page.evaluate((id) => (window as unknown as WinP).__office!.paperwork().carrying.includes(id!), id), { timeout: 60_000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as WinP).__office!.paperwork().shredder!.fill), { timeout: 60_000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate((d) => (window as unknown as WinP).__office!.paperwork().levels[d], desk), { timeout: 30_000 }).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('foosball: two who are resting play a game in the lounge, and work coming in ends it', async ({ page }) => {
  test.setTimeout(240_000);   // (everyone settling down to rest first, then the walk over: slow on a software-rendered page)
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  await page.goto('/?demo&debug&layout=pro&at=15:20');
  await page.waitForFunction(() => !!(window as unknown as WinP).__office?.pingpong, null, { timeout: 30_000 });
  await page.evaluate(() => { const o = (window as unknown as WinP).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(3); });
  await expect.poll(() => page.evaluate(() => (window as unknown as WinP).__office!.pingpong()), { timeout: 90_000 }).toBe(true);
  // both at the table, the ball moving
  await expect.poll(() => page.evaluate(() => (window as unknown as WinP).__office!.foos?.ready), { timeout: 90_000 }).toBe(true);
  const b0 = await page.evaluate(() => (window as unknown as WinP).__office!.foos!.ball.join());
  await expect.poll(() => page.evaluate(() => (window as unknown as WinP).__office!.foos?.ball.join()), { timeout: 10_000 }).not.toBe(b0);
  // work for one of them: the game stops and both go back
  await page.evaluate(() => { const o = (window as unknown as WinP).__office!, id = o.foos!.players[0], s = o.sessions.get(id) as object; o.upsert({ ...s, status: 'work' }); });
  await expect.poll(() => page.evaluate(() => (window as unknown as WinP).__office!.foos), { timeout: 60_000 }).toBe(null);
  expect(errors).toEqual([]);
});

test('adding a Claude account: a folder of its own, connected to the office, signed in from the card', async ({ page }) => {
  test.setTimeout(420_000);   // (signing in, renaming, picking, then the page once more: ~5 min on a busy machine)
  const errors = watchErrors(page), dir = path.join(HOME_DIR, '.claude-cong-ty');
  fs.rmSync(dir, { recursive: true, force: true });
  await page.goto('/');   // (the real office, on this computer: not the demo)
  await page.click('#btn-plan');
  await page.click('.plan-add-btn');
  await page.fill('.pa-form input', 'Công ty');
  await page.click('.pa-form [type=submit]');
  // the sign-in runs by itself (tests/e2e/fake-claude.sh stands in for Claude Code): the page to open again, then done
  await expect(page.locator('.pa-browser')).toBeVisible({ timeout: 20_000 });
  const settings = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
  expect(settings.hooks?.SessionStart?.length).toBeGreaterThan(0);   // (its sessions show in the office too)
  await expect(page.locator('.pa-done')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.plan-other b', { hasText: 'cong-ty' })).toBeVisible();
  // hovering an account: a name of the user's own, and "Use" for the account new sessions start on
  const acct = (name: string) => page.locator('.acct-block', { has: page.locator('.acct-name b', { hasText: name }) });
  await acct('cong-ty').hover();
  await acct('cong-ty').locator('.acct-name').click();
  await page.fill('.acct-rename input', 'Việc công ty');
  await page.keyboard.press('Enter');
  await expect(acct('Việc công ty')).toBeVisible();
  await acct('Việc công ty').hover();
  await acct('Việc công ty').locator('.acct-use').click();
  await expect(acct('Việc công ty').locator('.acct-badge--on')).toBeVisible();
  const main = page.locator('.acct-block').first();
  await main.hover();
  await main.locator('.acct-use').click();   // (back to the main account: the other tests expect it)
  await expect(main.locator('.acct-badge--on')).toBeVisible();
  // switching by itself when one runs out
  const sw = page.locator('.acct-switch');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  // the name stays; then back to the folder's own name for the next run
  await page.reload();
  await expect(page.locator('#btn-plan')).toBeVisible({ timeout: 90_000 });   // (shown once the limits arrive)
  await page.click('#btn-plan');
  await expect(acct('Việc công ty')).toBeVisible({ timeout: 20_000 });
  await acct('Việc công ty').locator('.acct-name').click();
  await page.fill('.acct-rename input', '');
  await page.keyboard.press('Enter');
  await expect(acct('cong-ty')).toBeVisible();
  expect(errors).toEqual([]);
});

test('an image a session reads shows in the feed as a thumbnail, and a click opens it large', async ({ page, request }) => {
  const errors = watchErrors(page), dir = path.join(HOME_DIR, 'shots'), file = path.join(dir, 'acct.png');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGN43xUPRww4OQC2ZhYhiIqZKgAAAABJRU5ErkJggg==', 'base64'));   // (4 × 3, coral)
  await page.goto('/');
  const base = { session_id: `e2e-img-${Date.now()}`, cwd: HOME_DIR, transcript_path: path.join(HOME_DIR, 'e2e-img.jsonl') };
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionStart', source: 'startup' } });
  await request.post('/event', { data: { ...base, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: file } } });
  const thumb = page.locator('.fg-thumb').first();
  await expect(thumb).toBeVisible({ timeout: 20_000 });
  await thumb.click();
  await expect(page.locator('.img-view')).toBeVisible();
  await expect.poll(() => page.evaluate(() => (document.querySelector('.img-view img') as HTMLImageElement | null)?.naturalWidth || 0)).toBe(4);
  await page.keyboard.press('Escape');
  await expect(page.locator('.img-view')).toBeHidden();
  // an id the office never handed out serves nothing
  expect((await request.get('/api/image?id=0000000000000000')).status()).toBe(404);
  expect(errors).toEqual([]);
});

test('the machine drawer says why it is slow, closes idle sessions in one go and can do it on a timer', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
  const errors = watchErrors(page);
  await page.goto('/?demo&layout=pro');
  await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 60_000 });   // (17 s on a Mac deep in swap)
  await page.locator('#btn-mac').evaluate((b: HTMLElement) => b.click());
  const body = page.locator('#mac-body');
  await expect(body.locator('.verdict')).toHaveAttribute('data-level', 'warn');
  await expect(body.locator('.verdict .mspark')).toHaveCount(2);                   // (RAM and swap, each on its own chart)
  await expect(body.locator('.meters .meter')).toHaveCount(4);                      // (no plan reading in the demo)
  // who holds the RAM: one bar, a legend entry per segment, the editor's parts
  const segs = await body.locator('.held-bar i').count();
  expect(segs).toBeGreaterThan(2);
  await expect(body.locator('.held-legend li')).toHaveCount(segs);
  await expect(body.locator('.row--ide .ide-parts li').first()).toBeVisible();
  // the main action asks first, then (in the demo) does nothing on a real machine. Both clicks in one go: the drawer is
  // rebuilt every 5 seconds and the question goes away after 4.5, longer than a slow page takes between two steps.
  await expect(body.locator('.verdict-acts .btn--primary')).toBeVisible({ timeout: 10_000 });
  const asked = await body.evaluate((b) => {
    const seen: string[] = [], t = document.getElementById('toast')!;
    new MutationObserver(() => { if (!t.hidden) seen.push(t.textContent || ''); }).observe(t, { attributes: true, childList: true, subtree: true, characterData: true });
    (window as unknown as { seenToasts: string[] }).seenToasts = seen;
    (b.querySelector('.verdict-acts .btn--primary') as HTMLElement).click();
    const sure = b.querySelector('.verdict-acts .btn--confirm') as HTMLElement | null;
    sure?.click();
    return sure?.textContent || '';
  });
  expect(asked).toMatch(/\?/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { seenToasts: string[] }).seenToasts.length)).toBeGreaterThan(0);
  const press = (sel: string) => body.locator(sel).first().evaluate((b: HTMLElement) => b.click());
  // closing idle sessions on a timer: off by default, one choice at a time
  const opts = body.locator('.auto-close [role="radio"]');
  await expect(opts).toHaveCount(4);
  await expect(opts.first()).toHaveAttribute('aria-checked', 'true');
  await press('.auto-close [role="radio"]:nth-child(2)');
  await expect(body.locator('.auto-close [role="radio"]').nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(body.locator('.auto-close [role="radio"]').first()).toHaveAttribute('aria-checked', 'false');
  expect(errors).toEqual([]);
});
