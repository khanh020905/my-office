import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskAggregator } from '../../src/shared/task-aggregator.js';

const BASE_TS = 1_700_000_000_000;
let evCounter = 0;

function makeEv(type, extra = {}) {
  evCounter++;
  return {
    id: evCounter,
    ts: BASE_TS + evCounter * 1000,
    sess: 's1',
    name: 'test-session',
    type,
    label: type,
    ...extra,
  };
}

// Helper to simulate server snapshot generation


test('Regression 1: Import a full snapshot containing active and historical tasks', () => {
  const serverAgg = createTaskAggregator();

  // 1 Active task
  serverAgg.ingest(makeEv('prompt', { sess: 'sess-active', label: 'Active Work' }));
  serverAgg.ingest(makeEv('edit', { sess: 'sess-active', file: 'src/active.js' }));

  // 1 Historical completed task
  serverAgg.ingest(makeEv('prompt', { sess: 'sess-done', label: 'Completed Work' }));
  serverAgg.ingest(makeEv('stop', { sess: 'sess-done', label: 'All finished' }));

  const snap = serverAgg.snapshot(BASE_TS + 50_000);
  assert.equal(snap.activeTasks.length, 1);
  assert.equal(snap.history.items.length, 1);

  // Client hydrator
  const clientAgg = createTaskAggregator();
  const ok = clientAgg.importState(snap);

  assert.equal(ok, true);
  assert.equal(clientAgg.size, 2);

  const clientActive = clientAgg.getActiveTasks(BASE_TS + 50_000);
  assert.equal(clientActive.length, 1);
  assert.equal(clientActive[0].title, 'Active Work');
  assert.equal(clientActive[0].status, 'running');

  const clientHistory = clientAgg.getHistoryTasks({ now: BASE_TS + 50_000 });
  assert.equal(clientHistory.total, 1);
  assert.equal(clientHistory.items[0].title, 'Completed Work');
  assert.equal(clientHistory.items[0].status, 'succeeded');
});

test('Regression 2: Import the same snapshot twice (idempotency)', () => {
  const serverAgg = createTaskAggregator();
  serverAgg.ingest(makeEv('prompt', { sess: 's-idem-1', label: 'Idempotency Task 1' }));
  serverAgg.ingest(makeEv('prompt', { sess: 's-idem-2', label: 'Idempotency Task 2' }));
  serverAgg.ingest(makeEv('stop', { sess: 's-idem-2', label: 'Finished Task 2' }));

  const snap = serverAgg.snapshot(BASE_TS + 50_000);
  const clientAgg = createTaskAggregator();

  // First import
  clientAgg.importState(snap);
  assert.equal(clientAgg.size, 2);

  // Second import of exact same snapshot
  clientAgg.importState(snap);
  assert.equal(clientAgg.size, 2, 'Size must not double on re-import');

  const active = clientAgg.getActiveTasks(BASE_TS + 50_000);
  const history = clientAgg.getHistoryTasks({ now: BASE_TS + 50_000 });
  assert.equal(active.length, 1);
  assert.equal(history.total, 1);
  assert.equal(history.items.length, 1);
});

test('Regression 3: Import a snapshot followed by a feed containing an update to an existing task', () => {
  const serverAgg = createTaskAggregator();
  const pEv = makeEv('prompt', { sess: 'sess-upd', label: 'Task being updated' });
  serverAgg.ingest(pEv);

  const snap = serverAgg.snapshot(BASE_TS + 10_000);
  const clientAgg = createTaskAggregator();
  clientAgg.importState(snap);

  assert.equal(clientAgg.size, 1);
  assert.equal(clientAgg.getActiveTasks(BASE_TS + 10_000)[0].filesChanged.length, 0);

  // Feed arrives with new edit event for the same session/task
  const editEv = makeEv('edit', { sess: 'sess-upd', file: 'src/updated-file.js', ts: BASE_TS + 20_000 });
  clientAgg.load([editEv]);

  assert.equal(clientAgg.size, 1, 'Task ID must be reused, not duplicated');
  const activeTask = clientAgg.getActiveTasks(BASE_TS + 20_000)[0];
  assert.ok(activeTask.filesChanged.includes('src/updated-file.js'));
  assert.equal(activeTask.currentPhase, 'Editing');
});

test('Regression 4: Import a snapshot followed by a feed containing a new task', () => {
  const serverAgg = createTaskAggregator();
  serverAgg.ingest(makeEv('prompt', { sess: 's-old', label: 'Old Task' }));

  const snap = serverAgg.snapshot(BASE_TS + 10_000);
  const clientAgg = createTaskAggregator();
  clientAgg.importState(snap);

  assert.equal(clientAgg.size, 1);

  // Feed arrives with a completely new session/task
  const newEv = makeEv('prompt', { sess: 's-brand-new', label: 'New Arriving Task', ts: BASE_TS + 20_000 });
  clientAgg.load([newEv]);

  assert.equal(clientAgg.size, 2, 'Snapshot tasks and feed tasks must coexist');
  const active = clientAgg.getActiveTasks(BASE_TS + 20_000);
  const titles = active.map((t) => t.title).sort();
  assert.deepEqual(titles, ['New Arriving Task', 'Old Task']);
});

