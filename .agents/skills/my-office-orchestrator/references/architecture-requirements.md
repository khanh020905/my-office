# My Office architecture requirements

Verified during Phase 0/1 (2026-11-10); re-check source before relying on these details:

- `hooks/hooks.json` posts Claude hook JSON to `/event`; `hooks/send.mjs` is the Node transport used by supported installation paths.
- `server/index.mjs` owns `/event`, `onHook`, the in-memory session map, event feed, `broadcast`, and `/stream` SSE.
- `src/shared/agent-events.js` normalizes office events and maintains a bounded agent snapshot.
- `src/office/demo/demo.js` receives SSE through `EventSource` and applies messages; `src/office/net/live.js` upserts sessions and workers.
- `src/office/people/workers.js` owns session workers and subagent characters.
- `server/codex-accounts.mjs` manages Codex accounts/usage/switching. Account support is not Codex task/activity tracking.
- Codex CLI 0.167.0 `codex exec --json` produced thread/turn/message events in a prompt-only read-only run. Shell use was policy-blocked, so tool/file events remain unverified.
- `codex app-server` is labelled experimental. Generated protocol schemas describe richer thread, turn, item, diff and command events, but GUI attachment/streaming support is not verified.
- Local Ponytail skills/commands are assistant-facing workflows. Do not treat them as a service or API without independent evidence.

No production adapter is verified by these notes. Revalidate before implementation.
