export const CURRENT_SCHEMA_VERSION = '1.0.0';

/**
 * Extensible Universal Tool Categories as defined in Master Architecture Prompt Section 4.
 * Extensible at runtime — user can add custom categories.
 */
export const INITIAL_CATEGORIES = [
  { id: 'coding-workflow', name: 'Coding Workflow Tools', description: 'Development lifecycle, code editing, refactoring, and project scaffolding.' },
  { id: 'code-intelligence', name: 'Code Intelligence', description: 'AST analysis, call graphs, knowledge graphs, symbol navigation, and semantic indexing.' },
  { id: 'context-optimization', name: 'Context Optimization', description: 'Context curation, prompt caching, token pruning, and relevant snippet extraction.' },
  { id: 'token-reduction', name: 'Token Reduction', description: 'Compression, deduplication, and minimal token representation.' },
  { id: 'agent-frameworks', name: 'Agent Frameworks', description: 'Multi-agent frameworks, specialized agent personas, and agent runtime environments.' },
  { id: 'agent-skills', name: 'Agent Skills', description: 'Standardized SKILL.md bundles, procedures, and executable workflows.' },
  { id: 'mcp-servers', name: 'MCP Servers', description: 'Model Context Protocol servers exposing tools, resources, and prompt templates.' },
  { id: 'cli-utilities', name: 'CLI Utilities', description: 'Command-line tools, binary wrappers, and headless script interfaces.' },
  { id: 'hooks', name: 'Hooks', description: 'Pre- and post-execution hooks, lifecycle monitors, and event interceptors.' },
  { id: 'testing-qa', name: 'Testing and QA', description: 'Automated test runners, video/visual QA, regression monitors, and linters.' },
  { id: 'documentation-retrieval', name: 'Documentation Retrieval', description: 'Up-to-date documentation search, API reference lookups, and library manuals.' },
  { id: 'browser-automation', name: 'Browser Automation', description: 'Headless browser drivers, web scraping, and UI interaction engines.' },
  { id: 'research-tools', name: 'Research Tools', description: 'Web search, paper summarization, fact verification, and intelligence gathering.' },
  { id: 'image-generation', name: 'Image Generation', description: 'Diffusion models, image synthesis, visual asset creation, and editing.' },
  { id: 'video-generation', name: 'Video Generation', description: 'Generative video models, rendering pipelines, motion graphics, and video editing.' },
  { id: 'audio-voice', name: 'Audio and Voice', description: 'Text-to-speech, voice cloning, audio mixing, music generation, and audio QA.' },
  { id: 'api-integrations', name: 'API Integrations', description: 'External service adapters, webhooks, SaaS connectors, and third-party APIs.' },
  { id: 'workflow-automation', name: 'Workflow Automation', description: 'DAG pipelines, scheduled tasks, background daemons, and trigger automation.' },
  { id: 'security-tools', name: 'Security Tools', description: 'Static analysis, vulnerability scanners, secret detectors, and permission guards.' },
  { id: 'other-emerging', name: 'Other Emerging AI Tools', description: 'New modalities, experimental protocols, and cutting-edge agent tools.' },
];

/**
 * Supported Integration Protocols (Master Architecture Prompt §6 & §7).
 * A single tool identity may expose multiple capabilities spanning multiple protocols.
 */
export const INTEGRATION_PROTOCOLS = new Set(['mcp', 'cli', 'skill', 'api', 'hook']);

/**
 * 15 Tool Lifecycle States (Master Architecture Prompt §9).
 */
export const LIFECYCLE_STATES = new Set([
  'discovered',
  'under_review',
  'pending_approval',
  'installing',
  'installed',
  'configuring',
  'verifying',
  'healthy',
  'disabled',
  'update_available',
  'updating',
  'failed',
  'conflict_detected',
  'uninstalling',
  'uninstalled',
]);

/**
 * Tool Health States.
 */
export const HEALTH_STATES = new Set(['healthy', 'degraded', 'unhealthy', 'unknown']);

/**
 * Security Audit States.
 */
export const SECURITY_STATES = new Set(['clean', 'warnings', 'quarantined', 'unreviewed']);

/**
 * Permitted Standard Permission Scopes (Phase 5 Master Architecture §2).
 * Filesystem: fs:read, fs:write, fs:delete
 * Network: net:outbound, net:inbound
 * Process: process:exec, process:spawn, process:terminate
 * Environment: env:read, env:write
 * Credentials: secrets:read, secrets:write
 * Integration: mcp:connect, api:access, hooks:register
 */
export const STANDARD_PERMISSION_SCOPES = new Set([
  'fs:read',
  'fs:write',
  'fs:delete',
  'net:outbound',
  'net:inbound',
  'process:exec',
  'process:spawn',
  'process:terminate',
  'agent:invoke',
  'runtime:spawn',
  'env:read',
  'env:write',
  'secrets:read',
  'secrets:write',
  'mcp:connect',
  'api:access',
  'hooks:register',
]);

// Backward compatibility alias
export const PERMISSION_SCOPES = STANDARD_PERMISSION_SCOPES;

