import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { HOME_DIR } from '../../playwright.config';

// "Kho lịch sử" (server/vault.mjs, ui/vault.js): conversations' words kept after Claude Code deletes their transcripts.
// The transcripts are written into the test office's own Claude Code folder; ?fresh has it read them at once.
const PROJ = path.join(HOME_DIR, '.claude', 'projects', '-e2e-vault-shop');
const A = 'aaaaaaaa-1111-2222-3333-444444444444', B = 'bbbbbbbb-1111-2222-3333-444444444444';
const line = (o: object) => `${JSON.stringify(o)}\n`;
function transcript(sid: string, prompt: string, reply: string, title: string, at: string) {
  fs.mkdirSync(PROJ, { recursive: true });
  fs.writeFileSync(path.join(PROJ, `${sid}.jsonl`), [
    line({ type: 'user', cwd: '/e2e/shop', timestamp: at, message: { role: 'user', content: [{ type: 'text', text: '<ide_opened_file>cart.ts</ide_opened_file>' }, { type: 'text', text: prompt }] } }),
    line({ type: 'assistant', timestamp: at, message: { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'Read', input: { file_path: 'cart.ts' } }] } }),
    line({ type: 'user', timestamp: at, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'SECRET-TOOL-OUTPUT' }] } }),
    line({ type: 'assistant', timestamp: at, message: { role: 'assistant', content: [{ type: 'text', text: reply }] } }),
    line({ type: 'custom-title', customTitle: title }),
  ].join(''));
}
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { localStorage.setItem('office-tips', 'seen'); localStorage.setItem('office-lite', 'on'); } catch { /* private mode */ } }); });
async function openVault(page: Page, query = '') {
  await page.goto(`/?vault${query}`);
  await expect(page.locator('#dr-vault')).toBeVisible({ timeout: 60_000 });
  return page.locator('#dr-vault');
}

test('the vault: conversations newest first, found by their words (accents or not), read in full, kept once deleted', async ({ page, request }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  transcript(A, 'sửa lỗi phân trang giỏ hàng', 'Đã sửa: **offset** tính sai ở trang 2.', 'Cart pagination', '2026-10-02T09:00:00.000Z');
  transcript(B, 'add a shipping fee', 'Added `shippingFee()` and its tests.', 'Shipping fee', '2026-10-05T09:00:00.000Z');
  const all = await (await request.get('/api/vault?fresh=1')).json();
  expect(all.items.map((x: { sid: string }) => x.sid).slice(0, 2)).toEqual([B, A]);   // (the newest first)
  expect(JSON.stringify(all)).not.toContain('SECRET-TOOL-OUTPUT');   // (tool output is never kept)

  const v = await openVault(page);
  await expect(v.locator('#vault-at')).toContainText('conversations');
  await expect(v.locator('.vl-row').first()).toContainText('Shipping fee');
  // found by what was said, without its accents
  await v.locator('#vault-q').fill('sua loi gio hang');
  await expect(v.locator('.vl-row')).toHaveCount(1);
  await expect(v.locator('.vl-row')).toContainText('Cart pagination');
  // read: the prompt as typed (without what the editor added), Claude's answer laid out, how to carry it on
  await v.locator('.vl-row').click();
  await expect(v.locator('.vl-title')).toHaveText('Cart pagination');
  await expect(v.locator('.vl-msg.is-u .vl-txt')).toHaveText('sửa lỗi phân trang giỏ hàng');
  await expect(v.locator('.vl-msg.is-c strong')).toHaveText('offset');
  await expect(v.locator('.vl-resume code')).toHaveText(`cd /e2e/shop && claude --resume ${A}`);
  await v.locator('.vl-back').click();
  await expect(v.locator('.vl-row')).toHaveCount(1);

  // Claude Code deletes it: still in the vault, marked, and the conversation says it can't be resumed
  fs.rmSync(path.join(PROJ, `${A}.jsonl`));
  await request.get('/api/vault?fresh=1');
  await v.locator('#vault-q').fill('');
  await v.locator('#vault-q').fill('pagination');
  await expect(v.locator('.vl-row.is-gone .vl-badge')).toHaveText('deleted by Claude Code', { timeout: 10_000 });
  await v.locator('.vl-row').click();
  await expect(v.locator('.vl-gone')).toContainText("can't be resumed");
  await expect(v.locator('.vl-resume')).toHaveCount(0);
  // Esc: back to the list, then shut
  await page.keyboard.press('Escape');
  await expect(v.locator('.vl-row')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(v).toBeHidden();
  expect(errors).toEqual([]);
});

test('the online demo has a few made-up ones, from the chat\'s ••• too', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?demo&layout=pro');
  await expect(async () => { if (!(await page.locator('#zchat').isVisible())) await page.click('#btn-chat'); await expect(page.locator('#zchat')).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 90_000 });
  await page.locator('#zchat .zc-toolbar [title="More"], #zchat .zc-bar .zc-mo[title="More"]').first().click();
  await page.locator('.zc-more-o', { hasText: 'History vault' }).click();
  const v = page.locator('#dr-vault');
  await expect(v.locator('.vl-row')).toHaveCount(3);
  await expect(v.locator('.vl-row.is-gone')).toHaveCount(1);
  await v.locator('.vl-row').first().click();
  await expect(v.locator('.vl-msg')).toHaveCount(2);
});

test('the weekly prompt report: how many were clear, the habits that cost a round trip, examples from the week', async ({ page, request }) => {
  test.setTimeout(150_000);
  const C = 'cccccccc-1111-2222-3333-444444444444', at = new Date(Date.now() - 864e5).toISOString();
  fs.mkdirSync(PROJ, { recursive: true });
  fs.writeFileSync(path.join(PROJ, `${C}.jsonl`), [
    line({ type: 'user', cwd: '/e2e/shop', timestamp: at, message: { role: 'user', content: [{ type: 'image', source: { type: 'base64', data: 'AAAA' } }, { type: 'text', text: 'sao' }] } }),
    line({ type: 'user', timestamp: at, message: { role: 'user', content: 'thêm trang giới thiệu cho dự án landing page, dùng ảnh trong thư mục public/hero' } }),
    line({ type: 'user', timestamp: at, message: { role: 'user', content: 'làm khác đi' } }),
    line({ type: 'user', timestamp: at, message: { role: 'user', content: 'ok' } }),
    line({ type: 'custom-title', customTitle: 'Landing page' }),
  ].join(''));
  await request.get('/api/vault?fresh=1');
  const r = await (await request.get('/api/vault/report')).json();
  expect([r.now.n, r.now.clear, r.now.by.photoBare, r.now.by.vague]).toEqual([3, 1, 1, 1]);   // ("ok" is not judged)
  await page.goto('/?vault=report');
  const v = page.locator('#dr-vault');
  await expect(v.locator('.vr-pct')).toHaveText('33%', { timeout: 60_000 });
  await expect(v.locator('.vr-habit')).toHaveCount(2);
  await expect(v.locator('.vr-ex', { hasText: '“sao”' })).toContainText('🖼×1');
  await expect(v.locator('.vr-ex', { hasText: 'làm khác đi' }).locator('.vr-hint')).toContainText('khác đi');
  await expect(v.locator('.vl-search')).toBeHidden();
  // back to the list
  await v.locator('[data-vt="list"]').click();
  await expect(v.locator('.vl-search')).toBeVisible();
  await expect(v.locator('.vl-row').first()).toBeVisible();
  fs.rmSync(path.join(PROJ, `${C}.jsonl`));
});
