import { test, expect, type Page } from '@playwright/test';

// Changing the character look rebuilds every person's rig: the old one's geometries and materials go back to the GPU,
// so switching back and forth doesn't pile up rendering resources for as long as the office stays open.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } }); });

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
type Win = { __office: { renderer: { info: { memory: { geometries: number } } } } };
const geometries = (page: Page) => page.evaluate(() => (window as unknown as Win).__office.renderer.info.memory.geometries);
// a few frames drawn, so what is new is uploaded and what was given back is gone from the count
const settle = (page: Page) => page.evaluate(() => new Promise((done) => { let n = 0; const f = () => (++n > 6 ? done(null) : requestAnimationFrame(f)); requestAnimationFrame(f); }));
const look = (page: Page, l: 'toy' | 'pixar') => page.evaluate((v) => (document.querySelector(`[data-look="${v}"]`) as HTMLElement).click(), l);

test('switching the look back and forth gives the old rigs back: the GPU holds about as much as before', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await page.goto('/?demo&debug');
  await expect(page.locator('#rail-list .ri').first()).toBeVisible({ timeout: 120_000 });
  await page.waitForTimeout(3000); await settle(page);
  const before = await geometries(page);
  for (let i = 0; i < 4; i++) { await look(page, 'toy'); await settle(page); await look(page, 'pixar'); await settle(page); }
  const after = await geometries(page);
  // (eight rebuilds of every person: kept, they would add thousands; the demo's own life adds a few)
  expect(after).toBeLessThan(before * 1.15 + 50);
  expect(errors).toEqual([]);
});
