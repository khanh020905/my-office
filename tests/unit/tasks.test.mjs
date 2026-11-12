import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTasks } from '../../server/tasks.mjs';

test('workflow Claude start and completion expose durable run correlation fields', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'office-claude-run-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const started = [], done = [];
  let finish;
  const tasks = createTasks({ dataDir: dir, claude: () => ({ file: 'claude' }), env: () => ({}), bg: { want: () => true },
    spawnProcess: () => {
      const proc = new EventEmitter(); proc.pid = 4123; proc.stdout = new PassThrough(); proc.stderr = new PassThrough();
      finish = () => {
        proc.stdout.write(`${JSON.stringify({ type: 'system', subtype: 'init', session_id: 'session-1' })}\n`);
        proc.stdout.write(`${JSON.stringify({ type: 'result', result: 'tests passed' })}\n`);
        proc.stdout.end(); proc.stderr.end(); proc.emit('exit', 0, null);
      };
      return proc;
    },
    onStart: (task) => started.push(task), onDone: (task) => done.push(task),
  });
  const result = tasks.start({ dir, text: 'run task', workflowId: 'workflow-1', workflowTaskId: 'frontend', dispatchId: 'claim-1',
    worktreePath: 'C:/tmp/claude-worktree', repoRoot: 'C:/tmp/project', branch: 'myoffice/frontend' });
  assert.equal(result.ok, true);
  assert.equal(result.task.mode, 'print');
  assert.equal(started.length, 1);
  assert.equal(started[0].dispatchId, 'claim-1');
  assert.equal(started[0].workflowTaskId, 'frontend');
  assert.equal(started[0].pid, 4123);
  assert.equal(started[0].worktreePath, 'C:/tmp/claude-worktree');
  assert.equal(started[0].repoRoot, 'C:/tmp/project');
  assert.equal(started[0].branch, 'myoffice/frontend');
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(done.length, 1);
  assert.equal(done[0].id, result.task.id);
  assert.equal(done[0].exitCode, 0);
  assert.equal(done[0].result, 'tests passed');
  assert.ok(done[0].startedAt > 0);
  assert.ok(done[0].endedAt >= done[0].startedAt);
});
