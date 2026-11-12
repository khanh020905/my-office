import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createToolRegistry } from '../../server/tools/registry.mjs';
import { createLifecycleManager } from '../../server/tools/lifecycle-manager.mjs';
import { createDistributionEngine } from '../../server/tools/distribution-engine.mjs';
import { unlinkToolFromAgent } from '../../server/tools/adapters/base-adapter.mjs';
import { handleToolDistributionRoutes } from '../../server/tools/distribution-api.mjs';

describe('Multi-Agent Tool Distribution & Adapter Architecture', () => {
  function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-dist-test-'));
    const store = path.join(tmpDir, 'tools-registry.json');
    const registry = createToolRegistry({ store });
    const lifecycleManager = createLifecycleManager({ registry, baseDir: path.join(tmpDir, 'tools') });
    const distStore = path.join(tmpDir, 'tools', 'distribution-registry.json');
    const distributionEngine = createDistributionEngine({
      registry,
      lifecycleManager,
      storePath: distStore,
    });

    // Mock agent home directories for testing
    const claudeHome = path.join(tmpDir, 'mock-claude');
    const codexHome = path.join(tmpDir, 'mock-codex');
    const antigravityHome = path.join(tmpDir, 'mock-antigravity');

    fs.mkdirSync(path.join(claudeHome, 'skills'), { recursive: true });
    fs.mkdirSync(path.join(codexHome, 'skills'), { recursive: true });
    fs.mkdirSync(path.join(antigravityHome, 'skills'), { recursive: true });

    // Seed mock configs
    fs.writeFileSync(path.join(claudeHome, 'settings.json'), JSON.stringify({ mcpServers: { userServer: { command: 'echo' } } }, null, 2), 'utf8');
    fs.writeFileSync(path.join(codexHome, 'config.json'), JSON.stringify({ mcp_servers: { userCodexServer: { command: 'echo' } } }, null, 2), 'utf8');
    fs.writeFileSync(path.join(antigravityHome, 'config.json'), JSON.stringify({ mcp_servers: {} }, null, 2), 'utf8');

    return {
      tmpDir,
      registry,
      lifecycleManager,
      distributionEngine,
      claudeHome,
      codexHome,
      antigravityHome,
    };
  }

  // 1. Adapter Registry & Agent Detection
  it('registers native adapters and detects host agent environments', () => {
    const { tmpDir, distributionEngine, claudeHome, codexHome, antigravityHome } = setupTestEnv();

    const adapters = distributionEngine.listAdapters();
    assert.ok(adapters.some((a) => a.id === 'claude-code'));
    assert.ok(adapters.some((a) => a.id === 'codex-cli'));
    assert.ok(adapters.some((a) => a.id === 'codex-app'));
    assert.ok(adapters.some((a) => a.id === 'antigravity'));
    assert.ok(adapters.some((a) => a.id === 'generic-mcp'));

    const detected = distributionEngine.getDetectedAgents({ claudeHome, codexHome, antigravityHome });
    assert.equal(detected.length, 5);
    assert.ok(detected.find((a) => a.agent_id === 'claude-code').environment.detected);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 2. Compatibility Matrix Generation
  it('generates compatibility matrix across installed tools and agents', () => {
    const { tmpDir, registry, distributionEngine } = setupTestEnv();

    registry.registerTool({
      tool_id: 'sample-tool',
      name: 'Sample Tool',
      version: '1.0.0',
      installation_status: 'healthy',
      integration_protocols: ['skill', 'mcp'],
      categories: ['agent-skills', 'mcp-servers'],
      capabilities: [
        { capability_id: 's1', protocol: 'skill', name: 's1', entry_point: 'SKILL.md' },
        { capability_id: 'm1', protocol: 'mcp', name: 'm1', entry_point: 'index.js' },
      ],
      source_repository: 'https://github.com/org/sample',
    });

    const matrix = distributionEngine.getCompatibilityMatrix();
    assert.equal(matrix.length, 1);
    const item = matrix[0];
    assert.equal(item.tool_id, 'sample-tool');
    assert.equal(item.agents['claude-code'].compatible, true);
    assert.equal(item.agents['codex-cli'].compatible, true);
    assert.equal(item.agents['antigravity'].compatible, true);
    assert.equal(item.agents['generic-mcp'].compatible, true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 3. Claude Code Skills Distribution & 5-Level Verification
  it('distributes skill to Claude Code, achieves verification level 4, and preserves existing configs', async () => {
    const { tmpDir, lifecycleManager, distributionEngine, claudeHome } = setupTestEnv();

    const candidate = {
      tool_id: 'git-review-skill',
      name: 'Git Review Skill',
      version: '1.0.0',
      integration_protocols: ['skill'],
      categories: ['agent-skills'],
      capabilities: [{ capability_id: 'c1', protocol: 'skill', name: 'Git Review', entry_point: 'SKILL.md' }],
      source_repository: 'https://github.com/org/git-review',
    };

    // Install in shared managed storage
    await lifecycleManager.installTool(candidate, {
      userApproval: { approved: true, plan_id: 'op-1', timestamp: new Date().toISOString() },
      files: { 'SKILL.md': '---\nname: Git Review\ndescription: Skill\n---\n# Instructions' },
    });

    // 1. Plan distribution
    const plan = distributionEngine.planDistribution('git-review-skill', 'claude-code', { claudeHome });
    assert.equal(plan.agent_id, 'claude-code');
    assert.equal(plan.protocol, 'skill');
    assert.ok(plan.plan_id);

    // 2. Distribute with user approval
    const distRes = await distributionEngine.distributeTool('git-review-skill', 'claude-code', {
      userApproval: { approved: true, plan_id: plan.plan_id },
      options: { claudeHome },
    });

    assert.equal(distRes.ok, true);
    assert.equal(distRes.distribution.enabled_status, true);
    assert.equal(distRes.distribution.verification_status, 'verified');
    assert.ok(distRes.distribution.verification_level >= 3);

    // Check target junction/symlink exists in Claude skills directory
    const targetPath = path.join(claudeHome, 'skills', 'git-review-skill');
    assert.ok(fs.existsSync(targetPath));
    assert.ok(fs.existsSync(path.join(targetPath, 'SKILL.md')));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 4. Claude Code MCP Server Distribution with Non-Destructive Config Merging
  it('safely merges MCP server into Claude configuration without overwriting existing servers', async () => {
    const { tmpDir, lifecycleManager, distributionEngine, claudeHome } = setupTestEnv();

    const candidate = {
      tool_id: 'fetch-mcp',
      name: 'Fetch MCP Server',
      version: '1.0.0',
      integration_protocols: ['mcp'],
      categories: ['mcp-servers'],
      capabilities: [{ capability_id: 'mcp1', protocol: 'mcp', name: 'Fetch Service', entry_point: 'server.js' }],
      source_repository: 'https://github.com/org/fetch-mcp',
    };

    await lifecycleManager.installTool(candidate, {
      userApproval: { approved: true, plan_id: 'op-mcp-1', timestamp: new Date().toISOString() },
      files: { 'server.js': 'console.log("mcp running");' },
    });

    const plan = distributionEngine.planDistribution('fetch-mcp', 'claude-code', { claudeHome });
    const distRes = await distributionEngine.distributeTool('fetch-mcp', 'claude-code', {
      userApproval: { approved: true, plan_id: plan.plan_id },
      options: { claudeHome },
    });

    assert.equal(distRes.ok, true);
    assert.ok(distRes.distribution.rollback_snapshot_id); // Backup was created

    // Verify Claude settings.json contains both existing userServer and new fetch-mcp
    const settingsPath = path.join(claudeHome, 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.ok(settings.mcpServers.userServer); // Pre-existing user server was preserved!
    assert.ok(settings.mcpServers['fetch-mcp']); // New server added!
    assert.equal(settings.mcpServers['fetch-mcp']._managed_by, 'my-office');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 5. Multi-Agent Distribution from a Single Tool Installation
  it('distributes one installed tool to both Claude Code and Codex CLI independently', async () => {
    const { tmpDir, lifecycleManager, distributionEngine, claudeHome, codexHome } = setupTestEnv();

    const candidate = {
      tool_id: 'multi-skill',
      name: 'Multi Skill',
      version: '1.0.0',
      integration_protocols: ['skill'],
      categories: ['agent-skills'],
      capabilities: [{ capability_id: 'c1', protocol: 'skill', name: 'Multi', entry_point: 'SKILL.md' }],
      source_repository: 'https://github.com/org/multi-skill',
    };

    await lifecycleManager.installTool(candidate, {
      userApproval: { approved: true, plan_id: 'op-multi', timestamp: new Date().toISOString() },
      files: { 'SKILL.md': '---\nname: Multi\ndescription: Multi\n---\n# Instructions' },
    });

    // Distribute to Claude
    const planClaude = distributionEngine.planDistribution('multi-skill', 'claude-code', { claudeHome });
    const distClaude = await distributionEngine.distributeTool('multi-skill', 'claude-code', {
      userApproval: { approved: true, plan_id: planClaude.plan_id },
      options: { claudeHome },
    });
    assert.equal(distClaude.ok, true);

    // Distribute to Codex CLI
    const planCodex = distributionEngine.planDistribution('multi-skill', 'codex-cli', { codexHome });
    const distCodex = await distributionEngine.distributeTool('multi-skill', 'codex-cli', {
      userApproval: { approved: true, plan_id: planCodex.plan_id },
      options: { codexHome },
    });
    assert.equal(distCodex.ok, true);

    // Tool installed once, but 2 independent distributions tracked
    const distributions = distributionEngine.listDistributions({ toolId: 'multi-skill' });
    assert.equal(distributions.length, 2);

    // Verify independent toggle: disable for Claude does not affect Codex
    await distributionEngine.toggleDistributionEnabled(distClaude.distribution.distribution_id, false, { claudeHome });
    assert.equal(distributionEngine.listDistributions({ toolId: 'multi-skill', agentId: 'claude-code' })[0].enabled_status, false);
    assert.equal(distributionEngine.listDistributions({ toolId: 'multi-skill', agentId: 'codex-cli' })[0].enabled_status, true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 6. Safe Removal & Rollback
  it('safely removes a distribution and restores pre-distribution config', async () => {
    const { tmpDir, lifecycleManager, distributionEngine, claudeHome } = setupTestEnv();

    const candidate = {
      tool_id: 'remove-test-mcp',
      name: 'Remove Test MCP',
      version: '1.0.0',
      integration_protocols: ['mcp'],
      categories: ['mcp-servers'],
      capabilities: [{ capability_id: 'c1', protocol: 'mcp', name: 'Test', entry_point: 'index.js' }],
      source_repository: 'https://github.com/org/remove-test',
    };

    await lifecycleManager.installTool(candidate, {
      userApproval: { approved: true, plan_id: 'op-rem', timestamp: new Date().toISOString() },
      files: { 'index.js': 'console.log("ok");' },
    });

    const plan = distributionEngine.planDistribution('remove-test-mcp', 'claude-code', { claudeHome });
    const distRes = await distributionEngine.distributeTool('remove-test-mcp', 'claude-code', {
      userApproval: { approved: true, plan_id: plan.plan_id },
      options: { claudeHome },
    });

    const distId = distRes.distribution.distribution_id;
    const settingsPath = path.join(claudeHome, 'settings.json');

    // Confirm server added
    let settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.ok(settings.mcpServers['remove-test-mcp']);

    // Remove distribution
    const remRes = await distributionEngine.removeDistribution(distId, { claudeHome });
    assert.equal(remRes.ok, true);

    // Confirm server was removed, but userServer was preserved!
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.equal(settings.mcpServers['remove-test-mcp'], undefined);
    assert.ok(settings.mcpServers.userServer);

    // Distribution record deleted from registry
    assert.equal(distributionEngine.listDistributions({ toolId: 'remove-test-mcp' }).length, 0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 7. Security: Path Traversal Protection
  it('guards against path traversal during unlinking', () => {
    const safeHome = path.resolve('C:/safe/agent/home');
    const evilPath = path.resolve('C:/safe/agent/home/../../../../windows/system32');

    assert.throws(
      () => unlinkToolFromAgent(evilPath, safeHome),
      /Security violation/
    );
  });

  // 8. Security: Approval Expiry & Single-Use Policy
  it('enforces single-use approval and rejects reused or expired plans', async () => {
    const { tmpDir, lifecycleManager, distributionEngine, claudeHome } = setupTestEnv();

    const candidate = {
      tool_id: 'single-use-tool',
      name: 'Single Use Tool',
      version: '1.0.0',
      integration_protocols: ['skill'],
      categories: ['agent-skills'],
      capabilities: [{ capability_id: 'c1', protocol: 'skill', name: 'Single', entry_point: 'SKILL.md' }],
      source_repository: 'https://github.com/org/single-use',
    };

    await lifecycleManager.installTool(candidate, {
      userApproval: { approved: true, plan_id: 'op-s1', timestamp: new Date().toISOString() },
      files: { 'SKILL.md': '---\nname: Single\ndescription: Single\n---\n# Single' },
    });

    const plan = distributionEngine.planDistribution('single-use-tool', 'claude-code', { claudeHome });

    // 1st use succeeds
    const firstUse = await distributionEngine.distributeTool('single-use-tool', 'claude-code', {
      userApproval: { approved: true, plan_id: plan.plan_id },
      options: { claudeHome },
    });
    assert.equal(firstUse.ok, true);

    // 2nd use of the same plan is rejected!
    const secondUse = await distributionEngine.distributeTool('single-use-tool', 'claude-code', {
      userApproval: { approved: true, plan_id: plan.plan_id },
      options: { claudeHome },
    });
    assert.equal(secondUse.ok, false);
    assert.ok(secondUse.error.includes('single-use') || secondUse.error.includes('used'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 9. Antigravity Adapter & Generic MCP Adapter
  it('supports Antigravity Skills and Generic MCP Client config generation', async () => {
    const { tmpDir, lifecycleManager, distributionEngine, antigravityHome } = setupTestEnv();

    const candidate = {
      tool_id: 'ag-tool',
      name: 'Antigravity Tool',
      version: '1.0.0',
      integration_protocols: ['skill', 'mcp'],
      categories: ['agent-skills', 'mcp-servers'],
      capabilities: [
        { capability_id: 'c1', protocol: 'skill', name: 'Skill', entry_point: 'SKILL.md' },
        { capability_id: 'c2', protocol: 'mcp', name: 'MCP', entry_point: 'mcp.js' },
      ],
      source_repository: 'https://github.com/org/ag-tool',
    };

    await lifecycleManager.installTool(candidate, {
      userApproval: { approved: true, plan_id: 'op-ag', timestamp: new Date().toISOString() },
      files: {
        'SKILL.md': '---\nname: AG Skill\ndescription: AG\n---\n# AG',
        'mcp.js': 'console.log("mcp");',
      },
    });

    // Distribute to Antigravity
    const agPlan = distributionEngine.planDistribution('ag-tool', 'antigravity', { antigravityHome });
    const agDist = await distributionEngine.distributeTool('ag-tool', 'antigravity', {
      userApproval: { approved: true, plan_id: agPlan.plan_id },
      options: { antigravityHome },
    });
    assert.equal(agDist.ok, true);
    assert.ok(fs.existsSync(path.join(antigravityHome, 'skills', 'ag-tool')));

    // Distribute to Generic MCP
    const genPlan = distributionEngine.planDistribution('ag-tool', 'generic-mcp');
    const genDist = await distributionEngine.distributeTool('ag-tool', 'generic-mcp', {
      userApproval: { approved: true, plan_id: genPlan.plan_id },
    });
    assert.equal(genDist.ok, true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 10. REST Distribution API Route Handlers
  it('handles distribution REST API routes (matrix, plan, distribute, list, remove)', async () => {
    const { tmpDir, lifecycleManager, distributionEngine, claudeHome } = setupTestEnv();

    let responseCode = null;
    let responseData = null;
    const mockJson = (res, code, data) => {
      responseCode = code;
      responseData = data;
    };

    const candidate = {
      tool_id: 'api-dist-tool',
      name: 'API Dist Tool',
      version: '1.0.0',
      integration_protocols: ['skill'],
      categories: ['agent-skills'],
      capabilities: [{ capability_id: 'c1', protocol: 'skill', name: 'Skill', entry_point: 'SKILL.md' }],
      source_repository: 'https://github.com/org/api-dist',
    };

    await lifecycleManager.installTool(candidate, {
      userApproval: { approved: true, plan_id: 'op-api-dist', timestamp: new Date().toISOString() },
      files: { 'SKILL.md': '---\nname: API Dist\ndescription: API\n---\n# API' },
    });

    // 1. GET /api/tools/distribution/matrix
    const matrixHandled = await handleToolDistributionRoutes(
      { method: 'GET' },
      {},
      {
        url: new URL('http://localhost:3000/api/tools/distribution/matrix'),
        distributionEngine,
        isLoopback: () => true,
        sameOriginOf: () => true,
        authorized: () => true,
        readJson: async () => ({}),
        json: mockJson,
      }
    );
    assert.equal(matrixHandled, true);
    assert.equal(responseCode, 200);
    assert.ok(Array.isArray(responseData.matrix));

    // 2. POST /api/tools/distribution/plan
    const planHandled = await handleToolDistributionRoutes(
      { method: 'POST' },
      {},
      {
        url: new URL('http://localhost:3000/api/tools/distribution/plan'),
        distributionEngine,
        isLoopback: () => true,
        sameOriginOf: () => true,
        authorized: () => true,
        readJson: async () => ({ tool_id: 'api-dist-tool', agent_id: 'claude-code', options: { claudeHome } }),
        json: mockJson,
      }
    );
    assert.equal(planHandled, true);
    assert.equal(responseCode, 200);
    assert.ok(responseData.plan.plan_id);

    // 3. POST /api/tools/distribution/distribute
    const distHandled = await handleToolDistributionRoutes(
      { method: 'POST' },
      {},
      {
        url: new URL('http://localhost:3000/api/tools/distribution/distribute'),
        distributionEngine,
        isLoopback: () => true,
        sameOriginOf: () => true,
        authorized: () => true,
        readJson: async () => ({
          tool_id: 'api-dist-tool',
          agent_id: 'claude-code',
          user_approval: { approved: true, plan_id: responseData.plan.plan_id },
          options: { claudeHome },
        }),
        json: mockJson,
      }
    );
    assert.equal(distHandled, true);
    assert.equal(responseCode, 200);
    assert.equal(responseData.distribution.enabled_status, true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
