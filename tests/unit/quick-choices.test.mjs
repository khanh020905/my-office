import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickChoices } from '../../src/shared/quick-choices.js';

test('lettered options at the end become choices', () => {
  const c = quickChoices('Làm gì tiếp?\nA) Push lên origin\nB) Xoá tệp tạm\nC. Bỏ qua');
  assert.deepEqual(c.map((x) => x.reply), ['A', 'B', 'C']);
  assert.equal(c[0].label, 'Push lên origin');
});
test('numbered and bulleted-bold options', () => {
  assert.equal(quickChoices('Chọn:\n1. một\n2. hai').length, 2);
  assert.equal(quickChoices('Chọn:\n- **1)** một\n- **2)** hai').length, 2);
});
test('not a choice list', () => {
  assert.deepEqual(quickChoices('xong rồi'), []);
  assert.deepEqual(quickChoices('1. chỉ một'), []);
  assert.deepEqual(quickChoices('A) x\nB) y\nrồi hỏi thêm một câu cuối'), []);
  assert.deepEqual(quickChoices('1. a\n3. b'), []);
  assert.deepEqual(quickChoices(''), []);
});
