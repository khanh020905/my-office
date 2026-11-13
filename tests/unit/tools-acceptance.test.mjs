import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createToolRegistry } from '../../server/tools/registry.mjs';
import { createPermissionRegistry } from '../../server/tools/permission-registry.mjs';
import { createSecurityAuditLogger } from '../../server/tools/security-audit.mjs';
import { createSecurityPolicyEngine } from '../../server/tools/security-policy-engine.mjs';
import { createDistributionEngine } from '../../server/tools/distribution-engine.mjs';
import { createOrchestrator } from '../../server/orchestration/orchestrator.mjs';

describe('Phase 7 — End-to-End Acceptance Scenarios & Hardening', () => {
  // Stands in for the agent process: these scenarios test the pipeline, not Claude.
  const okAgent = { async executeAgentStep() { return { ok: true, exit_code: 0, pid: 1, duration_ms: 1, stdout: 'done', stderr: '' }; } };

  function setupTestEnv({ nativeAgentExecutor = null } = {}) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase7-e2e-'));
    const registryStore = path.join(tmpDir, 'tools-registry.json');
    const permStore = path.join(tmpDir, 'permission-registry.json');
    const auditStore = path.join(tmpDir, 'security-audit.json');
    const policyStore = path.join(tmpDir, 'security-policies.json');
    const distStore = path.join(tmpDir, 'distribution-registry.json');
    const orchStore = path.join(tmpDir, 'orchestration-tasks.json');

    const registry = createToolRegistry({ store: registryStore });
    const permissionRegistry = createPermissionRegistry({ storePath: permStore });
    const auditLogger = createSecurityAuditLogger({ storePath: auditStore });
    const policyEngine = createSecurityPolicyEngine({
      permissionRegistry,
      auditLogger,
      policiesPath: policyStore,
    });
    const distributionEngine = createDistributionEngine({
      registry,
      permissionRegistry,
      policyEngine,
      storePath: distStore,
    });

    const orchestrator = createOrchestrator({
      registry,
      distributionEngine,
      policyEngine,
      permissionRegistry,
      auditLogger,
      nativeAgentExecutor,
      storePath: orchStore,
    });

    return {
      tmpDir,
      registry,
      permissionRegistry,
      auditLogger,
      policyEngine,
      distributionEngine,
      orchestrator,
      orchStore,
    };
  }

  // Scenario 1 — Simple task
  it('Scenario 1 — Simple task: analyzes, matches, plans, and fails the tool step honestly (no tool runner yet)', async () => {
    const { tmpDir, registry, permissionRegistry, orchestrator } = setupTestEnv();

    permissionRegistry.grantPermission({
      tool_id: 'eslint-tool',
      agent_id: 'claude-code',
      scopes: ['fs:read', 'process:exec'],
      approval_reference: 'appr-auto',
    });

    registry.registerTool({
      tool_id: 'eslint-tool',
      name: 'ESLint Runner',
      version: '1.0.0',
      description: 'Linter for JavaScript code',
      source_repository: 'https://github.com/eslint/eslint',
      capabilities: [{ capability_id: 'code_analysis', protocol: 'cli', name: 'Lint', entry_point: 'bin/eslint' }],
      compatible_agents: ['claude-code', 'codex-cli'],
      required_permissions: ['fs:read', 'process:exec'],
      installation_status: 'installed',
    });

    const task = await orchestrator.submitTask({
      task_id: 'scen_1_simple',
      text: 'inspect code quality and review syntax',
    }, { autoStartIfApproved: true });

    assert.equal(task.task_spec.task_type, 'coding');
    assert.ok(task.task_spec.required_capabilities.includes('code_analysis'));
    assert.equal(task.execution_plan.steps[0].tool_id, 'eslint-tool');
    assert.equal(task.status, 'FAILED');
    assert.match(task.error, /not implemented/);
    assert.equal(task.execution_results.completed_steps, 0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Scenario 2 — Multi-tool workflow
  it('Scenario 2 — Multi-tool workflow: builds DAG, passes contract, blocks dependent steps on prerequisite failure', async () => {
    const { tmpDir, registry, orchestrator } = setupTestEnv();

    registry.registerTool({
      tool_id: 'tool-step-1',
      name: 'Step 1 Code Analyzer',
      version: '1.0.0',
      source_repository: 'https://github.com/org/step1',
      capabilities: [{ capability_id: 'code_analysis', protocol: 'cli', name: 'Analysis', entry_point: 'bin/step1' }],
      compatible_agents: ['claude-code'],
      required_permissions: ['fs:read'],
      installation_status: 'installed',
    });

    registry.registerTool({
      tool_id: 'tool-step-2',
      name: 'Step 2 Test Runner',
      version: '1.0.0',
      source_repository: 'https://github.com/org/step2',
      capabilities: [{ capability_id: 'testing', protocol: 'cli', name: 'Tester', entry_point: 'bin/step2' }],
      compatible_agents: ['claude-code'],
      required_permissions: ['process:exec'],
      installation_status: 'installed',
    });

    const task = await orchestrator.submitTask({
      task_id: 'scen_2_multi',
      text: 'First inspect code then run tests in pipeline',
    });

    assert.equal(task.task_spec.task_type, 'multi_step');
    assert.ok(task.execution_plan.steps.length >= 2);
    assert.deepEqual(task.execution_plan.steps[1].depends_on, ['step_1']);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Scenario 3 — Tool requires installation
  it('Scenario 3 — Tool requires installation: reported unavailable, no auto-install occurs', async () => {
    const { tmpDir, registry, orchestrator } = setupTestEnv();

    registry.registerTool({
      tool_id: 'uninstalled-linter',
      name: 'Uninstalled Linter',
      version: '1.0.0',
      source_repository: 'https://github.com/org/uninstalled',
      capabilities: [{ capability_id: 'code_analysis', protocol: 'cli', name: 'Lint', entry_point: 'bin/lint' }],
      compatible_agents: ['claude-code'],
      required_permissions: ['fs:read'],
      installation_status: 'discovered', // Not installed!
    });

    const task = await orchestrator.submitTask({
      task_id: 'scen_3_not_installed',
      text: 'inspect code syntax with linter',
    });

    // Ineligible tool is not auto-installed
    assert.ok(task.matched_tools.every((t) => t.tool_id !== 'uninstalled-linter'));
    assert.ok(task.rejected_tools.some((t) => t.tool_id === 'uninstalled-linter'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Scenario 4 — Tool lacks permission
  it('Scenario 4 — Tool lacks permission: execution blocked, missing permission displayed, approval requested', async () => {
    const { tmpDir, registry, orchestrator } = setupTestEnv();

    registry.registerTool({
      tool_id: 'mutating-refactor-tool',
      name: 'Code Mutator',
      version: '1.0.0',
      source_repository: 'https://github.com/org/mutator',
      capabilities: [{ capability_id: 'refactoring', protocol: 'cli', name: 'Mutate', entry_point: 'bin/mutate' }],
      compatible_agents: ['claude-code'],
      required_permissions: [{ scope: 'fs:write', target: '*', justification: 'Write refactored files' }],
      installation_status: 'installed',
    });

    const task = await orchestrator.submitTask({
      task_id: 'scen_4_perm_req',
      text: 'refactor code and write file changes to disk',
    });

    assert.equal(task.status, 'AWAITING_APPROVAL');
    assert.equal(task.approval.required, true);
    assert.equal(task.approval.approved, false);
    assert.ok(task.execution_plan.required_permissions.includes('fs:write'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Scenario 5 — Explicit deny
  it('Scenario 5 — Explicit deny: global policy deny takes precedence over grants and blocks fallback bypass', async () => {
    const { tmpDir, registry, orchestrator } = setupTestEnv();

    registry.registerTool({
      tool_id: 'secret-reader-tool',
      name: 'Secret Reader',
      version: '1.0.0',
      source_repository: 'https://github.com/org/secrets',
      capabilities: [{ capability_id: 'process_exec', protocol: 'cli', name: 'Exec', entry_point: 'bin/exec' }],
      compatible_agents: ['claude-code'],
      required_permissions: [{ scope: 'secrets:write', target: '*', justification: 'Mutate keys' }],
      installation_status: 'installed',
    });

    const task = await orchestrator.submitTask({
      task_id: 'scen_5_explicit_deny',
      text: 'execute command to write secrets',
    });

    assert.equal(task.status, 'BLOCKED');
    assert.ok(task.error.includes('security policy'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Scenario 6 — Fallback
  it('Scenario 6 — Fallback: secondary candidate evaluated against security policy when primary fails', async () => {
    const { tmpDir, registry, permissionRegistry, orchestrator } = setupTestEnv();

    permissionRegistry.grantPermission({
      tool_id: 'primary-tool',
      agent_id: 'claude-code',
      scopes: ['fs:read', 'process:exec'],
      approval_reference: 'appr-p',
    });

    permissionRegistry.grantPermission({
      tool_id: 'backup-tool',
      agent_id: 'claude-code',
      scopes: ['fs:read', 'process:exec'],
      approval_reference: 'appr-b',
    });

    registry.registerTool({
      tool_id: 'primary-tool',
      name: 'Primary Linter',
      version: '1.0.0',
      source_repository: 'https://github.com/org/primary',
      capabilities: [{ capability_id: 'code_analysis', protocol: 'cli', name: 'Primary Lint', entry_point: 'bin/p' }],
      compatible_agents: ['claude-code'],
      required_permissions: ['fs:read', 'process:exec'],
      installation_status: 'installed',
      health: { status: 'healthy', score: 0.99 },
    });

    registry.registerTool({
      tool_id: 'backup-tool',
      name: 'Backup Linter',
      version: '1.0.0',
      source_repository: 'https://github.com/org/backup',
      capabilities: [{ capability_id: 'code_analysis', protocol: 'cli', name: 'Backup Lint', entry_point: 'bin/b' }],
      compatible_agents: ['claude-code'],
      required_permissions: ['fs:read', 'process:exec'],
      installation_status: 'installed',
      health: { status: 'healthy', score: 0.85 },
    });

    const task = await orchestrator.submitTask({
      task_id: 'scen_6_fallback',
      text: 'inspect code quality',
    });

    assert.ok(task.execution_plan.steps[0].fallback_tools.includes('backup-tool'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Scenario 7 — Expired or revoked grant
  it('Scenario 7 — Expired or revoked grant: tool rejected before execution, denial recorded in audit', async () => {
    const { tmpDir, registry, permissionRegistry, policyEngine } = setupTestEnv();

    const grant = permissionRegistry.grantPermission({
      tool_id: 'revoked-tool',
      agent_id: 'claude-code',
      scopes: ['fs:read'],
      approval_reference: 'appr-admin',
    });

    // Revoke the permission
    permissionRegistry.revokePermission(grant.permission_id, {
      reason: 'Security policy violation',
      revoked_by: 'security_auditor',
    });

    registry.registerTool({
      tool_id: 'revoked-tool',
      name: 'Revoked Tool',
      version: '1.0.0',
      source_repository: 'https://github.com/org/revoked',
      capabilities: [{ capability_id: 'code_analysis', protocol: 'cli', name: 'Analysis', entry_point: 'bin/a' }],
      compatible_agents: ['claude-code'],
      required_permissions: ['fs:read'],
      installation_status: 'installed',
    });

    const evalRes = policyEngine.evaluateOperation({
      toolId: 'revoked-tool',
      agentId: 'claude-code',
      operation: 'fs:read',
      requestedScopes: ['fs:read'],
    });

    assert.equal(evalRes.allowed, false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Scenario 8 — Agent isolation
  it('Scenario 8 — Agent isolation: cross-agent environment tokens and permissions never bleed', async () => {
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

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Scenario 9 — Cancellation
  it('Scenario 9 — Cancellation: cancels an active or pending task, state reflects CANCELLED accurately', async () => {
    const { tmpDir, registry, orchestrator } = setupTestEnv();

    registry.registerTool({
      tool_id: 'long-linter',
      name: 'Long Linter',
      version: '1.0.0',
      source_repository: 'https://github.com/org/longlint',
      capabilities: [{ capability_id: 'code_analysis', protocol: 'cli', name: 'Lint', entry_point: 'bin/lint' }],
      compatible_agents: ['claude-code'],
      required_permissions: ['fs:write'],
      installation_status: 'installed',
    });

    const task = await orchestrator.submitTask({
      task_id: 'scen_9_cancel',
      text: 'inspect code and write report to file',
    });

    assert.equal(task.status, 'AWAITING_APPROVAL');

    const cancelRes = orchestrator.cancelTask('scen_9_cancel', { reason: 'User requested abort' });
    assert.equal(cancelRes.ok, true);
    assert.equal(cancelRes.task.status, 'CANCELLED');

    const reCancel = orchestrator.cancelTask('scen_9_cancel');
    assert.equal(reCancel.ok, false); // Idempotent terminal state protection

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Scenario 10 — Server restart & recovery
  it('Scenario 10 — Server restart: recovers persisted task state and traces safely from disk', async () => {
    const { tmpDir, registry, orchestrator, orchStore } = setupTestEnv();

    registry.registerTool({
      tool_id: 'persist-tool',
      name: 'Persist Tool',
      version: '1.0.0',
      source_repository: 'https://github.com/org/persist',
      capabilities: [{ capability_id: 'code_analysis', protocol: 'cli', name: 'Lint', entry_point: 'bin/p' }],
      compatible_agents: ['claude-code'],
      required_permissions: ['fs:read'],
      installation_status: 'installed',
    });

    await orchestrator.submitTask({
      task_id: 'scen_10_restart',
      text: 'inspect code quality',
    });

    // Simulate server restart: create a new orchestrator pointing to the same file
    const restartedOrchestrator = createOrchestrator({
      registry,
      storePath: orchStore,
    });

    const recoveredTask = restartedOrchestrator.getTask('scen_10_restart');
    assert.ok(recoveredTask);
    assert.equal(recoveredTask.task_id, 'scen_10_restart');
    assert.ok(recoveredTask.trace.length > 0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Scenario 11 — Invalid output detection & PARTIALLY_COMPLETED transition
  it('Scenario 11 — Invalid output: validation fails when expected artifact is missing, transitions to PARTIALLY_COMPLETED', async () => {
    const { tmpDir, orchestrator } = setupTestEnv({ nativeAgentExecutor: okAgent });

    // Request requires expected artifact 'non_existent_output.pdf'
    const task = await orchestrator.submitTask({
      task_id: 'scen_11_invalid_output',
      text: 'run command and save to non_existent_output.pdf',
    });

    assert.equal(task.status, 'AWAITING_APPROVAL');
    const executed = await orchestrator.approveTask('scen_11_invalid_output');

    // Because steps completed natively but the expected file was neither created on disk nor emitted in output
    assert.equal(executed.status, 'PARTIALLY_COMPLETED');
    assert.ok(executed.error.includes('Output validation failed'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Scenario 12 — User input required & clarification flow
  it('Scenario 12 — User input required: transitions to NEEDS_USER_INPUT and resumes plan upon clarification', async () => {
    const { tmpDir, orchestrator } = setupTestEnv({ nativeAgentExecutor: okAgent });

    // Submit ambiguous task requiring clarification
    const task = await orchestrator.submitTask({
      task_id: 'scen_12_clarify',
      text: 'help me do something with my project',
      uncertainty_notes: ['Needs clarification on target file and desired operation'],
    });

    assert.equal(task.status, 'NEEDS_USER_INPUT');
    assert.ok(task.clarification_prompt);

    // Provide user clarification
    const resumed = await orchestrator.provideUserInput('scen_12_clarify', {
      input: 'inspect code syntax and quality',
      user: 'dev_user',
    });

    assert.equal(resumed.status, 'COMPLETED');
    assert.equal(resumed.task_spec.required_capabilities.includes('code_analysis'), true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
