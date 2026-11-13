import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTaskAggregator } from '../../src/shared/task-aggregator.js';

test('Phase 5 — Performance & Stress: 1,500+ events, 20+ concurrent tasks, deduplication & restarts', () => {
  const aggregator = createTaskAggregator({ maxTasks: 500, maxEvents: 10000 });
  const startMemory = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  const NUM_TASKS = 20;
  const EVENTS_PER_TASK = 75; // 20 * 75 = 1,500 events
  const providers = ['claude-code', 'codex-app', 'codex-cli', 'antigravity'];

  const allEvents = [];
  let eventSeq = 1;

  for (let t = 0; t < NUM_TASKS; t++) {
    const provider = providers[t % providers.length];
    const sess = `stress-sess-${t}`;
    const taskId = `task-stress-${t}`;

    // Prompt event
    allEvents.push({
      id: eventSeq++,
      taskId,
      sess,
      provider,
      type: provider === 'codex-app' ? 'codex_prompt' : 'prompt',
      label: `Stress test task ${t}`,
      ts: 10000 + t * 100,
    });

    for (let e = 1; e < EVENTS_PER_TASK; e++) {
      const isEdit = e % 3 === 0;
      const isCmd = e % 3 === 1;
      const isRead = e % 3 === 2;

      allEvents.push({
        id: eventSeq++,
        taskId,
        sess,
        provider,
        type: isEdit ? 'edit' : isCmd ? 'bash' : 'read',
        label: isEdit ? `src/file-${e}.js` : isCmd ? `cmd-${e}` : `read-${e}`,
        path: isEdit ? `src/file-${e}.js` : undefined,
        command: isCmd ? `npm test --run-${e}` : undefined,
        ts: 10000 + t * 100 + e * 5,
      });
    }
  }

  assert.equal(allEvents.length, 1500, 'Must generate exactly 1,500 events');

  // Shuffle events to simulate out-of-order network/observer arrivals
  const shuffled = [...allEvents];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Ingest shuffled events
  for (const ev of shuffled) {
    aggregator.ingest(ev);
  }

  // Deliver 300 duplicate events (20% duplicate delivery)
  for (let d = 0; d < 300; d++) {
    const randomEvent = allEvents[Math.floor(Math.random() * allEvents.length)];
    aggregator.ingest(randomEvent);
  }

  const tIngest = performance.now();
  const ingestDurationMs = tIngest - t0;

  // Verification 1: Task count must be exactly NUM_TASKS (no duplicate cards)
  const stats = aggregator.getStats();
  assert.equal(stats.totalTasks, NUM_TASKS, `Must have exactly ${NUM_TASKS} unique tasks`);

  // Verification 2: Every task must have exactly EVENTS_PER_TASK events (deduping verified)
  for (let t = 0; t < NUM_TASKS; t++) {
    const task = aggregator.getTask(`task-stress-${t}`);
    assert.ok(task, `Task task-stress-${t} must exist`);
    assert.equal(task.eventCount, EVENTS_PER_TASK, `Task ${t} eventCount must not be inflated by duplicates`);
    assert.equal(task.events.length, EVENTS_PER_TASK, `Task ${t} timeline must not have duplicate events`);

    // Verification 3: Chronological ordering of events inside the task timeline
    for (let k = 1; k < task.events.length; k++) {
      assert.ok(
        (task.events[k].ts || 0) >= (task.events[k - 1].ts || 0),
        `Events inside task ${t} must be strictly chronological`
      );
    }
  }

  // Verification 4: Fast repeated snapshot generation (simulating SSE clients and UI polling)
  const tSnap0 = performance.now();
  for (let s = 0; s < 100; s++) {
    const snap = aggregator.snapshot();
    assert.ok(snap.activeTasks);
    assert.ok(snap.history);
    assert.ok(snap.stats);
  }
  const snapDurationMs = (performance.now() - tSnap0) / 100;

  // Verification 5: Export / Restart roundtrip under 1,500 event load
  const exported = aggregator.exportState();
  const serialized = JSON.stringify(exported);
  const restoredAggregator = createTaskAggregator();
  restoredAggregator.importState(JSON.parse(serialized));

  assert.equal(restoredAggregator.getStats().totalTasks, NUM_TASKS);
  for (let t = 0; t < NUM_TASKS; t++) {
    const restoredTask = restoredAggregator.getTask(`task-stress-${t}`);
    assert.equal(restoredTask.eventCount, EVENTS_PER_TASK);
  }

  // Verification 6: Memory check
  const endMemory = process.memoryUsage().heapUsed;
  const memoryDeltaMb = (endMemory - startMemory) / (1024 * 1024);

  // Performance assertions
  assert.ok(ingestDurationMs < 1000, `Ingestion of 1,500 events + 300 duplicates took ${ingestDurationMs}ms (must be < 1000ms)`);
  assert.ok(snapDurationMs < 10, `Snapshot generation average took ${snapDurationMs}ms (must be < 10ms)`);
  assert.ok(memoryDeltaMb < 50, `Memory delta ${memoryDeltaMb.toFixed(2)}MB must remain under 50MB`);
});

