import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { HOME_DIR } from '../../playwright.config';

// "Model: người điều phối và subagent" (server/models.mjs, ui/models.js): Settings → More writes the session's model
// and its subagents' into Claude Code's settings (this test's own home), and the note asking Claude to split big tasks
// into its CLAUDE.md; the rest of both files stays as it was.
const SETTINGS = path.join(HOME_DIR, '.claude', 'settings.json'), MEMORY = path.join(HOME_DIR, '.claude', 'CLAUDE.md');
const read = () => JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } }); });

test('the coordinator on Opus, subagents on Sonnet, always; the note in CLAUDE.md on and off', async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  const was = fs.existsSync(SETTINGS) ? read() : {};
  fs.writeFileSync(SETTINGS, JSON.stringify({ ...was, model: 'sonnet', permissions: { allow: ['Bash(ls:*)'] } }, null, 2));
  fs.writeFileSync(MEMORY, '# Mine\n\nKeep it short.\n');
  await page.goto('/');
  await expect(async () => { if (!(await page.locator('#pop-look').isVisible())) await page.click('#btn-look'); await expect(page.locator('#pop-look')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });
  await page.click('#st-tab-more');
  const box = page.locator('#st-models');
  await expect(box.locator('[data-model-main="sonnet"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(box.locator('[data-model-sub=""]')).toHaveAttribute('aria-pressed', 'true');
  await expect(box.locator('[data-model-force]')).toBeDisabled();   // (nothing to force while subagents follow the session)
  await box.locator('[data-model-main="opus"]').click();
  await expect(box.locator('[data-model-main="opus"]')).toHaveAttribute('aria-pressed', 'true');
  await box.locator('[data-model-sub="sonnet"]').click();
  await expect(box.locator('[data-model-sub="sonnet"]')).toHaveAttribute('aria-pressed', 'true');
  await box.locator('[data-model-force]').click();
  await expect(box.locator('[data-model-force]')).toHaveAttribute('aria-checked', 'true');
  const s = read();
  expect([s.model, s.env.CLAUDE_CODE_SUBAGENT_MODEL, s.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE]).toEqual(['opus', 'sonnet', '1']);
  expect(s.permissions).toEqual({ allow: ['Bash(ls:*)'] });
  await expect(page.locator('#toast')).toContainText('started from now on');
  // the note, after what was there; off again, exactly as it was
  await box.locator('[data-model-split]').click();
  await expect(box.locator('[data-model-split]')).toHaveAttribute('aria-checked', 'true');
  expect(fs.readFileSync(MEMORY, 'utf8')).toMatch(/^# Mine\n\nKeep it short\.\n\n<!-- my-office:subagents -->\n## Big tasks/);
  await box.locator('[data-model-split]').click();
  await expect(box.locator('[data-model-split]')).toHaveAttribute('aria-checked', 'false');
  expect(fs.readFileSync(MEMORY, 'utf8')).toBe('# Mine\n\nKeep it short.\n');
  // subagents back to the session's own model: "always" goes with it
  await box.locator('[data-model-sub=""]').click();
  await expect(box.locator('[data-model-sub=""]')).toHaveAttribute('aria-pressed', 'true');
  expect(read().env?.CLAUDE_CODE_SUBAGENT_MODEL_FORCE).toBeUndefined();
  fs.rmSync(MEMORY, { force: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(was, null, 2));
});
