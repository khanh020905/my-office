/**
 * Execution Runner for Tool Installation, Verification, and Health Checks.
 * Enforces strict environment variable sanitization, working directory isolation,
 * timeouts, output buffer caps, and secret redaction.
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';

// Sensitive environment variable names that must NEVER be leaked to external tool processes
const SENSITIVE_ENV_KEYS = [
  /API_KEY/i,
  /SECRET/i,
  /TOKEN/i,
  /PASSWORD/i,
  /AUTH/i,
  /CREDENTIAL/i,
  /^CLAUDE_/i,
  /^CODEX_/i,
  /^ANTHROPIC_/i,
  /^OPENAI_/i,
  /^GEMINI_/i,
  /^GITHUB_/i,
  /^AWS_/i,
  /^OFFICE_/i,
  /^DATA_DIR/i,
  /COOKIE/i,
];

// Sensitive data patterns for log redaction
const SENSITIVE_PATTERNS = [
  /(?:sk-[a-zA-Z0-9_-]{20,})/g,
  /(?:ghp_[a-zA-Z0-9]{30,})/g,
  /(?:Bearer\s+[a-zA-Z0-9_.-]{20,})/gi,
  /(?:[A-Za-z0-9+/=]{40,})/g, // long base64 hashes/keys
  /(?:ANTHROPIC_API_KEY=[^\s&]+)/gi,
  /(?:OPENAI_API_KEY=[^\s&]+)/gi,
  /(?:password=[^\s&]+)/gi,
];

// Active running executions tracked for cancellation
const activeExecutions = new Map();

/**
 * Sanitizes environment variables for child process execution.
 * Only forwards essential OS and system runtime paths.
 */
export function sanitizeEnvironment(customEnv = {}) {
  const allowedSystemKeys = new Set([
    'PATH',
    'Path',
    'PATHEXT',
    'SYSTEMROOT',
    'SystemRoot',
    'COMSPEC',
    'ComSpec',
    'TEMP',
    'TMP',
    'TMPDIR',
    'HOMEDRIVE',
    'HOMEPATH',
    'USERPROFILE',
    'HOME',
    'APPDATA',
    'LOCALAPPDATA',
    'USERNAME',
    'OS',
    'PROCESSOR_ARCHITECTURE',
    'NODE_ENV',
    'LANG',
    'LC_ALL',
  ]);

  const cleanEnv = {};

  for (const [key, val] of Object.entries(process.env)) {
    if (allowedSystemKeys.has(key)) {
      cleanEnv[key] = val;
    }
  }

  // Explicitly remove any nested or legacy codex runner flags
  delete cleanEnv.CODEX_WINDOWS_REGISTERED_CORE;
  delete cleanEnv.CODEX_PERMISSION_PROFILE;

  // Add custom environment variables after filtering out secrets
  for (const [key, val] of Object.entries(customEnv)) {
    const isSensitive = SENSITIVE_ENV_KEYS.some((re) => re.test(key));
    if (!isSensitive && typeof val === 'string') {
      cleanEnv[key] = val;
    }
  }

  return cleanEnv;
}

/**
 * Redacts secrets from execution stdout/stderr logs.
 */
export function redactSecrets(text) {
  if (typeof text !== 'string') return '';
  let cleaned = text;
  for (const pat of SENSITIVE_PATTERNS) {
    cleaned = cleaned.replace(pat, '[REDACTED_SECRET]');
  }
  return cleaned;
}

/**
 * Creates an execution plan for a tool installation or verification operation.
 */
