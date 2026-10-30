import { test, expect, devices, type Page } from '@playwright/test';

// The office on a phone (src/office/ui/phone.js, styles/phone.css): a tab bar, every panel a full-screen sheet, the
// approvals floating above the tabs with thumb-sized buttons, and nothing wider than the screen. A phone's size and touch,
// at a pixel ratio of 1 so the 3D stays quick in a headless browser (the layout is in CSS pixels either way).
const { defaultBrowserType: _browser, ...iphone } = devices['iPhone 14'];
void _browser;
test.use({ ...iphone, deviceScaleFactor: 1 });

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
const overflow = (page: Page) => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
type Office = { sessions: Map<string, object>, emit: (m: object) => void, pauseDemo: () => void };

test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } }); });

test('on a phone: a tab bar, panels as sheets, approvals above the tabs, nothing wider than the screen', { tag: '@phone' }, async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await page.goto('/?demo&debug&layout=cozy');   // (the small office: lighter for a headless browser)
  await expect(page.locator('#rail-list .ri').first()).toBeAttached({ timeout: 60_000 });
  await page.evaluate(() => (window as unknown as { __office: Office }).__office.pauseDemo());
  await expect(page.locator('html')).toHaveClass(/is-phone/);
  const tabs = page.locator('.ph-tabs .ph-tab');
  await expect(tabs).toHaveCount(5);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  for (const id of ['#btn-chat', '#btn-replay', '#btn-night']) await expect(page.locator(id)).toBeHidden();   // (in the tabs, or not for a phone)
  // the sessions, then the activity: full-width sheets; a second tap (or Văn phòng) shuts them
  await tabs.nth(1).click();
  const rail = page.locator('.side-left');
  await expect(rail).toBeVisible();
  expect((await rail.boundingBox())!.width).toBeGreaterThanOrEqual(389);
  await tabs.nth(2).click();
  await expect(rail).toBeHidden();
  await expect(page.locator('#feed')).toBeVisible();
  await tabs.nth(0).click();
  await expect(page.locator('#feed')).toBeHidden();
  // nothing waiting: the Duyệt tab says so
  await tabs.nth(3).click();
  await expect(page.locator('.ph-empty')).toBeVisible();
  await tabs.nth(0).click();
  // an approval: it floats above the tabs with big buttons, the tab counts it, and the Duyệt tab lists them all
  await page.evaluate(() => {
    const o = (window as unknown as { __office: Office }).__office, id = [...o.sessions.keys()][0];
    for (const c of document.querySelectorAll<HTMLElement>('#perm-stack .perm-card')) o.emit({ k: 'permDone', id: c.dataset.id });   // (the demo's own, if any)
    for (const [n, d] of [[1, 'npm test'], [2, 'git push origin main']]) o.emit({ k: 'perm', p: { id: `ph${n}`, sess: id, name: 'demo', tool: 'Bash', type: 'bash', label: d, detail: d, at: Date.now(), until: Date.now() + 45_000, kind: 'perm' } });
  });
  const card = page.locator('#perm-stack .perm-card').first();
  await expect(card).toBeVisible();
  await expect(page.locator('#perm-stack .perm-card').nth(1)).toBeHidden();   // (one at a time above the tabs)
  const allow = card.locator('.pc-allow');
  expect((await allow.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const tabBox = (await page.locator('.ph-tabs').boundingBox())!, cardBox = (await card.boundingBox())!;
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(tabBox.y);
  await expect(tabs.nth(3).locator('.ph-badge')).toHaveText('2');
  await tabs.nth(3).click();
  await expect(page.locator('#perm-stack .perm-card').nth(1)).toBeVisible();
  await allow.click();   // (the demo answers it in the page)
  await expect(tabs.nth(3).locator('.ph-badge')).toHaveText('1');
  await tabs.nth(0).click();
  // the team chat full screen, like a conversation in a messenger app (the tabs step aside; its back button closes it)
  await tabs.nth(4).click();
  await expect(page.locator('#zchat')).toBeVisible();
  await expect(page.locator('.ph-tabs')).toBeHidden();
  await page.locator('#zchat .zc-back').click();
  await expect(page.locator('#zchat')).toBeHidden();
  await expect(page.locator('.ph-tabs')).toBeVisible();
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.locator('#btn-mac').click();
  await expect(page.locator('#dr-mac')).toBeVisible();
  expect((await page.locator('#dr-mac').boundingBox())!.width).toBeGreaterThanOrEqual(389);
  await tabs.nth(0).click();
  await expect(page.locator('#dr-mac')).toBeHidden();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('on a phone held sideways: still the phone layout, the tabs as icons', { tag: '@phone' }, async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?demo&layout=cozy');
  await expect(page.locator('#rail-list .ri').first()).toBeAttached({ timeout: 60_000 });
  await expect(page.locator('html')).toHaveClass(/is-phone/);
  await expect(page.locator('.ph-tabs')).toBeVisible();
  await expect(page.locator('.ph-tab span').first()).toBeHidden();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.locator('.ph-tab').nth(1).click();
  await expect(page.locator('.side-left')).toBeVisible();
  expect(errors).toEqual([]);
});
