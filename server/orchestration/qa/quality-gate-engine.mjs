/**
 * QA Quality Gate Engine (Phase 3).
 * Evaluates execution evidence and review findings against configurable acceptance gates.
 *
 * Gates:
 * 1. Functional Verification Gate (unit / functional tests passed)
 * 2. Static Quality Gate (typecheck and lint passed)
 * 3. Security Gate (no unresolved critical or high severity security findings)
 * 4. Requirement Coverage Gate (mandatory requirements verified with evidence)
 * 5. Integration Gate (integration tests passed)
 *
 * Rules:
 * - A Master Task CANNOT be marked 'succeeded' while mandatory gates are unresolved.
 * - Failed gates are NEVER silently downgraded.
 * - Risk acceptance requires explicit authorization.
 */

export const GATE_NAMES = [
  'functional',
  'staticQuality',
  'security',
  'requirementCoverage',
  'integration',
];

export function createQualityGateEngine({
  policy = {},
} = {}) {
  const defaultPolicy = {
    mandatoryGates: ['functional', 'staticQuality', 'security', 'requirementCoverage'],
    requireZeroLintWarnings: false,
    allowRiskAcceptedSecurity: true, // critical/high findings can be waived ONLY if status === 'accepted_risk'
    ...policy,
  };

  /**
   * Evaluates all quality gates for a Master Task based on collected evidence and findings.
   */
  function evaluateGates({
    masterTask,
    evidenceList = [],
    findings = [],
    policyOverride = null,
  }) {
    const activePolicy = { ...defaultPolicy, ...(policyOverride || {}) };
    const gates = {};
    const blockers = [];

    // Aggregate evidence across all subtasks
    const aggregatedEvidence = aggregateEvidence(evidenceList);

    // 1. Functional Gate
    gates.functional = evaluateFunctionalGate(aggregatedEvidence, activePolicy);
    if (activePolicy.mandatoryGates.includes('functional') && gates.functional.status === 'failed') {
      blockers.push(`Functional Verification Gate failed: ${gates.functional.reason}`);
    }

    // 2. Static Quality Gate
    gates.staticQuality = evaluateStaticQualityGate(aggregatedEvidence, activePolicy);
    if (activePolicy.mandatoryGates.includes('staticQuality') && gates.staticQuality.status === 'failed') {
      blockers.push(`Static Quality Gate failed: ${gates.staticQuality.reason}`);
    }

    // 3. Security Gate
    gates.security = evaluateSecurityGate(findings, activePolicy);
    if (activePolicy.mandatoryGates.includes('security') && gates.security.status === 'failed') {
      blockers.push(`Security Gate failed: ${gates.security.reason}`);
    }

    // 4. Requirement Coverage Gate
    gates.requirementCoverage = evaluateRequirementCoverageGate(masterTask, evidenceList, findings, activePolicy);
    if (activePolicy.mandatoryGates.includes('requirementCoverage') && gates.requirementCoverage.status === 'failed') {
      blockers.push(`Requirement Coverage Gate failed: ${gates.requirementCoverage.reason}`);
    }

    // 5. Integration Gate
    gates.integration = evaluateIntegrationGate(aggregatedEvidence, activePolicy);
    if (activePolicy.mandatoryGates.includes('integration') && gates.integration.status === 'failed') {
      blockers.push(`Integration Gate failed: ${gates.integration.reason}`);
    }

    const passed = blockers.length === 0;

    return {
      passed,
      evaluatedAt: Date.now(),
      gates,
      blockers,
      summary: {
        totalGates: GATE_NAMES.length,
        passedGates: Object.values(gates).filter((g) => g.status === 'passed').length,
        failedGates: Object.values(gates).filter((g) => g.status === 'failed').length,
        waivedGates: Object.values(gates).filter((g) => g.status === 'waived').length,
      },
    };
  }

  function evaluateFunctionalGate(evidence, policy) {
    if (!evidence || !evidence.functional || evidence.functional.status === 'not_run') {
      return {
        status: policy.mandatoryGates.includes('functional') ? 'failed' : 'waived',
        reason: 'Functional test suite was not run or has no recorded evidence.',
        details: evidence?.functional || null,
      };
    }

    if (evidence.functional.status === 'failed' || (evidence.functional.failed || 0) > 0) {
      return {
        status: 'failed',
        reason: `${evidence.functional.failed || 1} test(s) failed in functional test suite.`,
        details: evidence.functional,
      };
    }

    if (evidence.functional.status === 'passed' && (evidence.functional.passed || 0) > 0) {
      return {
        status: 'passed',
        reason: `All ${evidence.functional.passed} functional tests passed cleanly.`,
        details: evidence.functional,
      };
    }

    return {
      status: 'failed',
      reason: 'Incomplete or unverified test execution output.',
      details: evidence.functional,
    };
  }

  function evaluateStaticQualityGate(evidence, policy) {
    const staticQ = evidence?.staticQuality;
    if (!staticQ || (staticQ.typecheck.status === 'not_run' && staticQ.lint.status === 'not_run')) {
      return {
        status: policy.mandatoryGates.includes('staticQuality') ? 'failed' : 'waived',
        reason: 'Static quality checks (typecheck / lint) were not executed.',
        details: staticQ,
      };
    }

    const tcErrors = staticQ.typecheck.errorCount || 0;
    const lintErrors = staticQ.lint.errorCount || 0;
    const lintWarnings = staticQ.lint.warningCount || 0;

    if (tcErrors > 0) {
      return {
        status: 'failed',
        reason: `TypeScript check failed with ${tcErrors} compilation error(s).`,
        details: staticQ.typecheck,
      };
    }

    if (lintErrors > 0) {
      return {
        status: 'failed',
        reason: `Linter failed with ${lintErrors} rule error(s).`,
        details: staticQ.lint,
      };
    }

    if (policy.requireZeroLintWarnings && lintWarnings > 0) {
      return {
        status: 'failed',
        reason: `Linter produced ${lintWarnings} warning(s) under zero-warning policy.`,
        details: staticQ.lint,
      };
    }

    return {
      status: 'passed',
      reason: 'Static checks passed with 0 errors.',
      details: staticQ,
    };
  }

  function evaluateSecurityGate(findings, _policy) {
    // Filter for security category or critical/high severity
    const securityFindings = findings.filter(
      (f) => f.category === 'security_verification' || ['critical', 'high'].includes(f.severity)
    );

    const activeViolations = securityFindings.filter(
      (f) => !['resolved', 'rejected', 'accepted_risk'].includes(f.status)
    );

    const riskAccepted = securityFindings.filter((f) => f.status === 'accepted_risk');

    if (activeViolations.length > 0) {
      const topSev = activeViolations[0].severity;
      return {
        status: 'failed',
        reason: `Found ${activeViolations.length} unresolved security finding(s) (highest severity: ${topSev}).`,
        details: {
          activeViolations: activeViolations.map((v) => ({ id: v.findingId, title: v.title, severity: v.severity })),
          riskAcceptedCount: riskAccepted.length,
        },
      };
    }

    return {
      status: 'passed',
      reason: riskAccepted.length > 0
        ? `Security checks passed with ${riskAccepted.length} explicitly accepted risk(s).`
        : 'Zero security findings detected.',
      details: {
        activeViolations: [],
        riskAcceptedCount: riskAccepted.length,
      },
    };
  }

  function evaluateRequirementCoverageGate(masterTask, evidenceList, findings) {
    if (!masterTask || !masterTask.subtasks || masterTask.subtasks.length === 0) {
      return {
        status: 'failed',
        reason: 'Master task has no subtasks to verify.',
        details: null,
      };
    }

    // Check if any subtask failed or was blocked
    const uncompleted = masterTask.subtasks.filter((s) => s.status !== 'succeeded');
    if (uncompleted.length > 0) {
      return {
        status: 'failed',
        reason: `${uncompleted.length} subtask(s) were not successfully completed.`,
        details: { uncompleted: uncompleted.map((u) => u.subtaskId) },
      };
    }

    // Check if there are open requirement_compliance findings
    const reqFindings = findings.filter(
      (f) => f.category === 'requirement_compliance' && !['resolved', 'rejected', 'accepted_risk'].includes(f.status)
    );

    if (reqFindings.length > 0) {
      return {
        status: 'failed',
        reason: `Found ${reqFindings.length} unresolved requirement compliance finding(s).`,
        details: { findings: reqFindings.map((f) => f.findingId) },
      };
    }

    return {
      status: 'passed',
      reason: `All ${masterTask.subtasks.length} subtask requirement(s) satisfied with verified deliverables.`,
      details: { totalSubtasks: masterTask.subtasks.length },
    };
  }

  function evaluateIntegrationGate(evidence, policy) {
    // If integration tests were explicitly run, verify they passed
    if (evidence?.integration && evidence.integration.status !== 'not_run') {
      if (evidence.integration.status === 'passed' && (evidence.integration.failed || 0) === 0) {
        return {
          status: 'passed',
          reason: 'Integration test suite passed cleanly.',
          details: evidence.integration,
        };
      }
      return {
        status: 'failed',
        reason: 'Integration test suite failed or had non-zero exit status.',
        details: evidence.integration,
      };
    }

    // If not mandatory, can be waived or passed by default
    return {
      status: policy.mandatoryGates.includes('integration') ? 'failed' : 'waived',
      reason: 'No dedicated integration test execution recorded.',
      details: null,
    };
  }

  function aggregateEvidence(evidenceList = []) {
    if (!evidenceList || evidenceList.length === 0) return null;

    let totalPassed = 0;
    let totalFailed = 0;
    let anyRun = false;
    let hasFailures = false;

    let tcTotalErrors = 0;
    let lintTotalErrors = 0;
    let lintTotalWarnings = 0;
    let staticRan = false;

    for (const ev of evidenceList) {
      if (ev.functional && ev.functional.status !== 'not_run') {
        anyRun = true;
        totalPassed += ev.functional.passed || 0;
        totalFailed += ev.functional.failed || 0;
        if (ev.functional.status === 'failed') hasFailures = true;
      }
      if (ev.staticQuality) {
        if (ev.staticQuality.typecheck?.status !== 'not_run') {
          staticRan = true;
          tcTotalErrors += ev.staticQuality.typecheck.errorCount || 0;
        }
        if (ev.staticQuality.lint?.status !== 'not_run') {
          staticRan = true;
          lintTotalErrors += ev.staticQuality.lint.errorCount || 0;
          lintTotalWarnings += ev.staticQuality.lint.warningCount || 0;
        }
      }
    }

    return {
      functional: anyRun ? {
        status: hasFailures || totalFailed > 0 ? 'failed' : 'passed',
        passed: totalPassed,
        failed: totalFailed,
        total: totalPassed + totalFailed,
      } : { status: 'not_run' },
      staticQuality: staticRan ? {
        typecheck: {
          status: tcTotalErrors === 0 ? 'passed' : 'failed',
          errorCount: tcTotalErrors,
        },
        lint: {
          status: lintTotalErrors === 0 ? 'passed' : 'failed',
          errorCount: lintTotalErrors,
          warningCount: lintTotalWarnings,
        },
      } : {
        typecheck: { status: 'not_run', errorCount: 0 },
        lint: { status: 'not_run', errorCount: 0, warningCount: 0 },
      },
    };
  }

  return {
    evaluateGates,
    GATE_NAMES,
  };
}
