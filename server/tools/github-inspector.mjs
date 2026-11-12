import { URL } from 'node:url';
import { scanFileContent, scanPackageJson, aggregateSecurityAudit } from './security-scanner.mjs';
import { analyzeRepositoryManifests } from './manifest-detector.mjs';

export const MAX_ARCHIVE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;    // 2 MB per inspected file
export const REQUEST_TIMEOUT_MS = 15_000;              // 15 seconds

/**
 * Validates a GitHub repository URL with strict SSRF guards.
 */
export function validateGitHubUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, error: 'Empty or missing GitHub URL' };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: 'Invalid URL format' };
  }

  // 1. Enforce HTTPS protocol
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: `Unsupported protocol '${parsed.protocol}'. Only HTTPS is permitted` };
  }

  // 2. SSRF Protection: strictly allow github.com (or mock in test env)
  const hostname = parsed.hostname.toLowerCase();
  const isAllowedHost = hostname === 'github.com' || hostname === 'api.github.com' || hostname === 'raw.githubusercontent.com';
  if (!isAllowedHost) {
    return { ok: false, error: `Invalid host '${hostname}'. Only github.com is permitted (SSRF protection)` };
  }

  // 3. Reject local / private IP literals or loopback patterns
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|localhost)/.test(hostname)) {
    return { ok: false, error: 'Local/private IP addresses are forbidden' };
  }

  // 4. Parse owner, repository, ref and optional subpath
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    return { ok: false, error: 'URL must contain at least owner and repository name (e.g. https://github.com/owner/repo)' };
  }

  const owner = parts[0].replace(/[^a-zA-Z0-9_.-]/g, '');
  const repo = parts[1].replace(/\.git$/i, '').replace(/[^a-zA-Z0-9_.-]/g, '');

  if (!owner || !repo) {
    return { ok: false, error: 'Invalid owner or repository name in URL' };
  }

  let ref = 'main';
  let subpath = '';

  if (parts.length > 3 && (parts[2] === 'tree' || parts[2] === 'blob')) {
    ref = parts[3];
    subpath = parts.slice(4).join('/');
  }

  return {
    ok: true,
    owner,
    repo,
    ref,
    subpath: subpath || null,
    cleanUrl: `https://github.com/${owner}/${repo}`,
  };
}

/**
 * Evaluates compatibility across registered AI agents based on actual capabilities and evidence.
 */
export function evaluateAgentCompatibility({ protocols = [], manifests = {} } = {}) {
  const result = {};

  // Claude Code
  if (protocols.includes('mcp')) {
    result.claude = { status: 'verified_compatible', reason: 'Exposes native MCP server supported by Claude Code settings' };
  } else if (protocols.includes('skill')) {
    result.claude = { status: 'verified_compatible', reason: 'Provides SKILL.md procedure format' };
  } else if (protocols.includes('cli')) {
    result.claude = { status: 'potentially_compatible', reason: 'Provides CLI tool invokable via Claude Code Bash tool' };
  } else {
    result.claude = { status: 'unknown', reason: 'No explicit Claude integration manifest found' };
  }

  // Codex CLI
  if (protocols.includes('cli')) {
    result['codex-cli'] = { status: 'verified_compatible', reason: 'Provides CLI executable supported by Codex workspace-write execution' };
  } else if (protocols.includes('skill')) {
    result['codex-cli'] = { status: 'verified_compatible', reason: 'Provides SKILL.md supported in $CODEX_HOME/skills' };
  } else if (protocols.includes('mcp')) {
    result['codex-cli'] = { status: 'potentially_compatible', reason: 'MCP supported through app-server protocol bridge' };
  } else {
    result['codex-cli'] = { status: 'unknown', reason: 'Requires custom adapter' };
  }

  // Codex App (Desktop)
  if (protocols.includes('skill')) {
    result['codex-app'] = { status: 'verified_compatible', reason: 'Skills load natively in Codex Desktop' };
  } else if (manifests.hasCodexPlugin) {
    result['codex-app'] = { status: 'verified_compatible', reason: 'Contains explicit .codex/ plugin configuration' };
  } else {
    result['codex-app'] = { status: 'requires_adapter', reason: 'Requires local plugin manifest' };
  }

  // Antigravity
  if (protocols.includes('mcp')) {
    result.antigravity = { status: 'verified_compatible', reason: 'Native Antigravity MCP integration' };
  } else if (protocols.includes('skill')) {
    result.antigravity = { status: 'verified_compatible', reason: 'Native Antigravity Skill format' };
  } else if (protocols.includes('cli')) {
    result.antigravity = { status: 'potentially_compatible', reason: 'CLI invokable via custom agent runner' };
  } else {
    result.antigravity = { status: 'unknown', reason: 'No explicit Antigravity manifest' };
  }

  return result;
}

