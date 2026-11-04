import path from 'node:path';
import { test, expect } from '@playwright/test';
import { DATA_DIR, HOME_DIR } from '../../playwright.config';

// The small panel (app/panel, src/panel/main.js), as in the editor's side bar: the sessions, one at work first, and a
// request to approve held for it while it is looked at; "Allow" answers Claude Code's hook.
const SHOTS = process.env.SHOTS_DIR || path.join(DATA_DIR, '..');
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); } catch { /* private mode */ } }); });

test('the panel: who works, who rests, a request to approve, allowed from it', async ({ page, request }) => {
  test.setTimeout(120_000);
  const at = (sid: string) => ({ session_id: sid, cwd: path.join(HOME_DIR, sid), transcript_path: path.join(HOME_DIR, `${sid}.jsonl`) });
  for (const sid of ['panel-api', 'panel-docs']) await request.post('/event', { data: { ...at(sid), hook_event_name: 'SessionStart', source: 'startup' } });
  await request.post('/event', { data: { ...at('panel-api'), hook_event_name: 'UserPromptSubmit', prompt: 'make the tests pass' } });
  await request.post('/event', { data: { ...at('panel-api'), hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: path.join(HOME_DIR, 'panel-api', 'cart.ts') } } });
  await page.setViewportSize({ width: 340, height: 720 });
  await page.goto('/panel?embed=ide');
  const rows = page.locator('.pn-sess');
  await expect(rows.filter({ hasText: 'panel-api' })).toHaveClass(/is-work/);
  await expect(rows.filter({ hasText: 'panel-docs' })).toHaveClass(/is-rest/);
  await expect(page.locator('#pn-sum')).toContainText('1 working');
  await page.locator('.pn-body').click({ position: { x: 5, y: 5 } });   // (looked at: requests are held for it)
  expect(await page.evaluate(() => document.hasFocus())).toBe(true);
  await page.waitForTimeout(2500);   // (it says so every 2 s)
  // Claude Code asks: the hook waits for the answer
  const asked = request.post('/hook/permission', { data: { ...at('panel-api'), hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm test', description: 'Run the tests' } } });
  const card = page.locator('.pn-perm');
  await expect(card).toContainText('npm test');
  await expect(rows.filter({ hasText: 'panel-api' })).toHaveClass(/is-wait/);
  await page.screenshot({ path: path.join(SHOTS, 'panel.png') });
  await card.locator('.pn-btn--ok').click();
  expect(await (await asked).text()).toContain('allow');
  await expect(card).toHaveCount(0);
  // what the menu bar reads (menubar/): the counts, each session's state, the words for its notifications
  const bar = await (await request.get('/api/panel')).json();
  expect(bar.sessions.find((s: { name: string }) => s.name.startsWith('panel-api'))?.status).toMatch(/work|rest/);
  expect(bar.words.wait).toContain('{name}');
  for (const sid of ['panel-api', 'panel-docs']) await request.post('/event', { data: { ...at(sid), hook_event_name: 'SessionEnd', reason: 'other' } });
});

// The panel's logo, the cards its quota pills open (hover / focus / tap) and the Mac section, against a fake stream and
// a fake reading of the Mac (no plan or process list needed).
test('the panel: logo, quota card on hover and focus, the Mac meters and a fix', async ({ page }) => {
  const day = 86400e3, soon = Date.now() + 3600e3;
  await page.addInitScript((d) => {
    class FakeES { onopen: (() => void) | null = null; onmessage: ((m: { data: string }) => void) | null = null; onerror = null; constructor() { (window as unknown as { __es: unknown }).__es = this; setTimeout(() => { this.onopen?.(); this.onmessage?.({ data: JSON.stringify({ k: 'snap', local: true, sessions: [], perms: [], ai: null, limits: d }) }); }, 0); } close() { /* none */ } }
    (window as unknown as { EventSource: unknown }).EventSource = FakeES;
  }, { windows: [
    { key: 'session', label: '5 giờ', pct: 9, resetsAt: soon },
    { key: 'weekly', label: 'Tuần', pct: 30, resetsAt: soon + 2 * day, active: false },
    { key: 'weekly_scoped:Fable', label: 'Fable (tuần)', pct: 85, resetsAt: soon + 3 * day },
  ], others: [
    { name: 'phu', label: '', windows: [{ key: 'session', label: '5 giờ', pct: 40, resetsAt: soon }] },
    { name: 'max20x', label: '', windows: [], note: 'Read again in 46 minutes.' },
  ] });
  const mac = { at: Date.now(), mem: { used: 12 * 1024 ** 3, total: 16 * 1024 ** 3, swapUsed: 0, swapTotal: 0, pressure: 'normal' }, cpu: { percent: 20, cores: 8, load: 1.2 }, disk: { used: 100 * 1024 ** 3, total: 500 * 1024 ** 3, free: 400 * 1024 ** 3 }, tight: false, diskTight: false, apps: [], devServers: [], claude: [{ pid: 4242, mem: 600 * 1024 ** 2 }],
    tips: [{ id: 'idle:4242', action: 'kill', target: 4242, start: 1, gain: 600 * 1024 ** 2, title: 'Idle', verb: 'Close' }], auto: { hours: 0 } };
  let acted = 0;
  await page.route('**/api/sys/action*', (r) => { acted++; return r.fulfill({ json: { ok: true, message: 'Closed it.' } }); });
  await page.route('**/api/sys', (r) => r.fulfill({ json: mac }));
  await page.setViewportSize({ width: 260, height: 700 });
  await page.goto('/panel?embed=ide');
  await expect(page.locator('.pn-logo')).toBeVisible();
  const pill = page.locator('.pn-qp', { hasText: 'Claude' });
  await pill.hover();
  const pop = page.locator('.pn-pop');
  for (const w of ['5 giờ', 'Tuần', 'Fable (tuần)']) await expect(pop).toContainText(w);
  // every account, the one with nothing to show yet too (with why)
  for (const w of ['Main account', 'Account phu', '40%', 'Account max20x', 'Read again in 46 minutes.']) await expect(pop).toContainText(w);
  // reading the card (the mouse on it) while the list is drawn again (a session's news): it stays open. (Over the pill
  // instead, Chromium's own hover check after the redraw would open it again anyway; WebKit, the menu bar's, doesn't.)
  const card = await pop.boundingBox();
  await page.mouse.move(card!.x + card!.width / 2, card!.y + card!.height / 2);
  await page.evaluate(() => { const es = (window as unknown as { __es: { onmessage: (m: { data: string }) => void } }).__es; es.onmessage({ data: JSON.stringify({ k: 'sess', s: { id: 'x1', name: 'news', status: 'work', lastAt: Date.now() } }) }); });
  await page.waitForTimeout(400);
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('Account max20x');
  const box = await pop.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 260).toBe(true);
  await page.mouse.move(200, 600);
  await expect(pop).toBeHidden();
  await pill.focus();   // (keyboard)
  await expect(pop).toContainText('Fable (tuần)');
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
  // the Mac: closed it is one line; open it has the meters and the idle-sessions fix, asked twice
  await page.locator('.pn-mac-h').click();
  await expect(page.locator('.pn-meter')).toHaveCount(4);
  const fix = page.locator('.pn-fixes .pn-btn').first();
  await fix.click();
  expect(acted).toBe(0);
  await fix.click();
  await expect(page.locator('.pn-note')).toContainText('Closed it.');
  expect(acted).toBe(1);
});

// A session's row says which project and branch it works in; its card (hover, after a short stay) has the rest: the
// folder, what is not committed or pushed, the model and context, the cost, what you asked, what it does, its checklist
// and subagents. The mouse goes through the card to the next row.
test('the panel: a session’s project on its row, the details on its card', async ({ page }) => {
  const now = Date.now();
  const sessions = [
    { id: 's1', name: 'shop-1', title: 'Faster cart', status: 'work', dir: '~/code/shop', lastAt: now, taskStart: now - 15 * 60e3,
      git: { repo: 'shop', branch: 'main', dirty: 3, ahead: 1, ci: 'green' }, usage: { model: 'claude-opus-5-5', ctx: 450000, ctxMax: 1000000, cost: 12.5 },
      lastPrompt: 'make the cart page faster', last: { type: 'edit', label: 'src/cart.ts' }, cache: { until: now + 40 * 60e3, ttl: '1h' },
      todos: [{ status: 'done', text: 'find the slow query' }, { status: 'doing', text: 'add an index' }, { status: 'todo', text: 'measure again' }],
      subs: [{ id: 'a1', type: 'Explore', model: 'claude-sonnet-5-5', desc: 'where the cart is saved' }] },
    { id: 's2', name: 'docs-2', title: 'Docs', status: 'rest', dir: '~/code/docs', lastAt: now - 3600e3, doneAt: now - 3600e3, lastReply: 'Docs updated for the new API.' },
  ];
  await page.addInitScript((d) => {
    class FakeES { onopen: (() => void) | null = null; onmessage: ((m: { data: string }) => void) | null = null; onerror = null; constructor() { setTimeout(() => { this.onopen?.(); this.onmessage?.({ data: JSON.stringify({ k: 'snap', local: true, sessions: d, perms: [], ai: null, limits: null }) }); }, 0); } close() { /* none */ } }
    (window as unknown as { EventSource: unknown }).EventSource = FakeES;
  }, sessions);
  await page.route('**/api/sys', (r) => r.fulfill({ json: {} }));
  await page.setViewportSize({ width: 360, height: 560 });
  await page.goto('/panel?embed=menubar');
  const row = (t: string) => page.locator('.pn-sess', { hasText: t });
  await expect(row('Faster cart').locator('.pn-sess-dir')).toHaveText('shop · main');
  await expect(row('Docs').locator('.pn-sess-dir')).toHaveText('docs');
  await row('Faster cart').hover();
  const pop = page.locator('.pn-pop');
  await expect(pop).toBeVisible();
  for (const t of ['~/code/shop', 'main · 3 changes not committed · 1 commit not pushed · CI green', 'Opus 5.5 · context 45% (450k/1M)', '$12.50',
    'make the cart page faster', 'src/cart.ts', 'Checklist 1/3', 'add an index', 'Explore · Sonnet 5.5 — where the cart is saved', 'warm for']) await expect(pop).toContainText(t);
  await page.screenshot({ path: path.join(SHOTS, 'panel-card.png') });
  const box = await pop.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 360 && box.y >= 0 && box.y + box.height <= 560).toBe(true);
  // the next row, even under the card: its own card
  await row('Docs').hover();
  await expect(pop).toContainText('Docs updated for the new API.');
  await expect(pop).not.toContainText('~/code/shop');
  await page.mouse.move(5, 5);   // (the header: no card)
  await expect(pop).toBeHidden();
});

