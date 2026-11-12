/**
 * Tool Lifecycle Manager.
 * Orchestrates installation, verification, updating, rollback, version pinning,
 * health checking, safe uninstallation, and audit logging.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isSafePath, copyDirectorySync } from './fs-utils.mjs';
import { getAdapterForTool } from './installation-adapters.mjs';
import { performToolHealthCheck } from './health-checker.mjs';
import { detectToolConflicts } from './conflict-detector.mjs';
import { redactSecrets } from './execution-runner.mjs';

// Valid transitions between the 15 Lifecycle States (Master Architecture §9)
export const VALID_LIFECYCLE_TRANSITIONS = {
  discovered: ['under_review', 'pending_approval', 'installing', 'uninstalled'],
  under_review: ['pending_approval', 'discovered', 'uninstalled'],
  pending_approval: ['installing', 'discovered', 'under_review', 'uninstalled'],
  installing: ['installed', 'failed'],
  installed: ['configuring', 'verifying', 'enabled', 'disabled', 'updating', 'uninstalling', 'failed'],
  configuring: ['verifying', 'failed'],
  verifying: ['healthy', 'failed'],
  healthy: ['disabled', 'update_available', 'updating', 'uninstalling', 'verifying', 'conflict_detected', 'failed'],
  disabled: ['healthy', 'enabled', 'updating', 'uninstalling', 'failed'],
  update_available: ['updating', 'healthy', 'disabled', 'uninstalling'],
  updating: ['healthy', 'failed'],
  conflict_detected: ['under_review', 'uninstalling', 'healthy'],
  uninstalling: ['uninstalled', 'failed'],
  uninstalled: ['discovered', 'pending_approval', 'installing'],
  failed: ['under_review', 'pending_approval', 'installing', 'uninstalling', 'healthy'],
};

/**
 * Creates the Tool Lifecycle Manager instance.
 */
