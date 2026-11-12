/**
 * Static Manifest Detector and Capability Analyzer.
 * Parses project metadata files without executing any code.
 */

const LICENSE_PATTERNS = [
  { id: 'MIT', regex: /\bMIT\s+License\b|Permission is hereby granted, free of charge/i },
  { id: 'Apache-2.0', regex: /\bApache License\b.*?Version 2\.0|http:\/\/www\.apache\.org\/licenses\/LICENSE-2\.0/is },
  { id: 'GPL-3.0', regex: /\bGNU GENERAL PUBLIC LICENSE\b.*?Version 3/is },
  { id: 'GPL-2.0', regex: /\bGNU GENERAL PUBLIC LICENSE\b.*?Version 2/is },
  { id: 'AGPL-3.0', regex: /\bGNU AFFERO GENERAL PUBLIC LICENSE\b/i },
  { id: 'LGPL-3.0', regex: /\bGNU LESSER GENERAL PUBLIC LICENSE\b.*?Version 3/is },
  { id: 'BSD-3-Clause', regex: /\bRedistribution and use in source and binary forms\b.*?Neither the name of\b/is },
  { id: 'BSD-2-Clause', regex: /\bRedistribution and use in source and binary forms\b/i },
  { id: 'MPL-2.0', regex: /\bMozilla Public License\b.*?v\.?\s*2\.0/i },
  { id: 'Proprietary', regex: /\bAll Rights Reserved\b|\bProprietary\b|\bCommercial License\b/i },
];

/**
 * Detects license identifier from file text.
 */
export function detectLicenseFromText(text) {
  if (typeof text !== 'string' || !text.trim()) return { id: 'Unknown', confidence: 'none' };
  for (const lic of LICENSE_PATTERNS) {
    if (lic.regex.test(text)) {
      return { id: lic.id, confidence: 'high' };
    }
  }
  return { id: 'Unknown', confidence: 'low' };
}

/**
 * Parses simple YAML-like frontmatter from SKILL.md without external heavy YAML dependencies.
 */
export function parseSkillFrontmatter(content) {
  if (typeof content !== 'string') return null;
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return null;

  const yamlBlock = match[1];
  const result = {};
  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && val) result[key] = val;
    }
  }
  return result;
}

/**
 * Inspects all manifests and file listings in a repository snapshot.
 */
