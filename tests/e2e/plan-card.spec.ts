import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { test, expect } from '@playwright/test';

// The plan card with several Claude accounts on org plans (long "Team · <organization>" names), from saved readings
// (OFFICE_USAGE=0: nothing is asked of Anthropic): it never scrolls sideways (an account's heading once made it 450 px in
// a 330 px card, cutting the bars, the % and "In use" off), an account is listed by its name, and a model's own week
// shows only once it is used. On an office of its own (its own port, home and data).
const OUT = path.resolve(process.env.E2E_OUT || 'test-results', 'plan-card');
const PORT = (Number(process.env.E2E_PORT) || 4399) + 39, BASE = `http://127.0.0.1:${PORT}`;
const HOME = path.join(OUT, 'home'), DATA = path.join(OUT, 'office-data');
const ORG = 'The Very Long Organisation Name Of A Company';
let server: ChildProcess | null = null;
test.beforeAll(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(HOME, '.claude', 'sessions'), { recursive: true }); fs.mkdirSync(DATA, { recursive: true });
  const soon = Date.now() + 3 * 3600e3, week = Date.now() + 3 * 86400e3, at = Date.now();
  const rows = (fable: number) => [{ key: 'session', label: '5 hours', pct: 24, resetsAt: soon }, { key: 'weekly', label: 'Week', pct: 62, resetsAt: week }, { key: 'weekly:Fable', label: 'Fable (week)', pct: fable, resetsAt: week }];
  fs.writeFileSync(path.join(DATA, 'limits.json'), JSON.stringify({ at, source: 'api', windows: rows(0), account: { id: 'main', plan: 'Team', org: ORG } }));
  const others: Record<string, object> = {};
  for (const [name, fable] of [['callofdragon-account', 0], ['max-studio', 7]] as const) {
    const dir = path.join(HOME, `.claude-${name}`); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: `${name}@example.com` } }));
    others[dir] = { at, windows: rows(fable), account: { id: name, plan: 'Team', org: ORG } };
  }
  fs.writeFileSync(path.join(DATA, 'others-usage.json'), JSON.stringify(others));
  const env: NodeJS.ProcessEnv = { ...process.env, HOME, USERPROFILE: HOME, NODE_ENV: 'production', OFFICE_PORT: String(PORT), OFFICE_DATA_DIR: DATA, OFFICE_LANG: 'en',
    OFFICE_TRANSLATE: '0', OFFICE_USAGE: '0', OFFICE_CI: '0', OFFICE_MENUBAR: '0', OFFICE_AI_ACCOUNTS: '0', OFFICE_CLAUDE_BIN: path.resolve('tests/e2e/fake-claude.sh') };
  delete env.CLAUDE_CONFIG_DIR;   // (never the real ~/.claude)
  server = spawn(process.execPath, ['server/index.mjs'], { env, stdio: 'ignore' });
  await expect.poll(async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } }, { timeout: 60_000 }).toBe(true);
});
test.afterAll(() => { server?.kill(); });
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } }); });

test('several org accounts: no sideways scroll, names, a model week only once used', async ({ page }) => {
  await page.goto(BASE);
  await expect(page.locator('#btn-plan')).toBeVisible({ timeout: 60_000 });
  await page.locator('#btn-plan').click();
  const pop = page.locator('#pop-plan');
  await expect(pop.locator('.acct-block')).toHaveCount(3);
  const fit = await pop.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, right: e.getBoundingClientRect().right,
    pct: Math.max(...[...e.querySelectorAll('.hl-m em, .acct-badge')].map((x) => x.getBoundingClientRect().right)) }));
  expect(fit.sw).toBeLessThanOrEqual(fit.cw);          // (no sideways scroll)
  expect(fit.pct).toBeLessThanOrEqual(fit.right);      // (every % and badge inside the card)
  await expect(pop.locator('.acct-badge--on')).toBeVisible();
  // listed by name (the server keeps 16 characters of it), not "Account callofdragon-ac…"
  await expect(pop.locator('.acct-name b').nth(1)).toHaveText(/^callofdragon/);
  // a model's own week: hidden at 0%, shown once used (max-studio 7%)
  await expect(pop.locator('.acct-block').nth(0).locator('.hl-m')).toHaveCount(2);
  const max = pop.locator('.acct-block', { has: page.locator('.acct-name b', { hasText: 'max-studio' }) });
  await expect(max.locator('.hl-m')).toHaveCount(3);
  await expect(max).toContainText('Fable (week)');
});
