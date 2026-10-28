import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createT, LANGS, DEFAULT_LANG, pickLang } from '../../src/i18n/index.js';

const dicts = Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [k, v.dict]));
// every leaf key ("activity.kpi.cmd"); a { one, other } pair is one leaf
const leaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
  v && typeof v === 'object' && !Array.isArray(v) && !('other' in v) ? leaves(v, `${p}${k}.`) : [`${p}${k}`]);
const has = (dict, key) => key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), dict) !== undefined;

test('every language only has keys that English has', () => {
  const en = new Set(leaves(dicts[DEFAULT_LANG]));
  for (const [lang, dict] of Object.entries(dicts)) {
    if (lang === DEFAULT_LANG) continue;
    assert.deepEqual(leaves(dict).filter((k) => !en.has(k)), [], `${lang} has keys English does not`);
  }
});

test('every key the code asks for exists in English', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const files = ['src/office', 'src/components', 'src/shared', 'server', 'bin', 'hooks', 'app']
    .flatMap((d) => fs.readdirSync(path.join(root, d), { recursive: true }).map((f) => path.join(d, f)))
    .filter((f) => /\.(m?js|tsx?)$/.test(f));
  const missing = [];
  for (const f of files) {
    // comments left out (they quote example keys); a line comment needs a space before it, so URLs stay
    const text = fs.readFileSync(path.join(root, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, '')).join('\n');
    // tr('area.key' …) and t('area.key' …) with a literal key; keys built at run time ('area.tier' + n) are not checked
    for (const m of text.matchAll(/\b(?:tr|t)\(\s*'([a-zA-Z][\w]*(?:\.[\w]+)+)'\s*[,)]/g)) if (!has(dicts[DEFAULT_LANG], m[1])) missing.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(missing, []);
});

test('slots, plurals, lists and the English fallback', () => {
  const en = createT('en'), vi = createT('vi');
  assert.equal(en('time.min', { n: 3 }), '3 min');
  assert.equal(en('time.day', { n: 1 }), '1 day');
  assert.equal(en('time.day', { n: 2 }), '2 days');
  assert.equal(vi('time.day', { n: 2 }), '2 ngày');
  assert.equal(en('no.such.key'), 'no.such.key');
  assert.deepEqual(en('no.such.key', null, 'list'), []);
  assert.equal(en.num(1234.5, 1), '1,234.5');
  assert.equal(vi.num(1234.5, 1), '1.234,5');
  assert.equal(pickLang('xx'), DEFAULT_LANG);
  assert.equal(pickLang('vi'), 'vi');
});
