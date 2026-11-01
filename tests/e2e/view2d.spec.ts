import { test, expect, type Page } from '@playwright/test';

// The 2D view (ui/lite.js): the sessions as rows, no 3D. The demo's sessions, set to known states.
type S = { id: string, name: string, status: string };
type Office = { sessions: Map<string, S>, upsert: (s: object) => void, pauseDemo: () => void, emit: (d: object) => void };
const office = (page: Page) => page.evaluate.bind(page);
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } }); });

async function setUp(page: Page) {
  await page.goto('/?demo&debug&layout=pro&view=2d');
  await expect(page.locator('#lite .v2-row').first()).toBeVisible({ timeout: 90_000 });
  // three of them in known states: one waiting for you, one at work (a checklist, a subagent), one resting
  return office(page)(() => {
    const o = (window as unknown as { __office: Office }).__office; o.pauseDemo();
    const [a, b, c, ...rest] = [...o.sessions.values()];
    o.upsert({ ...a, status: 'wait', last: { type: 'bash', label: 'npm run deploy' }, subs: [], bg: [] });
    o.upsert({ ...b, status: 'work', taskStart: Date.now() - 65_000, last: { type: 'edit', label: 'src/cart.ts' }, todos: [{ status: 'done', text: 'a' }, { status: 'doing', text: 'b' }, { status: 'todo', text: 'c' }], subs: [{ id: 'v2-sub', type: 'Explore', desc: 'find the pager', last: null }], bg: [] });
    o.upsert({ ...c, status: 'rest', lastReply: 'All done: the cart pages now.', subs: [], bg: [] });
    for (const x of rest) o.upsert({ ...x, status: 'rest', subs: [], bg: [] });
    return [a.name, b.name, c.name, o.sessions.size];
  });
}

test('2D: approvals on top, then needs you / working / resting; tabs, search and "/", a click opens the session', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const [waiting, working, resting, n] = await setUp(page);
  const lite = page.locator('#lite');
  // no 3D, no second list of the sessions, the switch says 2D
  await expect(page.locator('#stage')).toBeHidden();
  await expect(page.locator('.side-left')).toBeHidden();
  await expect(page.locator('.tb-view [data-view="2d"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(lite.locator('.v2-group.is-wait .v2-row')).toHaveCount(1);
  await expect(lite.locator('.v2-group.is-wait .v2-row')).toContainText(waiting as string);
  await expect(lite.locator('.v2-group.is-wait .v2-now')).toContainText('npm run deploy');
  // working: what it does in words of the work, its checklist, its time, its subagent under it
  const w = lite.locator('.v2-row', { hasText: working as string });
  await expect(w.locator('.v2-now')).toContainText('src/cart.ts');
  await expect(w.locator('.v2-todo')).toHaveText('1/3');
  await expect(w.locator('.v2-time')).toHaveText(/^1:0\d$/);
  await expect(lite.locator('.v2-subrow', { hasText: 'Explore' })).toBeVisible();
  await expect(lite.locator('.v2-row', { hasText: resting as string }).locator('.v2-now')).toContainText('All done: the cart pages now.');
  // the tabs count and filter
  await expect(lite.locator('.v2-tab[data-f="all"] .v2-n')).toHaveText(String(n));
  await expect(lite.locator('.v2-tab[data-f="wait"] .v2-n')).toHaveText('1');
  await lite.locator('.v2-tab[data-f="work"]').click();
  await expect(lite.locator('.v2-row')).toHaveCount(1);
  await lite.locator('.v2-tab[data-f="all"]').click();
  // "/" finds one; Esc clears it
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('/');
  await expect(page.locator('#lite-q')).toBeFocused();
  await page.keyboard.type(resting as string);
  await expect(lite.locator('.v2-row')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(lite.locator('.v2-row')).toHaveCount(n as number);
  // an approval: at the top of the list, in the page's flow, with its buttons
  await office(page)((id) => { const o = (window as unknown as { __office: Office }).__office; o.emit({ k: 'perm', p: { id: 'v2p', sess: id, name: 'demo', tool: 'Bash', type: 'bash', label: 'git push', detail: 'git push origin main', at: Date.now(), until: Date.now() + 45_000, kind: 'perm' } }); },
    await office(page)(() => [...(window as unknown as { __office: Office }).__office.sessions.keys()][0]));
  const card = lite.locator('.v2-perms .perm-card');
  await expect(card).toBeVisible();
  const [cardBox, firstRow] = [await card.boundingBox(), await lite.locator('.v2-row').first().boundingBox()];
  expect(cardBox!.y).toBeLessThan(firstRow!.y);
  await card.locator('.pc-allow').click();
  await expect(card).toHaveCount(0);
  // a click opens the session
  await w.click();
  await expect(page.locator('#dr-session')).toBeVisible();
  expect(errors).toEqual([]);
});

test('3D | 2D is kept per browser; a phone gets the list without anything off the screen', async ({ page }) => {
  test.setTimeout(150_000);
  await setUp(page);
  await page.click('.tb-view [data-view="3d"]');
  await expect(page.locator('#lite')).toBeHidden();
  await expect(page.locator('#stage')).toBeVisible();
  await page.goto('/?demo&layout=pro');
  await expect(page.locator('#stage canvas')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#lite')).toBeHidden();
  await page.click('.tb-view [data-view="2d"]');
  await page.reload();
  await expect(page.locator('#lite .v2-row').first()).toBeVisible({ timeout: 90_000 });
  // a phone: the rows fit, the tabs scroll rather than wrap
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#lite .v2-row').first()).toBeVisible();
  expect(await page.locator('#lite').evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
  const tab = await page.locator('#lite .v2-tab[data-f="wait"]').boundingBox();
  expect(tab!.height).toBeLessThan(40);   // (one line)
});
