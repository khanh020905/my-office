import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { fakeAuth } from './fake-codex.mjs';
import { token, status, prefs } from './fake-antigravity.mjs';

// Codex's and Antigravity IDE's accounts in the plan card (src/office/ui/ai-accounts.js; server/codex-accounts.mjs,
// antigravity-accounts.mjs): Codex is tests/e2e/fake-codex.mjs with its seat in this test's own home, the IDE a state
// database this test writes, under a name no real program has (so the office never sees, closes or opens a real IDE).
// On an office of its own (its own port, home and data).
const OUT = path.resolve(process.env.E2E_OUT || 'test-results', 'ai-accounts');
const PORT = (Number(process.env.E2E_PORT) || 4399) + 36, BASE = `http://127.0.0.1:${PORT}`;
const HOME = path.join(OUT, 'home'), FAKE = path.join(OUT, 'fake-codex'), DB = path.join(OUT, 'ide', 'state.vscdb');
let server: ChildProcess | null = null, sqlite = true;
try { execFileSync('sqlite3', ['-version'], { stdio: 'ignore' }); } catch { sqlite = false; }
const sql = (s: string) => execFileSync('sqlite3', [DB], { input: s });
const signIn = (who: string) => sql(`INSERT OR REPLACE INTO ItemTable VALUES ('antigravityUnifiedStateSync.oauthToken', '${token(who)}'); INSERT OR REPLACE INTO ItemTable VALUES ('antigravityUnifiedStateSync.userStatus', '${status(who, 0.4)}'); INSERT OR REPLACE INTO ItemTable VALUES ('antigravityUnifiedStateSync.modelPreferences', '${prefs(1319)}');`);
const seatEmail = () => JSON.parse(Buffer.from(JSON.parse(fs.readFileSync(path.join(HOME, '.codex', 'auth.json'), 'utf8')).tokens.id_token.split('.')[1], 'base64url').toString()).email;
const ideToken = () => execFileSync('sqlite3', [DB, "SELECT value FROM ItemTable WHERE key = 'antigravityUnifiedStateSync.oauthToken'"]).toString().trim();

test.beforeAll(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(HOME, '.codex'), { recursive: true }); fs.mkdirSync(FAKE, { recursive: true }); fs.mkdirSync(path.dirname(DB), { recursive: true });
  fs.writeFileSync(path.join(HOME, '.codex', 'auth.json'), JSON.stringify(fakeAuth('ana@example.com')));
  fs.writeFileSync(path.join(FAKE, 'next-login'), 'binh@example.com');
  fs.writeFileSync(path.join(FAKE, 'ana@example.com.json'), JSON.stringify({ primary: 42, secondary: 12 }));
  if (sqlite) { sql('CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);'); signIn('xuan'); }
  const env: NodeJS.ProcessEnv = { ...process.env, HOME, USERPROFILE: HOME, NODE_ENV: 'production', OFFICE_PORT: String(PORT), OFFICE_DATA_DIR: path.join(OUT, 'office-data'), OFFICE_LANG: 'en',
    OFFICE_TRANSLATE: '0', OFFICE_USAGE: '0', OFFICE_CI: '0', OFFICE_CLAUDE_BIN: path.resolve('tests/e2e/fake-claude.sh'),
    OFFICE_CODEX_BIN: path.resolve('tests/e2e/fake-codex.mjs'), FAKE_CODEX_DIR: FAKE, OFFICE_CODEX_PROCS: '0', OFFICE_OPEN_URL: '0',
    OFFICE_AG_DB: DB, OFFICE_AG_APP: 'Fake IDE E2E', OFFICE_AG_RESTART: '0' };
  delete env.CLAUDE_CONFIG_DIR; delete env.CODEX_HOME;   // (never the real ~/.claude or ~/.codex)
  server = spawn(process.execPath, ['server/index.mjs'], { env, stdio: 'ignore' });
  await expect.poll(async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } }, { timeout: 60_000 }).toBe(true);
});
test.afterAll(() => { server?.kill(); });
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } }); });

