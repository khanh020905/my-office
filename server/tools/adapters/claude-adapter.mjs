/**
 * Claude Code Agent Adapter.
 * Integrates tools natively via Claude Code Skills directory and MCP server configuration.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createDistributionPlan,
  backupConfigFile,
  restoreConfigFile,
  linkToolToAgent,
  unlinkToolFromAgent,
  evaluateVerificationLevels,
  findHostBinary,
  probeBinaryVersion,
} from './base-adapter.mjs';

export const claudeAdapter = {
  id: 'claude-code',
  name: 'Claude Code',
  version: '1.0.0',
  supportedProtocols: ['skill', 'mcp', 'cli'],

  detectAgent({ claudeHome = null, probe = true } = {}) {
    const home = claudeHome || process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    const homeExists = fs.existsSync(home);
    const settingsPath = path.join(home, 'settings.json');
    const claudeJsonPath = path.join(os.homedir(), '.claude.json');
    const configPath = fs.existsSync(settingsPath) ? settingsPath : fs.existsSync(claudeJsonPath) ? claudeJsonPath : settingsPath;
    const configExists = fs.existsSync(configPath);
    const skillsDir = path.join(home, 'skills');
    const skillsExists = fs.existsSync(skillsDir);

    const executablePath = findHostBinary('claude');
    let versionStr = null;
    let detectionError = null;

    if (executablePath && probe) {
      const probeRes = probeBinaryVersion(executablePath);
      versionStr = probeRes.version;
      detectionError = probeRes.error;
    }

    const statuses = ['SUPPORTED'];
    if (homeExists) statuses.push('PRESENT');
    if (configExists) statuses.push('CONFIGURED');
    if (executablePath) statuses.push('DETECTED');
    if (skillsExists) statuses.push('VISIBLE');
    if (versionStr) statuses.push('FUNCTIONALLY_VERIFIED');
    if (!homeExists && !executablePath) statuses.push('NOT_FOUND');

    let primaryStatus = 'NOT_FOUND';
    let verificationLevel = 0;
    if (versionStr) {
      primaryStatus = 'FUNCTIONALLY_VERIFIED';
      verificationLevel = 3;
    } else if (executablePath) {
      primaryStatus = 'DETECTED';
      verificationLevel = 2;
    } else if (configExists) {
      primaryStatus = 'CONFIGURED';
      verificationLevel = 2;
    } else if (homeExists) {
      primaryStatus = 'PRESENT';
      verificationLevel = 1;
    }

    const evidenceParts = [];
    if (executablePath) evidenceParts.push(`Executable: ${executablePath}`);
    if (versionStr) evidenceParts.push(`Version: ${versionStr}`);
    if (configExists) evidenceParts.push(`Config: ${configPath}`);
    if (skillsExists) evidenceParts.push(`Skills: ${skillsDir}`);
    if (!evidenceParts.length) evidenceParts.push('No binary or configuration directory found');

    return {
      detected: Boolean(executablePath || homeExists),
      agent_id: 'claude-code',
      name: 'Claude Code',
      status: primaryStatus,
      statuses,
      verification_level: verificationLevel,
      executable_path: executablePath,
      version: versionStr,
      home,
      config_path: configExists ? configPath : null,
      skills_dir: skillsExists ? skillsDir : null,
      evidence: evidenceParts.join(' · '),
      detection_error: detectionError,
    };
  },

  inspectEnvironment(options = {}) {
    const info = this.detectAgent(options);
    const skills = [];
    if (fs.existsSync(info.skills_dir)) {
      try {
        for (const entry of fs.readdirSync(info.skills_dir)) {
          skills.push(entry);
        }
      } catch {
        /* ignore */
      }
    }

    let mcpServers = {};
    if (fs.existsSync(info.config_path)) {
      try {
        const raw = JSON.parse(fs.readFileSync(info.config_path, 'utf8'));
        mcpServers = raw.mcpServers || {};
      } catch {
        /* ignore */
      }
    }

    return {
      ...info,
      existing_skills: skills,
      existing_mcp_servers: Object.keys(mcpServers),
    };
  },

  checkCompatibility(tool) {
    const protocols = tool.integration_protocols || [];
    const hasSkill = protocols.includes('skill');
    const hasMcp = protocols.includes('mcp');
    const hasCli = protocols.includes('cli');

    if (hasSkill) {
      return {
        compatible: true,
        protocol: 'skill',
        status: 'verified_compatible',
        reason: 'Native SKILL.md integration into Claude Code skills directory.',
      };
    }
    if (hasMcp) {
      return {
        compatible: true,
        protocol: 'mcp',
        status: 'verified_compatible',
        reason: 'Native MCP server configuration in Claude settings.',
      };
    }
    if (hasCli) {
      return {
        compatible: true,
        protocol: 'cli',
        status: 'potentially_compatible',
        reason: 'CLI executable invokable via Claude Code Bash tool.',
      };
    }

    return {
      compatible: false,
      status: 'unsupported',
      reason: 'No compatible Claude Code integration protocol found.',
    };
  },

  planDistribution(tool, { claudeHome = null } = {}) {
    const env = this.detectAgent({ claudeHome });
    const compat = this.checkCompatibility(tool);
    if (!compat.compatible) {
      throw new Error(`Tool '${tool.tool_id}' is not compatible with Claude Code: ${compat.reason}`);
    }

    const sourceDir = path.join(tool.installation_path, 'source');
    let targetLocation = '';
    let configPath = '';
    let configChanges = {};

    if (compat.protocol === 'skill') {
      targetLocation = path.join(env.skills_dir, tool.tool_id);
    } else if (compat.protocol === 'mcp') {
      configPath = env.config_path;
      const mcpCap = (tool.capabilities || []).find((c) => c.protocol === 'mcp') || {};
      const entryPoint = mcpCap.entry_point ? path.resolve(sourceDir, mcpCap.entry_point) : sourceDir;
      const isJs = /\.(js|mjs|cjs)$/i.test(entryPoint);

      configChanges = {
        mcpServers: {
          [tool.tool_id]: {
            command: isJs ? process.execPath : entryPoint,
            args: isJs ? [entryPoint] : [],
            env: { MY_OFFICE_MANAGED: '1' },
            _managed_by: 'my-office',
          },
        },
      };
      targetLocation = entryPoint;
    }

    return createDistributionPlan({
      toolId: tool.tool_id,
      toolVersion: tool.version,
      agentId: this.id,
      adapterId: this.id,
      protocol: compat.protocol,
      method: compat.protocol === 'skill' ? 'junction' : 'mcp_config',
      targetLocation,
      sourceLocation: sourceDir,
      configPath,
      configChanges,
      permissions: tool.required_permissions || [],
      compatibilityEvidence: compat.reason,
    });
  },

  async distribute(tool, plan, { claudeHome = null } = {}) {
    const env = this.detectAgent({ claudeHome });
    const sourceDir = plan.source_location;
    const protocol = plan.protocol;

    let backupPath = null;

    if (protocol === 'skill') {
      // 1. Link skill folder into Claude skills directory
      linkToolToAgent(sourceDir, plan.target_location);
    } else if (protocol === 'mcp') {
      // 2. Safe merge into Claude configuration
      const cfgPath = plan.config_path || env.config_path;
      backupPath = backupConfigFile(cfgPath);

      let configObj = {};
      if (fs.existsSync(cfgPath)) {
        try {
          configObj = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        } catch {
          configObj = {};
        }
      }

      configObj.mcpServers = configObj.mcpServers || {};
      configObj.mcpServers[tool.tool_id] = plan.config_changes.mcpServers[tool.tool_id];

      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      fs.writeFileSync(cfgPath, JSON.stringify(configObj, null, 2), 'utf8');
    }

    const verification = await this.verifyDistribution({
      agent_id: this.id,
      protocol,
      target_location: plan.target_location,
      config_path: plan.config_path,
      tool_id: tool.tool_id,
    }, { claudeHome });

    return {
      ok: true,
      protocol,
      target_location: plan.target_location,
      backup_path: backupPath,
      verification,
    };
  },

  async verifyDistribution(record, { claudeHome = null } = {}) {
    const env = this.detectAgent({ claudeHome });
    const detected = env.detected;
    let configValid = true;
    let integrationPresent = false;
    let agentVisible = false;
    const protocol = record.integration_protocol || record.protocol;

    if (protocol === 'skill') {
      integrationPresent = fs.existsSync(record.target_location);
      if (integrationPresent) {
        const skillMd = path.join(record.target_location, 'SKILL.md');
        agentVisible = fs.existsSync(skillMd) && fs.readFileSync(skillMd, 'utf8').includes('---');
      }
    } else if (protocol === 'mcp') {
      integrationPresent = Boolean(record.target_location && fs.existsSync(record.target_location));
      if (fs.existsSync(env.config_path)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(env.config_path, 'utf8'));
          agentVisible = Boolean(cfg.mcpServers && cfg.mcpServers[record.tool_id]);
        } catch {
          configValid = false;
        }
      }
    }

    return evaluateVerificationLevels({
      adapterDetected: detected,
      configValid,
      integrationPresent,
      agentVisible,
      functionalPass: agentVisible,
    });
  },

  async disableDistribution(record, { claudeHome = null } = {}) {
    const env = this.detectAgent({ claudeHome });
    const protocol = record.integration_protocol || record.protocol;
    if (protocol === 'skill') {
      const disabledName = `${record.target_location}.disabled`;
      if (fs.existsSync(record.target_location)) {
        fs.renameSync(record.target_location, disabledName);
      }
      return { ok: true, status: 'disabled' };
    } else if (protocol === 'mcp') {
      if (fs.existsSync(env.config_path)) {
        const cfg = JSON.parse(fs.readFileSync(env.config_path, 'utf8'));
        if (cfg.mcpServers?.[record.tool_id]) {
          cfg.mcpServers[record.tool_id]._disabled = true;
          fs.writeFileSync(env.config_path, JSON.stringify(cfg, null, 2), 'utf8');
        }
      }
      return { ok: true, status: 'disabled' };
    }
    return { ok: false, error: `Unknown protocol '${protocol}'` };
  },

  async enableDistribution(record, { claudeHome = null } = {}) {
    const env = this.detectAgent({ claudeHome });
    const protocol = record.integration_protocol || record.protocol;
    if (protocol === 'skill') {
      const disabledName = `${record.target_location}.disabled`;
      if (fs.existsSync(disabledName)) {
        fs.renameSync(disabledName, record.target_location);
      }
      return { ok: true, status: 'enabled' };
    } else if (protocol === 'mcp') {
      if (fs.existsSync(env.config_path)) {
        const cfg = JSON.parse(fs.readFileSync(env.config_path, 'utf8'));
        if (cfg.mcpServers?.[record.tool_id]) {
          delete cfg.mcpServers[record.tool_id]._disabled;
          fs.writeFileSync(env.config_path, JSON.stringify(cfg, null, 2), 'utf8');
        }
      }
      return { ok: true, status: 'enabled' };
    }
    return { ok: false, error: `Unknown protocol '${protocol}'` };
  },

  async removeDistribution(record, { claudeHome = null } = {}) {
    const env = this.detectAgent({ claudeHome });
    const protocol = record.integration_protocol || record.protocol;
    if (protocol === 'skill') {
      unlinkToolFromAgent(record.target_location, env.home);
      const disabledName = `${record.target_location}.disabled`;
      if (fs.existsSync(disabledName)) {
        unlinkToolFromAgent(disabledName, env.home);
      }
      return { ok: true, removed: true };
    } else if (protocol === 'mcp') {
      if (fs.existsSync(env.config_path)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(env.config_path, 'utf8'));
          if (cfg.mcpServers?.[record.tool_id]) {
            delete cfg.mcpServers[record.tool_id];
            fs.writeFileSync(env.config_path, JSON.stringify(cfg, null, 2), 'utf8');
          }
        } catch {
          /* ignore */
        }
      }
      return { ok: true, removed: true };
    }
    return { ok: false, error: `Unknown protocol '${protocol}'` };
  },

  async rollbackDistribution(record, backupPath) {
    if (record.protocol === 'mcp' && backupPath) {
      restoreConfigFile(record.config_path, backupPath);
      return { ok: true, rolled_back: true };
    }
    return { ok: true };
  },
};
