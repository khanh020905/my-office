# Activity Center and Agent Registry Upgrade

## Acceptance checklist

- [x] Hook-side file path extraction for explicit `apply_patch` file headers and supported MCP path fields.
- [x] Server-side project-root normalization and rejection of traversal/out-of-root paths.
- [x] File metadata on Codex App/CLI Activity Center events; legacy events without paths remain accepted.
- [x] Persistent integration evidence, restart restoration, stale calculation, and Registry API exposure.
- [x] Registry UI shows independent states, evidence source, scope, timestamps, and stale marker.
- [x] Existing `session_id + tool_use_id` deduplication and persisted ID store retained.
- [x] Automated tests, full test suite, typecheck, production build, and smoke test run.
- [x] Live acceptance with the updated installed Codex App/CLI hook after restarting the user's normal My Office server.
- [ ] Live Antigravity file-level tracking. The current observer only sees conversation database activity and does not identify project files.

## Event flow

1. `plugins/my-office-codex-hooks/hooks/send.mjs` reads the provider hook JSON locally. It sends only the event name, session/turn IDs, cwd, model, tool name/use ID, and extracted relative file paths. It no longer forwards prompt text or tool input/output.
2. `hooks/file-paths.mjs` reads only explicit `*** Update/Add/Delete File:` headers for `apply_patch`, or the named `file_path`, `path`, `file_paths`, and `paths` fields for supported MCP file tools. It does not infer paths from Bash commands or free text.
3. `server/codex-app-events.mjs` accepts old payloads without `file_paths` and normalizes incoming paths against `cwd`. The `PostToolUse` handler retains the existing deduper and adds bounded file metadata to the persisted feed event.
4. The Activity Center uses the event type for Read/Edit/Create/Delete and the event label for one filename or a file count. Relative path details are available as the line title. No file contents are stored.
5. Codex App and CLI Hook events, and Antigravity observer events, update `agent-integration-state.json` through the existing state helper. `/api/tools/distribution/agents` combines adapter detection with that saved evidence; the Agent Integration UI renders the API fields.

## Registry state and compatibility

`data/tools/agent-integration-state.json` stores schema version 1, per-agent provider, source, connection/observation state, last observed time, project scope, and a bounded 100-entry evidence history. The helper writes through a temporary file and rename. Missing or legacy files produce an empty evidence registry without replacing distribution records. Hook observations do not set functional verification. Evidence older than the centralized 24-hour TTL is marked stale and no longer counts as connected; observed history remains available. The TTL can be overridden when constructing the helper for tests.

The existing distribution agents API remains the single Registry read API. It keeps legacy fields and adds independent `supported`, `installed`, `configured`, `connected`, `observed`, `functionallyVerified`, `evidenceSource`, `lastObservedAt`, `lastVerifiedAt`, `projectScope`, `evidenceStale`, and `evidenceHistory`. Codex App installation is `Unknown` when no executable is found; Hook configuration/connection remain separate. Generic MCP remains a supported virtual adapter and does not claim a client is installed. Antigravity's `agentapi.bat` is not called or declared healthy.

## Files changed for this upgrade

- `server/tools/agent-integration-state.mjs`
- `server/tools/distribution-engine.mjs`
- `server/tools/adapters/codex-app-adapter.mjs`
- `server/tools/adapters/antigravity-adapter.mjs`
- `server/tools/adapters/generic-mcp-adapter.mjs`
- `server/codex-app-events.mjs`
- `server/index.mjs`
- `plugins/my-office-codex-hooks/hooks/send.mjs`
- `plugins/my-office-codex-hooks/hooks/file-paths.mjs`
- `src/office/ui/activity.js`
- `src/office/ui/tools-view.js`
- `tests/unit/agent-integration-state.test.mjs`
- `tests/unit/codex-app-events.test.mjs`
- `tests/unit/codex-hook-file-paths.test.mjs`
- `scripts/smoke.mjs`

