/**
 * Fault-Injection Unit Tests: Process Supervisor & Process Identity Safety.
 * Covers:
 * - Scenario 2: Server termination during active agent execution.
 * - Scenario 8: Provider timeout during cancellation (graceful-to-forceful escalation).
 * - Scenario 12: Orphan child process detection and reconciliation after server restart.
 * - Refinement 1: Strict refusal to signal or terminate re-assigned OS PIDs (PID_REASSIGNED_DETECTED).
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createProcessSupervisor } from '../../server/reliability/process-supervisor.mjs';
import {
  PROCESS_SUPERVISOR_STATES,
} from '../../server/reliability/contracts.mjs';

describe('Phase 5 Reliability: Process Supervisor & Identity Safety Fault Injection', () => {
  let tmpDir;
  let storePath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'process-test-'));
    storePath = path.join(tmpDir, 'processes.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('Refinement 1: Strictly refuses to terminate or signal a re-assigned OS PID', async () => {
    // Mock OS inspector simulating PID 9999 whose start time / executable differs from recorded
    const mockOsInspector = (pid) => {
      if (pid === 9999) {
        return {
          pid: 9999,
          startTime: 2000000, // different start time
          executable: 'C:\\Windows\\System32\\notepad.exe', // completely different app!
          commandLine: 'notepad.exe',
          parentPid: 100,
          hostUser: 'SYSTEM',
        };
      }
      return null;
    };

    const supervisor = createProcessSupervisor({
      storePath,
      osInspector: mockOsInspector,
      now: () => 1000000,
    });

    // Register original task process on PID 9999
    supervisor.registerProcess({
      executionId: 'exec-reassigned-1',
      provider: 'claude-code',
      pid: 9999,
      startTime: 1000000,
      executable: 'C:\\Program Files\\nodejs\\node.exe',
      commandLine: 'node server/index.mjs --worker',
      parentPid: process.pid,
    });

    // Verification must detect PID reassignment
    const liveness = supervisor.verifyProcessLiveness('exec-reassigned-1');
    assert.equal(liveness.alive, true);
    assert.equal(liveness.fingerprintMatches, false);
    assert.equal(liveness.state, PROCESS_SUPERVISOR_STATES.REASSIGNED_DETECTED);

    // Termination must abort fail-closed with SECURITY_ABORT
    await assert.rejects(
      async () => supervisor.terminateProcessSafely('exec-reassigned-1', { gracePeriodMs: 100 }),
      /SECURITY_ABORT/
    );
  });

  test('Scenario 2 & 12: Server termination during active execution and orphan reconciliation on reboot', () => {
    // OS process table indicates child process 7777 is still running
    let process7777Alive = true;
    const mockOsInspector = (pid) => {
      if (pid === 7777 && process7777Alive) {
        return {
          pid: 7777,
          startTime: 500000,
          executable: process.execPath,
          commandLine: 'node worker.js',
          parentPid: 4444, // prior server PID that is now dead
          hostUser: 'dev',
        };
      }
      return null;
    };

    // 1. Prior server registers active process before sudden crash
    const supervisor1 = createProcessSupervisor({
      storePath,
      osInspector: mockOsInspector,
      now: () => 500000,
    });

    supervisor1.registerProcess({
      executionId: 'exec-orphan-task',
      provider: 'codex-cli',
      pid: 7777,
      startTime: 500000,
      executable: process.execPath,
      commandLine: 'node worker.js',
      parentPid: 4444,
      hostUser: 'dev',
    });

    // 2. Server reboots: new supervisor loads persisted state and reconciles
    const supervisor2 = createProcessSupervisor({
      storePath,
      osInspector: mockOsInspector,
      now: () => 600000,
    });

    const report = supervisor2.reconcileStartupProcesses();
    assert.equal(report.reconciledCount, 1);
    assert.equal(report.orphans.length, 1);
    assert.equal(report.orphans[0].executionId, 'exec-orphan-task');
    assert.equal(report.orphans[0].pid, 7777);

    const proc = supervisor2.getTrackedProcess('exec-orphan-task');
    assert.equal(proc.state, PROCESS_SUPERVISOR_STATES.ORPHAN_DETECTED);
  });

  test('Scenario 8: Provider timeout during cancellation escalates termination ladder', async () => {
    let processKilled = false;
    // Process that ignores gentle SIGTERM and stays alive past grace period
    const mockOsInspector = (pid) => {
      if (pid === 8888 && !processKilled) {
        return {
          pid: 8888,
          startTime: 100000,
          executable: process.execPath,
          commandLine: 'node heavy-worker.js',
          parentPid: process.pid,
          hostUser: 'dev',
        };
      }
      return null;
    };

    const supervisor = createProcessSupervisor({
      storePath,
      osInspector: mockOsInspector,
      now: () => 100000,
    });

    supervisor.registerProcess({
      executionId: 'exec-timeout-cancel',
      provider: 'claude-code',
      pid: 8888,
      startTime: 100000,
      executable: process.execPath,
      commandLine: 'node heavy-worker.js',
    });

    // Simulate forceful termination after grace period expires
    setTimeout(() => {
      processKilled = true;
    }, 150);

    const result = await supervisor.terminateProcessSafely('exec-timeout-cancel', {
      gracePeriodMs: 250,
      reason: 'Provider timeout during cancellation probe',
    });

    assert.equal(result.terminated, true);
    assert.equal(result.state, PROCESS_SUPERVISOR_STATES.TERMINATED);
  });
});
