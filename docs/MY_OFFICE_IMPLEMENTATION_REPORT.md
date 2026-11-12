# My Office multi-agent implementation report

Date: 2026-11-11  
Repository: `D:\somehting code\my-office`

## Result summary

- **PASS** — Implemented worktree-isolated Codex and Claude workflow dispatch, persisted run/workflow state, lifecycle handling, workflow APIs, and a compact task-sheet workflow UI.
- **PASS** — Real Codex CLI file-write acceptance through the My Office workflow, runner, worktree, and persistence path.
- **PASS** — Latest app-level Codex A–E workflow completed in dependency order with parallel B/C execution, isolated worktrees, integration tests, and independent review.
- **PASS** — Failure injection blocked B until explicit retry of A succeeded; B then ran once and completed.
- **PASS** — Restarting the actual My Office server preserved completed workflow history and classified the active provider run as interrupted.
- **PASS** — Full test, lint, typecheck, build, server smoke, and temporary HTTP workflow checks.
- **BLOCKED** — Claude CLI was authenticated but its live API call failed with `ECONNREFUSED`; Codex ran the mechanics workflow instead.
- **NOT VERIFIED** — Antigravity execution and browser-based workflow UI behavior.

## Critical Codex write bug — root cause and fix

- The My Office Node server inherited Codex Desktop's `CODEX_WINDOWS_REGISTERED_CORE=1`. The nested CLI inherited it and routed its generated PowerShell command through a registered Core launcher. That launch failed with `registered Core launch requires an installed app`; JSONL showed the command execution failed, the file-change operation failed, and a fallback file write failed. The agent explicitly reported that it had not created the file.
- Codex nevertheless exited with code `0` and emitted `turn.completed`. Before this fix, My Office equated process exit 0 with run/task completion and did not inspect tool failures or the requested output.
- Confirmed by isolation: invoking the same CLI with only `CODEX_WINDOWS_REGISTERED_CORE` removed in a throwaway repository created the exact requested file. The fix removes that desktop launcher variable from the child environment. It also removes the inherited `CODEX_PERMISSION_PROFILE` (the parent reported `:danger-full-access`) so the process cannot inherit the parent's broader permission profile. The child still receives all other environment values, including existing auth configuration, and receives explicit `--sandbox workspace-write` scoped by `--cd` to its allocated worktree. No global setting changed.
- Installed command checks: `codex --version` reported `codex-cli 0.167.0`. My Office's PATH resolver selected `C:\Program Files\WindowsApps\OpenAI.Codex_26.1103.7773.0_x64__2p2nqsd0c76g0\app\resources\codex.exe`, which reported `codex-cli 0.167.0-alpha.3.2`. Its `exec --help` supports `--sandbox workspace-write`, `--cd`, and `--json`. The exact run did not use an invented approval flag, automatic approval, or a sandbox bypass.
- My Office now records `processStatus` separately from `taskStatus`. A zero process exit is not task success by itself: JSONL must show a completed turn with no failed tool events. If the task lists expected artifacts, each must be a new or changed regular file within the worktree. An absent/unchanged artifact yields `incomplete`; structured execution errors yield `blocked`; non-zero exit yields `failure`. Read-only analysis can succeed without a Git diff when it has a completed turn and no tool errors.

## Changes implemented

