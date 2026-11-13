/**
 * Security Guard for Autonomous Operations (Phase 4).
 * Enforces non-bypassable safety invariants, autonomy level boundaries,
 * protected project boundaries (XUONGPHIM, AI Video Tool), and audit logging.
 *
 * Core Invariant Rules:
 * 1. NO_AUTO_PERMISSION_GRANT: Never grant an agent additional permissions automatically.
 * 2. NO_QUALITY_GATE_BYPASS: Never bypass mandatory Quality Gates without explicit human authorization.
 * 3. NO_AUTO_RISK_ACCEPTANCE: Never automatically accept security risks.
 * 4. NO_UNAUTHORIZED_DESTRUCTIVE_OPS: Never execute destructive or out-of-boundary operations without required human authorization.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  AUTONOMY_LEVELS,
  APPROVAL_ACTION_TYPES,
  actionRequiresApproval,
} from './contracts.mjs';

export const INVARIANT_RULES = {
  NO_AUTO_PERMISSION_GRANT: 'NO_AUTO_PERMISSION_GRANT',
  NO_QUALITY_GATE_BYPASS: 'NO_QUALITY_GATE_BYPASS',
  NO_AUTO_RISK_ACCEPTANCE: 'NO_AUTO_RISK_ACCEPTANCE',
  NO_UNAUTHORIZED_DESTRUCTIVE_OPS: 'NO_UNAUTHORIZED_DESTRUCTIVE_OPS',
  NO_OUT_OF_BOUNDS_OPS: 'NO_OUT_OF_BOUNDS_OPS',
  PROTECTED_REPOSITORIES_INVARIANT: 'PROTECTED_REPOSITORIES_INVARIANT',
};

export const FORBIDDEN_PROJECT_PATTERNS = [
  /xuongphim/i,
  /xuong[_\-\s]?phim/i,
  /ai[_\-\s]?video[_\-\s]?tool/i,
];

export const DESTRUCTIVE_COMMAND_PATTERNS = [
  /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b/i,          // rm -rf
  /\brmdir\s+[\/\\]s\b/i,                      // rmdir /s
  /\bdel\s+[\/\\][sfq]\b/i,                    // del /s /f /q
  /\bRemove-Item\b.*-[a-zA-Z]*Recurse\b/i,     // PowerShell Remove-Item -Recurse
  /\bformat\s+[a-zA-Z]:/i,                     // format drive
  /\bmkfs\b/i,                                 // mkfs
  /\bdd\s+if=/i,                               // dd if=
  /\bgit\s+push\b.*(--force|-f\b)/i,           // git push --force
  /\bgit\s+reset\b.*--hard\b/i,                // git reset --hard
  /\bgit\s+clean\b.*-[a-zA-Z]*f\b/i,           // git clean -f
  /\bDROP\s+(DATABASE|TABLE)\b/i,              // DROP DATABASE/TABLE
  /\bTRUNCATE\s+TABLE\b/i,                     // TRUNCATE TABLE
  /\bchmod\s+(-R\s+)?777\b/i,                  // chmod 777
  /\bkill\s+-9\s+1\b/i,                        // kill init/PID 1
  /\bshutdown\b/i,                             // system shutdown
];

export const SENSITIVE_PATH_PATTERNS = [
  /[\\/]\.ssh([\\/]|$)/i,
  /[\\/]\.aws([\\/]|$)/i,
  /[\\/]\.gnupg([\\/]|$)/i,
  /[\\/]\.git[\\/]config$/i,
  /[\\/]id_rsa([\\.]|$)/i,
  /[\\/]id_ed25519([\\.]|$)/i,
  /[\\/]\.env\.production$/i,
  /[\\/]\.env\.vault$/i,
  /^[a-zA-Z]:\\Windows\\/i,
  /^\/etc([\\/]|$)/i,
  /^\/usr[\\/]sbin([\\/]|$)/i,
];

const AUTOMATED_IDENTITIES = new Set([
  'system',
  'agent',
  'claude-code',
  'codex-cli',
  'codex-app',
  'antigravity',
  'autonomous',
  'autonomous-scheduler',
  'self-healing',
  'remediation-engine',
  'policy-engine',
  'scheduler',
]);

export class SecurityGuardViolationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SecurityGuardViolationError';
    this.rule = details.rule || 'GENERAL_SECURITY_VIOLATION';
    this.riskTier = details.riskTier || 'critical';
    this.details = details;
  }
}

/**
 * Checks if an authorization identity is a genuine human operator.
 * @param {string|null|undefined} identity
 * @returns {boolean}
 */
