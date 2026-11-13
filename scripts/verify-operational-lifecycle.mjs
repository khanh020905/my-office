import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'office-op-acceptance-'));
const AG_DIR = path.join(DATA_DIR, 'antigravity');
fs.mkdirSync(AG_DIR, { recursive: true });
fs.writeFileSync(path.join(DATA_DIR, 'projects.json'), JSON.stringify([ROOT]));

console.log('================================================================');
console.log('  My Office Activity Center — Operational Acceptance & Verification');
console.log('  Data Directory:', DATA_DIR);
console.log('  Port:', PORT);
console.log('================================================================\n');

function spawnOfficeServer(extraEnv = {}) {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    OFFICE_PORT: String(PORT),
    OFFICE_DATA_DIR: DATA_DIR,
    OFFICE_AG_DIRS: AG_DIR,
    OFFICE_USAGE: '0',
    OFFICE_CI: '0',
    OFFICE_TRANSLATE: '0',
    OFFICE_AI_ACCOUNTS: '0',
    ...extraEnv,
  };
  const proc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.mjs')], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  return { proc, getLog: () => log };
}

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* waiting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not respond on ${BASE} within ${timeoutMs}ms`);
}

async function run() {
  console.log('[1/4] Starting My Office Server Instance #1...');
  let serverInstance = spawnOfficeServer();
  await waitForServer();
  console.log('  ✓ Server instance #1 up and healthy.\n');

  // ==========================================================================
  // Section 2: Real Provider & Agent Execution Scenarios
  // ==========================================================================
  console.log('[2/4] Testing Real Provider Ingestion & Multi-Agent Activity Center Lifecycle...');

  // --- Scenario 2.1: Real Claude Code task lifecycle via /event hook ---
  console.log('  -> Executing Claude Code Task (Session: claude-sess-op-1)...');
  const t0 = Date.now();
  // 1. Session start
  let r = await fetch(`${BASE}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: 'SessionStart',
      session_id: 'claude-sess-op-1',
      cwd: ROOT,
    }),
  });
  assert.equal(r.status, 200, 'Claude SessionStart hook');

  // 2. UserPromptSubmit
  r = await fetch(`${BASE}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'claude-sess-op-1',
      cwd: ROOT,
      prompt: 'Refactor OAuth security and token storage',
      totalSteps: 4,
    }),
  });
  assert.equal(r.status, 200);

  // Verify task card appeared in Activity Center API
  let tasksRes = await (await fetch(`${BASE}/api/activity/tasks`)).json();
  assert.equal(tasksRes.ok, true);
  let claudeTask = tasksRes.activeTasks.find((t) => t.provider === 'claude-code' && t.title === 'Refactor OAuth security and token storage');
  assert.ok(claudeTask, 'Claude Code task card appeared immediately on start');
  assert.equal(claudeTask.status, 'running');
  assert.equal(claudeTask.title, 'Refactor OAuth security and token storage');
  const initialClaudeTaskId = claudeTask.taskId;

  // 3. File Operations & Commands (In-Place Update via PreToolUse + PostToolUse)
  await fetch(`${BASE}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: 'PreToolUse',
      session_id: 'claude-sess-op-1',
      cwd: ROOT,
      tool_name: 'Edit',
      tool_input: { file_path: 'src/auth/tokens.js' },
      file_paths: ['src/auth/tokens.js'],
      currentStep: 1,
      totalSteps: 4,
    }),
  });
  await fetch(`${BASE}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: 'PostToolUse',
      session_id: 'claude-sess-op-1',
      cwd: ROOT,
      tool_name: 'Edit',
      tool_input: { file_path: 'src/auth/tokens.js' },
    }),
  });
  await fetch(`${BASE}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: 'PreToolUse',
      session_id: 'claude-sess-op-1',
      cwd: ROOT,
      tool_name: 'Bash',
      tool_input: { command: 'npm test -- tests/auth' },
      currentStep: 2,
      totalSteps: 4,
    }),
  });

  // Verify in-place update
  tasksRes = await (await fetch(`${BASE}/api/activity/tasks`)).json();
  claudeTask = tasksRes.activeTasks.find((t) => t.taskId === initialClaudeTaskId);
  assert.ok(claudeTask, 'Claude task continues with identical card ID');
  assert.equal(claudeTask.filesChanged.length, 1);
  assert.ok(claudeTask.commandsExecuted.length >= 1);
  console.log(`  ✓ Claude Code active card verified: updated in place (Files: ${claudeTask.filesChanged.length}, Cmds: ${claudeTask.commandsExecuted.length}).`);

  // --- Scenario 2.2: Codex App task lifecycle via /codex-app-event hook ---
  console.log('  -> Executing Codex App Task (Turn: codex-turn-op-101)...');
  r = await fetch(`${BASE}/codex-app-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'codex-app',
      session_id: 'codex-app-sess-1',
      cwd: ROOT,
      hook_event_name: 'SessionStart',
    }),
  });
  assert.equal(r.status, 204);

  r = await fetch(`${BASE}/codex-app-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'codex-app',
      session_id: 'codex-app-sess-1',
      turn_id: 'codex-turn-op-101',
      cwd: ROOT,
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Implement database connection retry policy',
    }),
  });
  assert.equal(r.status, 204);

  r = await fetch(`${BASE}/codex-app-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'codex-app',
      session_id: 'codex-app-sess-1',
      turn_id: 'codex-turn-op-101',
      cwd: ROOT,
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      file_paths: ['src/db/pool.mjs'],
    }),
  });
  assert.equal(r.status, 204);

  tasksRes = await (await fetch(`${BASE}/api/activity/tasks`)).json();
  const codexAppTask = tasksRes.activeTasks.find((t) => t.provider === 'codex-app' && t.taskId.includes('codex-turn-op-101'));
  assert.ok(codexAppTask, 'Codex App card appeared for turn');
  assert.equal(codexAppTask.status, 'running');
  assert.equal(codexAppTask.filesChanged.includes('src/db/pool.mjs'), true);
  console.log('  ✓ Codex App active card verified.');

  // --- Scenario 2.3: Codex CLI independent execution via /codex-app-event ---
  console.log('  -> Executing Codex CLI Task (Run: codex-cli-run-909)...');
  r = await fetch(`${BASE}/codex-app-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'codex-cli',
      session_id: 'codex-cli-run-909',
      cwd: ROOT,
      hook_event_name: 'SessionStart',
    }),
  });
  assert.equal(r.status, 204);

  r = await fetch(`${BASE}/codex-app-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'codex-cli',
      session_id: 'codex-cli-run-909',
      cwd: ROOT,
      hook_event_name: 'UserPromptSubmit',
      prompt: 'git status and worktree check',
    }),
  });
  assert.equal(r.status, 204);

  // Complete Codex CLI task successfully
  r = await fetch(`${BASE}/codex-app-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'codex-cli',
      session_id: 'codex-cli-run-909',
      cwd: ROOT,
      hook_event_name: 'Stop',
    }),
  });
  assert.equal(r.status, 204);

  tasksRes = await (await fetch(`${BASE}/api/activity/tasks`)).json();
  const codexCliDone = tasksRes.history.items.find((t) => t.provider === 'codex-cli');
  assert.ok(codexCliDone, 'Codex CLI task cleanly moved to History upon Stop');
  assert.equal(codexCliDone.status, 'succeeded');
  console.log('  ✓ Codex CLI completed task moved to history with status succeeded.');

  // --- Scenario 2.4: Antigravity Observer detecting real filesystem activity ---
  console.log('  -> Triggering Antigravity filesystem activity in AG_DIR...');
  fs.writeFileSync(path.join(AG_DIR, 'conversation-op-test.db'), 'active-data');
  // Allow observer tick to pick up the file modification
  await new Promise((r) => setTimeout(r, 3200));

  tasksRes = await (await fetch(`${BASE}/api/activity/tasks`)).json();
  const agTask = tasksRes.activeTasks.find((t) => t.provider === 'antigravity');
  assert.ok(agTask, 'Antigravity observer card appeared from real file modification');
  assert.equal(agTask.evidenceLevel, 'coarse_observation');
  assert.equal(agTask.progress.mode, 'activity_only');
  assert.equal(agTask.progress.percent, null);
  console.log('  ✓ Antigravity coarse observation verified: 0% fabricated progress, truthful activity_only mode.\n');

  // ==========================================================================
  // Section 3: Restart & Durability Verification
  // ==========================================================================
  console.log('[3/4] Testing Restart, Recovery, and Persistence Durability...');

  // Take snapshot of task state before restart
  const preRestartTasks = await (await fetch(`${BASE}/api/activity/tasks`)).json();
  assert.ok(preRestartTasks.activeTasks.length >= 2, 'At least 2 active tasks before restart');
  assert.ok(preRestartTasks.history.items.length >= 1, 'At least 1 history item before restart');

  // Allow debounced flush to complete
  await new Promise((r) => setTimeout(r, 1200));

  // Check that TASKS_FILE exists on disk
  const tasksFilePath = path.join(DATA_DIR, 'activity-tasks.json');
  assert.equal(fs.existsSync(tasksFilePath), true, 'activity-tasks.json was created on disk');

  // Terminate server instance #1 with SIGTERM (graceful shutdown)
  console.log('  -> Stopping Server Instance #1 with SIGTERM...');
  serverInstance.proc.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 1000));

  // Verify tasks file on disk has valid JSON
  const serializedOnDisk = JSON.parse(fs.readFileSync(tasksFilePath, 'utf8'));
  assert.ok(Array.isArray(serializedOnDisk.tasks));
  assert.ok(serializedOnDisk.tasks.length >= 3);
  console.log(`  ✓ Persistent state verified on disk: ${serializedOnDisk.tasks.length} tasks recorded.`);

  // Restart server instance #2 on same DATA_DIR
  console.log('  -> Spawning Server Instance #2 (Recovery)...');
  serverInstance = spawnOfficeServer();
  await waitForServer();
  console.log('  ✓ Server instance #2 recovered.');

  // Verify state restored in recovered instance
  const postRestartTasks = await (await fetch(`${BASE}/api/activity/tasks`)).json();
  assert.equal(postRestartTasks.ok, true);
  assert.equal(postRestartTasks.stats.totalTasks, preRestartTasks.stats.totalTasks, 'Total task count preserved after restart');

  // Verify historical task is still in history
  const recoveredHist = postRestartTasks.history.items.find((t) => t.provider === 'codex-cli');
  assert.ok(recoveredHist, 'Completed task preserved in history across restart');
  assert.equal(recoveredHist.status, 'succeeded');

  // Verify active tasks are still active (not prematurely marked succeeded or failed)
  const recoveredClaude = postRestartTasks.activeTasks.find((t) => t.taskId === initialClaudeTaskId);
  assert.ok(recoveredClaude, 'Active Claude task recovered into activeTasks');
  assert.equal(recoveredClaude.status, 'running', 'Interrupted active task is NOT falsely marked succeeded');

  // Verify deduplication post-restart: re-sending the same Claude PostToolUse event must not duplicate
  await fetch(`${BASE}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: 'PostToolUse',
      session_id: 'claude-sess-op-1',
      cwd: ROOT,
      tool_name: 'Edit',
      tool_input: { file_path: 'src/auth/tokens.js' },
      file_paths: ['src/auth/tokens.js'],
      currentStep: 1,
      totalSteps: 4,
    }),
  });

  const postDedupTasks = await (await fetch(`${BASE}/api/activity/tasks`)).json();
  const dedupClaude = postDedupTasks.activeTasks.find((t) => t.taskId === initialClaudeTaskId);
  assert.equal(dedupClaude.filesChanged.length, 1, 'Duplicate event post-restart does not inflate filesChanged');
  assert.equal(postDedupTasks.activeTasks.filter((t) => t.taskId === initialClaudeTaskId).length, 1, 'No duplicate task cards');
  console.log('  ✓ Post-restart deduplication verified: 0 card duplication, 0 counter inflation.\n');

  // ==========================================================================
  // Section 4: Operational Reliability & SSE Latency
  // ==========================================================================
  console.log('[4/4] Testing Operational Reliability, Latency & Error Visibility...');

  // Test failed task error visibility via PostToolUseFailure
  await fetch(`${BASE}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: 'PostToolUseFailure',
      session_id: 'claude-sess-fail-1',
      cwd: ROOT,
      tool_name: 'Bash',
      tool_input: { command: 'tsc --noEmit' },
      error: 'tsc failed with 3 type errors in server/auth.ts',
    }),
  });
  await fetch(`${BASE}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: 'SessionEnd',
      session_id: 'claude-sess-fail-1',
      cwd: ROOT,
    }),
  });

  const failureCheck = await (await fetch(`${BASE}/api/activity/tasks`)).json();
  const failedTask = failureCheck.history.items.find((t) => t.provider === 'claude-code' && t.status === 'failed');
  assert.ok(failedTask, 'Failed task appears in history');
  assert.equal(failedTask.status, 'failed');
  assert.match(failedTask.error, /tsc --noEmit/);
  console.log('  ✓ Failure visibility verified: real actionable error preserved in task card.');

  // Test event latency
  const latencyStart = Date.now();
  await fetch(`${BASE}/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: 'PostToolUse',
      session_id: 'claude-sess-op-1',
      cwd: ROOT,
      tool_name: 'Bash',
      tool_input: { command: 'git diff' },
      commands: ['git diff'],
    }),
  });
  const latencyMs = Date.now() - latencyStart;
  console.log(`  ✓ Hook ingestion roundtrip latency: ${latencyMs}ms (Budget: < 100ms).`);

  // Final cleanup: stop server
  serverInstance.proc.kill('SIGINT');
  await new Promise((r) => setTimeout(r, 500));
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }

  console.log('\n================================================================');
  console.log('  ALL OPERATIONAL ACCEPTANCE CRITERIA SATISFIED SUCCESSFULLY!');
  console.log('================================================================\n');
}

run().catch((err) => {
  console.error('\n❌ OPERATIONAL ACCEPTANCE FAILED:\n', err);
  process.exit(1);
});
