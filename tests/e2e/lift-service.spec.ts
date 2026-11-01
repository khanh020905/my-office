import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { DATA_DIR } from '../../playwright.config';

// The lift being serviced after the office's server starts (server/lift-service.mjs, life/lift-service.js, the stairs in
// world/entrance.js): what the server tells the page, on the test's own server and on one started again on a "new
// build" (data/lift.json says another build ran last); the barrier, the technician and the sticker; everyone taking the
// stairs meanwhile. SHOTS_DIR: where the pictures go.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
type Lift = { left: number, total: number, newBuild: boolean, sticker: { version: string, at: number, build: string } | null };
type Office = {
  street?: object,
  liftService: { state: () => { phase: string | null, left: number, service: boolean, tech: { offstage: boolean } | null, sticker: boolean, barrier: boolean },
    stairs: () => { down: string[], up: string[], open: number }, finish: () => boolean, extend: (secs?: number) => boolean, call: (s?: number) => boolean },
  goOut: (kind: string, key?: string) => boolean, outing: { kind: string, stage: string, id?: string } | null, chat: { msgs: { text?: string }[] },
  sessions: Map<string, object>, workers: Map<string, { station?: string, pos: { x: number, y: number } }>, upsert: (s: object) => void, pauseDemo: () => void, speed: (n: number) => void,
  fp: { pos: { set: (x: number, z: number) => void }, yaw: number, pitch: number }, view: (x: number, y: number, z: number, zoom: number) => void,
};
type Win = { __office?: Office };

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
// the first message the live stream sends a page: the snapshot, with the lift's servicing in it
async function snapLift(base: string): Promise<Lift> {
  const ctl = new AbortController(), r = await fetch(`${base}/stream`, { signal: ctl.signal }), reader = r.body!.getReader();
  let text = '';
  while (!/\n\n/.test(text)) { const { value, done } = await reader.read(); if (done) break; text += new TextDecoder().decode(value); }
  ctl.abort();
  return JSON.parse(/^data: (.*)$/m.exec(text)![1]).lift;
}
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = await page.addStyleTag({ content: '.fp-help, .zc-peek, .toast, #fp-near { visibility: hidden !important }' });
  await page.screenshot({ path: path.join(SHOTS, name) });
  await tag.evaluate((n) => (n as Element).remove());
}
// stand in the lobby in first person, at (x, z), looking at (tx, tz)
async function stand(page: Page, x: number, z: number, tx: number, tz: number, pitch = -0.04) {
  await page.evaluate(([x, z, tx, tz, pitch]) => { const f = (window as unknown as Win).__office!.fp; f.pos.set(x, z); f.yaw = Math.atan2(tx - x, tz - z); f.pitch = pitch; }, [x, z, tx, tz, pitch]);
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } });
});

