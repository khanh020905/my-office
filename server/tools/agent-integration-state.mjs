import fs from 'node:fs';
import path from 'node:path';

export const AGENT_EVIDENCE_TTL_MS = 24 * 60 * 60 * 1000;

export function createAgentIntegrationState({ storePath, now = Date.now, staleAfterMs = AGENT_EVIDENCE_TTL_MS } = {}) {
  const records = new Map();
  if (storePath) {
    try {
      const saved = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      for (const row of Array.isArray(saved.agents) ? saved.agents : []) if (row?.agentId) records.set(row.agentId, row);
    } catch { /* first run or legacy/invalid state: keep existing registry data untouched */ }
  }
  function persist() {
    if (!storePath) return;
    try {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      const tmp = `${storePath}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify({ schemaVersion: 1, agents: [...records.values()] }), { mode: 0o600 });
      fs.renameSync(tmp, storePath);
    } catch { /* evidence remains available in memory */ }
  }
  function observe(agentId, provider, source, sessionId, at = now(), scope = null) {
    if (typeof agentId !== 'string' || typeof sessionId !== 'string' || !sessionId) return null;
    const old = records.get(agentId) || { agentId, history: [] };
    const duplicateKey = `${provider}:${sessionId}`;
    if (old.lastEvidenceKey === duplicateKey) {
      if (old.verificationScope === scope && at - old.lastObservedAt < 60_000) return old;
      const refreshed = { ...old, lastObservedAt: at, verificationScope: scope || old.verificationScope || null };
      records.set(agentId, refreshed); persist(); return refreshed;
    }
    const row = { ...old, provider, connected: true, observed: true, evidenceSource: source,
      lastObservedAt: at, lastVerifiedAt: old.lastVerifiedAt || null,
      verificationScope: scope || old.verificationScope || null, failureReason: null,
      history: [...(old.history || []), { provider, source, sessionId, at }].slice(-100),
      lastEvidenceKey: duplicateKey };
    records.set(agentId, row); persist(); return row;
  }
  function get(agentId, detected = {}) {
    const saved = records.get(agentId) || {};
    const stale = Boolean(saved.lastObservedAt && now() - saved.lastObservedAt > staleAfterMs);
    const installed = Object.hasOwn(detected, 'installed') ? detected.installed : Boolean(detected.detected);
    const configured = Boolean(detected.configured ?? detected.statuses?.includes('CONFIGURED'));
    const connected = Boolean(saved.connected && !stale);
    const functionallyVerified = Boolean(saved.functionallyVerified);
    const status = functionallyVerified ? 'FUNCTIONALLY_VERIFIED' : connected ? 'CONNECTED' : configured ? 'CONFIGURED' : installed ? 'DETECTED' : 'SUPPORTED';
    return { ...detected, agent_id: agentId, supported: true, installed, configured, status,
      connected, observed: Boolean(saved.observed),
      provider: saved.provider || null, projectScope: saved.verificationScope || null,
      functionallyVerified, evidenceSource: saved.evidenceSource || null,
      lastObservedAt: saved.lastObservedAt || null, lastVerifiedAt: saved.lastVerifiedAt || null,
      verificationScope: saved.verificationScope || null, failureReason: saved.failureReason || detected.detection_error || null,
      evidenceStale: stale, evidenceHistory: saved.history || [] };
  }
  return { observe, get, list: () => [...records.keys()].map((id) => get(id)), staleAfterMs };
}
