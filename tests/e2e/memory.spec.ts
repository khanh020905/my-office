import { test, expect, type Page } from '@playwright/test';

// What has to come back for an office that stays open for days (people/chibi-rig.js disposeChibi): subagents that came
// and went leave the renderer holding no more geometries than before (a change of look: look-dispose.spec.ts). Each
// subagent's body used to stay on the GPU, vertex arrays and all, for as long as the page was open.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); } catch { /* private mode */ } }); });

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
type S = { id: string, desk: number };
type O = { pauseDemo: () => void, speed: (n: number) => void, sessions: Map<string, S>, subs: Map<string, object>, leaving: Set<object>, upsert: (s: object) => void,
  renderer: { info: { memory: { geometries: number } } } };
const geometries = (page: Page) => page.evaluate(() => (window as unknown as { __office: O }).__office.renderer.info.memory.geometries);
// the count once nothing is being built any more (two readings a few seconds apart agree)
async function settled(page: Page) {
  let last = -1;
  await expect.poll(async () => { const n = await geometries(page); const same = n === last; last = n; return same; }, { timeout: 120_000, intervals: [3000] }).toBe(true);
  return last;
}
async function quietOffice(page: Page) {
  await page.goto('/?demo&debug&layout=pro&at=10:30&lang=en');
  await page.waitForFunction(() => (window as unknown as { __office?: O }).__office?.pauseDemo, null, { timeout: 120_000 });
  await page.evaluate(() => { const o = (window as unknown as { __office: O }).__office; o.pauseDemo(); for (const s of o.sessions.values()) o.upsert({ ...s, status: 'rest', bg: [], subs: [] }); o.speed(6); });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __office: O }).__office.subs.size), { timeout: 60_000 }).toBe(0);
}

test('subagents that come and go give their 3D bodies back', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await quietOffice(page);
  const before = await settled(page);
  for (let round = 0; round < 3; round++) {
    // one comes in through the lift to the boss's desk, then reports back and goes home
    await page.evaluate((r) => { const o = (window as unknown as { __office: O }).__office, s = [...o.sessions.values()].find((x) => x.desk >= 0)!; o.upsert({ ...s, status: 'work', subs: [{ id: `mem-${r}`, type: 'Explore', desc: 'find the cart code' }] }); }, round);
    await expect.poll(() => geometries(page), { timeout: 30_000 }).toBeGreaterThan(before + 30);   // (drawn: its body is on the GPU)
    await page.evaluate(() => { const o = (window as unknown as { __office: O }).__office, s = [...o.sessions.values()].find((x) => x.desk >= 0)!; o.upsert({ ...s, status: 'rest', subs: [] }); });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __office: O }).__office.subs.size), { timeout: 30_000 }).toBe(0);
  }
  // all three gone out of the door: what they held on the GPU went with them
  await expect.poll(() => geometries(page), { timeout: 120_000 }).toBeLessThanOrEqual(before + 15);
  expect(errors).toEqual([]);
});

test('a crowd of subagents finishing at once: at most 8 walk out, the rest just go, and all of it comes back', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await quietOffice(page);
  const before = await settled(page);
  await page.evaluate(() => { const o = (window as unknown as { __office: O }).__office, s = [...o.sessions.values()].find((x) => x.desk >= 0)!; o.upsert({ ...s, status: 'work', subs: Array.from({ length: 24 }, (_, i) => ({ id: `crowd-${i}`, type: 'Explore', desc: `part ${i}` })) }); });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __office: O }).__office.subs.size)).toBe(24);
  await page.evaluate(() => { const o = (window as unknown as { __office: O }).__office, s = [...o.sessions.values()].find((x) => x.desk >= 0)!; o.upsert({ ...s, status: 'rest', subs: [] }); });
  expect(await page.evaluate(() => (window as unknown as { __office: O }).__office.leaving.size)).toBeLessThanOrEqual(8);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __office: O }).__office.leaving.size), { timeout: 360_000 }).toBe(0);   // (a slow machine walks them out slowly)
  await expect.poll(() => geometries(page), { timeout: 30_000 }).toBeLessThanOrEqual(before + 15);
  expect(errors).toEqual([]);
});