// A question or a plan answered in the panel: picks, own words, a note; kept over redraws; the exact bodies the office sends.
test('the panel: a question and a plan answered right in it', async ({ page }) => {
  const now = Date.now();
  const sess = { id: 's1', name: 'shop-1', title: 'Shop', status: 'wait', lastAt: now };
  const perms = [
    { id: 'q1', kind: 'ask', sess: 's1', name: 'shop-1', questions: [
      { header: 'Style', question: 'Which style?', multi: false, options: [{ label: 'Plain', description: 'No frills' }, { label: 'Fancy', description: 'With animations' }] },
      { header: 'Extras', question: 'Which extras?', multi: true, options: [{ label: 'Tests' }, { label: 'Docs' }, { label: 'Types' }] }] },
    { id: 'p1', kind: 'plan', sess: 's1', name: 'shop-1', plan: '# The plan\n\n- add an index\n- **measure** again\n\n1. first\n2. second\n\nSome `code` here <b>not html</b>.' },
  ];
  await page.addInitScript((d) => {
    class FakeES { onopen: (() => void) | null = null; onmessage: ((m: { data: string }) => void) | null = null; onerror = null; constructor() { (window as unknown as { __es: unknown }).__es = this; setTimeout(() => { this.onopen?.(); this.onmessage?.({ data: JSON.stringify({ k: 'snap', local: true, sessions: [d.sess], perms: d.perms, ai: null, limits: null }) }); }, 0); } close() { /* none */ } }
    (window as unknown as { EventSource: unknown }).EventSource = FakeES;
  }, { sess, perms });
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/api/sys', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/perm*', (r) => { bodies.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }); });
  const push = (m: object) => page.evaluate((x) => (window as unknown as { __es: { onmessage: (m: { data: string }) => void } }).__es.onmessage({ data: JSON.stringify(x) }), m);
  const noOverflow = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.pn-body')!.scrollWidth <= document.querySelector('.pn-body')!.clientWidth)).toBe(true);
  for (const [w, h] of [[260, 700], [360, 560]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/panel?embed=ide');
    await expect(page.locator('.pn-perm')).toHaveCount(2);
    await noOverflow();
  }
  const ask = page.locator('.pn-perm[data-id="q1"]'), plan = page.locator('.pn-perm[data-id="p1"]');
  await expect(ask.locator('.pn-chip')).toHaveText(['Style', 'Extras']);
  await expect(ask.locator('.pn-opt small').first()).toHaveText('No frills');
  const send = ask.locator('.pn-btn--ok');
  await expect(send).toBeDisabled();
  await ask.locator('.pn-opt', { hasText: 'Fancy' }).click();
  await expect(send).toBeDisabled();   // (the second question still has no answer)
  // a redraw while typing keeps the picks, the words, the focus and the caret
  const other = ask.locator('.pn-other').nth(1);
  await other.click(); await page.keyboard.type('Lint rules please');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  await push({ k: 'sess', s: { ...sess, lastAt: Date.now() + 1 } });
  await page.waitForTimeout(300);
  await expect(other).toHaveValue('Lint rules please');
  await expect(other).toBeFocused();
  await page.keyboard.type('X');
  await expect(other).toHaveValue('Lint rules pleaXse');
  await expect(ask.locator('.pn-opt', { hasText: 'Fancy' })).toHaveAttribute('aria-pressed', 'true');
  await other.fill('Lint rules please');
  await ask.locator('.pn-opt', { hasText: 'Docs' }).click(); await ask.locator('.pn-opt', { hasText: 'Types' }).click();
  await expect(send).toBeEnabled();
  await page.screenshot({ path: path.join(SHOTS, 'panel-ask.png') });
  await send.click();
  await expect(ask).toHaveCount(0);
  expect(bodies[0]).toEqual({ id: 'q1', choice: 'answer', answers: [{ q: 0, pick: [1], other: '' }, { q: 1, pick: [1, 2], other: 'Lint rules please' }] });
  // the plan: markdown as text, never as html
  await expect(plan.locator('.pn-plan h4')).toHaveText('The plan');
  await expect(plan.locator('.pn-plan li')).toHaveCount(4);
  await expect(plan.locator('.pn-plan strong')).toHaveText('measure');
  await expect(plan.locator('.pn-plan b')).toHaveCount(0);
  await expect(plan).toContainText('<b>not html</b>');
  const note = plan.locator('.pn-other');
  await note.click(); await page.keyboard.type('smaller steps');
  await push({ k: 'sess', s: { ...sess, lastAt: Date.now() + 2 } });
  await page.waitForTimeout(300);
  await expect(note).toHaveValue('smaller steps'); await expect(note).toBeFocused();
  await page.screenshot({ path: path.join(SHOTS, 'panel-plan.png') });
  await plan.locator('.pn-btn', { hasText: 'Keep revising' }).click();
  await expect(plan).toHaveCount(0);
  expect(bodies[1]).toEqual({ id: 'p1', choice: 'revise', note: 'smaller steps' });
  // approve
  await push({ k: 'perm', p: { ...perms[1], id: 'p2' } });
  await page.locator('.pn-perm[data-id="p2"] .pn-btn--ok').click();
  await expect(page.locator('.pn-perm')).toHaveCount(0);
  expect(bodies[2]).toEqual({ id: 'p2', choice: 'approve' });
});

