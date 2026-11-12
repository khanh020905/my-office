# My Office integration checkpoint

Last updated: 2026-11-10 (Codex task-sheet/backend slice)

## Current phase

Phase 2B — **PARTIALLY IMPLEMENTED**. The Codex CLI slice remains verified. A Codex App hook/plugin path is now prepared in the repository, but no App hook has been installed or trusted and no GUI event has been verified in My Office.

## Last completed phase

Phase 1 — architecture investigation, approved by user. Repository: `D:\somehting code\my-office`.

## Verified capabilities

- Claude hooks POST event JSON to `/event`; `server/index.mjs` `onHook` updates session state, normalized event model, persisted feed, and SSE broadcast.
- `src/office/demo/demo.js` consumes SSE; `src/office/net/live.js` upserts sessions/workers; `src/office/people/workers.js` owns 3D workers.
- Codex account/usage/switching exists in `server/codex-accounts.mjs`; it is not session activity tracking.
- `codex-cli 0.167.0` `codex exec --json` prompt-only invocation emitted `thread.started` with `thread_id`, `turn.started`, `item.completed` agent messages, and `turn.completed` usage. Exit code 0. It did not emit `item.started`, task success field, or failure/error event in the successful run.
- A separate attempted file write under `--sandbox read-only` was blocked by policy. CLI exited 0 and emitted message items plus `turn.completed`; no structured tool/file/diff/approval event was observed.
- `codex app-server` is labelled experimental. Local generated protocol schema includes thread/turn/item/diff/command/approval/error shapes; external attachment to active Codex App GUI threads is not verified.
- Follow-up prompt-only `codex exec --json` run in a unique temp directory (CLI 0.167.0; `--ephemeral --ignore-user-config --sandbox read-only --skip-git-repo-check`) exited 0 and emitted `thread.started` (with `thread_id`), `turn.started`, `item.completed` (`agent_message`), and `turn.completed` (usage). It did not emit `item.started`, structured success/failure, or error event. Task output was a prompt-derived color list, so no tool was required.
- Separate requested file creation under the same read-only policy was rejected. CLI exited 0; stderr contained a policy rejection, output included the model's blocked-operation report, and JSONL contained `thread.started`, `turn.started`, `item.completed` messages, and `turn.completed`. It emitted no structured tool execution, approval, file change, or diff event. Do not infer success from turn completion or process exit code.
- The installed app-server generated protocol schema includes thread/turn/item notifications, `thread/resume`, `thread/read`, `thread/subscribe`, turn diffs, command execution item/output, approval, and error shapes. These are experimental protocol artifacts; no connection was made and no external GUI subscription was verified.
- The desktop GUI's active-thread attachment remains unverified. The experimental schema's subscribe/read methods do not prove the running App exposes a reachable endpoint or supports third-party subscription to its own active threads.
- Baseline on 2026-11-10: `npm test` 174 pass, 0 fail, 8 skipped (sqlite3-dependent); `npm run lint`, `npm run typecheck`, and `npm run build` exited 0. Playwright not run.
- Codex task dispatch was added to `src/office/ui/task-sheet.js`: Claude preserves `/api/tasks`; Codex CLI posts `{dir,text}` to `/api/codex/runs`; a visible note states it is separate from Codex App sessions. Choosing an existing conversation derives its project directory for Codex.
- Backend Codex run setup now uses only the runner's `onEvent` callback for live event adaptation; initial session creation happens once from the route response, avoiding duplicate status callbacks. Invalid project directories return HTTP 400.
- Codex `turn.started` maps to `agent.turn_started`, agent messages to `agent.message`, and process exit code 0 maps to `agent.execution_ended` with normalized state `unknown`; no task-success event is emitted. Nonzero process exit maps to failure; killed/timed out runs remain unknown in runner state.
- Focused verification `node --test tests/unit/codex-runs.test.mjs tests/unit/agent-events.test.mjs`: PASS, 9 tests.
- Full `npm test`: PASS, 185 total, 177 passed, 0 failed, 8 skipped.
- `npm run lint`: PASS, exit 0. `npm run typecheck`: PASS, exit 0. `npm run build`: PASS, exit 0.
- Playwright and actual browser-launched Codex task: NOT RUN in this pass; the 3D worker runtime path is supported by existing `applyMsg` -> `upsertSession` -> `addWorker` code but not yet proven with a live Codex run.

## Unverified assumptions

- Whether successful Codex CLI tool execution emits structured tool events in JSONL; this environment's read-only policy blocked execution and writes, so no repeated attempts are justified without a different safe observation route.
- Whether JSONL reports structured failures or reliably distinguishes blocked operations from successful tasks; observed blocked run had process exit 0, `turn.completed`, and a textual blocked message, but no structured failure event.
- Whether Codex App GUI supports an external, stable subscription to existing active threads.
- Whether app-server schema events are a supported/stable integration contract.
- Whether Ponytail can be invoked by any supported programmatic mechanism outside an assistant skill/command workflow.

