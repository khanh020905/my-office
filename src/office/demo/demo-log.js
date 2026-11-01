// The demo's conversation logs (a session's, shown in its drawer, and each subagent's steps), kept to what the drawer
// can show. The demo is left running on a screen for days; every line used to stay for ever, and every subagent that
// ever worked kept a log of its own.
export const LOG_MAX = 120, SUB_LOGS = 30;   // (the drawer shows a log's last 120 lines; the latest 30 subagents keep theirs)
const isSub = (key) => key.startsWith('demo-sub-');

/** Adds `line` (or nothing, if null) to the log of `key` (a session id, or a subagent's 'demo-sub-…') in `logs`, a Map,
 *  and returns that log. */
export function logLine(logs, key, line) {
  let log = logs.get(key);
  if (!log) {
    logs.set(key, (log = []));
    if (isSub(key)) { let n = 0; for (const k of [...logs.keys()].reverse()) if (isSub(k) && ++n > SUB_LOGS) logs.delete(k); }
  }
  if (line) { log.push(line); if (log.length > LOG_MAX + 30) log.splice(0, log.length - LOG_MAX); }   // (trimmed now and then, not on every line)
  return log;
}
