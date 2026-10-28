#!/usr/bin/env node
// Rewrites the module map in docs/ARCHITECTURE.md from the code: one row per module in src/office, with its line count
// and the first sentence of the comment at the top of the file. Run it after adding, removing or renaming a module.
//
//   node scripts/module-map.mjs          # rewrite the table
//   node scripts/module-map.mjs --check  # exit 1 if the table is out of date (for CI)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src', 'office'), DOC = path.join(ROOT, 'docs', 'ARCHITECTURE.md');
const HEAD = '### Module map';

const files = fs.readdirSync(SRC, { recursive: true }).filter((f) => f.endsWith('.js') && f !== 'main.js').sort();
const what = (text) => {
  const lines = [];
  for (const l of text.split('\n')) { if (!l.startsWith('//')) break; lines.push(l.replace(/^\/\/\s?/, '')); }
  const first = lines.join(' ').trim();
  const end = first.search(/\.(\s|$)/);
  return (end > 0 ? first.slice(0, end + 1) : first).replace(/\|/g, '\\|') || '…';
};
const rows = files.map((f) => {
  const text = fs.readFileSync(path.join(SRC, f), 'utf8');
  return `| \`${f.split(path.sep).join('/')}\` | ${text.split('\n').length - (text.endsWith('\n') ? 1 : 0)} | ${what(text)} |`;
});
const table = ['| Module | Lines | What it is |', '| --- | ---: | --- |', ...rows].join('\n');

const doc = fs.readFileSync(DOC, 'utf8'), at = doc.indexOf(HEAD);
if (at < 0) { console.error(`No "${HEAD}" heading in ${DOC}`); process.exit(1); }
const start = doc.indexOf('| Module |', at), end = (() => { const m = /\n(?!\|)/g; m.lastIndex = start; const r = m.exec(doc); return r ? r.index : doc.length; })();
const next = doc.slice(0, start) + table + doc.slice(end);
if (process.argv.includes('--check')) {
  if (next !== doc) { console.error('docs/ARCHITECTURE.md module map is out of date: run node scripts/module-map.mjs'); process.exit(1); }
  console.log('Module map is up to date.');
} else {
  fs.writeFileSync(DOC, next);
  console.log(`Module map: ${rows.length} modules.`);
}
