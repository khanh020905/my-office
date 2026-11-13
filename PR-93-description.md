## Summary

Brings the fork's `main` up to date with this repo (merged `origin/main` cleanly, no conflicts).

- **Production command center (phases 0-7):** normalised agent event model and `/api/production/agents`, departments board in the HQ wing, projects/stages/timeline from workspace files, video QA runner + findings API, analytics API (real metrics only), fixes for the QA POST gate and a PID-cycle hang.
- **Agents:** find Claude Code from a Windows npm install; show Antigravity's agent as a worker while it works; Codex file create/delete shown as distinct activity events.
- **Tools drawer and servers:** Tools drawer, Codex run/worktree/workflow servers, activity stats, `server/tools/*`, `server/orchestration/*`, vi i18n polish.
- **Group chat:** quick-reply buttons under Claude's newest answer when it ends in an A)/B) or 1./2. list.
- **Housekeeping:** `.gitignore` now ignores `/Microsoft/`, `/tmp/` and `*.bak-formal`.

## Test plan

- [x] `npm test` (325 pass, 0 fail)
- [x] `npm run typecheck`
- [x] `npm run lint`
- [ ] `npm run test:e2e` and `npm run smoke` not run for this PR

## Not included

Uncommitted local edits to `scripts/smoke.mjs`, `server/*`, `tests/unit/*` from other work.


🤖 Generated with [Claude Code](https://claude.com/claude-code)