export function isHumanOperator(identity) {
  if (!identity || typeof identity !== 'string') return false;
  const normalized = identity.trim().toLowerCase();
  if (normalized.length === 0) return false;
  if (AUTOMATED_IDENTITIES.has(normalized)) return false;
  if (normalized.startsWith('agent:') || normalized.startsWith('bot:')) return false;
  return true;
}

/**
 * Factory to create a Security Guard instance.
 */
export function createSecurityGuard({
  permissionRegistry = null,
  qaReviewEngine = null,
  auditLogger = null,
  storePath = null,
  projectRoots = [process.cwd()],
  forbiddenPaths = [],
  now = Date.now,
} = {}) {
  const defaultStorePath = storePath || path.resolve(process.cwd(), 'data', 'autonomous', 'security-audit.json');
  const auditTrail = [];
  const violations = [];

  // Normalize project roots
  const normalizedRoots = (Array.isArray(projectRoots) ? projectRoots : [projectRoots])
    .filter(Boolean)
    .map((r) => path.resolve(r));

  function load() {
    if (!fs.existsSync(defaultStorePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(defaultStorePath, 'utf8'));
      if (Array.isArray(data.auditTrail)) {
        auditTrail.push(...data.auditTrail);
      }
      if (Array.isArray(data.violations)) {
        violations.push(...data.violations);
      }
    } catch {
      // retain in-memory state
    }
  }

  function persist() {
    try {
      fs.mkdirSync(path.dirname(defaultStorePath), { recursive: true });
      const tmp = `${defaultStorePath}.tmp-${process.pid}`;
      const payload = {
        version: '1.0.0',
        savedAt: now(),
        auditTrail: auditTrail.slice(-500),
        violations: violations.slice(-200),
      };
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, defaultStorePath);
    } catch {
      // keep in-memory on error
    }
  }

  load();

  function logSecurityEvent({
    eventType,
    agentId = 'system',
    autonomyLevel = AUTONOMY_LEVELS.supervised,
    operationType = 'unknown',
    targetPath = null,
    command = null,
    result = 'allowed',
    violatedRules = [],
    riskTier = 'none',
    reason = '',
    metadata = {},
  }) {
    const event = {
      eventId: `sec_${now()}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: now(),
      eventType,
      agentId,
      autonomyLevel,
      operationType,
      targetPath,
      command,
      result,
      violatedRules,
      riskTier,
      reason,
      metadata,
    };

    auditTrail.push(event);
    if (result === 'blocked' || violatedRules.length > 0) {
      violations.push(event);
    }

    // Forward to legacy auditLogger if provided
    if (auditLogger?.logEvent) {
      try {
        auditLogger.logEvent({
          event_type: eventType,
          agent_id: agentId,
          tool_id: metadata.toolId || null,
          details: { reason, violatedRules, riskTier, targetPath, command },
          success: result === 'allowed',
        });
      } catch {
        // preserve guard flow
      }
    }

    persist();
    return event;
  }

  /**
   * Rule 1: Never grant an agent additional permissions automatically.
   */
  function canGrantPermission({
    agentId,
    requestedBy,
    isHuman = false,
    authorizedBy = null,
    scopes = [],
    tool_id = null,
  }) {
    const isExplicitHuman = isHuman === true && isHumanOperator(authorizedBy);

    if (!isExplicitHuman) {
      const reason = 'SECURITY_INVARIANT_VIOLATION: Agents and automated workflows are strictly prohibited from granting or escalating permissions automatically. Explicit human authorization is mandatory.';
      logSecurityEvent({
        eventType: 'permission_grant_blocked',
        agentId: agentId || requestedBy || 'unknown',
        operationType: APPROVAL_ACTION_TYPES.PERMISSION_GRANT,
        result: 'blocked',
        violatedRules: [INVARIANT_RULES.NO_AUTO_PERMISSION_GRANT],
        riskTier: 'critical',
        reason,
        metadata: { requestedBy, authorizedBy, scopes, tool_id },
      });
      return {
        allowed: false,
        reason,
        rule: INVARIANT_RULES.NO_AUTO_PERMISSION_GRANT,
        riskTier: 'critical',
      };
    }

    logSecurityEvent({
      eventType: 'permission_grant_authorized',
      agentId: agentId || 'unknown',
      operationType: APPROVAL_ACTION_TYPES.PERMISSION_GRANT,
      result: 'allowed',
      riskTier: 'medium',
      reason: `Permission granted under human authorization by ${authorizedBy}`,
      metadata: { requestedBy, authorizedBy, scopes, tool_id },
    });

    return { allowed: true, authorizedBy };
  }

  /**
   * Rule 2: Never bypass mandatory Quality Gates automatically.
   */
  function canBypassQualityGate({
    gateName,
    requestedBy,
    isHuman = false,
    authorizedBy = null,
    reason = '',
  }) {
    const isExplicitHuman = isHuman === true && isHumanOperator(authorizedBy);

    if (!isExplicitHuman) {
      const msg = `SECURITY_INVARIANT_VIOLATION: Automated bypass of mandatory Quality Gate '${gateName}' is prohibited. Explicit human authorization and justification are required.`;
      logSecurityEvent({
        eventType: 'quality_gate_bypass_blocked',
        agentId: requestedBy || 'unknown',
        operationType: APPROVAL_ACTION_TYPES.QUALITY_GATE_OVERRIDE,
        result: 'blocked',
        violatedRules: [INVARIANT_RULES.NO_QUALITY_GATE_BYPASS],
        riskTier: 'critical',
        reason: msg,
        metadata: { gateName, requestedBy, authorizedBy, justification: reason },
      });
      return {
        allowed: false,
        reason: msg,
        rule: INVARIANT_RULES.NO_QUALITY_GATE_BYPASS,
        riskTier: 'critical',
      };
    }

    if (!reason || reason.trim().length < 5) {
      const msg = `Quality gate bypass requires a clear written justification reason from the human authorizer.`;
      return {
        allowed: false,
        reason: msg,
        rule: INVARIANT_RULES.NO_QUALITY_GATE_BYPASS,
        riskTier: 'high',
      };
    }

    logSecurityEvent({
      eventType: 'quality_gate_bypass_authorized',
      agentId: requestedBy || 'unknown',
      operationType: APPROVAL_ACTION_TYPES.QUALITY_GATE_OVERRIDE,
      result: 'allowed',
      riskTier: 'high',
      reason: `Quality Gate '${gateName}' waived by human operator ${authorizedBy}: ${reason}`,
      metadata: { gateName, authorizedBy, reason },
    });

    return { allowed: true, authorizedBy, reason };
  }

  /**
   * Rule 3: Never automatically accept security risks.
   */
  function canAcceptSecurityRisk({
    findingId,
    severity = 'critical',
    requestedBy,
    isHuman = false,
    authorizedBy = null,
    reason = '',
  }) {
    const isExplicitHuman = isHuman === true && isHumanOperator(authorizedBy);

    if (!isExplicitHuman) {
      const msg = `SECURITY_INVARIANT_VIOLATION: Automatic acceptance of security finding '${findingId}' (${severity}) is strictly prohibited. Only an authenticated human operator may accept security risks.`;
      logSecurityEvent({
        eventType: 'risk_acceptance_blocked',
        agentId: requestedBy || 'unknown',
        operationType: 'risk_acceptance',
        result: 'blocked',
        violatedRules: [INVARIANT_RULES.NO_AUTO_RISK_ACCEPTANCE],
        riskTier: 'critical',
        reason: msg,
        metadata: { findingId, severity, requestedBy, authorizedBy },
      });
      return {
        allowed: false,
        reason: msg,
        rule: INVARIANT_RULES.NO_AUTO_RISK_ACCEPTANCE,
        riskTier: 'critical',
      };
    }

    if (!reason || reason.trim().length < 5) {
      return {
        allowed: false,
        reason: 'Risk acceptance requires a documented human justification reason.',
        rule: INVARIANT_RULES.NO_AUTO_RISK_ACCEPTANCE,
        riskTier: 'high',
      };
    }

    logSecurityEvent({
      eventType: 'risk_acceptance_authorized',
      agentId: requestedBy || 'unknown',
      operationType: 'risk_acceptance',
      result: 'allowed',
      riskTier: 'high',
      reason: `Security risk '${findingId}' accepted by human authorizer ${authorizedBy}: ${reason}`,
      metadata: { findingId, severity, authorizedBy, reason },
    });

    return { allowed: true, authorizedBy, reason };
  }

  /**
   * Checks whether a command string is destructive.
   */
  function isDestructiveOperation({ operationType, command = '', targetPath = null } = {}) {
    if (operationType === APPROVAL_ACTION_TYPES.DESTRUCTIVE_OPERATION) {
      return { destructive: true, reason: 'Explicitly declared as destructive operation' };
    }

    if (command && typeof command === 'string') {
      for (const pattern of DESTRUCTIVE_COMMAND_PATTERNS) {
        if (pattern.test(command)) {
          return {
            destructive: true,
            matchedPattern: pattern.toString(),
            reason: `Destructive command pattern detected: ${command.trim().substring(0, 100)}`,
          };
        }
      }
    }

    return { destructive: false };
  }

  /**
   * Rule 4 & Invariant: Validates workspace boundaries and protected repositories.
   */
  function validatePathBoundary(targetPath, { allowReadOnly = false } = {}) {
    void allowReadOnly;
    if (!targetPath) {
      return { safe: true, outOfBounds: false, isForbidden: false, normalizedPath: null };
    }

    const resolved = path.resolve(targetPath);

    // 1. Strict Protection for Forbidden Projects (XUONGPHIM, AI Video Tool)
    for (const pattern of FORBIDDEN_PROJECT_PATTERNS) {
      if (pattern.test(resolved)) {
        return {
          safe: false,
          outOfBounds: true,
          isForbidden: true,
          normalizedPath: resolved,
          rule: INVARIANT_RULES.PROTECTED_REPOSITORIES_INVARIANT,
          reason: `Access to protected domain '${resolved}' is strictly prohibited. Modifications to XUONGPHIM or AI Video Tool are disallowed.`,
        };
      }
    }

    // Check additional configured forbidden paths
    for (const forbidden of forbiddenPaths) {
      const normForbidden = path.resolve(forbidden);
      if (resolved === normForbidden || resolved.startsWith(normForbidden + path.sep)) {
        return {
          safe: false,
          outOfBounds: true,
          isForbidden: true,
          normalizedPath: resolved,
          rule: INVARIANT_RULES.PROTECTED_REPOSITORIES_INVARIANT,
          reason: `Target path is in explicitly configured forbidden list: ${resolved}`,
        };
      }
    }

    // 2. Sensitive Credential / System Path Check
    for (const pattern of SENSITIVE_PATH_PATTERNS) {
      if (pattern.test(resolved)) {
        return {
          safe: false,
          outOfBounds: true,
          isForbidden: true,
          normalizedPath: resolved,
          rule: INVARIANT_RULES.NO_OUT_OF_BOUNDS_OPS,
          reason: `Target path touches sensitive credentials or critical system files: ${resolved}`,
        };
      }
    }

    // 3. Authorized Workspace Root Boundary Check
    if (normalizedRoots.length > 0) {
      const insideAuthorizedRoot = normalizedRoots.some((root) => {
        return resolved === root || resolved.startsWith(root + path.sep);
      });

      if (!insideAuthorizedRoot) {
        return {
          safe: false,
          outOfBounds: true,
          isForbidden: false,
          normalizedPath: resolved,
          rule: INVARIANT_RULES.NO_OUT_OF_BOUNDS_OPS,
          reason: `Target path is outside authorized workspace roots: ${resolved}`,
        };
      }
    }

    return {
      safe: true,
      outOfBounds: false,
      isForbidden: false,
      normalizedPath: resolved,
    };
  }

  /**
   * Main gate: Evaluates any agent operation against autonomy level and security invariants.
   */
  function evaluateOperation({
    agentId = 'agent',
    autonomyLevel = AUTONOMY_LEVELS.supervised,
    operationType = APPROVAL_ACTION_TYPES.CODE_EDIT,
    targetPath = null,
    command = null,
    context = {},
    humanAuthorization = null,
  }) {
    const violatedRules = [];
    const isHumanAuth = Boolean(
      humanAuthorization &&
      humanAuthorization.authorized === true &&
      isHumanOperator(humanAuthorization.authorizedBy)
    );

    // 1. Path Boundary & Protected Repos Check
    const pathCheck = validatePathBoundary(targetPath, { allowReadOnly: context.isReadOnly });
    if (!pathCheck.safe) {
      if (pathCheck.isForbidden) {
        // Forbidden projects (XUONGPHIM / AI Video Tool / sensitive) can NEVER be modified even by autonomy
        violatedRules.push(pathCheck.rule || INVARIANT_RULES.PROTECTED_REPOSITORIES_INVARIANT);
      } else if (pathCheck.outOfBounds && !isHumanAuth) {
        violatedRules.push(INVARIANT_RULES.NO_OUT_OF_BOUNDS_OPS);
      }
    }

    // 2. Destructive Operations Check
    const destructiveCheck = isDestructiveOperation({ operationType, command, targetPath });
    if (destructiveCheck.destructive && !isHumanAuth) {
      violatedRules.push(INVARIANT_RULES.NO_UNAUTHORIZED_DESTRUCTIVE_OPS);
    }

    // 3. Permission Escalation Check
    if (
      operationType === APPROVAL_ACTION_TYPES.PERMISSION_GRANT ||
      context.isPermissionEscalation
    ) {
      if (!isHumanAuth) {
        violatedRules.push(INVARIANT_RULES.NO_AUTO_PERMISSION_GRANT);
      }
    }

    // 4. Quality Gate Override Check
    if (
      operationType === APPROVAL_ACTION_TYPES.QUALITY_GATE_OVERRIDE ||
      context.isQualityGateOverride
    ) {
      if (!isHumanAuth) {
        violatedRules.push(INVARIANT_RULES.NO_QUALITY_GATE_BYPASS);
      }
    }

    // 5. Security Risk Acceptance Check
    if (
      operationType === 'risk_acceptance' ||
      context.isRiskAcceptance
    ) {
      if (!isHumanAuth) {
        violatedRules.push(INVARIANT_RULES.NO_AUTO_RISK_ACCEPTANCE);
      }
    }

    // Check if hard invariants are violated
    if (violatedRules.length > 0) {
      const reason = `Security invariants violated: ${violatedRules.join(', ')}. Action blocked.`;
      logSecurityEvent({
        eventType: 'operation_blocked',
        agentId,
        autonomyLevel,
        operationType,
        targetPath,
        command,
        result: 'blocked',
        violatedRules,
        riskTier: 'critical',
        reason,
        metadata: { pathCheck, destructiveCheck, isHumanAuth },
      });

      return {
        allowed: false,
        requiresApproval: true,
        violatedRules,
        reason,
        riskTier: 'critical',
      };
    }

    // 6. Check Autonomy Level Constraints
    const needsApproval = actionRequiresApproval(autonomyLevel, operationType, {
      ...context,
      isDestructive: destructiveCheck.destructive,
      isOutOfBounds: pathCheck.outOfBounds,
      isPermissionEscalation: operationType === APPROVAL_ACTION_TYPES.PERMISSION_GRANT,
    });

    if (needsApproval && !isHumanAuth) {
      const reason = `Action '${operationType}' requires explicit human approval under autonomy level '${autonomyLevel}'.`;
      logSecurityEvent({
        eventType: 'approval_required',
        agentId,
        autonomyLevel,
        operationType,
        targetPath,
        command,
        result: 'requires_approval',
        violatedRules: [],
        riskTier: destructiveCheck.destructive ? 'high' : 'medium',
        reason,
        metadata: { context },
      });

      return {
        allowed: false,
        requiresApproval: true,
        violatedRules: [],
        reason,
        riskTier: destructiveCheck.destructive ? 'high' : 'medium',
      };
    }

    // Allowed
    logSecurityEvent({
      eventType: 'operation_allowed',
      agentId,
      autonomyLevel,
      operationType,
      targetPath,
      command,
      result: 'allowed',
      violatedRules: [],
      riskTier: 'none',
      reason: 'Operation satisfies all security invariants and autonomy constraints.',
      metadata: { isHumanAuth },
    });

    return {
      allowed: true,
      requiresApproval: false,
      violatedRules: [],
      reason: 'Allowed',
      riskTier: 'none',
    };
  }

  /**
   * Asserts operation is allowed, throwing SecurityGuardViolationError if blocked.
   */
  function assertOperationAllowed(params) {
    const evalResult = evaluateOperation(params);
    if (!evalResult.allowed) {
      throw new SecurityGuardViolationError(evalResult.reason, {
        rule: evalResult.violatedRules[0] || 'SECURITY_POLICY_VIOLATION',
        riskTier: evalResult.riskTier,
        evaluation: evalResult,
      });
    }
    return evalResult;
  }

  return {
    canGrantPermission,
    canBypassQualityGate,
    canAcceptSecurityRisk,
    isDestructiveOperation,
    validatePathBoundary,
    evaluateOperation,
    assertOperationAllowed,
    logSecurityEvent,
    getAuditHistory: (limit = 100) => auditTrail.slice(-limit),
    getViolations: (limit = 100) => violations.slice(-limit),
    INVARIANT_RULES,
  };
}
