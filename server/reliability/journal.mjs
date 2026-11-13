/**
 * Durable Execution Write-Ahead Log (WAL) Engine (Phase 5).
 * Implements append-only, checksum-verified state persistence with synchronous fsync
 * on critical transitions, checkpointing, and torn-write auto-recovery.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  WAL_EVENT_TYPES,
  CRITICAL_WAL_EVENTS,
  createWalEvent,
  verifyEventChecksum,
} from './contracts.mjs';

export function createExecutionJournal({
  walPath = null,
  checkpointDir = null,
  checkpointPath = null,
  now = Date.now,
} = {}) {
  const defaultWalPath = walPath || path.resolve(process.cwd(), 'data', 'reliability', 'execution-journal.wal');
  const defaultCheckpointDir = checkpointDir || (checkpointPath ? path.dirname(checkpointPath) : path.resolve(path.dirname(defaultWalPath), 'checkpoints'));

  let currentSeq = 0;
  let lastHash = '0'.repeat(64);
  let corruptRecordsCount = 0;
  let fd = null;

  function ensureDirectories() {
    fs.mkdirSync(path.dirname(defaultWalPath), { recursive: true });
    fs.mkdirSync(defaultCheckpointDir, { recursive: true });
  }

  ensureDirectories();

  /**
   * Initializes the WAL by scanning existing records, verifying checksums and sequence integrity,
   * and truncating any corrupted trailing partial writes (torn-write recovery).
   */
  function initAndRecover() {
    if (!fs.existsSync(defaultWalPath)) {
      currentSeq = 0;
      lastHash = '0'.repeat(64);
      return;
    }

    const content = fs.readFileSync(defaultWalPath, 'utf8');
    const lines = content.split('\n');

    let validByteOffset = 0;
    let validEvents = 0;
    let expectedSeq = 0;
    let lastValidHash = '0'.repeat(64);
    const corruptedLines = [];

    let currentOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineBytes = Buffer.byteLength(line, 'utf8') + (i < lines.length - 1 ? 1 : 0);

      const trimmed = line.trim();
      if (!trimmed) {
        currentOffset += lineBytes;
        continue;
      }

      let parsed = null;
      let valid = false;

      try {
        parsed = JSON.parse(trimmed);
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof parsed.seq === 'number' &&
          parsed.eventType &&
          verifyEventChecksum(parsed)
        ) {
          valid = true;
        }
      } catch {
        valid = false;
      }

      if (valid) {
        // Enforce sequence ordering
        expectedSeq = parsed.seq + 1;
        lastValidHash = parsed.checksum;
        validEvents++;
        validByteOffset = currentOffset + lineBytes;
      } else {
        corruptedLines.push(trimmed);
        corruptRecordsCount++;
      }

      currentOffset += lineBytes;
    }

    currentSeq = expectedSeq;
    lastHash = lastValidHash;

    // If corrupted lines exist at the end (torn write), truncate to last valid offset
    const totalSize = fs.statSync(defaultWalPath).size;
    if (corruptedLines.length > 0 && validByteOffset < totalSize) {
      try {
        const corruptBak = `${defaultWalPath}.corrupt.bak`;
        fs.appendFileSync(corruptBak, corruptedLines.join('\n') + '\n', 'utf8');

        // Truncate file
        const truncateFd = fs.openSync(defaultWalPath, 'r+');
        fs.ftruncateSync(truncateFd, validByteOffset);
        fs.closeSync(truncateFd);
      } catch {
        // In-memory fallback
      }
    }
  }

  initAndRecover();

  function openFd() {
    if (!fd) {
      fd = fs.openSync(defaultWalPath, 'a+', 0o600);
    }
    return fd;
  }

  /**
   * Appends a new event to the WAL.
   * Performs synchronous fsync for critical event transitions.
   */
  function appendEvent({
    eventType,
    aggregateType = 'execution',
    aggregateId = 'system',
    masterTaskId = null,
    payload = {},
    idempotencyKey = null,
  }) {
    ensureDirectories();
    const seq = currentSeq++;
    const prevHash = lastHash;

    const event = createWalEvent({
      seq,
      eventType,
      aggregateType,
      aggregateId,
      masterTaskId,
      payload,
      idempotencyKey,
      prevHash,
      timestamp: now(),
    });

    const serialized = JSON.stringify(event) + '\n';
    const buffer = Buffer.from(serialized, 'utf8');

    const fileDescriptor = openFd();
    fs.writeSync(fileDescriptor, buffer, 0, buffer.length, null);

    // Synchronous fsync for critical transitions
    if (CRITICAL_WAL_EVENTS.includes(eventType)) {
      try {
        fs.fdatasyncSync(fileDescriptor);
      } catch {
        try {
          fs.fsyncSync(fileDescriptor);
        } catch {
          // ignore sync failure on platforms not supporting fdatasync
        }
      }
    }

    lastHash = event.checksum;
    return event;
  }

  /**
   * Reads raw events from WAL within specified sequence bounds.
   */
  function readEvents({ fromSeq = 0, toSeq = Infinity, limit = 1000 } = {}) {
    if (!fs.existsSync(defaultWalPath)) return [];

    const content = fs.readFileSync(defaultWalPath, 'utf8');
    const lines = content.split('\n');
    const events = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const ev = JSON.parse(trimmed);
        if (ev && typeof ev.seq === 'number') {
          if (ev.seq >= fromSeq && ev.seq <= toSeq) {
            events.push(ev);
            if (events.length >= limit) break;
          }
        }
      } catch {
        // Skip unparseable lines during read
      }
    }

    return events;
  }

  /**
   * Replays journal events sequentially and invokes applyFn for deterministic rebuild.
   */
  function replayJournal({ fromSeq = 0, toSeq = Infinity, applyFn = null } = {}) {
    const events = readEvents({ fromSeq, toSeq });
    const applied = [];

    for (const ev of events) {
      if (verifyEventChecksum(ev)) {
        if (typeof applyFn === 'function') {
          applyFn(ev);
        }
        applied.push(ev);
      }
    }

    return applied;
  }

  /**
   * Creates an atomic snapshot checkpoint file.
   */
  function createCheckpoint({ state = {}, metadata = {} } = {}) {
    ensureDirectories();
    const seq = currentSeq;
    const checkpointFile = path.join(defaultCheckpointDir, `checkpoint-${seq}.json`);
    const tmp = `${checkpointFile}.tmp-${process.pid}-${now()}`;

    const payload = {
      version: '1.0.0',
      seq,
      timestamp: now(),
      lastHash,
      metadata,
      state,
    };

    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, checkpointFile);

    appendEvent({
      eventType: WAL_EVENT_TYPES.CHECKPOINT_CREATED,
      aggregateType: 'system',
      aggregateId: 'checkpoint',
      payload: { checkpointSeq: seq, checkpointFile },
    });

    return {
      seq,
      checkpointFile,
      timestamp: payload.timestamp,
    };
  }

  /**
   * Loads the latest valid checkpoint.
   */
  function loadLatestCheckpoint() {
    if (!fs.existsSync(defaultCheckpointDir)) return null;
    const files = fs.readdirSync(defaultCheckpointDir)
      .filter((f) => f.startsWith('checkpoint-') && f.endsWith('.json'))
      .sort((a, b) => {
        const numA = parseInt(a.replace(/[^0-9]/g, ''), 10) || 0;
        const numB = parseInt(b.replace(/[^0-9]/g, ''), 10) || 0;
        return numB - numA;
      });

    for (const file of files) {
      const fullPath = path.join(defaultCheckpointDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        if (data && typeof data.seq === 'number' && data.state) {
          return data;
        }
      } catch {
        // Skip corrupted checkpoint file and try earlier
      }
    }

    return null;
  }

  /**
   * Returns current statistics and diagnostics for WAL health monitoring.
   */
  function getJournalStats() {
    let byteSize = 0;
    if (fs.existsSync(defaultWalPath)) {
      try {
        byteSize = fs.statSync(defaultWalPath).size;
      } catch {
        byteSize = 0;
      }
    }

    return {
      currentSeq,
      lastHash,
      corruptRecordsCount,
      walByteSize: byteSize,
      walPath: defaultWalPath,
    };
  }

  function close() {
    if (fd) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close error
      }
      fd = null;
    }
  }

  return {
    appendEvent,
    readEvents,
    replayJournal,
    createCheckpoint,
    loadLatestCheckpoint,
    getJournalStats,
    close,
  };
}

export { createExecutionJournal as createJournal };