export function createLifecycleManager({
  registry,
  baseDir,
} = {}) {
  const toolsDir = baseDir ? path.resolve(baseDir) : path.resolve(process.cwd(), 'data', 'tools');
  const managedDir = path.join(toolsDir, 'managed');
  const stagingDir = path.join(toolsDir, 'staging');
  const snapshotsDir = path.join(toolsDir, 'snapshots');
  const quarantineDir = path.join(toolsDir, 'quarantine');
  const logsDir = path.join(toolsDir, 'logs');
  const auditFile = path.join(logsDir, 'audit.jsonl');

  // Ensure managed directories exist
  for (const d of [toolsDir, managedDir, stagingDir, snapshotsDir, quarantineDir, logsDir]) {
    fs.mkdirSync(d, { recursive: true });
  }

  // Active operations lock map: toolId -> { opId, type, startTime }
  const activeOperations = new Map();

  /**
   * Appends an event to the audit log.
   */
  function logAudit(entry) {
    try {
      const record = {
        timestamp: new Date().toISOString(),
        ...entry,
      };
      // Ensure any error or messages are redacted
      if (record.error) record.error = redactSecrets(record.error);
      if (record.message) record.message = redactSecrets(record.message);

      fs.appendFileSync(auditFile, JSON.stringify(record) + '\n', 'utf8');
    } catch {
      /* audit log append failure should not crash operation */
    }
  }

  /**
   * Retrieves audit logs with optional filtering.
   */
  function getAuditLogs({ toolId, limit = 50 } = {}) {
    if (!fs.existsSync(auditFile)) return [];
    try {
      const lines = fs.readFileSync(auditFile, 'utf8').split('\n').filter(Boolean);
      let entries = lines.map((l) => JSON.parse(l));
      if (toolId) {
        entries = entries.filter((e) => e.tool_id === toolId);
      }
      return entries.slice(-limit).reverse();
    } catch {
      return [];
    }
  }

  /**
   * Validates state transition.
   */
  function validateTransition(currentStatus, nextStatus) {
    if (currentStatus === nextStatus) return { ok: true };
    const allowed = VALID_LIFECYCLE_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
      return {
        ok: false,
        error: `Invalid lifecycle transition from '${currentStatus}' to '${nextStatus}'. Allowed: [${allowed.join(', ')}]`,
      };
    }
    return { ok: true };
  }

  /**
   * Recovers from server restarts by finding any tools left in transient states.
   */
  function recoverInterruptedOperations() {
    const allTools = registry.listTools();
    const transientStates = ['installing', 'updating', 'uninstalling', 'verifying', 'configuring'];
    const recovered = [];

    for (const tool of allTools) {
      if (transientStates.includes(tool.installation_status)) {
        const opId = `recovery-${Date.now()}`;
        registry.updateTool(tool.tool_id, {
          installation_status: 'failed',
          health_status: 'unhealthy',
          enabled_status: false,
          verification_evidence: [
            ...(tool.verification_evidence || []),
            {
              at: new Date().toISOString(),
              status: 'interrupted',
              evidence: `Operation was interrupted by server restart during state '${tool.installation_status}'. Marked as failed.`,
            },
          ],
        });

        logAudit({
          operation_id: opId,
          tool_id: tool.tool_id,
          operation_type: 'restart_recovery',
          from_status: tool.installation_status,
          to_status: 'failed',
          message: 'Tool operation was interrupted by server restart and transitioned to failed.',
        });

        recovered.push(tool.tool_id);
      }
    }

    return recovered;
  }

  // Run recovery on initialization
  recoverInterruptedOperations();

  /**
   * Prepares an installation plan for user review.
   */
  function prepareInstallationPlan(candidateTool) {
    const adapter = getAdapterForTool(candidateTool);
    const conflicts = detectToolConflicts(candidateTool, registry.listTools());
    const opId = `op-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const planStagingDir = path.join(stagingDir, opId);

    const plan = adapter.plan(candidateTool, { stagingDir: planStagingDir });
    plan.conflicts = conflicts;

    return {
      ok: true,
      plan_id: opId,
      tool_id: candidateTool.tool_id,
      version: candidateTool.version || '1.0.0',
      installation_type: adapter.name,
      execution_plan: plan,
      conflicts,
      can_proceed: conflicts.can_proceed,
    };
  }

  /**
   * Installs a tool into managed storage with staging and verification.
   */
  async function installTool(candidateTool, {
    userApproval,
    files = {},
  } = {}) {
    const toolId = candidateTool.tool_id;
    const version = candidateTool.version || '1.0.0';

    // 1. Mandatory user approval check
    if (!userApproval || userApproval.approved !== true) {
      return {
        ok: false,
        error: 'Installation requires explicit user approval. Approval must include approved=true, plan_id, and timestamp.',
      };
    }

    // 2. Prevent concurrent operations on the same tool
    if (activeOperations.has(toolId)) {
      return {
        ok: false,
        error: `Tool '${toolId}' is currently busy with operation '${activeOperations.get(toolId).type}'`,
      };
    }

    // 3. Pre-installation conflict check
    const conflicts = detectToolConflicts(candidateTool, registry.listTools());
    if (!conflicts.can_proceed) {
      return {
        ok: false,
        error: `Cannot install due to critical conflicts: ${conflicts.conflict_reasons.join('; ')}`,
        conflicts,
      };
    }

    const opId = userApproval.plan_id || `op-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    activeOperations.set(toolId, { opId, type: 'install', startTime: Date.now() });

    // Transition state in registry to 'installing'
    const transVal = validateTransition(candidateTool.installation_status || 'discovered', 'installing');
    if (!transVal.ok) {
      activeOperations.delete(toolId);
      return transVal;
    }

    registry.registerTool({
      ...candidateTool,
      installation_status: 'installing',
      health_status: 'unknown',
      enabled_status: false,
    });

    logAudit({
      operation_id: opId,
      tool_id: toolId,
      tool_version: version,
      operation_type: 'install_start',
      user_approval: userApproval,
    });

    const currentStaging = path.join(stagingDir, opId);
    fs.mkdirSync(currentStaging, { recursive: true });

    try {
      const adapter = getAdapterForTool(candidateTool);

      // A. Run Adapter Staging Installation
      const installRes = await adapter.install(currentStaging, candidateTool, { files });
      if (!installRes.ok) {
        throw new Error(installRes.error || 'Adapter staging installation failed');
      }

      // Transition to 'verifying'
      registry.updateTool(toolId, { installation_status: 'verifying' });

      // B. Run Adapter Verification in Staging
      const verifyRes = await adapter.verify(currentStaging, candidateTool);
      if (!verifyRes.ok) {
        throw new Error(verifyRes.error || 'Adapter verification failed');
      }

      // Write verification manifest
      fs.writeFileSync(
        path.join(currentStaging, 'verification.json'),
        JSON.stringify({ verified: true, verified_at: new Date().toISOString(), result: verifyRes }, null, 2),
        'utf8'
      );

      // C. Atomic Activation: move/copy from staging to managed/<tool-id>/<version>
      const targetVersionDir = path.join(managedDir, toolId, version);
      copyDirectorySync(currentStaging, targetVersionDir);

      // Clean up staging
      try {
        fs.rmSync(currentStaging, { recursive: true, force: true });
      } catch {
        /* ignore staging cleanup error */
      }

      // D. Final Health Check
      const updatedRecord = {
        ...candidateTool,
        installation_path: targetVersionDir,
        installed_version: version,
        installation_status: 'healthy',
        health_status: 'healthy',
        enabled_status: true,
      };

      const healthCheck = await performToolHealthCheck(updatedRecord);
      if (!healthCheck.healthy) {
        throw new Error(`Initial operational health check failed: ${healthCheck.message}`);
      }

      // E. Update Registry Record
      registry.updateTool(toolId, {
        installation_path: targetVersionDir,
        installed_version: version,
        installation_status: 'healthy',
        health_status: 'healthy',
        enabled_status: true,
        verification_evidence: [
          ...(candidateTool.verification_evidence || []),
          {
            at: new Date().toISOString(),
            status: 'verified',
            evidence: `Successfully installed version ${version} via ${adapter.name} adapter. Verification passed.`,
          },
        ],
      });

      logAudit({
        operation_id: opId,
        tool_id: toolId,
        tool_version: version,
        operation_type: 'install_success',
        installation_path: targetVersionDir,
        managed_files_count: installRes.managedFiles?.length || 0,
      });

      activeOperations.delete(toolId);
      return {
        ok: true,
        tool_id: toolId,
        version,
        installation_path: targetVersionDir,
        health_status: 'healthy',
      };
    } catch (err) {
      // Clean up staging
      try {
        fs.rmSync(currentStaging, { recursive: true, force: true });
      } catch {
        /* ignore */
      }

      registry.updateTool(toolId, {
        installation_status: 'failed',
        health_status: 'unhealthy',
        enabled_status: false,
        verification_evidence: [
          ...(candidateTool.verification_evidence || []),
          {
            at: new Date().toISOString(),
            status: 'failed',
            evidence: `Installation failed: ${err.message}`,
          },
        ],
      });

      logAudit({
        operation_id: opId,
        tool_id: toolId,
        tool_version: version,
        operation_type: 'install_failed',
        error: err.message,
      });

      activeOperations.delete(toolId);
      return { ok: false, error: err.message, tool_id: toolId };
    }
  }

  /**
   * Toggles enabled / disabled state of an installed tool.
   */
  function toggleToolEnabled(toolId, enabled) {
    const tool = registry.getTool(toolId);
    if (!tool) return { ok: false, error: 'Tool not found' };

    const newStatus = enabled ? 'healthy' : 'disabled';
    const transVal = validateTransition(tool.installation_status, newStatus);
    if (!transVal.ok && tool.installation_status !== 'healthy' && tool.installation_status !== 'disabled') {
      return transVal;
    }

    registry.updateTool(toolId, {
      enabled_status: Boolean(enabled),
      installation_status: enabled ? (tool.health_status === 'healthy' ? 'healthy' : 'installed') : 'disabled',
    });

    logAudit({
      operation_id: `toggle-${Date.now()}`,
      tool_id: toolId,
      operation_type: enabled ? 'enable' : 'disable',
    });

    return { ok: true, tool_id: toolId, enabled: Boolean(enabled) };
  }

  /**
   * Pins a tool to a specific version.
   */
  function pinVersion(toolId, version) {
    const tool = registry.getTool(toolId);
    if (!tool) return { ok: false, error: 'Tool not found' };

    registry.updateTool(toolId, { pinned_version: version });
    logAudit({
      operation_id: `pin-${Date.now()}`,
      tool_id: toolId,
      operation_type: 'pin_version',
      pinned_version: version,
    });

    return { ok: true, tool_id: toolId, pinned_version: version };
  }

  /**
   * Unpins a tool.
   */
  function unpinVersion(toolId) {
    const tool = registry.getTool(toolId);
    if (!tool) return { ok: false, error: 'Tool not found' };

    registry.updateTool(toolId, { pinned_version: null });
    logAudit({
      operation_id: `unpin-${Date.now()}`,
      tool_id: toolId,
      operation_type: 'unpin_version',
    });

    return { ok: true, tool_id: toolId, pinned_version: null };
  }

  /**
   * Creates an installation snapshot for backup and rollback.
   */
  function createSnapshot(toolId) {
    const tool = registry.getTool(toolId);
    if (!tool || !tool.installation_path || !fs.existsSync(tool.installation_path)) {
      return { ok: false, error: 'Cannot create snapshot: tool has no installed files on disk' };
    }

    const snapshotId = `snap-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const snapDir = path.join(snapshotsDir, toolId, `${tool.version || '1.0.0'}-${snapshotId}`);

    copyDirectorySync(tool.installation_path, snapDir);

    // Save metadata snapshot
    fs.writeFileSync(path.join(snapDir, 'registry-snapshot.json'), JSON.stringify(tool, null, 2), 'utf8');

    logAudit({
      operation_id: snapshotId,
      tool_id: toolId,
      operation_type: 'snapshot_created',
      snapshot_path: snapDir,
    });

    return { ok: true, snapshot_id: snapshotId, snapshot_path: snapDir };
  }

  /**
   * Updates an existing installed tool with staging and rollback protection.
   */
  async function updateTool(toolId, newVersion, {
    userApproval,
    files = {},
  } = {}) {
    const tool = registry.getTool(toolId);
    if (!tool) return { ok: false, error: 'Tool not found' };

    // 1. Check version pin
    if (tool.pinned_version) {
      return {
        ok: false,
        error: `Tool '${toolId}' is pinned to version ${tool.pinned_version}. Unpin before updating.`,
      };
    }

    // 2. Mandatory approval
    if (!userApproval || userApproval.approved !== true) {
      return { ok: false, error: 'Updating requires explicit user approval.' };
    }

    // 3. Prevent concurrent operations
    if (activeOperations.has(toolId)) {
      return { ok: false, error: `Tool '${toolId}' is currently busy with another operation` };
    }

    const opId = userApproval.plan_id || `update-${Date.now()}`;
    activeOperations.set(toolId, { opId, type: 'update', startTime: Date.now() });

    // 4. Create snapshot of the existing healthy installation before updating
    const snapResult = createSnapshot(toolId);
    if (!snapResult.ok) {
      activeOperations.delete(toolId);
      return { ok: false, error: `Pre-update snapshot failed: ${snapResult.error}` };
    }

    // Transition to updating
    registry.updateTool(toolId, { installation_status: 'updating' });

    const currentStaging = path.join(stagingDir, opId);
    fs.mkdirSync(currentStaging, { recursive: true });

    try {
      const adapter = getAdapterForTool(tool);

      // A. Install new version in staging
      const candidateUpdate = { ...tool, version: newVersion };
      const installRes = await adapter.install(currentStaging, candidateUpdate, { files });
      if (!installRes.ok) throw new Error(installRes.error || 'Staging install failed');

      // B. Verify in staging
      const verifyRes = await adapter.verify(currentStaging, candidateUpdate);
      if (!verifyRes.ok) throw new Error(verifyRes.error || 'Staging verification failed');

      // C. Activate new version into managed/<tool-id>/<newVersion> (independent directory)
      const targetVersionDir = path.join(managedDir, toolId, newVersion);
      copyDirectorySync(currentStaging, targetVersionDir);

      try {
        fs.rmSync(currentStaging, { recursive: true, force: true });
      } catch {
        /* ignore */
      }

      // D. Final Health Check
      const updatedRecord = {
        ...candidateUpdate,
        installation_path: targetVersionDir,
        installed_version: newVersion,
        installation_status: 'healthy',
        health_status: 'healthy',
      };
      const healthCheck = await performToolHealthCheck(updatedRecord);
      if (!healthCheck.healthy) throw new Error(`Health check failed on updated version: ${healthCheck.message}`);

      // E. Update registry
      registry.updateTool(toolId, {
        version: newVersion,
        installed_version: newVersion,
        installation_path: targetVersionDir,
        installation_status: 'healthy',
        health_status: 'healthy',
        latest_available_version: newVersion,
      });

      logAudit({
        operation_id: opId,
        tool_id: toolId,
        operation_type: 'update_success',
        from_version: tool.version,
        to_version: newVersion,
      });

      activeOperations.delete(toolId);
      return { ok: true, tool_id: toolId, version: newVersion, updated: true };
    } catch (err) {
      // Automatic Rollback to previous working installation
      try {
        fs.rmSync(currentStaging, { recursive: true, force: true });
      } catch {
        /* ignore */
      }

      registry.updateTool(toolId, {
        installation_status: 'healthy', // Restore previous healthy status
        health_status: 'healthy',
        verification_evidence: [
          ...(tool.verification_evidence || []),
          {
            at: new Date().toISOString(),
            status: 'update_aborted',
            evidence: `Update to ${newVersion} failed (${err.message}). Restored previous healthy version ${tool.version}.`,
          },
        ],
      });

      logAudit({
        operation_id: opId,
        tool_id: toolId,
        operation_type: 'update_failed_rolled_back',
        error: err.message,
        preserved_version: tool.version,
      });

      activeOperations.delete(toolId);
      return {
        ok: false,
        error: `Update failed: ${err.message}. Previous version ${tool.version} was preserved safely.`,
      };
    }
  }

  /**
   * Rolls back a tool to a previous snapshot.
   */
  async function rollbackTool(toolId, snapshotId = null) {
    const toolSnapshotsDir = path.join(snapshotsDir, toolId);
    if (!fs.existsSync(toolSnapshotsDir)) {
      return { ok: false, error: `No snapshots available for tool '${toolId}'` };
    }

    const availableSnaps = fs.readdirSync(toolSnapshotsDir);
    if (availableSnaps.length === 0) {
      return { ok: false, error: `No snapshot directories found for tool '${toolId}'` };
    }

    const targetSnapDirName = snapshotId
      ? availableSnaps.find((s) => s.includes(snapshotId))
      : availableSnaps[availableSnaps.length - 1]; // most recent

    if (!targetSnapDirName) {
      return { ok: false, error: `Snapshot '${snapshotId}' not found` };
    }

    const sourceSnapDir = path.join(toolSnapshotsDir, targetSnapDirName);
    const snapMetaFile = path.join(sourceSnapDir, 'registry-snapshot.json');
    if (!fs.existsSync(snapMetaFile)) {
      return { ok: false, error: 'Snapshot is corrupt: missing registry-snapshot.json' };
    }

    const previousRecord = JSON.parse(fs.readFileSync(snapMetaFile, 'utf8'));
    const previousVersion = previousRecord.version || '1.0.0';

    // Atomic restoration into managed directory
    const targetVersionDir = path.join(managedDir, toolId, previousVersion);
    copyDirectorySync(sourceSnapDir, targetVersionDir);

    // Verify restored installation
    const restoredRecord = {
      ...previousRecord,
      installation_path: targetVersionDir,
    };
    const health = await performToolHealthCheck(restoredRecord);
    if (!health.healthy) {
      return {
        ok: false,
        error: `Restored files failed health verification: ${health.message}`,
      };
    }

    // Restore registry record
    registry.updateTool(toolId, {
      ...previousRecord,
      installation_path: targetVersionDir,
      installation_status: 'healthy',
      health_status: 'healthy',
      verification_evidence: [
        ...(previousRecord.verification_evidence || []),
        {
          at: new Date().toISOString(),
          status: 'rolled_back',
          evidence: `Successfully rolled back to snapshot ${targetSnapDirName}.`,
        },
      ],
    });

    logAudit({
      operation_id: `rollback-${Date.now()}`,
      tool_id: toolId,
      operation_type: 'rollback_success',
      restored_snapshot: targetSnapDirName,
      restored_version: previousVersion,
    });

    return { ok: true, tool_id: toolId, version: previousVersion, rolled_back: true };
  }

  /**
   * Safely uninstalls a tool with path traversal boundary guards.
   */
  async function uninstallTool(toolId, { userConfirmation = false } = {}) {
    if (!userConfirmation) {
      return { ok: false, error: 'Uninstallation requires userConfirmation=true' };
    }

    const tool = registry.getTool(toolId);
    if (!tool) return { ok: false, error: 'Tool not found' };

    const toolManagedDir = path.join(managedDir, toolId);

    // Boundary check: ensure path is strictly inside managedDir
    if (!isSafePath(managedDir, toolManagedDir)) {
      return { ok: false, error: 'Security violation: tool path is outside managed storage boundary' };
    }

    registry.updateTool(toolId, { installation_status: 'uninstalling' });

    try {
      if (fs.existsSync(toolManagedDir)) {
        fs.rmSync(toolManagedDir, { recursive: true, force: true });
      }

      registry.updateTool(toolId, {
        installation_status: 'uninstalled',
        health_status: 'unknown',
        enabled_status: false,
        installation_path: '',
      });

      logAudit({
        operation_id: `uninstall-${Date.now()}`,
        tool_id: toolId,
        operation_type: 'uninstall_success',
        removed_path: toolManagedDir,
      });

      return { ok: true, tool_id: toolId, uninstalled: true };
    } catch (err) {
      registry.updateTool(toolId, {
        installation_status: 'failed',
        health_status: 'failed',
      });
      return { ok: false, error: `Uninstall failed: ${err.message}` };
    }
  }

  return {
    managedDir,
    stagingDir,
    snapshotsDir,
    prepareInstallationPlan,
    installTool,
    updateTool,
    rollbackTool,
    uninstallTool,
    toggleToolEnabled,
    pinVersion,
    unpinVersion,
    createSnapshot,
    recoverInterruptedOperations,
    getAuditLogs,
  };
}
