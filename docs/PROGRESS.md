# AI Video Production Command Center — progress log

Resume from the last line marked **VERIFIED**.

## Phase 0 — baseline (2026-11-08) — VERIFIED

Repo: clone of https://github.com/khanh020905/my-office at `1df03ee` (v0.5.0). Node v22.18.0, `npm ci` clean.

| Check | Result |
|---|---|
| `npm test` (node --test, tests/unit) | 165 tests: 158 pass, 0 fail, 7 skipped (3 need sqlite3, 1 needs Swift, 3 need a live `claude` / inbox socket) |
| `npm run typecheck` (tsc --noEmit) | pass, 0 errors |
| `npm run lint` (eslint .) | pass, 0 warnings |
| e2e (playwright) | not run yet; needs a browser install and a running server |

### Reusable modules (extend these, don't duplicate them)

- **Event intake**: `server/index.mjs` `POST /event` → `onHook(p)` already maps every Claude Code hook (SessionStart/End, UserPromptSubmit, Pre/PostToolUse(+Failure), PermissionRequest, Notification, SubagentStart/Stop, Stop, StopFailure, PreCompact) to typed events built by `mk()`. Phase 1 adds a normalised view on top of these events, not a new hook or server.
- **Transport**: `broadcast()` → SSE `/stream` (snapshot + 20 s ping), `/api/live` long-poll backlog (400), replay files `data/replay/YYYY-MM-DD.jsonl` (kept 7 days).
- **Timeline**: `src/shared/timeline.js` `buildTimeline` + `/api/timeline`; page side `src/office/replay/timeline.js`.
- **Hook client**: `hooks/send.mjs` (never fails the hook; --async/--fast/--wait/--job).
- **3D**: `src/office/world/pro/wing.js` (4 department rooms × 2 pods), `people/workers.js`, `life/tests.js`; draw-call budget via `?debug`, `userData.noMerge` for moving parts.
- **Demo**: `src/office/demo/demo.js` (`?demo`). It is page-only and never goes through `broadcast`, so demo events stay out of replay history.
- **Safety**: `server/redact.mjs`, loopback checks (`isLoopback`), host allow-list, PIN, path validation.
- **i18n**: `src/i18n/locales/{en,vi}/<area>.js`, `tr()` / `t()`.

### Risks

1. `server/index.mjs` is ~3.5k lines, so new logic goes in separate modules (`server/production/*.mjs`) with a thin hook-in to keep merge conflicts with upstream small.
2. Video QA runs `py -3.14 tools/video_qa.py` from the xuongphim workspace. Spawning Python from the server must use a fixed argv (no shell), loopback only, and validated paths inside an allow-listed root.
3. No upstream concept of a "video project", Type A/B or a "stage", so these must come from real files or explicit events, never from guesses (spec: no fake progress).
4. Bundle and draw-call growth in the 3D scene.
5. The full spec (sections 1–18, acceptance criteria in section 17) has not been received in this session yet, so Phase 1+ is blocked on it.

## Phase 1 — normalised event and agent model — NOT STARTED
