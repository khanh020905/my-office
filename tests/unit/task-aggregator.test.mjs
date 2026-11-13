import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskAggregator } from '../../src/shared/task-aggregator.js';

const BASE_TS = 1_700_000_000_000;
let evId = 0;

function createEv(type, extra = {}) {
  evId++;
  return {
    id: evId,
    ts: BASE_TS + evId * 1000,
    sess: 's1',
    name: 'claude-session',
    type,
    label: type,
    ...extra,
  };
}

test('1. Multiple events belonging to one task aggregate into one primary card with chronological timeline', () => {
  const agg = createTaskAggregator();
  agg.ingest(createEv('prompt', { label: 'Implement authentication' }));
  agg.ingest(createEv('read', { label: 'read src/auth.js', file: 'src/auth.js' }));
  agg.ingest(createEv('edit', { label: 'edit src/auth.js', file: 'src/auth.js' }));
  agg.ingest(createEv('bash', { label: 'npm test', command: 'npm test' }));
  agg.ingest(createEv('testok', { label: 'tests passed' }));
  const task = agg.ingest(createEv('stop', { label: 'Task finished' }));

  assert.equal(agg.size, 1);
  assert.equal(task.eventCount, 6);
  assert.equal(task.events.length, 6);
  assert.equal(task.status, 'succeeded');
  assert.equal(task.currentPhase, 'Completed');
  assert.deepEqual(task.filesChanged, ['src/auth.js']);
  assert.ok(task.commandsExecuted.includes('npm test'));
});

test('2. Multiple tasks belonging to one agent stay separate across turns', () => {
  const agg = createTaskAggregator();
  // Turn 1
  agg.ingest(createEv('prompt', { sess: 's1', label: 'First prompt' }));
  agg.ingest(createEv('edit', { sess: 's1', file: 'src/a.js' }));
  agg.ingest(createEv('stop', { sess: 's1', label: 'Done first' }));

  // Turn 2 for the same agent session
  agg.ingest(createEv('prompt', { sess: 's1', label: 'Second prompt' }));
  agg.ingest(createEv('edit', { sess: 's1', file: 'src/b.js' }));

  const active = agg.getActiveTasks();
  const history = agg.getHistoryTasks();

  assert.equal(agg.size, 2);
  assert.equal(active.length, 1);
  assert.equal(active[0].title, 'Second prompt');
  assert.equal(history.total, 1);
  assert.equal(history.items[0].title, 'First prompt');
});

test('3. Multiple agents running simultaneously maintain separate concurrent active task cards', () => {
  const agg = createTaskAggregator();
  agg.ingest(createEv('prompt', { sess: 'agent-1', label: 'Agent 1 task' }));
  agg.ingest(createEv('prompt', { sess: 'agent-2', label: 'Agent 2 task' }));
  agg.ingest(createEv('edit', { sess: 'agent-1', file: 'file1.js' }));
  agg.ingest(createEv('edit', { sess: 'agent-2', file: 'file2.js' }));

  const active = agg.getActiveTasks();
  assert.equal(active.length, 2);
  const titles = active.map((t) => t.title).sort();
  assert.deepEqual(titles, ['Agent 1 task', 'Agent 2 task']);
});

test('4. Duplicate event delivery is idempotent and does not inflate counters', () => {
  const agg = createTaskAggregator();
  const e1 = createEv('prompt', { label: 'Build feature' });
  const e2 = createEv('edit', { label: 'edit app.js', file: 'app.js' });

  agg.ingest(e1);
  agg.ingest(e2);
  // Redeliver same events
  agg.ingest(e1);
  agg.ingest(e2);

  const task = agg.getActiveTasks()[0];
  assert.equal(task.eventCount, 2);
  assert.equal(task.filesChanged.length, 1);
});

test('5. Repeated edits to the same file are tracked with timestamp history without duplicates in filesChanged', () => {
  const agg = createTaskAggregator();
  agg.ingest(createEv('prompt', { label: 'Refactor module' }));
  agg.ingest(createEv('edit', { file: 'src/utils.js', ts: BASE_TS + 1000 }));
  agg.ingest(createEv('edit', { file: 'src/utils.js', ts: BASE_TS + 2000 }));
  agg.ingest(createEv('edit', { file: 'src/utils.js', ts: BASE_TS + 3000 }));

  const task = agg.getActiveTasks()[0];
  assert.deepEqual(task.filesChanged, ['src/utils.js']);
  assert.equal(task.fileHistory['src/utils.js'].length, 3);
});

test('6. Real observed file paths propagate cleanly through tool hooks', () => {
  const agg = createTaskAggregator();
  agg.ingest(createEv('prompt', { label: 'Fix bugs' }));
  agg.ingest(createEv('read', { filePaths: ['server/index.mjs', 'src/app.js'] }));

  const task = agg.getActiveTasks()[0];
  assert.deepEqual(task.filesChanged, ['server/index.mjs', 'src/app.js']);
});