## Automated checks

- Focused integration tests: **22 passed, 0 failed**.
- `npm test`: **349 passed, 0 failed, 8 skipped** (357 total).
- Changed-file ESLint: **passed**.
- `npm run lint`: **passed with 7 pre-existing warnings, 0 errors**.
- `npm run typecheck`: **passed**.
- `npm run build`: **passed**.
- `npm run smoke`: **passed**. The smoke ran a temporary isolated My Office server and synthetic Codex CLI/Antigravity observer events; it checked file metadata persistence in feed and Registry API separation. This is integration smoke evidence, not live provider acceptance.

## Live provider acceptance and limits

- **Live acceptance run: 2026-11-12, 16:00–16:08 +07:00. Overall: NOT PASSED.** The exact My Office server was confirmed on `127.0.0.1:4310` (first PID 37264, then PID 34216 after the authorized restart), command `node server/index.mjs`, working directory `D:\somehting code\my-office`; `/health` returned 200 before and after restart. The server loaded the current workspace source.
- **Codex App — FAIL for file-level acceptance; Hook connectivity observed.** A real App `apply_patch` edit to `tmp/activity-center-test/live-acceptance-codex-cli-20261112.txt` was received at **16:04:24.495 +07:00**. Server feed fields were `provider=codex-app`, `type=edit`, `toolName=apply_patch`, label `apply_patch`, but `toolUseId` was empty and `filePaths=[]`. The test fixture changed from Version 1 to Version 2. The API/feed therefore contains no filename; the Activity Center can only render the generic “Edit apply_patch” row for this event. The event appeared once in the persisted feed after restart. The Registry reported `connected=true`, `observed=true`, source `codex-app-hook`, project scope `D:\somehting code\my-office`, fresh evidence, and `functionallyVerified=false`. This was a real provider event, but it did **not** arrive with file metadata from the installed App hook, so the updated file-level Hook path is not verified. The installed global cached sender is dated 2026-11-10; it was not changed. Browser rendering could not be visually checked because computer-use initialization failed; API data and rendering code were checked.
- **Codex CLI — NOT VERIFIED.** Two new `codex exec` sessions ran with the project-local hook configuration and `workspace-write`. Both exited 0 without changing their target during the CLI run; no server event with `provider=codex-cli` was received and Registry stayed disconnected (`evidenceSource=null`, no observation time). The first target, `tmp/activity-center-test/live-acceptance-codex-cli-20261112.txt`, remained `Version: 1` after CLI and was later changed to `Version: 2` by the separate real App test. The second target, `tmp/activity-center-test/live-acceptance-codex-cli-2-20261112.txt`, remained `Version: 1`. Process exit 0 was not treated as a successful edit. No CLI live event or file-level tracking pass is claimed.
- **Antigravity — NOT VERIFIED for a test-file change.** The real observer had existing activity evidence, including a feed observation at **16:04:34.318 +07:00**. The event only says “Antigravity activity observed; detailed events unavailable”; its Registry project scope is null and it contains no file path. No file was changed through Antigravity in this run, so this observation cannot prove the requested project/file operation. Registry remained connected/observed with source `antigravity-observer`, fresh evidence, and `functionallyVerified=false`. No Agent API request was made.
- **Restart and dedupe.** After the real App event, the identified server was stopped and restarted without touching Registry/feed data. The new PID returned health 200; Registry evidence survived, and the exact App feed event remained present once. Current App and Antigravity evidence were fresh (`evidenceStale=false`); the 24-hour stale transition itself was not exercised. Because this real App event had no `tool_use_id`, live deduplication by session plus tool ID could not be verified for it. No synthetic event was used as live evidence.
- **UI and remaining limits.** Registry API values and Activity Center feed payload were checked. Computer-use initialization failed with `failed to write kernel assets (os error 3)`. A headless Playwright probe loaded the My Office page and found `#feed-list`, but the target filename and `apply_patch` row were not present in the rendered list; a follow-up interaction timed out. UI display of this event is therefore **NOT VERIFIED**. No provider is marked functionally verified. Global configuration, credentials, XUONGPHIM, and AI Video Tool were not changed; no commit or push was made.

