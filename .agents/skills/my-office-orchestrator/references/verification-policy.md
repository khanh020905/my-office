# Verification policy

- Use only scripts actually listed in the repository `package.json`; inspect scripts before running.
- Record exact command, exit code, actual pass/fail/skip totals and relevant failure text. Do not summarize a started or timed-out command as passed.
- Establish/retain a baseline before implementation. After changes, run focused tests first, then lint/typecheck/build/e2e where practical.
- Distinguish baseline failures from introduced failures by comparing evidence. Fix failures caused by the current change when safe; never weaken assertions or alter tests just to pass.
- A successful process exit is not semantic proof that the requested operation succeeded. Inspect tool errors, structured results, filesystem effects, and event payloads.
- Runtime claims require runtime evidence. Mark unavailable GUI, rendering, SSE, or external integration checks NOT RUN/BLOCKED as appropriate.
- Store no sensitive payloads in logs/checkpoints. Sanitize example IDs and user content while preserving event shape.