- Codex CLI runs now use one isolated Git worktree and `--sandbox workspace-write`. The original checkout must be clean; if not, task launch fails with `dirtyRepository`. No unrestricted sandbox or approval bypass is used.
- Codex child processes drop the inherited Windows registered-Core launcher and parent permission-profile variables while retaining other environment/auth values.
- Codex task success now checks structured turn/tool results and optional, path-validated expected artifacts. Task Sheet accepts comma-separated expected files for Codex tasks; process status and task status persist separately.
- Worktrees use unique `myoffice/<uuid>` branches. Active ownership is protected; failures preserve the worktree; cleanup refuses active or dirty worktrees.
- Codex runs persist to bounded, redacted JSON in `DATA_DIR`, recover active records as `interrupted`, retain exit code/signal, and distinguish completed, failed, cancelled, timeout, interrupted, and unknown states. Stop/timeout is recorded before signaling. Duplicate close events cannot replace an established outcome.
- Workflows and tasks persist as JSON with dependency validation/cycle detection, a two-task concurrency limit, dependency gating, retry, cancellation, recovery, bounded results, and correlated events. Claude uses the existing task runner; Codex uses its CLI runner.
- Scheduler claims are persisted before dispatch under one exclusive lease. Failed, incomplete, or interrupted prerequisites block dependents; attempts stop at `maxAttempts`; explicit retry unblocks eligible tasks. Codex no-match ripgrep exit 1 is not treated as a failed task tool.
- Completed prerequisite artifacts are copied into a downstream task's separate worktree after path and conflict checks. Tasks receive the attempt number in their prompt.
- Workflow routes are loopback/auth/same-origin guarded and constrain task folders to known project/session directories. Workflow list, create, status, controls, tasks, events, logs, and provider capability routes are available.
- Task Sheet has workflow creation, provider/dependency selection, workflow status, retry/cancel and log controls. Antigravity is marked **NOT VERIFIED** and cannot be assigned as an executable workflow provider.
- Added startup-cancellation and worktree ownership race guards. The existing server smoke now checks provider truth and workflow create/read API behavior.

## Files changed

Implementation files: `server/index.mjs`, `server/tasks.mjs`, `server/codex-runs.mjs`, `server/codex-app-events.mjs`, `server/worktrees.mjs`, `server/workflows.mjs`, `src/office/ui/task-sheet.js`, `src/shared/agent-events.js`, `src/styles/group-chat.css`, `src/i18n/locales/en/chat.js`, `src/i18n/locales/vi/chat.js`, `scripts/smoke.mjs`, and `scripts/codex-write-acceptance.mjs`.

Tests: `tests/unit/codex-runs.test.mjs`, `tests/unit/codex-app-events.test.mjs`, `tests/unit/workflows.test.mjs`, `tests/unit/worktrees.test.mjs`, and `tests/unit/agent-events.test.mjs`.

Docs: `docs/MY_OFFICE_IMPLEMENTATION_PROGRESS.md`, `.codex-workflow/STATE.md`, and this report.

The checkout contained user modifications and untracked files before implementation. They were recorded in the progress document and preserved; this list does not claim every dirty path was introduced by this task. `Microsoft/` and the five existing `*.bak-formal` locale files were left untouched. No commit, push, merge, or deployment was made.

## Database and persistence

- **PASS** — Inspected project dependencies and persistence conventions. No Prisma or database dependency is present; the app stores local state in JSON under `DATA_DIR`.
- **PASS** — Added no database or migration. Run and workflow JSON writes use temporary files and atomic rename, with bounded retained history/output and redaction.
- Recovery marks active Codex runs and workflow tasks as `interrupted` and records recovery events. The app-level restart acceptance verified an active Codex run was persisted as interrupted and completed history remained available after restart.
- The restart acceptance logged two transient Windows `EPERM` errors during workflow snapshot rename; later writes produced a valid final snapshot containing all workflow and interrupted-run records. See the restart scenario below.

## API changes

- **PASS** — Smoke-tested `GET /api/agents`, `POST /api/workflows`, and `GET /api/workflows/:id` against a production-mode server using isolated temporary data.
- Added workflow list/detail/tasks/events/logs routes; create/start/cancel; task retry/cancel/worktree cleanup; Codex run start/stop/list; provider capability listing.
- **NOT VERIFIED** — Every route and browser control was not exhaustively exercised end to end. Smoke does not dispatch an agent.

## Acceptance evidence

### Scenario A — Codex can write