test('Regression 5: Import a snapshot with empty feed', () => {
  const serverAgg = createTaskAggregator();
  serverAgg.ingest(makeEv('prompt', { sess: 's-empty-1', label: 'Task A' }));
  serverAgg.ingest(makeEv('prompt', { sess: 's-empty-2', label: 'Task B' }));
  serverAgg.ingest(makeEv('stop', { sess: 's-empty-2', label: 'Task B Done' }));

  const snap = serverAgg.snapshot(BASE_TS + 10_000);
  const clientAgg = createTaskAggregator();

  clientAgg.importState(snap);
  clientAgg.load([]); // Empty feed

  assert.equal(clientAgg.size, 2, 'Empty feed must not clear imported snapshot tasks');
  assert.equal(clientAgg.getActiveTasks(BASE_TS + 10_000).length, 1);
  assert.equal(clientAgg.getHistoryTasks({ now: BASE_TS + 10_000 }).total, 1);
});

test('Regression 6: Import a snapshot where history contains multiple items / pagination structure', () => {
  const serverAgg = createTaskAggregator();
  // Generate 12 historical tasks
  for (let i = 1; i <= 12; i++) {
    serverAgg.ingest(makeEv('prompt', { sess: `s-hist-${i}`, label: `Hist Task ${i}` }));
    serverAgg.ingest(makeEv('stop', { sess: `s-hist-${i}`, label: `Hist Done ${i}` }));
  }

  // Server snapshot returns up to limit (e.g. limit: 50, but here 12 items)
  const snap = serverAgg.snapshot(BASE_TS + 50_000);
  assert.equal(snap.history.items.length, 12);
  assert.equal(snap.history.total, 12);

  const clientAgg = createTaskAggregator();
  clientAgg.importState(snap);

  assert.equal(clientAgg.size, 12);

  // Client query with pagination limit 5, offset 0
  const page1 = clientAgg.getHistoryTasks({ limit: 5, offset: 0, now: BASE_TS + 50_000 });
  assert.equal(page1.items.length, 5);
  assert.equal(page1.total, 12);
  assert.equal(page1.hasMore, true);
  assert.equal(page1.offset, 0);

  // Client query with pagination limit 5, offset 10
  const page3 = clientAgg.getHistoryTasks({ limit: 5, offset: 10, now: BASE_TS + 50_000 });
  assert.equal(page3.items.length, 2);
  assert.equal(page3.hasMore, false);
});

test('Regression 7: Reconnect and receive another snapshot without duplicate records', () => {
  const serverAgg = createTaskAggregator();
  const e1 = makeEv('prompt', { sess: 's-recon', label: 'Reconnecting Task' });
  serverAgg.ingest(e1);

  // Initial connection
  const snap1 = serverAgg.snapshot(BASE_TS + 10_000);
  const clientAgg = createTaskAggregator();
  clientAgg.importState(snap1);
  clientAgg.load([e1]);

  assert.equal(clientAgg.size, 1);

  // Server advances with edit
  const e2 = makeEv('edit', { sess: 's-recon', file: 'src/recon.js', ts: BASE_TS + 15_000 });
  serverAgg.ingest(e2);

  // Reconnection sends new snapshot and feed
  const snap2 = serverAgg.snapshot(BASE_TS + 20_000);
  clientAgg.importState(snap2);
  clientAgg.load([e1, e2]);

  assert.equal(clientAgg.size, 1, 'Reconnection snapshot must not produce duplicate tasks');
  const task = clientAgg.getActiveTasks(BASE_TS + 20_000)[0];
  assert.equal(task.events.length, 2, 'Event list must not contain duplicate events');
  assert.deepEqual(task.filesChanged, ['src/recon.js']);
});

test('Regression 8: Preserve completed task details after browser reload', () => {
  // Pre-reload session state
  const serverAgg = createTaskAggregator();
  const events = [
    makeEv('prompt', { sess: 's-reload', label: 'Fix memory leak' }),
    makeEv('read', { sess: 's-reload', file: 'src/mem.js' }),
    makeEv('edit', { sess: 's-reload', file: 'src/mem.js' }),
    makeEv('bash', { sess: 's-reload', command: 'node test-mem.js' }),
    makeEv('testok', { sess: 's-reload' }),
    makeEv('stop', { sess: 's-reload', label: 'Memory leak resolved' }),
  ];
  for (const ev of events) serverAgg.ingest(ev);

  // Server snapshot
  const serverSnapshot = serverAgg.snapshot(BASE_TS + 30_000);

  // Browser reload: clean memory state created on new page load
  const reloadedClientAgg = createTaskAggregator();

  // Client receives snapshot on SSE connect
  reloadedClientAgg.importState(serverSnapshot);

  // Feed buffer on server contains the latest slice of historical events
  const truncatedFeed = events.slice(-3);
  reloadedClientAgg.load(truncatedFeed);

  // Completed task must remain in history with all original details intact
  const history = reloadedClientAgg.getHistoryTasks({ now: BASE_TS + 30_000 });
  assert.equal(history.total, 1);
  const completedTask = history.items[0];

  assert.equal(completedTask.title, 'Fix memory leak');
  assert.equal(completedTask.status, 'succeeded');
  assert.equal(completedTask.result, 'Memory leak resolved');
  assert.ok(completedTask.completedAt > 0);
  assert.ok(completedTask.filesChanged.includes('src/mem.js'));
  assert.ok(completedTask.commandsExecuted.includes('node test-mem.js'));
});
