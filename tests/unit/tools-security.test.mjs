import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createPermissionRegistry } from '../../server/tools/permission-registry.mjs';
import { createSecurityAuditLogger } from '../../server/tools/security-audit.mjs';
import { createSecurityPolicyEngine } from '../../server/tools/security-policy-engine.mjs';
import { executeIsolatedProcess } from '../../server/tools/execution-runner.mjs';
import { handleToolSecurityRoutes } from '../../server/tools/security-api.mjs';

describe('Universal Security & Permission Management (Phase 5)', () => {
  function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-sec-test-'));
    const permStore = path.join(tmpDir, 'permission-registry.json');
    const auditStore = path.join(tmpDir, 'security-audit.json');
    const policyStore = path.join(tmpDir, 'security-policies.json');

    const permissionRegistry = createPermissionRegistry({ storePath: permStore });
    const auditLogger = createSecurityAuditLogger({ storePath: auditStore });
    const policyEngine = createSecurityPolicyEngine({
      permissionRegistry,
      auditLogger,
      policiesPath: policyStore,
    });

    return {
      tmpDir,
      permStore,
      auditStore,
      policyStore,
      permissionRegistry,
      auditLogger,
      policyEngine,
    };
  }

  // 1. Permission Grant, Validation & Scopes
  it('grants granular permissions and persists them atomically with full audit history', () => {
    const { tmpDir, permissionRegistry } = setupTestEnv();

    const grant = permissionRegistry.grantPermission({
      tool_id: 'ponytail-qa',
      agent_id: 'claude-code',
      distribution_id: 'dist-claude-ponytail-1',
      scopes: ['fs:read', 'process:exec'],
      expiration: new Date(Date.now() + 3600_000).toISOString(),
      approval_reference: 'appr-user-123',
    });

    assert.ok(grant.permission_id.startsWith('perm_'));
    assert.equal(grant.tool_id, 'ponytail-qa');
    assert.equal(grant.agent_id, 'claude-code');
    assert.deepEqual(grant.granted_scopes, ['fs:read', 'process:exec']);
    assert.equal(grant.revocation_status, 'active');
    assert.equal(permissionRegistry.isGrantValid(grant), true);

    const retrieved = permissionRegistry.getPermission(grant.permission_id);
    assert.equal(retrieved.permission_id, grant.permission_id);

    // Filter by agent and tool
    const list = permissionRegistry.listPermissions({ agent_id: 'claude-code', tool_id: 'ponytail-qa' });
    assert.equal(list.length, 1);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 2. Permission Revocation
  it('revokes an existing permission grant and prevents further authorization', () => {
    const { tmpDir, permissionRegistry, policyEngine } = setupTestEnv();

    const grant = permissionRegistry.grantPermission({
      tool_id: 'fetch-tool',
      agent_id: 'codex-cli',
      scopes: ['net:outbound'],
      approval_reference: 'appr-456',
    });

    // Valid prior to revocation
    const decisionBefore = policyEngine.evaluateOperation({
      toolId: 'fetch-tool',
      agentId: 'codex-cli',
      operation: 'net:outbound',
      requestedScopes: ['net:outbound'],
    });
    assert.equal(decisionBefore.allowed, true);

    // Revoke
    const revokeRes = permissionRegistry.revokePermission(grant.permission_id, {
      reason: 'Revoked by security administrator',
    });
    assert.equal(revokeRes.ok, true);
    assert.equal(revokeRes.grant.revocation_status, 'revoked');
    assert.equal(permissionRegistry.isGrantValid(revokeRes.grant), false);

    // Rejected after revocation
    const decisionAfter = policyEngine.evaluateOperation({
      toolId: 'fetch-tool',
      agentId: 'codex-cli',
      operation: 'net:outbound',
      requestedScopes: ['net:outbound'],
    });
    assert.equal(decisionAfter.allowed, false);
    assert.equal(decisionAfter.status, 'REQUIRES_APPROVAL');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 3. Expiration Handling
  it('rejects expired permission grants automatically', () => {
    const { tmpDir, permissionRegistry, policyEngine } = setupTestEnv();

    const pastDate = new Date(Date.now() - 10_000).toISOString();
    const grant = permissionRegistry.grantPermission({
      tool_id: 'temp-tool',
      agent_id: 'antigravity',
      scopes: ['fs:read'],
      expiration: pastDate,
      approval_reference: 'appr-expired',
    });

    assert.equal(permissionRegistry.isGrantValid(grant), false);

    const decision = policyEngine.evaluateOperation({
      toolId: 'temp-tool',
      agentId: 'antigravity',
      operation: 'fs:read',
      requestedScopes: ['fs:read'],
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.status, 'REQUIRES_APPROVAL');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 4. Strict Agent Isolation (No Permission Bleed)
  it('enforces strict agent isolation: permissions for Claude Code do NOT bleed into Codex or Antigravity', () => {
    const { tmpDir, permissionRegistry, policyEngine } = setupTestEnv();

    // Grant fs:read to Claude Code ONLY
    permissionRegistry.grantPermission({
      tool_id: 'shared-skill',
      agent_id: 'claude-code',
      scopes: ['fs:read'],
      approval_reference: 'appr-claude',
    });

    // Claude Code is allowed
    const claudeDecision = policyEngine.evaluateOperation({
      toolId: 'shared-skill',
      agentId: 'claude-code',
      operation: 'fs:read',
      requestedScopes: ['fs:read'],
    });
    assert.equal(claudeDecision.allowed, true);

    // Codex CLI is DENIED (not authorized)
    const codexDecision = policyEngine.evaluateOperation({
      toolId: 'shared-skill',
      agentId: 'codex-cli',
      operation: 'fs:read',
      requestedScopes: ['fs:read'],
    });
    assert.equal(codexDecision.allowed, false);
    assert.ok(codexDecision.reason.includes('Missing required permission grant'));

    // Antigravity is DENIED (not authorized)
    const agDecision = policyEngine.evaluateOperation({
      toolId: 'shared-skill',
      agentId: 'antigravity',
      operation: 'fs:read',
      requestedScopes: ['fs:read'],
    });
    assert.equal(agDecision.allowed, false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 5. Precedence Rules: Explicit Deny Overrides Allow
  it('enforces explicit deny precedence over active permission grants', () => {
    const { tmpDir, permissionRegistry, policyEngine } = setupTestEnv();

    // Grant fs:write to tool
    permissionRegistry.grantPermission({
      tool_id: 'dangerous-tool',
      agent_id: 'claude-code',
      scopes: ['fs:write'],
      approval_reference: 'appr-user',
    });

    // Normal path write is allowed
    const normalDecision = policyEngine.evaluateOperation({
      toolId: 'dangerous-tool',
      agentId: 'claude-code',
      operation: 'fs:write',
      requestedScopes: ['fs:write'],
      target: 'D:\\my-office\\data\\temp.txt',
    });
    assert.equal(normalDecision.allowed, true);

    // Target Windows System32 is BLOCKED by explicit global deny rule despite valid grant!
    const system32Decision = policyEngine.evaluateOperation({
      toolId: 'dangerous-tool',
      agentId: 'claude-code',
      operation: 'fs:write',
      requestedScopes: ['fs:write'],
      target: 'C:\\Windows\\System32\\driver.sys',
    });
    assert.equal(system32Decision.allowed, false);
    assert.equal(system32Decision.status, 'DENY');
    assert.equal(system32Decision.rule_id, 'deny_system_root_write');

    // Globally forbidden scope (secrets:write) is ALWAYS denied
    const secretsWriteDecision = policyEngine.evaluateOperation({
      toolId: 'dangerous-tool',
      agentId: 'claude-code',
      operation: 'secrets:write',
      requestedScopes: ['secrets:write'],
    });
    assert.equal(secretsWriteDecision.allowed, false);
    assert.equal(secretsWriteDecision.status, 'DENY');
    assert.ok(secretsWriteDecision.reason.includes('globally denied'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 6. Cross-Agent Credential Isolation & Environment Variable Filtering
  it('filters cross-agent environment secrets and redacts sensitive tokens in logs', () => {
    const { tmpDir, policyEngine } = setupTestEnv();

    const dirtyEnv = {
      PATH: 'C:\\Windows\\system32',
      CLAUDE_SESSION_KEY: 'sk-ant-api03-secretclaude1234567890123456',
      CODEX_AUTH_TOKEN: 'codex-secret-token-abcdef1234567890123',
      OPENAI_API_KEY: 'sk-proj-openai9876543210987654321',
      OFFICE_SECRET_INTERNAL: 'super-office-secret-internal',
      CUSTOM_SAFE_VAR: 'hello-world',
    };

    // Filter environment for Codex CLI: Claude credentials must be stripped!
    const codexEnv = policyEngine.filterEnvironmentForAgent('codex-cli', 'some-tool', dirtyEnv);
    assert.equal(codexEnv.CLAUDE_SESSION_KEY, undefined, 'Claude secret must NOT leak to Codex');
    assert.equal(codexEnv.OFFICE_SECRET_INTERNAL, undefined, 'My Office internal secret must NOT leak');
    assert.equal(codexEnv.CUSTOM_SAFE_VAR, 'hello-world');

    // Filter environment for Claude Code: Codex credentials must be stripped!
    const claudeEnv = policyEngine.filterEnvironmentForAgent('claude-code', 'some-tool', dirtyEnv);
    assert.equal(claudeEnv.CODEX_AUTH_TOKEN, undefined, 'Codex secret must NOT leak to Claude');
    assert.equal(claudeEnv.OFFICE_SECRET_INTERNAL, undefined);

    // Secret output redaction
    const rawOutput = 'Connected to API with sk-proj-openai9876543210987654321 successfully';
    const redacted = policyEngine.redactSensitiveOutput(rawOutput);
    assert.equal(redacted.includes('sk-proj-'), false);
    assert.ok(redacted.includes('[REDACTED_SECRET]'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 7. Execution Runner Security Gate
  it('blocks process execution when security policy denies the operation', async () => {
    const { tmpDir, policyEngine } = setupTestEnv();

    // No permission granted for 'unauthorized-tool'
    const result = await executeIsolatedProcess({
      command: 'node',
      args: ['-e', 'console.log("SHOULD NOT RUN")'],
      toolId: 'unauthorized-tool',
      agentId: 'claude-code',
      policyEngine,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'BLOCKED_BY_POLICY');
    assert.ok(result.error.includes('Missing required permission grant'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 8. Security Audit Logging & Query Filtering
  it('records audit events and provides filtered summary statistics', () => {
    const { tmpDir, auditLogger } = setupTestEnv();

    auditLogger.logEvent({
      type: 'PERMISSION_REQUESTED',
      severity: 'info',
      tool_id: 'tool-x',
      agent_id: 'claude-code',
      reason: 'Requested fs:read',
    });

    auditLogger.logEvent({
      type: 'EXECUTION_BLOCKED',
      severity: 'critical',
      tool_id: 'tool-x',
      agent_id: 'claude-code',
      decision: 'BLOCKED',
      reason: 'Attempted write to system root',
    });

    const summary = auditLogger.getSummary();
    assert.equal(summary.total_events, 2);
    assert.equal(summary.critical_count, 1);
    assert.equal(summary.blocked_executions, 1);

    const query = auditLogger.queryEvents({ severity: 'critical' });
    assert.equal(query.total, 1);
    assert.equal(query.events[0].type, 'EXECUTION_BLOCKED');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 9. Technical Limitations Disclosure
  it('returns explicit technical boundary disclosures distinguishing application authorization from OS sandboxing', () => {
    const { tmpDir, policyEngine } = setupTestEnv();

    const limitations = policyEngine.getSecurityLimitations();
    assert.equal(limitations.enforcement_model, 'Application-Level Authorization & Environment Sanitization');
    assert.equal(limitations.levels.application_level.status, 'ENFORCED');
    assert.equal(limitations.levels.process_level.status, 'ENFORCED');
    assert.ok(limitations.levels.operating_system_level.status.includes('NOT KERNEL-SANDBOXED'));
    assert.ok(limitations.disclaimer.includes('application-level barriers'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 10. REST Security API Handlers
  it('handles all REST security routes (overview, permissions grant/revoke, evaluate, limitations)', async () => {
    const { tmpDir, permissionRegistry, policyEngine, auditLogger } = setupTestEnv();

    let responseCode = null;
    let responseData = null;
    const mockJson = (res, code, data) => {
      responseCode = code;
      responseData = data;
    };

    // GET /api/tools/security/overview
    await handleToolSecurityRoutes(
      { method: 'GET' },
      {},
      {
        url: new URL('http://127.0.0.1:4310/api/tools/security/overview'),
        permissionRegistry,
        securityPolicyEngine: policyEngine,
        securityAuditLogger: auditLogger,
        json: mockJson,
      }
    );
    assert.equal(responseCode, 200);
    assert.equal(responseData.ok, true);
    assert.equal(responseData.overview.agent_isolation, 'STRICT_CROSS_AGENT_ISOLATION_ACTIVE');

    // POST /api/tools/security/permissions/grant
    await handleToolSecurityRoutes(
      { method: 'POST' },
      {},
      {
        url: new URL('http://127.0.0.1:4310/api/tools/security/permissions/grant'),
        readJson: async () => ({
          tool_id: 'api-tool',
          agent_id: 'claude-code',
          scopes: ['fs:read'],
          approval_reference: 'appr-api-test',
        }),
        permissionRegistry,
        securityPolicyEngine: policyEngine,
        securityAuditLogger: auditLogger,
        json: mockJson,
      }
    );
    assert.equal(responseCode, 201);
    assert.equal(responseData.ok, true);
    const createdPermId = responseData.grant.permission_id;

    // POST /api/tools/security/evaluate
    await handleToolSecurityRoutes(
      { method: 'POST' },
      {},
      {
        url: new URL('http://127.0.0.1:4310/api/tools/security/evaluate'),
        readJson: async () => ({
          toolId: 'api-tool',
          agentId: 'claude-code',
          operation: 'fs:read',
          requestedScopes: ['fs:read'],
        }),
        permissionRegistry,
        securityPolicyEngine: policyEngine,
        securityAuditLogger: auditLogger,
        json: mockJson,
      }
    );
    assert.equal(responseCode, 200);
    assert.equal(responseData.decision.allowed, true);

    // POST /api/tools/security/permissions/revoke
    await handleToolSecurityRoutes(
      { method: 'POST' },
      {},
      {
        url: new URL('http://127.0.0.1:4310/api/tools/security/permissions/revoke'),
        readJson: async () => ({
          permission_id: createdPermId,
          reason: 'Test revocation',
        }),
        permissionRegistry,
        securityPolicyEngine: policyEngine,
        securityAuditLogger: auditLogger,
        json: mockJson,
      }
    );
    assert.equal(responseCode, 200);
    assert.equal(responseData.grant.revocation_status, 'revoked');

    // GET /api/tools/security/limitations
    await handleToolSecurityRoutes(
      { method: 'GET' },
      {},
      {
        url: new URL('http://127.0.0.1:4310/api/tools/security/limitations'),
        permissionRegistry,
        securityPolicyEngine: policyEngine,
        securityAuditLogger: auditLogger,
        json: mockJson,
      }
    );
    assert.equal(responseCode, 200);
    assert.ok(responseData.limitations.disclaimer);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

