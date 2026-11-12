/**
 * Static Security Scanner for AI Tools & GitHub Repositories.
 * Strictly static analysis — NEVER executes untrusted repository code.
 */

// Critical and suspicious patterns in scripts and code
const DANGEROUS_COMMAND_PATTERNS = [
  { id: 'curl-bash', regex: /\b(curl|wget)\b[^\n|]+(\|\s*(sh|bash|zsh|powershell|cmd))\b/i, severity: 'critical', desc: 'Piping remote web download directly into shell' },
  { id: 'reverse-shell', regex: /\b(nc|ncat|netcat)\b.*?-e\b|\/bin\/(sh|bash)\s+-[il]/i, severity: 'critical', desc: 'Potential reverse shell command' },
  { id: 'base64-eval', regex: /\b(eval|exec)\b.*?base64/i, severity: 'critical', desc: 'Evaluating base64-decoded code at runtime' },
  { id: 'env-stealing', regex: /(?:(?:curl|wget|fetch|axios|requests\.(?:post|get))\b[\s\S]*?(?:process\.env|os\.environ|API_KEY|TOKEN|SECRET)|(?:process\.env|os\.environ|API_KEY|TOKEN|SECRET)[\s\S]*?(?:curl|wget|fetch|axios|requests\.(?:post|get)))/i, severity: 'critical', desc: 'Exfiltrating environment variables or secrets over network' },
  { id: 'sensitive-path-access', regex: /([~/\\]|\b)(id_rsa|id_ed25519|\.ssh|\.aws[/\\]credentials|\.gnupg|\.claude[/\\]settings|\.codex[/\\]auth)/i, severity: 'high', desc: 'Accessing sensitive credentials or private keys' },
  { id: 'arbitrary-exec', regex: /\b(child_process\.(exec|execSync)|subprocess\.(call|Popen)\([^)]*shell\s*=\s*True|os\.system\()/i, severity: 'medium', desc: 'Invoking shell command with potential command injection risk' },
  { id: 'obfuscated-eval', regex: /\beval\s*\(\s*(unescape|decodeURIComponent|String\.fromCharCode|atob)\b/i, severity: 'high', desc: 'Obfuscated string evaluation' },
  { id: 'high-entropy-eval', regex: /\b(eval|Function)\s*\(\s*['"`][A-Za-z0-9+/=]{100,}['"`]\s*\)/i, severity: 'high', desc: 'Execution of long static encoded payload' },
];

const PERMISSION_INFERENCE_PATTERNS = [
  { scope: 'net:outbound', regex: /\b(fetch|axios|http\.request|https\.request|requests\.(get|post|put)|urllib\.request)\b/i, justification: 'Makes outbound network HTTP requests' },
  { scope: 'fs:write', regex: /\b(fs\.(writeFile|writeFileSync|createWriteStream)|open\([^)]*['"][wa\+][^)]*\))\b/i, justification: 'Writes files to the local filesystem' },
  { scope: 'fs:read', regex: /\b(fs\.(readFile|readFileSync|createReadStream)|open\([^)]*['"]r[^)]*\))\b/i, justification: 'Reads files from the local filesystem' },
  { scope: 'process:exec', regex: /\b(child_process|subprocess|os\.system|execFile)\b/i, justification: 'Executes child processes on the host' },
  { scope: 'env:read', regex: /\b(process\.env\.[A-Z0-9_]+|os\.environ\.get\(['"][A-Z0-9_]+['"]\))\b/i, justification: 'Reads environment variables' },
];

/**
 * Scans a file's content statically.
 */
export function scanFileContent(filePath, content) {
  const findings = [];
  const inferredPermissions = new Map();

  if (typeof content !== 'string') return { findings, inferredPermissions: [] };

  // 1. Scan for dangerous code/command execution patterns
  for (const pat of DANGEROUS_COMMAND_PATTERNS) {
    if (pat.regex.test(content)) {
      findings.push({
        rule_id: pat.id,
        file: filePath,
        severity: pat.severity,
        description: pat.desc,
      });
    }
  }

  // 2. Infer required permissions from API usage
  for (const perm of PERMISSION_INFERENCE_PATTERNS) {
    const match = perm.regex.exec(content);
    if (match) {
      if (!inferredPermissions.has(perm.scope)) {
        inferredPermissions.set(perm.scope, {
          scope: perm.scope,
          target: filePath,
          justification: perm.justification,
          granted: false,
          granted_at: null,
        });
      }
    }
  }

  return {
    findings,
    inferredPermissions: [...inferredPermissions.values()],
  };
}

/**
 * Scans package.json specifically for lifecycle hook risks (preinstall, postinstall, etc.).
 */
export function scanPackageJson(packageJson, filePath = 'package.json') {
  const findings = [];
  if (!packageJson || typeof packageJson !== 'object') return findings;

  const scripts = packageJson.scripts || {};
  const dangerousHooks = ['preinstall', 'install', 'postinstall', 'prepublish'];

  for (const hook of dangerousHooks) {
    const cmd = scripts[hook];
    if (typeof cmd === 'string' && cmd.trim()) {
      let severity = 'medium';
      let desc = `Package declares '${hook}' lifecycle script: "${cmd.slice(0, 100)}"`;

      if (/\b(curl|wget)\b/i.test(cmd) && /\b(sh|bash|powershell|node)\b/i.test(cmd)) {
        severity = 'critical';
        desc = `Remote execution in '${hook}' script: "${cmd.slice(0, 100)}"`;
      } else if (/\b(node\s+-e|eval|rm\s+-rf|del\s+\/f)\b/i.test(cmd)) {
        severity = 'high';
        desc = `Potentially destructive command in '${hook}' script: "${cmd.slice(0, 100)}"`;
      }

      findings.push({
        rule_id: `npm-lifecycle-${hook}`,
        file: filePath,
        severity,
        description: desc,
      });
    }
  }

  // Scan dependencies for suspicious git/tarball sources
  const allDeps = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };

  for (const [dep, spec] of Object.entries(allDeps)) {
    if (typeof spec === 'string') {
      if (/^(http:|git\+http:)/i.test(spec)) {
        findings.push({
          rule_id: 'insecure-dependency-transport',
          file: filePath,
          severity: 'medium',
          description: `Dependency '${dep}' uses insecure unencrypted protocol: "${spec}"`,
        });
      }
    }
  }

  return findings;
}

/**
 * Aggregates all file findings and assigns an overall security status.
 */
export function aggregateSecurityAudit(findings, inferredPermissions = []) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

  for (const f of findings) {
    if (counts[f.severity] != null) {
      counts[f.severity]++;
    } else {
      counts.info++;
    }
  }

  let security_status = 'clean';
  if (counts.critical > 0) {
    security_status = 'quarantined';
  } else if (counts.high > 0 || counts.medium > 0) {
    security_status = 'warnings';
  }

  // Deduplicate permissions
  const permMap = new Map();
  for (const p of inferredPermissions) {
    if (!permMap.has(p.scope)) {
      permMap.set(p.scope, p);
    }
  }

  return {
    security_status,
    total_findings: findings.length,
    counts,
    findings: findings.slice(0, 50), // Bound size
    inferred_permissions: [...permMap.values()],
    manual_review_required: counts.critical > 0 || counts.high > 0,
  };
}
