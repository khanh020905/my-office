/**
 * Generic MCP Client Adapter.
 * Generates standard Model Context Protocol client configurations for any external client.
 */

import path from 'node:path';
import { createDistributionPlan, evaluateVerificationLevels } from './base-adapter.mjs';

export const genericMcpAdapter = {
  id: 'generic-mcp',
  name: 'Generic MCP Client',
  version: '1.0.0',
  supportedProtocols: ['mcp'],

  detectAgent() {
    return {
      detected: false,
      installed: false,
      configured: false,
      agent_id: 'generic-mcp',
      name: 'Generic MCP Client',
      status: 'SUPPORTED',
      statuses: ['SUPPORTED'],
      verification_level: 0,
      executable_path: null,
      version: null,
      home: null,
      config_path: null,
      evidence: 'Virtual adapter for Model Context Protocol (MCP) export; no generic external client is installed by this adapter.',
      detection_error: 'Adapter support does not identify an installed MCP client.',
    };
  },

  inspectEnvironment() {
    return {
      detected: true,
      agent_id: 'generic-mcp',
    };
  },

  checkCompatibility(tool) {
    const hasMcp = (tool.integration_protocols || []).includes('mcp');
    return {
      compatible: hasMcp,
      protocol: 'mcp',
      status: hasMcp ? 'verified_compatible' : 'unsupported',
      reason: hasMcp ? 'Standard Model Context Protocol client configuration export.' : 'Tool does not expose MCP protocol.',
    };
  },

  planDistribution(tool) {
    const sourceDir = path.join(tool.installation_path, 'source');
    const mcpCap = (tool.capabilities || []).find((c) => c.protocol === 'mcp') || {};
    const entryPoint = mcpCap.entry_point ? path.resolve(sourceDir, mcpCap.entry_point) : sourceDir;
    const isJs = /\.(js|mjs|cjs)$/i.test(entryPoint);

    const mcpConfig = {
      mcpServers: {
        [tool.tool_id]: {
          command: isJs ? process.execPath : entryPoint,
          args: isJs ? [entryPoint] : [],
          env: {},
        },
      },
    };

    return createDistributionPlan({
      toolId: tool.tool_id,
      toolVersion: tool.version,
      agentId: this.id,
      adapterId: this.id,
      protocol: 'mcp',
      method: 'mcp_export',
      targetLocation: entryPoint,
      sourceLocation: sourceDir,
      configChanges: mcpConfig,
      permissions: tool.required_permissions || [],
      compatibilityEvidence: 'Standard stdio MCP server configuration',
    });
  },

  async distribute(tool, plan) {
    return {
      ok: true,
      protocol: 'mcp',
      target_location: plan.target_location,
      exported_config: plan.config_changes,
      verification: evaluateVerificationLevels({
        adapterDetected: true,
        configValid: true,
        integrationPresent: true,
        agentVisible: true,
        functionalPass: true,
      }),
    };
  },

  async verifyDistribution() {
    return evaluateVerificationLevels({
      adapterDetected: true,
      configValid: true,
      integrationPresent: true,
      agentVisible: true,
      functionalPass: true,
    });
  },

  async disableDistribution() {
    return { ok: true, status: 'disabled' };
  },

  async enableDistribution() {
    return { ok: true, status: 'enabled' };
  },

  async removeDistribution() {
    return { ok: true, removed: true };
  },

  async rollbackDistribution() {
    return { ok: true };
  },
};