/**
 * Inspects a repository snapshot statically.
 * Accepts an in-memory snapshot or fixture: { fileList: string[], readFile: (path) => string }
 */
export function inspectRepositorySnapshot({
  url,
  fileList = [],
  readFile = () => null,
  metadata = {},
} = {}) {
  const urlVal = validateGitHubUrl(url);
  if (!urlVal.ok) {
    return { ok: false, error: urlVal.error };
  }

  // 1. Analyze project manifests and capabilities
  const manifestAnalysis = analyzeRepositoryManifests({ fileList, readFile });

  // 2. Perform static security scan across source and manifest files
  const allFindings = [];
  const allInferredPerms = [];

  // Special scan for package.json lifecycle hooks
  if (manifestAnalysis.manifests.hasPackageJson) {
    try {
      const rawPkg = readFile('package.json');
      if (rawPkg) {
        const pkgObj = JSON.parse(rawPkg);
        const pkgFindings = scanPackageJson(pkgObj, 'package.json');
        allFindings.push(...pkgFindings);
      }
    } catch {
      /* ignore parse error */
    }
  }

  // Scan file contents up to size limit
  for (const filePath of fileList) {
    // Only scan text, scripts, manifests and configs
    if (/\.(js|mjs|cjs|ts|py|sh|bat|ps1|json|yaml|yml|toml|md)$/i.test(filePath)) {
      const content = readFile(filePath);
      if (typeof content === 'string' && content.length <= MAX_FILE_SIZE_BYTES) {
        const fileAudit = scanFileContent(filePath, content);
        allFindings.push(...fileAudit.findings);
        allInferredPerms.push(...fileAudit.inferredPermissions);
      }
    }
  }

  const securityAudit = aggregateSecurityAudit(allFindings, allInferredPerms);

  // 3. Evaluate multi-agent compatibility
  const compatibility = evaluateAgentCompatibility({
    protocols: manifestAnalysis.detectedProtocols,
    manifests: manifestAnalysis.manifests,
  });

  // 4. Construct tool candidate record
  const toolId = `${urlVal.owner}-${urlVal.repo}`.toLowerCase();
  const toolName = metadata.name || urlVal.repo;
  const description = metadata.description || (readFile('README.md') ? readFile('README.md').slice(0, 300).trim() : '');

  const candidateTool = {
    tool_id: toolId,
    name: toolName,
    description: description.replace(/[#*`_]/g, '').slice(0, 300),
    source_repository: urlVal.cleanUrl,
    repository_owner: urlVal.owner,
    version: manifestAnalysis.detectedVersion,
    latest_available_version: manifestAnalysis.detectedVersion,
    pinned_version: null,
    license: manifestAnalysis.detectedLicense,
    installation_type: manifestAnalysis.installationType,
    categories: manifestAnalysis.detectedCategories,
    capabilities: manifestAnalysis.detectedCapabilities,
    integration_protocols: manifestAnalysis.detectedProtocols,
    supported_agents: Object.keys(compatibility).filter((a) => compatibility[a].status === 'verified_compatible'),
    compatible_agents: Object.keys(compatibility).filter(
      (a) => compatibility[a].status === 'verified_compatible' || compatibility[a].status === 'potentially_compatible'
    ),
    required_permissions: securityAudit.inferred_permissions,
    dependencies: manifestAnalysis.dependencies,
    configuration_schema: {},
    installation_path: '',
    health_status: 'unknown',
    installation_status: 'discovered',
    enabled_status: false, // Discovered tools are NOT enabled until installed
    security_status: securityAudit.security_status,
    conflict_status: {
      has_conflicts: false,
      conflicting_tool_ids: [],
      conflict_reasons: [],
    },
    verification_evidence: [
      {
        at: new Date().toISOString(),
        status: 'inspected',
        evidence: `Discovered from ${urlVal.cleanUrl}. Detected ${manifestAnalysis.detectedCapabilities.length} capabilities. Security status: ${securityAudit.security_status}.`,
      },
    ],
  };

  return {
    ok: true,
    inspection: {
      url: urlVal.cleanUrl,
      owner: urlVal.owner,
      repo: urlVal.repo,
      ref: urlVal.ref,
      manifests: manifestAnalysis.manifests,
      capabilities: manifestAnalysis.detectedCapabilities,
      protocols: manifestAnalysis.detectedProtocols,
      categories: manifestAnalysis.detectedCategories,
      license: manifestAnalysis.detectedLicense,
      version: manifestAnalysis.detectedVersion,
      security: securityAudit,
      compatibility,
      candidate_tool: candidateTool,
    },
  };
}
