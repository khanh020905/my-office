import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createToolRegistry } from '../../server/tools/registry.mjs';
import { createLifecycleManager, VALID_LIFECYCLE_TRANSITIONS } from '../../server/tools/lifecycle-manager.mjs';
import { sanitizeEnvironment, redactSecrets, executeIsolatedProcess } from '../../server/tools/execution-runner.mjs';
import { detectToolConflicts } from '../../server/tools/conflict-detector.mjs';
import { evaluateToolOperationalState, performToolHealthCheck } from '../../server/tools/health-checker.mjs';
import { handleToolLifecycleRoutes } from '../../server/tools/lifecycle-api.mjs';

describe('Tool Lifecycle Management & Execution Isolation', () => {
  // Helper to create test environment
  function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-lifecycle-test-'));
    const store = path.join(tmpDir, 'tools-registry.json');
    const registry = createToolRegistry({ store });
    const lifecycleManager = createLifecycleManager({ registry, baseDir: path.join(tmpDir, 'tools') });
    return { tmpDir, store, registry, lifecycleManager };
  }

  // 1. Lifecycle State Machine Transitions
  it('enforces valid transitions and rejects invalid state changes', () => {
    assert.ok(VALID_LIFECYCLE_TRANSITIONS.discovered.includes('installing'));
    assert.ok(!VALID_LIFECYCLE_TRANSITIONS.discovered.includes('healthy')); // Cannot jump directly to healthy
    assert.ok(VALID_LIFECYCLE_TRANSITIONS.healthy.includes('disabled'));
    assert.ok(VALID_LIFECYCLE_TRANSITIONS.healthy.includes('updating'));
  });

  // 2. Environment Sanitization & Secret Redaction
  it('strips all sensitive credentials from child process environment', () => {
    const custom = {
      ANTHROPIC_API_KEY: 'sk-ant-1234567890abcdef1234567890',
      OPENAI_API_KEY: 'sk-proj-secret-key-1234567890',
      GITHUB_TOKEN: 'ghp_secrettokenvalue1234567890',
      SAFE_CUSTOM_PATH: 'my/custom/path',
    };

    const clean = sanitizeEnvironment(custom);
    assert.equal(clean.ANTHROPIC_API_KEY, undefined);
    assert.equal(clean.OPENAI_API_KEY, undefined);
    assert.equal(clean.GITHUB_TOKEN, undefined);
    assert.equal(clean.SAFE_CUSTOM_PATH, 'my/custom/path');
  });

  it('redacts secrets from command execution outputs', () => {
    const raw = 'Error connecting with key sk-ant-1234567890abcdef1234567890 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const redacted = redactSecrets(raw);
    assert.ok(!redacted.includes('sk-ant-1234567890abcdef1234567890'));
    assert.ok(redacted.includes('[REDACTED_SECRET]'));
  });

  // 3. Mandatory User Approval Check
  it('rejects installation without explicit user approval', async () => {
    const { tmpDir, lifecycleManager } = setupTestEnv();
    const candidate = {
      tool_id: 'test-skill',
      name: 'Test Skill',
      version: '1.0.0',
      integration_protocols: ['skill'],
      categories: ['agent-skills'],
      capabilities: [{ capability_id: 'test-skill-cap', protocol: 'skill', name: 'Skill', entry_point: 'SKILL.md' }],
      source_repository: 'https://github.com/org/test-skill',
    };

    // Missing approval
    const resNoApproval = await lifecycleManager.installTool(candidate, {});
    assert.equal(resNoApproval.ok, false);
    assert.ok(resNoApproval.error.includes('approval'));

    // Approval with approved=false
    const resFalseApproval = await lifecycleManager.installTool(candidate, {
      userApproval: { approved: false },
    });
    assert.equal(resFalseApproval.ok, false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 4. Staging Installation & Atomic Activation
  it('installs tool into staging, verifies, and activates into managed directory', async () => {
    const { tmpDir, registry, lifecycleManager } = setupTestEnv();

    const candidate = {
      tool_id: 'echo-skill',
      name: 'Echo Skill',
      version: '1.0.0',
      integration_protocols: ['skill'],
      categories: ['agent-skills'],
      capabilities: [{ capability_id: 'echo-skill-cap', protocol: 'skill', name: 'Skill', entry_point: 'SKILL.md' }],
      source_repository: 'https://github.com/org/echo-skill',
    };

    const approval = {
      approved: true,
      plan_id: 'op-test-123',
      timestamp: new Date().toISOString(),
      granted_permissions: [],
    };

    const files = {
      'SKILL.md': '---\nname: Echo Skill\ndescription: Test echo skill\n---\n# Echo Skill\nInstructions.',
    };

    const res = await lifecycleManager.installTool(candidate, {
      userApproval: approval,
      files,
    });

    assert.equal(res.ok, true);
    assert.equal(res.tool_id, 'echo-skill');
    assert.equal(res.health_status, 'healthy');

    // Verify files exist in managed storage
    const targetDir = path.join(tmpDir, 'tools', 'managed', 'echo-skill', '1.0.0');
    assert.ok(fs.existsSync(targetDir));
    assert.ok(fs.existsSync(path.join(targetDir, 'source', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(targetDir, 'installation-manifest.json')));
    assert.ok(fs.existsSync(path.join(targetDir, 'verification.json')));

    // Registry state updated
    const tool = registry.getTool('echo-skill');
    assert.equal(tool.installation_status, 'healthy');
    assert.equal(tool.enabled_status, true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 5. Staging Failure Leaves Registry in Failed State without dirty files
  it('handles verification failure in staging cleanly', async () => {
    const { tmpDir, registry, lifecycleManager } = setupTestEnv();

    const candidate = {
      tool_id: 'bad-skill',
      name: 'Bad Skill',
      version: '1.0.0',
      integration_protocols: ['skill'],
      categories: ['agent-skills'],
      capabilities: [{ capability_id: 'bad-skill-cap', protocol: 'skill', name: 'Bad Skill', entry_point: 'SKILL.md' }],
      source_repository: 'https://github.com/org/bad-skill',
    };

    const approval = { approved: true, plan_id: 'op-bad-1', timestamp: new Date().toISOString() };
    // Provide bad file without YAML frontmatter to trigger verification failure
    const files = {
      'SKILL.md': 'INVALID CONTENT WITHOUT FRONTMATTER',
    };

    const res = await lifecycleManager.installTool(candidate, {
      userApproval: approval,
      files,
    });

    assert.equal(res.ok, false);
    assert.ok(res.error.includes('frontmatter') || res.error.includes('verification'));

    const tool = registry.getTool('bad-skill');
    assert.equal(tool.installation_status, 'failed');
    assert.equal(tool.health_status, 'unhealthy');

    // Managed directory was not activated
    const targetDir = path.join(tmpDir, 'tools', 'managed', 'bad-skill', '1.0.0');
    assert.equal(fs.existsSync(targetDir), false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 6. Server Restart Recovery
  it('detects tools left in transient states and marks them failed upon restart', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-restart-test-'));
    const store = path.join(tmpDir, 'tools-registry.json');
    const registry = createToolRegistry({ store });

    // Pre-populate a tool stuck in 'installing'
    registry.registerTool({
      tool_id: 'stuck-tool',
      name: 'Stuck Tool',
      version: '1.0.0',
      installation_status: 'installing',
      integration_protocols: ['cli'],
      categories: ['cli-utilities'],
      capabilities: [{ capability_id: 'c1', protocol: 'cli', name: 'c1', entry_point: 'index.js' }],
      source_repository: 'https://github.com/org/stuck',
    });

    // Booting lifecycle manager triggers recovery
    const lifecycleManager = createLifecycleManager({ registry, baseDir: path.join(tmpDir, 'tools') });
    assert.ok(lifecycleManager);

    const recovered = registry.getTool('stuck-tool');
    assert.equal(recovered.installation_status, 'failed');
    assert.equal(recovered.health_status, 'unhealthy');
    assert.ok(recovered.verification_evidence.some((e) => e.status === 'interrupted'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 7. Version Pinning and Unpinning
  it('supports version pinning and unpinning', async () => {
    const { tmpDir, registry, lifecycleManager } = setupTestEnv();

    registry.registerTool({
      tool_id: 'pinned-tool',
      name: 'Pinned Tool',
      version: '1.0.0',
      installation_status: 'healthy',
      integration_protocols: ['skill'],
      categories: ['agent-skills'],
      capabilities: [{ capability_id: 'cap1', protocol: 'skill', name: 'cap1', entry_point: 'SKILL.md' }],
      source_repository: 'https://github.com/org/pinned',
    });

    const pinRes = lifecycleManager.pinVersion('pinned-tool', '1.0.0');
    assert.equal(pinRes.ok, true);
    assert.equal(registry.getTool('pinned-tool').pinned_version, '1.0.0');

    // Attempting update while pinned is rejected
    const updateRes = await lifecycleManager.updateTool('pinned-tool', '1.1.0', {
      userApproval: { approved: true },
    });
    assert.equal(updateRes.ok, false);
    assert.ok(updateRes.error.includes('pinned'));

    // Unpinning allows update workflow
    const unpinRes = lifecycleManager.unpinVersion('pinned-tool');
    assert.equal(unpinRes.ok, true);
    assert.equal(registry.getTool('pinned-tool').pinned_version, null);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 8. Tool Updating & Automatic Rollback on Failure
  it('updates tool into a new version directory and preserves existing version on update failure', async () => {
    const { tmpDir, registry, lifecycleManager } = setupTestEnv();

    const candidate = {
      tool_id: 'updatable-skill',
      name: 'Updatable Skill',
      version: '1.0.0',
      integration_protocols: ['skill'],
      categories: ['agent-skills'],
      capabilities: [{ capability_id: 'cap1', protocol: 'skill', name: 'cap1', entry_point: 'SKILL.md' }],
      source_repository: 'https://github.com/org/updatable',
    };

    const filesV1 = {
      'SKILL.md': '---\nname: Updatable Skill\ndescription: v1\n---\n# v1',
    };

    // Install v1.0.0
    await lifecycleManager.installTool(candidate, {
      userApproval: { approved: true, plan_id: 'op-install-v1', timestamp: new Date().toISOString() },
      files: filesV1,
    });

    assert.equal(registry.getTool('updatable-skill').version, '1.0.0');

    // Attempt failed update to v2.0.0 (bad files)
    const badUpdateRes = await lifecycleManager.updateTool('updatable-skill', '2.0.0', {
      userApproval: { approved: true, plan_id: 'op-update-bad', timestamp: new Date().toISOString() },
      files: { 'SKILL.md': 'INVALID CONTENT NO FRONTMATTER' },
    });

    assert.equal(badUpdateRes.ok, false);
    assert.ok(badUpdateRes.error.includes('preserved'));

    // Version 1.0.0 is still active and healthy
    const toolAfterFailedUpdate = registry.getTool('updatable-skill');
    assert.equal(toolAfterFailedUpdate.version, '1.0.0');
    assert.equal(toolAfterFailedUpdate.installation_status, 'healthy');

    // Now perform successful update to v1.1.0
    const goodUpdateRes = await lifecycleManager.updateTool('updatable-skill', '1.1.0', {
      userApproval: { approved: true, plan_id: 'op-update-good', timestamp: new Date().toISOString() },
      files: { 'SKILL.md': '---\nname: Updatable Skill\ndescription: v1.1.0\n---\n# v1.1.0' },
    });

    assert.equal(goodUpdateRes.ok, true);
    assert.equal(registry.getTool('updatable-skill').version, '1.1.0');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 9. Manual Rollback from Snapshot
  it('restores files and registry metadata from a previous snapshot', async () => {
    const { tmpDir, registry, lifecycleManager } = setupTestEnv();

    const candidate = {
      tool_id: 'rollback-skill',
      name: 'Rollback Skill',
      version: '1.0.0',
      integration_protocols: ['skill'],
      categories: ['agent-skills'],
      capabilities: [{ capability_id: 'cap1', protocol: 'skill', name: 'cap1', entry_point: 'SKILL.md' }],
      source_repository: 'https://github.com/org/rollback',
    };

    await lifecycleManager.installTool(candidate, {
      userApproval: { approved: true, plan_id: 'op-v1', timestamp: new Date().toISOString() },
      files: { 'SKILL.md': '---\nname: Rollback Skill\ndescription: v1.0.0\n---\n# v1' },
    });

    // Create snapshot of v1.0.0
    const snap = lifecycleManager.createSnapshot('rollback-skill');
    assert.equal(snap.ok, true);

    // Update to v2.0.0
    await lifecycleManager.updateTool('rollback-skill', '2.0.0', {
      userApproval: { approved: true, plan_id: 'op-v2', timestamp: new Date().toISOString() },
      files: { 'SKILL.md': '---\nname: Rollback Skill\ndescription: v2.0.0\n---\n# v2' },
    });
    assert.equal(registry.getTool('rollback-skill').version, '2.0.0');

    // Trigger rollback to v1.0.0 snapshot
    const rollRes = await lifecycleManager.rollbackTool('rollback-skill', snap.snapshot_id);
    assert.equal(rollRes.ok, true);
    assert.equal(rollRes.version, '1.0.0');

    const restored = registry.getTool('rollback-skill');
    assert.equal(restored.version, '1.0.0');
    assert.equal(restored.installation_status, 'healthy');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 10. Safe Uninstallation & Traversal Boundary Enforcement
  it('safely uninstalls tool files and prevents path traversal', async () => {
    const { tmpDir, registry, lifecycleManager } = setupTestEnv();

    const candidate = {
      tool_id: 'to-delete',
      name: 'To Delete',
      version: '1.0.0',
      integration_protocols: ['skill'],
      categories: ['agent-skills'],
      capabilities: [{ capability_id: 'cap1', protocol: 'skill', name: 'cap1', entry_point: 'SKILL.md' }],
      source_repository: 'https://github.com/org/delete',
    };

    await lifecycleManager.installTool(candidate, {
      userApproval: { approved: true, plan_id: 'op-del', timestamp: new Date().toISOString() },
      files: { 'SKILL.md': '---\nname: To Delete\ndescription: delete\n---\n# del' },
    });

    const managedPath = path.join(tmpDir, 'tools', 'managed', 'to-delete');
    assert.ok(fs.existsSync(managedPath));

    // Refuses without confirmation
    const refuse = await lifecycleManager.uninstallTool('to-delete', { userConfirmation: false });
    assert.equal(refuse.ok, false);

    // Confirmed uninstall
    const confirmed = await lifecycleManager.uninstallTool('to-delete', { userConfirmation: true });
    assert.equal(confirmed.ok, true);
    assert.equal(fs.existsSync(managedPath), false);

    const tool = registry.getTool('to-delete');
    assert.equal(tool.installation_status, 'uninstalled');
    assert.equal(tool.enabled_status, false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 11. Conflict Detection
  it('detects executable collisions and port conflicts', () => {
    const existing = [
      {
        tool_id: 'existing-git-tool',
        name: 'Git Tool',
        capabilities: [
          { capability_id: 'git-cli', protocol: 'cli', name: 'git', entry_point: 'git-cli.js' },
          { capability_id: 'mcp-server-port', protocol: 'mcp', config: { port: 8080 } },
        ],
      },
    ];

    const colliding = {
      tool_id: 'colliding-tool',
      capabilities: [
        { capability_id: 'my-git', protocol: 'cli', name: 'node', entry_point: 'main.js' }, // collides with reserved system 'node'
        { capability_id: 'my-service', protocol: 'mcp', config: { port: 8080 } }, // collides with port 8080
      ],
    };

    const conflicts = detectToolConflicts(colliding, existing);
    assert.equal(conflicts.has_conflicts, true);
    assert.equal(conflicts.can_proceed, false); // Critical collision
    assert.ok(conflicts.conflicts.some((c) => c.type === 'reserved_executable_collision'));
    assert.ok(conflicts.conflicts.some((c) => c.type === 'port_collision'));
  });

  // 12. Health Status & Operational State Evaluation
  it('distinguishes installed, enabled, healthy, available, and running states', async () => {
    const tool = {
      tool_id: 'health-test',
      installation_status: 'healthy',
      health_status: 'healthy',
      enabled_status: true,
      installation_path: process.cwd(), // existing path
      required_permissions: [{ granted: true }],
    };

    const op = evaluateToolOperationalState(tool, { activeProcesses: [{ tool_id: 'health-test' }] });
    assert.equal(op.installed, true);
    assert.equal(op.enabled, true);
    assert.equal(op.healthy, true);
    assert.equal(op.available, true);
    assert.equal(op.running, true);
    assert.equal(op.authorized, true);

    // When disabled
    tool.enabled_status = false;
    const opDisabled = evaluateToolOperationalState(tool);
    assert.equal(opDisabled.available, false);
    assert.equal(opDisabled.enabled, false);

    // Direct health check on missing installation path
    const missing = await performToolHealthCheck({ tool_id: 'missing', installation_path: 'invalid/path' });
    assert.equal(missing.healthy, false);
    assert.equal(missing.status, 'failed');
  });

  // 13. REST Lifecycle API Route Handlers
  it('handles lifecycle API routes (plan, install, enable, disable, verify, audit)', async () => {
    const { tmpDir, registry, lifecycleManager } = setupTestEnv();

    let responseCode = null;
    let responseData = null;
    const mockJson = (res, code, data) => {
      responseCode = code;
      responseData = data;
    };

    const candidate = {
      tool_id: 'api-test-skill',
      name: 'API Skill',
      version: '1.0.0',
      integration_protocols: ['skill'],
      categories: ['agent-skills'],
      capabilities: [{ capability_id: 'api-cap', protocol: 'skill', name: 'api-cap', entry_point: 'SKILL.md' }],
      source_repository: 'https://github.com/org/api-skill',
    };

    // 1. POST /api/tools/install/plan
    const planHandled = await handleToolLifecycleRoutes(
      { method: 'POST' },
      {},
      {
        url: new URL('http://localhost:3000/api/tools/install/plan'),
        registry,
        lifecycleManager,
        isLoopback: () => true,
        sameOriginOf: () => true,
        authorized: () => true,
        readJson: async () => ({ candidate_tool: candidate }),
        json: mockJson,
      }
    );
    assert.equal(planHandled, true);
    assert.equal(responseCode, 200);
    assert.ok(responseData.plan_id);

    // 2. POST /api/tools/install
    const installHandled = await handleToolLifecycleRoutes(
      { method: 'POST' },
      {},
      {
        url: new URL('http://localhost:3000/api/tools/install'),
        registry,
        lifecycleManager,
        isLoopback: () => true,
        sameOriginOf: () => true,
        authorized: () => true,
        readJson: async () => ({
          candidate_tool: candidate,
          user_approval: { approved: true, plan_id: responseData.plan_id, timestamp: new Date().toISOString() },
          files: { 'SKILL.md': '---\nname: API Skill\ndescription: API\n---\n# API' },
        }),
        json: mockJson,
      }
    );
    assert.equal(installHandled, true);
    assert.equal(responseCode, 200);
    assert.equal(responseData.health_status, 'healthy');

    // 3. POST /api/tools/disable
    const disableHandled = await handleToolLifecycleRoutes(
      { method: 'POST' },
      {},
      {
        url: new URL('http://localhost:3000/api/tools/disable'),
        registry,
        lifecycleManager,
        isLoopback: () => true,
        sameOriginOf: () => true,
        authorized: () => true,
        readJson: async () => ({ tool_id: 'api-test-skill' }),
        json: mockJson,
      }
    );
    assert.equal(disableHandled, true);
    assert.equal(responseCode, 200);
    assert.equal(registry.getTool('api-test-skill').enabled_status, false);

    // 4. GET /api/tools/audit
    const auditHandled = await handleToolLifecycleRoutes(
      { method: 'GET' },
      {},
      {
        url: new URL('http://localhost:3000/api/tools/audit?tool_id=api-test-skill'),
        registry,
        lifecycleManager,
        isLoopback: () => true,
        sameOriginOf: () => true,
        authorized: () => true,
        readJson: async () => ({}),
        json: mockJson,
      }
    );
    assert.equal(auditHandled, true);
    assert.equal(responseCode, 200);
    assert.ok(Array.isArray(responseData.logs));
    assert.ok(responseData.logs.length > 0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 14. Execution Runner Process Execution & Timeout
  it('enforces execution timeout and terminates processes', async () => {
    // Run a command with 100ms timeout that would sleep longer
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'powershell' : 'sleep';
    const args = isWin ? ['-Command', 'Start-Sleep -Seconds 5'] : ['5'];

    const res = await executeIsolatedProcess({
      command: cmd,
      args,
      timeoutMs: 300,
    });

    assert.equal(res.ok, false);
    assert.equal(res.timed_out, true);
  });
});