export function analyzeRepositoryManifests({ fileList = [], readFile = () => null } = {}) {
  const manifests = {
    hasPackageJson: fileList.includes('package.json'),
    hasPyprojectToml: fileList.includes('pyproject.toml'),
    hasRequirementsTxt: fileList.includes('requirements.txt'),
    hasCargoToml: fileList.includes('Cargo.toml'),
    hasGoMod: fileList.includes('go.mod'),
    hasDockerfile: fileList.some((f) => f === 'Dockerfile' || f.endsWith('/Dockerfile')),
    hasDockerCompose: fileList.some((f) => f.includes('docker-compose')),
    hasMcpJson: fileList.some((f) => f === 'mcp.json' || f.endsWith('/mcp.json')),
    hasSkillMd: fileList.some((f) => f === 'SKILL.md' || f.endsWith('/SKILL.md')),
    hasAgentsMd: fileList.some((f) => f === 'AGENTS.md' || f.endsWith('/AGENTS.md')),
    hasClaudePlugin: fileList.some((f) => f.startsWith('.claude-plugin/')),
    hasCodexPlugin: fileList.some((f) => f.startsWith('.codex/')),
    hasGithubWorkflows: fileList.some((f) => f.startsWith('.github/workflows/')),
  };

  const detectedCapabilities = [];
  const detectedProtocols = new Set();
  const detectedCategories = new Set(['coding-workflow']);
  const dependencies = { system: [], tools: [], packages: [] };
  let detectedLicense = 'Unknown';
  let detectedVersion = '1.0.0';
  let installationType = 'git';

  // 1. Inspect license files
  const licenseFile = fileList.find((f) => /^(LICENSE|LICENSE\.txt|LICENSE\.md)$/i.test(f));
  if (licenseFile) {
    const licText = readFile(licenseFile);
    if (licText) {
      const parsedLic = detectLicenseFromText(licText);
      detectedLicense = parsedLic.id;
    }
  }

  // 2. Inspect package.json
  if (manifests.hasPackageJson) {
    installationType = 'npm';
    const pkgRaw = readFile('package.json');
    if (pkgRaw) {
      try {
        const pkg = JSON.parse(pkgRaw);
        if (pkg.version) detectedVersion = String(pkg.version);
        if (pkg.license && detectedLicense === 'Unknown') detectedLicense = String(pkg.license);

        // Collect packages
        const allPkgDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        dependencies.packages.push(...Object.keys(allPkgDeps));

        // Detect CLI capability
        if (pkg.bin) {
          detectedProtocols.add('cli');
          detectedCategories.add('cli-utilities');
          if (typeof pkg.bin === 'string') {
            detectedCapabilities.push({
              capability_id: `${pkg.name || 'tool'}.cli`,
              name: `${pkg.name || 'Tool'} CLI`,
              protocol: 'cli',
              entry_point: pkg.bin,
            });
          } else if (typeof pkg.bin === 'object') {
            for (const [cmd, entry] of Object.entries(pkg.bin)) {
              detectedCapabilities.push({
                capability_id: `cli.${cmd}`,
                name: `${cmd} command`,
                protocol: 'cli',
                entry_point: String(entry),
              });
            }
          }
        }

        // Detect MCP SDK
        if (allPkgDeps['@modelcontextprotocol/sdk'] || pkg.name?.includes('mcp')) {
          detectedProtocols.add('mcp');
          detectedCategories.add('mcp-servers');
          detectedCapabilities.push({
            capability_id: `${pkg.name || 'tool'}.mcp-server`,
            name: `${pkg.name || 'Tool'} MCP Server`,
            protocol: 'mcp',
            entry_point: pkg.main || 'index.js',
          });
        }
      } catch {
        /* invalid package.json */
      }
    }
  }

  // 3. Inspect pyproject.toml / requirements.txt
  if (manifests.hasPyprojectToml || manifests.hasRequirementsTxt) {
    if (installationType === 'git') installationType = 'python';
    dependencies.system.push('python>=3.10');

    const pyproj = readFile('pyproject.toml') || '';
    if (pyproj) {
      const verMatch = /\bversion\s*=\s*['"]([^'"]+)['"]/.exec(pyproj);
      if (verMatch) detectedVersion = verMatch[1];

      if (pyproj.includes('mcp') || pyproj.includes('modelcontextprotocol')) {
        detectedProtocols.add('mcp');
        detectedCategories.add('mcp-servers');
        detectedCapabilities.push({
          capability_id: 'python.mcp-server',
          name: 'Python MCP Server',
          protocol: 'mcp',
          entry_point: 'mcp',
        });
      }

      if (pyproj.includes('[project.scripts]') || pyproj.includes('[tool.poetry.scripts]')) {
        detectedProtocols.add('cli');
        detectedCategories.add('cli-utilities');
        detectedCapabilities.push({
          capability_id: 'python.cli',
          name: 'Python CLI Entry Point',
          protocol: 'cli',
          entry_point: 'python -m',
        });
      }
    }
  }

  // 4. Inspect mcp.json
  const mcpFile = fileList.find((f) => f === 'mcp.json' || f.endsWith('/mcp.json'));
  if (mcpFile) {
    detectedProtocols.add('mcp');
    detectedCategories.add('mcp-servers');
    const mcpRaw = readFile(mcpFile);
    if (mcpRaw) {
      try {
        const mcpConf = JSON.parse(mcpRaw);
        detectedCapabilities.push({
          capability_id: 'declared.mcp-server',
          name: 'Declared MCP Server',
          protocol: 'mcp',
          entry_point: mcpConf.command || mcpFile,
        });
      } catch {
        /* invalid json */
      }
    }
  }

  // 5. Inspect SKILL.md
  const skillFile = fileList.find((f) => f === 'SKILL.md' || f.endsWith('/SKILL.md'));
  if (skillFile) {
    detectedProtocols.add('skill');
    detectedCategories.add('agent-skills');
    if (installationType === 'git') installationType = 'skill_folder';
    const skillContent = readFile(skillFile);
    const fm = parseSkillFrontmatter(skillContent);
    detectedCapabilities.push({
      capability_id: `skill.${fm?.name || 'procedure'}`,
      name: fm?.name ? `Skill: ${fm.name}` : 'Agent Skill',
      protocol: 'skill',
      entry_point: skillFile,
    });
  }

  // 6. Inspect Cargo.toml
  if (manifests.hasCargoToml) {
    if (installationType === 'git') installationType = 'binary';
    dependencies.system.push('cargo');
    detectedProtocols.add('cli');
    detectedCategories.add('cli-utilities');
  }

  // Fallback default capability if none was explicitly detected
  if (detectedCapabilities.length === 0) {
    detectedCapabilities.push({
      capability_id: 'generic.repository',
      name: 'Repository Content',
      protocol: 'skill',
      entry_point: 'README.md',
    });
    detectedProtocols.add('skill');
  }

  return {
    manifests,
    installationType,
    detectedVersion,
    detectedLicense,
    detectedCapabilities,
    detectedProtocols: [...detectedProtocols],
    detectedCategories: [...detectedCategories],
    dependencies,
  };
}

