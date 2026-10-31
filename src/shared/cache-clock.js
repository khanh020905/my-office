// The prompt cache's clock for a session ("Đồng hồ bộ nhớ đệm"): warm or gone cold, how long it has left, and how much
// the next message reads back once it is cold. Claude Code reports it in the status line's `prompt_cache` (v2.1.251+:
// warm, ttl, expires_at, recache_tokens_if_cold; code.claude.com/docs/en/statusline), and on a resumed or forked session
// in SessionStart (prompt_cache_likely_expired, context_tokens, seconds_since_last_response; /hooks). Without either
// (an older Claude Code, a run with no status line) it is guessed: the last response plus the documented lifetime
// (/prompt-caching: an hour for the main conversation on a subscription, five minutes on an API key).
// Shared by the server (server/index.mjs keeps one per session) and the page (the cups, the drawer, the chat).

export const TTL_MS = { '5m': 5 * 60e3, '1h': 3600e3 };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ttlOf = (t) => (t === '1h' ? '1h' : '5m');

/** The status line's prompt_cache (null before the first response, or with caching off) -> a cache, or null.
    ctx: the context's size in tokens, for when it doesn't say what a cold start re-reads (right after a compaction). */
export function cacheFromStatus(pc, ctx = null) {
  if (!pc || typeof pc !== 'object' || pc.caching_observed === false) return null;
  const at = num(pc.expires_at);
  return { until: pc.warm && at ? at * 1000 : 0, ttl: ttlOf(pc.ttl), tokens: num(pc.recache_tokens_if_cold) ?? num(ctx) ?? 0, guessed: false };
}
/** SessionStart of a resumed or forked session (the four fields come only when its transcript has a response) -> a
    cache, or null. ttl: the lifetime to assume when it is still warm (SessionStart doesn't say which). */
export function cacheFromResume(p, ttl, now) {
  if (!p || typeof p.prompt_cache_likely_expired !== 'boolean') return null;
  const ago = num(p.seconds_since_last_response) ?? 0, life = TTL_MS[ttlOf(ttl)];
  const until = p.prompt_cache_likely_expired ? 0 : Math.max(0, now - ago * 1000 + life);
  return { until, ttl: ttlOf(ttl), tokens: num(p.context_tokens) ?? 0, usd: num(p.estimated_cache_write_usd), guessed: !p.prompt_cache_likely_expired };
}
/** No word from Claude Code: warm for `ttl` after its last response (lastAt), then cold, re-reading its context. */
export const cacheGuess = (lastAt, ctx, ttl) => ({ until: (lastAt || 0) + TTL_MS[ttlOf(ttl)], ttl: ttlOf(ttl), tokens: num(ctx) ?? 0, guessed: true });

/** cache (as above, or null) at `now` -> { state: 'warm' | 'cold' | 'none', left (ms), warmth (1 just after the
    response, down to 0 when cold), tokens (what continuing re-reads once cold), guessed }. */
export function cacheClock(cache, now) {
  if (!cache) return { state: 'none', left: 0, warmth: 0, tokens: 0, guessed: false };
  const left = Math.max(0, (cache.until || 0) - now);
  return { state: left > 0 ? 'warm' : 'cold', left, warmth: left > 0 ? Math.min(1, left / TTL_MS[ttlOf(cache.ttl)]) : 0, tokens: cache.tokens || 0, guessed: !!cache.guessed };
}