- **PASS** — Reproducible real acceptance: `node scripts/codex-write-acceptance.mjs`. This creates a dedicated temporary Git repo, uses the actual My Office worktree manager, runner, workflow scheduler, and JSON persistence, then checks the output.
- Exact prompt: `Create a file named CODEX_WRITE_ACCEPTANCE.txt in the current working directory. Write the exact text: MY OFFICE CODEX WRITE VERIFIED`.
- Exact invocation: `C:\Program Files\WindowsApps\OpenAI.Codex_26.1103.7773.0_x64__2p2nqsd0c76g0\app\resources\codex.exe exec --json --sandbox workspace-write --cd "C:\Users\LENOVO\AppData\Local\Temp\my-office-codex-acceptance-f6tK8N\worktrees\6368fce9f4d6\f5b4dadc-f42f-47d3-b27d-e921da8d9278" "Create a file named CODEX_WRITE_ACCEPTANCE.txt in the current working directory. Write the exact text: MY OFFICE CODEX WRITE VERIFIED"`.
- Worktree existed and was both the process `cwd` and `--cd` target. CLI sandbox was `workspace-write`; the original checkout was not added as a writable directory.
- Verified file: `C:\Users\LENOVO\AppData\Local\Temp\my-office-codex-acceptance-f6tK8N\worktrees\6368fce9f4d6\f5b4dadc-f42f-47d3-b27d-e921da8d9278\CODEX_WRITE_ACCEPTANCE.txt`; exact contents: `MY OFFICE CODEX WRITE VERIFIED`.
- Process result: `processStatus=completed`, exit code `0`. Evidence-based result: `taskStatus=success`, `artifactChanges=["CODEX_WRITE_ACCEPTANCE.txt"]`; workflow task persisted as `completed`.
- Persisted run ID: `aa216a21-9c8d-449d-ada8-2750153bc638`. Workflow ID: `ea63a502-ac2c-4aaf-9724-b7037f829d09`.
- Git status: ` A CODEX_WRITE_ACCEPTANCE.txt` (intent-to-add). `git diff -- CODEX_WRITE_ACCEPTANCE.txt` showed a new file with the exact one-line contents. The acceptance script used intent-to-add only in the temporary worktree so ordinary `git diff` includes the new untracked file.
- The script compared the main checkout's `git status --porcelain` before and after; it was unchanged. Evidence repo/worktree/data remain at `C:\Users\LENOVO\AppData\Local\Temp\my-office-codex-acceptance-f6tK8N`.
- The earlier failed run remains documented above as the trigger for this fix; its zero exit is now classified as a blocked/incomplete task when its structured tool failures or missing expected artifact are present.

### Scenarios B and C — Cancellation and timeout

- **PASS** — Mocked-process unit tests prove cancellation/timeout are persisted before kill, and a late/duplicate close does not overwrite the outcome. Startup cancellation also stops the provider after its run ID becomes available.
- **NOT VERIFIED** — No real long-running CLI task was cancelled or timed out through My Office during this pass.

### Scenario D — Persistence

- **PASS** — Unit restart test confirms completed history is retained and active runs recover as `interrupted`, with worktree path preserved.
- **PASS** — A real My Office HTTP server restart with an active Codex process preserved completed history and classified the active run as `interrupted`; see the final app-level acceptance below. No process resumption is claimed.

### Scenarios E and F — Dependency ordering and failure recovery

- **PASS** — Mocked scheduler tests verify dependency gating, independent parallel tasks, failed prerequisite blocking, retry, downstream rescheduling after success, concurrency cap, restart recovery, and duplicate-dispatch prevention.
- **PASS** — The real app-level A–E workflow completed with Codex, including concurrent B/C, integration, and independent review; see the final acceptance below.

### Scenario G — Provider truthfulness

- **BLOCKED** — Claude executable discovery and authentication passed (`2.1.322`, `loggedIn: true`), but a real Claude workflow task returned `ECONNREFUSED`; see the provider scenario below.
- **PASS** — Codex CLI real write acceptance created the requested artifact through the workflow and run persistence path.
- **NOT VERIFIED** — Antigravity has no discovered CLI; it remains observation-only and is labeled `NOT VERIFIED`.
- Existing Codex App hook/session observation is separate from Codex CLI task execution and is not evidence of CLI write capability.
- Claude's earlier `409 noClaude` was an executable-discovery integration issue, not an intentional host restriction: its npm shim is `claude.cmd`, while My Office needs the underlying executable. The current finder checks the installed platform package at `node_modules/@anthropic-ai/claude-code/node_modules/@anthropic-ai/claude-code-win32-x64/claude.exe`; that binary reports `2.1.322`. A real Claude task was attempted and is **BLOCKED** by the provider connection error recorded below.

## Verification results

