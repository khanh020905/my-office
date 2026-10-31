import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoopGuard, callKey, errKey } from '../../server/loops.mjs';

// a guard on a clock the test moves
function guard(conf = {}) {
  let t = 1_000_000;
  const g = createLoopGuard({ config: () => ({ on: true, n: 3, min: 10, ...conf }), now: () => t });
  return { g, tick: (ms) => { t += ms; } };
}
const sid = 'sess-1';
const call = (command, extra = {}) => ({ session_id: sid, tool_name: 'Bash', tool_input: { command, description: `run ${Math.random()}` }, ...extra });
const fail = (g, command, error = 'Exit code 1\nError: Cannot find module \'express\'', extra = {}) => g.onEvent({ ...call(command, extra), hook_event_name: 'PostToolUseFailure', error });
const ok = (g, tool_name, tool_input, extra = {}) => g.onEvent({ session_id: sid, hook_event_name: 'PostToolUse', tool_name, tool_input, ...extra });

test('the same call failing the same way N times: the next one is denied, and again after that', () => {
  const { g } = guard();
  for (let i = 0; i < 2; i++) { assert.equal(g.check(call('npm test')).deny, null); fail(g, 'npm  test'); }   // (whitespace and the description don't count)
  assert.equal(g.check(call('npm test')).deny, null);
  fail(g, 'npm test');
  const r = g.check(call('npm test'));
  assert.deepEqual({ n: r.deny.n, blocked: r.deny.blocked }, { n: 3, blocked: 1 });
  assert.equal(r.sig.type, 'fire');
  assert.equal(r.sig.stuck.kind, 'repeat');
  assert.equal(r.sig.stuck.label, 'npm test');
  const again = g.check(call('npm test'));
  assert.equal(again.deny.blocked, 2);
  assert.equal(again.sig.type, 'blocked');
  assert.equal(g.check(call('npm run lint')).deny, null, 'another command still goes');
});

test('numbers that change from run to run do not make a different error; a different result does', () => {
  assert.equal(errKey('Exit code 1\nconnect ECONNREFUSED 127.0.0.1:54321 after 1203ms (pid 88231)'), errKey('Exit code 1\nconnect ECONNREFUSED 127.0.0.1:61022 after 98ms (pid 90112)'));
  assert.notEqual(errKey('Tests: 3 failed, 10 passed'), errKey('Tests: 2 failed, 11 passed'));
  assert.equal(callKey('Bash', { command: 'ls  -la', description: 'a' }), callKey('Bash', { command: 'ls -la', description: 'b' }));
  assert.notEqual(callKey('Bash', { command: 'ls' }), callKey('Read', { command: 'ls' }));
});

test('a different error, a success, an edit or your message start the count again', () => {
  const { g } = guard();
  const three = () => { for (let i = 0; i < 3; i++) fail(g, 'npm test'); };
  three(); fail(g, 'npm test', 'Exit code 1\nanother error');
  assert.equal(g.check(call('npm test')).deny, null, 'a different error');
  three(); ok(g, 'Bash', { command: 'npm test' });
  assert.equal(g.check(call('npm test')).deny, null, 'it worked');
  three(); ok(g, 'Read', { file_path: '/x/package.json' });
  assert.ok(g.check(call('npm test')).deny, 'reading a file in between is still the same loop');
  three(); ok(g, 'Edit', { file_path: '/x/index.js' });
  assert.equal(g.check(call('npm test')).deny, null, 'a file edited');
  three(); g.onEvent({ session_id: sid, hook_event_name: 'UserPromptSubmit', prompt: 'try again, the server is up' });
  assert.equal(g.check(call('npm test')).deny, null, 'you said something');
  three(); fail(g, 'npm test', undefined, { is_interrupt: true });
  assert.ok(g.check(call('npm test')).deny, 'an interrupt is yours, not a failure');
});

test('a denied loop clears once it edits, or its turn ends', () => {
  const { g } = guard();
  for (let i = 0; i < 3; i++) fail(g, 'npm test');
  assert.equal(g.check(call('npm test')).sig.type, 'fire');
  assert.equal(g.stuckOf(sid).kind, 'repeat');
  const c = ok(g, 'Write', { file_path: '/x/a.js', content: '' });
  assert.equal(c.type, 'clear'); assert.equal(c.why, 'edit');
  assert.equal(g.stuckOf(sid), null);
  for (let i = 0; i < 3; i++) fail(g, 'npm test');
  g.check(call('npm test'));
  assert.equal(g.onEvent({ session_id: sid, hook_event_name: 'Stop' }).why, 'end');
});

test('switched off, or under the threshold you picked, nothing is denied', () => {
  const off = guard({ on: false }).g;
  for (let i = 0; i < 5; i++) fail(off, 'npm test');
  assert.equal(off.check(call('npm test')).deny, null);
  const five = guard({ n: 5 }).g;
  for (let i = 0; i < 4; i++) fail(five, 'npm test');
  assert.equal(five.check(call('npm test')).deny, null);
  fail(five, 'npm test');
  assert.ok(five.check(call('npm test')).deny);
  assert.equal(guard().g.check(call('npm test')).deny, null, 'a session never heard of');
});

