import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_SCHEMA_VERSION,
  INITIAL_CATEGORIES,
  INTEGRATION_PROTOCOLS,
  LIFECYCLE_STATES,
  validateTool,
  validateCapability,
  validatePermission,
  createDefaultToolRecord,
} from '../../server/tools/schemas.mjs';

describe('Universal Tool Registry — Schemas & Validation', () => {
  it('exports valid version and initial categories', () => {
    assert.equal(CURRENT_SCHEMA_VERSION, '1.0.0');
    assert.ok(INITIAL_CATEGORIES.length >= 20);
    assert.ok(INITIAL_CATEGORIES.some((c) => c.id === 'coding-workflow'));
    assert.ok(INITIAL_CATEGORIES.some((c) => c.id === 'code-intelligence'));
    assert.ok(INITIAL_CATEGORIES.some((c) => c.id === 'context-optimization'));
    assert.ok(INITIAL_CATEGORIES.some((c) => c.id === 'token-reduction'));
    assert.ok(INITIAL_CATEGORIES.some((c) => c.id === 'video-generation'));
    assert.ok(INITIAL_CATEGORIES.some((c) => c.id === 'mcp-servers'));
    assert.ok(INTEGRATION_PROTOCOLS.has('mcp'));
    assert.ok(LIFECYCLE_STATES.has('healthy'));
  });

  it('validates capability definitions across supported protocols', () => {
    // Valid CLI capability
    const cliCap = {
      capability_id: 'qa-inspect',
      name: 'Video QA Inspector',
      protocol: 'cli',
      entry_point: 'tools/video_qa.py',
    };
    assert.deepEqual(validateCapability(cliCap), { valid: true, errors: [] });

    // Valid MCP capability
    const mcpCap = {
      capability_id: 'docs-mcp',
      name: 'Docs Search Server',
      protocol: 'mcp',
      entry_point: 'npx -y @modelcontextprotocol/server-everything',
    };
    assert.deepEqual(validateCapability(mcpCap), { valid: true, errors: [] });

    // Invalid protocol
    const badProto = {
      capability_id: 'bad-proto',
      name: 'Bad',
      protocol: 'unsupported-proto',
      entry_point: 'bin/run',
    };
    const badProtoRes = validateCapability(badProto);
    assert.equal(badProtoRes.valid, false);
    assert.ok(badProtoRes.errors[0].includes('invalid protocol'));

    // Missing entry_point
    const missingEntry = {
      capability_id: 'missing-entry',
      name: 'No Entry',
      protocol: 'skill',
    };
    const missingRes = validateCapability(missingEntry);
    assert.equal(missingRes.valid, false);
    assert.ok(missingRes.errors[0].includes('entry_point'));
  });

  it('validates permission definitions', () => {
    const validPerm = {
      scope: 'fs:read',
      target: 'PROJECTS/out/*.mp4',
      justification: 'Read rendered video files for quality analysis',
    };
    assert.deepEqual(validatePermission(validPerm), { valid: true, errors: [] });

    const invalidScope = {
      scope: 'system:root',
      target: '*',
      justification: 'Dangerous',
    };
    const res = validatePermission(invalidScope);
    assert.equal(res.valid, false);
    assert.ok(res.errors[0].includes('invalid scope'));
  });

  it('validates full tool definitions and catches missing fields', () => {
    const validTool = {
      tool_id: 'ponytail-qa',
      name: 'Ponytail Video QA',
      description: 'Autonomous video quality inspection tool',
      source_repository: 'https://github.com/example/ponytail',
      repository_owner: 'example',
      version: '1.2.0',
      license: 'MIT',
      installation_type: 'python',
      categories: ['video-generation', 'testing-qa'],
      capabilities: [
        {
          capability_id: 'ponytail.inspect',
          name: 'Inspect Render',
          protocol: 'cli',
          entry_point: 'tools/video_qa.py',
        },
      ],
      integration_protocols: ['cli'],
      enabled_status: true,
      health_status: 'healthy',
      installation_status: 'installed',
      security_status: 'clean',
    };

    const val = validateTool(validTool);
    assert.equal(val.valid, true);
    assert.deepEqual(val.errors, []);

    // Test rejection of duplicate capabilities in one tool
    const dupCapTool = {
      ...validTool,
      capabilities: [
        { capability_id: 'dup-id', name: 'Cap 1', protocol: 'cli', entry_point: 'bin/1' },
        { capability_id: 'dup-id', name: 'Cap 2', protocol: 'mcp', entry_point: 'bin/2' },
      ],
    };
    const dupRes = validateTool(dupCapTool);
    assert.equal(dupRes.valid, false);
    assert.ok(dupRes.errors.some((e) => e.includes('Duplicate capability_id')));
  });

  it('creates robust default records for tools', () => {
    const raw = {
      tool_id: 'context-compress',
      name: 'Context Compress',
      source_repository: 'https://github.com/example/context-compress',
      capabilities: [
        { capability_id: 'compress', name: 'Token Compression', protocol: 'cli', entry_point: 'bin/compress' },
      ],
      integration_protocols: ['cli'],
    };

    const record = createDefaultToolRecord(raw);
    assert.equal(record.tool_id, 'context-compress');
    assert.equal(record.enabled_status, true);
    assert.equal(record.health_status, 'unknown');
    assert.equal(record.installation_status, 'discovered');
    assert.equal(record.version, '1.0.0');
    assert.deepEqual(record.usage_summary, {
      total_invocations: 0,
      last_used: null,
      success_rate: 1.0,
      average_duration_ms: 0,
    });
  });
});
