import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTaskAggregator } from '../../src/shared/task-aggregator.js';

test('Phase 2 — Scenario A: One Claude Code task aggregates multiple edits & commands into 1 card', () => {
  const aggregator = createTaskAggregator();
  const sess = 'claude-sess-alpha';

  // 1. Task prompt
  aggregator.ingest({
    id: 1,
    sess,
    provider: 'claude-code',
    type: 'prompt',
    label: 'Refactor database indexing',
    ts: 1000,
  });

  // 2. Multiple file reads and edits
  for (let i = 1; i <= 5; i++) {
    aggregator.ingest({
      id: 10 + i,
      sess,
      provider: 'claude-code',
      type: 'edit',
      label: `src/db/table-${i}.sql`,
      path: `src/db/table-${i}.sql`,
      ts: 1010 + i,
    });
  }

  // 3. Multiple commands executed
  aggregator.ingest({
    id: 20,
    sess,
    provider: 'claude-code',
    type: 'bash',
    command: 'npm run lint',
    label: 'npm run lint',
    ts: 1030,
  });
  aggregator.ingest({
    id: 21,
    sess,
    provider: 'claude-code',
    type: 'bash',
    command: 'npm test',
    label: 'npm test',
    ts: 1040,
  });

  const active = aggregator.getActiveTasks();
  assert.equal(active.length, 1, 'Exactly one task card must represent this Claude Code task');
  const card = active[0];
  assert.equal(card.eventCount, 8); // 1 prompt + 5 edits + 2 commands
  assert.equal(card.filesChanged.length, 5);
  assert.equal(card.commandsExecuted.length, 2);
  assert.equal(card.currentPhase, 'Executing');
  assert.equal(card.progress.mode, 'phase');
  assert.equal(card.progress.percent, null, 'Do not fabricate arbitrary percentage for phase-based tracking');
});

test('Phase 2 — Scenario B: One Codex App task updates card in place within same turn', () => {
  const aggregator = createTaskAggregator();
  const sessionId = 'codex-sess-42';
  const turnId = 'turn-1001';

  // Turn prompt
  const task1 = aggregator.ingest({
    id: 301,
    sess: sessionId,
    sessionId,
    turnId,
    provider: 'codex-app',
    type: 'codex_prompt',
    label: 'Analyze performance bottlenecks',
    ts: 2000,
  });

  const initialTaskId = task1.taskId;
  assert.ok(initialTaskId.includes('turn-1001'));

  // Event 2 in same turn
  const task2 = aggregator.ingest({
    id: 302,
    sess: sessionId,
    sessionId,
    turnId,
    provider: 'codex-app',
    type: 'read',
    label: 'server/perf.mjs',
    path: 'server/perf.mjs',
    ts: 2010,
  });

  // Event 3 in same turn
  const task3 = aggregator.ingest({
    id: 303,
    sess: sessionId,
    sessionId,
    turnId,
    provider: 'codex-app',
    type: 'edit',
    label: 'server/perf.mjs',
    path: 'server/perf.mjs',
    ts: 2020,
  });

  const active = aggregator.getActiveTasks();
  assert.equal(active.length, 1, 'One task card must update in place for the turn');
  assert.equal(active[0].taskId, initialTaskId, 'Card ID remains identical across turn events');
  assert.equal(active[0].eventCount, 3);
  assert.equal(active[0].filesChanged.length, 1);
});

test('Phase 2 — Scenario C: Two independent Codex CLI runs produce two separate cards', () => {
  const aggregator = createTaskAggregator();

  // Run 1
  aggregator.ingest({
    id: 401,
    sess: 'codex:run-cli-001',
    codexRun: 'run-cli-001',
    provider: 'codex-cli',
    type: 'bash',
    command: 'pytest tests/api',
    label: 'Run API tests',
    ts: 3000,
  });

  // Run 2
  aggregator.ingest({
    id: 402,
    sess: 'codex:run-cli-002',
    codexRun: 'run-cli-002',
    provider: 'codex-cli',
    type: 'bash',
    command: 'pytest tests/e2e',
    label: 'Run E2E tests',
    ts: 3005,
  });

  const active = aggregator.getActiveTasks();
  assert.equal(active.length, 2, 'Two separate CLI runs must produce two distinct cards');
  const ids = active.map((t) => t.taskId);
  assert.ok(ids.includes('codex-cli:run-cli-001'));
  assert.ok(ids.includes('codex-cli:run-cli-002'));
});

test('Phase 2 — Scenario D: Antigravity observer coarse observations do not fabricate progress', () => {
  const aggregator = createTaskAggregator();
  const now = Date.now();

  aggregator.ingest({
    id: 501,
    sess: 'antigravity:watch-workspace',
    provider: 'antigravity',
    type: 'antigravity_observed',
    label: 'Files changed in workspace',
    ts: now,
  });

  const active = aggregator.getActiveTasks(now + 100);
  assert.equal(active.length, 1);
  const task = active[0];
  assert.equal(task.evidenceLevel, 'coarse_observation');
  assert.equal(task.progress.mode, 'activity_only');
  assert.equal(task.progress.percent, null, 'Must never fabricate percentage for coarse observation');
  assert.equal(task.filesChanged.length, 0, 'No fake file paths if detailed events unavailable');
  assert.equal(task.status, 'unknown');
});

