import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { HOME_DIR } from '../../playwright.config';

// The prompt helper over the group chat's input, writing to Claude (src/shared/prompt-coach.js, ui/group-chat-view.js;
// the rewrite: server/rewrite.mjs, answered by tests/e2e/fake-claude.sh, so nothing is spent): a hint once you stop
// typing, chips that edit what you wrote, a closed hint staying closed, "✨ Viết lại cho rõ" and "Hoàn tác", the switch in
// Settings. A picture of each hint, on a computer and on a phone, goes to the test's output folder.

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|WebGL/i.test(m.text())) errors.push(m.text()); });
  return errors;
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { for (const [k, v] of [['office-tips', 'seen'], ['office-lite', 'on'], ['office-chat-hint', 'seen'], ['office-quality', 'low']]) localStorage.setItem(k, v); } catch { /* private mode */ } });
});
// a session that has worked in a folder (so it is somewhere Claude can be given work), the chat open in Vietnamese, and
// "Gửi tới" that folder
async function chatToClaude(page: Page, request: APIRequestContext, openChat: () => Promise<void>) {
  fs.mkdirSync(HOME_DIR, { recursive: true });
  await request.post('/event', { data: { session_id: `e2e-coach-${Date.now()}`, cwd: HOME_DIR, transcript_path: path.join(HOME_DIR, 'e2e-coach.jsonl'), hook_event_name: 'SessionStart', source: 'startup' } });
  await expect.poll(async () => (await (await request.get('/api/tasks')).json()).projects.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.goto('/?lang=vi');
  const zc = page.locator('#zchat');
  await expect(async () => { if (!(await zc.isVisible())) await openChat(); await expect(zc).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 120_000 });
  await zc.locator('.zc-to-chip').click();
  await zc.locator('.zc-to-pick .zc-to-o[data-dir]').first().click();
  await expect(zc.locator('.zc-to-chip')).toHaveClass(/is-on/);
  return zc;
}
// a photo from "this device": a picture of the page itself, like the owner's screenshots
async function attachPhoto(page: Page, button: string) {
  const vp = page.viewportSize()!, shot = await page.screenshot({ clip: { x: 0, y: 0, width: Math.min(640, vp.width), height: Math.min(400, vp.height) } });
  const chooser = page.waitForEvent('filechooser');
  await page.locator(button).first().click();
  await (await chooser).setFiles({ name: 'man-hinh.png', mimeType: 'image/png', buffer: shot });
  await expect(page.locator('#zchat .zc-attach-t')).toHaveCount(1);
}
const rewriteLog = () => { try { return fs.readFileSync(path.join(HOME_DIR, '.fake-claude-rewrite.log'), 'utf8'); } catch { return ''; } };

// (the phone first: its pictures without the message the computer's test sends)
test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  test('the prompt helper fits a phone: one hint, chips in a row, rewrite and undo', async ({ page, request }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    const zc = await chatToClaude(page, request, () => page.locator('.ph-tabs .ph-tab').nth(4).click());
    const box = zc.locator('.zc-coach'), input = zc.locator('.zc-in');
    const shot = (name: string) => page.screenshot({ path: test.info().outputPath(`coach-phone-${name}.png`) });
    const fresh = async (text: string) => { await input.fill(''); await input.fill(text); };
    await attachPhoto(page, '#zchat .zc-bar .zc-photo-btn');
    await input.fill('điền sao');
    await expect(box).toHaveAttribute('data-hint', 'photoBare');
    // nothing wider than the screen; the chips scroll in their own row
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    const b = (await box.boundingBox())!;
    expect(b.width).toBeLessThanOrEqual(390); expect(b.height).toBeLessThan(110);
    await shot('1-anh-kem-vai-chu');
    await box.locator('[data-k="likePhoto"]').click();
    await expect(input).toHaveValue('Làm giống như trong ảnh: điền sao');
    await zc.locator('.zc-attach-t button').click();
    await fresh('làm giống thật đừng làm qua loa');
    await expect(box).toHaveAttribute('data-hint', 'vague');
    await expect(box).toContainText('“giống thật”');
    await shot('2-chung-chung');
    await fresh('phần của vĩ');
    await expect(box).toHaveAttribute('data-hint', 'dangling');
    await shot('3-chi-tro-mo-ho');
    await fresh('gợi ý thêm… trước đó push lên github');
    await expect(box).toHaveAttribute('data-hint', 'multi');
    await shot('4-nhieu-viec');
    await box.locator('[data-k="number"]').click();
    await expect(input).toHaveValue('Làm lần lượt:\n1. Push lên github\n2. Gợi ý thêm');
    await fresh('config gì');
    await expect(box).toHaveAttribute('data-hint', 'tooShort');
    await shot('5-qua-ngan');
    await box.locator('[data-k="rewrite"]').click();
    await expect(box).toHaveAttribute('data-hint', 'rewritten');
    await expect(input).toHaveValue(/^Mục tiêu:/);
    await shot('6-da-viet-lai');
    await box.locator('[data-k="undo"]').click();
    await expect(input).toHaveValue('config gì');
    expect(errors).toEqual([]);
  });
});

