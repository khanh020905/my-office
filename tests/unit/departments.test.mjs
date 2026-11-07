import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEPARTMENTS, DEPT_IDS, deptOf } from '../../src/shared/departments.js';
import { normalize, createAgentModel } from '../../src/shared/agent-events.js';

let n = 0;
const ev = (type, extra = {}) => normalize({ id: ++n, ts: 1e12 + n, sess: 's', name: 'main', type, label: '', ...extra });

test('ten unique departments, each with an accent', () => {
  assert.equal(DEPARTMENTS.length, 10);
  assert.equal(new Set(DEPT_IDS).size, 10);
  for (const d of DEPARTMENTS) assert.match(d.accent, /^#[0-9A-F]{6}$/i);
});

test('deptOf places real events and refuses to guess', () => {
  assert.equal(deptOf(ev('bash', { label: 'py -3.14 tools/video_qa.py out.mp4' })), 'qa');
  assert.equal(deptOf(ev('bash', { runner: 'test', label: 'npm test' })), 'qa');
  assert.equal(deptOf(ev('bash', { label: 'ffmpeg -i a.mp4 b.mp4' })), 'editing');
  assert.equal(deptOf(ev('edit', { label: 'storyboard.md' })), 'storyboard');
  assert.equal(deptOf(ev('write', { label: 'music/bed.wav' })), 'audio');
  assert.equal(deptOf(ev('edit', { label: 'scenes/s01.js' })), 'animation');
  assert.equal(deptOf(ev('write', { label: 'art/hero.png' })), 'visual');
  assert.equal(deptOf(ev('edit', { label: 'script.srt' })), 'script');
  assert.equal(deptOf(ev('web', { label: 'example.com' })), 'research');
  assert.equal(deptOf(ev('read', { label: 'notes.txt' })), 'library');
  assert.equal(deptOf(ev('prompt')), 'director');
  assert.equal(deptOf(ev('substart', { agent: 'a', agentType: 'Explore' })), 'research');
  assert.equal(deptOf(ev('bash', { label: 'ls' })), null, 'no clue -> null');
  assert.equal(deptOf(ev('edit', { label: 'server/index.mjs' })), null);
  assert.equal(deptOf(null), null);
});

test('agent model keeps the last known department', () => {
  const m = createAgentModel();
  m.ingest({ id: 1, ts: 1, sess: 's', type: 'web', label: 'x.com' });
  m.ingest({ id: 2, ts: 2, sess: 's', type: 'bash', label: 'ls' });
  assert.equal(m.snapshot(2)[0].dept, 'research', 'an unplaceable event keeps the last department');
  m.ingest({ id: 3, ts: 3, sess: 's', type: 'bash', label: 'ffmpeg -i a b.mp4' });
  assert.equal(m.snapshot(3)[0].dept, 'editing');
});