test('Phase 2 — Scenario E: Concurrent multi-agent execution maintains strict isolation and counters', () => {
  const aggregator = createTaskAggregator();
  const now = Date.now();

  // 1. Claude Code
  aggregator.ingest({ id: 601, sess: 'claude-sess-multi', provider: 'claude-code', type: 'prompt', label: 'Claude task', ts: now });
  aggregator.ingest({ id: 602, sess: 'claude-sess-multi', provider: 'claude-code', type: 'edit', label: 'claude.js', path: 'claude.js', ts: now + 5 });

  // 2. Codex App
  aggregator.ingest({ id: 603, sess: 'codex-app-multi', turnId: 'turn-99', provider: 'codex-app', type: 'codex_prompt', label: 'Codex app task', ts: now + 10 });
  aggregator.ingest({ id: 604, sess: 'codex-app-multi', turnId: 'turn-99', provider: 'codex-app', type: 'bash', command: 'echo 1', label: 'echo 1', ts: now + 15 });

  // 3. Codex CLI
  aggregator.ingest({ id: 605, sess: 'codex:cli-run-99', codexRun: 'cli-run-99', provider: 'codex-cli', type: 'bash', command: 'git diff', label: 'git diff', ts: now + 20 });

  // 4. Antigravity
  aggregator.ingest({ id: 606, sess: 'antigravity:obs-multi', provider: 'antigravity', type: 'antigravity_observed', label: 'Observed workspace', ts: now + 25 });

  const active = aggregator.getActiveTasks(now + 30);
  assert.equal(active.length, 4, 'Four distinct active cards for 4 concurrent providers');

  const stats = aggregator.getStats(now + 30);
  assert.equal(stats.active, 4);
  assert.equal(stats.totalTasks, 4);
});

test('Phase 3 Progress Accuracy: quantitative, phase-based, and activity-only distinction', () => {
  const aggregator = createTaskAggregator();

  // 1. Quantitative progress with verified step count
  aggregator.ingest({
    id: 701,
    sess: 's-steps',
    provider: 'claude-code',
    type: 'prompt',
    label: 'Quantitative plan',
    currentStep: 3,
    totalSteps: 6,
    ts: 6000,
  });

  const qTask = aggregator.getActiveTasks().find((t) => t.title === 'Quantitative plan');
  assert.equal(qTask.progress.mode, 'quantitative');
  assert.equal(qTask.progress.percent, 50);
  assert.equal(qTask.progress.label, '3/6 (50%)');

  // 2. Phase-based: transitions appropriately without inventing percentages
  aggregator.ingest({
    id: 702,
    sess: 's-phase',
    provider: 'claude-code',
    type: 'prompt',
    label: 'Phase migration',
    ts: 6010,
  });
  let pTask = aggregator.getActiveTasks().find((t) => t.title === 'Phase migration');
  assert.equal(pTask.progress.mode, 'phase');
  assert.equal(pTask.currentPhase, 'Planning');
  assert.equal(pTask.progress.percent, null);

  aggregator.ingest({
    id: 703,
    sess: 's-phase',
    provider: 'claude-code',
    type: 'edit',
    label: 'file.js',
    path: 'file.js',
    ts: 6020,
  });
  pTask = aggregator.getActiveTasks().find((t) => t.title === 'Phase migration');
  assert.equal(pTask.currentPhase, 'Editing');

  aggregator.ingest({
    id: 704,
    sess: 's-phase',
    provider: 'claude-code',
    type: 'bash',
    command: 'npm test',
    label: 'npm test',
    ts: 6030,
  });
  pTask = aggregator.getActiveTasks().find((t) => t.title === 'Phase migration');
  assert.equal(pTask.currentPhase, 'Executing');

  // 3. Stale detection does not mark task as failed
  const staleThreshold = 1000;
  const staleAggregator = createTaskAggregator({ staleMs: staleThreshold });
  staleAggregator.ingest({
    id: 710,
    sess: 's-stale',
    provider: 'claude-code',
    type: 'prompt',
    label: 'Stale task',
    ts: 10000,
  });

  // Check at 10000 + 500 (active)
  assert.equal(staleAggregator.getActiveTasks(10500)[0].status, 'running');

  // Check at 10000 + 2000 (stale)
  const staleActive = staleAggregator.getActiveTasks(12000);
  assert.equal(staleActive.length, 1);
  assert.equal(staleActive[0].status, 'stale', 'Task becomes stale, NEVER prematurely failed');
  assert.equal(staleActive[0].error, null, 'Stale task should not report false failure error');

  // Recover from stale when new event arrives
  staleAggregator.ingest({
    id: 711,
    sess: 's-stale',
    provider: 'claude-code',
    type: 'edit',
    label: 'src/fix.js',
    path: 'src/fix.js',
    ts: 13000,
  });
  const recovered = staleAggregator.getActiveTasks(13000);
  assert.equal(recovered[0].status, 'running', 'Task resumes running upon new activity');

  // 4. Lifecycle completion requires explicit evidence
  staleAggregator.ingest({
    id: 712,
    sess: 's-stale',
    provider: 'claude-code',
    type: 'stop',
    label: 'Successfully finished',
    ts: 14000,
  });
  assert.equal(staleAggregator.getActiveTasks(14000).length, 0);
  const hist = staleAggregator.getHistoryTasks({ now: 14000 });
  assert.equal(hist.items[0].status, 'succeeded');
  assert.equal(hist.items[0].result, 'Successfully finished');
});