test('the test office just started: the page hears how long the lift is serviced, and shows it', async ({ page, baseURL }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page), lift = await snapLift(baseURL!);
  expect(lift.total).toBe(lift.newBuild ? 300_000 : 180_000);
  expect(lift.left).toBeLessThanOrEqual(lift.total);
  test.skip(lift.left < 45_000, 'this office started long enough ago that the servicing is over');
  await page.goto('/?debug&layout=pro');   // (live, not the demo: the servicing comes from the server)
  await page.waitForFunction(() => (window as unknown as Win).__office?.liftService, null, { timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.liftService.state()), { timeout: 30_000 })
    .toMatchObject({ phase: 'work', service: true, barrier: true, tech: { offstage: false } });
  // at the lift in first person: down by the stairs
  await page.click('#btn-fp');
  await stand(page, -6.25, 3.3, -7.2, 3.3);
  await expect(page.locator('#fp-near')).toContainText(/stairs: the lift is being serviced/i, { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('started again on another build: five minutes, the technician packs up, the sticker stays in the car', async ({ page }) => {
  test.setTimeout(240_000);
  const PORT = (Number(process.env.E2E_PORT) || 4399) + 33, BASE = `http://127.0.0.1:${PORT}`, OUT = path.join(DATA_DIR, '..', 'lift-restart'), HOME = path.join(OUT, 'home'), DATA = path.join(OUT, 'office-data');
  const build = fs.readFileSync(path.resolve(process.env.OFFICE_DIST_DIR || '.next', 'BUILD_ID'), 'utf8').trim();
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(DATA, { recursive: true }); fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(path.join(DATA, 'lift.json'), JSON.stringify({ build: 'an-older-build', sticker: null }));   // (what the last start left)
  const env: NodeJS.ProcessEnv = { ...process.env, HOME, USERPROFILE: HOME, OFFICE_CLAUDE_BIN: path.resolve('tests/e2e/fake-claude.sh'), NODE_ENV: 'production', OFFICE_PORT: String(PORT),
    OFFICE_DATA_DIR: DATA, OFFICE_LANG: 'vi', OFFICE_TRANSLATE: '0', OFFICE_USAGE: '0', OFFICE_CI: '0' };
  delete env.CLAUDE_CONFIG_DIR;   // (never the real ~/.claude)
  const start = async () => {
    const s = spawn(process.execPath, ['server/index.mjs'], { env, stdio: 'ignore' });
    await expect.poll(async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } }, { timeout: 60_000 }).toBe(true);
    return s;
  };
  const stop = (s: ChildProcess) => new Promise((ok) => { s.once('exit', ok); s.kill(); });
  let server: ChildProcess | null = await start();
  try {
    const lift = await snapLift(BASE);
    expect(lift.newBuild).toBe(true);
    expect(lift.total).toBe(300_000);
    expect(lift.sticker?.build).toBe(build.slice(0, 7));
    expect(JSON.parse(fs.readFileSync(path.join(DATA, 'lift.json'), 'utf8')).build).toBe(build);

    const errors = watchErrors(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}/?debug&layout=pro`);
    await page.waitForFunction(() => (window as unknown as Win).__office?.liftService?.state().phase === 'work', null, { timeout: 90_000 });
    await page.click('#btn-fp');
    await stand(page, -4.8, 3.95, -7.0, 3.6);
    await page.waitForTimeout(1500);
    await shot(page, 'lift-service-vi.png');   // the barrier and its sign, the technician at the call panel, the stairs' door
    await page.evaluate(() => (window as unknown as Win).__office!.liftService.finish());
    await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.liftService.state()), { timeout: 60_000 })
      .toMatchObject({ phase: 'done', barrier: false, service: false, tech: { offstage: true } });
    // the lift back to this floor, its doors open: the sticker on the car's back wall
    await page.evaluate(() => (window as unknown as Win).__office!.liftService.call(12));
    await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.liftService.state().sticker), { timeout: 20_000 }).toBe(true);
    await stand(page, -7.05, 3.15, -7.95, 2.88);
    await page.waitForTimeout(2000);
    await shot(page, 'lift-sticker-vi.png');
    expect(errors).toEqual([]);

    // and again on the same build: three minutes, no new build, the sticker still there
    await stop(server); server = null;
    server = await start();
    const again = await snapLift(BASE);
    expect([again.newBuild, again.total, again.sticker?.build]).toEqual([false, 180_000, build.slice(0, 7)]);
  } finally { if (server) await stop(server); }
});

// the demo's people all resting, the office sped up
async function resting(page: Page, query: string) {
  await page.goto(`/?demo&debug&layout=pro&${query}`);
  await page.waitForFunction(() => { const o = (window as unknown as Win).__office; return o?.street && o.liftService?.state().phase === 'work'; }, null, { timeout: 60_000 });
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(6); });
}

test('while the lift is serviced everyone takes the stairs: down, out, back up out of breath; the chat grumbles', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await resting(page, 'at=15:00&liftservice');
  // someone out to a shop (sent now, or already on their way: the office sends people out by itself too)
  await expect.poll(() => page.evaluate(() => { const o = (window as unknown as Win).__office!; return o.outing?.kind === 'shop' || o.goOut('shop'); }), { timeout: 150_000 }).toBe(true);   // (once someone is napping at their desk)
  const id = await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.liftService.extend(300); return o.outing!.id; });   // (still serviced when they come back)
  await expect.poll(() => page.evaluate(() => { const o = (window as unknown as Win).__office!; return [...o.liftService.stairs().down, o.outing?.stage === 'street' ? 'out' : '']; }), { timeout: 60_000 }).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^(${id}|out)$`))]));
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.outing?.stage), { timeout: 90_000 }).toMatch(/street|in|back/);
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.liftService.stairs().up), { timeout: 120_000 }).toContain(id);
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.speed(1); o.view(-7.3, 1.2, 4.3, 6); });   // (at its own pace: the door is open a moment)
  // out of the stairs' door (it opens for them), then on to their desk
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.liftService.stairs().open), { timeout: 30_000, intervals: [100] }).toBeGreaterThan(0.85);
  await shot(page, 'lift-stairs-up.png');
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__office!.outing), { timeout: 60_000 }).toBe(null);
  expect(await page.evaluate(() => (window as unknown as Win).__office!.chat.msgs.some((m) => /serviced|service|maintenance/i.test(m.text || '')))).toBe(true);
  expect(errors).toEqual([]);
});

test('on a phone: the lobby with the lift serviced', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?demo&debug&layout=pro&at=10:00&liftservice=new&lang=vi');
  await page.waitForFunction(() => (window as unknown as Win).__office?.liftService?.state().phase === 'work', null, { timeout: 60_000 });
  await page.evaluate(() => { const o = (window as unknown as Win).__office!; o.pauseDemo(); o.view(-7.1, 1.2, 3.8, 6); });
  await page.waitForTimeout(2500);
  await shot(page, 'lift-phone.png');
  expect(errors).toEqual([]);
});