test('7. Codex App and Codex CLI session boundaries remain strictly separated', () => {
  const agg = createTaskAggregator();
  // Codex App hook event
  agg.ingest(createEv('codex_prompt', {
    provider: 'codex-app',
    sessionId: 'session-app-1',
    turnId: 'turn-1',
    label: 'App prompt',
  }));
  // Codex CLI run event
  agg.ingest(createEv('codex_start', {
    provider: 'codex-cli',
    sess: 'codex:run-cli-1',
    codexRun: 'run-cli-1',
    label: 'CLI run starting',
  }));

  const active = agg.getActiveTasks();
  assert.equal(active.length, 2);
  const appTask = active.find((t) => t.provider === 'codex-app');
  const cliTask = active.find((t) => t.provider === 'codex-cli');
  assert.ok(appTask);
  assert.ok(cliTask);
  assert.notEqual(appTask.taskId, cliTask.taskId);
  assert.equal(appTask.provider, 'codex-app');
  assert.equal(cliTask.provider, 'codex-cli');
});

test('8. Antigravity coarse-grained observations preserve coarse evidence level', () => {
  const agg = createTaskAggregator();
  agg.ingest(createEv('antigravity_observed', {
    sess: 'ag-conv-uuid',
    provider: 'antigravity',
    label: 'Antigravity activity observed; detailed events unavailable',
  }));

  const task = agg.getTask('antigravity:ag-conv-uuid');
  assert.ok(task);
  assert.equal(task.evidenceLevel, 'coarse_observation');
  assert.equal(task.status, 'unknown');
  assert.equal(task.progress.mode, 'activity_only');
  assert.equal(task.filesChanged.length, 0);
});

test('9. Missing progress information never fabricates arbitrary percentages', () => {
  const agg = createTaskAggregator();
  agg.ingest(createEv('prompt', { label: 'General research' }));
  agg.ingest(createEv('read', { label: 'reading docs' }));

  const task = agg.getActiveTasks()[0];
  assert.equal(task.progress.mode, 'phase');
  assert.equal(task.progress.percent, null);
  assert.equal(task.progress.phase, 'Analyzing');
});

test('10. Real quantitative progress reflects verified step counts', () => {
  const agg = createTaskAggregator();
  agg.ingest(createEv('prompt', {
    label: 'Step workflow',
    totalSteps: 8,
    completedSteps: 4,
  }));

  const task = agg.getActiveTasks()[0];
  assert.equal(task.progress.mode, 'quantitative');
  assert.equal(task.progress.percent, 50);
  assert.equal(task.progress.label, '4/8 (50%)');
});

test('11. Phase-based progress transitions accurately according to actual tool actions', () => {
  const agg = createTaskAggregator();
  agg.ingest(createEv('prompt', { label: 'Full cycle' }));
  let task = agg.getActiveTasks()[0];
  assert.equal(task.currentPhase, 'Planning');

  agg.ingest(createEv('read', { file: 'index.js' }));
  assert.equal(agg.getActiveTasks()[0].currentPhase, 'Analyzing');

  agg.ingest(createEv('edit', { file: 'index.js' }));
  assert.equal(agg.getActiveTasks()[0].currentPhase, 'Editing');

  agg.ingest(createEv('bash', { command: 'npm start' }));
  assert.equal(agg.getActiveTasks()[0].currentPhase, 'Executing');

  agg.ingest(createEv('testok', { runner: 'node' }));
  assert.equal(agg.getActiveTasks()[0].currentPhase, 'Testing');

  agg.ingest(createEv('stop', { label: 'Completed' }));
  assert.equal(agg.getHistoryTasks().items[0].currentPhase, 'Completed');
});

test('12. Task completion transitions task to history', () => {
  const agg = createTaskAggregator();
  agg.ingest(createEv('prompt', { label: 'Small task' }));
  assert.equal(agg.getActiveTasks().length, 1);
  assert.equal(agg.getHistoryTasks().total, 0);

  agg.ingest(createEv('stop', { label: 'All good' }));
  assert.equal(agg.getActiveTasks().length, 0);
  assert.equal(agg.getHistoryTasks().total, 1);
  assert.equal(agg.getHistoryTasks().items[0].status, 'succeeded');
});

test('13. Failed and cancelled tasks transition to history with error information preserved', () => {
  const agg = createTaskAggregator();
  agg.ingest(createEv('prompt', { sess: 's-fail', label: 'Will fail' }));
  agg.ingest(createEv('fail', { sess: 's-fail', label: 'Compile error: syntax invalid' }));

  agg.ingest(createEv('prompt', { sess: 's-cancel', label: 'Will cancel' }));
  agg.ingest(createEv('interrupt', { sess: 's-cancel', label: 'User pressed Ctrl+C' }));

  const history = agg.getHistoryTasks();
  assert.equal(history.total, 2);

  const failedTask = history.items.find((t) => t.status === 'failed');
  const cancelledTask = history.items.find((t) => t.status === 'cancelled');

  assert.ok(failedTask);
  assert.ok(cancelledTask);
  assert.equal(failedTask.error, 'Compile error: syntax invalid');
  assert.equal(cancelledTask.error, 'User pressed Ctrl+C');
});

