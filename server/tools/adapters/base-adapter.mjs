/**
 * Base Agent Adapter Interface & Helpers.
 * Standardizes distribution, linking, configuration safety, and verification across AI agents.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { linkOrCopyDirectory, isSafePath } from '../fs-utils.mjs';

/**
 * Resolves a binary path on the host system, with Windows-specific wrapper (.cmd, .bat) support.
 */
export function findHostBinary(name) {
  const isWin = process.platform === 'win32';
  const exts = isWin ? ['.cmd', '.bat', '.exe', ''] : [''];

  // 1. Check via where.exe (Windows) or which (Unix)
  try {
    const whichCmd = isWin ? 'where.exe' : 'which';
    const out = execFileSync(whichCmd, [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 });
    const lines = out.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length) {
      if (isWin) {
        // Prefer executable extensions on Windows (.cmd, .bat, .exe) over extensionless files
        const executableMatch = lines.find((l) => /\.(cmd|bat|exe)$/i.test(l));
        if (executableMatch) return executableMatch;
      }
      return lines[0];
    }
  } catch {
    /* ignore and try direct paths */
  }

  // 2. Check npm global directory on Windows
  if (isWin) {
    const npmDir = path.join(process.env.APPDATA || '', 'npm');
    for (const ext of exts) {
      const p = path.join(npmDir, name + ext);
      if (fs.existsSync(p)) return p;
    }
  }

  // 3. Scan PATH environment variable
  const pathDirs = (process.env.PATH || '').split(path.delimiter);
  for (const dir of pathDirs) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, name + ext);
      if (fs.existsSync(full)) return full;
    }
  }

  return null;
}

/**
 * Safely probes an executable for its version string with timeout protection.
 */
export function probeBinaryVersion(binPath, args = ['--version'], timeoutMs = 4000) {
  if (!binPath) return { version: null, error: null };
  const isWin = process.platform === 'win32';
  try {
    let out;
    if (isWin && (binPath.endsWith('.cmd') || binPath.endsWith('.bat') || !path.extname(binPath))) {
      out = execFileSync('cmd.exe', ['/c', binPath, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: timeoutMs,
        env: { ...process.env, CI: '1' },
      });
    } else {
      out = execFileSync(binPath, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: timeoutMs,
        env: { ...process.env, CI: '1' },
      });
    }
    const ver = out.trim().split(/\r?\n/)[0];
    return { version: ver || 'Unknown', error: null };
  } catch (err) {
    return { version: null, error: err.message };
  }
}

/**
 * Creates a standard pre-distribution plan.
 */
export function createDistributionPlan({
  toolId,
  toolVersion,
  agentId,
  adapterId,
  adapterVersion = '1.0.0',
  protocol,
  method = 'junction',
  targetLocation = '',
  sourceLocation = '',
  configPath = '',
  configChanges = {},
  permissions = [],
  compatibilityEvidence = '',
} = {}) {
  const planId = `dist-plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins expiry

  return {
    plan_id: planId,
    tool_id: toolId,
    tool_version: toolVersion,
    agent_id: agentId,
    adapter_id: adapterId,
    adapter_version: adapterVersion,
    protocol,
    method,
    target_location: targetLocation,
    source_location: sourceLocation,
    config_path: configPath,
    config_changes: configChanges,
    required_permissions: permissions,
    compatibility_evidence: compatibilityEvidence,
    expires_at: expiresAt,
    backup_strategy: 'Automatic configuration snapshot before write',
    rollback_plan: 'Full restoration of backed up configuration file and junction unlinking',
  };
}

/**
 * Creates a timestamped backup of a configuration file before modifying.
 */
export function backupConfigFile(configPath) {
  if (!configPath || !fs.existsSync(configPath)) return null;
  const backupPath = `${configPath}.bak-${Date.now()}`;
  try {
    fs.copyFileSync(configPath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

/**
 * Safely restores a configuration file from backup.
 */
export function restoreConfigFile(configPath, backupPath) {
  if (!backupPath || !fs.existsSync(backupPath)) return false;
  try {
    fs.copyFileSync(backupPath, configPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Links a tool source directory to an agent's target directory (junction / symlink with copy fallback).
 */
export function linkToolToAgent(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory does not exist: ${sourceDir}`);
  }

  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });

  return linkOrCopyDirectory(sourceDir, targetDir, { force: true });
}

/**
 * Safely removes a linked tool directory from an agent target location.
 */
export function unlinkToolFromAgent(targetDir, agentHomeDir) {
  if (!targetDir || !fs.existsSync(targetDir)) return true;

  // Boundary check: ensure targetDir is safely within agentHomeDir
  if (agentHomeDir && !isSafePath(agentHomeDir, targetDir)) {
    throw new Error(`Security violation: target path ${targetDir} is outside agent home ${agentHomeDir}`);
  }

  try {
    // Check if junction or symlink
    const stat = fs.lstatSync(targetDir);
    if (stat.isSymbolicLink() || (process.platform === 'win32' && stat.isDirectory())) {
      try {
        fs.unlinkSync(targetDir);
        return true;
      } catch {
        // Fallback to rmSync for directories / junctions
        fs.rmSync(targetDir, { recursive: true, force: true });
        return true;
      }
    } else {
      fs.rmSync(targetDir, { recursive: true, force: true });
      return true;
    }
  } catch (err) {
    throw new Error(`Failed to unlink tool: ${err.message}`);
  }
}

/**
 * Verifies standard integration levels.
 */
export function evaluateVerificationLevels({
  adapterDetected = false,
  configValid = false,
  integrationPresent = false,
  agentVisible = false,
  functionalPass = false,
} = {}) {
  let highestLevel = 0;
  const levels = {
    level_1_detected: adapterDetected,
    level_2_config_valid: configValid,
    level_3_present: integrationPresent,
    level_4_visible: agentVisible,
    level_5_functional: functionalPass,
  };

  if (adapterDetected) highestLevel = 1;
  if (adapterDetected && configValid) highestLevel = 2;
  if (adapterDetected && configValid && integrationPresent) highestLevel = 3;
  if (adapterDetected && configValid && integrationPresent && agentVisible) highestLevel = 4;
  if (adapterDetected && configValid && integrationPresent && agentVisible && functionalPass) highestLevel = 5;

  return {
    verification_level: highestLevel,
    verified: highestLevel >= 3,
    levels,
    status_summary:
      highestLevel === 5
        ? 'Verified & Functionally Tested'
        : highestLevel === 4
        ? 'Verified Agent Visibility'
        : highestLevel === 3
        ? 'Present in Native Directory'
        : highestLevel === 2
        ? 'Configuration Validated'
        : highestLevel === 1
        ? 'Agent Detected'
        : 'Unverified',
  };
}
