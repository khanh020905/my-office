/**
 * Truthful Provider Capability Registry (Master Task Phase 1).
 * Accurately models and evaluates capabilities for Claude Code, Codex App, Codex CLI, and Antigravity.
 * Strictly separates: installed, configured, connected, verified, supported, unsupported, unavailable.
 */

export const CAPABILITY_OPERATIONS = [
  'observe',
  'start',
  'steer',
  'send_message',
  'cancel',
  'pause',
  'resume',
  'retry',
  'inspect_session',
  'retrieve_result',
];

export const CAPABILITY_STATUSES = [
  'supported',
  'unsupported',
  'installed',
  'configured',
  'connected',
  'verified',
  'unavailable',
  'unknown',
];

export const BASE_PROVIDER_DEFINITIONS = {
  'claude-code': {
    agentId: 'claude-code',
    provider: 'claude-code',
    displayName: 'Claude Code',
    type: 'cli_agent',
    protocols: ['skill', 'mcp', 'cli'],
    description: 'Autonomous CLI coding agent with skills, MCP server integration, and session steering.',
    // Inherent architectural support
    supportedOperations: {
      observe: true,
      start: true,
      steer: true,
      send_message: true,
      cancel: true,
      pause: false, // Claude Code does not support SIGSTOP/pause externally
      resume: false,
      retry: true,
      inspect_session: true,
      retrieve_result: true,
    },
    unsupportedReasons: {
      pause: 'Claude Code CLI does not expose an external pause API or safe suspend mechanism.',
      resume: 'Cannot resume suspended process without native pause support.',
    },
  },
  'codex-cli': {
    agentId: 'codex-cli',
    provider: 'codex-cli',
    displayName: 'Codex CLI',
    type: 'cli_agent',
    protocols: ['skill', 'mcp', 'cli'],
    description: 'Worktree-isolated Codex CLI agent with expected artifact verification and git sandboxing.',
    supportedOperations: {
      observe: true,
      start: true,
      steer: false, // Codex CLI runs batch prompt turns to completion without mid-execution stdin steering
      send_message: false,
      cancel: true,
      pause: false,
      resume: false,
      retry: true,
      inspect_session: true,
      retrieve_result: true,
    },
    unsupportedReasons: {
      steer: 'Codex CLI executes prompt batch tasks and does not expose mid-turn interactive stdin steering.',
      send_message: 'Mid-turn messaging not supported by Codex CLI process interface.',
      pause: 'Codex CLI does not support execution pausing.',
      resume: 'Cannot resume paused execution.',
    },
  },
  'codex-app': {
    agentId: 'codex-app',
    provider: 'codex-app',
    displayName: 'Codex App (Desktop)',
    type: 'desktop_app',
    protocols: ['hook', 'skill', 'mcp'],
    description: 'Desktop GUI application agent with hook observation and turn-based UI integration.',
    supportedOperations: {
      observe: true,
      start: false, // My Office cannot launch or automate the desktop GUI client directly
      steer: false,
      send_message: false,
      cancel: false, // GUI application lifecycle managed by user in desktop app
      pause: false,
      resume: false,
      retry: false,
      inspect_session: true,
      retrieve_result: true,
    },
    unsupportedReasons: {
      start: 'Codex App is a desktop GUI application; tasks must be initiated by the user inside the desktop app.',
      steer: 'Desktop GUI application does not accept external process steering.',
      send_message: 'External message injection not exposed by Codex App desktop application.',
      cancel: 'Cannot cancel Codex App turns externally; must be stopped by user inside Codex App.',
      pause: 'Desktop GUI application does not expose an external pause API.',
      resume: 'Pause/resume not supported by Codex App external hook interface.',
      retry: 'External retry dispatch not supported for desktop application sessions.',
    },
  },
  'antigravity': {
    agentId: 'antigravity',
    provider: 'antigravity',
    displayName: 'Antigravity',
    type: 'multimodal_agent',
    protocols: ['skill', 'mcp', 'cli'],
    description: 'Multimodal AI agent observed via filesystem state and workspace artifacts.',
    supportedOperations: {
      observe: true,
      start: false, // Primary integration is filesystem observer
      steer: false,
      send_message: false,
      cancel: false,
      pause: false,
      resume: false,
      retry: false,
      inspect_session: true,
      retrieve_result: true,
    },
    unsupportedReasons: {
      start: 'Antigravity is currently integrated as an observer of local workspace activity.',
      steer: 'Observer integration is read-only and does not accept task steering.',
      send_message: 'Direct messaging not supported across observer boundary.',
      cancel: 'External observer cannot terminate Antigravity host processes.',
      pause: 'Observer integration cannot pause Antigravity agent execution.',
      resume: 'Cannot resume paused execution.',
      retry: 'Task dispatch not supported for observer integration.',
    },
  },
};

