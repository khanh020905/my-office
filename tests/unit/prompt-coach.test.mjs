import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coach, numberTasks, splitTasks } from '../../src/shared/prompt-coach.js';

// the hints' ids, the most useful first
const ids = (text, photos = 0, quoted = false) => coach({ text, photos, quoted, lang: 'vi' }).map((h) => h.id);
const first = (text, photos = 0) => coach({ text, photos })[0];

// the owner's own messages that went back and forth (from 2,441 real prompts), and messages that were fine as they were
test('a photo with one to three words: photoBare', () => {
  for (const t of ['sao', 'điền sao', 'config gì', 'cái này nữa nhé', 'đây', 'fix', 'dien sao', 'config j', 'cai nay nua nhe', 'Sao?', 'why', '']) assert.equal(first(t, 1)?.id, 'photoBare', t);
  assert.equal(first('sao', 3)?.id, 'photoBare');
  // a photo with a real request: nothing to say
  for (const t of ['đổi thành map vệ tinh như ảnh', 'Sửa lỗi đang thấy trong ảnh: sao', 'nút đăng nhập bị lệch sang phải như ảnh, căn giữa lại', 'make the header look like this screenshot']) assert.deepEqual(ids(t, 1), [], t);
});

test('a quality with nothing to measure it by: vague', () => {
  const cases = [['khác đi', 'khác đi'], ['hay hơn', 'hay hơn'], ['làm đẹp hơn đi', 'đẹp hơn'], ['tốt hơn nữa', 'tốt hơn'], ['xịn hơn chút', 'xịn hơn'], ['làm giống thật đừng làm qua loa', 'giống thật'],
    ['chuyên nghiệp hơn', 'chuyên nghiệp hơn'], ['khac di', 'khac di'], ['lam giong that dung lam qua loa', 'giong that'], ['đẹp hơnnn', 'đẹp hơnnn'], ['qua loa quá', 'qua loa'], ['make it better', 'make it better'], ['looks off, more professional please', 'looks off']];
  for (const [t, phrase] of cases) assert.deepEqual(first(t), { id: 'vague', phrase }, t);
  // the criterion is there
  for (const t of ['đẹp hơn: nền tối, nút bo tròn', 'khác đi nhé, kiểu nền tối chữ to', 'hay hơn như trang của Stripe', 'tốt hơn là dùng sqlite', 'làm đẹp hơn, chữ to hơn và màu xanh lá', 'đẹp hơn ví dụ như trang chủ Apple', 'make it better: bigger buttons, darker background', 'lazy load ảnh ở trang chủ', "it's fine, don't change the colour", 'đẹp hơn rồi, giờ thêm nút xuất CSV', 'giao diện đã đẹp hơn, giờ sửa nút đăng nhập', 'looks better now, ship it']) assert.ok(!ids(t).includes('vague'), t);
});

test('pointing at something the message does not show: dangling', () => {
  const cases = [['4 đâu có xem giải thích gì đâu', '4'], ['phần của vĩ', 'phần của vĩ'], ['cái này lỗi rồi', 'cái này'], ['sửa như trên', 'như trên'], ['ý 4 sai rồi, giải thích lại kỹ hơn đi', 'ý 4'],
    ['cai nay loi roi', 'cai nay'], ['kái nài lỗi', 'kái nài'], ['this one is broken again after the deploy', 'this one']];
  for (const [t, phrase] of cases) assert.deepEqual(first(t), { id: 'dangling', phrase }, t);
  // something to point at: a photo, a quote, a file, the message it answers; or a plain count, or an answer
  assert.ok(!ids('cái này lỗi rồi', 1).includes('dangling'));
  assert.ok(!ids('cái này lỗi rồi', 0, true).includes('dangling'));
  // a list you numbered yourself is not a number pointing at nothing
  assert.ok(!ids('1 gởi lại tôi nên điền gì\n2. làm 2 và 3 nhé').includes('dangling'));
  assert.ok(!ids('1 sửa header cho gọn\n2 chạy lại test').includes('dangling'));
  for (const t of ['cái này trong Header.tsx bị lỗi', 'đổi “Đăng nhập” thành “Vào” ở cái này', 'cái này: src/office/ui/chat.js', '2 cái nút bị lệch quá', '3 phút là đủ', 'chọn số 4', 'phương án 2']) assert.ok(!ids(t).includes('dangling'), t);
});

