import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandoffEngine } from '../../server/orchestration/engine/handoff-engine.mjs';

test('Handoff Engine: Context propagation, secret redaction & master consolidation', async (t) => {
  const handoffEngine = createHandoffEngine();

  await t.test('Creates handoff record with file changes and decisions', () => {
    const record = handoffEngine.createHandoffRecord({
      subtaskId: 'subtask-auth',
      masterTaskId: 'mt-100',
      provider: 'claude-code',
      agentId: 'claude-code',
      summary: 'Refactored OAuth tokens',
      filesChanged: ['src/auth/token.js', 'src/auth/session.js'],
      decisions: ['Use HMAC-SHA256 for token signature'],
      testResults: { passed: 12, failed: 0 },
    });

    assert.equal(record.subtaskId, 'subtask-auth');
    assert.equal(record.filesChanged.length, 2);
    assert.deepEqual(record.decisions, ['Use HMAC-SHA256 for token signature']);
    assert.equal(record.testResults.passed, 12);
  });

  await t.test('Enriches downstream subtask prompt with upstream handoff context', () => {
    const upstreamHandoff = handoffEngine.createHandoffRecord({
      subtaskId: 'subtask-1',
      masterTaskId: 'mt-100',
      provider: 'claude-code',
      summary: 'Added database schema for user profiles',
      filesChanged: ['db/migrations/001_users.sql'],
      decisions: ['User profile requires uuid primary key'],
    });

    const handoffMap = new Map([['subtask-1', upstreamHandoff]]);

    const downstreamSubtask = {
      subtaskId: 'subtask-2',
      dependencies: ['subtask-1'],
      instruction: 'Implement user profile REST API endpoints',
    };

    const { instruction, upstreamContext } = handoffEngine.assembleDownstreamContext(downstreamSubtask, handoffMap);
    assert.match(instruction, /Implement user profile REST API endpoints/);
    assert.match(instruction, /=== CONTEXT FROM UPSTREAM DEPENDENCIES ===/);
    assert.match(instruction, /db\/migrations\/001_users\.sql/);
    assert.match(instruction, /User profile requires uuid primary key/);
    assert.ok(upstreamContext.length > 0);
  });

  await t.test('Consolidates master task results across multiple subtasks', () => {
    const masterTask = {
      masterTaskId: 'mt-100',
      title: 'Full Stack Authentication & Database Overhaul',
      status: 'succeeded',
      subtasks: [{ subtaskId: 's1' }, { subtaskId: 's2' }],
    };

    const h1 = handoffEngine.createHandoffRecord({
      subtaskId: 's1',
      masterTaskId: 'mt-100',
      provider: 'codex-cli',
      summary: 'Database migration complete',
      filesChanged: ['db/schema.sql'],
      decisions: ['Added indices on auth_tokens'],
    });

    const h2 = handoffEngine.createHandoffRecord({
      subtaskId: 's2',
      masterTaskId: 'mt-100',
      provider: 'claude-code',
      summary: 'Authentication service complete',
      filesChanged: ['src/auth/service.js', 'db/schema.sql'],
      decisions: ['Token expiration set to 3600s'],
    });

    const consolidated = handoffEngine.consolidateMasterResult(masterTask, [h1, h2]);
    assert.equal(consolidated.completedSubtasks, 2);
    assert.equal(consolidated.consolidatedFiles.length, 2); // 'db/schema.sql' deduplicated
    assert.equal(consolidated.consolidatedDecisions.length, 2);
    assert.equal(consolidated.subtaskSummaries.length, 2);
  });
});

