import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDistributionEngine } from '../../server/tools/distribution-engine.mjs';
import { claudeAdapter } from '../../server/tools/adapters/claude-adapter.mjs';
import { codexCliAdapter } from '../../server/tools/adapters/codex-cli-adapter.mjs';
import { codexAppAdapter } from '../../server/tools/adapters/codex-app-adapter.mjs';
import { antigravityAdapter } from '../../server/tools/adapters/antigravity-adapter.mjs';
import { genericMcpAdapter } from '../../server/tools/adapters/generic-mcp-adapter.mjs';
import { findHostBinary, probeBinaryVersion } from '../../server/tools/adapters/base-adapter.mjs';

describe('Host Agent Detection & Accurate Independent Statuses', () => {
  it('resolves host binaries on Windows using PATH and wrapper heuristics', () => {
    const nodeBin = findHostBinary('node');
    assert.ok(nodeBin, 'findHostBinary should locate node on host');
    assert.ok(fs.existsSync(nodeBin), 'Located binary must exist on disk');

    const probe = probeBinaryVersion(nodeBin);
    assert.ok(probe.version && probe.version.startsWith('v'), 'node --version should return vX.Y.Z');
    assert.equal(probe.error, null);
  });

  it('detects Claude Code with honest functional verification and evidence', () => {
    const res = claudeAdapter.detectAgent();
    assert.equal(res.agent_id, 'claude-code');
    assert.ok(res.statuses.includes('SUPPORTED'));

    // If host has Claude installed via npm
    const claudeBin = findHostBinary('claude');
    if (claudeBin) {
      assert.equal(res.status, 'FUNCTIONALLY_VERIFIED');
      assert.ok(res.statuses.includes('DETECTED'));
      assert.ok(res.statuses.includes('FUNCTIONALLY_VERIFIED'));
      assert.equal(res.verification_level, 3);
      assert.ok(res.evidence.includes('Executable:'));
      assert.ok(res.version);
    }
  });

  it('detects Codex CLI with honest functional verification and evidence', () => {
    const res = codexCliAdapter.detectAgent();
    assert.equal(res.agent_id, 'codex-cli');
    assert.ok(res.statuses.includes('SUPPORTED'));

    const codexBin = findHostBinary('codex');
    if (codexBin) {
      assert.equal(res.status, 'FUNCTIONALLY_VERIFIED');
      assert.ok(res.statuses.includes('DETECTED'));
      assert.ok(res.statuses.includes('FUNCTIONALLY_VERIFIED'));
      assert.equal(res.verification_level, 3);
      assert.ok(res.evidence.includes('Executable:'));
      assert.ok(res.version);
    }
  });

  it('does NOT report Codex App as fully functional based only on config presence', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-app-test-'));
    const pluginsDir = path.join(tmp, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });

    const res = codexAppAdapter.detectAgent({ codexAppHome: tmp });
    assert.equal(res.agent_id, 'codex-app');
    assert.ok(res.statuses.includes('SUPPORTED'));
    assert.ok(res.statuses.includes('CONFIGURED'));
    assert.ok(res.statuses.includes('NOT_VERIFIED'));
    // Crucial check: cannot be FUNCTIONALLY_VERIFIED without binary
    assert.notEqual(res.status, 'FUNCTIONALLY_VERIFIED');
    assert.ok(res.verification_level <= 1);
    assert.ok(res.evidence.includes('NOT_VERIFIED'));

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('does NOT report Antigravity as fully functional based only on config presence', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'antigravity-test-'));
    fs.mkdirSync(path.join(tmp, 'skills'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'bin', 'agentapi.bat'), '@echo off\n', 'utf8');

    const res = antigravityAdapter.detectAgent({ antigravityHome: tmp, probe: false });
    assert.equal(res.agent_id, 'antigravity');
    assert.ok(res.statuses.includes('SUPPORTED'));
    assert.ok(res.statuses.includes('CONFIGURED'));
    assert.ok(res.statuses.includes('NOT_VERIFIED'));
    // Crucial check: cannot be FUNCTIONALLY_VERIFIED without standalone CLI verified on PATH
    assert.notEqual(res.status, 'FUNCTIONALLY_VERIFIED');
    assert.ok(res.verification_level <= 2);
    assert.ok(res.evidence.includes('NOT_VERIFIED') || res.evidence.includes('Standalone CLI'));

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('reports Generic MCP client as SUPPORTED virtual adapter', () => {
    const res = genericMcpAdapter.detectAgent();
    assert.equal(res.agent_id, 'generic-mcp');
    assert.ok(res.statuses.includes('SUPPORTED'));
    assert.ok(res.verification_level <= 1);
    assert.ok(res.evidence.includes('Model Context Protocol'));
  });

  it('distribution engine returns normalized top-level and environment agent fields', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-engine-test-'));
    const engine = createDistributionEngine({
      registry: { listTools: () => [], getTool: () => null },
      lifecycleManager: {},
      storePath: path.join(tmp, 'dist.json'),
    });

    const agents = engine.getDetectedAgents();
    assert.equal(agents.length, 5);

    for (const a of agents) {
      assert.ok(a.agent_id);
      assert.ok(a.name);
      assert.ok(typeof a.detected === 'boolean');
      assert.ok(a.status);
      assert.ok(Array.isArray(a.statuses));
      assert.ok(typeof a.verification_level === 'number');
      assert.ok(Array.isArray(a.supported_protocols));
      assert.ok(a.evidence);
      assert.ok(a.environment, 'Preserves environment for backward compatibility');
    }

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