test('several jobs in one message: multi, numbered in the order they should be done', () => {
  for (const t of ['gợi ý thêm… trước đó push lên github', 'gợi ý thêm vài cách làm trang giá cho gọn, trước đó push lên github', 'sửa lỗi header rồi chạy test, xong thì commit và push lên main', 'write the tests, then deploy to staging and also explain the cache']) assert.equal(first(t)?.id, 'multi', t);
  assert.equal(first('gợi ý thêm… trước đó push lên github').n, 2);
  // "trước đó" (before that): that job first
  assert.equal(numberTasks('gợi ý thêm vài cách làm trang giá cho gọn, trước đó push lên github', 'Làm lần lượt:'), 'Làm lần lượt:\n1. Push lên github\n2. Gợi ý thêm vài cách làm trang giá cho gọn');
  assert.equal(numberTasks('sửa lỗi header rồi chạy test, xong thì commit và push lên main'), '1. Sửa lỗi header\n2. Chạy test\n3. Commit\n4. Push lên main');
  // every word of the jobs kept
  const all = splitTasks('write the tests, then deploy to staging and also explain the cache');
  assert.deepEqual(all.map((j) => j.text), ['write the tests', 'deploy to staging', 'explain the cache']);
  assert.deepEqual(all.map((j) => j.kind), ['change', 'ship', 'think']);
  // one job, or two of a kind joined by "và", or a short "fix then push": fine as it is
  for (const t of ['đổi thành map vệ tinh và bỏ badge ở góc phải dưới', 'oke rồi deploy', 'thêm nút lưu và nút huỷ', 'sửa lỗi rồi commit', 'push and deploy']) assert.ok(!ids(t).includes('multi'), t);
  assert.equal(numberTasks('chỉ một việc thôi'), 'chỉ một việc thôi');
});

test('too short to act on: tooShort, but never a whole answer', () => {
  for (const t of ['sao', 'config gì', 'fix this', 'tại sao', 'lỗi']) assert.deepEqual(ids(t), ['tooShort'], t);
  for (const t of ['oke', 'ok', 'push đi', 'deploy', 'continue', 'tiếp', 'tiep di', 'làm đi', 'commit', 'có', 'không', 'ko', 'oke r deploy', 'thử lại', '2', 'cả 2', 'B', 'lgtm', '/compact', '🙏', 'cảm ơn', 'run the tests', 'sửa đi', 'test lại', 'dạ', 'vâng']) assert.deepEqual(ids(t), [], t);
  assert.deepEqual(ids('sao', 1), ['photoBare']);   // (a photo: the photo's hint instead)
});

test('good prompts get nothing', () => {
  for (const t of ['gói 1 năm để 1tr899 cho tôi nhe', 'oke rồi deploy', 'đổi thành map vệ tinh và bỏ badge ở góc phải dưới', 'Thêm nút "Xuất CSV" vào trang báo cáo, cột ngày định dạng dd/mm/yyyy',
    'Chạy toàn bộ test của dự án này rồi báo kết quả ngắn gọn; test nào hỏng thì nói rõ vì sao.', 'Rename the `user` table to `account` and update every query that uses it',
    'giảm cỡ chữ tiêu đề xuống 28px trên điện thoại']) assert.deepEqual(ids(t), [], t);
});

test('one hint at a time is enough: the most useful first', () => {
  assert.deepEqual(ids('cái này khác đi'), ['dangling', 'vague']);
  assert.deepEqual(ids('khác đi', 1), ['photoBare', 'vague']);
});
