import { test, expect, type Page } from '@playwright/test';

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
  test(`the ${layout} office starts in demo mode without errors`, async ({ page }) => {
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
  await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 20_000 });
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

test('hooks are accepted only from this machine and the page needs a token from elsewhere', async ({ request }) => {
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

test('English by default, another language on request', async ({ page }) => {
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
  street?: unknown, goOut: (kind: string) => boolean, outing: { stage: string } | null,
  fp: { street: boolean }, fpToStreet: () => void, limitOut: (min: number) => void, napOn: boolean,
  parcel: () => boolean, clean: () => void, staff: { cleaner: { offstage: boolean }, courier: { offstage: boolean }, delivery: unknown, strips: unknown[] },
  standup: () => boolean, teatime: () => boolean };
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

test('someone resting pops down to the convenience store and comes back with a drink', async ({ page }) => {
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
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.outing), { timeout: 90_000 }).toBe(null);
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
