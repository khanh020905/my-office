#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createCodexRuns } from '../server/codex-runs.mjs';
import { createWorkflows } from '../server/workflows.mjs';

const exec = promisify(execFile), expected = 'MY OFFICE CODEX WRITE VERIFIED';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'my-office-codex-acceptance-'));
const repo = path.join(root, 'repo'), dataDir = path.join(root, 'data'), worktreeRoot = path.join(root, 'worktrees');
const exe = process.platform === 'win32' ? 'codex.exe' : 'codex';
let bin = '';
for (const candidate of [process.env.OFFICE_CODEX_BIN, ...process.env.PATH.split(path.delimiter).map((dir) => path.join(dir, exe))].filter(Boolean)) {
  try { if ((await fs.stat(candidate)).isFile()) { bin = candidate; break; } } catch { /* continue to the next CLI location */ }
}

assert.ok(bin, `Codex executable ${exe} was not found on PATH or in OFFICE_CODEX_BIN`);
const originalStatus = (await exec('git', ['status', '--porcelain'], { cwd: process.cwd() })).stdout;
await fs.mkdir(repo, { recursive: true });
await exec('git', ['init', '-q'], { cwd: repo });
await exec('git', ['-c', 'user.name=My Office Acceptance', '-c', 'user.email=my-office@example.invalid', 'commit', '--allow-empty', '-m', 'acceptance baseline', '-q'], { cwd: repo });

let workflows;
const runner = createCodexRuns({ bin, dataDir, worktreeRoot, timeoutMs: 120_000, onChange: (run) => workflows?.providerChanged(run) });
workflows = createWorkflows({ file: path.join(dataDir, 'workflows.json'), dispatch: async (_w, task) => {
  const result = await runner.start({ dir: task.workingDirectory, text: task.description, workflowId: _w.id, taskId: task.id, expectedArtifacts: task.expectedArtifacts });
  return result.ok ? { ok: true, runId: result.run.id, worktreePath: result.run.worktreePath, repoRoot: result.run.repoRoot, branch: result.run.branch } : result;
} });
const prompt = 'Create a file named CODEX_WRITE_ACCEPTANCE.txt in the current working directory. Write the exact text: MY OFFICE CODEX WRITE VERIFIED';
const created = workflows.create({ name: 'Codex write acceptance', tasks: [{ id: 'write', title: 'Write acceptance artifact', description: prompt,
  provider: 'codex-cli', workingDirectory: repo, expectedArtifacts: ['CODEX_WRITE_ACCEPTANCE.txt'] }] });
assert.equal(created.ok, true, JSON.stringify(created));
workflows.start(created.workflow.id);

let task = workflows.get(created.workflow.id).tasks[0];
for (let i = 0; i < 240 && !task.completedAt; i++) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  task = workflows.get(created.workflow.id).tasks[0];
}
runner.flush(); workflows.persist();
assert.ok(task.completedAt, `Codex workflow did not finish: ${JSON.stringify(task)}`);
const run = runner.get(task.runId);

const file = path.join(run.workingDirectory, 'CODEX_WRITE_ACCEPTANCE.txt');
const actual = await fs.readFile(file, 'utf8').catch(() => null);
if (actual !== expected) {
  console.error(JSON.stringify({ run, actual, root }, null, 2));
  throw new Error('Codex did not create the expected artifact contents. Evidence worktree was retained.');
}
await exec('git', ['add', '-N', 'CODEX_WRITE_ACCEPTANCE.txt'], { cwd: run.worktreePath });
const diff = (await exec('git', ['diff', '--', 'CODEX_WRITE_ACCEPTANCE.txt'], { cwd: run.worktreePath })).stdout;
const status = (await exec('git', ['status', '--short'], { cwd: run.worktreePath })).stdout.trim();
const stored = JSON.parse(await fs.readFile(path.join(dataDir, 'codex-runs.json'), 'utf8')).runs.find((r) => r.id === run.id);
const storedWorkflow = JSON.parse(await fs.readFile(path.join(dataDir, 'workflows.json'), 'utf8')).workflows.find((w) => w.id === created.workflow.id);
const finalMainStatus = (await exec('git', ['status', '--porcelain'], { cwd: process.cwd() })).stdout;

assert.equal(run.taskStatus, 'success');
assert.equal(run.processStatus, 'completed');
assert.equal(run.exitCode, 0);
assert.deepEqual(run.artifactChanges, ['CODEX_WRITE_ACCEPTANCE.txt']);
assert.deepEqual(run.changedFiles, ['CODEX_WRITE_ACCEPTANCE.txt']);
assert.ok(diff.includes(`+${expected}`), 'Git diff should contain the exact new file text');
assert.equal(stored.taskStatus, 'success');
assert.equal(stored.exitCode, 0);
assert.equal(task.status, 'completed');
assert.equal(storedWorkflow.tasks[0].status, 'completed');
assert.equal(finalMainStatus, originalStatus, 'Acceptance task must not change the main checkout');
console.log(JSON.stringify({ command: [bin, 'exec', '--json', '--sandbox', 'workspace-write', '--cd', run.workingDirectory, prompt],
  cwd: run.workingDirectory, worktreePath: run.worktreePath, sandbox: 'workspace-write', file, contents: actual,
  workflowId: created.workflow.id, workflowTaskStatus: storedWorkflow.tasks[0].status, processStatus: run.processStatus, taskStatus: run.taskStatus, artifactChanges: run.artifactChanges, exitCode: run.exitCode, status, diff, persistedRunId: stored.id,
  mainCheckoutUnchanged: true, evidenceRoot: root }, null, 2));
runner.dispose();
