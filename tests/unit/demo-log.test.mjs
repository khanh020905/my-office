import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOG_MAX, SUB_LOGS, logLine } from '../../src/office/demo/demo-log.js';

test('a log keeps its latest lines, at most a little over LOG_MAX', () => {
  const logs = new Map();
  for (let i = 0; i < 5000; i++) logLine(logs, 'demo-0', { role: 'tool', label: `step ${i}` });
  const log = logs.get('demo-0');
  assert.ok(log.length >= LOG_MAX && log.length <= LOG_MAX + 30, `${log.length} lines`);
  assert.equal(log.at(-1).label, 'step 4999', 'the newest line is there');
  assert.ok(log.slice(-LOG_MAX).every((x, i, a) => i === 0 || Number(x.label.slice(5)) === Number(a[i - 1].label.slice(5)) + 1), 'the last lines in order, none missing');
});

test('only the latest subagents keep a log; sessions always keep theirs', () => {
  const logs = new Map();
  logLine(logs, 'demo-0', { role: 'user', text: 'hi' });
  for (let i = 1; i <= 500; i++) { logLine(logs, `demo-sub-${i}`, null); logLine(logs, `demo-sub-${i}`, { role: 'tool', label: 'read' }); }
  const subs = [...logs.keys()].filter((k) => k.startsWith('demo-sub-'));
  assert.equal(subs.length, SUB_LOGS);
  assert.equal(subs.at(-1), 'demo-sub-500');
  assert.equal(subs[0], `demo-sub-${500 - SUB_LOGS + 1}`, 'the oldest go first');
  assert.ok(logs.has('demo-0'), "a session's log is never dropped");
});

test('a null line opens the log without adding to it', () => {
  const logs = new Map();
  const log = logLine(logs, 'demo-sub-1', null);
  assert.deepEqual(log, []);
  assert.equal(logs.get('demo-sub-1'), log);
});
