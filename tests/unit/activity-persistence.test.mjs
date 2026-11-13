import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTaskAggregator } from '../../src/shared/task-aggregator.js';

test('Phase 1 Persistence: task aggregation state exports, imports, and survives restart', () => {
  const aggregator1 = createTaskAggregator();

  // 1. Start a task
  aggregator1.ingest({
    id: 101,
    sess: 's-live-1',
    provider: 'claude-code',
    type: 'prompt',
    label: 'Refactor user authentication',
    ts: 1000,
  });

  // 2. Generate several events
  aggregator1.ingest({
    id: 102,
    sess: 's-live-1',
    provider: 'claude-code',
    type: 'read',
    label: 'src/auth/login.js',
    path: 'src/auth/login.js',
    ts: 1010,
  });

  aggregator1.ingest({
    id: 103,
    sess: 's-live-1',
    provider: 'claude-code',
    type: 'edit',
    label: 'src/auth/login.js',
    path: 'src/auth/login.js',
    ts: 1020,
  });

  aggregator1.ingest({
    id: 104,
    sess: 's-live-1',
    provider: 'claude-code',
    type: 'bash',
    label: 'npm test',
    command: 'npm test',
    ts: 1030,
  });

  // Verify before export
  const active1 = aggregator1.getActiveTasks();
  assert.equal(active1.length, 1);
  const task1 = active1[0];
  assert.equal(task1.eventCount, 4);
  assert.equal(task1.filesChanged.length, 1);
  assert.equal(task1.commandsExecuted.length, 1);
  assert.equal(task1.currentPhase, 'Executing');

  // 3. Export state simulating persistence / restart
  const serialized = aggregator1.exportState();
  const stateString = JSON.stringify(serialized);
  assert.ok(stateString.length > 0);

  // 4. Simulate fresh server restart: new aggregator instance
  const aggregator2 = createTaskAggregator();
  assert.equal(aggregator2.getActiveTasks().length, 0);

  // Import persisted state
  const restored = JSON.parse(stateString);
  const success = aggregator2.importState(restored);
  assert.equal(success, true);

  // 5. Inspect whether the task and its event history are restored
  const active2 = aggregator2.getActiveTasks();
  assert.equal(active2.length, 1);
  const task2 = active2[0];
  assert.equal(task2.taskId, task1.taskId);
  assert.equal(task2.title, 'Refactor user authentication');
  assert.equal(task2.eventCount, 4);
  assert.equal(task2.events.length, 4);
  assert.equal(task2.filesChanged[0], 'src/auth/login.js');
  assert.equal(task2.commandsExecuted[0], 'npm test');
  assert.equal(task2.currentPhase, 'Executing');

  // 6. Verify duplicate events after restart are handled correctly (idempotency)
  aggregator2.ingest({
    id: 103, // duplicate of edit event
    sess: 's-live-1',
    provider: 'claude-code',
    type: 'edit',
    label: 'src/auth/login.js',
    path: 'src/auth/login.js',
    ts: 1020,
  });

  const taskAfterDup = aggregator2.getActiveTasks()[0];
  assert.equal(taskAfterDup.eventCount, 4, 'Event count should not increase on duplicate post-restart');
  assert.equal(taskAfterDup.events.length, 4, 'Timeline should not append duplicate post-restart');

  // 7. Verify subsequent new events correctly append to the restored task
  aggregator2.ingest({
    id: 105,
    sess: 's-live-1',
    provider: 'claude-code',
    type: 'stop',
    label: 'Refactor complete and verified',
    ts: 1040,
  });

  const afterStop = aggregator2.getActiveTasks();
  assert.equal(afterStop.length, 0, 'Completed task moved out of active');
  const history = aggregator2.getHistoryTasks();
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0].status, 'succeeded');
  assert.equal(history.items[0].eventCount, 5);
  assert.equal(history.items[0].events.length, 5);
});

test('Phase 1 Persistence: task state survives when feed is truncated beyond FEED_MAX', () => {
  const aggregator = createTaskAggregator();

  // Create an old task
  aggregator.ingest({
    id: 1,
    sess: 's-old',
    provider: 'claude-code',
    type: 'prompt',
    label: 'Initial architecture setup',
    ts: 100,
  });
  aggregator.ingest({
    id: 2,
    sess: 's-old',
    provider: 'claude-code',
    type: 'stop',
    label: 'Initial setup finished',
    ts: 200,
  });

  // Now export task aggregator state
  const exported = aggregator.exportState();

  // Simulate feed rolling over with 100 newer events from other tasks
  const feedOnly = [];
  for (let i = 100; i < 200; i++) {
    feedOnly.push({
      id: i,
      sess: `s-noise-${i}`,
      provider: 'claude-code',
      type: 'read',
      label: `file-${i}.txt`,
      ts: 1000 + i,
    });
  }

  // Restore fresh aggregator with exported task state + feed
  const restoredAggregator = createTaskAggregator();
  restoredAggregator.importState(exported);
  restoredAggregator.load(feedOnly);

  // Verify old task is still present in history even though it was NOT in feedOnly!
  const history = restoredAggregator.getHistoryTasks();
  const foundOld = history.items.find((t) => t.title === 'Initial architecture setup');
  assert.ok(foundOld, 'Older task must not be lost when feed truncates');
  assert.equal(foundOld.status, 'succeeded');
});