export function createCapabilityRegistry({
  adapters = new Map(),
  integrationState = null,
} = {}) {
  /**
   * Resolves truthful capability status for a given agent and operation.
   */
  function evaluateAgentCapabilities(agentId) {
    const baseDef = BASE_PROVIDER_DEFINITIONS[agentId];
    if (!baseDef) return null;

    const adapter = adapters.get(agentId);
    const detected = adapter?.detectAgent ? adapter.detectAgent({ probe: true }) : { detected: false };
    const saved = integrationState?.get ? integrationState.get(agentId, detected) : { connected: false };

    const installed = Boolean(saved.installed || detected.executable_path || detected.installed);
    const configured = Boolean(saved.configured || detected.configured);
    const connected = Boolean(saved.connected && !saved.evidenceStale);
    const verified = Boolean(saved.functionallyVerified || detected.status === 'FUNCTIONALLY_VERIFIED');

    const capabilities = {};

    for (const op of CAPABILITY_OPERATIONS) {
      const isArchSupported = baseDef.supportedOperations[op] ?? false;

      if (!isArchSupported) {
        capabilities[op] = {
          status: 'unsupported',
          available: false,
          reason: baseDef.unsupportedReasons[op] || 'Not supported by provider architecture.',
        };
        continue;
      }

      // For supported operations, availability depends on live installation, configuration & connection
      if (['start', 'cancel', 'steer', 'send_message', 'retry'].includes(op)) {
        if (!installed) {
          capabilities[op] = {
            status: 'unavailable',
            available: false,
            reason: `Agent executable not found on host (${detected.detection_error || 'Not installed'}).`,
          };
        } else if (!configured && agentId === 'claude-code' && !detected.config_path) {
          capabilities[op] = {
            status: 'configured',
            available: false,
            reason: 'Agent is installed but configuration file is missing.',
          };
        } else {
          capabilities[op] = {
            status: verified ? 'verified' : connected ? 'connected' : 'installed',
            available: true,
            reason: `Operation supported and agent binary verified at ${detected.executable_path || 'host'}.`,
          };
        }
      } else if (op === 'observe' || op === 'inspect_session' || op === 'retrieve_result') {
        capabilities[op] = {
          status: connected ? 'connected' : 'supported',
          available: true,
          reason: 'Passive observation and state inspection available.',
        };
      } else {
        capabilities[op] = {
          status: 'supported',
          available: true,
          reason: 'Supported by integration.',
        };
      }
    }

    return {
      agentId,
      provider: baseDef.provider,
      displayName: baseDef.displayName,
      type: baseDef.type,
      description: baseDef.description,
      installed,
      configured,
      connected,
      verified,
      overallStatus: verified ? 'FUNCTIONALLY_VERIFIED' : connected ? 'CONNECTED' : configured ? 'CONFIGURED' : installed ? 'DETECTED' : 'SUPPORTED',
      executablePath: detected.executable_path || null,
      version: detected.version || null,
      lastObservedAt: saved.lastObservedAt || null,
      lastVerifiedAt: saved.lastVerifiedAt || null,
      capabilities,
    };
  }

  function getAgent(agentId) {
    return evaluateAgentCapabilities(agentId);
  }

  function listAgents() {
    return Object.keys(BASE_PROVIDER_DEFINITIONS).map(evaluateAgentCapabilities);
  }

  function isOperationAllowed(agentId, operation) {
    const info = evaluateAgentCapabilities(agentId);
    if (!info) return { allowed: false, reason: `Unknown agent: ${agentId}` };
    const cap = info.capabilities[operation];
    if (!cap) return { allowed: false, reason: `Unknown operation: ${operation}` };
    if (!cap.available) return { allowed: false, reason: cap.reason };
    return { allowed: true, reason: cap.reason, agent: info };
  }

  return {
    getAgent,
    listAgents,
    isOperationAllowed,
    CAPABILITY_OPERATIONS,
    BASE_PROVIDER_DEFINITIONS,
  };
}