- **PASS** — Focused unit suite: `node --test tests/unit/codex-runs.test.mjs tests/unit/workflows.test.mjs tests/unit/worktrees.test.mjs tests/unit/codex-app-events.test.mjs tests/unit/agent-events.test.mjs` — 42 passed.
- **PASS** — Full `npm test` — 216 passed, 8 skipped, 0 failed (224 total). Skips are environment-dependent existing tests.
- **PASS** — Real Codex acceptance: `node scripts/codex-write-acceptance.mjs`.
- **PASS** — `npm run lint`.
- **PASS** — `npm run typecheck`.
- **PASS** — `npm run build`.
- **PASS** — `npm run smoke` — production server startup, page, hook endpoint, machine panel, installer, provider truth, workflow API.
- **SKIPPED** — `npm run test:e2e`; browser-based workflow UI testing was not part of the verified pass.

## Blockers and known limits

- **PASS** — The inherited registered-Core launcher was isolated from Codex child processes; expected-artifact evidence prevents a zero exit with no change from becoming task success. Continue reviewing output/diff for coding tasks that declare expected files.
- **BLOCKED** — Claude task execution during this run (`ECONNREFUSED`).
- **NOT VERIFIED** — Real cancellation/timeout through the app; workflow UI browser behavior; Antigravity control. The verified live workflow used Codex only.
- Source checkouts with uncommitted changes are rejected for worktree tasks. Commit or otherwise preserve the desired base before dispatch; the app will not silently omit local changes or run in the shared checkout.
- JSON persistence follows the app’s single-user local architecture; it is not a multi-host queue or transactional database.
- Task provider process completion and semantic task success are different signals. Review run output and worktree diff before accepting code changes.

## Real multi-task workflow acceptance — 2026-11-11

### Earlier acceptance runs — defects reproduced before the final fix

The failed scenarios below are retained as historical evidence. The final app-level retest that follows supersedes their status.

### Scenario 1 — A/B/C/D/E development workflow

- **FAIL** — Workflow `19368f9d-743b-47f1-a0c9-2c7df0c0507c`, temporary repository `C:\Users\LENOVO\AppData\Local\Temp\my-office-real-workflow-qb2Eym\repo`; workflow state and Codex logs are under `C:\Users\LENOVO\AppData\Local\Temp\my-office-real-workflow-qb2Eym\data`. Main checkout status was unchanged by the run. The workflow was stopped after it exposed repeated dispatch and was reloaded to verify interrupted-run recovery.
- **PASS** — A completed before B/C became eligible. Task A scheduler start was `2026-11-11T10:11:29.170Z`; run `6cddff19-6de0-47bd-b606-d1cd40613a5c`, Codex CLI, started `10:11:29.172Z` in worktree `C:\Users\LENOVO\AppData\Local\Temp\my-office-real-workflow-qb2Eym\worktrees\0c3c58ddd803\3b1d6e34-3817-4437-9884-de5d0eaa9c4a`, ended `10:12:18.149Z`, exit `0`, task status `blocked`. It created `SPEC.md`, but Codex also emitted a failed tool item. The workflow dispatched A again without a user retry.
- **FAIL** — That duplicate A dispatch was run `6f4b361f-6ce3-4015-afdb-cf38461e2653`, Codex CLI, worktree `C:\Users\LENOVO\AppData\Local\Temp\my-office-real-workflow-qb2Eym\worktrees\0c3c58ddd803\a11c3b59-1c14-4c4b-8067-5fd9aeb48b17`, `10:12:18.157Z`–`10:12:51.692Z`, exit `0`, task status `success`. The persisted result includes the API contract: `GET /api/message` returns HTTP 200 JSON `{"message":"hello"}`; the static page fetches that endpoint and displays the message in `#message`.
- **PASS** — B and C did not start before A completed. Scheduler events show B `task.started` at `10:12:51.708Z` and C at `10:12:51.736Z`, 16 ms and 44 ms after A's successful completion. This proves dependency gating and simultaneous task scheduling.
- **NOT VERIFIED** — Actual overlapping provider execution for B and C. B's Codex run `2d20fc6e-aaa0-42d3-a484-8d30b93aa037` began `10:12:51.711Z` in isolated worktree `C:\Users\LENOVO\AppData\Local\Temp\my-office-real-workflow-qb2Eym\worktrees\0c3c58ddd803\44ad0db9-ae87-433a-90ef-442393947111`; it was recovered as `interrupted` at `10:16:02.164Z`, exit code unavailable. Claude C was assigned at `10:12:51.736Z`, but its run ID and worktree path were not persisted before the harness stopped. Claude auth check returned `loggedIn: true`, version `2.1.322`.
- **PASS** — Confirmed Codex workspaces for A attempts and B were separate worktrees. **FAIL** — C's workspace cannot be verified from persisted records. D and E remained pending; no integration or independent review code/tests ran. E is **SKIPPED** because D never completed.
- **SKIPPED** — Task D (Codex CLI) and Task E (Codex CLI) never started: run IDs, worktree paths, start/end timestamps, exit codes, and test/review evidence are unavailable. D remained pending because B/C were interrupted; E remained pending because D did not complete.
- **FAIL** — Per-run logs/status did not persist for every provider: Codex run output, exit code, and task status were in `codex-runs.json`; the Claude task had no durable run record.

