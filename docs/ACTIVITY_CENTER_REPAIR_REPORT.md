# Activity Center repair report

Date: 2026-11-12

Scope: repair the Activity Center counters, event feed, provider truthfulness, filters, cost labeling, and connection indicator. No Universal Tool Registry work is included.

## 1. Root causes

- The tiles read the server's daily `stats` object. Before this repair, only Claude Code's `onHook` path updated `read`, `edit`, and `cmd`; Codex App and Codex CLI updated session/feed state without updating those counters. The first tile was `Prompts`, although the requested measure is tasks.
- Codex App lifecycle hooks reached `/codex-app-event`, but tool hooks were shown as generic tool activity and were not counted. The hook transport intentionally omitted tool inputs and outputs.
- Codex CLI runner callbacks exposed thread, turn, message, and process events. The server did not translate CLI tool items into read/edit/command activity. A clean process exit remains outcome-unverified unless result validation provides evidence.
- Antigravity observation watched conversation database file modification times and updated only session status. It did not represent activity in the feed, and the file format is undocumented.
- The connection indicators had only connected/off states; the Activity panel itself said “Live” before the first connection and during disconnects.
- The cost tile sums Claude transcript-derived token estimates for open sessions. It is a list-price equivalent, not provider-billed spend. With no usage data, the old display could look like a measured zero.

## 2. Files changed for this repair

- `server/activity-stats.mjs` — common counters for normalized task starts and successful tool completions.
- `server/index.mjs` — use normalized counters for Claude, Codex App, and accepted Codex CLI run starts; record coarse Antigravity observations; suppress the duplicate Codex App session-end row after a turn-end event; preserve legacy `prompts` consumers.
- `server/codex-app-events.mjs`, `plugins/my-office-codex-hooks/hooks/send.mjs` — map documented Codex tool names to known activity categories and pass the safe `tool_use_id` for deduplication; unknown tools remain uncounted.
- `src/shared/agent-events.js` — represent Antigravity observations as unknown status, not a tool operation.
- `src/office/ui/activity.js`, `src/styles/sessions.css` — Tasks tile, estimated/unavailable cost display, action-aware filters, and a visible Session tag that keeps lifecycle cards separate from work cards.
- `src/office/demo/demo.js`, `src/office/net/live.js`, `src/office/replay/replay.js` — keep demo counters aligned and show connection/replay state truthfully.
- `src/components/office/ActivityPanel.tsx`, `src/components/office/SessionRail.tsx`, `src/styles/sessions.css`, `src/styles/sidebars.css` — visible connection states.
- `src/i18n/locales/en/activity.js`, `src/i18n/locales/vi/activity.js` — task, cost, and connection labels.
- `tests/unit/activity-stats.test.mjs`, `tests/unit/agent-events.test.mjs`, `tests/unit/codex-app-events.test.mjs` — counter rules and provider normalization.

The repository already had extensive uncommitted changes in several shared files. Those changes were retained; this list names files touched by this repair, not all pre-existing dirty files.

## 3. Event pipeline

