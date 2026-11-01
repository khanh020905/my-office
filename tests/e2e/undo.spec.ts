import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { HOME_DIR } from '../../playwright.config';

// "Hoàn tác lượt cuối" (server/undo.mjs, ui/undo-view.js): the office copies each file the first time a turn's file
// tools touch it (the synchronous /hook/loop runs before every call), and puts them back from the session drawer.
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'off'); localStorage.setItem('office-quality', 'low'); } catch { /* private mode */ } }); });
const DIR = path.join(HOME_DIR, 'undo-project'), A = path.join(DIR, 'a.txt'), B = path.join(DIR, 'b.txt');
const base = { session_id: 'uu-undo-0000-1111', cwd: DIR };

test('the last turn undone from the drawer: an edited file back, a new one removed, then Claude told', async ({ page, request }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(A, 'a before'); fs.rmSync(B, { force: true });
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionStart', source: 'startup' } });
  await request.post('/event', { data: { ...base, hook_event_name: 'UserPromptSubmit', prompt: 'make the files better' } });
  // the turn: each write asked of the hook first (as Claude Code does), then done
  for (const [file, tool, text] of [[A, 'Edit', 'a after'], [B, 'Write', 'b new']]) {
    await request.post('/hook/loop', { data: { ...base, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { file_path: file } } });
    fs.writeFileSync(file, text);
    await request.post('/event', { data: { ...base, hook_event_name: 'PostToolUse', tool_name: tool, tool_input: { file_path: file }, tool_response: {} } });
  }
  await request.post('/event', { data: { ...base, hook_event_name: 'Stop', last_assistant_message: 'Better now.' } });
  // the drawer: the button, what it would do, two clicks
  await page.goto('/?layout=cozy');
  await page.locator('#rail-list .ri', { hasText: 'undo-project' }).click({ timeout: 120_000 });
  await page.locator('#ds-actions .btn', { hasText: 'Undo last turn' }).click();
  const v = page.locator('#ds-body .undo');
  await expect(v.locator('.undo-intro')).toContainText('make the files better');
  await expect(v.locator('li.is-restore')).toContainText('a.txt');
  await expect(v.locator('li.is-delete')).toContainText('b.txt');
  await v.locator('.undo-go').click();
  await expect(v.locator('.undo-go')).toHaveText('Click again to undo');
  await v.locator('.undo-go').click();
  await expect(page.locator('#ds-body .undo-done')).toContainText('2 files are back as they were');
  expect(fs.readFileSync(A, 'utf8')).toBe('a before');
  expect(fs.existsSync(B)).toBe(false);
  // once only: the button is gone; the chat says so
  await expect(page.locator('#ds-actions .btn', { hasText: 'Undo last turn' })).toHaveCount(0, { timeout: 10_000 });
  expect((await (await request.get('/api/chat')).json()).msgs.some((m: { kind: string, text?: string }) => m.kind === 'sys' && /Undid .* last turn: 2 files/.test(m.text || ''))).toBe(true);
  // Claude told: its conversation carried on with what was put back (tests/e2e/fake-claude.sh stands in for it)
  await page.locator('#ds-body .btn', { hasText: 'Tell Claude' }).click();
  await expect.poll(() => { try { return fs.readFileSync(path.join(HOME_DIR, '.fake-claude.log'), 'utf8'); } catch { return ''; } }, { timeout: 30_000 }).toContain("just undid the previous turn's file changes");
  await request.post('/event', { data: { ...base, hook_event_name: 'SessionEnd', reason: 'other' } });
  expect(errors).toEqual([]);
});