/**
 * Validates a permission scope string (standard or custom).
 */
export function isValidPermissionScope(scope) {
  if (typeof scope !== 'string') return false;
  if (STANDARD_PERMISSION_SCOPES.has(scope)) return true;
  // Custom scope pattern: custom:<namespace>:<action> or custom:<action>
  return /^custom:[a-z0-9_.-]+$/i.test(scope);
}

/**
 * Supported Installation Types.
 */
export const INSTALLATION_TYPES = new Set(['git', 'npm', 'python', 'binary', 'skill_folder', 'system']);

/**
 * Helper to validate a non-empty string.
 */
function isNonEmptyString(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

/**
 * Validates a capability definition.
 */
export function validateCapability(cap, index = 0) {
  const errors = [];
  if (!cap || typeof cap !== 'object') {
    return { valid: false, errors: [`Capability at index ${index} must be an object`] };
  }

  if (!isNonEmptyString(cap.capability_id)) {
    errors.push(`Capability at index ${index} missing required 'capability_id'`);
  } else if (!/^[a-z0-9_.-]+$/i.test(cap.capability_id)) {
    errors.push(`Capability 'capability_id' (${cap.capability_id}) must contain only alphanumeric characters, dots, dashes, and underscores`);
  }

  if (!isNonEmptyString(cap.name)) {
    errors.push(`Capability ${cap.capability_id || index} missing required 'name'`);
  }

  if (!INTEGRATION_PROTOCOLS.has(cap.protocol)) {
    errors.push(`Capability ${cap.capability_id || index} has invalid protocol '${cap.protocol}'. Must be one of: ${[...INTEGRATION_PROTOCOLS].join(', ')}`);
  }

  if (!isNonEmptyString(cap.entry_point)) {
    errors.push(`Capability ${cap.capability_id || index} missing required 'entry_point'`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a permission declaration.
 */
export function validatePermission(perm, index = 0) {
  const errors = [];
  if (!perm || typeof perm !== 'object') {
    return { valid: false, errors: [`Permission at index ${index} must be an object`] };
  }

  if (!isValidPermissionScope(perm.scope)) {
    errors.push(`Permission at index ${index} has invalid scope '${perm.scope}'. Must be a valid standard scope or custom 'namespace:action' format`);
  }

  if (!isNonEmptyString(perm.target)) {
    errors.push(`Permission at index ${index} missing required 'target'`);
  }

  if (!isNonEmptyString(perm.justification)) {
    errors.push(`Permission at index ${index} missing required 'justification'`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates an agent compatibility record.
 */
export function validateAgentCompatibility(compat, agentName) {
  const errors = [];
  if (!compat || typeof compat !== 'object') {
    return { valid: false, errors: [`Compatibility for agent '${agentName}' must be an object`] };
  }

  if (typeof compat.verified !== 'boolean') {
    errors.push(`Compatibility for agent '${agentName}' must define boolean 'verified'`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a complete Universal Tool definition.
 */
export function validateTool(tool) {
  const errors = [];

  if (!tool || typeof tool !== 'object') {
    return { valid: false, errors: ['Tool definition must be an object'] };
  }

  // 1. Identity
  if (!isNonEmptyString(tool.tool_id)) {
    errors.push("Missing required field 'tool_id'");
  } else if (!/^[a-z0-9_-]+$/i.test(tool.tool_id)) {
    errors.push(`'tool_id' (${tool.tool_id}) must contain only alphanumeric characters, dashes, and underscores`);
  }

  if (!isNonEmptyString(tool.name)) {
    errors.push("Missing required field 'name'");
  }

  if (typeof tool.description !== 'string') {
    errors.push("Field 'description' must be a string");
  }

  if (!isNonEmptyString(tool.source_repository)) {
    errors.push("Missing required field 'source_repository'");
  }

  if (!isNonEmptyString(tool.repository_owner)) {
    errors.push("Missing required field 'repository_owner'");
  }

  if (!isNonEmptyString(tool.version)) {
    errors.push("Missing required field 'version'");
  }

  if (!isNonEmptyString(tool.license)) {
    errors.push("Missing required field 'license'");
  }

  if (!INSTALLATION_TYPES.has(tool.installation_type)) {
    errors.push(`Invalid 'installation_type': '${tool.installation_type}'. Must be one of: ${[...INSTALLATION_TYPES].join(', ')}`);
  }

  // 2. Lifecycle & Health
  if (tool.installation_status && !LIFECYCLE_STATES.has(tool.installation_status)) {
    errors.push(`Invalid 'installation_status': '${tool.installation_status}'`);
  }

  if (tool.health_status && !HEALTH_STATES.has(tool.health_status)) {
    errors.push(`Invalid 'health_status': '${tool.health_status}'`);
  }

  if (tool.security_status && !SECURITY_STATES.has(tool.security_status)) {
    errors.push(`Invalid 'security_status': '${tool.security_status}'`);
  }

  if (typeof tool.enabled_status !== 'boolean') {
    errors.push("Field 'enabled_status' must be a boolean");
  }

  // 3. Categories
  if (!Array.isArray(tool.categories) || tool.categories.length === 0) {
    errors.push("Field 'categories' must be a non-empty array of category IDs");
  }

  // 4. Capabilities (Multiple allowed per tool)
  if (!Array.isArray(tool.capabilities) || tool.capabilities.length === 0) {
    errors.push("Field 'capabilities' must be a non-empty array of capability objects");
  } else {
    const seenCapIds = new Set();
    tool.capabilities.forEach((cap, idx) => {
      const capVal = validateCapability(cap, idx);
      if (!capVal.valid) {
        errors.push(...capVal.errors);
      }
      if (cap && cap.capability_id) {
        if (seenCapIds.has(cap.capability_id)) {
          errors.push(`Duplicate capability_id '${cap.capability_id}' within the same tool`);
        }
        seenCapIds.add(cap.capability_id);
      }
    });
  }

  // 5. Integration Protocols (Must match exposed capabilities)
  if (!Array.isArray(tool.integration_protocols) || tool.integration_protocols.length === 0) {
    errors.push("Field 'integration_protocols' must be a non-empty array");
  } else {
    for (const proto of tool.integration_protocols) {
      if (!INTEGRATION_PROTOCOLS.has(proto)) {
        errors.push(`Invalid protocol '${proto}' in 'integration_protocols'`);
      }
    }
  }

  // 6. Permissions
  if (tool.required_permissions != null) {
    if (!Array.isArray(tool.required_permissions)) {
      errors.push("Field 'required_permissions' must be an array");
    } else {
      tool.required_permissions.forEach((perm, idx) => {
        const pVal = validatePermission(perm, idx);
        if (!pVal.valid) errors.push(...pVal.errors);
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Creates a normalized tool object with all default fields populated.
 */
export function createDefaultToolRecord(raw) {
  const now = new Date().toISOString();
  return {
    tool_id: raw.tool_id,
    name: raw.name,
    description: raw.description || '',
    source_repository: raw.source_repository,
    repository_owner: raw.repository_owner || 'unknown',
    version: raw.version || '1.0.0',
    latest_available_version: raw.latest_available_version || raw.version || '1.0.0',
    pinned_version: raw.pinned_version || null,
    license: raw.license || 'MIT',
    installation_type: raw.installation_type || 'git',
    categories: Array.isArray(raw.categories) ? [...raw.categories] : ['other-emerging'],
    capabilities: Array.isArray(raw.capabilities) ? structuredClone(raw.capabilities) : [],
    integration_protocols: Array.isArray(raw.integration_protocols) && raw.integration_protocols.length > 0
      ? [...raw.integration_protocols]
      : Array.from(new Set((raw.capabilities || []).map((c) => c.protocol).filter(Boolean))),
    supported_agents: Array.isArray(raw.supported_agents) ? [...raw.supported_agents] : [],
    compatible_agents: Array.isArray(raw.compatible_agents) ? [...raw.compatible_agents] : [],
    required_permissions: Array.isArray(raw.required_permissions)
      ? raw.required_permissions.map((p) => (typeof p === 'string' ? { scope: p, target: '*', justification: 'Required for operation' } : p))
      : [],
    dependencies: {
      system: Array.isArray(raw.dependencies?.system) ? [...raw.dependencies.system] : [],
      tools: Array.isArray(raw.dependencies?.tools) ? [...raw.dependencies.tools] : [],
      packages: Array.isArray(raw.dependencies?.packages) ? [...raw.dependencies.packages] : [],
    },
    configuration_schema: raw.configuration_schema && typeof raw.configuration_schema === 'object' ? structuredClone(raw.configuration_schema) : {},
    installation_path: raw.installation_path || '',
    health_status: raw.health_status || 'unknown',
    installation_status: raw.installation_status || 'discovered',
    enabled_status: typeof raw.enabled_status === 'boolean' ? raw.enabled_status : true,
    security_status: raw.security_status || 'unreviewed',
    conflict_status: {
      has_conflicts: Boolean(raw.conflict_status?.has_conflicts),
      conflicting_tool_ids: Array.isArray(raw.conflict_status?.conflicting_tool_ids) ? [...raw.conflict_status.conflicting_tool_ids] : [],
      conflict_reasons: Array.isArray(raw.conflict_status?.conflict_reasons) ? [...raw.conflict_status.conflict_reasons] : [],
    },
    verification_evidence: Array.isArray(raw.verification_evidence) ? structuredClone(raw.verification_evidence) : [],
    installed_at: raw.installed_at || now,
    updated_at: raw.updated_at || now,
    usage_history: Array.isArray(raw.usage_history) ? structuredClone(raw.usage_history) : [],
    usage_summary: {
      total_invocations: Number(raw.usage_summary?.total_invocations || 0),
      last_used: raw.usage_summary?.last_used || null,
      success_rate: typeof raw.usage_summary?.success_rate === 'number' ? raw.usage_summary.success_rate : 1.0,
      average_duration_ms: Number(raw.usage_summary?.average_duration_ms || 0),
    },
    custom_metadata: raw.custom_metadata && typeof raw.custom_metadata === 'object' ? structuredClone(raw.custom_metadata) : {},
  };
}