### Scenario 2 — Failure injection and retry

- **FAIL** — Workflow `e000e94a-982b-46bd-9073-a3c13b05bf84`, temporary repo `C:\Users\LENOVO\AppData\Local\Temp\my-office-failure-retry-VNoYBw\repo`. Task `inject` intentionally withheld `retry-marker.txt`. Codex run `c8b4de83-420f-4df5-9741-a1e056455824`, `10:17:04.010Z`–`10:18:14.997Z`, exit `0`, task status `incomplete`, worktree `C:\Users\LENOVO\AppData\Local\Temp\my-office-failure-retry-VNoYBw\worktrees\26414f757f75\bde93694-62fa-470e-83c8-db6140f8165f`. The missing artifact was persisted with error `Expected artifact was not created or changed: retry-marker.txt`.
- **FAIL** — Downstream task `downstream` stayed `pending`, not `blocked`, after the prerequisite became `incomplete`; the workflow remained running. Thus a failed/incomplete prerequisite was not reliably prevented from leaving dependent work eligible.
- **PASS** — One explicit retry was accepted after reloading the stored workflow. Attempt 2 run `eddc1fe2-91ed-4f4d-a42a-ba9d0525e56c`, Codex CLI, worktree `C:\Users\LENOVO\AppData\Local\Temp\my-office-failure-retry-VNoYBw\worktrees\26414f757f75\8f9a9d21-223f-44a0-95f9-28277ad4735c`, `10:20:00.654Z`–`10:20:27.244Z`, exit `0`, task status `success`; `retry-marker.txt` was created with exact contents `RETRY SUCCEEDED`.
- **PASS** — The dependent was released only after attempt 2 completed: run `a023eaca-1fda-4681-8864-23d0bd2ad0d1`, Codex CLI, started `10:20:27.251Z`, ended `10:21:29.072Z`, exit `0`. **FAIL** — It and run `15591550-b466-4cdf-bf42-4670328fdb1b` (started `10:21:29.092Z`, ended `10:22:25.617Z`, exit `0`) both created `downstream-marker.txt` but were classified `blocked` with error `failed`. The scheduler dispatched attempt 3, run `2ada4c66-7661-4b9e-a114-c6ed5e2e7681`, at `10:22:25.633Z` without explicit retry, exceeding `maxAttempts: 2`; recovery marked it `interrupted` at `10:25:40.472Z`, exit code unavailable. Their worktrees were respectively `C:\Users\LENOVO\AppData\Local\Temp\my-office-failure-retry-VNoYBw\worktrees\26414f757f75\00bd090f-d77e-40fa-a806-d3e49e03e27f`, `...\4452ef5b-33d4-45ec-81f7-889b5daded25`, and `...\6d5077bb-65bc-4f03-a2bb-3133ddd9f89e`.
- **FAIL** — No-duplicate-dispatch behavior. A task classified `blocked` was started again automatically; the third downstream attempt was still active when the harness was stopped. All Codex run statuses and logs were persisted.

### Scenario 3 — Recovery and provider coverage

