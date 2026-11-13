/**
 * Antigravity Agent Adapter.
 * Integrates tools natively into Google Antigravity Skills (~/.gemini/antigravity/skills)
 * and MCP configurations.
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

export const antigravityAdapter = {
  id: 'antigravity',
  name: 'Antigravity',
  version: '1.0.0',
  supportedProtocols: ['skill', 'mcp'],

  detectAgent({ antigravityHome = null, probe = true } = {}) {
    const home = antigravityHome || process.env.ANTIGRAVITY_HOME || path.join(os.homedir(), '.gemini', 'antigravity');
    const homeExists = fs.existsSync(home);
    const configPath = path.join(home, 'config.json');
    const configExists = fs.existsSync(configPath);
    const skillsDir = path.join(home, 'skills');
    const builtinSkillsDir = path.join(home, 'builtin', 'skills');
    const skillsPath = fs.existsSync(skillsDir) ? skillsDir : fs.existsSync(builtinSkillsDir) ? builtinSkillsDir : skillsDir;
    const skillsExists = fs.existsSync(skillsPath);
    const mcpDir = path.join(home, 'mcp');
    const mcpExists = fs.existsSync(mcpDir);
    const agentApiBat = path.join(home, 'bin', 'agentapi.bat');
    const agentApiExists = fs.existsSync(agentApiBat);

    // Look for standalone CLI on PATH
    const executablePath = findHostBinary('agy') || findHostBinary('antigravity');
    let versionStr = null;
    let detectionError = null;

    if (executablePath && probe) {
      const probeRes = probeBinaryVersion(executablePath);
      versionStr = probeRes.version;
      detectionError = probeRes.error;
    }

    const statuses = ['SUPPORTED'];
    if (homeExists) statuses.push('PRESENT');
    if (skillsExists || mcpExists || configExists) statuses.push('CONFIGURED');
    if (executablePath) {
      statuses.push('DETECTED');
      if (versionStr) statuses.push('FUNCTIONALLY_VERIFIED');
    } else {
      statuses.push('NOT_VERIFIED');
    }

    // Do not report Antigravity as fully functional based only on configuration presence
    const primaryStatus = versionStr
      ? 'FUNCTIONALLY_VERIFIED'
      : executablePath
        ? 'DETECTED'
        : (homeExists || agentApiExists)
          ? 'CONFIGURED'
          : 'NOT_FOUND';

    const verificationLevel = versionStr ? 3 : executablePath ? 2 : (homeExists || agentApiExists) ? 1 : 0;

    const evidenceParts = [];
    if (executablePath) {
      evidenceParts.push(`CLI executable: ${executablePath}`);
      if (versionStr) evidenceParts.push(`Version: ${versionStr}`);
    } else {
      evidenceParts.push('Standalone CLI binary (agy/antigravity) not found on PATH (NOT_VERIFIED)');
    }
    if (homeExists) evidenceParts.push(`Home: ${home}`);
    if (agentApiExists) evidenceParts.push(`AgentAPI: ${agentApiBat}`);
    if (skillsExists) evidenceParts.push(`Skills: ${skillsPath}`);
    if (mcpExists) evidenceParts.push(`MCP: ${mcpDir}`);

    return {
      detected: Boolean(homeExists || executablePath),
      installed: Boolean(executablePath || agentApiExists),
      configured: Boolean(skillsExists || mcpExists || configExists),
      agent_id: 'antigravity',
      name: 'Antigravity',
      status: primaryStatus,
      statuses,
      verification_level: verificationLevel,
      executable_path: executablePath || (agentApiExists ? agentApiBat : null),
      version: versionStr,
      home,
      skills_dir: skillsExists ? skillsPath : null,
      mcp_dir: mcpExists ? mcpDir : null,
      config_path: configExists ? configPath : null,
      evidence: evidenceParts.join(' · '),
      detection_error: executablePath ? detectionError : 'Standalone CLI not installed on global PATH',
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

    return {
      ...info,
      existing_skills: skills,
    };
  },

  checkCompatibility(tool) {
    const protocols = tool.integration_protocols || [];
    const hasSkill = protocols.includes('skill');
    const hasMcp = protocols.includes('mcp');

    if (hasSkill) {
      return {
        compatible: true,
        protocol: 'skill',
        status: 'verified_compatible',
        reason: 'Native Antigravity Skill format with SKILL.md frontmatter.',
      };
    }
    if (hasMcp) {
      return {
        compatible: true,
        protocol: 'mcp',
        status: 'verified_compatible',
        reason: 'Native Antigravity MCP server integration.',
      };
    }

    return {
      compatible: false,
      status: 'unsupported',
      reason: 'Capability not supported directly by Antigravity runtime.',
    };
  },

  planDistribution(tool, { antigravityHome = null } = {}) {
    const env = this.detectAgent({ antigravityHome });
    const compat = this.checkCompatibility(tool);
    if (!compat.compatible) {
      throw new Error(`Tool '${tool.tool_id}' is not compatible with Antigravity: ${compat.reason}`);
    }

    const sourceDir = path.join(tool.installation_path, 'source');
    let targetLocation = '';
    let configPath = '';
    let configChanges = {};

    if (compat.protocol === 'skill') {
      targetLocation = path.join(env.skills_dir, tool.tool_id);
    } else if (compat.protocol === 'mcp') {
      targetLocation = path.join(env.mcp_dir, tool.tool_id);
      configPath = env.config_path;
      configChanges = {
        mcp_servers: {
          [tool.tool_id]: {
            path: targetLocation,
            _managed_by: 'my-office',
          },
        },
      };
    }

    return createDistributionPlan({
      toolId: tool.tool_id,
      toolVersion: tool.version,
      agentId: this.id,
      adapterId: this.id,
      protocol: compat.protocol,
      method: 'junction',
      targetLocation,
      sourceLocation: sourceDir,
      configPath,
      configChanges,
      permissions: tool.required_permissions || [],
      compatibilityEvidence: compat.reason,
    });
  },

  async distribute(tool, plan, { antigravityHome = null } = {}) {
    const sourceDir = plan.source_location;
    const protocol = plan.protocol;

    let backupPath = null;

    // 1. Link tool directory to Antigravity location
    linkToolToAgent(sourceDir, plan.target_location);

    // 2. If MCP, update config
    if (protocol === 'mcp' && plan.config_path) {
      backupPath = backupConfigFile(plan.config_path);
      let configObj = {};
      if (fs.existsSync(plan.config_path)) {
        try {
          configObj = JSON.parse(fs.readFileSync(plan.config_path, 'utf8'));
        } catch {
          configObj = {};
        }
      }
      configObj.mcp_servers = configObj.mcp_servers || {};
      configObj.mcp_servers[tool.tool_id] = plan.config_changes.mcp_servers[tool.tool_id];

      fs.mkdirSync(path.dirname(plan.config_path), { recursive: true });
      fs.writeFileSync(plan.config_path, JSON.stringify(configObj, null, 2), 'utf8');
    }

    const verification = await this.verifyDistribution({
      agent_id: this.id,
      protocol,
      target_location: plan.target_location,
      config_path: plan.config_path,
      tool_id: tool.tool_id,
    }, { antigravityHome });

    return {
      ok: true,
      protocol,
      target_location: plan.target_location,
      backup_path: backupPath,
      verification,
    };
  },

  async verifyDistribution(record, { antigravityHome = null } = {}) {
    const env = this.detectAgent({ antigravityHome });
    const detected = env.detected;
    let configValid = true;
    const integrationPresent = fs.existsSync(record.target_location);
    let agentVisible = false;
    const protocol = record.integration_protocol || record.protocol;

    if (integrationPresent) {
      if (protocol === 'skill') {
        const skillMd = path.join(record.target_location, 'SKILL.md');
        agentVisible = fs.existsSync(skillMd);
      } else {
        agentVisible = true;
      }
    }

    if (record.config_path && fs.existsSync(record.config_path)) {
      try {
        JSON.parse(fs.readFileSync(record.config_path, 'utf8'));
      } catch {
        configValid = false;
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

  async disableDistribution(record) {
    const disabledName = `${record.target_location}.disabled`;
    if (fs.existsSync(record.target_location)) {
      fs.renameSync(record.target_location, disabledName);
    }
    return { ok: true, status: 'disabled' };
  },

  async enableDistribution(record) {
    const disabledName = `${record.target_location}.disabled`;
    if (fs.existsSync(disabledName)) {
      fs.renameSync(disabledName, record.target_location);
    }
    return { ok: true, status: 'enabled' };
  },

  async removeDistribution(record, { antigravityHome = null } = {}) {
    const env = this.detectAgent({ antigravityHome });
    unlinkToolFromAgent(record.target_location, env.home);
    const disabledName = `${record.target_location}.disabled`;
    if (fs.existsSync(disabledName)) {
      unlinkToolFromAgent(disabledName, env.home);
    }

    if (record.config_path && fs.existsSync(record.config_path)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(record.config_path, 'utf8'));
        if (cfg.mcp_servers?.[record.tool_id]) {
          delete cfg.mcp_servers[record.tool_id];
          fs.writeFileSync(record.config_path, JSON.stringify(cfg, null, 2), 'utf8');
        }
      } catch {
        /* ignore */
      }
    }

    return { ok: true, removed: true };
  },

  async rollbackDistribution(record, backupPath) {
    if (backupPath && record.config_path) {
      restoreConfigFile(record.config_path, backupPath);
      return { ok: true, rolled_back: true };
    }
    return { ok: true };
  },
};
