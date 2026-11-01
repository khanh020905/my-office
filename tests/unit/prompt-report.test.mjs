import { test } from 'node:test';
import assert from 'node:assert/strict';
import { report } from '../../server/prompt-report.mjs';

const p = (t, ph = 0, at = 1, sid = 'a') => ({ t, ph, at, sid, title: '' });

test('a week of prompts: what is clear, what each habit cost, one example of each (the most common first, the newest)', () => {
  const r = report([
    p('sửa lỗi trang giá: nút Mua bị che trên iPhone khi màn hình hẹp', 0, 1),
    p('sao', 1, 2), p('điền sao', 1, 3, 'b'),
    p('làm khác đi', 0, 4),
    p('ok', 0, 5), p('/clear', 0, 6), p('2', 0, 7), p('tiếp tục', 0, 8),   // (not prompts to judge)
    p('thêm trang giới thiệu cho dự án landing page, dùng ảnh trong thư mục public/hero', 0, 9),
  ]);
  assert.equal(r.n, 5);
  assert.equal(r.clear, 2);
  assert.equal(r.pct, 40);
  assert.equal(r.convs, 2);
  assert.deepEqual([r.by.photoBare, r.by.vague], [2, 1]);
  assert.deepEqual(r.examples.map((e) => [e.hint, e.t]), [['photoBare', 'điền sao'], ['vague', 'làm khác đi']]);
  assert.equal(r.examples[1].phrase, 'khác đi');
});

test('nothing to judge: no percentage', () => {
  assert.deepEqual(report([p('ok'), p('/compact')]), { n: 0, clear: 0, pct: null, convs: 0, by: { photoBare: 0, dangling: 0, vague: 0, multi: 0, tooShort: 0 }, examples: [] });
});