- **PASS** — Persisted engine reload preserved completed task A and changed active B/C to `interrupted` with `Server restarted while task was running.` The active Codex B run was also recovered as `interrupted` with its worktree path and run ID retained. This was an engine reload in the acceptance harness, not a restart of the live My Office HTTP server.
- **NOT VERIFIED** — Real My Office server restart with active provider processes. The component reload check and existing unit tests do not substitute for that server-level scenario.
- **BLOCKED** — Claude was available and authenticated and was assigned Task C, but task dispatch did not return a durable Claude run ID, workspace path, exit code, or result before the acceptance harness stopped. Claude task execution therefore cannot be claimed as verified.
- **NOT VERIFIED** — Antigravity; no supported real execution interface was used or verified.
- **SKIPPED** — Backend/frontend unit tests, integration tests, and independent code review in the A/B/C/D/E workflow. The tasks lacked a completed dependency chain, so no test pass or code review is claimed.

### Acceptance defects found and fixed

- `server/workflows.mjs` reset a task whose own status was `blocked` back to `pending`; it now preserves blocked state and only retries on explicit request.
- `incomplete` was missing from unsuccessful prerequisite states; it now blocks dependents.
- Scheduler dispatch lacked a durable exclusive claim and max-attempt guard; both are now persisted before provider startup.
- The Codex JSONL parser treated ordinary ripgrep no-match exit 1 as tool failure; it now recognizes ripgrep no-match semantics.
- Downstream worktrees previously lacked dependency outputs. Declared successful ancestor artifacts are now copied into the consumer's own isolated worktree with path, symlink, and conflict checks.
- Claude run persistence is now recorded in workflow task history from start through completion. The real Claude provider was unavailable during this acceptance, so Claude workflow success remains **BLOCKED**.

No commit, push, merge, or deployment was made. Main checkout changes and prior user modifications were preserved. Temporary repositories and run records are retained under the paths below.

## Final app-level workflow acceptance — 2026-11-11

The app ran in production mode against the real loopback HTTP workflow API, with a dedicated temporary Git repository at `C:\Users\LENOVO\AppData\Local\Temp\my-office-api-acceptance-lSZY5J\repo`. Workflow and Codex run records are retained in `C:\Users\LENOVO\AppData\Local\Temp\my-office-api-acceptance-lSZY5J\data`. Each task used its own worktree. No task committed or merged changes.

### Scenario A — A–E dependency workflow

- **PASS** — Workflow `a731ea82-2354-43f8-861b-3b6030bc4963` completed. Provider was `codex-cli` for all five tasks. A finished before B/C started; B and C overlapped; D started after both completed; E started after D completed. B/C source artifacts were copied into each downstream task's own worktree.
- **PASS** — A `97a35da8-9e52-4ac3-ac75-3fc834905896`; `2026-11-11T11:19:19.063Z`–`11:20:00.552Z`; exit `0`; worktree `C:\Users\LENOVO\AppData\Local\Temp\my-office-api-acceptance-lSZY5J\data\worktrees\21789971217e\3293fcda-3631-4f46-b885-0bdd7432277d`; created `SPEC.md` with API/frontend contract.
- **PASS** — B `f1913d5a-fee9-49c7-bda0-56d5d0a3bcef`; `2026-11-11T11:20:00.604Z`–`11:21:01.199Z`; exit `0`; worktree `C:\Users\LENOVO\AppData\Local\Temp\my-office-api-acceptance-lSZY5J\data\worktrees\21789971217e\582f0d84-c9e8-4b9e-9890-147398a1380b`; `node --test backend.test.mjs` passed 1/1.
- **PASS** — C `e19f3b68-be14-49dd-9f33-cf3669bf6e0f`; `2026-11-11T11:20:00.613Z`–`11:20:56.656Z`; exit `0`; worktree `C:\Users\LENOVO\AppData\Local\Temp\my-office-api-acceptance-lSZY5J\data\worktrees\21789971217e\02abbe1f-5cbe-424d-a0b7-c4b9d3994cb7`; `node --test frontend.test.mjs` passed 2/2. B/C started 9 ms apart and their provider intervals overlapped for 56 seconds.
- **PASS** — D `29f83d7f-6ae1-459a-bef9-4d60b2eb7efe`; `2026-11-11T11:21:01.234Z`–`11:21:56.726Z`; exit `0`; worktree `C:\Users\LENOVO\AppData\Local\Temp\my-office-api-acceptance-lSZY5J\data\worktrees\21789971217e\3c5df8a3-c57d-4812-b6ae-56ad3d28fc76`; integration command passed 4/4 tests, including a live HTTP request to the backend and frontend request/markup assertions.
- **PASS** — E `740f45e6-f3c4-4e7e-8696-3f2e75c287fd`; `2026-11-11T11:21:56.765Z`–`11:22:40.218Z`; exit `0`; worktree `C:\Users\LENOVO\AppData\Local\Temp\my-office-api-acceptance-lSZY5J\data\worktrees\21789971217e\3ef196d1-62b7-43c6-b8b3-dedfda7eab15`; independent review reran 4/4 tests and reported no contract defects. Browser rendering was not tested.
- **PASS** — Per-task workflow/run IDs, provider, process status, task status, timestamps, exit codes, output, and workspace paths were present in persisted workflow/Codex JSON. Main temporary repo remained the clean baseline; no shared-checkout files were modified.

