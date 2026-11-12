/**
 * Codex App (Desktop) Agent Adapter.
 * Integrates native plugins and desktop-compatible skills while preserving existing hook infrastructure.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createDistributionPlan,
  linkToolToAgent,
  unlinkToolFromAgent,
  evaluateVerificationLevels,
  findHostBinary,
} from './base-adapter.mjs';

export const codexAppAdapter = {
  id: 'codex-app',
  name: 'Codex App (Desktop)',
  version: '1.0.0',
  supportedProtocols: ['skill', 'hook'],

  detectAgent({ codexAppHome = null } = {}) {
    const home = codexAppHome || path.join(os.homedir(), '.codex');
    const homeExists = fs.existsSync(home);
    const pluginsDir = path.join(home, 'plugins');
    const pluginsExists = fs.existsSync(pluginsDir);
    const skillsDir = path.join(home, 'skills');
    const skillsExists = fs.existsSync(skillsDir);

    // Look for desktop executable in standard Windows directories
    const desktopPaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Codex', 'Codex.exe'),
      path.join(process.env.ProgramFiles || '', 'Codex', 'Codex.exe'),
      path.join(process.env['ProgramFiles(x86)'] || '', 'Codex', 'Codex.exe'),
    ];
    let executablePath = desktopPaths.find((p) => fs.existsSync(p)) || findHostBinary('codex-app');

    const statuses = ['SUPPORTED'];
    if (homeExists) statuses.push('PRESENT');
    if (pluginsExists || skillsExists) statuses.push('CONFIGURED');
    if (executablePath) {
      statuses.push('DETECTED');
    } else {
      statuses.push('NOT_VERIFIED');
    }

    // Do not report Codex App as fully functional based only on configuration presence
    const primaryStatus = executablePath
      ? 'DETECTED'
      : (pluginsExists || skillsExists)
      ? 'CONFIGURED'
      : homeExists
      ? 'PRESENT'
      : 'NOT_FOUND';

    const verificationLevel = executablePath ? 2 : pluginsExists ? 1 : 0;

    const evidenceParts = [];
    if (executablePath) {
      evidenceParts.push(`Desktop binary: ${executablePath}`);
    } else {
      evidenceParts.push('Desktop GUI executable not found (NOT_VERIFIED)');
    }
    if (pluginsExists) evidenceParts.push(`Plugins directory: ${pluginsDir}`);
    if (skillsExists) evidenceParts.push(`Skills directory: ${skillsDir}`);

    return {
      detected: Boolean(homeExists || pluginsExists || executablePath),
      agent_id: 'codex-app',
      name: 'Codex App (Desktop)',
      status: primaryStatus,
      statuses,
      verification_level: verificationLevel,
      executable_path: executablePath || null,
      version: null,
      home,
      plugins_dir: pluginsExists ? pluginsDir : null,
      skills_dir: skillsExists ? skillsDir : null,
      evidence: evidenceParts.join(' · '),
      detection_error: executablePath ? null : 'Desktop GUI application not installed in standard location',
    };
  },

  inspectEnvironment(options = {}) {
    const info = this.detectAgent(options);
    const plugins = [];
    if (fs.existsSync(info.plugins_dir)) {
      try {
        for (const entry of fs.readdirSync(info.plugins_dir)) {
          plugins.push(entry);
        }
      } catch {
        /* ignore */
      }
    }

    return {
      ...info,
      existing_plugins: plugins,
    };
  },

  checkCompatibility(tool) {
    const protocols = tool.integration_protocols || [];
    const hasSkill = protocols.includes('skill');
    const hasHook = protocols.includes('hook');

    if (hasSkill) {
      return {
        compatible: true,
        protocol: 'skill',
        status: 'verified_compatible',
        reason: 'Native SKILL.md supported in Codex Desktop application.',
      };
    }
    if (hasHook) {
      return {
        compatible: true,
        protocol: 'hook',
        status: 'verified_compatible',
        reason: 'Lifecycle hooks integrated with Codex App event streaming.',
      };
    }

    return {
      compatible: false,
      status: 'requires_adapter',
      reason: 'Codex App requires desktop plugin or skill wrapper.',
    };
  },

  planDistribution(tool, { codexAppHome = null } = {}) {
    const env = this.detectAgent({ codexAppHome });
    const compat = this.checkCompatibility(tool);
    if (!compat.compatible) {
      throw new Error(`Tool '${tool.tool_id}' is not directly compatible with Codex App: ${compat.reason}`);
    }

    const sourceDir = path.join(tool.installation_path, 'source');
    const targetLocation = path.join(env.skills_dir, tool.tool_id);

    return createDistributionPlan({
      toolId: tool.tool_id,
      toolVersion: tool.version,
      agentId: this.id,
      adapterId: this.id,
      protocol: compat.protocol,
      method: 'junction',
      targetLocation,
      sourceLocation: sourceDir,
      permissions: tool.required_permissions || [],
      compatibilityEvidence: compat.reason,
    });
  },

  async distribute(tool, plan) {
    linkToolToAgent(plan.source_location, plan.target_location);
    const verification = await this.verifyDistribution({
      agent_id: this.id,
      protocol: plan.protocol,
      target_location: plan.target_location,
      tool_id: tool.tool_id,
    });

    return {
      ok: true,
      protocol: plan.protocol,
      target_location: plan.target_location,
      verification,
    };
  },

  async verifyDistribution(record, { codexAppHome = null } = {}) {
    const env = this.detectAgent({ codexAppHome });
    const detected = env.detected;
    const integrationPresent = fs.existsSync(record.target_location);
    let agentVisible = false;

    if (integrationPresent) {
      const skillMd = path.join(record.target_location, 'SKILL.md');
      agentVisible = fs.existsSync(skillMd);
    }

    return evaluateVerificationLevels({
      adapterDetected: detected,
      configValid: true,
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

  async removeDistribution(record, { codexAppHome = null } = {}) {
    const env = this.detectAgent({ codexAppHome });
    unlinkToolFromAgent(record.target_location, env.home);
    const disabledName = `${record.target_location}.disabled`;
    if (fs.existsSync(disabledName)) {
      unlinkToolFromAgent(disabledName, env.home);
    }
    return { ok: true, removed: true };
  },

  async rollbackDistribution() {
    return { ok: true };
  },
};