| Source | Intake and normalization | Persistence and display |
|---|---|---|
| Claude Code | Existing hooks call `hooks/send.mjs` → `POST /event` → `onHook`. `PreToolUse` supplies a safe activity label; successful `PostToolUse` increments the relevant counter; failure hooks do not. | Events enter the bounded feed and shared agent model, save in `data/state.json`, and broadcast over `/stream` or `/api/live`. |
| Codex App | Repo plugin calls its `send.mjs` → loopback-only `POST /codex-app-event` → `normalizeCodexAppHook` allowlist → `onCodexAppHook`. Canonical `Bash`, `apply_patch`, and recognized filesystem MCP names are classified; hosted web tools are not claimed. The [official hook schema](https://developers.openai.com/codex/hooks) supplies `tool_use_id`, which deduplicates completion retries in a bounded 5,000-ID window. | Feed and daily stats use the same server state, feed persistence, and broadcast paths. Tool inputs/outputs remain excluded. |
| Codex CLI | `createCodexRuns` runner callbacks → `codexRunUpdate`; accepted `run.starting` counts one task. Thread/turn/message/process events retain unknown outcomes where success is not verified. | Normalized lifecycle events enter the shared feed/model and SSE path. Run details persist separately in `codex-runs.json`. CLI tool-level counts remain unsupported pending a verified event mapping. |
| Antigravity | `watchAntigravity` checks conversation `.db` filenames and modification times only. | Emits “Antigravity activity observed; detailed events unavailable” at most once per minute per observed conversation. Session state and event feed use existing persistence/broadcast paths. |

The browser receives an initial snapshot from `/stream`; EventSource retries automatically and the server sends a fresh snapshot after reconnect. The tunnel path uses `/api/live?since=…`, which recovers messages from the bounded 400-message backlog or returns a new snapshot. The feed itself recovers from `data/state.json` after server restart.

## 4. Provider compatibility

| Provider | Supported here | Not supported or not verified | Integration status |
|---|---|---|---|
| Claude Code | Session/prompt/tool/permission/subagent hooks; successful read/edit/command/web counts; failure events. | A live controlled acceptance run was not performed in this repair. | Existing hook tests pass. The prior workflow checkpoint records Claude Code unavailable on its tested host. |
| Codex App | Session, prompt, known tool name, permission, stop/interruption, and session-end hooks. `PostToolUse` counts recognized reads/edits and actual Bash executions; Bash nonzero exit still counts as an executed command. `tool_use_id` deduplicates repeated completion callbacks. Inputs and outputs are excluded. | Exact file paths and command strings are unavailable by design; unknown tools are uncounted. Hosted web tools do not use this hook path. New tool-level path was not real-tested in this repair. | The workflow checkpoint records a real App session reaching the feed and worker on 2026-11-10. This verifies session intake, not the new tool-level counting path. |
| Codex CLI | Accepted runner task start; thread/turn/message/process lifecycle; failure and incomplete outcomes. | Detailed CLI read/edit/command events are not counted because the installed JSONL tool mapping has not been verified here. | Prior checkpoint verified prompt-only CLI lifecycle events. Real tool-level acceptance is NOT VERIFIED. |
| Antigravity | Conversation-file modification observation and worker status. | No direct prompt, tool, file, command, or task outcome visibility. | File observer has unit coverage; live provider acceptance is NOT VERIFIED. |
| Future providers | `src/shared/agent-events.js` and the common counter event vocabulary provide an extension point. | No unimplemented provider is claimed as supported. | No additional adapter was added. |

## 5. Counter definitions

- **Tasks:** accepted Claude/Codex App prompts and Codex CLI runner starts. Session start, turn end, and agent messages are not tasks.
- **Reads:** observed Claude `PostToolUse` read operations and recognized Codex App filesystem MCP `PostToolUse` operations.
- **Edits:** observed Claude write/edit completions and Codex App `apply_patch` or recognized filesystem MCP completions. Pre-tool intent and failure hooks do not count.
- **Commands:** observed Claude Bash completions and Codex App Bash executions. Codex App Bash is counted even with a nonzero exit because the command did run.
- **Web:** retained as a successful-operation counter in the server data; it is not one of the four requested tiles.
- **Time range:** counters cover the current local day and roll over with the server's local date. Daily stats persist in `data/state.json`.

These tiles are labelled as observed activity. Claude tool counts come from completion hooks only; Codex App counts come from completion hooks only; Codex CLI tasks come from its runner start callback only. This avoids counting the same operation through both a provider hook and runner callback. Codex App uses its documented `tool_use_id` to discard repeated completion callbacks. If a future tool source omits a stable operation ID, no time-based deduplication guess is used.

## 6. API cost source and verification

`server/usage.mjs` scans local Claude transcript usage records, deduplicates message IDs, and applies a local model price table to estimate equivalent API list price. The tile sums estimates for open Claude sessions. It does not read an invoice or report actual spending, and no paid API was called for this repair. The tile now says “API est.” with an approximation marker and explanatory title; it shows `—` when no transcript usage is available.

## 7. Tests and exact results

- Focused activity/provider tests: **17 passed, 0 failed**.
- `npm test -- --test-concurrency=1`: **314 tests, 306 passed, 0 failed, 8 skipped**.
- `npm run lint`: **exit 0**, with one unrelated existing warning in `server/tools/adapters/base-adapter.mjs:8` (`os` unused).
- `npm run typecheck`: **passed**.
- `npm run build`: **failed** on the existing out-of-scope `src/office/ui/tools-view.js:1352` parse error (`Expression expected`, an extra closing brace). That file was already untracked before this repair and was not changed here.
- The 8 skipped tests require optional `sqlite3` support or external credentials/services. A default-concurrency full-suite run had one timing-sensitive Codex account-switch failure; that test passed when isolated, and the serial full suite passed.
- Tests cover counter aggregation and exclusion of failed/unknown operations, Codex App allowlisting/tool classification, normalized Codex lifecycle state, Antigravity unknown-state accuracy, feed-model deduplication, and Antigravity file observer behavior.
- No end-to-end browser filter/reconnect run or real provider tool-level acceptance was performed in this repair.

## 8. Real provider acceptance evidence

- **Codex App session intake:** the existing checkpoint records enabled plugin hooks, a real session visible in `/api/live`, the Activity feed, and the 3D worker on 2026-11-10. The task outcome was not established. The new classification/counting behavior for a real tool hook is NOT VERIFIED.
- **Claude Code:** NOT VERIFIED in this repair; the prior checkpoint says its executable was unavailable on that host.
- **Codex CLI:** NOT VERIFIED for real tool events. No live CLI task was run because the request forbids paid API calls.
- **Antigravity:** NOT VERIFIED with a live changed conversation file; only the file-observation mechanism and unit tests were checked.

No provider success was fabricated.

## 9. Remaining limitations

- Codex CLI tool events do not yet contribute read/edit/command counts. A safe implementation needs an observed, version-specific JSONL event mapping.
- Codex App reports the tool name but omits input/output, so entries can say “Bash” or “Read” but cannot show the command or path.
- Antigravity's conversation database format remains undocumented; file changes indicate activity only, not what work occurred or whether a task succeeded.
- Browser-level filter and reconnect recovery were not exercised. The existing EventSource and tunnel-polling recovery paths were inspected; automated UI acceptance is still needed.
- The feed persists its bounded recent history, while runner-specific Codex CLI details have a separate bounded store. It is not an unlimited activity archive.

## 10. Required user configuration

- Keep the existing Claude Code hooks installed for Claude tool visibility.
- Keep the repo-local Codex App hook plugin installed and trusted for Codex App visibility. It posts to the existing default loopback port `4310` and sends no tool inputs or outputs.
- Codex tool classification follows the supported hook tool names in the [Codex hooks reference](https://developers.openai.com/codex/hooks); hosted web tools are outside this local hook path.
- Antigravity needs no setup for the default conversation directories. Set `OFFICE_AG_DIRS` only if its conversation files live elsewhere.
- No global agent configuration, credential configuration, or dependency was changed.