test('Codex: the account signed in shows with its usage, another is added through the sign-in page, "Use" swaps the seat', async ({ page }) => {
  await page.goto(BASE);
  await page.locator('#btn-plan').click();
  // the card's tabs: Claude's accounts first, Codex's a tap away, with the account in use's tightest limit on its tab
  const tabs = page.locator('#plan-tabs');
  await expect(tabs.locator('[data-tab="claude"]')).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.locator('[data-tab="codex"]')).toContainText('42%');
  await expect(page.locator('#plan-pane-claude')).toBeVisible();
  await tabs.locator('[data-tab="codex"]').click();
  await expect(page.locator('#plan-pane-claude')).toBeHidden();
  const sec = page.locator('#plan-ai .ai-sec[data-tool="codex"]');
  const ana = sec.locator('.ai-acct', { hasText: 'ana' });
  await expect(ana.locator('.acct-badge--on')).toBeVisible();
  await expect(ana.locator('.hl-m')).toHaveCount(2);
  await expect(ana.locator('.hl-m').first()).toContainText('42%');
  // adding: the sign-in page (here: the fake's) and the account once Codex says it is done
  await sec.locator('.ai-add').click();
  await expect(sec.locator('.pa-done')).toContainText('binh@example.com');
  await sec.locator('.ai-step .btn--confirm').click();
  const binh = sec.locator('.ai-acct', { hasText: 'binh' });
  await expect(binh).toBeVisible();
  expect(seatEmail()).toBe('ana@example.com');   // (adding doesn't sign the one in use out)
  await binh.hover(); await binh.locator('.acct-use', { hasText: 'Use' }).click();
  await expect(binh.locator('.acct-badge--on')).toBeVisible();
  expect(seatEmail()).toBe('binh@example.com');
  await expect(page.locator('#toast')).toContainText('binh');
  // forgetting one: not the one in use; a second click to be sure
  await ana.hover(); await ana.locator('.ai-remove').click();
  await ana.locator('.ai-remove.is-sure').click();
  await expect(sec.locator('.ai-acct')).toHaveCount(1);
});

test('Antigravity IDE: the account in the IDE with its quotas, another added by signing in, "Use" writes it back', async ({ page }) => {
  test.skip(!sqlite, 'no sqlite3');
  await page.goto(BASE);
  await page.locator('#btn-plan').click();
  await expect(page.locator('#plan-tabs [data-tab="ag"]')).toContainText('Gemini 60%');
  await page.locator('#plan-tabs [data-tab="ag"]').click();
  const sec = page.locator('#plan-ai .ai-sec[data-tool="ag"]');
  await expect(sec.locator('.ai-head')).toContainText('Fake IDE E2E');
  await expect(sec.locator('.ai-head')).toContainText('Gemini 3.8 Flash');
  const xuan = sec.locator('.ai-acct', { hasText: 'xuan' });
  await expect(xuan.locator('.acct-badge--on')).toBeVisible();
  await expect(xuan.locator('.hl-m').first()).toContainText('Gemini 3.8 Flash');
  await expect(xuan.locator('.hl-m').first()).toContainText('60%');
  // adding: the IDE's sign-in taken out (kept by the office); then "the IDE" signs in as someone else
  await sec.locator('.ai-add').click();
  await sec.locator('.ai-step .btn--confirm').click();
  await expect(sec.locator('.pa-wait')).toBeVisible();
  await expect.poll(ideToken).toBe('');
  signIn('yen');
  await expect(sec.locator('.pa-done')).toContainText('yen@example.com', { timeout: 15_000 });
  await sec.locator('.ai-step .btn--confirm').click();
  // the IDE is closed: "Use" puts the old account straight back
  await xuan.hover(); await xuan.locator('.acct-use', { hasText: 'Use' }).click();
  await expect(xuan.locator('.acct-badge--on')).toBeVisible({ timeout: 10_000 });
  expect(ideToken()).toBe(token('xuan'));
});
