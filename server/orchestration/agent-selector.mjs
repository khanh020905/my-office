/**
 * Agent Selector Service (Phase 6 Master Architecture §6).
 * Selects and ranks compatible AI agents (Claude Code, Codex CLI, Codex App, Antigravity)
 * based on task requirements, candidate tool compatibility, host environment detection,
 * and security boundaries. Explains selections and rejections.
 */

export const SUPPORTED_AGENTS = [
  {
    agent_id: 'claude-code',
    name: 'Claude Code',
    type: 'cli_agent',
    best_for: ['coding', 'architecture_analysis', 'file_analysis', 'multi_step', 'research'],
    supported_protocols: ['skill', 'mcp', 'cli'],
    description: 'Autonomous CLI coding agent with skills, MCP server integration, and git workflows.',
  },
  {
    agent_id: 'codex-cli',
    name: 'Codex CLI',
    type: 'cli_agent',
    best_for: ['coding', 'architecture_analysis', 'general_cli', 'file_analysis'],
    supported_protocols: ['skill', 'mcp', 'cli'],
    description: 'Worktree-isolated Codex CLI agent with expected artifact verification and git sandboxing.',
  },
  {
    agent_id: 'codex-app',
    name: 'Codex App (Desktop)',
    type: 'desktop_app',
    best_for: ['document_processing', 'data_analysis'],
    supported_protocols: ['hook', 'skill', 'mcp'],
    description: 'Desktop application agent with hook observation and UI integration (distinct from Codex CLI).',
  },
  {
    agent_id: 'antigravity',
    name: 'Antigravity',
    type: 'multimodal_agent',
    best_for: ['research', 'architecture_analysis', 'video_media', 'browser_api', 'coding'],
    supported_protocols: ['skill', 'mcp', 'cli'],
    description: 'Multimodal AI agent with deep web research, media understanding, and skills integration.',
  },
];

export function createAgentSelector({
  distributionEngine = null,
  policyEngine = null,
} = {}) {
  return {
    /**
     * Evaluates and selects the best agent for a task specification and candidate tools.
     */
    selectAgent(taskSpec, candidateTools = []) {
      const taskType = taskSpec?.task_type || 'coding';
      const requiredCaps = taskSpec?.required_capabilities || [];

      // Detect host environments
      const detectedAgents = distributionEngine?.getDetectedAgents
        ? distributionEngine.getDetectedAgents()
        : [];
      const detectedMap = new Map(detectedAgents.map((d) => [d.agent_id, d]));

      const rankedAgents = [];
      const rejectedAgents = [];

      for (const agentDef of SUPPORTED_AGENTS) {
        const agentId = agentDef.agent_id;
        const reasons = [];
        let score = 0.5; // Base score

        // 1. Task domain affinity
        if (agentDef.best_for.includes(taskType)) {
          score += 0.3;
          reasons.push(`Strong affinity for task type '${taskType}'`);
        }

        // 2. Host environment detection
        const detected = detectedMap.get(agentId);
        const isDetected = detected ? detected.environment?.detected : true;
        if (isDetected) {
          score += 0.1;
          reasons.push('Agent environment detected on host system');
        } else {
          score -= 0.15;
          reasons.push('Agent environment not detected locally; execution may require configuration');
        }

        // 3. Candidate tools compatibility & distribution check
        let compatibleToolsCount = 0;
        let distributedToolsCount = 0;

        for (const tool of candidateTools) {
          const compatAgents = tool.compatible_agents || [];
          const suppAgents = tool.supported_agents || [];
          const isCompat = compatAgents.includes(agentId) || suppAgents.includes(agentId);
          if (isCompat) {
            compatibleToolsCount++;
            if (tool.is_distributed) distributedToolsCount++;
          }
        }

        if (candidateTools.length > 0) {
          const compatRatio = compatibleToolsCount / candidateTools.length;
          score += (compatRatio * 0.2);
          reasons.push(`Compatible with ${compatibleToolsCount}/${candidateTools.length} candidate tools`);
          if (distributedToolsCount > 0) {
            score += 0.1;
            reasons.push(`${distributedToolsCount} candidate tools already distributed`);
          }
        }

        // 4. Policy Engine check for agent
        if (policyEngine) {
          const policies = policyEngine.getPolicies ? policyEngine.getPolicies() : {};
          const agentPolicy = policies.agent_policies?.[agentId];
          if (agentPolicy) {
            // Check if agent explicitly denies required scopes
            const deniedScopes = agentPolicy.denied_scopes || [];
            let hasDeniedScope = false;
            for (const cap of requiredCaps) {
              if (deniedScopes.includes(cap)) {
                hasDeniedScope = true;
                rejectedAgents.push({
                  agent_id: agentId,
                  name: agentDef.name,
                  reason: `Agent policy explicitly denies required capability scope: ${cap}`,
                });
                break;
              }
            }
            if (hasDeniedScope) continue;
          }
        }

        rankedAgents.push({
          agent_id: agentId,
          name: agentDef.name,
          type: agentDef.type,
          score: Number(Math.min(1.0, Math.max(0.0, score)).toFixed(3)),
          reasons,
          is_detected: isDetected,
          compatible_tools_count: compatibleToolsCount,
          distributed_tools_count: distributedToolsCount,
        });
      }

      // Sort descending
      rankedAgents.sort((a, b) => b.score - a.score);

      const selectedAgent = rankedAgents[0] || null;
      const alternativeAgents = rankedAgents.slice(1);

      let explanation = '';
      if (selectedAgent) {
        explanation = `Selected '${selectedAgent.name}' (${selectedAgent.agent_id}) with score ${(selectedAgent.score * 100).toFixed(1)}%. ${selectedAgent.reasons.join('. ')}.`;
      } else {
        explanation = 'No suitable agent found for task specifications.';
      }

      return {
        selected_agent: selectedAgent,
        alternative_agents: alternativeAgents,
        rejected_agents: rejectedAgents,
        explanation,
      };
    },
  };
}

