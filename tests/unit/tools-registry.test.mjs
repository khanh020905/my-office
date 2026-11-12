import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createToolRegistry } from '../../server/tools/registry.mjs';

describe('Universal Tool Registry — Engine & Persistence', () => {
  let tempDir;
  let registryFile;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'my-office-tools-test-'));
    registryFile = path.join(tempDir, 'registry.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* cleanup best effort */
    }
  });

  it('initializes an empty registry with default categories and saves atomically', () => {
    const reg = createToolRegistry({ file: registryFile });
    assert.equal(reg.size, 0);

    const categories = reg.listCategories();
    assert.ok(categories.length >= 20);
    assert.ok(categories.some((c) => c.id === 'coding-workflow'));

    assert.ok(fs.existsSync(registryFile));
    const saved = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    assert.equal(saved.schema_version, '1.0.0');
    assert.equal(saved.tools.length, 0);
    reg.close();
  });

  it('registers tools with multiple capabilities and protocols', () => {
    const reg = createToolRegistry({ file: registryFile });

    const toolDef = {
      tool_id: 'multi-modal-tool',
      name: 'Omni Multi Tool',
      description: 'Tool exposing both CLI and MCP capabilities',
      source_repository: 'https://github.com/example/omni-tool',
      repository_owner: 'example',
      version: '2.1.0',
      license: 'Apache-2.0',
      installation_type: 'git',
      categories: ['coding-workflow', 'mcp-servers'],
      capabilities: [
        {
          capability_id: 'omni.cli-runner',
          name: 'Omni CLI',
          protocol: 'cli',
          entry_point: 'bin/omni',
        },
        {
          capability_id: 'omni.mcp-server',
          name: 'Omni MCP',
          protocol: 'mcp',
          entry_point: 'server/mcp.mjs',
        },
      ],
      integration_protocols: ['cli', 'mcp'],
      supported_agents: ['claude', 'codex-cli', 'antigravity'],
      compatible_agents: ['claude', 'codex-cli'],
    };

    const res = reg.registerTool(toolDef);
    assert.equal(res.ok, true);
    assert.equal(reg.size, 1);

    const retrieved = reg.getTool('multi-modal-tool');
    assert.equal(retrieved.tool_id, 'multi-modal-tool');
    assert.equal(retrieved.version, '2.1.0');
    assert.equal(retrieved.capabilities.length, 2);
    assert.deepEqual(retrieved.integration_protocols.sort(), ['cli', 'mcp'].sort());

    reg.close();
  });

  it('updates tool metadata, toggles enabled status, and validates inputs', () => {
    const reg = createToolRegistry({ file: registryFile });

    reg.registerTool({
      tool_id: 'sample-tool',
      name: 'Sample Tool',
      source_repository: 'https://github.com/example/sample',
      categories: ['cli-utilities'],
      capabilities: [
        { capability_id: 'run', name: 'Run Sample', protocol: 'cli', entry_point: 'bin/run' },
      ],
      integration_protocols: ['cli'],
    });

    // Toggle enabled
    reg.setToolEnabled('sample-tool', false);
    assert.equal(reg.getTool('sample-tool').enabled_status, false);

    // Update metadata
    const updateRes = reg.updateTool('sample-tool', {
      description: 'Updated description',
      health_status: 'healthy',
    });
    assert.equal(updateRes.ok, true);
    assert.equal(reg.getTool('sample-tool').description, 'Updated description');
    assert.equal(reg.getTool('sample-tool').health_status, 'healthy');

    // Reject invalid update
    const badUpdate = reg.updateTool('sample-tool', {
      installation_status: 'not_a_real_status',
    });
    assert.equal(badUpdate.ok, false);
    assert.ok(badUpdate.errors.length > 0);

    reg.close();
  });

  it('supports custom category creation and category filtering', () => {
    const reg = createToolRegistry({ file: registryFile });

    const catRes = reg.addCategory({
      id: 'custom-hardware',
      name: 'Embedded & Hardware AI',
      description: 'Microcontroller, FPGA, and edge AI tooling',
    });
    assert.equal(catRes.ok, true);
    assert.ok(reg.listCategories().some((c) => c.id === 'custom-hardware'));

    reg.registerTool({
      tool_id: 'edge-flasher',
      name: 'Edge AI Flasher',
      source_repository: 'https://github.com/example/edge-flasher',
      categories: ['custom-hardware'],
      capabilities: [
        { capability_id: 'flash', name: 'Flash Binary', protocol: 'cli', entry_point: 'bin/flash' },
      ],
      integration_protocols: ['cli'],
    });

    const filtered = reg.listTools({ category: 'custom-hardware' });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].tool_id, 'edge-flasher');

    reg.close();
  });

  it('performs dynamic capability matching for the orchestration engine', () => {
    const reg = createToolRegistry({ file: registryFile });

    reg.registerTool({
      tool_id: 'ponytail-qa',
      name: 'Ponytail QA',
      source_repository: 'local/xuongphim',
      categories: ['video-generation', 'testing-qa'],
      capabilities: [
        {
          capability_id: 'video.qa_inspection',
          name: 'Video QA Inspection',
          protocol: 'cli',
          entry_point: 'tools/video_qa.py',
        },
      ],
      integration_protocols: ['cli'],
      compatible_agents: ['claude', 'codex-cli'],
      health_status: 'healthy',
      enabled_status: true,
    });

    reg.registerTool({
      tool_id: 'docs-search',
      name: 'Docs Search MCP',
      source_repository: 'https://github.com/example/docs',
      categories: ['documentation-retrieval'],
      capabilities: [
        {
          capability_id: 'docs.search',
          name: 'Search Documentation',
          protocol: 'mcp',
          entry_point: 'node mcp.js',
        },
      ],
      integration_protocols: ['mcp'],
      compatible_agents: ['claude'],
      health_status: 'healthy',
      enabled_status: true,
    });

    // Match video QA for codex-cli
    const matchesVideo = reg.findToolsForCapabilities({
      capabilities: ['video.qa_inspection'],
      agent: 'codex-cli',
    });
    assert.equal(matchesVideo.length, 1);
    assert.equal(matchesVideo[0].tool_id, 'ponytail-qa');
    assert.equal(matchesVideo[0].capability.capability_id, 'video.qa_inspection');

    // Reject docs-search for codex-cli (not compatible)
    const matchesDocsCodex = reg.findToolsForCapabilities({
      capabilities: ['docs.search'],
      agent: 'codex-cli',
    });
    assert.equal(matchesDocsCodex.length, 0);

    // Accept docs-search for claude
    const matchesDocsClaude = reg.findToolsForCapabilities({
      capabilities: ['docs.search'],
      agent: 'claude',
    });
    assert.equal(matchesDocsClaude.length, 1);

    reg.close();
  });

  it('creates and restores snapshots for rollback', () => {
    const reg = createToolRegistry({ file: registryFile });

    reg.registerTool({
      tool_id: 'rollback-target',
      name: 'Rollback Target Tool',
      version: '1.0.0',
      source_repository: 'https://github.com/example/target',
      categories: ['cli-utilities'],
      capabilities: [
        { capability_id: 'exec', name: 'Exec', protocol: 'cli', entry_point: 'bin/exec' },
      ],
      integration_protocols: ['cli'],
    });

    // Create snapshot before upgrade
    const snapRes = reg.createSnapshot('rollback-target', 'Pre-upgrade to 2.0.0');
    assert.equal(snapRes.ok, true);
    const snapId = snapRes.snapshot.snapshot_id;

    // Perform breaking upgrade
    reg.updateTool('rollback-target', {
      version: '2.0.0',
      name: 'Corrupted Upgrade',
    });
    assert.equal(reg.getTool('rollback-target').version, '2.0.0');
    assert.equal(reg.getTool('rollback-target').name, 'Corrupted Upgrade');

    // Rollback to snapshot
    const restoreRes = reg.restoreSnapshot('rollback-target', snapId);
    assert.equal(restoreRes.ok, true);
    assert.equal(reg.getTool('rollback-target').version, '1.0.0');
    assert.equal(reg.getTool('rollback-target').name, 'Rollback Target Tool');

    reg.close();
  });

  it('records health checks and usage analytics', () => {
    const reg = createToolRegistry({ file: registryFile });

    reg.registerTool({
      tool_id: 'telemetry-tool',
      name: 'Telemetry Tool',
      source_repository: 'https://github.com/example/telemetry',
      categories: ['testing-qa'],
      capabilities: [
        { capability_id: 'run-test', name: 'Run Test', protocol: 'cli', entry_point: 'bin/test' },
      ],
      integration_protocols: ['cli'],
    });

    // Record health check
    reg.recordHealthCheck('telemetry-tool', {
      status: 'healthy',
      evidence: 'CLI returned exit 0 with version 1.0.0',
    });
    assert.equal(reg.getTool('telemetry-tool').health_status, 'healthy');
    assert.equal(reg.getTool('telemetry-tool').verification_evidence.length, 1);

    // Record usage
    reg.recordUsage('telemetry-tool', {
      agent: 'claude',
      durationMs: 450,
      success: true,
    });
    reg.recordUsage('telemetry-tool', {
      agent: 'codex-cli',
      durationMs: 550,
      success: true,
    });

    const tool = reg.getTool('telemetry-tool');
    assert.equal(tool.usage_summary.total_invocations, 2);
    assert.equal(tool.usage_summary.average_duration_ms, 500);
    assert.equal(tool.usage_summary.success_rate, 1.0);
    assert.equal(tool.usage_history.length, 2);

    reg.close();
  });

  it('recovers state from disk when initialized by a new registry instance', () => {
    const reg1 = createToolRegistry({ file: registryFile });
    reg1.registerTool({
      tool_id: 'persisted-tool',
      name: 'Persisted Tool',
      version: '3.0.0',
      source_repository: 'https://github.com/example/persisted',
      categories: ['agent-skills'],
      capabilities: [
        { capability_id: 'skill-run', name: 'Skill Run', protocol: 'skill', entry_point: 'SKILL.md' },
      ],
      integration_protocols: ['skill'],
    });
    reg1.close();

    // Open second instance on same file
    const reg2 = createToolRegistry({ file: registryFile });
    assert.equal(reg2.size, 1);
    const recovered = reg2.getTool('persisted-tool');
    assert.ok(recovered);
    assert.equal(recovered.tool_id, 'persisted-tool');
    assert.equal(recovered.version, '3.0.0');
    assert.equal(recovered.capabilities[0].protocol, 'skill');
    reg2.close();
  });

  it('handles concurrent lock acquisition gracefully', () => {
    // First registry instance acquires exclusive lock
    const reg1 = createToolRegistry({ file: registryFile, lockLeaseMs: 5000 });
    reg1.registerTool({
      tool_id: 'tool-one',
      name: 'Tool One',
      source_repository: 'https://github.com/example/one',
      categories: ['cli-utilities'],
      capabilities: [{ capability_id: 'c1', name: 'C1', protocol: 'cli', entry_point: 'bin/1' }],
      integration_protocols: ['cli'],
    });

    // Second instance attempting to bind while first is active
    const reg2 = createToolRegistry({ file: registryFile, lockLeaseMs: 5000 });
    
    // reg2 did not acquire lock because reg1's process is alive and lease is fresh
    // but reg2 can still read safely
    assert.equal(reg2.hasTool('tool-one'), true);

    reg1.close();
    reg2.close();
  });
});
