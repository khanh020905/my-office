/**
 * Unit Tests for QA Independent Review & Quality Gate API (Phase 3).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { handleQaRoutes } from '../../server/orchestration/qa/qa-api.mjs';
import { createReviewEngine } from '../../server/orchestration/qa/review-engine.mjs';
import { createMasterOrchestrator } from '../../server/orchestration/engine/master-orchestrator.mjs';

function createMockHttp({ method = 'GET', url = '/', body = null, headers = {} } = {}) {
  const parsedUrl = new URL(url, 'http://127.0.0.1:3333');
  const req = {
    method,
    url,
    headers: { host: '127.0.0.1:3333', ...headers },
  };

  let responseStatus = null;
  let responseData = null;

  const res = {
    statusCode: null,
  };

  const json = (_res, status, payload) => {
    responseStatus = status;
    responseData = payload;
  };

  const readJson = async () => body || {};

  const isLoopback = () => true;
  const sameOriginOf = () => true;
  const authorized = () => true;

  return {
    req,
    res,
    url: parsedUrl,
    json,
    readJson,
    isLoopback,
    sameOriginOf,
    authorized,
    getResponse: () => ({ status: responseStatus, data: responseData }),
  };
}

test('QA Phase 3 API: Endpoint routes, gate evaluations, and risk acceptance', async (t) => {
  const qaEngine = createReviewEngine({ maxReviewIterations: 3 });
  const orchestrator = createMasterOrchestrator({
    controlManager: { dispatchTask: async () => ({ execution: { executionId: 'e-1' } }) },
    capabilityRegistry: { isOperationAllowed: () => ({ allowed: true }) },
    qaReviewEngine: qaEngine,
  });

  const masterTask = orchestrator.createMasterTask({
    title: 'API Test Master Task',
    subtasks: [{ subtaskId: 'st-1', title: 'Subtask 1', assignedProvider: 'claude-code', dependencies: [] }],
  });

  let createdReviewId = null;
  let createdFindingId = null;

  await t.test('POST /api/qa/reviews/evaluate triggers independent review and generates findings', async () => {
    const mock = createMockHttp({
      method: 'POST',
      url: '/api/qa/reviews/evaluate',
      body: {
        masterTaskId: masterTask.masterTaskId,
        subtaskId: 'st-1',
        implementationAgent: 'claude-code',
        testResults: { command: 'npm test', exitCode: 1, total: 4, passed: 3, failed: 1 },
      },
    });

    const handled = await handleQaRoutes(mock.req, mock.res, {
      url: mock.url,
      qaReviewEngine: qaEngine,
      masterOrchestrator: orchestrator,
      isLoopback: mock.isLoopback,
      sameOriginOf: mock.sameOriginOf,
      authorized: mock.authorized,
      readJson: mock.readJson,
      json: mock.json,
    });

    assert.strictEqual(handled, true);
    const resp = mock.getResponse();
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.data.ok, true);
    assert.ok(resp.data.review);
    assert.strictEqual(resp.data.review.isIndependent, true);
    assert.strictEqual(resp.data.findings.length >= 1, true);

    createdReviewId = resp.data.review.reviewId;
    createdFindingId = resp.data.findings[0].findingId;
  });

  await t.test('GET /api/qa/overview returns accurate metrics summary', async () => {
    const mock = createMockHttp({ method: 'GET', url: '/api/qa/overview' });

    await handleQaRoutes(mock.req, mock.res, {
      url: mock.url,
      qaReviewEngine: qaEngine,
      masterOrchestrator: orchestrator,
      isLoopback: mock.isLoopback,
      sameOriginOf: mock.sameOriginOf,
      authorized: mock.authorized,
      readJson: mock.readJson,
      json: mock.json,
    });

    const resp = mock.getResponse();
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.data.stats.totalReviews >= 1, true);
    assert.strictEqual(resp.data.stats.totalFindings >= 1, true);
  });

  await t.test('GET /api/qa/reviews/:id retrieves review with evidence and findings', async () => {
    const mock = createMockHttp({ method: 'GET', url: `/api/qa/reviews/${createdReviewId}` });

    await handleQaRoutes(mock.req, mock.res, {
      url: mock.url,
      qaReviewEngine: qaEngine,
      masterOrchestrator: orchestrator,
      isLoopback: mock.isLoopback,
      sameOriginOf: mock.sameOriginOf,
      authorized: mock.authorized,
      readJson: mock.readJson,
      json: mock.json,
    });

    const resp = mock.getResponse();
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.data.review.reviewId, createdReviewId);
    assert.ok(resp.data.review.evidence);
  });

  await t.test('GET /api/qa/gates/:masterTaskId returns accurate quality gate evaluations', async () => {
    const mock = createMockHttp({ method: 'GET', url: `/api/qa/gates/${masterTask.masterTaskId}` });

    await handleQaRoutes(mock.req, mock.res, {
      url: mock.url,
      qaReviewEngine: qaEngine,
      masterOrchestrator: orchestrator,
      isLoopback: mock.isLoopback,
      sameOriginOf: mock.sameOriginOf,
      authorized: mock.authorized,
      readJson: mock.readJson,
      json: mock.json,
    });

    const resp = mock.getResponse();
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.data.masterTaskId, masterTask.masterTaskId);
    assert.strictEqual(resp.data.evaluation.passed, false); // Blocked due to failing tests
  });

  await t.test('POST /api/qa/findings/:id/accept-risk allows authorized user risk waiver', async () => {
    const mock = createMockHttp({
      method: 'POST',
      url: `/api/qa/findings/${createdFindingId}/accept-risk`,
      body: {
        reason: 'Authorized waiver for transient test fixture failure',
        authorizedBy: 'qa-lead',
      },
    });

    await handleQaRoutes(mock.req, mock.res, {
      url: mock.url,
      qaReviewEngine: qaEngine,
      masterOrchestrator: orchestrator,
      isLoopback: mock.isLoopback,
      sameOriginOf: mock.sameOriginOf,
      authorized: mock.authorized,
      readJson: mock.readJson,
      json: mock.json,
    });

    const resp = mock.getResponse();
    assert.strictEqual(resp.status, 200);
    assert.strictEqual(resp.data.finding.status, 'accepted_risk');
  });

  await t.test('POST /api/qa/remediate creates structured remediation plan', async () => {
    // Create an open finding to remediate
    const newFinding = qaEngine.conductReview ? (await qaEngine.conductReview({
      masterTaskId: masterTask.masterTaskId,
      subtaskId: 'st-1',
      implementationAgent: 'claude-code',
      testResults: { command: 'npm test', exitCode: 1, total: 2, passed: 1, failed: 1 },
    })).findings[0] : null;

    const mock = createMockHttp({
      method: 'POST',
      url: '/api/qa/remediate',
      body: {
        masterTaskId: masterTask.masterTaskId,
        findingIds: [newFinding.findingId],
      },
    });

    await handleQaRoutes(mock.req, mock.res, {
      url: mock.url,
      qaReviewEngine: qaEngine,
      masterOrchestrator: orchestrator,
      isLoopback: mock.isLoopback,
      sameOriginOf: mock.sameOriginOf,
      authorized: mock.authorized,
      readJson: mock.readJson,
      json: mock.json,
    });

    const resp = mock.getResponse();
    assert.strictEqual(resp.status, 200);
    assert.ok(resp.data.plan.remediationSubtaskId);
    assert.strictEqual(resp.data.plan.targetFindings[0].status, 'fixing');
  });
});
