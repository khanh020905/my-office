/**
 * Extensible Health Checker for AI Tools.
 * Verifies operational readiness across CLI, MCP, Skill, and API protocols.
 * Distinguishes strictly between installed, enabled, healthy, available, and running states.
 */

import fs from 'node:fs';
import path from 'node:path';
import { executeIsolatedProcess } from './execution-runner.mjs';

/**
 * Evaluates the state distinctions for a tool.
 */
export function evaluateToolOperationalState(tool, { activeProcesses = [] } = {}) {
  const isInstalled = tool.installation_status === 'healthy' && Boolean(tool.installation_path && fs.existsSync(tool.installation_path));
  const isEnabled = Boolean(tool.enabled_status);
  const isHealthy = tool.health_status === 'healthy';
  const isRunning = activeProcesses.some((p) => p.tool_id === tool.tool_id);
  const isAuthorized = Array.isArray(tool.required_permissions) && tool.required_permissions.every((p) => p.granted === true);
  const isAvailable = isInstalled && isEnabled && isHealthy;

  return {
    installed: isInstalled,
    enabled: isEnabled,
    healthy: isHealthy,
    available: isAvailable,
    running: isRunning,
    authorized: isAuthorized,
    operational_summary: isAvailable
      ? (isRunning ? 'Active and Running' : 'Ready for Agent Invocation')
      : (!isInstalled ? 'Not Installed' : (!isEnabled ? 'Disabled by User' : 'Unhealthy / Verification Failed')),
  };
}

/**
 * Executes a health check for a tool.
 */
export async function performToolHealthCheck(tool, { timeoutMs = 15_000 } = {}) {
  const startTime = Date.now();
  const installPath = tool.installation_path;

  if (!installPath || !fs.existsSync(installPath)) {
    return {
      healthy: false,
      status: 'failed',
      message: `Installation path '${installPath}' does not exist on disk.`,
      checked_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
    };
  }

  // 1. Skill protocol health check
  if (tool.integration_protocols?.includes('skill')) {
    const skillPath = path.join(installPath, 'source', 'SKILL.md');
    const altSkillPath = path.join(installPath, 'SKILL.md');
    const target = fs.existsSync(skillPath) ? skillPath : (fs.existsSync(altSkillPath) ? altSkillPath : null);

    if (!target) {
      return {
        healthy: false,
        status: 'unhealthy',
        message: 'Missing required SKILL.md specification file in managed directory.',
        checked_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      };
    }

    const content = fs.readFileSync(target, 'utf8');
    if (!content.startsWith('---') || !content.includes('name:')) {
      return {
        healthy: false,
        status: 'unhealthy',
        message: 'SKILL.md does not contain valid YAML frontmatter.',
        checked_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      };
    }
  }

  // 2. Node / MCP server health check
  if (tool.integration_protocols?.includes('mcp')) {
    const manifestPath = path.join(installPath, 'installation-manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return {
        healthy: false,
        status: 'unhealthy',
        message: 'Missing installation-manifest.json in managed directory.',
        checked_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      };
    }

    // Verify main entry point file exists
    const mcpCap = (tool.capabilities || []).find((c) => c.protocol === 'mcp');
    if (mcpCap && mcpCap.entry_point) {
      const entryFile = path.resolve(installPath, 'source', mcpCap.entry_point);
      const rootEntryFile = path.resolve(installPath, mcpCap.entry_point);
      if (!fs.existsSync(entryFile) && !fs.existsSync(rootEntryFile)) {
        return {
          healthy: false,
          status: 'unhealthy',
          message: `MCP entry point '${mcpCap.entry_point}' was not found in managed directory.`,
          checked_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime,
        };
      }
    }
  }

  // 3. CLI utility health check
  if (tool.integration_protocols?.includes('cli')) {
    const cliCap = (tool.capabilities || []).find((c) => c.protocol === 'cli');
    if (cliCap && cliCap.entry_point) {
      const entryPoint = path.resolve(installPath, 'source', cliCap.entry_point);
      const isJs = /\.(js|mjs|cjs)$/i.test(entryPoint);
      const isPy = /\.py$/i.test(entryPoint);

      let cmd = entryPoint;
      let args = ['--version'];

      if (isJs) {
        cmd = process.execPath;
        args = [entryPoint, '--version'];
      } else if (isPy) {
        cmd = process.platform === 'win32' ? 'python' : 'python3';
        args = [entryPoint, '--version'];
      }

      if (fs.existsSync(entryPoint)) {
        const execResult = await executeIsolatedProcess({
          command: cmd,
          args,
          cwd: path.dirname(entryPoint),
          timeoutMs,
          toolId: tool.tool_id,
        });

        if (!execResult.ok && execResult.exit_code !== 0) {
          return {
            healthy: false,
            status: 'unhealthy',
            message: `CLI version check failed with exit code ${execResult.exit_code}: ${execResult.stderr || execResult.error}`,
            checked_at: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
          };
        }
      }
    }
  }

  return {
    healthy: true,
    status: 'healthy',
    message: 'Health check passed successfully.',
    checked_at: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
  };
}