### Scenario B — Failure injection and explicit retry

- **PASS** — Workflow `2390d579-3e3f-45c9-a5b3-1d91cd2c7d39`. A attempt 1 run `96dca6e2-614f-4f7a-bbf0-25ba8655883e` (`codex-cli`, `11:22:40.376Z`–`11:22:50.000Z`, exit `0`) intentionally omitted `gate.txt`; expected-artifact verification persisted task status `failed` and error `Expected artifact was not created or changed: gate.txt`. B stayed `blocked` with `blockedBy=[A]` and no run ID.
- **PASS** — Explicit API retry returned HTTP `200`. A attempt 2 run `4d425733-69ac-42c1-b8fc-b34649e73ee8` (`codex-cli`, `11:22:50.092Z`–`11:23:16.086Z`, exit `0`) created the gate. B then dispatched exactly once as run `d32413ce-1dee-4285-b3e2-9efb9aa3fc1c` (`codex-cli`, `11:23:16.130Z`–`11:23:34.108Z`, exit `0`) in its own worktree and verified `gate.txt` before creating `b.txt`.

### Scenario C — Actual server restart

- **PASS** — Workflow `1d95f827-f9ab-44ae-a17a-b4430fbb2852`, task R, run `91874683-d539-41b5-b432-8ebbf2823406` (`codex-cli`) was running with persisted worktree `C:\Users\LENOVO\AppData\Local\Temp\my-office-api-acceptance-lSZY5J\data\worktrees\21789971217e\dbcc8384-2eb2-44b6-9772-2cea74830508` and process ID `6564` when the My Office HTTP server was stopped and restarted. On startup, workflow task and Codex provider run were both classified `interrupted`; completed A–E and retry workflow history remained readable. Exit code is unavailable because the provider process was interrupted.
- **RISK** — The restarted Windows server logged two `EPERM` errors while atomically renaming an intermediate workflow snapshot. Subsequent persistence succeeded; the final `workflows.json` parsed successfully and contained all three workflows plus the interrupted run. Retry-on-rename was not added, so transient Windows file-lock failures need follow-up if reproduced outside this test.

### Scenario D — Provider availability and verification limits

- **BLOCKED** — Claude Code reported authenticated (`loggedIn: true`) but its real task `mwc0d6i8i1hr` failed with `ECONNREFUSED`, exit `1`, at `2026-11-11T11:00:53.949Z`–`11:03:54.745Z`; its worktree is retained at `C:\Users\LENOVO\AppData\Local\Temp\my-office-critical-acceptance-g3mNJQ\worktrees\f115bdb8ef7b\36e5a98a-76a3-43e5-a76d-267778ecc294`. D/E remained blocked in that probe. The successful mechanics run therefore used Codex only.
- **NOT VERIFIED** — Antigravity execution; no supported real execution interface was used. Browser rendering and screen-reader behavior were not tested; frontend behavior used Node-based tests.

## Run My Office

From the repository root:

```powershell
npm run dev
```

Open `http://localhost:4310/`. For production, run `npm run build` then `npm start` (on Windows, use `node server/index.mjs` with `NODE_ENV=production` if the shell does not support the package script’s environment assignment).
