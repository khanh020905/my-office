/**
 * Security Policy Engine (Phase 5 Master Architecture §3, §5, §6, §10).
 * Implements the 5-level permission hierarchy, 12-step operation evaluation pipeline,
 * explicit deny precedence, agent isolation, secret filtering, and audit logging.
 */

import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteJsonSync, acquireLockSync } from './fs-utils.mjs';

const DEFAULT_POLICIES_PATH = path.resolve(process.cwd(), 'data', 'tools', 'security-policies.json');

// Sensitive tokens and keys regex for output redaction
const SENSITIVE_OUTPUT_PATTERNS = [
  /(?:sk-[a-zA-Z0-9_-]{20,})/g,
  /(?:ghp_[a-zA-Z0-9]{30,})/g,
  /(?:Bearer\s+[a-zA-Z0-9_.-]{20,})/gi,
  /(?:ANTHROPIC_API_KEY=[^\s&]+)/gi,
  /(?:OPENAI_API_KEY=[^\s&]+)/gi,
  /(?:GEMINI_API_KEY=[^\s&]+)/gi,
  /(?:password=[^\s&]+)/gi,
  /(?:token=[^\s&]+)/gi,
];

// Agent-specific sensitive environment variable prefixes to maintain strict cross-agent isolation
const AGENT_SPECIFIC_ENV_PREFIXES = {
  'claude-code': [/^CODEX_/i, /^GEMINI_/i, /^OPENAI_/i],
  'codex-cli': [/^CLAUDE_/i, /^ANTHROPIC_/i, /^GEMINI_/i],
  'codex-app': [/^CLAUDE_/i, /^ANTHROPIC_/i, /^GEMINI_/i],
  'antigravity': [/^CLAUDE_/i, /^ANTHROPIC_/i, /^CODEX_/i],
};

const DEFAULT_GLOBAL_POLICIES = {
  version: '1.0.0',
  default_action: 'DENY',
  // Globally forbidden scopes that cannot be granted to untrusted tools
  globally_denied_scopes: ['secrets:write'],
  // Explicit deny rules evaluated across all tools and agents
  explicit_denies: [
    {
      rule_id: 'deny_system_root_write',
      scope: 'fs:write',
      target: 'C:\\Windows\\System32',
      description: 'Block write access to Windows system directory',
    },
    {
      rule_id: 'deny_credentials_dump',
      scope: 'secrets:read',
      target: 'credentials:*',
      description: 'Block raw credential dump access',
    },
  ],
  // Agent policies
  agent_policies: {
    'claude-code': {
      allowed_scopes: ['fs:read', 'fs:write', 'net:outbound', 'process:exec', 'env:read', 'mcp:connect', 'api:access'],
      denied_scopes: ['secrets:write', 'net:inbound'],
    },
    'codex-cli': {
      allowed_scopes: ['fs:read', 'fs:write', 'net:outbound', 'process:exec', 'env:read', 'mcp:connect', 'api:access'],
      denied_scopes: ['secrets:write', 'net:inbound'],
    },
    'codex-app': {
      allowed_scopes: ['fs:read', 'fs:write', 'net:outbound', 'process:exec', 'hooks:register'],
      denied_scopes: ['secrets:write', 'net:inbound'],
    },
    'antigravity': {
      allowed_scopes: ['fs:read', 'fs:write', 'net:outbound', 'process:exec', 'env:read', 'mcp:connect'],
      denied_scopes: ['secrets:write', 'net:inbound'],
    },
    'generic-mcp': {
      allowed_scopes: ['mcp:connect', 'process:exec'],
      denied_scopes: ['secrets:write', 'fs:delete', 'net:inbound'],
    },
  },
  // Tool-level overrides (tool_id -> policy)
  tool_policies: {},
  // Distribution-level overrides (distribution_id -> policy)
  distribution_policies: {},
};

