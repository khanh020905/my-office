/**
 * Unit Tests: QA Independent Review Engine, Evidence Collection & Quality Gates (Phase 3).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createEvidenceCollector } from '../../server/orchestration/qa/evidence-collector.mjs';
import { createQualityGateEngine } from '../../server/orchestration/qa/quality-gate-engine.mjs';
import { createReviewEngine } from '../../server/orchestration/qa/review-engine.mjs';

test('QA Phase 3: Evidence Collector faithfully records metrics and detects vulnerabilities', async (t) => {
  const collector = createEvidenceCollector({ rootDir: process.cwd() });

  await t.test('Secret exposure audit detects API tokens and credentials in execution text', () => {
    const textWithSecret = 'Configured client with token: sk-ant-api03-abcdef1234567890123456 and password: "SecretPassword123!"';
    const secrets = collector.inspectForSecrets(textWithSecret);
    assert.strictEqual(secrets.length >= 1, true);
    assert.strictEqual(secrets[0].sample.includes('***'), true); // Redacted sample
  });

  await t.test('Path safety detects directory traversal beyond root', () => {
    const violations = collector.inspectPathSafety(['../../etc/passwd', 'src/safe.js'], process.cwd());
    assert.strictEqual(violations.length, 1);
    assert.strictEqual(violations[0].path, '../../etc/passwd');
  });

  await t.test('Normalizes missing tests as not_run without fabricating passed metrics', () => {
    const norm = collector.normalizeTestResults(null);
    assert.strictEqual(norm.status, 'not_run');
    assert.strictEqual(norm.passed, 0);
    assert.strictEqual(norm.failed, 0);
  });

  await t.test('Normalizes failing test results with non-zero exit code accurately', () => {
    const norm = collector.normalizeTestResults({
      command: 'npm test',
      exitCode: 1,
      total: 10,
      passed: 8,
      failed: 2,
    });
    assert.strictEqual(norm.status, 'failed');
    assert.strictEqual(norm.failed, 2);
    assert.strictEqual(norm.passed, 8);
  });
});

test('QA Phase 3: Quality Gate Engine accurately evaluates gates and blocks failure states', async (t) => {
  const gateEngine = createQualityGateEngine({
    policy: {
      mandatoryGates: ['functional', 'staticQuality', 'security', 'requirementCoverage'],
    },
  });

  await t.test('Fails Functional Gate when tests are not run and functional gate is mandatory', () => {
    const res = gateEngine.evaluateGates({
      masterTask: { subtasks: [{ subtaskId: 'st-1', status: 'succeeded' }] },
      evidenceList: [{ functional: { status: 'not_run' } }],
      findings: [],
    });
    assert.strictEqual(res.passed, false);
    assert.strictEqual(res.gates.functional.status, 'failed');
    assert.strictEqual(res.blockers.some((b) => b.includes('Functional Verification Gate failed')), true);
  });

  await t.test('Fails Static Quality Gate when TypeScript error count > 0', () => {
    const res = gateEngine.evaluateGates({
      masterTask: { subtasks: [{ subtaskId: 'st-1', status: 'succeeded' }] },
      evidenceList: [{
        functional: { status: 'passed', passed: 5, failed: 0 },
        staticQuality: {
          typecheck: { status: 'failed', errorCount: 2 },
          lint: { status: 'passed', errorCount: 0, warningCount: 0 },
        },
      }],
      findings: [],
    });
    assert.strictEqual(res.passed, false);
    assert.strictEqual(res.gates.staticQuality.status, 'failed');
  });

  await t.test('Fails Security Gate when unresolved critical security finding exists', () => {
    const res = gateEngine.evaluateGates({
      masterTask: { subtasks: [{ subtaskId: 'st-1', status: 'succeeded' }] },
      evidenceList: [{
        functional: { status: 'passed', passed: 5, failed: 0 },
        staticQuality: {
          typecheck: { status: 'passed', errorCount: 0 },
          lint: { status: 'passed', errorCount: 0 },
        },
      }],
      findings: [{
        findingId: 'fnd-1',
        category: 'security_verification',
        severity: 'critical',
        title: 'Secret exposed',
        status: 'open',
      }],
    });
    assert.strictEqual(res.passed, false);
    assert.strictEqual(res.gates.security.status, 'failed');
  });

  await t.test('Passes Security Gate when critical finding is explicitly accepted_risk', () => {
    const res = gateEngine.evaluateGates({
      masterTask: { subtasks: [{ subtaskId: 'st-1', status: 'succeeded' }] },
      evidenceList: [{
        functional: { status: 'passed', passed: 5, failed: 0 },
        staticQuality: {
          typecheck: { status: 'passed', errorCount: 0 },
          lint: { status: 'passed', errorCount: 0 },
        },
      }],
      findings: [{
        findingId: 'fnd-1',
        category: 'security_verification',
        severity: 'critical',
        title: 'Secret exposed in test fixture',
        status: 'accepted_risk',
        riskAcceptance: { reason: 'Test dummy fixture', authorizedBy: 'security-lead' },
      }],
    });
    assert.strictEqual(res.gates.security.status, 'passed');
    assert.strictEqual(res.passed, true);
  });
});

test('QA Phase 3: Review Engine conducts independent reviews, manages remediation, and bounds iterations', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-test-'));
  const storePath = path.join(tmpDir, 'qa-state.json');

  const engine = createReviewEngine({
    storePath,
    maxReviewIterations: 2,
  });

  let reviewId;
  let findingId;

  await t.test('Conducts independent review with independent reviewer assigned', async () => {
    const res = await engine.conductReview({
      masterTaskId: 'mt-100',
      subtaskId: 'st-1',
      implementationAgent: 'claude-code',
      instruction: 'Build secure authentication module',
      testResults: {
        command: 'npm test',
        exitCode: 1,
        total: 10,
        passed: 9,
        failed: 1,
      },
      staticResults: {
        typecheck: { status: 'passed', errorCount: 0 },
        lint: { status: 'passed', errorCount: 0 },
      },
    });

    assert.strictEqual(res.review.implementationAgent, 'claude-code');
    assert.strictEqual(res.review.reviewerId, 'codex-cli'); // Independent reviewer assigned
    assert.strictEqual(res.review.isIndependent, true);
    assert.strictEqual(res.review.status, 'remediation_required');
    assert.strictEqual(res.findings.length >= 1, true);

    reviewId = res.review.reviewId;
    findingId = res.findings[0].findingId;
  });

  await t.test('Creates remediation plan linking findings to remediation task', () => {
    const rem = engine.createRemediationPlan({
      masterTaskId: 'mt-100',
      findingIds: [findingId],
    });

    assert.strictEqual(rem.targetFindings.length, 1);
    assert.strictEqual(rem.targetFindings[0].status, 'fixing');
    assert.strictEqual(rem.targetFindings[0].remediationTaskId, rem.remediationSubtaskId);
  });

  await t.test('Re-verifies remediation: unresolved findings cause iteration increment', async () => {
    const res = await engine.reverifyRemediation({
      reviewId,
      newTestResults: {
        command: 'npm test',
        exitCode: 1,
        total: 10,
        passed: 9,
        failed: 1, // still failing!
      },
    });

    assert.strictEqual(res.review.iteration, 2);
    assert.strictEqual(res.remainingOpenCount, 1);
    assert.strictEqual(res.isExceeded, true); // Reached maxIterations (2)
    assert.strictEqual(res.review.status, 'failed'); // Marked failed to prevent infinite loop
  });

  await t.test('Manual risk acceptance with user authorization updates finding', () => {
    const accepted = engine.acceptRisk({
      findingId,
      reason: 'Flaky external integration test deferred to nightlies',
      authorizedBy: 'release-manager',
    });

    assert.strictEqual(accepted.status, 'accepted_risk');
    assert.strictEqual(accepted.riskAcceptance.authorizedBy, 'release-manager');
  });

  await t.test('State survives restart through atomic file persistence', () => {
    const reloaded = createReviewEngine({ storePath });
    const r = reloaded.getReview(reviewId);
    assert.ok(r);
    assert.strictEqual(r.reviewId, reviewId);

    const f = reloaded.getFinding(findingId);
    assert.ok(f);
    assert.strictEqual(f.status, 'accepted_risk');
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