// The panel by keyboard (src/panel/keys.js): ↑ ↓ through the sessions, Y / N for the first request (a risky one: Y
// twice), nothing while typing; the menu bar's hint line names the keys.
test('the panel by keyboard: arrows through the sessions, Y / N for a request', async ({ page }) => {
  const now = Date.now();
  const sessions = [{ id: 's1', name: 'shop-1', title: 'Shop', status: 'wait', lastAt: now }, { id: 's2', name: 'docs-2', title: 'Docs', status: 'rest', lastAt: now - 60e3 }];
  const perms = [{ id: 'r1', kind: 'perm', sess: 's1', name: 'shop-1', tool: 'Bash', type: 'bash', label: 'rm -rf build', detail: 'rm -rf build' },
    { id: 'p2', kind: 'perm', sess: 's2', name: 'docs-2', tool: 'Bash', type: 'bash', label: 'npm test', detail: 'npm test' }];
  await page.addInitScript((d) => {
    class FakeES { onopen: (() => void) | null = null; onmessage: ((m: { data: string }) => void) | null = null; onerror = null; constructor() { (window as unknown as { __es: unknown }).__es = this; setTimeout(() => { this.onopen?.(); this.onmessage?.({ data: JSON.stringify({ k: 'snap', local: true, sessions: d.sessions, perms: d.perms, ai: null, limits: null }) }); }, 0); } close() { /* none */ } }
    (window as unknown as { EventSource: unknown }).EventSource = FakeES;
  }, { sessions, perms });
  const bodies: { id: string, choice: string }[] = [];
  await page.route('**/api/sys', (r) => r.fulfill({ json: {} }));
  await page.route('**/api/perm*', (r) => { bodies.push(r.request().postDataJSON()); return r.fulfill({ json: { ok: true } }); });
  await page.setViewportSize({ width: 360, height: 560 });
  await page.goto('/panel?embed=menubar');
  await expect(page.locator('.pn-keys')).toBeVisible();
  await expect(page.locator('.pn-perm')).toHaveCount(2);
  await page.locator('.pn-head').click();
  // the arrows
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.pn-sess', { hasText: 'Shop' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.pn-sess', { hasText: 'Docs' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.pn-sess', { hasText: 'Shop' })).toBeFocused();
  // the first request is a risky one: Y arms it, Y again sends it
  await page.keyboard.press('y');
  await expect(page.locator('.pn-perm').first().locator('.pn-btn--ok')).not.toHaveText('Allow');
  expect(bodies).toEqual([]);
  await page.keyboard.press('y');
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]).toMatchObject({ id: 'r1', choice: 'allow' });
  await expect(page.locator('.pn-perm')).toHaveCount(1);
  // N for the next one
  await page.keyboard.press('n');
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies[1]).toMatchObject({ id: 'p2', choice: 'deny' });
});
