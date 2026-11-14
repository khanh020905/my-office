import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

// Quick replies (src/shared/quick-choices.js, from PR #93 by NguyenGiaHuy-Qi): Claude's newest answer in the group chat
// ending in "A) … B) …" gets a button per choice; a tap sends that letter back to the same conversation (--resume).
// tests/e2e/fake-claude.sh answers "pick one" with such a list.
const HOME_DIR = path.resolve(process.env.E2E_OUT || 'test-results', 'home');

test('a lettered choice at the end of Claude\'s answer: one tap answers that conversation', async ({ page, request }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => { try { localStorage.setItem('office-lite', 'on'); localStorage.setItem('office-tips', 'seen'); } catch { /* private mode */ } });
  fs.mkdirSync(HOME_DIR, { recursive: true });
  const sid = `e2e-pick-${Date.now()}`;
  await request.post('/event', { data: { session_id: sid, cwd: HOME_DIR, transcript_path: path.join(HOME_DIR, `${sid}.jsonl`), hook_event_name: 'SessionStart', source: 'startup' } });
  const asked = () => { try { return fs.readFileSync(path.join(HOME_DIR, '.fake-claude.log'), 'utf8'); } catch { return ''; } };
  await page.goto('/');
  await expect(async () => { if (!(await page.locator('#zchat').isVisible())) await page.click('#btn-chat'); await expect(page.locator('#zchat')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });
  const zc = page.locator('#zchat');
  await zc.locator('.zc-to-chip').click();
  await zc.locator(`.zc-to-pick .zc-to-o[data-sid="${sid}"]`).click();
  await zc.locator('.zc-in').fill('pick one');
  await zc.locator('.zc-in').press('Enter');
  const choices = zc.locator('.zc-choices').last();
  await expect(choices.locator('.zc-choice')).toHaveCount(2, { timeout: 40_000 });
  await expect(choices.locator('.zc-choice').nth(1)).toContainText('Wait for CI');
  const runs = asked().trim().split('\n').length;
  await choices.locator('.zc-choice', { hasText: 'Wait for CI' }).click();
  await expect(choices).toHaveCount(0);   // (answered: the buttons go)
  await expect.poll(() => asked().trim().split('\n').length, { timeout: 20_000 }).toBeGreaterThan(runs);
  const last = asked().trim().split('\n').pop() || '';
  expect(last).toMatch(new RegExp(`--resume ${sid}( |$)`)); expect(last).toMatch(/^-p B /);
});
