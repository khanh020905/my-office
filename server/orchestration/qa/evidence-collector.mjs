/**
 * QA Test Evidence Collector (Phase 3).
 * Collects, normalizes, and verifies execution evidence without fabricating passing results.
 * Distinguishes: 'passed', 'failed', 'not_run', 'unavailable', 'unknown'.
 */

import path from 'node:path';

// Credential and secret regex patterns for security verification
const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /bearer\s+[a-zA-Z0-9._~+/-]{20,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /(?:api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
];

export function createEvidenceCollector({ rootDir = process.cwd() } = {}) {
  /**
   * Scans a string or diff for secret / credential exposure.
   */
  function inspectForSecrets(content = '') {
    if (typeof content !== 'string' || !content) return [];
    const findings = [];
    for (const pattern of SENSITIVE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        findings.push({
          pattern: pattern.source,
          sample: match[0].slice(0, 8) + '***',
          index: match.index,
        });
      }
    }
    return findings;
  }

  /**
   * Scans file paths for path traversal or out-of-boundary access.
   */
  function inspectPathSafety(filePaths = [], baseDir = rootDir) {
    const violations = [];
    const resolvedBase = path.resolve(baseDir);

    for (const rawPath of filePaths) {
      const p = typeof rawPath === 'string' ? rawPath : (rawPath?.path || '');
      if (!p) continue;

      if (p.includes('..') || path.isAbsolute(p)) {
        const resolved = path.resolve(baseDir, p);
        if (!resolved.startsWith(resolvedBase)) {
          violations.push({
            path: p,
            resolved,
            reason: 'Path traversal beyond workspace boundary',
          });
        }
      }
    }
    return violations;
  }

  /**
   * Collects structured evidence from a completed execution record and subtask.
   */
  function collectExecutionEvidence({
    execution = null,
    subtask = null,
    workingDirectory = rootDir,
    testResults = null,
    staticResults = null,
  } = {}) {
    const timestamp = Date.now();
    const changedFiles = [];

    // 1. Collect affected files from execution / live task
    if (execution?.liveTask?.filesChanged && Array.isArray(execution.liveTask.filesChanged)) {
      for (const f of execution.liveTask.filesChanged) {
        const fp = typeof f === 'string' ? f : (f.path || '');
        if (fp && !changedFiles.includes(fp)) changedFiles.push(fp);
      }
    }

    // 2. Secret audit on execution output and instruction
    const textToScan = [
      execution?.instruction || subtask?.instruction || '',
      execution?.result || subtask?.result || '',
      execution?.error || subtask?.error || '',
    ].join('\n');

    const secretMatches = inspectForSecrets(textToScan);
    const pathViolations = inspectPathSafety(changedFiles, workingDirectory);

    // 3. Functional test evidence normalization
    const functionalEvidence = normalizeTestResults(testResults);

    // 4. Static quality (lint / typecheck) normalization
    const staticEvidence = normalizeStaticResults(staticResults);

    // 5. Security evidence
    const securityEvidence = {
      status: secretMatches.length === 0 && pathViolations.length === 0 ? 'passed' : 'failed',
      secretExposures: secretMatches,
      pathViolations,
      timestamp,
    };

    return {
      evidenceId: `evd-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp,
      executionId: execution?.executionId || null,
      provider: execution?.provider || subtask?.assignedProvider || 'unknown',
      workingDirectory,
      changedFiles,
      functional: functionalEvidence,
      staticQuality: staticEvidence,
      security: securityEvidence,
      provenance: {
        recordedAt: timestamp,
        providerRunId: execution?.providerRunId || null,
        subtaskId: subtask?.subtaskId || null,
      },
    };
  }

  /**
   * Formats test runner metrics faithfully.
   */
  function normalizeTestResults(raw = null) {
    if (!raw) {
      return {
        status: 'not_run',
        command: null,
        exitCode: null,
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        timestamp: null,
      };
    }

    const total = Number(raw.total || 0);
    const failed = Number(raw.failed || 0);
    const passed = Number(raw.passed || 0);
    const exitCode = typeof raw.exitCode === 'number' ? raw.exitCode : (failed > 0 ? 1 : 0);

    let status = 'not_run';
    if (raw.unavailable) {
      status = 'unavailable';
    } else if (raw.status) {
      status = raw.status;
    } else if (total > 0 || exitCode !== null) {
      status = (exitCode === 0 && failed === 0 && passed > 0) ? 'passed' : 'failed';
    }

    return {
      status,
      command: raw.command || null,
      exitCode,
      total,
      passed,
      failed,
      skipped: Number(raw.skipped || 0),
      durationMs: Number(raw.durationMs || 0),
      timestamp: raw.timestamp || Date.now(),
    };
  }

  /**
   * Formats static analysis (typecheck, lint) metrics faithfully.
   */
  function normalizeStaticResults(raw = null) {
    if (!raw) {
      return {
        typecheck: { status: 'not_run', exitCode: null, errorCount: 0 },
        lint: { status: 'not_run', exitCode: null, errorCount: 0, warningCount: 0 },
      };
    }

    const tcErrors = Number(raw.typecheck?.errorCount || (raw.typecheck?.errors?.length || 0));
    const tcExit = typeof raw.typecheck?.exitCode === 'number' ? raw.typecheck.exitCode : (tcErrors > 0 ? 1 : 0);
    const tcStatus = raw.typecheck?.status || (tcErrors === 0 && tcExit === 0 ? 'passed' : 'failed');

    const lintErrors = Number(raw.lint?.errorCount || (raw.lint?.errors?.length || 0));
    const lintWarnings = Number(raw.lint?.warningCount || (raw.lint?.warnings?.length || 0));
    const lintExit = typeof raw.lint?.exitCode === 'number' ? raw.lint.exitCode : (lintErrors > 0 ? 1 : 0);
    const lintStatus = raw.lint?.status || (lintErrors === 0 && lintExit === 0 ? 'passed' : 'failed');

    return {
      typecheck: {
        status: tcStatus,
        exitCode: tcExit,
        errorCount: tcErrors,
        errors: raw.typecheck?.errors || [],
      },
      lint: {
        status: lintStatus,
        exitCode: lintExit,
        errorCount: lintErrors,
        warningCount: lintWarnings,
        errors: raw.lint?.errors || [],
      },
    };
  }

  return {
    collectExecutionEvidence,
    inspectForSecrets,
    inspectPathSafety,
    normalizeTestResults,
    normalizeStaticResults,
  };
}