## Files modified by My Office integration

None. The repository previously had an untracked `Microsoft/` directory; preserve it. This checkpoint/skill creation does not change application code.

## Tests and actual results

- `npm test`: PASS, 174 passed, 0 failed, 8 skipped.
- `npm run lint`: PASS, exit 0.
- `npm run typecheck`: PASS, exit 0.
- `npm run build`: PASS, exit 0.
- `npm run test:e2e`: NOT RUN.
- Codex event PoC: partial; details and exact sanitized samples are in the conversation report. Read-only shell and cleanup were policy-blocked.

## Outstanding issues and temporary resources

- Phase 2A is incomplete; verify tool events, failure semantics, GUI feasibility and safe cleanup before marking complete.
- The three named temporary resources were inspected: the first held only its PoC README; the second held generated protocol schemas from the previous command; the third was empty. Exact-path deletion commands were again rejected by policy, so all three may remain. Manual cleanup is listed in the latest progress report; target only these exact directories.
- No Codex App GUI integration; experimental app-server is not used.
- No Ponytail runtime integration.

## Next recommended action

Codex CLI runtime flow is now verified for prompt-only tasks. Before relying on file-reading tasks on this host, resolve the existing shell execution-policy block through an already approved read-only interface; do not weaken policy. Claude dispatch also remains unavailable here until the host exposes the existing Claude Code executable. Keep Codex App GUI tracking separate until a stable supported subscription contract is verified.

## Runtime verification — 2026-11-10

- Started My Office from this repository with `npm run dev` at `http://localhost:4310`; `GET /health` returned `ok`.
- Used Playwright against the real Task Sheet. Claude remained selected by default; selecting `Codex CLI` displayed the CLI-versus-App distinction and submitted to `POST /api/codex/runs`.
- Read-only README task created run `1df5c292-bc02-4f4c-a984-60ca6884f2e3`, Codex thread `01a1c3ab-26b3-77e1-b9ea-bf897cc004df`, and office session `094d6de8-afa7-4243-be15-36385be209c4`. Codex could not read `README.md` because its PowerShell read command was blocked by the current policy. The actual process exit was 0, but the run is `outcome-unverified`; no success was inferred.
- To capture the complete live stream without retrying the policy-blocked file access, submitted a second no-tool prompt through the same Task Sheet. Run `a3dcb4a1-0e34-48d9-82ea-a3c11aeff4c7`, thread `01a1c3ad-337b-7980-a117-bde007fd812f`, office session `e22d1fa2-a9c9-49ce-abc1-2c3ec877766b`; Codex returned `runtime event observed.` The CLI process exited 0; run status remained `outcome-unverified`.
- A Playwright EventSource tap captured the initial `snap`, live Codex `sess`, and live `ev` updates for `start`, `codexturn`, `codexmessage`, and `codexexit`, plus the terminal `sess` update. The emitted agent message was the Codex response text; no tool/file event was created. Snapshot feed also contained the first run's actual message and exit events.
- Opened the 3D office with its `?debug=1` diagnostic hook. Frontend state contained 3 Claude sessions and 2 independent Codex sessions. The worker map contained one worker for each session ID (5 total); both Codex worker roots were visible children of the Three.js `Scene`, each with 3 mesh children. Their tasks and final replies were in session state. Both ended with session status `rest` and outcome `unverified`, never `completed`. The browser screenshot showed the two Codex session cards alongside Claude sessions in the same 3D office.
- Selected a Codex row in the 3D activity rail; its worker name tag became visible and connected to the CSS2D scene overlay. The captured temporary screenshot was removed after inspection.
- Claude regression limitation: the Task Sheet still defaulted to Claude and posted to the unchanged `/api/tasks` route, but a harmless no-tool Claude task returned HTTP 409 `{code:"noClaude", message:"Claude Code isn’t on the Mac"}`. Existing Claude sessions/workers remained present; a live Claude task could not be verified because this host does not expose a usable Claude Code executable. No global configuration or credentials were changed.
- Formal Playwright smoke: `npx playwright test tests/e2e/office.spec.ts --grep "office starts in demo|hooks are accepted|English by default" --reporter=line` — PASS, 5 tests (three office layouts, hook acceptance, language selection). The first filter attempt using `--grep @smoke` selected no tests; the title expression above is the command that actually ran.
- Browser verification used Playwright directly. The repository Playwright test command was previously interrupted before completion and is not counted as passing. No application source files were changed in this runtime pass; only this checkpoint was updated. `Microsoft/` was not touched.
- Task Sheet offered only the pre-existing `xuongphim` project folder for this runtime task; the requested My Office folder was not among its project choices. The attempted README task therefore ran in that listed project and was blocked before reading. Remaining runtime limits: file inspection through Codex CLI is blocked by the host's current execution policy; Claude task dispatch is unavailable on this host; Codex App GUI tracking remains outside this CLI-only run path.

## Codex App hook integration — 2026-11-10