export function createExecutionPlan({
  toolId,
  version,
  operationType = 'install',
  command = '',
  args = [],
  workingDirectory = '',
  requiredPermissions = [],
  isolationLevel = 'process_restricted_env',
} = {}) {
  return {
    execution_id: `exec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    tool_id: toolId,
    version,
    operation_type: operationType,
    command: String(command).trim(),
    args: Array.isArray(args) ? args.map(String) : [],
    working_directory: workingDirectory ? path.resolve(workingDirectory) : process.cwd(),
    required_permissions: requiredPermissions,
    isolation_level: isolationLevel,
    isolation_description:
      'Child process runs with strictly sanitized environment variables (all API keys, credentials, and parent session tokens stripped), restricted cwd, execution timeout, and output buffer caps. Windows Sandbox / kernel-level containerization is not active.',
    created_at: new Date().toISOString(),
    approved: false,
    approval_token: null,
  };
}

/**
 * Executes a process within an isolated, monitored environment.
 */
export async function executeIsolatedProcess({
  command,
  args = [],
  cwd,
  customEnv = {},
  timeoutMs = 60_000,
  maxOutputBytes = 1_048_576, // 1 MB
  executionId = null,
  toolId = 'unknown',
  agentId = null,
  policyEngine = null,
  signal = null,
} = {}) {
  const execId = executionId || `exec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  // Check Security Policy Engine if configured (Phase 5 Requirement §5 & §9)
  if (policyEngine) {
    const decision = policyEngine.evaluateOperation({
      toolId,
      agentId: agentId || 'system',
      operation: 'process:exec',
      requestedScopes: ['process:exec'],
      target: command,
    });
    if (!decision.allowed) {
      return {
        ok: false,
        execution_id: execId,
        exit_code: -1,
        stdout: '',
        stderr: redactSecrets(`Execution blocked by security policy: ${decision.reason}`),
        duration_ms: 0,
        timed_out: false,
        status: 'BLOCKED_BY_POLICY',
        error: decision.reason,
      };
    }
  }

  // Filter cross-agent environment secrets if policyEngine and agentId are present
  const filteredCustomEnv = policyEngine && agentId
    ? policyEngine.filterEnvironmentForAgent(agentId, toolId, customEnv)
    : customEnv;

  const sanitizedEnv = sanitizeEnvironment({
    ...filteredCustomEnv,
    MY_OFFICE_TOOL_EXECUTION: '1',
    MY_OFFICE_EXECUTION_ID: execId,
    MY_OFFICE_TOOL_ID: toolId,
  });

  return new Promise((resolve) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let killed = false;
    let timedOut = false;
    const startTime = Date.now();

    let child;
    try {
      child = spawn(command, args, {
        cwd: cwd ? path.resolve(cwd) : process.cwd(),
        env: sanitizedEnv,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      return resolve({
        ok: false,
        execution_id: execId,
        exit_code: -1,
        stdout: '',
        stderr: redactSecrets(err.message),
        duration_ms: 0,
        timed_out: false,
        error: err.message,
      });
    }

    const execRecord = {
      execution_id: execId,
      tool_id: toolId,
      pid: child.pid,
      command,
      args,
      start_time: startTime,
      child,
      status: 'running',
    };
    activeExecutions.set(execId, execRecord);

    const timer = setTimeout(() => {
      timedOut = true;
      killed = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    if (signal) {
      signal.addEventListener('abort', () => {
        killed = true;
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      });
    }

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        if (stdoutBuffer.length < maxOutputBytes) {
          stdoutBuffer += chunk.toString('utf8');
        }
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        if (stderrBuffer.length < maxOutputBytes) {
          stderrBuffer += chunk.toString('utf8');
        }
      });
    }

    child.on('error', (err) => {
      clearTimeout(timer);
      activeExecutions.delete(execId);
      resolve({
        ok: false,
        execution_id: execId,
        exit_code: -1,
        stdout: redactSecrets(stdoutBuffer),
        stderr: redactSecrets(stderrBuffer + '\n' + err.message),
        duration_ms: Date.now() - startTime,
        timed_out: timedOut,
        error: err.message,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      activeExecutions.delete(execId);

      const success = code === 0 && !killed && !timedOut;
      resolve({
        ok: success,
        execution_id: execId,
        pid: child.pid || null,
        exit_code: code ?? (timedOut ? -1 : 0),
        stdout: redactSecrets(stdoutBuffer),
        stderr: redactSecrets(stderrBuffer),
        duration_ms: Date.now() - startTime,
        timed_out: timedOut,
        killed,
        error: timedOut ? 'Execution timed out' : (success ? null : `Process exited with code ${code}`),
      });
    });
  });
}

/**
 * Returns currently active isolated executions.
 */
export function getActiveExecutions() {
  return [...activeExecutions.values()].map((e) => ({
    execution_id: e.execution_id,
    tool_id: e.tool_id,
    pid: e.pid,
    command: e.command,
    start_time: e.start_time,
    status: e.status,
  }));
}

/**
 * Terminates an active execution by ID.
 */
export function cancelExecution(executionId) {
  const rec = activeExecutions.get(executionId);
  if (!rec || !rec.child) return false;
  try {
    rec.child.kill('SIGKILL');
    rec.status = 'cancelled';
    activeExecutions.delete(executionId);
    return true;
  } catch {
    return false;
  }
}

