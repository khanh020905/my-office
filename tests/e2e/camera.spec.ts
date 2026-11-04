import { test, expect, type Page } from '@playwright/test';

// The office's camera by mouse (scene/renderer.js, core/loop.js): left drag moves along the floor and the view stays
// where it was left (it isn't pulled back to the middle), right drag turns, the wheel zooms in where the pointer is.
type V = { x: number, y: number, z: number };
type O = { camera: { position: V, zoom: number }, controls: { target: V }, pauseDemo: () => void, workers: Map<string, unknown> };
const cam = (page: Page) => page.evaluate(() => { const o = (window as unknown as { __office: O }).__office; const p = o.camera.position, t = o.controls.target;
  return { px: p.x, pz: p.z, tx: t.x, tz: t.z, zoom: o.camera.zoom, az: Math.atan2(p.x - t.x, p.z - t.z) }; });
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'off'); localStorage.setItem('office-quality', 'low'); localStorage.setItem('office-autocam', 'off'); } catch { /* private mode */ } }); });

test('the camera: left drag moves and stays, right drag turns, the wheel zooms where you point', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?demo&debug&layout=pro');
  await page.waitForFunction(() => (window as unknown as { __office?: O }).__office?.workers?.size, null, { timeout: 90_000 });
  await page.evaluate(() => (window as unknown as { __office: O }).__office.pauseDemo());
  const box = (await page.locator('#stage canvas').boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.waitForTimeout(1500);
  const a = await cam(page);
  // left drag: the centre moves along the floor (its height and the angle stay)
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx - 160, cy - 60, { steps: 12 }); await page.mouse.up();
  await page.waitForTimeout(3000);   // (its glide is over by then)
  const b = await cam(page);
  expect(Math.hypot(b.tx - a.tx, b.tz - a.tz)).toBeGreaterThan(0.5);
  expect(Math.abs(b.az - a.az)).toBeLessThan(0.02);
  // …and it stays there: no pull back to the middle (a last bit of glide only goes on the same way)
  await page.waitForTimeout(2000);
  const c = await cam(page);
  expect(Math.hypot(c.tx - b.tx, c.tz - b.tz)).toBeLessThan(0.15);
  expect(Math.hypot(c.tx - a.tx, c.tz - a.tz)).toBeGreaterThanOrEqual(Math.hypot(b.tx - a.tx, b.tz - a.tz) - 0.01);
  // right drag: it turns round the same centre
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' }); await page.mouse.move(cx + 120, cy, { steps: 12 }); await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(3000);
  const d = await cam(page);
  expect(Math.abs(d.az - c.az)).toBeGreaterThan(0.05);
  expect(Math.hypot(d.tx - c.tx, d.tz - c.tz)).toBeLessThan(0.3);
  // the wheel over a corner: closer, and the centre moves towards that corner
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(3000);
  const e = await cam(page);
  expect(e.zoom).toBeGreaterThan(d.zoom * 1.1);
  expect(Math.hypot(e.tx - d.tx, e.tz - d.tz)).toBeGreaterThan(0.1);
  expect(errors).toEqual([]);
});