export function createSecurityPolicyEngine({
  permissionRegistry,
  auditLogger,
  policiesPath = null,
} = {}) {
  const store = policiesPath || DEFAULT_POLICIES_PATH;
  const lockPath = `${store}.lock`;
  fs.mkdirSync(path.dirname(store), { recursive: true });

  let policies = null;

  function load() {
    if (!fs.existsSync(store)) {
      policies = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICIES));
      save();
      return;
    }
    try {
      policies = JSON.parse(fs.readFileSync(store, 'utf8'));
    } catch {
      policies = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICIES));
    }
  }

  function save() {
    const releaseLock = acquireLockSync(lockPath);
    try {
      policies.updated_at = new Date().toISOString();
      atomicWriteJsonSync(store, policies);
    } finally {
      releaseLock();
    }
  }

  load();

  /**
   * Helper to check if a scope matches any denied scopes in an array.
   */
  function isScopeDenied(scope, deniedScopes) {
    if (!Array.isArray(deniedScopes)) return false;
    for (const denied of deniedScopes) {
      if (denied === '*' || denied === scope) return true;
      if (denied.endsWith(':*') && scope.startsWith(denied.slice(0, -1))) return true;
    }
    return false;
  }

  return {
    /**
     * 12-STEP OPERATION EVALUATION PIPELINE (Phase 5 Master Architecture §5).
     * Evaluates whether an operation requested by a tool within an agent context is allowed,
     * denied, or requires explicit user approval.
     */
    evaluateOperation({
      toolId,
      agentId,
      distributionId = null,
      operation,
      requestedScopes = [],
      target = null,
      taskContext = {},
    }) {
      load();

      // Step 1: Identify tool
      if (!toolId || typeof toolId !== 'string') {
        const decision = { allowed: false, status: 'DENY', reason: 'Missing tool identification', step: 1 };
        auditLogger?.logEvent({ type: 'POLICY_EVALUATION', severity: 'warning', decision: 'DENY', reason: decision.reason });
        return decision;
      }

      // Step 2: Identify agent
      if (!agentId || typeof agentId !== 'string') {
        const decision = { allowed: false, status: 'DENY', reason: 'Missing agent identification (cross-agent isolation required)', step: 2 };
        auditLogger?.logEvent({ type: 'POLICY_EVALUATION', severity: 'warning', decision: 'DENY', tool_id: toolId, reason: decision.reason });
        return decision;
      }

      // Step 3: Identify distribution
      const distId = distributionId || null;

      // Step 4: Identify requested operation
      const op = operation || 'unspecified_operation';

      // Step 5: Determine required permissions
      const scopes = Array.isArray(requestedScopes) && requestedScopes.length > 0
        ? requestedScopes
        : [op];

      // Step 6: Evaluate global policies
      // 6a. Globally denied scopes check
      for (const scope of scopes) {
        if (isScopeDenied(scope, policies.globally_denied_scopes)) {
          const reason = `Scope '${scope}' is globally denied by platform security policy`;
          auditLogger?.logEvent({
            type: 'POLICY_EVALUATION',
            severity: 'critical',
            tool_id: toolId,
            agent_id: agentId,
            distribution_id: distId,
            operation: op,
            decision: 'DENY',
            reason,
          });
          return { allowed: false, status: 'DENY', reason, step: 6 };
        }
      }

      // 6b. Explicit deny rules check
      if (Array.isArray(policies.explicit_denies)) {
        for (const rule of policies.explicit_denies) {
          for (const scope of scopes) {
            if (rule.scope === scope || rule.scope === '*') {
              if (!rule.target || (target && target.toLowerCase().includes(rule.target.toLowerCase()))) {
                const reason = `Operation denied by explicit global security rule: ${rule.rule_id} (${rule.description || ''})`;
                auditLogger?.logEvent({
                  type: 'POLICY_EVALUATION',
                  severity: 'critical',
                  tool_id: toolId,
                  agent_id: agentId,
                  distribution_id: distId,
                  operation: op,
                  decision: 'DENY',
                  reason,
                });
                return { allowed: false, status: 'DENY', reason, rule_id: rule.rule_id, step: 6 };
              }
            }
          }
        }
      }

      // Step 7: Evaluate agent policies
      const agentPolicy = policies.agent_policies?.[agentId];
      if (agentPolicy) {
        for (const scope of scopes) {
          if (isScopeDenied(scope, agentPolicy.denied_scopes)) {
            const reason = `Scope '${scope}' is explicitly denied for agent '${agentId}' by agent policy`;
            auditLogger?.logEvent({
              type: 'POLICY_EVALUATION',
              severity: 'warning',
              tool_id: toolId,
              agent_id: agentId,
              distribution_id: distId,
              operation: op,
              decision: 'DENY',
              reason,
            });
            return { allowed: false, status: 'DENY', reason, step: 7 };
          }
        }
      }

      // Step 8: Evaluate tool policies
      const toolPolicy = policies.tool_policies?.[toolId];
      if (toolPolicy) {
        for (const scope of scopes) {
          if (isScopeDenied(scope, toolPolicy.denied_scopes)) {
            const reason = `Scope '${scope}' is explicitly denied for tool '${toolId}' by tool policy`;
            auditLogger?.logEvent({
              type: 'POLICY_EVALUATION',
              severity: 'warning',
              tool_id: toolId,
              agent_id: agentId,
              distribution_id: distId,
              operation: op,
              decision: 'DENY',
              reason,
            });
            return { allowed: false, status: 'DENY', reason, step: 8 };
          }
        }
      }

      // Step 9: Evaluate distribution policies
      if (distId) {
        const distPolicy = policies.distribution_policies?.[distId];
        if (distPolicy) {
          for (const scope of scopes) {
            if (isScopeDenied(scope, distPolicy.denied_scopes)) {
              const reason = `Scope '${scope}' is explicitly denied for distribution '${distId}'`;
              auditLogger?.logEvent({
                type: 'POLICY_EVALUATION',
                severity: 'warning',
                tool_id: toolId,
                agent_id: agentId,
                distribution_id: distId,
                operation: op,
                decision: 'DENY',
                reason,
              });
              return { allowed: false, status: 'DENY', reason, step: 9 };
            }
          }
        }
      }

      // Step 10: Verify user authorization & active grants in Permission Registry
      // Strict agent isolation: Must find active grant matching exact toolId AND agentId
      const activeGrants = permissionRegistry
        ? permissionRegistry.getActiveGrants(toolId, agentId, distId)
        : [];

      // Check if all requested scopes are covered by active grants
      const grantedScopeSet = new Set();
      let matchedGrant = null;

      for (const grant of activeGrants) {
        if (Array.isArray(grant.granted_scopes)) {
          for (const s of grant.granted_scopes) {
            grantedScopeSet.add(s);
          }
          matchedGrant = grant;
        }
      }

      const missingScopes = scopes.filter((s) => !grantedScopeSet.has(s) && !grantedScopeSet.has('*'));

      // Step 11: Allow, deny, or request approval
      if (missingScopes.length > 0) {
        // Default to DENY / REQUIRES_APPROVAL
        const reason = `Missing required permission grant for scope(s): ${missingScopes.join(', ')} on agent '${agentId}'`;
        const decision = {
          allowed: false,
          status: 'REQUIRES_APPROVAL',
          reason,
          missingScopes,
          toolId,
          agentId,
          distributionId: distId,
          step: 11,
        };

        // Step 12: Record the decision
        auditLogger?.logEvent({
          type: 'PERMISSION_DENIED',
          severity: 'warning',
          tool_id: toolId,
          agent_id: agentId,
          distribution_id: distId,
          operation: op,
          decision: 'REQUIRES_APPROVAL',
          reason,
          details: { missingScopes, taskContext },
        });

        return decision;
      }

      // All scopes granted and no policies deny!
      const decision = {
        allowed: true,
        status: 'ALLOW',
        reason: 'Operation authorized by valid active permission grant',
        grantedScopes: scopes,
        permissionId: matchedGrant?.permission_id || null,
        step: 11,
      };

      // Record grant usage
      if (matchedGrant && permissionRegistry) {
        permissionRegistry.recordUsage(matchedGrant.permission_id, {
          operation: op,
          agent_id: agentId,
          allowed: true,
          reason: 'Authorized execution',
        });
      }

      // Step 12: Record decision in Security Audit Log
      auditLogger?.logEvent({
        type: 'EXECUTION_ALLOWED',
        severity: 'info',
        tool_id: toolId,
        agent_id: agentId,
        distribution_id: distId,
        operation: op,
        decision: 'ALLOW',
        reason: decision.reason,
        details: { scopes, permission_id: matchedGrant?.permission_id },
      });

      return decision;
    },

    /**
     * Cross-Agent Credential Isolation & Environment Variable Filtering (Phase 5 Master Architecture §6).
     * Enforces strict isolation: Claude credentials are NEVER exposed to Codex or vice versa.
     * Never exposes My Office API keys or server secrets to external tools.
     */
    filterEnvironmentForAgent(agentId, toolId, rawEnv = {}) {
      const sanitized = {};
      const forbiddenPrefixes = AGENT_SPECIFIC_ENV_PREFIXES[agentId] || [];

      // Always forbid internal My Office secret patterns
      const internalForbiddenPatterns = [
        /^OFFICE_SECRET/i,
        /^MY_OFFICE_KEY/i,
        /^ADMIN_TOKEN/i,
        /^JWT_SECRET/i,
      ];

      for (const [key, value] of Object.entries(rawEnv)) {
        // 1. Check internal forbidden keys
        if (internalForbiddenPatterns.some((pattern) => pattern.test(key))) {
          auditLogger?.logEvent({
            type: 'CROSS_AGENT_LEAK_PREVENTED',
            severity: 'warning',
            tool_id: toolId,
            agent_id: agentId,
            reason: `Filtered internal secret environment variable '${key}'`,
          });
          continue;
        }

        // 2. Check cross-agent leaks (e.g. Claude key leaking into Codex)
        if (forbiddenPrefixes.some((pattern) => pattern.test(key))) {
          auditLogger?.logEvent({
            type: 'CROSS_AGENT_LEAK_PREVENTED',
            severity: 'warning',
            tool_id: toolId,
            agent_id: agentId,
            reason: `Cross-agent isolation prevented leak of '${key}' to agent '${agentId}'`,
          });
          continue;
        }

        sanitized[key] = value;
      }

      return sanitized;
    },

    /**
     * Redacts sensitive tokens and secrets from strings and logs.
     */
    redactSensitiveOutput(text) {
      if (!text || typeof text !== 'string') return text;
      let cleaned = text;
      for (const pattern of SENSITIVE_OUTPUT_PATTERNS) {
        cleaned = cleaned.replace(pattern, '[REDACTED_SECRET]');
      }
      return cleaned;
    },

    /**
     * Retrieves the current security policies configuration.
     */
    getPolicies() {
      load();
      return JSON.parse(JSON.stringify(policies));
    },

    /**
     * Updates policy rules.
     */
    updatePolicy(updates = {}) {
      load();
      if (updates.globally_denied_scopes) {
        policies.globally_denied_scopes = Array.from(new Set(updates.globally_denied_scopes));
      }
      if (updates.explicit_denies) {
        policies.explicit_denies = updates.explicit_denies;
      }
      if (updates.agent_policies) {
        policies.agent_policies = { ...policies.agent_policies, ...updates.agent_policies };
      }
      if (updates.tool_policies) {
        policies.tool_policies = { ...policies.tool_policies, ...updates.tool_policies };
      }
      if (updates.distribution_policies) {
        policies.distribution_policies = { ...policies.distribution_policies, ...updates.distribution_policies };
      }

      save();
      auditLogger?.logEvent({
        type: 'POLICY_UPDATED',
        severity: 'info',
        reason: 'Security policies updated',
      });
      return { ok: true, policies };
    },

    /**
     * Discloses the strict technical boundaries of security enforcement (Phase 5 Master Architecture §10).
     */
    getSecurityLimitations() {
      return {
        enforcement_model: 'Application-Level Authorization & Environment Sanitization',
        levels: {
          application_level: {
            status: 'ENFORCED',
            description: 'My Office evaluates 12-step policy decisions before dispatching tool operations, process spawning, or distribution linking.',
          },
          process_level: {
            status: 'ENFORCED',
            description: 'Child processes run with sanitized environment variables, stripped API tokens, restricted working directories, and CPU/timeout limits.',
          },
          operating_system_level: {
            status: 'PARTIAL / NOT KERNEL-SANDBOXED',
            description: 'On Windows win32, execution processes run under the host user account. Operating-system kernel-level sandboxing (e.g. Windows AppContainer or Linux seccomp/cgroups) is NOT active without container virtualization.',
          },
          hardware_level: {
            status: 'NOT ENFORCED',
            description: 'Hardware virtualization is not engaged. Tools must be audited before granting process:exec or fs:write permissions.',
          },
        },
        disclaimer: 'Permissions and policies enforce application-level barriers and process isolation. They do not replace host OS user account boundaries.',
      };
    },

    /**
     * Resets or clears memory for test isolation.
     */
    _resetForTesting() {
      if (fs.existsSync(store)) {
        try { fs.unlinkSync(store); } catch {}
      }
      if (fs.existsSync(lockPath)) {
        try { fs.unlinkSync(lockPath); } catch {}
      }
      policies = JSON.parse(JSON.stringify(DEFAULT_GLOBAL_POLICIES));
    },
  };
}

