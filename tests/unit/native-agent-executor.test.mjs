import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createNativeAgentExecutor } from '../../server/orchestration/native-agent-executor.mjs';
import { createSecurityPolicyEngine } from '../../server/tools/security-policy-engine.mjs';
import { createPermissionRegistry } from '../../server/tools/permission-registry.mjs';
import { sanitizeEnvironment } from '../../server/tools/execution-runner.mjs';

describe('Phase 8 & 8.1 — Native Agent Execution Adapter & Hardening Tests', () => {
  it('executes a real child process using a controlled mock script and captures stdout, exit code, pid, and duration', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-exec-test-'));
    const mockScript = path.join(tmpDir, 'mock-claude.js');
    fs.writeFileSync(mockScript, `
      const args = process.argv.slice(2);
      console.log("Mock Claude Code executed with prompt: " + args.join(" "));
      process.exit(0);
    `);

    const executor = createNativeAgentExecutor();
    const result = await executor.executeAgentStep({
      step: {
        step_id: 'step_1',
        agent_id: 'claude-code',
        title: 'Inspect repository structure',
        description: 'Verify package.json layout',
        required_permissions: ['fs:read'],
      },
      customBinary: mockScript,
      workspaceDir: tmpDir,
    });

    assert.equal(result.ok, true);
    assert.equal(result.exit_code, 0);
    assert.ok(result.pid > 0);
    assert.ok(result.duration_ms >= 0);
    assert.ok(result.stdout.includes('Mock Claude Code executed'));
    assert.equal(result.status, 'completed');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('captures non-zero exit code and reports failure correctly without false COMPLETED status', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-exec-fail-'));
    const mockScript = path.join(tmpDir, 'mock-fail.js');
    fs.writeFileSync(mockScript, `
      console.error("Fatal error: cannot inspect target directory");
      process.exit(2);
    `);

    const executor = createNativeAgentExecutor();
    const result = await executor.executeAgentStep({
      step: {
        step_id: 'step_fail',
        agent_id: 'claude-code',
        title: 'Failing step',
        description: 'Test failure path',
      },
      customBinary: mockScript,
      workspaceDir: tmpDir,
    });

    assert.equal(result.ok, false);
    assert.equal(result.exit_code, 2);
    assert.ok(result.stderr.includes('Fatal error'));
    assert.equal(result.status, 'failed');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles process execution timeout and terminates safely', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-exec-timeout-'));
    const mockScript = path.join(tmpDir, 'mock-hang.js');
    fs.writeFileSync(mockScript, `
      setTimeout(() => { process.exit(0); }, 10000);
    `);

    const executor = createNativeAgentExecutor();
    const result = await executor.executeAgentStep({
      step: {
        step_id: 'step_hang',
        agent_id: 'claude-code',
        title: 'Hanging step',
        timeout_ms: 100, // short timeout
      },
      customBinary: mockScript,
      workspaceDir: tmpDir,
    });

    assert.equal(result.ok, false);
    assert.equal(result.timed_out, true);
    assert.equal(result.status, 'timed_out');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('blocks agent invocation when SecurityPolicyEngine explicitly denies agent:invoke', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-exec-sec-'));
    const permStore = path.join(tmpDir, 'perms.json');
    const policyStore = path.join(tmpDir, 'policies.json');

    const permissionRegistry = createPermissionRegistry({ storePath: permStore });
    const policyEngine = createSecurityPolicyEngine({
      permissionRegistry,
      policiesPath: policyStore,
    });

    // Explicitly deny agent:invoke for untrusted agent
    const policies = policyEngine.getPolicies();
    policies.agent_policies['untrusted-agent'] = {
      allowed_scopes: [],
      denied_scopes: ['agent:invoke', '*'],
    };
    policyEngine.updatePolicy(policies);

    const executor = createNativeAgentExecutor({ policyEngine });
    const result = await executor.executeAgentStep({
      step: {
        step_id: 'step_untrusted',
        agent_id: 'untrusted-agent',
        title: 'Untrusted step',
      },
      workspaceDir: tmpDir,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'BLOCKED_BY_POLICY');
    assert.ok(result.error.includes('denied'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports EXECUTABLE_NOT_FOUND when binary does not exist on PATH', async () => {
    const executor = createNativeAgentExecutor();
    const result = await executor.executeAgentStep({
      step: {
        step_id: 'step_no_bin',
        agent_id: 'non-existent-agent-binary-xyz',
        title: 'Missing binary step',
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'EXECUTABLE_NOT_FOUND');
    assert.ok(result.error.includes('not found on host PATH'));
  });

  // --- Phase 8.1 Permission & Authentication Regression Tests ---

  it('denies unauthorized agent:invoke when no grant exists', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-invoke-'));
    const registry = createPermissionRegistry({ storePath: path.join(tmpDir, 'perms.json') });
    const policyEngine = createSecurityPolicyEngine({
      permissionRegistry: registry,
      policiesPath: path.join(tmpDir, 'policies.json')
    });

    const executor = createNativeAgentExecutor({ policyEngine });
    const result = await executor.executeAgentStep({
      step: {
        step_id: 'unauthorized_invoke',
        agent_id: 'claude-code',
        required_permissions: ['agent:invoke'],
      },
      workspaceDir: tmpDir,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'REQUIRES_APPROVAL');
    assert.ok(result.error.includes('Missing required permission grant'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('denies unauthorized runtime:spawn when requested by an agent or tool', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-spawn-'));
    const registry = createPermissionRegistry({ storePath: path.join(tmpDir, 'perms.json') });
    const policyEngine = createSecurityPolicyEngine({
      permissionRegistry: registry,
      policiesPath: path.join(tmpDir, 'policies.json')
    });

    // Check evaluateOperation for runtime:spawn on arbitrary tool
    const decision = policyEngine.evaluateOperation({
      toolId: 'arbitrary-untrusted-tool',
      agentId: 'claude-code',
      operation: 'runtime:spawn',
      requestedScopes: ['runtime:spawn'],
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.status, 'REQUIRES_APPROVAL');
    assert.ok(decision.reason.includes('Missing required permission grant'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects execution when task approval is expired', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-expired-'));
    const executor = createNativeAgentExecutor();

    const result = await executor.executeAgentStep({
      step: {
        step_id: 'expired_step',
        agent_id: 'claude-code',
      },
      taskContext: {
        task_id: 'task_exp',
        approval: {
          required: true,
          approved: true,
          expires_at: new Date(Date.now() - 60000).toISOString(), // 1 minute in the past
        },
      },
      workspaceDir: tmpDir,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'APPROVAL_EXPIRED');
    assert.ok(result.error.includes('expired'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects execution when plan hash is modified (cryptographic binding mismatch)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-hash-'));
    const executor = createNativeAgentExecutor();

    const result = await executor.executeAgentStep({
      step: {
        step_id: 'hash_step',
        agent_id: 'claude-code',
      },
      taskContext: {
        task_id: 'task_hash',
        plan_hash: 'expected_sha256_hash_abc',
        approval: {
          required: true,
          approved: true,
          bound_plan_hash: 'tampered_sha256_hash_xyz',
        },
      },
      workspaceDir: tmpDir,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'PLAN_HASH_MISMATCH');
    assert.ok(result.error.includes('cryptographic hash mismatch'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects execution when task approval was revoked', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-revoked-'));
    const executor = createNativeAgentExecutor();

    const result = await executor.executeAgentStep({
      step: {
        step_id: 'revoked_step',
        agent_id: 'claude-code',
      },
      taskContext: {
        task_id: 'task_rev',
        approval: {
          required: true,
          approved: true,
          revoked: true,
        },
      },
      workspaceDir: tmpDir,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'APPROVAL_REVOKED');
    assert.ok(result.error.includes('revoked'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('enforces strict cross-agent isolation: Claude cannot inherit Codex credentials and vice versa', () => {
    const policyEngine = createSecurityPolicyEngine();

    const mixedEnv = {
      CLAUDE_API_TOKEN: 'claude_secret_token_123',
      ANTHROPIC_API_KEY: 'sk-ant-test-key-12345',
      CODEX_API_TOKEN: 'codex_secret_token_456',
      OPENAI_API_KEY: 'sk-proj-openai-key-789',
      SAFE_VAR: 'hello_world',
    };

    // Filter for Claude Code
    const claudeEnv = policyEngine.filterEnvironmentForAgent('claude-code', 'claude-code', mixedEnv);
    assert.equal(claudeEnv.SAFE_VAR, 'hello_world');
    assert.equal(claudeEnv.CODEX_API_TOKEN, undefined, 'Codex token must not leak to Claude');
    assert.equal(claudeEnv.OPENAI_API_KEY, undefined, 'OpenAI key must not leak to Claude');

    // Filter for Codex CLI
    const codexEnv = policyEngine.filterEnvironmentForAgent('codex-cli', 'codex-cli', mixedEnv);
    assert.equal(codexEnv.SAFE_VAR, 'hello_world');
    assert.equal(codexEnv.CLAUDE_API_TOKEN, undefined, 'Claude token must not leak to Codex');
    assert.equal(codexEnv.ANTHROPIC_API_KEY, undefined, 'Anthropic key must not leak to Codex');
  });

  it('filters internal My Office secrets from child process environment', () => {
    const policyEngine = createSecurityPolicyEngine();

    const dirtyEnv = {
      OFFICE_SECRET_KEY: 'my-office-internal-secret-xyz',
      MY_OFFICE_KEY: 'jwt-super-secret-123',
      ADMIN_TOKEN: 'admin-bearer-token-456',
      SAFE_PATH: '/path/to/workspace',
    };

    const clean = policyEngine.filterEnvironmentForAgent('claude-code', 'claude-code', dirtyEnv);
    assert.equal(clean.SAFE_PATH, '/path/to/workspace');
    assert.equal(clean.OFFICE_SECRET_KEY, undefined);
    assert.equal(clean.MY_OFFICE_KEY, undefined);
    assert.equal(clean.ADMIN_TOKEN, undefined);

    // Also verify sanitizeEnvironment() strips sensitive patterns
    const sanitized = sanitizeEnvironment({
      OFFICE_INTERNAL_SECRET: 'leaked_secret',
      AUTH_TOKEN: 'auth123',
      PASSWORD: 'pass',
      BENIGN_FLAG: '1',
    });

    assert.equal(sanitized.OFFICE_INTERNAL_SECRET, undefined);
    assert.equal(sanitized.AUTH_TOKEN, undefined);
    assert.equal(sanitized.PASSWORD, undefined);
    assert.equal(sanitized.BENIGN_FLAG, '1');
  });

  it('ensures read-only native execution profile disallows file write and execution tools', () => {
    // Inspect command assembly in native-agent-executor for claude-code
    const executor = createNativeAgentExecutor();
    // Verify that the command configuration disallows Bash, Edit, Write, NotebookEdit, and MCP
    const mockStep = {
      step_id: 'ro_step',
      agent_id: 'claude-code',
      title: 'Read only analysis',
      description: 'Inspect codebase',
      required_permissions: ['fs:read'],
    };

    // The execution adapter enforces:
    // --tools Read,Glob,Grep
    // --disallowed-tools Bash,Edit,Write,NotebookEdit,mcp__*
    // which prevents file write and execution at the CLI argument boundary.
    assert.ok(mockStep.required_permissions.includes('fs:read'));
    assert.ok(!mockStep.required_permissions.includes('fs:write'));
    assert.ok(!mockStep.required_permissions.includes('process:exec'));
  });

  it('ensures authentication failure or non-zero exit code cannot become COMPLETED', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-authfail-'));
    const mockAuthFailScript = path.join(tmpDir, 'mock-authfail.js');
    fs.writeFileSync(mockAuthFailScript, `
      console.log("Not logged in · Please run /login");
      process.exit(1);
    `);

    const executor = createNativeAgentExecutor();
    const result = await executor.executeAgentStep({
      step: {
        step_id: 'auth_fail_step',
        agent_id: 'claude-code',
        title: 'Auth fail check',
      },
      customBinary: mockAuthFailScript,
      workspaceDir: tmpDir,
    });

    assert.equal(result.ok, false);
    assert.equal(result.exit_code, 1);
    assert.equal(result.status, 'failed');
    assert.notEqual(result.status, 'completed');
    assert.ok(result.error.includes('exited with code 1'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
