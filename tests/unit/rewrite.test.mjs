import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanRewrite, createRewriter, rewriteSystem } from '../../server/rewrite.mjs';

// tests/e2e/fake-claude.sh stands in for Claude Code: nothing is spent, the answer is the same every time
const FAKE = path.resolve(import.meta.dirname, '../e2e/fake-claude.sh');
function setup(opts = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'office-rewrite-'));
  const rw = createRewriter({ claude: () => ({ file: FAKE }), env: () => ({ ...process.env, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude') }), dir: path.join(home, 'rewrite'), ...opts });
  const args = () => { try { return fs.readFileSync(path.join(home, '.fake-claude-rewrite.log'), 'utf8'); } catch { return ''; } };   // (every argument in [brackets])
  return { rw, args };
}

test('rewrites with a small model, no tools, one turn, nothing saved, the hooks off; text only', { skip: process.platform === 'win32' }, async () => {
  const { rw, args } = setup();
  const r = await rw.rewrite({ text: 'sao', lang: 'vi', photos: 1 });
  assert.deepEqual(r, { ok: true, text: 'Mục tiêu: sửa lỗi đang thấy trong ảnh đính kèm.\nBối cảnh: [trang nào?]\nXong khi: trang hiện đúng, không còn lỗi.' });
  const a = args();
  for (const x of ['[-p]', '[--model][haiku]', '[--tools][]', '[--strict-mcp-config]', '[--max-turns][1]', '[--output-format][json]', '[--no-session-persistence]', '[--settings][{"disableAllHooks":true}]', '[--system-prompt]']) assert.ok(a.includes(x), x);
  assert.match(a, /<message>\nsao\n<\/message>\n\(1 screenshot will be attached/);   // (how many photos, never the photos)
  assert.doesNotMatch(a, /data:image|\.jpg|\.png/);
  assert.match(a, /Mục tiêu:.*Bối cảnh:.*Xong khi:/s);
  // English, and its code fence taken off
  assert.deepEqual(await rw.rewrite({ text: 'why', lang: 'en' }), { ok: true, text: 'Goal: fix the error in the attached screenshot.\nContext: [which page?]\nDone when: the page shows no error.' });
});

test('one at a time, 20 an hour, a timeout, and what went wrong', { skip: process.platform === 'win32' }, async () => {
  const { rw } = setup({ perHour: 3, timeout: 1500 });
  assert.deepEqual(await rw.rewrite({ text: '  ' }), { ok: false, code: 'empty' });
  const slow = rw.rewrite({ text: 'slowly please' });
  assert.deepEqual(await rw.rewrite({ text: 'meanwhile' }), { ok: false, code: 'busy' });
  assert.deepEqual(await slow, { ok: false, code: 'timeout' });
  const bad = await rw.rewrite({ text: 'fail please' });
  assert.equal(bad.code, 'failed'); assert.match(bad.detail, /usage limit/);
  assert.equal((await rw.rewrite({ text: 'third' })).ok, true);
  assert.deepEqual(await rw.rewrite({ text: 'fourth' }), { ok: false, code: 'tooMany' });
  const none = createRewriter({ claude: () => null, env: () => process.env, dir: os.tmpdir() });
  assert.deepEqual(await none.rewrite({ text: 'x' }), { ok: false, code: 'noClaude' });
});

test('its instruction and what comes back', () => {
  assert.match(rewriteSystem('vi'), /"Mục tiêu:".*"Bối cảnh:".*"Xong khi:"/s);
  assert.match(rewriteSystem('xx'), /"Goal:".*"Context:".*"Done when:"/s);
  assert.match(rewriteSystem('en'), /Invent nothing/);
  assert.equal(cleanRewrite('```markdown\nGoal: a\nContext: b\n```'), 'Goal: a\nContext: b');
  assert.equal(cleanRewrite('“Goal: a”'), 'Goal: a');
  assert.equal(cleanRewrite('<message>\nGoal: a\n</message>'), 'Goal: a');
  assert.equal(cleanRewrite(null), '');
});
