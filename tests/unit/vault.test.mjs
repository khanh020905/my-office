import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanPrompt, createVault, fold, readTranscript } from '../../server/vault.mjs';

// a transcript as Claude Code writes it: your prompt (with what the editor adds), Claude's text and tool calls, the
// tool's output, a screenshot, the titles
const SID = '11111111-2222-3333-4444-555555555555', SID2 = '66666666-7777-8888-9999-000000000000';
const line = (o) => `${JSON.stringify(o)}\n`;
function transcript(file, { prompt = 'sửa lỗi đăng nhập Google', reply = 'Đã sửa: thiếu redirect URI.', title = 'Sửa đăng nhập' } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    line({ type: 'user', cwd: '/Users/me/app', timestamp: '2026-10-01T08:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: '<ide_opened_file>The user opened app.ts</ide_opened_file>' }, { type: 'text', text: prompt }] } }),
    line({ type: 'assistant', timestamp: '2026-10-01T08:00:05.000Z', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'app.ts' } }] } }),
    line({ type: 'user', timestamp: '2026-10-01T08:00:06.000Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x'.repeat(5000) }] } }),
    line({ type: 'user', timestamp: '2026-10-01T08:00:07.000Z', message: { role: 'user', content: [{ type: 'image', source: { type: 'base64', data: 'A'.repeat(20000) } }] } }),
    line({ type: 'user', isMeta: true, timestamp: '2026-10-01T08:00:07.500Z', message: { role: 'user', content: 'Caveat: local command' } }),
    line({ type: 'assistant', timestamp: '2026-10-01T08:01:00.000Z', message: { role: 'assistant', content: [{ type: 'text', text: reply }] } }),
    line({ type: 'ai-title', aiTitle: 'Fix Google login' }),
    title ? line({ type: 'custom-title', customTitle: title }) : '',
  ].join(''));
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'office-vault-'));

test('a transcript read into its words: your prompt without what the editor added, Claude\'s text, your title', async () => {
  const d = tmp(), f = path.join(d, 'x.jsonl'); transcript(f);
  const r = await readTranscript(f);
  assert.equal(r.title, 'Sửa đăng nhập');   // (yours wins over the generated one)
  assert.equal(r.cwd, '/Users/me/app');
  assert.deepEqual(r.msgs.map((m) => [m.r, m.t]), [['u', 'sửa lỗi đăng nhập Google'], ['c', 'Đã sửa: thiếu redirect URI.']]);
  assert.equal(r.start, Date.parse('2026-10-01T08:00:00.000Z'));
  assert.equal(r.end, Date.parse('2026-10-01T08:01:00.000Z'));
  transcript(f, { title: '' });
  assert.equal((await readTranscript(f)).title, 'Fix Google login');
});

test('what the editor and Claude Code wrap around a prompt goes; a paste keeps its words', () => {
  assert.equal(cleanPrompt('<system-reminder>be nice</system-reminder>fix it'), 'fix it');
  assert.equal(cleanPrompt('<pasted_content id="1">log line</pasted_content> why?'), 'log line why?');
  assert.equal(cleanPrompt('<command-name>/clear</command-name>'), '');
  assert.equal(fold('Sửa LỖI Đà Nẵng'), 'sua loi da nang');
});

test('every account read once, kept small, found with or without accents, and kept once Claude Code deletes it', async () => {
  const home = tmp(), main = path.join(home, '.claude'), other = path.join(home, '.claude-phu');
  transcript(path.join(main, 'projects', '-Users-me-app', `${SID}.jsonl`));
  transcript(path.join(main, 'projects', '-Users-me-site', `${SID2}.jsonl`), { prompt: 'thêm trang giá', reply: 'Xong trang pricing.', title: '' });
  fs.mkdirSync(other); fs.symlinkSync(path.join(main, 'projects'), path.join(other, 'projects'));   // (an account sharing the main one's history)
  let t = 1_000_000;
  const v = createVault({ dir: path.join(home, 'vault'), claudeDirs: () => [main, other], now: () => t });
  assert.equal(await v.scan(), 2);
  const st = v.stats();
  assert.equal(st.n, 2);
  assert.ok(st.bytes < 2000, `kept small: ${st.bytes} bytes`);   // (the screenshot and the tool output are not kept)
  // newest first; found by its words, accents or not, and in what Claude said
  assert.deepEqual((await v.search('')).map((x) => x.sid).sort(), [SID, SID2].sort());
  assert.deepEqual((await v.search('sua loi')).map((x) => x.sid), [SID]);
  const hit = await v.search('redirect');
  assert.equal(hit[0].sid, SID); assert.match(hit[0].snip, /redirect URI/); assert.equal(hit[0].snipBy, 'c');
  assert.deepEqual((await v.search('trang gia')).map((x) => x.title), ['Fix Google login']);   // (no title of yours: the generated one)
  // read again: unchanged files are skipped
  assert.equal(await v.scan(), 0);
  // Claude Code deletes one: still here, marked gone, readable
  fs.rmSync(path.join(main, 'projects', '-Users-me-app', `${SID}.jsonl`)); t += 5000;
  await v.scan();
  const gone = (await v.search('sua loi'))[0];
  assert.equal(gone.gone, t);
  assert.deepEqual((await v.get(SID)).msgs.map((m) => m.r), ['u', 'c']);
  assert.equal((await v.get(SID)).gone, t);
  assert.equal((await v.get(SID2)).gone, 0);
  // a new office reads its index back
  const again = createVault({ dir: path.join(home, 'vault'), claudeDirs: () => [main] });
  assert.equal(again.stats().n, 2);
  assert.equal(await again.get('../etc/passwd'), null);
});
