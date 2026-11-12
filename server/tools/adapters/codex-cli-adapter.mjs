/**
 * Codex CLI Agent Adapter.
 * Integrates tools natively via Codex Skills directory ($CODEX_HOME/skills) and MCP server config.
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

export const codexCliAdapter = {
  id: 'codex-cli',
  name: 'Codex CLI',
  version: '1.0.0',
  supportedProtocols: ['skill', 'mcp', 'cli'],

  detectAgent({ codexHome = null, probe = true } = {}) {
    const home = codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    const homeExists = fs.existsSync(home);
    const configPath = path.join(home, 'config.json');
    const configExists = fs.existsSync(configPath);
    const skillsDir = path.join(home, 'skills');
    const skillsExists = fs.existsSync(skillsDir);

    const executablePath = findHostBinary('codex');
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
      agent_id: 'codex-cli',
      name: 'Codex CLI',
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
        mcpServers = raw.mcp_servers || raw.mcpServers || {};
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
        reason: 'Native SKILL.md supported in $CODEX_HOME/skills.',
      };
    }
    if (hasMcp) {
      return {
        compatible: true,
        protocol: 'mcp',
        status: 'potentially_compatible',
        reason: 'MCP server supported via Codex app-server bridge protocol.',
      };
    }
    if (hasCli) {
      return {
        compatible: true,
        protocol: 'cli',
        status: 'verified_compatible',
        reason: 'Native CLI tool executable in workspace-write mode.',
      };
    }

    return {
      compatible: false,
      status: 'unsupported',
      reason: 'No compatible Codex CLI integration protocol found.',
    };
  },

  planDistribution(tool, { codexHome = null } = {}) {
    const env = this.detectAgent({ codexHome });
    const compat = this.checkCompatibility(tool);
    if (!compat.compatible) {
      throw new Error(`Tool '${tool.tool_id}' is not compatible with Codex CLI: ${compat.reason}`);
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
        mcp_servers: {
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

  async distribute(tool, plan, { codexHome = null } = {}) {
    const env = this.detectAgent({ codexHome });
    const sourceDir = plan.source_location;
    const protocol = plan.protocol;

    let backupPath = null;

    if (protocol === 'skill') {
      linkToolToAgent(sourceDir, plan.target_location);
    } else if (protocol === 'mcp') {
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

      configObj.mcp_servers = configObj.mcp_servers || {};
      configObj.mcp_servers[tool.tool_id] = plan.config_changes.mcp_servers[tool.tool_id];

      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      fs.writeFileSync(cfgPath, JSON.stringify(configObj, null, 2), 'utf8');
    }

    const verification = await this.verifyDistribution({
      agent_id: this.id,
      protocol,
      target_location: plan.target_location,
      config_path: plan.config_path,
      tool_id: tool.tool_id,
    }, { codexHome });

    return {
      ok: true,
      protocol,
      target_location: plan.target_location,
      backup_path: backupPath,
      verification,
    };
  },

  async verifyDistribution(record, { codexHome = null } = {}) {
    const env = this.detectAgent({ codexHome });
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
          agentVisible = Boolean(cfg.mcp_servers && cfg.mcp_servers[record.tool_id]);
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

  async disableDistribution(record) {
    const protocol = record.integration_protocol || record.protocol;
    if (protocol === 'skill') {
      const disabledName = `${record.target_location}.disabled`;
      if (fs.existsSync(record.target_location)) {
        fs.renameSync(record.target_location, disabledName);
      }
      return { ok: true, status: 'disabled' };
    }
    return { ok: true, status: 'disabled' };
  },

  async enableDistribution(record) {
    const protocol = record.integration_protocol || record.protocol;
    if (protocol === 'skill') {
      const disabledName = `${record.target_location}.disabled`;
      if (fs.existsSync(disabledName)) {
        fs.renameSync(disabledName, record.target_location);
      }
      return { ok: true, status: 'enabled' };
    }
    return { ok: true, status: 'enabled' };
  },

  async removeDistribution(record, { codexHome = null } = {}) {
    const env = this.detectAgent({ codexHome });
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
          if (cfg.mcp_servers?.[record.tool_id]) {
            delete cfg.mcp_servers[record.tool_id];
            fs.writeFileSync(env.config_path, JSON.stringify(cfg, null, 2), 'utf8');
          }
        } catch {
          /* ignore */
        }
      }
      return { ok: true, removed: true };
    }
    return { ok: false, error: 'Unknown protocol' };
  },

  async rollbackDistribution(record, backupPath) {
    if (record.protocol === 'mcp' && backupPath) {
      restoreConfigFile(record.config_path, backupPath);
      return { ok: true, rolled_back: true };
    }
    return { ok: true };
  },
};