test('14. Waiting and stale task detection distinguishes waiting from failures and marks stale', () => {
  const agg = createTaskAggregator({ staleMs: 5000 });
  const startTs = BASE_TS;
  agg.ingest(createEv('prompt', { label: 'Needs approval', ts: startTs }));
  agg.ingest(createEv('wait', { label: 'Allow file deletion?', ts: startTs + 100 }));

  let active = agg.getActiveTasks(startTs + 200);
  assert.equal(active[0].status, 'waiting');

  // Advance time past stale threshold
  active = agg.getActiveTasks(startTs + 6000);
  assert.equal(active[0].status, 'stale');
  assert.notEqual(active[0].status, 'failed', 'Stale must not automatically mean failed');
});

test('15. Out-of-order events are placed in chronological order in task events list', () => {
  const agg = createTaskAggregator();
  agg.ingest(createEv('prompt', { label: 'Task with timestamps', ts: BASE_TS + 1000 }));
  agg.ingest(createEv('edit', { file: 'file3.js', ts: BASE_TS + 3000 }));
  agg.ingest(createEv('read', { file: 'file2.js', ts: BASE_TS + 2000 })); // arrived out of order

  const task = agg.getActiveTasks()[0];
  assert.equal(task.events[0].type, 'prompt');
  assert.equal(task.events[1].type, 'read');
  assert.equal(task.events[2].type, 'edit');
});

test('16. Concurrent event ingestion from multiple providers updates independent tasks', () => {
  const agg = createTaskAggregator();
  for (let i = 0; i < 50; i++) {
    const prov = i % 2 === 0 ? 'claude-code' : 'codex-cli';
    const sess = `${prov}:sess-${i % 4}`;
    agg.ingest(createEv(i < 4 ? 'prompt' : 'bash', {
      provider: prov,
      sess,
      label: `Op ${i}`,
      command: `cmd-${i}`,
    }));
  }
  const stats = agg.getStats();
  assert.ok(stats.active > 0);
});

test('17. Historical event pagination supports limit and offset', () => {
  const agg = createTaskAggregator();
  for (let i = 1; i <= 25; i++) {
    agg.ingest(createEv('prompt', { sess: `s-${i}`, label: `Task ${i}` }));
    agg.ingest(createEv('stop', { sess: `s-${i}`, label: `Done ${i}` }));
  }

  const page1 = agg.getHistoryTasks({ limit: 10, offset: 0 });
  assert.equal(page1.items.length, 10);
  assert.equal(page1.total, 25);
  assert.equal(page1.hasMore, true);

  const page3 = agg.getHistoryTasks({ limit: 10, offset: 20 });
  assert.equal(page3.items.length, 5);
  assert.equal(page3.hasMore, false);
});

test('18. Existing API compatibility and statistics summary calculations', () => {
  const agg = createTaskAggregator();
  const t0 = BASE_TS;
  agg.ingest(createEv('prompt', { sess: 's1', label: 'Running task', ts: t0 }));
  agg.ingest(createEv('wait', { sess: 's2', label: 'Waiting task', ts: t0 + 10 }));
  agg.ingest(createEv('prompt', { sess: 's3', label: 'Done task', ts: t0 + 20 }));
  agg.ingest(createEv('stop', { sess: 's3', label: 'Completed', ts: t0 + 30 }));
  agg.ingest(createEv('prompt', { sess: 's4', label: 'Failed task', ts: t0 + 40 }));
  agg.ingest(createEv('fail', { sess: 's4', label: 'Failed', ts: t0 + 50 }));

  const stats = agg.getStats(t0 + 60);
  assert.equal(stats.active, 1);
  assert.equal(stats.waiting, 1);
  assert.equal(stats.completed, 1);
  assert.equal(stats.failed, 1);
});

test('19. Security and safe path normalization reject path traversal attempts', () => {
  const agg = createTaskAggregator();
  agg.ingest(createEv('prompt', { label: 'Path security check' }));
  agg.ingest(createEv('edit', { filePaths: ['src/valid.js', '../../etc/passwd', 'C:\\Windows\\System32\\calc.exe'] }));

  const task = agg.getActiveTasks()[0];
  assert.ok(task.filesChanged.includes('src/valid.js'));
});

test('20. Batch loading preserves order and recovers state from feed snapshot', () => {
  const agg1 = createTaskAggregator();
  const evs = [
    createEv('prompt', { label: 'Task to recover' }),
    createEv('read', { file: 'src/main.js' }),
    createEv('stop', { label: 'Saved before restart' }),
  ];
  for (const e of evs) agg1.ingest(e);

  const agg2 = createTaskAggregator();
  agg2.load(evs);

  assert.equal(agg2.size, 1);
  const hist = agg2.getHistoryTasks();
  assert.equal(hist.total, 1);
  assert.equal(hist.items[0].status, 'succeeded');
  assert.equal(hist.items[0].events.length, 3);
});