- Official Codex Hooks documentation confirms lifecycle hooks run in Codex desktop, including `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Stop`, and `Interrupt`. Plugin hooks require user review/trust in Settings > Hooks; they are not equivalent to `codex exec --json` or app-server.
- Added a repo-local plugin marketplace at `.agents/plugins/marketplace.json` and plugin under `plugins/my-office-codex-hooks/`. Its hook command sends only session ID, working directory, model, prompt (only for prompt-submit), tool name, event name, and session-end reason to loopback `127.0.0.1:4310/codex-app-event`. It excludes transcript path, tool arguments and tool outputs; hook failures fail open.
- Added `server/codex-app-events.mjs` to whitelist supported Codex App event payload fields. `server/index.mjs` now accepts the dedicated loopback route, creates provider `codex-app` sessions using a namespaced ID, updates existing session state/feed, and broadcasts through existing SSE. Existing session upsert/worker path can reuse these session snapshots. Turn stop/interruption/session end are reported as `unverified`, never task success.
- Added normalized Codex App event kinds in `src/shared/agent-events.js` and focused tests in `tests/unit/codex-app-events.test.mjs` and `tests/unit/agent-events.test.mjs`.
- Verification: `node --test tests/unit/codex-app-events.test.mjs tests/unit/agent-events.test.mjs` PASS (11 tests). `npm test` PASS (181 passed, 0 failed, 8 skipped; total 189). `npm run lint` PASS (exit 0). `npm run build` PASS (exit 0). A typecheck run launched concurrently with build first failed because `.next/types` was being regenerated; rerun after build completed: `npm run typecheck` PASS (exit 0).
- Not verified yet: plugin installation in Codex App, hook trust, a real Codex App hook event reaching the server, SSE, frontend and 3D worker. The app folder is now visible as the `my-office` project in Codex App. User must install the local plugin and review/trust its hook, then send a new prompt; earlier activity is not backfilled. The hook currently targets the default My Office port 4310.
- No global configuration was changed. `Microsoft/` remains untouched. No Playwright or real GUI-task test was run.

## Codex App live verification — 2026-11-10

- After the user approved trust, opened Codex App Settings > Hooks > My Office Codex Hooks. The installed plugin's eight lifecycle/activity hooks were shown enabled, with the `send.mjs` command registered; the hook details indicated `All projects`.
- Without sending another prompt or interrupting the currently running Codex task, checked the running My Office server (`GET /health` returned 200/`ok`) and its real `/api/live` snapshot. It contained a session with `agent: codex`, `provider: codex-app`, `status: work`, name `Codex · hooks 01a1c1`, and cwd `~\Documents\Codex\2026-11-10\hooks`.
- Opened the running My Office dashboard at `http://127.0.0.1:4310/`. The live UI showed the same Codex session in the working session list, Codex activity entries in the feed, and its worker in the existing 3D scene. Claude sessions/workers remained present alongside it.
- This is a real Codex App hook/session and 3D worker verification, distinct from `codex exec --json`. It does not prove the task's eventual success; the session was still `work` when observed. No new task was submitted and no existing Codex task was interrupted.
- No My Office application source was changed in this runtime verification. This section supersedes the earlier statement above that plugin trust and GUI events had not been verified. `Microsoft/`, global configuration, and credentials were not touched.

## Multi-agent orchestration implementation — 2026-11-11

- User explicitly requested implementation of Codex worktree isolation, terminal states, persistence/recovery, a persisted workflow scheduler/API, provider truthfulness, tests, and a report. Preserve the existing dirty tree listed in `docs/MY_OFFICE_IMPLEMENTATION_PROGRESS.md`.
- Installed CLI verification: `codex exec --help` for Codex CLI 0.167.0 lists `--sandbox workspace-write`, `--cd`, `--worktree`, `--json`, and `--ephemeral`. Avoid `danger-full-access` and do not disable approvals.
- Baseline repeated: `npm test` PASS (182 passed, 8 skipped, 0 failed), `npm run lint` PASS, `npm run typecheck` PASS. Previous same-tree build passed; repeat after edits.
- No Prisma/DB dependency exists. Use existing bounded, atomic JSON persistence in `DATA_DIR`; do not add another database or infrastructure dependency.
- Current implementation phase: Phase 1, Codex runner.
- Phase 1 is implemented with isolated worktrees, workspace-write sandbox, terminal states, redacted/bounded JSON persistence, interrupted-on-restart recovery, and dirty cleanup protection; mocked lifecycle plus real Git worktree tests pass. Real Codex write execution is still pending.
- Phase 2 is underway: JSON workflow persistence, DAG validation, max-two scheduler, retries/cancellation, provider dispatch, authenticated API and UI are integrated; focused suite passed 28 tests. Re-run API/server checks after updates.
- Next action: finish UI/API checks, run real Codex file-write/cancel/timeout tests in a temporary repository if available, then full suite/build and update the implementation report.
- Antigravity execution remains NOT VERIFIED; keep observation only.
