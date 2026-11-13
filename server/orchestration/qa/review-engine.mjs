/**
 * Independent Agent Quality Assurance & Review Engine (Phase 3).
 *
 * Core Principle: "An agent claiming completion is not proof of successful completion."
 *
 * Capabilities:
 * - Independent reviewer assignment with provenance tracking
 * - Evaluation across 5 categories: Requirement Compliance, Code Quality, Functional, Security, Integration
 * - Structured finding model (findingId, severity, status, evidence, affectedFiles, recommendation)
 * - Fix-and-reverify loop with iteration limits (preventing infinite loops)
 * - Traceable remediation linkage and manual risk acceptance
 * - Atomic persistence surviving server restarts
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createEvidenceCollector } from './evidence-collector.mjs';
import { createQualityGateEngine } from './quality-gate-engine.mjs';

export const REVIEW_CATEGORIES = [
  'requirement_compliance',
  'code_quality',
  'functional_verification',
  'security_verification',
  'integration_verification',
];

export const SEVERITY_LEVELS = [
  'critical',
  'high',
  'medium',
  'low',
  'informational',
];

export const FINDING_STATUSES = [
  'open',
  'acknowledged',
  'fixing',
  'resolved',
  'rejected',
  'accepted_risk',
];

export const REVIEW_STATUSES = [
  'pending',
  'in_progress',
  'passed',
  'failed',
  'remediation_required',
];

export function createReviewEngine({
  controlManager = null,
  capabilityRegistry = null,
  storePath = null,
  maxReviewIterations = 3,
  now = Date.now,
} = {}) {
  void controlManager;
  void capabilityRegistry;
  const reviews = new Map();   // reviewId -> ReviewRecord
  const findings = new Map();  // findingId -> ReviewFinding
  const evidenceStore = new Map(); // evidenceId -> EvidenceRecord
  const evidenceCollector = createEvidenceCollector();
  const qualityGateEngine = createQualityGateEngine();

  function load() {
    if (!storePath || !fs.existsSync(storePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      if (Array.isArray(data.reviews)) {
        for (const r of data.reviews) reviews.set(r.reviewId, r);
      }
      if (Array.isArray(data.findings)) {
        for (const f of data.findings) findings.set(f.findingId, f);
      }
      if (Array.isArray(data.evidenceList)) {
        for (const ev of data.evidenceList) evidenceStore.set(ev.evidenceId, ev);
      }
    } catch {
      // keep in-memory
    }
  }

  function persist() {
    if (!storePath) return;
    try {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      const tmp = `${storePath}.tmp-${process.pid}`;
      const payload = {
        version: 1,
        savedAt: now(),
        reviews: Array.from(reviews.values()).slice(-100),
        findings: Array.from(findings.values()).slice(-300),
        evidenceList: Array.from(evidenceStore.values()).slice(-200),
      };
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, storePath);
    } catch {
      // keep in-memory
    }
  }

  load();

  /**
   * Selects an independent reviewer provider to avoid self-review.
   */
  function pickIndependentReviewer(implementationAgent) {
    if (implementationAgent === 'claude-code') {
      return 'codex-cli';
    } else if (implementationAgent === 'codex-cli') {
      return 'claude-code';
    }
    return 'independent-qa-engine';
  }

  /**
   * Conducts an independent QA review of a completed Master Task or Subtask.
   */
  async function conductReview({
    masterTaskId,
    subtaskId = null,
    implementationAgent = 'claude-code',
    reviewerId = null,
    instruction = '',
    workingDirectory = process.cwd(),
    execution = null,
    testResults = null,
    staticResults = null,
    subtasks = [],
  }) {
    const assignedReviewer = reviewerId || pickIndependentReviewer(implementationAgent);
    const reviewId = `rev-${now()}-${crypto.randomBytes(3).toString('hex')}`;
    const iteration = 1;

    // 1. Collect objective execution evidence
    const evidence = evidenceCollector.collectExecutionEvidence({
      execution,
      subtask: subtaskId ? { subtaskId, instruction, assignedProvider: implementationAgent } : null,
      workingDirectory,
      testResults,
      staticResults,
    });
    evidenceStore.set(evidence.evidenceId, evidence);

    const generatedFindings = [];

    // 2. Evaluate Category: Security Verification
    if (evidence.security.status === 'failed') {
      for (const sec of evidence.security.secretExposures || []) {
        generatedFindings.push(createFinding({
          masterTaskId,
          subtaskId,
          reviewId,
          reviewerId: assignedReviewer,
          category: 'security_verification',
          severity: 'critical',
          title: 'Potential credential or secret pattern exposed in execution output',
          description: `Discovered sensitive pattern matching '${sec.pattern}' (sample: ${sec.sample}).`,
          evidence: sec,
          affectedFiles: evidence.changedFiles,
          recommendation: 'Remove exposed secret immediately and rotate credentials if live.',
        }));
      }
      for (const pv of evidence.security.pathViolations || []) {
        generatedFindings.push(createFinding({
          masterTaskId,
          subtaskId,
          reviewId,
          reviewerId: assignedReviewer,
          category: 'security_verification',
          severity: 'high',
          title: 'Path traversal attempt beyond project boundary',
          description: `Path '${pv.path}' attempts traversal outside safe directory: ${pv.reason}.`,
          evidence: pv,
          affectedFiles: [pv.path],
          recommendation: 'Normalize all paths and reject directory traversal sequences.',
        }));
      }
    }

    // 3. Evaluate Category: Code Quality (Static Checks)
    const staticQ = evidence.staticQuality;
    if (staticQ.typecheck.status === 'failed' || staticQ.typecheck.errorCount > 0) {
      generatedFindings.push(createFinding({
        masterTaskId,
        subtaskId,
        reviewId,
        reviewerId: assignedReviewer,
        category: 'code_quality',
        severity: 'high',
        title: 'TypeScript compilation errors detected',
        description: `Found ${staticQ.typecheck.errorCount} static type error(s).`,
        evidence: staticQ.typecheck,
        affectedFiles: evidence.changedFiles,
        recommendation: 'Resolve all compiler type errors before final acceptance.',
      }));
    }
    if (staticQ.lint.status === 'failed' || staticQ.lint.errorCount > 0) {
      generatedFindings.push(createFinding({
        masterTaskId,
        subtaskId,
        reviewId,
        reviewerId: assignedReviewer,
        category: 'code_quality',
        severity: 'medium',
        title: 'Linter rule violations detected',
        description: `Found ${staticQ.lint.errorCount} linter error(s) and ${staticQ.lint.warningCount} warning(s).`,
        evidence: staticQ.lint,
        affectedFiles: evidence.changedFiles,
        recommendation: 'Run npm run lint and fix formatting / rule violations.',
      }));
    }

    // 4. Evaluate Category: Functional Verification
    const func = evidence.functional;
    if (func.status === 'failed' || func.failed > 0) {
      generatedFindings.push(createFinding({
        masterTaskId,
        subtaskId,
        reviewId,
        reviewerId: assignedReviewer,
        category: 'functional_verification',
        severity: 'critical',
        title: 'Functional test failures observed in verification suite',
        description: `${func.failed} out of ${func.total} test(s) failed during execution.`,
        evidence: func,
        affectedFiles: evidence.changedFiles,
        recommendation: 'Fix failing unit/integration tests and re-verify test suite passes with exit code 0.',
      }));
    } else if (func.status === 'not_run') {
      generatedFindings.push(createFinding({
        masterTaskId,
        subtaskId,
        reviewId,
        reviewerId: assignedReviewer,
        category: 'functional_verification',
        severity: 'medium',
        title: 'No functional tests recorded for implementation subtask',
        description: 'Subtask completed without execution of unit or integration test suite.',
        evidence: func,
        affectedFiles: evidence.changedFiles,
        recommendation: 'Add or execute targeted automated tests for new functionality.',
      }));
    }

    // 5. Evaluate Category: Requirement Compliance
    if (subtasks && subtasks.length > 0) {
      const incomplete = subtasks.filter((s) => s.status !== 'succeeded');
      if (incomplete.length > 0) {
        generatedFindings.push(createFinding({
          masterTaskId,
          subtaskId,
          reviewId,
          reviewerId: assignedReviewer,
          category: 'requirement_compliance',
          severity: 'high',
          title: 'Uncompleted subtask requirements in master objective',
          description: `${incomplete.length} subtask(s) failed or were blocked.`,
          evidence: { incomplete: incomplete.map((i) => ({ id: i.subtaskId, title: i.title, status: i.status })) },
          affectedFiles: [],
          recommendation: 'Address prerequisite failures and run remediation on blocked branches.',
        }));
      }
    }

    // Determine initial review status based on findings
    const criticalOrHighCount = generatedFindings.filter((f) => ['critical', 'high'].includes(f.severity)).length;
    let reviewStatus = 'passed';
    let decision = 'accepted';

    if (criticalOrHighCount > 0) {
      reviewStatus = 'remediation_required';
      decision = 'remediation_requested';
    } else if (generatedFindings.length > 0) {
      reviewStatus = 'passed';
      decision = 'accepted';
    }

    const reviewRecord = {
      reviewId,
      masterTaskId,
      subtaskId,
      implementationAgent,
      reviewerId: assignedReviewer,
      isIndependent: implementationAgent !== assignedReviewer,
      status: reviewStatus,
      decision,
      iteration,
      maxIterations: maxReviewIterations,
      instruction,
      categories: [...REVIEW_CATEGORIES],
      evidenceId: evidence.evidenceId,
      findingIds: generatedFindings.map((f) => f.findingId),
      createdAt: now(),
      completedAt: now(),
    };

    reviews.set(reviewId, reviewRecord);
    persist();

    return {
      review: reviewRecord,
      evidence,
      findings: generatedFindings,
    };
  }

  function createFinding({
    masterTaskId,
    subtaskId = null,
    reviewId,
    reviewerId,
    category,
    severity = 'medium',
    title,
    description = '',
    evidence = null,
    affectedFiles = [],
    recommendation = '',
  }) {
    const findingId = `fnd-${now()}-${crypto.randomBytes(3).toString('hex')}`;
    const finding = {
      findingId,
      masterTaskId,
      subtaskId,
      reviewId,
      reviewerId,
      category,
      severity,
      title,
      description,
      evidence,
      affectedFiles,
      recommendation,
      status: 'open',
      remediationTaskId: null,
      remediationEvidence: null,
      createdAt: now(),
      updatedAt: now(),
      resolvedAt: null,
    };
    findings.set(findingId, finding);
    return finding;
  }

  /**
   * Creates a remediation plan and subtask instruction for open findings.
   */
  function createRemediationPlan({ masterTaskId: _masterTaskId, findingIds = [] }) {
    const targetFindings = findingIds.map((id) => findings.get(id)).filter(Boolean);
    if (targetFindings.length === 0) {
      throw new Error('No valid findings specified for remediation.');
    }

    const remediationSubtaskId = `rem-${now()}-${crypto.randomBytes(2).toString('hex')}`;

    for (const f of targetFindings) {
      f.status = 'fixing';
      f.remediationTaskId = remediationSubtaskId;
      f.updatedAt = now();
    }

    const instruction = [
      `### QA Remediation Task: Fix ${targetFindings.length} verified finding(s)`,
      ...targetFindings.map((f, i) => `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\n   Recommendation: ${f.recommendation}`),
      `\nAffected files: ${Array.from(new Set(targetFindings.flatMap((f) => f.affectedFiles))).join(', ') || 'N/A'}`,
    ].join('\n');

    persist();

    return {
      remediationSubtaskId,
      instruction,
      targetFindings,
    };
  }

  /**
   * Re-verifies findings following remediation.
   */
  async function reverifyRemediation({
    reviewId,
    remediationResults = {},
    newTestResults = null,
    newStaticResults = null,
  }) {
    const review = reviews.get(reviewId);
    if (!review) throw new Error(`Review '${reviewId}' not found.`);

    review.iteration += 1;
    const reviewFindings = (review.findingIds || []).map((id) => findings.get(id)).filter(Boolean);

    // Evaluate newly provided evidence
    const newEvidence = evidenceCollector.collectExecutionEvidence({
      workingDirectory: process.cwd(),
      testResults: newTestResults,
      staticResults: newStaticResults,
    });
    evidenceStore.set(newEvidence.evidenceId, newEvidence);
    review.evidenceId = newEvidence.evidenceId;

    for (const f of reviewFindings) {
      if (['resolved', 'rejected', 'accepted_risk'].includes(f.status)) continue;

      let resolved = false;

      // Check if functional test failure finding is resolved
      if (f.category === 'functional_verification' && newEvidence.functional.status === 'passed') {
        resolved = true;
      }
      // Check if static check finding is resolved
      if (f.category === 'code_quality') {
        if (f.title.includes('TypeScript') && newEvidence.staticQuality.typecheck.errorCount === 0) {
          resolved = true;
        }
        if (f.title.includes('Linter') && newEvidence.staticQuality.lint.errorCount === 0) {
          resolved = true;
        }
      }
      // Check if security finding was resolved
      if (f.category === 'security_verification' && newEvidence.security.status === 'passed') {
        resolved = true;
      }

      if (resolved) {
        f.status = 'resolved';
        f.resolvedAt = now();
        f.updatedAt = now();
        f.remediationEvidence = {
          evidenceId: newEvidence.evidenceId,
          resolvedBy: 'reverification',
          remediationResults,
        };
      } else {
        // If still unresolved after remediation, keep open
        f.status = 'open';
        f.updatedAt = now();
      }
    }

    // Check if remaining open findings exist
    const remainingOpen = reviewFindings.filter((f) => !['resolved', 'rejected', 'accepted_risk'].includes(f.status));
    const isExceeded = review.iteration >= (review.maxIterations || maxReviewIterations);

    if (remainingOpen.length === 0) {
      review.status = 'passed';
      review.decision = 'accepted';
    } else if (isExceeded) {
      review.status = 'failed';
      review.decision = 'rejected';
    } else {
      review.status = 'remediation_required';
      review.decision = 'remediation_requested';
    }

    review.completedAt = now();
    persist();

    return {
      review,
      remainingOpenCount: remainingOpen.length,
      isExceeded,
      findings: reviewFindings,
      newEvidence,
    };
  }

  /**
   * Explicit user authorization to accept risk on a documented finding.
   */
  function acceptRisk({ findingId, reason, authorizedBy }) {
    if (!reason || !authorizedBy) {
      throw new Error('Risk acceptance requires both a justification reason and an authorized user identity.');
    }
    const finding = findings.get(findingId);
    if (!finding) throw new Error(`Finding '${findingId}' not found.`);

    finding.status = 'accepted_risk';
    finding.updatedAt = now();
    finding.riskAcceptance = {
      reason,
      authorizedBy,
      acceptedAt: now(),
    };

    persist();
    return finding;
  }

  function getReview(reviewId) {
    const rev = reviews.get(reviewId);
    if (!rev) return null;
    const reviewFindings = (rev.findingIds || []).map((id) => findings.get(id)).filter(Boolean);
    const evidence = rev.evidenceId ? evidenceStore.get(rev.evidenceId) : null;
    return {
      ...rev,
      findings: reviewFindings,
      evidence,
    };
  }

  function listReviews({ masterTaskId = null, status = null, limit = 50 } = {}) {
    let list = Array.from(reviews.values());
    if (masterTaskId) list = list.filter((r) => r.masterTaskId === masterTaskId);
    if (status) list = list.filter((r) => r.status === status);
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return list.slice(0, limit);
  }

  function getFinding(findingId) {
    return findings.get(findingId) || null;
  }

  function listFindings({ masterTaskId = null, severity = null, status = null, category = null, limit = 100 } = {}) {
    let list = Array.from(findings.values());
    if (masterTaskId) list = list.filter((f) => f.masterTaskId === masterTaskId);
    if (severity) list = list.filter((f) => f.severity === severity);
    if (status) list = list.filter((f) => f.status === status);
    if (category) list = list.filter((f) => f.category === category);
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return list.slice(0, limit);
  }

  function getEvidence(evidenceId) {
    return evidenceStore.get(evidenceId) || null;
  }

  function getSummaryStats() {
    const allReviews = Array.from(reviews.values());
    const allFindings = Array.from(findings.values());

    return {
      totalReviews: allReviews.length,
      passedReviews: allReviews.filter((r) => r.status === 'passed').length,
      failedReviews: allReviews.filter((r) => r.status === 'failed').length,
      remediationRequired: allReviews.filter((r) => r.status === 'remediation_required').length,
      totalFindings: allFindings.length,
      openFindings: allFindings.filter((f) => f.status === 'open').length,
      criticalFindings: allFindings.filter((f) => f.severity === 'critical' && f.status === 'open').length,
      highFindings: allFindings.filter((f) => f.severity === 'high' && f.status === 'open').length,
      resolvedFindings: allFindings.filter((f) => f.status === 'resolved').length,
      acceptedRisks: allFindings.filter((f) => f.status === 'accepted_risk').length,
    };
  }

  return {
    conductReview,
    createRemediationPlan,
    reverifyRemediation,
    acceptRisk,
    getReview,
    listReviews,
    getFinding,
    listFindings,
    getEvidence,
    getSummaryStats,
    qualityGateEngine,
  };
}