test('each subagent has its own count', () => {
  const { g } = guard();
  for (let i = 0; i < 3; i++) fail(g, 'npm test', undefined, { agent_id: 'a1' });
  assert.equal(g.check(call('npm test')).deny, null, 'the main conversation has not failed');
  assert.ok(g.check(call('npm test', { agent_id: 'a1' })).deny);
});

test('compaction after compaction: three automatic ones in half an hour', () => {
  const { g, tick } = guard();
  const compact = (trigger = 'auto') => g.onEvent({ session_id: sid, hook_event_name: 'PreCompact', trigger });
  assert.equal(compact(), null); tick(8 * 60e3);
  assert.equal(compact('manual'), null, 'yours do not count'); tick(8 * 60e3);
  assert.equal(compact(), null); tick(8 * 60e3);
  const s = compact();
  assert.equal(s.type, 'fire'); assert.equal(s.stuck.kind, 'compact'); assert.equal(s.stuck.n, 3); assert.equal(s.stuck.mins, 24);
  // spread over more than half an hour: not a storm
  const b = guard();
  for (let i = 0; i < 4; i++) { assert.equal(b.g.onEvent({ session_id: sid, hook_event_name: 'PreCompact', trigger: 'auto' }), null); b.tick(16 * 60e3); }
});

test('cost rising for X minutes with no file edited', () => {
  const { g, tick } = guard({ min: 10 });
  const cost = (usd, added = 0) => g.onStatus(sid, { total_cost_usd: usd, total_lines_added: added, total_lines_removed: 0 }, true);
  assert.equal(cost(1.0), null);
  for (let m = 1; m <= 9; m++) { tick(60e3); assert.equal(cost(1.0 + m * 0.2), null, `minute ${m}`); }
  tick(60e3);
  const s = cost(3.1);
  assert.equal(s.type, 'fire'); assert.equal(s.stuck.kind, 'cost'); assert.equal(s.stuck.usd, 2.1); assert.equal(s.stuck.mins, 10);
  tick(60e3); assert.equal(cost(3.3), null, 'once');
  tick(60e3); assert.equal(cost(3.4, 12).type, 'clear', 'lines changed: it edited');
});

test('cost: edits, a quiet spell, resting, planning or a small spend never fire', () => {
  const run = (setup, step) => { const { g, tick } = guard({ min: 10 }); setup?.(g); let out = null; for (let m = 0; m <= 15; m++) { out ||= step(g, m); tick(60e3); } return out; };
  const usd = (m) => ({ total_cost_usd: 1 + m * 0.3, total_lines_added: 0, total_lines_removed: 0 });
  assert.equal(run(null, (g, m) => { if (m % 6 === 5) ok(g, 'Edit', { file_path: '/a' }); return g.onStatus(sid, usd(m), true); }), null, 'an edit every few minutes');
  assert.equal(run(null, (g, m) => g.onStatus(sid, usd(m), false)), null, 'resting');
  assert.equal(run((g) => g.onEvent({ session_id: sid, hook_event_name: 'UserPromptSubmit', permission_mode: 'plan' }), (g, m) => g.onStatus(sid, usd(m), true)), null, 'plan mode');
  assert.equal(run(null, (g, m) => g.onStatus(sid, { total_cost_usd: 1 + m * 0.01 }, true)), null, 'a few cents');
  assert.equal(run(null, (g, m) => (m % 6 ? null : g.onStatus(sid, usd(m), true))), null, 'a status every six minutes: never rising for long');
  assert.equal(run(null, (g, m) => g.onStatus(sid, usd(m), true))?.stuck.kind, 'cost', 'the control: the same without any of those fires');
});

test('Stop and a hint: taken by the next call, dropped when the turn ends', () => {
  const { g } = guard();
  for (let i = 0; i < 3; i++) fail(g, 'npm test');
  g.check(call('npm test'));
  assert.ok(g.hint(sid, 'the database is down, use the mock'));
  const r = g.check(call('npm test'));
  assert.ok(r.deny); assert.equal(r.hint, 'the database is down, use the mock'); assert.equal(r.sig.hint, true);
  assert.equal(g.check(call('ls')).hint, null, 'once');
  g.stop(sid);
  assert.equal(g.check(call('ls')).stop, true);
  assert.equal(g.check(call('ls', { agent_id: 'a1' })).stop, true, 'its subagents too');
  g.onEvent({ session_id: sid, hook_event_name: 'Stop' });
  assert.equal(g.check(call('ls')).stop, false, 'until the turn is over');
  g.hint(sid, 'never read');
  assert.equal(g.onEvent({ session_id: sid, hook_event_name: 'Stop' }).type, 'hintLost');
});

test('memory stays bounded: the 64 sessions heard from last', () => {
  const { g } = guard();
  for (let i = 0; i < 200; i++) for (let k = 0; k < 3; k++) g.onEvent({ session_id: `s${i}`, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'x' }, error: 'e' });
  assert.equal(g.check({ session_id: 's0', tool_name: 'Bash', tool_input: { command: 'x' } }).deny, null, 'forgotten');
  assert.ok(g.check({ session_id: 's199', tool_name: 'Bash', tool_input: { command: 'x' } }).deny);
});