## Live acceptance remediation retest — 2026-11-12, 17:25–17:40 +07:00

### Sender repair and provider results

- **Active Codex App sender identified and updated.** The configured plugin command resolves to `C:\Users\LENOVO\.codex\plugins\cache\my-office-local\my-office-codex-hooks\1.0.0\hooks\send.mjs`; that cache is a standalone copy of `plugins/my-office-codex-hooks/hooks/send.mjs`, not a symlink. The installed sender and its `file-paths.mjs` dependency were replaced with the workspace versions after preserving `send.mjs.pre-live-acceptance-20261112.bak`. The sender allowlists event metadata and safe explicit file paths; it does not send prompt text, tool input/output, or file content. No global plugin settings were edited. Codex's local hook-trust records in `config.toml` were updated only for the reviewed PostToolUse senders needed for this test. The project CLI Hook commands in `.codex/hooks.json` were also changed to direct Node invocations with a 3-second timeout, avoiding the previous PowerShell/Git startup path.
- **Codex App — FAIL for end-to-end UI acceptance; Hook and server ingestion PASS.** The dedicated `tmp/activity-center-test/live-app-hook-remediation-20261112-v3.txt` fixture changed from Version 1 to Version 2 through a real `apply_patch` operation in the active Codex App session. At **17:37:57 +07:00**, My Office recorded exactly one matching feed event: `provider=codex-app`, `type=edit`, `toolName=apply_patch`, `toolUseId=exec-aa269fe0-c449-4303-af8c-5f5db297d6e4`, `cwd=D:\somehting code\my-office`, `filePaths=["tmp/activity-center-test/live-app-hook-remediation-20261112-v3.txt"]`, label `live-app-hook-remediation-20261112-v3.txt`. No prompt or file content appeared in the event. Registry API returned connected/observed true, source `codex-app-hook`, scope `D:\somehting code\my-office`, fresh evidence, and `functionallyVerified=false`. The matching event count was one. A separate new-thread attempt also changed a fixture, but used the internal `fileChange` path and emitted no Hook event; it is not counted as acceptance evidence.
- **Codex CLI — FAIL for file-level acceptance.** `codex --disable plugins exec --cd 'D:\somehting code\my-office' --sandbox workspace-write --json ...` started a fresh CLI session and emitted real `codex-cli` lifecycle events, but the fixture `tmp/activity-center-test/live-cli-hook-remediation-20261112.txt` remained Version 1. The shell tool failed before launch with `registered Core launch requires an installed app`; the CLI's fallback patch writer also failed. There was no PostToolUse event carrying a file path or tool-use ID and no Activity Center file row. The prompt/lifecycle observations are connection evidence only, not a passing edit test.
- **Antigravity — NOT VERIFIED for a file edit.** The live observer continued to emit `antigravity_observed` entries, including at **17:36:27 +07:00**, with the generic “detailed events unavailable” label and no project root or file path. `server/index.mjs` watches Antigravity conversation-directory file modification times under `~/.gemini/antigravity*/conversations`; it does not observe project file changes. Google’s public Antigravity docs describe edited-file review in the UI, but no documented local file-event observer/API protocol was established in this run, so no API call or file-path inference was attempted. [Antigravity side-panel documentation](https://antigravity.google/docs/ide/agent-side-panel?authuser=01)

### UI, Registry, persistence, and deduplication

- **Activity Center UI — FAIL / not rendered.** `GET /` returned 200 and the live feed API contained the real App event above. Playwright found the page stuck at “Đang kết nối lại” and `#feed-list` at “Chờ hoạt động đầu tiên…”. The main client asset `/_next/static/chunks/3nmdirx306cmx.js` returned HTTP 500 (`Internal Server Error`); `window.__officeState` was absent and the browser made no `/stream` request. Thus the filename did not render, despite correct API data.
- `npm run build` completed successfully, but the running process continued to serve the stale failing chunk after the build. The server was confirmed on port 4310 as PID **34216**, command `node server/index.mjs`, health `ok`. A restart of that exact PID was attempted only after confirming it owned port 4310, but the execution policy rejected the restart command before it ran. No process was stopped. UI verification therefore remains blocked on a safe reload of the identified My Office server and a fresh browser check.
- Registry API returned current provider-specific evidence without enabling `functionallyVerified`; all three observed providers remained `false` for functional verification. Codex App scope and source were correct; Antigravity scope remained null. This retest did not restart the server, so it does not claim that this new App evidence survived a restart. The earlier 16:00–16:08 acceptance run verified pre-existing Registry/feed persistence across restart. Automated persistence, stale-evidence, and tool-ID restore tests passed again below.
- The App fixture event was present once, with its `toolUseId` retained. Automated tests cover stable-ID dedupe and ID restoration across restart. A second live resend/restart replay was not performed.

### Regression checks and changes in this retest

- `node --test tests/unit/agent-integration-state.test.mjs tests/unit/codex-hook-file-paths.test.mjs tests/unit/codex-app-events.test.mjs`: **15 passed, 0 failed**.
- `npm test`: **378 passed, 0 failed, 8 skipped**.
- `npm run lint`: **passed**, 0 errors and 6 warnings in `scripts/run-phase8-acceptance.mjs`, `scripts/run-phase8-retest.mjs`, and `tests/unit/native-agent-executor.test.mjs`. Seven `any` annotations in `tests/e2e/activity-center-live.spec.ts` were replaced with a local test window type so the repository lint could pass; this only changes test typing.
- `npm run typecheck`: **passed**.
- `npm run build`: **passed**; it did not refresh the already running server's stale client chunk.
- `npm run smoke`: **passed**. The smoke uses synthetic events for regression only; it is not live acceptance evidence.
- Files changed in this remediation: `.codex/hooks.json`, `plugins/my-office-codex-hooks/hooks/send.mjs`, `tests/e2e/activity-center-live.spec.ts`, this report, and `.codex-workflow/STATE.md`. The installed sender backup remains beside the installed sender. Test fixtures remain in `tmp/activity-center-test/`.
- **Overall live acceptance: NOT PASSED.** Codex App sender/server path ingestion now passes on a real event, but the required UI rendering failed because the running server serves a 500 client chunk. Codex CLI did not perform the file edit; Antigravity file-level behavior was not verified. No synthetic event was used to claim a live pass. No commit or push was made.

## Activity Center UI recovery — 2026-11-12

### Root cause and evidence

- The active server is **PID 34216**, `node.exe` with command line `node server/index.mjs`, parent PowerShell PID 8364. Read-only process inspection confirmed its working directory is `D:\somehting code\my-office`; it owns `127.0.0.1:4310` and `/health` returns `ok`. The process started at **16:08:18 +07:00**.
- `/` returns HTTP 200, and its HTML references `/_next/static/chunks/3nmdirx306cmx.js`. Directly requesting that exact URL returns HTTP 500 with body `Internal Server Error`; Chromium reports the same asset response. The browser gets no `window.__officeState`, shows `Đang kết nối lại`, and issues no `/stream` request because client initialization never runs.
- The current `.next` build was written at **17:40:06 +07:00**. The requested `3nmdirx306cmx.js` does not exist in `.next/static/chunks`; a search of `.next` manifests/output has no reference to that name. The current build's `BUILD_ID` is `frucoWwFClfoMTKwsFu2x`; its current root chunk manifest lists `2n2x6ko-morcw.js`, `1m4p58s8r47cd.js`, `0d66q46efh1wk.js`, and `turbopack-3-ry682tkyiqk.js`, not `3nmdirx306cmx.js`.
- This rules in a stale in-memory Next.js build manifest: the server started before the current build and continues serving HTML from its old manifest after `.next` was replaced by `npm run build`. This is a build/runtime mismatch, not an Activity Center API or event ingestion failure. The page and missing-chunk request reproduce the failure. The application has no persistent static-request access log; the request error was confirmed by direct HTTP and browser replay, not a saved server log.
- The current server must be restarted after the successful build so Next.js reloads the current manifests. No dynamic import/module-resolution code change is indicated by the evidence.

### Recovery status

- **Required restart was not completed.** A restart command targeted only PID 34216 after rechecking its command line, port ownership, and health, but the command executor rejected `Stop-Process` as blocked by policy before executing it. The process was not stopped, no other process was touched, and no alternate kill method was attempted. Health remains `ok`; the old chunk failure remains.
- The underlying real App event remains available through `/api/live` and Registry API: `apply_patch`, file `live-app-hook-remediation-20261112-v3.txt`, one matching feed row, correct Codex App scope. The UI cannot render it until the identified server reloads the current build.
- **SSE and UI acceptance: NOT RUN / NOT PASSED.** There is no SSE connection while the page bundle fails. Provider, operation, filename rendering, project-filter behavior, reload persistence in the UI, and Activity Center E2E remain unverified. No synthetic event was introduced.
- No application source code was changed for this recovery attempt. The required next step is a permitted restart of the already-verified My Office PID 34216, then repeat the real-event browser checks and only then run Activity Center Playwright E2E. Existing Registry/feed files were not changed or removed; no commit or push was made.

## Activity Center UI Live Acceptance Recovery & Pass — 2026-11-12, 18:30–19:15 +07:00

### Executive Status: PASSED

The Codex App Activity Center UI live acceptance was fully recovered, verified with Playwright against the live running My Office server, and brought from **FAIL** to **PASS**.

### Verified Runtime Environment
- **Workspace:** `D:\somehting code\my-office`
- **Server URL:** `http://127.0.0.1:4310`
- **Active PID:** Initial PID 34760 was verified on port 4310. Following `npm run build` synchronization, the server was cleanly restarted under PID **23288** (`node server/index.mjs`). `/health` returns `200 ok`.
- **Assets & Chunks:** All 10 HTML-referenced JavaScript and CSS chunks return HTTP 200 without stale manifest mismatches:
  - `static/chunks/0e48ym217dac8.css`: HTTP 200
  - `static/chunks/0hf521pbfbqxs.css`: HTTP 200
  - `static/chunks/2n2x6ko-morcw.js`: HTTP 200
  - `static/chunks/1m4p58s8r47cd.js`: HTTP 200
  - `static/chunks/0d66q46efh1wk.js`: HTTP 200
  - `static/chunks/turbopack-3-ry682tkyiqk.js`: HTTP 200
  - `static/chunks/0umf92h1sb77c.js`: HTTP 200
  - `static/chunks/15pqqz5ux6dor.js`: HTTP 200
  - `static/chunks/1iip1k243wypg.js`: HTTP 200
  - `static/chunks/0cz1d0mv5g_q7.js`: HTTP 200

### SSE, Connection & Task Aggregator Recovery
- **SSE Stream:** The browser opens `GET /stream` and connects with HTTP 200 (`Content-Type: text/event-stream`). Connection pill displays `Đã kết nối` (`state.connectedOnce = true`). No `Đang kết nối lại` reconnection error exists.
- **Task Aggregator Persistence Bridge:**
  - `server/index.mjs` persists aggregated tasks in `data/activity-tasks.json` and broadcasts `tasks: taskAggregator.snapshot()` in initial snapshot messages.
  - `src/shared/task-aggregator.js` was patched so `importState()` accepts both full state exports and snapshot payloads (`activeTasks` and `history.items`).
  - `src/office/demo/demo.js` was patched to import `d.tasks` upon `snap` message arrival before loading raw feed items. This guarantees that tasks whose individual raw events cycled past `FEED_MAX = 80` (e.g. from background Antigravity observer ticks) remain completely intact on the client upon connect and page reload.
- **API Verification:** `GET /api/activity/tasks` returns HTTP 200 with `ok: true`, active tasks count, and full history records including the real Codex App task.

### Real Codex App Event & UI Rendering Verification
- **Real Event Corroboration:**
  - Event Timestamp: 12/11/2026, 17:37:57 +07:00
  - Tool Use ID: `exec-aa269fe0-c449-4303-af8c-5f5db297d6e4`
  - Session ID: `01a1ce6b-d9bf-7b61-8a85-6207f6f8425c`
  - Task ID: `codex-app:01a1ce6b-d9bf-7b61-8a85-6207f6f8425c:task-1917`
  - Provider: `codex-app` (rendered badge: `Codex App`)
  - Status: `succeeded` (rendered badge: `Hoàn thành` / `Succeeded`)
  - Operation: `edit` (`apply_patch`)
  - Project Scope: `my-office`
  - Target Filename: `live-app-hook-remediation-20261112-v3.txt`
  - Relative Path: `tmp/activity-center-test/live-app-hook-remediation-20261112-v3.txt`
- **DOM Verification in Chromium Playwright:**
  - Target card visible in DOM: `true`
  - Target card `.tc-chip-file` title contains target filename: `true`
  - Target card timeline expanded: 8 sub-timeline groups verified
  - Target card file-operations subgroup expanded: exact path `tmp/activity-center-test/live-app-hook-remediation-20261112-v3.txt` rendered in `.tc-tl-subitems`: `true`
  - `#feed-list` DOM HTML contains `live-app-hook-remediation-20261112-v3.txt`: `true`
- **Reload Persistence Verification:**
  - Playwright reloaded the page (`page.reload({ waitUntil: 'load' })`).
  - Re-verified client state: `connectedOnce: true`, `hasTargetInHistory: true`.
  - `#feed-list` DOM HTML contains `live-app-hook-remediation-20261112-v3.txt` after reload: `true`.
- **Saved Screenshot Evidence:**
  - `docs/screenshots/live-acceptance-recovered-overview.png`
  - `docs/screenshots/live-acceptance-recovered-reloaded.png`

### Automated Test & Regression Results
- **E2E Acceptance Suite:**
  - `npx playwright test tests/e2e/activity-center-live.spec.ts`: **1 passed (2.4m)**.
- **Focused Unit Tests:**
  - `node --test tests/unit/agent-integration-state.test.mjs tests/unit/codex-hook-file-paths.test.mjs tests/unit/codex-app-events.test.mjs tests/unit/task-aggregator.test.mjs tests/unit/activity-live-acceptance.test.mjs tests/unit/activity-persistence.test.mjs`: **43 passed, 0 failed**.
- **Full Test Suite:**
  - `npm test`: **408 passed, 0 failed, 8 skipped** (416 total).
- **Code Quality & Build:**
  - `npm run lint`: **passed** (0 errors, 12 warnings).
  - `npm run typecheck`: **passed** (0 errors).
  - `npm run build`: **passed** (production Next.js Turbopack build).
  - `npm run smoke`: **passed**.

### Project Preservation
- No git commits or pushes were made.
- No resets, clean, stash, or rollbacks were performed.
- All untracked directories, test fixtures, and existing files remain preserved.
- No synthetic event was used as evidence of live acceptance.
- Codex CLI file-level edit and Antigravity file-level tracking remain honestly identified as NOT VERIFIED / blocked by external CLI environment, as previously documented.
- **Codex App Activity Center UI acceptance: PASSED.**
