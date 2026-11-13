/**
 * Process Supervisor with Process Identity Safety (Phase 5).
 * Enforces Refinement 1: Never terminates or signals a re-assigned OS PID.
 * Tracks full ProcessFingerprints, validates OS process tables before signaling,
 * and handles graceful-to-forceful termination ladders with orphan detection.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  PROCESS_SUPERVISOR_STATES,
  validateProcessFingerprint,
  fingerprintsMatch,
  createProcessFingerprint,
} from './contracts.mjs';

export function createProcessSupervisor({
  storePath = null,
  osInspector = null, // Mockable/injectable for fault-injection tests
  journal = null,
  now = Date.now,
} = {}) {
  const defaultStorePath = storePath || path.resolve(process.cwd(), 'data', 'reliability', 'processes.json');

  // Tracked processes: executionId -> { executionId, provider, fingerprint, state, registeredAt, terminatedAt, terminationReason }
  const processes = new Map();

  function load() {
    if (!fs.existsSync(defaultStorePath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(defaultStorePath, 'utf8'));
      if (Array.isArray(data.processes)) {
        for (const p of data.processes) {
          processes.set(p.executionId, p);
        }
      }
    } catch {
      // In-memory fallback
    }
  }

  function persist() {
    try {
      fs.mkdirSync(path.dirname(defaultStorePath), { recursive: true });
      const tmp = `${defaultStorePath}.tmp-${process.pid}-${now()}`;
      const payload = {
        version: '1.0.0',
        savedAt: now(),
        processes: Array.from(processes.values()).slice(-200),
      };
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, defaultStorePath);
    } catch {
      // In-memory fallback
    }
  }

  load();

  /**
   * Queries actual OS process state at PID to obtain live fingerprint.
   * Uses osInspector if provided (ideal for unit testing), otherwise system commands.
   */
  function inspectOsProcess(pid) {
    if (typeof osInspector === 'function') {
      return osInspector(pid);
    }

    if (!pid || pid <= 0) return null;

    try {
      if (process.platform === 'win32') {
        // Windows: use PowerShell CIM query for accurate Process info
        const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"ProcessId = ${pid}\\" | Select-Object ProcessId, CommandLine, ExecutablePath, ParentProcessId, CreationDate | ConvertTo-Json -Compress"`;
        const output = execSync(cmd, { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        if (!output) return null;

        const info = JSON.parse(output);
        let startTime = now();
        if (info.CreationDate) {
          // Parse WMI date string or timestamp
          const match = info.CreationDate.match(/\/Date\((\d+)\)\//);
          if (match) {
            startTime = parseInt(match[1], 10);
          } else {
            const parsedDate = Date.parse(info.CreationDate);
            if (!isNaN(parsedDate)) startTime = parsedDate;
          }
        }

        return {
          pid: Number(info.ProcessId),
          startTime,
          executable: info.ExecutablePath || 'unknown.exe',
          commandLine: info.CommandLine || '',
          parentPid: Number(info.ParentProcessId) || 0,
          hostUser: process.env.USERNAME || 'unknown',
        };
      } else {
        // POSIX
        const output = execSync(`ps -p ${pid} -o pid,lstart,command`, { encoding: 'utf8', timeout: 3000 }).trim();
        const lines = output.split('\n');
        if (lines.length < 2) return null;

        return {
          pid,
          startTime: now(),
          executable: lines[1].split(/\s+/)[2] || 'unknown',
          commandLine: lines[1],
          parentPid: 0,
          hostUser: process.env.USER || 'unknown',
        };
      }
    } catch {
      // Process does not exist or access denied
      return null;
    }
  }

  /**
   * Registers an active agent execution process with full fingerprint.
   */
  function registerProcess({
    executionId,
    provider = 'unknown',
    pid,
    startTime = null,
    executable = null,
    commandLine = '',
    parentPid = process.pid,
    hostUser = null,
    childProcess = null,
  }) {
    if (!executionId) {
      throw new Error('registerProcess requires executionId');
    }

    const resolvedPid = childProcess?.pid || pid;
    if (!resolvedPid || typeof resolvedPid !== 'number') {
      throw new Error(`Invalid PID for process registration: ${resolvedPid}`);
    }

    const fp = createProcessFingerprint({
      pid: resolvedPid,
      startTime: startTime || now(),
      executable: executable || process.execPath,
      commandLine: commandLine || (childProcess?.spawnargs ? childProcess.spawnargs.join(' ') : ''),
      parentPid: parentPid || process.pid,
      hostUser: hostUser || process.env.USERNAME || process.env.USER || 'unknown',
    });

    const record = {
      executionId,
      provider,
      fingerprint: fp,
      state: PROCESS_SUPERVISOR_STATES.RUNNING,
      registeredAt: now(),
      terminatedAt: null,
      terminationReason: null,
    };

    processes.set(executionId, record);
    persist();

    if (journal && typeof journal.appendEvent === 'function') {
      journal.appendEvent({
        eventType: 'PROCESS_REGISTERED',
        aggregateType: 'process',
        aggregateId: executionId,
        payload: { pid: resolvedPid, provider, fingerprint: fp },
      });
    }

    return record;
  }

  /**
   * Verifies if tracked process is still alive and whether fingerprint still matches.
   */
  function verifyProcessLiveness(executionId) {
    const record = processes.get(executionId);
    if (!record) {
      return { found: false, alive: false, reason: 'Execution process not found in supervisor' };
    }

    const actual = inspectOsProcess(record.fingerprint.pid);
    if (!actual) {
      return {
        found: true,
        alive: false,
        fingerprintMatches: false,
        reason: 'Process not found in OS table (exited)',
        state: record.state,
      };
    }

    const matches = fingerprintsMatch(record.fingerprint, actual);
    if (!matches) {
      record.state = PROCESS_SUPERVISOR_STATES.REASSIGNED_DETECTED;
      persist();
      return {
        found: true,
        alive: true,
        fingerprintMatches: false,
        reason: 'PID_REASSIGNED_DETECTED: OS re-assigned PID to a different process.',
        state: record.state,
        recorded: record.fingerprint,
        actual,
      };
    }

    return {
      found: true,
      alive: true,
      fingerprintMatches: true,
      state: record.state,
      actual,
    };
  }

  /**
   * Safely terminates a process, verifying identity before signaling.
   * Strictly prevents sending signals to re-assigned PIDs.
   */
  async function terminateProcessSafely(executionId, {
    gracePeriodMs = 5000,
    reason = 'Operator requested termination',
    signal = 'SIGTERM',
  } = {}) {
    const record = processes.get(executionId);
    if (!record) {
      return { terminated: false, error: `Process ${executionId} not tracked` };
    }

    const pid = record.fingerprint.pid;
    const liveness = verifyProcessLiveness(executionId);

    // If not alive, already gone
    if (!liveness.alive) {
      record.state = PROCESS_SUPERVISOR_STATES.TERMINATED;
      record.terminatedAt = now();
      record.terminationReason = reason;
      persist();
      return { terminated: true, alreadyExited: true, state: record.state };
    }

    // IDENTITY SAFETY INVARIANT: If PID was re-assigned, NEVER send signal!
    if (!liveness.fingerprintMatches) {
      record.state = PROCESS_SUPERVISOR_STATES.REASSIGNED_DETECTED;
      persist();
      throw new Error(
        `SECURITY_ABORT: Refusing to terminate PID ${pid}. OS process fingerprint does not match recorded fingerprint (PID was re-assigned).`
      );
    }

    record.state = PROCESS_SUPERVISOR_STATES.TERMINATING;
    persist();

    // 1. Send graceful signal
    try {
      if (typeof process.kill === 'function') {
        try {
          process.kill(pid, signal);
        } catch {
          // preserve flow
        }
      }
    } catch {
      // Process may have already exited
    }

    // 2. Await graceful exit up to gracePeriodMs
    const startTime = now();
    const pollInterval = 100;
    let exited = false;

    while (now() - startTime < gracePeriodMs) {
      const check = inspectOsProcess(pid);
      if (!check || !fingerprintsMatch(record.fingerprint, check)) {
        exited = true;
        break;
      }
      await new Promise((r) => setTimeout(r, pollInterval));
    }

    // 3. Force kill if still running
    if (!exited) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        } else {
          process.kill(pid, 'SIGKILL');
        }
      } catch {
        // Ignored if already exited
      }
    }

    record.state = PROCESS_SUPERVISOR_STATES.TERMINATED;
    record.terminatedAt = now();
    record.terminationReason = reason;
    persist();

    if (journal && typeof journal.appendEvent === 'function') {
      journal.appendEvent({
        eventType: 'PROCESS_TERMINATED',
        aggregateType: 'process',
        aggregateId: executionId,
        payload: { pid, reason, terminatedAt: record.terminatedAt },
      });
    }

    return {
      terminated: true,
      executionId,
      pid,
      state: record.state,
      terminatedAt: record.terminatedAt,
    };
  }

  /**
   * Sweeps tracked processes on system startup to reconcile orphans and re-assigned PIDs.
   */
  function reconcileStartupProcesses() {
    const results = {
      reconciledCount: 0,
      stillRunning: [],
      orphans: [],
      reassigned: [],
      exited: [],
    };

    for (const [executionId, record] of processes.entries()) {
      if (record.state === PROCESS_SUPERVISOR_STATES.RUNNING || record.state === PROCESS_SUPERVISOR_STATES.SPAWNING) {
        const liveness = verifyProcessLiveness(executionId);
        results.reconciledCount++;

        if (!liveness.alive) {
          record.state = PROCESS_SUPERVISOR_STATES.TERMINATED;
          record.terminatedAt = now();
          record.terminationReason = 'Detected exited on server startup';
          results.exited.push(executionId);
        } else if (!liveness.fingerprintMatches) {
          record.state = PROCESS_SUPERVISOR_STATES.REASSIGNED_DETECTED;
          results.reassigned.push({ executionId, pid: record.fingerprint.pid });
        } else {
          // Process is still running from prior server lifecycle (orphan)
          record.state = PROCESS_SUPERVISOR_STATES.ORPHAN_DETECTED;
          results.orphans.push({ executionId, pid: record.fingerprint.pid });
          results.stillRunning.push(executionId);
        }
      }
    }

    persist();
    return results;
  }

  /**
   * Lists tracked processes with optional state filtering.
   */
  function listTrackedProcesses({ state = null, limit = 100 } = {}) {
    let list = Array.from(processes.values());
    if (state) {
      list = list.filter((p) => p.state === state);
    }
    return list.slice(-limit);
  }

  function getTrackedProcess(executionId) {
    return processes.get(executionId) || null;
  }

  return {
    registerProcess,
    verifyProcessLiveness,
    terminateProcessSafely,
    reconcileStartupProcesses,
    listTrackedProcesses,
    getTrackedProcess,
    inspectOsProcess,
  };
}
