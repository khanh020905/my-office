import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createPermissionRegistry } from '../../server/tools/permission-registry.mjs';
import { createSecurityPolicyEngine } from '../../server/tools/security-policy-engine.mjs';
import { createSecurityAuditLogger } from '../../server/tools/security-audit.mjs';
import { handleToolSecurityRoutes } from '../../server/tools/security-api.mjs';

describe('Security API Response Contracts & Data Integrity Shapes', () => {
  function setupTestSecurity() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-shapes-test-'));
    const permStore = path.join(tmpDir, 'perm-reg.json');
    const polStore = path.join(tmpDir, 'policies.json');
    const audStore = path.join(tmpDir, 'audit.log');

    const permissionRegistry = createPermissionRegistry({ storePath: permStore });
    const securityPolicyEngine = createSecurityPolicyEngine({ storePath: polStore });
    const securityAuditLogger = createSecurityAuditLogger({ storePath: audStore });

    const mockRegistry = {
      tools: new Map(),
      registerTool(t) { this.tools.set(t.tool_id, t); },
      getTool(id) { return this.tools.get(id) || null; },
    };

    async function dispatch(method, urlStr, body = null) {
      const url = new URL(urlStr, 'http://127.0.0.1:4310');
      let statusCode = 200;
      let headers = {};
      let responseBody = '';

      const req = {
        method,
        headers: { host: '127.0.0.1:4310', origin: 'http://127.0.0.1:4310' },
        socket: { remoteAddress: '127.0.0.1' },
      };

      const res = {
        set statusCode(c) { statusCode = c; },
        get statusCode() { return statusCode; },
        setHeader(k, v) { headers[k] = v; },
        end(data) { responseBody = data; },
      };

      const handled = await handleToolSecurityRoutes(req, res, {
        url,
        registry: mockRegistry,
        permissionRegistry,
        securityPolicyEngine,
        securityAuditLogger,
        isLoopback: () => true,
        sameOriginOf: () => true,
        authorized: () => true,
        readJson: async () => body || {},
        json: (r, code, data) => {
          statusCode = code;
          responseBody = JSON.stringify(data);
        },
      });

      assert.equal(handled, true, `Route should be handled: ${urlStr}`);
      return {
        status: statusCode,
        data: JSON.parse(responseBody),
      };
    }

    return {
      tmpDir,
      mockRegistry,
      permissionRegistry,
      securityPolicyEngine,
      securityAuditLogger,
      dispatch,
    };
  }

  it('GET /api/tools/security/overview returns valid schema with non-null metrics', async () => {
    const { tmpDir, dispatch } = setupTestSecurity();

    const res = await dispatch('GET', '/api/tools/security/overview');
    assert.equal(res.status, 200);
    assert.equal(res.data.ok, true);
    assert.ok(typeof res.data.overview === 'object');
    assert.ok(typeof res.data.overview.active_grants_count === 'number');
    assert.ok(typeof res.data.overview.total_permissions_count === 'number');
    assert.ok(typeof res.data.overview.enforcement_model === 'string');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/tools/security/permissions enriches orphaned vs installed tool grants', async () => {
    const { tmpDir, mockRegistry, permissionRegistry, dispatch } = setupTestSecurity();

    // 1. Tool installed
    mockRegistry.registerTool({ tool_id: 'installed-tool', installation_status: 'healthy' });
    permissionRegistry.grantPermission({ tool_id: 'installed-tool', agent_id: 'claude-code', scopes: ['fs:read'] });

    // 2. Orphaned grant (tool not in registry)
    permissionRegistry.grantPermission({ tool_id: 'uninstalled-tool', agent_id: 'claude-code', scopes: ['fs:read'] });

    const res = await dispatch('GET', '/api/tools/security/permissions');
    assert.equal(res.status, 200);
    assert.equal(res.data.ok, true);
    assert.equal(res.data.count, 2);
    assert.ok(Array.isArray(res.data.permissions));

    const installedGrant = res.data.permissions.find((p) => p.tool_id === 'installed-tool');
    assert.ok(installedGrant);
    assert.equal(installedGrant.tool_installed, true);
    assert.equal(installedGrant.is_orphaned, false);
    assert.equal(installedGrant.tool_status, 'healthy');

    const orphanedGrant = res.data.permissions.find((p) => p.tool_id === 'uninstalled-tool');
    assert.ok(orphanedGrant);
    assert.equal(orphanedGrant.tool_installed, false);
    assert.equal(orphanedGrant.is_orphaned, true);
    assert.equal(orphanedGrant.tool_status, 'uninstalled');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/tools/security/policies returns policies object AND rules array (prevents map failure)', async () => {
    const { tmpDir, dispatch } = setupTestSecurity();

    const res = await dispatch('GET', '/api/tools/security/policies');
    assert.equal(res.status, 200);
    assert.equal(res.data.ok, true);

    // 1. Object document format
    assert.ok(typeof res.data.policies === 'object', 'policies must be an object');
    assert.ok(!Array.isArray(res.data.policies), 'policies document is an object, not array');
    assert.equal(res.data.policies.default_action, 'DENY');

    // 2. Array rules format (5-level hierarchy)
    assert.ok(Array.isArray(res.data.rules), 'rules must be an array');
    assert.ok(res.data.rules.length >= 3, 'rules must contain at least global, blacklist, and agent levels');

    const lvl1 = res.data.rules.find((r) => r.level === 1);
    assert.ok(lvl1);
    assert.equal(lvl1.action, 'DENY');

    // Verify calling .map() on rules succeeds without error
    const mapped = res.data.rules.map((r) => r.name);
    assert.ok(Array.isArray(mapped));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/tools/security/audit returns total, offset, limit, and events array', async () => {
    const { tmpDir, securityAuditLogger, dispatch } = setupTestSecurity();

    // Log a sample event
    securityAuditLogger.logEvent({
      type: 'OPERATION_EVALUATED',
      severity: 'info',
      decision: 'ALLOW',
      operation: 'fs:read',
    });

    const res = await dispatch('GET', '/api/tools/security/audit?limit=10&offset=0');
    assert.equal(res.status, 200);
    assert.equal(res.data.ok, true);
    assert.equal(res.data.total, 1);
    assert.equal(res.data.limit, 10);
    assert.ok(Array.isArray(res.data.events));
    assert.equal(res.data.events.length, 1);
    assert.equal(res.data.events[0].decision, 'ALLOW');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/tools/security/limitations returns explicit boundary disclosure', async () => {
    const { tmpDir, dispatch } = setupTestSecurity();

    const res = await dispatch('GET', '/api/tools/security/limitations');
    assert.equal(res.status, 200);
    assert.equal(res.data.ok, true);
    assert.ok(res.data.limitations);
    assert.ok(res.data.limitations.disclaimer.includes('Permissions and policies'));
    assert.equal(res.data.limitations.levels.operating_system_level.status, 'PARTIAL / NOT KERNEL-SANDBOXED');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

