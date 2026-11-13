#!/usr/bin/env node
/**
 * Liveness and Health Verifier for My Office Operational Trial (Phase 5.1).
 * 
 * Verifies:
 * 1. Process liveness (PID active in OS).
 * 2. HTTP status endpoint responsiveness.
 * 3. Heartbeat freshness (rejects stale files > 180s).
 * 4. Preserved trial clock and trialStartAt.
 * 5. Supervision invariants (autonomyLevel must be 'supervised').
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), '..');
const STATUS_PATH = path.join(ROOT_DIR, 'reports', 'operational-trial', 'monitor-status.json');

async function probeHttp(port = 4310, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/trial-monitor/status`, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ ok: res.statusCode === 200, status: res.statusCode, data: json });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, error: 'JSON_PARSE_ERROR' });
        }
      });
    });
    req.on('error', (err) => resolve({ ok: false, error: err.code || err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'TIMEOUT' });
    });
  });
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

async function runCheck() {
  const now = Date.now();
  console.log(`[VERIFY] Checking My Office Trial Monitor liveness at ${new Date(now).toISOString()}...`);

  // 1. Read persistent files
  if (!fs.existsSync(STATUS_PATH)) {
    console.error(`[CRITICAL] Status file missing: ${STATUS_PATH}`);
    process.exit(1);
  }

  let statusData;
  try {
    statusData = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
  } catch (e) {
    console.error(`[CRITICAL] Corrupt status file: ${e.message}`);
    process.exit(1);
  }

  const { heartbeat, processId, monitorStatus, trialStartAt } = statusData;
  const heartbeatAgeMs = now - (heartbeat || 0);
  const heartbeatAgeSec = Math.round(heartbeatAgeMs / 1000);

  console.log(`[STATUS] Recorded Status: "${monitorStatus}" | Process PID: ${processId} | Heartbeat Age: ${heartbeatAgeSec}s ago`);

  // 2. Heartbeat Staleness Check
  if (heartbeatAgeMs > 180000) {
    console.error(`[ERROR] Heartbeat is STALE (${heartbeatAgeSec}s > 180s threshold).`);
    console.error(`[ERROR] The server is STOPPED or UNRESPONSIVE. Do not claim healthy monitoring.`);
    process.exit(1);
  }

  // 3. HTTP Live Probe
  const probe = await probeHttp();
  if (!probe.ok) {
    console.error(`[ERROR] HTTP probe failed: ${probe.error || probe.status}`);
    process.exit(1);
  }

  const liveStatus = probe.data?.status || {};
  const activePid = processId || liveStatus.latestSnapshot?.systemHealth?.nodeProcess?.pid;

  // 4. Process Check
  const pidAlive = isProcessAlive(activePid);
  if (!pidAlive) {
    console.error(`[ERROR] Process PID ${activePid} is NOT running.`);
    process.exit(1);
  }

  // 5. Invariant & Safety Checks
  const autonomy = liveStatus.latestSnapshot?.safety?.autonomyLevel;
  if (autonomy !== 'supervised') {
    console.error(`[CRITICAL] Autonomy level is "${autonomy}" - MUST BE "supervised"!`);
    process.exit(1);
  }

  if (!trialStartAt || !trialStartAt.epoch) {
    console.error(`[CRITICAL] Missing original trialStartAt timestamp!`);
    process.exit(1);
  }

  console.log(`[PASS] Server is actively monitoring:`);
  console.log(`  - Observation Status: ${liveStatus.observationStatus}`);
  console.log(`  - trialStartAt: ${trialStartAt.asiaHoChiMinh} (${trialStartAt.utc})`);
  console.log(`  - Telemetry Coverage: ${liveStatus.telemetryCoverage}`);
  console.log(`  - Post-Start Snapshots: ${liveStatus.postStartSnapshotsCount}`);
  console.log(`  - Autonomy Mode: ${autonomy} (ENFORCED)`);
  console.log(`  - Read-Only Mode: ${liveStatus.isReadOnly ? 'ACTIVE' : 'INACTIVE'}`);
  process.exit(0);
}

runCheck().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
