import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, createAgentModel, STALE_MS, KINDS } from '../../src/shared/agent-events.js';

const T = 1_700_000_000_000;
let n = 0;
const ev = (type, extra = {}) => ({ id: ++n, ts: T + n * 1000, sess: 's1', name: 'main', type, label: type, ...extra });

test('normalize maps office types to spec §7 kinds', () => {
  assert.equal(normalize(ev('start')).kind, 'agent.started');
  assert.equal(normalize(ev('prompt')).kind, 'agent.task_assigned');
  assert.equal(normalize(ev('read')).kind, 'agent.tool_started');
  assert.equal(normalize(ev('bash')).kind, 'agent.tool_started');
  assert.equal(normalize(ev('edit')).kind, 'agent.file_modified');
  assert.equal(normalize(ev('edit')).source, 'inferred');
  assert.equal(normalize(ev('testok')).kind, 'agent.tool_completed');
  assert.equal(normalize(ev('testfail')).kind, 'agent.tool_failed');
  assert.equal(normalize(ev('wait')).kind, 'agent.awaiting_approval');
  assert.equal(normalize(ev('idle')).kind, 'agent.waiting');
  assert.equal(normalize(ev('stop')).kind, 'agent.completed');
  assert.equal(normalize(ev('fail')).kind, 'agent.failed');
  assert.equal(normalize(ev('fail', { agent: 'a1' })).kind, 'agent.tool_failed');
  assert.equal(normalize(ev('compact')), null);
  for (const t of ['start', 'read', 'wait', 'stop']) assert.ok(KINDS.includes(normalize(ev(t)).kind));
});

test('normalize refuses demo and malformed events', () => {
  assert.equal(normalize(ev('read', { demo: true })), null);
  assert.equal(normalize({ type: 'read' }), null);
  assert.equal(normalize(null), null);
  assert.equal(normalize({ id: 1, ts: T, sess: '', type: 'read' }), null);
});

test('subagent events get their own agent with a parent link', () => {
  const x = normalize(ev('substart', { agent: 'a1', agentType: 'Explore' }));
  assert.equal(x.agent, 's1:a1');
  assert.equal(x.parent, 's1');
  assert.equal(x.name, 'Explore');
});

test('model dedups, keeps order, and reports honest state', () => {
  const m = createAgentModel();
  const a = ev('start'), b = ev('read'), c = ev('wait');
  m.ingest(a); m.ingest(b); m.ingest(c);
  assert.equal(m.ingest(b), null, 'duplicate refused');
  let [s] = m.snapshot(c.ts);
  assert.equal(s.state, 'blocked');
  assert.equal(s.tools, 1);
  // a late (older) event counts but does not move the state back
  m.ingest({ ...ev('bash'), id: b.id - 0.5 });
  [s] = m.snapshot(c.ts);
  assert.equal(s.state, 'blocked');
  assert.equal(s.tools, 2);
  // no event for longer than STALE_MS -> unknown, never running
  [s] = m.snapshot(c.ts + STALE_MS + 1);
  assert.equal(s.state, 'unknown');
  m.ingest(ev('stop'));
  [s] = m.snapshot(T + 1e9);
  assert.equal(s.state, 'done', 'finished agents stay done');
});

test('runner tool marks reviewing; load() recovers from a saved feed in id order', () => {
  const m = createAgentModel();
  const evs = [ev('start'), ev('bash', { runner: 'test' }), ev('substart', { agent: 'q', agentType: 'qa' })];
  m.load([...evs].reverse());
  const snap = m.snapshot(evs[2].ts);
  assert.equal(snap.length, 2);
  assert.equal(snap.find((x) => x.id === 's1').state, 'reviewing');
  assert.equal(snap.find((x) => x.id === 's1:q').state, 'running');
  m.load(evs);
  assert.equal(m.size, 2, 'reloading the same feed is a no-op');
});

test('Codex lifecycle events stay distinct from task assignment, tools, and success', () => {
  const turn = normalize(ev('codexturn', { agent: 'codex', provider: 'codex-cli' }));
  const msg = normalize(ev('codexmessage', { agent: 'codex', provider: 'codex-cli', label: 'answer' }));
  const exit = normalize(ev('codexexit', { agent: 'codex', provider: 'codex-cli' }));
  assert.equal(turn.kind, 'agent.turn_started');
  assert.equal(msg.kind, 'agent.message');
  assert.equal(exit.kind, 'agent.execution_ended');
  const model = createAgentModel(); model.ingest(exit);
  assert.equal(model.snapshot(exit.ts)[0].state, 'unknown');
});

test('Codex App hook events map to honest shared states', () => {
  assert.equal(normalize(ev('codex_start', { provider: 'codex-app' })).kind, 'agent.started');
  assert.equal(normalize(ev('codex_prompt', { provider: 'codex-app' })).kind, 'agent.task_assigned');
  assert.equal(normalize(ev('codex_tool_start')).kind, 'agent.tool_started');
  assert.equal(normalize(ev('codex_tool_complete')).kind, 'agent.tool_completed');
  assert.equal(normalize(ev('codex_tool_fail')).kind, 'agent.tool_failed');
  const ended = normalize(ev('codex_execution_end', { provider: 'codex-app' }));
  const model = createAgentModel(); model.ingest(ended);
  assert.equal(ended.kind, 'agent.execution_ended');
  assert.equal(model.snapshot(ended.ts)[0].state, 'unknown');
});

test('explicit Codex file creation and deletion remain distinct file events', () => {
  assert.equal(normalize(ev('create')).kind, 'agent.file_created');
  assert.equal(normalize(ev('delete')).kind, 'agent.file_deleted');
  const model = createAgentModel(); model.ingest(ev('create')); model.ingest(ev('delete'));
  assert.equal(model.snapshot(T + 10_000)[0].files, 2);
});

test('Antigravity file observation stays unknown and is not presented as a tool event', () => {
  const observed = normalize(ev('antigravity_observed', { provider: 'antigravity' }));
  assert.equal(observed.kind, 'agent.status.unknown');
  const model = createAgentModel(); model.ingest(ev('antigravity_observed', { provider: 'antigravity' }));
  assert.equal(model.snapshot(T + 1000)[0].state, 'unknown');
});

test('model caps agents and evicts the stalest, not the newest', () => {
  const m = createAgentModel({ max: 2 });
  m.ingest(ev('start', { sess: 'a' })); m.ingest(ev('start', { sess: 'b' })); m.ingest(ev('start', { sess: 'c' }));
  assert.deepEqual(m.snapshot(T).map((x) => x.id).sort(), ['b', 'c']);
});
