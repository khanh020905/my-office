import test from 'node:test';
import assert from 'node:assert/strict';
import { countActivity } from '../../server/activity-stats.mjs';

test('counts normalized task starts and completed tool operations', () => {
  const stats = {}, session = { counts: {} };
  for (const type of ['agent.task.started', 'tool.read.completed', 'tool.edit.completed', 'tool.command.completed']) {
    assert.equal(countActivity(stats, session, type), true);
  }
  assert.deepEqual(stats, { tasks: 1, prompts: 1, read: 1, edit: 1, cmd: 1 });
  assert.deepEqual(session.counts, { read: 1, edit: 1, cmd: 1 });
});

test('does not count failures, starts, or unknown operations as completed work', () => {
  const stats = {};
  for (const type of ['tool.read.started', 'tool.command.failed', 'tool.other.completed']) assert.equal(countActivity(stats, null, type), false);
  assert.deepEqual(stats, {});
});
