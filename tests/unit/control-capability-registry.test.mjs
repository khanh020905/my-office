import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityRegistry } from '../../server/control/capability-registry.mjs';

test('Capability Registry: Truthful status modeling across all 4 providers', async (t) => {
  const mockAdapters = new Map([
    ['claude-code', {
      detectAgent: () => ({
        detected: true,
        installed: true,
        configured: true,
        executable_path: 'C:\\Users\\LENOVO\\AppData\\Roaming\\npm\\claude.cmd',
        version: '1.0.12',
        config_path: 'C:\\Users\\LENOVO\\.claude\\settings.json',
        status: 'FUNCTIONALLY_VERIFIED',
      }),
    }],
    ['codex-cli', {
      detectAgent: () => ({
        detected: true,
        installed: true,
        configured: true,
        executable_path: 'C:\\Users\\LENOVO\\AppData\\Roaming\\npm\\codex.cmd',
        version: '0.4.0',
        status: 'FUNCTIONALLY_VERIFIED',
      }),
    }],
    ['codex-app', {
      detectAgent: () => ({
        detected: true,
        installed: null, // Desktop GUI binary not found in standard paths
        configured: true,
        executable_path: null,
        status: 'CONFIGURED',
        detection_error: 'Desktop GUI application not installed in standard location',
      }),
    }],
    ['antigravity', {
      detectAgent: () => ({
        detected: true,
        installed: true,
        configured: true,
        executable_path: 'C:\\Users\\LENOVO\\.gemini\\antigravity\\bin\\agentapi.bat',
        status: 'CONFIGURED',
      }),
    }],
  ]);

  const mockIntegrationState = {
    get: (agentId, detected) => ({
      ...detected,
      connected: true,
      evidenceStale: false,
      functionallyVerified: agentId === 'claude-code' || agentId === 'codex-cli',
      lastObservedAt: Date.now() - 1000,
    }),
  };

  const registry = createCapabilityRegistry({
    adapters: mockAdapters,
    integrationState: mockIntegrationState,
  });

  await t.test('Claude Code has start, steer, cancel supported and verified; pause unsupported', () => {
    const claude = registry.getAgent('claude-code');
    assert.equal(claude.agentId, 'claude-code');
    assert.equal(claude.installed, true);
    assert.equal(claude.capabilities.start.available, true);
    assert.equal(claude.capabilities.steer.available, true);
    assert.equal(claude.capabilities.cancel.available, true);
    assert.equal(claude.capabilities.pause.available, false);
    assert.equal(claude.capabilities.pause.status, 'unsupported');
    assert.match(claude.capabilities.pause.reason, /external pause API/);
  });

  await t.test('Codex CLI has start and cancel supported; steer and pause unsupported', () => {
    const codexCli = registry.getAgent('codex-cli');
    assert.equal(codexCli.agentId, 'codex-cli');
    assert.equal(codexCli.capabilities.start.available, true);
    assert.equal(codexCli.capabilities.cancel.available, true);
    assert.equal(codexCli.capabilities.steer.available, false);
    assert.equal(codexCli.capabilities.steer.status, 'unsupported');
    assert.equal(codexCli.capabilities.pause.available, false);
  });

  await t.test('Codex App is strictly observed: start, steer, and cancel are unsupported', () => {
    const codexApp = registry.getAgent('codex-app');
    assert.equal(codexApp.agentId, 'codex-app');
    assert.equal(codexApp.capabilities.observe.available, true);
    assert.equal(codexApp.capabilities.inspect_session.available, true);
    assert.equal(codexApp.capabilities.start.available, false);
    assert.equal(codexApp.capabilities.start.status, 'unsupported');
    assert.match(codexApp.capabilities.start.reason, /desktop GUI application/);
    assert.equal(codexApp.capabilities.cancel.available, false);
  });

  await t.test('Antigravity is strictly observer: start, cancel, and pause are unsupported', () => {
    const agy = registry.getAgent('antigravity');
    assert.equal(agy.agentId, 'antigravity');
    assert.equal(agy.capabilities.observe.available, true);
    assert.equal(agy.capabilities.inspect_session.available, true);
    assert.equal(agy.capabilities.start.available, false);
    assert.equal(agy.capabilities.start.status, 'unsupported');
    assert.match(agy.capabilities.start.reason, /integrated as an observer/);
    assert.equal(agy.capabilities.pause.available, false);
  });

  await t.test('isOperationAllowed accurately gates execution', () => {
    assert.equal(registry.isOperationAllowed('claude-code', 'start').allowed, true);
    assert.equal(registry.isOperationAllowed('claude-code', 'pause').allowed, false);
    assert.equal(registry.isOperationAllowed('codex-cli', 'steer').allowed, false);
    assert.equal(registry.isOperationAllowed('codex-app', 'start').allowed, false);
    assert.equal(registry.isOperationAllowed('antigravity', 'start').allowed, false);
    assert.equal(registry.isOperationAllowed('antigravity', 'observe').allowed, true);
  });
});

