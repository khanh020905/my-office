# Contributing to My Office

Thanks for helping! This guide gets you from a fresh clone to a pull request.

## Set up

Requirements: Node.js 20.9 or newer, npm, and a browser with WebGL, on macOS, Linux or Windows. The machine panel's
readings live in `server/platform/` (one module per system, same functions); CI runs `npm run smoke` on all three.

```bash
git clone <your fork>
cd my-office
npm install
npm run dev          # http://localhost:4310 with Turbopack and hot reload
```

Open <http://localhost:4310/?demo> to see the office with fictional projects: you don't need Claude Code running.
`?layout=pro` or `?layout=cozy` picks the floor plan, `?at=12:10` pretends it is lunchtime, `?season=noel|tet|halloween`
shows a season's decorations, `?debug` exposes `window.__office` for poking around in the console.

To see your real sessions, connect Claude Code once: `node bin/cli.mjs install` (adds the hooks to
`~/.claude/settings.json`; `node bin/cli.mjs uninstall` removes them).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Server + Next.js dev mode (Turbopack, hot reload). Port `OFFICE_PORT` (default 4310). |
| `npm run build` | Production build of the page. |
| `npm start` | Production server (run `npm run build` first). |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript (the `.ts`/`.tsx` files; the JavaScript is not type-checked yet). |
| `npm test` | Unit tests (`node --test`, no dependencies). |
| `npm run test:e2e` | Playwright: the production build in demo mode, in a real browser. Run `npm run build` first. |

CI runs all of these on every pull request.

## Where things are

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first: it explains the server, the page, how the office modules start
up, and has a map of every module with one line about what it does.

Quick pointers:

* A piece of furniture or a room: `src/office/world/` (the company floor is `world/pro/`).
* What people do and where they walk: `src/office/people/` (`navigation.js` has the walking graph and stations).
* A panel or drawer: markup in `src/components/office/`, behaviour in `src/office/ui/`, styles in `src/styles/`.
* Something the server knows: `server/index.mjs` (hooks are in "hook events", the API at the bottom).

## Making a change

1. Keep the office smooth: check draw calls before and after (`?debug`, then `__office.renderer.info.render.calls` in
   the console). Static meshes merge automatically; moving ones need `userData.noMerge`.
2. Match the code around you: short functions, a comment that says *why* above anything surprising, the same naming.
3. Never write UI text into the code: add a key to `src/i18n/locales/en/<area>.js` and use `tr('area.key')` (engine,
   server) or `t('area.key')` (components). English is the reference; add the Vietnamese in `locales/vi/` too if you
   can, otherwise it falls back to English. See [Languages](#languages).
4. Never send anything off the machine without the user turning it on (the weather and translation calls are opt-in or
   can be switched off with `OFFICE_TRANSLATE=0`). Secrets shown in the UI go through `redact()`.
5. Add or update a test when you change behaviour: unit tests in `tests/unit/`, browser tests in `tests/e2e/`.
6. Run `npm run lint && npm run typecheck && npm test` before pushing.

## Languages

Every word on screen lives in `src/i18n/locales/<language>/`, one file per area of the app (`activity.js`,
`mac.js`, `places.js`…). `src/i18n/index.js` explains the format: `{name}` slots, `{ one, other }` plurals, arrays for
lines picked at random.

To add a language:

1. Copy `src/i18n/locales/en/` to `src/i18n/locales/<code>/` and translate the values (keep the keys).
2. Add it to `LANGS` in `src/i18n/index.js` with its own name and a locale for numbers and dates (`'de-DE'`).
3. Open `http://localhost:4310/?lang=<code>` to check it, including the demo (`&demo`) and the Wrapped card.

A key you leave out shows in English, so a partial translation is fine to send.

## Pull requests

* One topic per pull request, with a short description of what changes for the person using the office.
* Screenshots or a short clip for anything visual.
* Commit messages in English, in the imperative ("Add a coffee queue", "Fix the lift doors closing on people").

## Reporting bugs

Open an issue with what you did, what you expected, what happened, your OS and browser, and a screenshot if it is
visual. `node bin/cli.mjs doctor` prints the server's health; please include its output.

## Security

The server listens on `127.0.0.1` only unless started with `--lan`, accepts hooks from this machine only, and asks
phones for a PIN. If you find a way around any of that, please report it privately to the maintainers instead of
opening a public issue.