test('the prompt helper: a hint as you write to Claude, chips that fix the draft, a closed hint stays closed, rewrite and undo', async ({ page, request }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  const zc = await chatToClaude(page, request, () => page.click('#btn-chat'));
  const box = zc.locator('.zc-coach'), input = zc.locator('.zc-in');
  const shot = (name: string) => zc.screenshot({ path: test.info().outputPath(`coach-desktop-${name}.png`) });
  const fresh = async (text: string) => { await input.fill(''); await input.fill(text); };   // (an empty input first: a new message)
  // a screenshot and one word: what should Claude do with it? A chip says it, the word kept
  await attachPhoto(page, '#zchat .zc-toolbar .zc-photo-btn');
  await input.fill('sao');
  await expect(box).toHaveAttribute('data-hint', 'photoBare');
  await expect(box).toContainText('Muốn nó làm gì với ảnh?');
  await expect(box.locator('.zc-coach-c')).toHaveText(['Sửa lỗi trong ảnh', 'Làm giống ảnh', 'Giải thích ảnh', 'Điền giúp']);
  await expect(box.locator('[data-k="rewrite"]')).toHaveText('✨ Viết lại cho rõ · dùng chút lượt Claude');   // (it says it asks Claude)
  await shot('1-anh-kem-vai-chu');
  await box.locator('[data-k="fixPhoto"]').click();
  await expect(input).toHaveValue('Sửa lỗi đang thấy trong ảnh: sao');
  await expect(box).toBeHidden();
  await zc.locator('.zc-attach-t button').click();
  // a quality word with no criterion; closed, it stays closed while that message is written
  await fresh('khác đi');
  await expect(box).toHaveAttribute('data-hint', 'vague');
  await expect(box).toContainText('“khác đi” là thế nào?');
  await shot('2-chung-chung');
  await box.locator('.zc-coach-x').click();
  await expect(box).toBeHidden();
  await input.press('End'); await input.pressSequentially(' nhé, hay hơn', { delay: 40 });
  await page.waitForTimeout(1200);
  await expect(box).toBeHidden();
  // a new message: it may come again; "Thêm tiêu chí…" puts the caret where the criterion goes
  await fresh('hay hơn');
  await expect(box).toHaveAttribute('data-hint', 'vague');
  await box.locator('[data-k="criteria"]').click();
  await expect(input).toHaveValue('hay hơn\nTiêu chí: ');
  expect(await input.evaluate((x: HTMLTextAreaElement) => x.selectionStart === x.value.length && document.activeElement === x)).toBe(true);
  // pointing at nothing: "Trích lại…" opens quotes right after it
  await fresh('cái này lỗi rồi');
  await expect(box).toHaveAttribute('data-hint', 'dangling');
  await expect(box).toContainText('Nói rõ “cái này” là gì — tên file, tên mục — để Claude khỏi đoán');
  await box.locator('[data-k="quote"]').click();
  await expect(input).toHaveValue('cái này “” lỗi rồi');
  expect(await input.evaluate((x: HTMLTextAreaElement) => x.selectionStart)).toBe(9);
  await fresh('4 đâu có xem giải thích gì đâu');
  await expect(box).toHaveAttribute('data-hint', 'dangling');
  await expect(box).toContainText('Nói rõ “4” là gì');
  await shot('3-chi-tro-mo-ho');
  // several jobs: numbered, in the order they should be done ("trước đó" first), every word kept
  await fresh('gợi ý thêm vài cách làm trang giá cho gọn, trước đó push lên github');
  await expect(box).toHaveAttribute('data-hint', 'multi');
  await expect(box).toContainText('Tin này có 2 việc');
  await shot('4-nhieu-viec');
  await box.locator('[data-k="number"]').click();
  await expect(input).toHaveValue('Làm lần lượt:\n1. Push lên github\n2. Gợi ý thêm vài cách làm trang giá cho gọn');
  // too short
  await fresh('lỗi');
  await expect(box).toHaveAttribute('data-hint', 'tooShort');
  await shot('5-qua-ngan');
  await box.locator('[data-k="result"]').click();
  await expect(input).toHaveValue('lỗi\nKết quả mong muốn: ');
  // a whole answer or a good prompt: nothing to say
  for (const t of ['oke rồi deploy', 'đổi thành map vệ tinh và bỏ badge ở góc phải dưới', 'gói 1 năm để 1tr899 cho tôi nhe']) {
    await fresh(t); await page.waitForTimeout(700); await expect(box).toBeHidden();
  }
  // "✨ Viết lại cho rõ": Claude (here the fake one) rewrites it, the words only; "Hoàn tác" puts it back
  await fresh('4 đâu có xem giải thích gì đâu');
  await expect(box).toHaveAttribute('data-hint', 'dangling');
  await box.locator('[data-k="rewrite"]').click();
  await expect(input).toHaveValue('Mục tiêu: sửa lỗi đang thấy trong ảnh đính kèm.\nBối cảnh: [trang nào?]\nXong khi: trang hiện đúng, không còn lỗi.');
  await expect(box).toHaveAttribute('data-hint', 'rewritten');
  await expect(box).toContainText('Đã viết lại cho rõ');
  await shot('6-da-viet-lai');
  const log = rewriteLog();
  for (const x of ['[--model][haiku]', '[--tools][]', '[--max-turns][1]', '[--no-session-persistence]', '4 đâu có xem giải thích gì đâu']) expect(log).toContain(x);
  expect(log).not.toMatch(/data:image|task-images/);
  await box.locator('[data-k="undo"]').click();
  await expect(input).toHaveValue('4 đâu có xem giải thích gì đâu');
  // a hint never stops a message: Enter sends it, and the helper is gone with it
  await fresh('khác đi');
  await expect(box).toHaveAttribute('data-hint', 'vague');
  await input.press('Enter');
  await expect(zc.locator('.zc-row.is-mine', { hasText: 'khác đi' })).toBeVisible({ timeout: 20_000 });
  await expect(input).toHaveValue('');
  await expect(box).toBeHidden();
  // to the whole group (just chatting): no helper
  await zc.locator('.zc-to-x').click();
  await fresh('khác đi'); await page.waitForTimeout(800);
  await expect(box).toBeHidden();
  // off in Settings → More → Group chat
  await zc.locator('.zc-to-chip').click();
  await zc.locator('.zc-to-pick .zc-to-o[data-dir]').first().click();
  const settings = async () => { await page.click('#btn-chat'); await expect(zc).toBeHidden(); await page.click('#btn-look'); await page.click('#st-tab-more'); };   // (the chat stands over the panel)
  const back = async () => { await page.click('#st-close'); await page.click('#btn-chat'); await expect(zc).toBeVisible(); };
  await settings();
  const sw = page.locator('[data-tgl="coach"]');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await page.locator('#pop-look').screenshot({ path: test.info().outputPath('coach-desktop-7-cai-dat.png') });
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await back();
  await fresh('hay hơn'); await page.waitForTimeout(800);
  await expect(box).toBeHidden();
  await settings(); await sw.click(); await back();
  await fresh('hay hơn');
  await expect(box).toHaveAttribute('data-hint', 'vague');
  expect(errors).toEqual([]);
});
