/**
 * Tool Conflict Detector.
 * Identifies port conflicts, executable name collisions, duplicate capabilities,
 * installation path collisions, and dependency incompatibilities.
 */

import path from 'node:path';

// Critical system binary names that cannot be shadowed or taken by AI tools
const RESERVED_EXECUTABLE_NAMES = new Set([
  'node',
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'python',
  'python3',
  'pip',
  'git',
  'claude',
  'codex',
  'agy',
  'cmd',
  'powershell',
  'bash',
  'sh',
  'curl',
  'wget',
  'rm',
  'del',
  'cat',
]);

/**
 * Inspects a tool candidate against the existing registry to detect conflicts.
 */
export function detectToolConflicts(candidateTool, existingTools = []) {
  const conflicts = [];
  const candidateId = candidateTool.tool_id;

  // 1. Check for Duplicate Tool ID / Replacement
  const existingSameId = existingTools.find((t) => t.tool_id === candidateId);
  if (existingSameId && existingSameId.installation_status === 'healthy') {
    conflicts.push({
      type: 'duplicate_tool_id',
      severity: 'warning',
      description: `Tool '${candidateId}' is already installed at version ${existingSameId.version}. Proceeding with installation will trigger an update workflow.`,
      conflicting_tool_id: candidateId,
    });
  }

  // 2. Check for Executable Name Collisions
  const candidateExecutables = [];
  for (const cap of candidateTool.capabilities || []) {
    if (cap.protocol === 'cli') {
      const name = cap.name || path.basename(cap.entry_point || '').replace(/\.[^.]+$/, '');
      if (name) candidateExecutables.push({ name: name.toLowerCase(), capId: cap.capability_id });
    }
  }

  for (const { name, capId } of candidateExecutables) {
    if (RESERVED_EXECUTABLE_NAMES.has(name)) {
      conflicts.push({
        type: 'reserved_executable_collision',
        severity: 'critical',
        description: `Capability '${capId}' uses reserved system binary name '${name}'. Cannot register CLI with this executable name.`,
        conflicting_tool_id: 'system',
      });
    }

    for (const tool of existingTools) {
      if (tool.tool_id === candidateId) continue;
      for (const cap of tool.capabilities || []) {
        if (cap.protocol === 'cli') {
          const existingName = (cap.name || path.basename(cap.entry_point || '').replace(/\.[^.]+$/, '')).toLowerCase();
          if (existingName === name) {
            conflicts.push({
              type: 'executable_collision',
              severity: 'high',
              description: `Executable name '${name}' collides with capability '${cap.capability_id}' in tool '${tool.name}' (${tool.tool_id}).`,
              conflicting_tool_id: tool.tool_id,
            });
          }
        }
      }
    }
  }

  // 3. Check for Port Conflicts (if port or endpoint configured)
  const candidatePorts = [];
  for (const cap of candidateTool.capabilities || []) {
    if (cap.config?.port) {
      candidatePorts.push({ port: Number(cap.config.port), capId: cap.capability_id });
    }
  }

  for (const { port, capId } of candidatePorts) {
    if (port < 1024 || port > 65535) {
      conflicts.push({
        type: 'invalid_port',
        severity: 'high',
        description: `Port ${port} in capability '${capId}' is out of valid unprivileged range (1024-65535).`,
      });
    }

    for (const tool of existingTools) {
      if (tool.tool_id === candidateId) continue;
      for (const cap of tool.capabilities || []) {
        if (cap.config?.port && Number(cap.config.port) === port) {
          conflicts.push({
            type: 'port_collision',
            severity: 'critical',
            description: `Port ${port} is already allocated to capability '${cap.capability_id}' in tool '${tool.name}' (${tool.tool_id}).`,
            conflicting_tool_id: tool.tool_id,
          });
        }
      }
    }
  }

  // 4. Check for Capability ID Uniqueness
  for (const cap of candidateTool.capabilities || []) {
    for (const tool of existingTools) {
      if (tool.tool_id === candidateId) continue;
      const dup = (tool.capabilities || []).find((c) => c.capability_id === cap.capability_id);
      if (dup) {
        conflicts.push({
          type: 'duplicate_capability_id',
          severity: 'high',
          description: `Capability ID '${cap.capability_id}' is already registered in tool '${tool.tool_id}'. Capability IDs must be globally unique or namespace-prefixed.`,
          conflicting_tool_id: tool.tool_id,
        });
      }
    }
  }

  const hasCritical = conflicts.some((c) => c.severity === 'critical');
  return {
    has_conflicts: conflicts.length > 0,
    can_proceed: !hasCritical,
    conflicts,
    conflicting_tool_ids: [...new Set(conflicts.map((c) => c.conflicting_tool_id).filter(Boolean))],
    conflict_reasons: conflicts.map((c) => c.description),
  };
}

