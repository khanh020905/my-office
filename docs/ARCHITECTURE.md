# Architecture

My Office is two programs in one repository:

1. **A local server** (`server/`, plain Node.js ESM, no build step). Claude Code hooks POST every event to it; it keeps one
   record per open session, measures the Mac, and streams compact events to the page over Server-Sent Events. It also
   hosts Next.js, which renders the page.
2. **The office** (`app/`, `src/`). A Next.js App Router page whose markup is static React components; the 3D office and
   all its panels are driven by plain JavaScript modules in `src/office/`, written against three.js.

```
Claude Code ──hooks (curl, loopback only)──▶ server/index.mjs ──SSE /stream──▶ the page (src/office)
                                               │   ▲                               │
                    ~/.claude/sessions, transcripts   /api/* (sys, log, timeline, replay, todos, perm…)
```

## Server (`server/`)

| File | What it does |
| --- | --- |
| `index.mjs` | HTTP server: hook intake (`/event`, `/hook/*`), the live stream, the API, the phone PIN page; hands every page request to Next.js. Loopback-only for hooks, a host allow-list against DNS rebinding, a 6-digit PIN for phones. |
| `platform/` | The machine's readings, one module per system with the same functions: `darwin.mjs` (ps, top, vm_stat, lsof, the keychain), `linux.mjs` (/proc only, so it works in slim containers), `win32.mjs` (one PowerShell CIM reading shared for two seconds). |
| `system.mjs` | The Mac panel: memory, CPU, disk, dev servers, idle Claude sessions, cleanups; safe stops (a process is only signalled if its start time matches what you saw). |
| `usage.mjs` | Tokens and API-price equivalents read from transcripts. |
| `trophies.mjs` | All-time totals and milestones for the trophy cabinet (`data/totals.json`). |
| `redact.mjs` | Masks secrets in anything shown in the UI. |
| `git.mjs` | Git per session folder (branch, uncommitted files, commits and pushes by watching HEAD and the upstream) and the latest CI run through `gh`. |
| `wrapped.mjs` | The weekly recap: totals over the last seven replay logs. |
| `prefs.mjs` | The office's language (`data/prefs.json`, `OFFICE_LANG`) and the server's translator `tr()`. |

`bin/cli.mjs` installs the hooks (curl on macOS and Linux, `hooks/send.mjs` on Windows) and, through `bin/service.mjs`, the
background service: launchd, a systemd user service, or a script in the Windows Startup folder.

Runtime state lives in `data/` (git-ignored): the access token, phone PIN, replay logs (7 days), totals, caches.

## The page (`app/`, `src/components/`, `src/styles/`)

* `app/layout.tsx` loads the stylesheets (one per area of the screen, in cascade order) and the QR library.
* `app/page.tsx` composes the static markup: `TopBar`, `SessionRail`, `Stage` (with its overlays), `ActivityPanel`,
  the drawers, the phone modal, the toast, and `OfficeBoot`.
* `src/components/OfficeBoot.tsx` is the only client component: once the markup is on screen it dynamically imports
  `src/office/main.js` and calls `startOffice()`.

The markup components render once and never re-render: the office finds elements by `id` and fills them in. Moving a
panel to stateful React is welcome, one panel at a time (see CONTRIBUTING).

## The office (`src/office/`)

Every module exports what other modules use, and may export a `setup()` that does its work at start: building its part
of the scene, wiring its panel. `main.js` runs the `setup()`s in a fixed order — the scene first, then the furniture
and people, then the panels, the live connection, and last the render loop — so a module may use anything set up by a
module listed before it in `main.js`. Functions can call into later modules freely (they run after start-up).

Values that several modules assign (the clock `state.sim`, the selection `state.selectedId`, mode switches…) live on
the shared object in `core/state.js`; everything else is an ordinary import.

Things to know before changing the 3D:

* **Draw calls are the budget.** Static meshes are merged into one mesh per material at start (`core/optimize.js`);
  characters merge their joints' meshes (`people/chibi-rig.js`, `mergeRig`). Anything that moves, blinks or changes
  colour must be flagged `userData.noMerge` (or `dynamic`) or it will be frozen into the merge.
* **Never put a flat decal exactly on another surface**: it flickers when zooming. Keep a few millimetres in front, or
  give the material `polygonOffset`.
* **First-person collisions** come from the bounding boxes of meshes at start (`interact/first-person.js`). A merged
  mesh spread across the floor must be `userData.noCollide` and give its footprints instead (`floorBlocks`).
* **Frame budget**: 60 fps while something moves or you interact, 40 when calm, 10 in the background, 5 without a GPU
  (`core/loop.js`); on Retina screens the resolution steps down when frames come late.

## Languages (`src/i18n/`)

The office has one language at a time, picked in Settings and kept by the server, because the server writes some of
the words too (event labels, cleanup tips, trophy names). On each page request the server puts it in the
`x-office-lang` header; components read it with `getT()` (`src/i18n/server.ts`), the layout sets `<html lang>`, and the
engine's `tr()` reads that attribute. Changing the language broadcasts `{k:'lang'}` and every open page reloads.
`?lang=vi` shows one visit in another language. The dictionaries are plain JS objects, one folder per language and one
file per area; English is the reference and the fallback.

## The online demo

`OFFICE_STATIC=1 next build` exports the page as a static site that runs demo mode with no server
(`scripts/build-demo.mjs` builds every language, English at the root and the others under `/<lang>/`;
`.github/workflows/pages.yml` publishes it). In that build `getLang()` takes the language from the build, and the
engine switches to demo mode and talks to no API.

### Module map

| Module | Lines | What it is |
| --- | ---: | --- |
| `audio/sfx.js` | 60 | Sounds, synthesized in the browser. |
| `core/env.js` | 72 | Page-wide basics: DOM helpers, the floor plan choice, replay clock, office clock, season, formatting. |
| `core/loop.js` | 167 | The render loop and its frame budget. |
| `core/optimize.js` | 141 | Merging static meshes into fewer draw calls, then starting. |
| `core/state.js` | 3 | Values that more than one module assigns (the clock, the selection, mode switches…), on one shared object so any module can change them. |
| `demo/demo.js` | 224 | Demo mode: fictional projects and a fictional Mac. |
| `interact/first-person.js` | 238 | First person: walk the office as your own character, and (with the city outside) down the lift and out on the street: the pavements, the zebras (the traffic stops for you), the shops, the bánh mì cart. |
| `interact/place-cards.js` | 201 | Place cards: what happens at each place. |
| `interact/place-chips.js` | 182 | Place chips over the furniture and label decluttering. |
| `interact/props.js` | 267 | Furniture you can point at: highlight, tooltip, click actions. |
| `interact/rings.js` | 16 | Selection and hover rings on the floor. |
| `life/altar.js` | 171 | The Thần Tài – Thổ Địa altar in the lobby (company floor), and the offerings on the lunar 1st and 15th. |
| `life/incidents.js` | 81 | Incidents: repeated failures turn the office red. |
| `life/nap.js` | 61 | The midday nap, 12:30–13:30: blinds down, the room a little dimmer, everyone resting naps at their desk. |
| `life/quota.js` | 139 | Out of Claude: an account's plan limit used up, its people on a break until it resets. |
| `life/rain.js` | 77 | Umbrellas and a wet-floor sign when it rains. |
| `life/seasons.js` | 234 | Seasonal decorations: Halloween, Christmas, Tết. |
| `life/trophies.js` | 118 | The trophy cabinet and the opening plaque. |
| `life/weather.js` | 90 | Real weather outside (Open-Meteo). |
| `life/your-turn.js` | 37 | "Your turn": sessions that finished or wait for you. |
| `net/live.js` | 147 | The live connection: sessions, desks, teams, events. |
| `people/bedding.js` | 64 | Nap bedding: blanket, pillow, folding it away. |
| `people/breaks.js` | 64 | Lunch and the afternoon coffee queue. |
| `people/chibi-rig.js` | 628 | Office characters, two looks on one rig:   toy   (A) designer-toy chibi, ~2 heads: big round head, low wide-set bean eyes, stubby legs, chunky sneakers, matte vinyl. |
| `people/director.js` | 129 | The director: brings each prompt to its desk, receives reports. |
| `people/errands.js` | 283 | People reacting to what you do in the office: switch off the lamp someone is working by and they get up and switch it back on; print a page and someone fetches it; make a coffee and someone comes for it; the cat on a keyboard gets lifted down; a thirsty plant gets watered; click someone at work and they look up. |
| `people/gatherings.js` | 144 | Gatherings round the meeting table: the bell on it calls a quick meeting (everyone free comes, each says what they are on, the director wraps up), a new trophy brings a cake (everyone comes and claps), and a deploy gets a round of applause from the people sitting nearby. |
| `people/look.js` | 9 | Which character look (A / B) this viewer chose. |
| `people/navigation.js` | 240 | The walking graph, desk spots and stations people go to. |
| `people/outings.js` | 407 | Going out: before lunch a GrabFood rider brings the team's lunch to the kerb and whoever is resting goes down for it; now and then someone resting pops down to the convenience store across the street and comes back with a drink. |
| `people/staff.js` | 379 | People who work here but aren't sessions: the receptionist, the evening cleaner, a Shopee courier with a parcel. |
| `people/team-lines.js` | 28 | Dashed lines from a boss to its subagents. |
| `people/teatime.js` | 87 | Friday 16:00: afternoon tea. |
| `people/workers.js` | 515 | Workers: one character per session or subagent, what they do and where they walk. |
| `replay/replay.js` | 162 | Replay and recording. |
| `replay/timeline.js` | 193 | The timeline: one lane per session. |
| `scene/blocks.js` | 32 | Building blocks: materials, rounded boxes, cylinders, rugs, canvas textures. |
| `scene/lights.js` | 35 | Sun, sky light and the room lamps (per-room night lighting on the company floor). |
| `scene/quality.js` | 73 | Graphics quality: Auto (the default), Low, Medium or High, each viewer's own choice (Settings → Display). |
| `scene/renderer.js` | 91 | Renderer, cameras, orbit controls, post-processing and environment light. |
| `ui/activity.js` | 289 | The activity column and the session list. |
| `ui/camera-bar.js` | 47 | The camera toolbar. |
| `ui/event-text.js` | 114 | How events read on screen: actions per event type, verbs, bubble text, streamer mode. |
| `ui/icons.js` | 63 | Stroke icons (24 px grid) and the icon helper. |
| `ui/lite.js` | 47 | List mode: the sessions as cards, no 3D. |
| `ui/look-switch.js` | 19 | Switching the character look. |
| `ui/mac-drawer.js` | 239 | The Mac drawer: memory, CPU, dev servers, plan limits, cleanup. |
| `ui/permissions.js` | 158 | Approve / deny cards and Claude's questions. |
| `ui/photo.js` | 138 | Photo mode: the office alone over the whole window, the camera free (any angle, closer or further, pan with the right button), then a PNG at the screen's size, Full HD or 4K. |
| `ui/portraits.js` | 62 | Portraits of the two character looks for Settings → Characters: two people in each look, drawn by the office's own renderer (same materials, light and tone mapping, so they match what you will see) into a canvas, the first time the tab opens. |
| `ui/session-drawer.js` | 368 | The session drawer: chat, steps, subagents. |
| `ui/settings.js` | 121 | Settings popover: backdrop, floor plan, look, time, toggles. |
| `ui/timelapse.js` | 117 | A 15-second clip of the office to share: square (1080 × 1080), the camera turning slowly round the floor, people at four times their pace, the day running into the evening (a clock in the corner from 8:00 to 23:00, the lights coming on at six), a title at the start and the day's numbers over the last two and a half seconds. |
| `ui/tips.js` | 111 | The first visit: a short tour of what you can click. |
| `ui/topbar.js` | 60 | Phone modal, notifications, the night switch. |
| `ui/whiteboard.js` | 272 | The whiteboard: agents' tasks and your own sticky notes. |
| `ui/wrapped.js` | 107 | The week in review: a 1080 × 1350 picture card (the office as it looks right now, then the week's numbers) to save as a PNG or copy, for sharing. |
| `world/backdrops/beach.js` | 117 | Beach backdrop: sand, surf, palms, umbrellas and loungers. |
| `world/backdrops/city.js` | 276 | The city backdrop: street grid, buildings, rooftops, lamps and traffic. |
| `world/backdrops/countryside.js` | 186 | Countryside backdrop: rice paddies, dikes, a river, a bridge, a village. |
| `world/backdrops/index.js` | 49 | Choosing the backdrop: city, countryside or beach. |
| `world/backdrops/shared.js` | 82 | Pieces shared by the countryside and beach backdrops. |
| `world/backdrops/shops.js` | 257 | Shops near the office: the three street-facing ground floors nearest to it become shops, as in the city you picked for the weather. |
| `world/backdrops/street-corner.js` | 143 | … |
| `world/backdrops/street-folk.js` | 139 | People for the street's set pieces (the park's mornings and evenings, the chess game at the trà đá stall, a wedding): figures like the pavement's walkers, but whose arms and legs move on their own, standing or sitting on a seat. |
| `world/backdrops/street-life.js` | 1128 | Life on the city's streets: cars, taxis (Xanh SM's cyan VinFasts among them), SUVs, vans, buses and scooters (Grab and Xanh SM riders in their jackets, GrabFood with the green box) that keep their distance and stop at the lights, a bus that calls at the stop near the office, and people on the pavements who wait for the green and cross on the zebras (a few in conical hats; umbrellas when it rains). |
| `world/backdrops/street-lunar.js` | 84 | … |
| `world/backdrops/street-morning.js` | 103 | … |
| `world/backdrops/street-park.js` | 360 | … |
| `world/backdrops/street-repair.js` | 120 | … |
| `world/backdrops/street-riders.js` | 148 | … |
| `world/backdrops/street-shade.js` | 102 | … |
| `world/backdrops/street-signals.js` | 64 | … |
| `world/backdrops/street-siren.js` | 77 | … |
| `world/backdrops/street-spots.js` | 76 | … |
| `world/backdrops/street-wedding.js` | 254 | … |
| `world/backdrops/street-wires.js` | 76 | … |
| `world/cozy-room.js` | 54 | The cozy plan's room: floor and walls. |
| `world/desks.js` | 184 | Desks and office chairs, and each person's coat and backpack at their desk. |
| `world/entrance.js` | 113 | The cozy plan's door and the company floor's lift. |
| `world/furniture/board.js` | 25 | The whiteboard's frame (its drawing lives in ui/whiteboard.js). |
| `world/furniture/coffee.js` | 33 | The coffee corner (the pantry counter on the company floor). |
| `world/furniture/meeting.js` | 44 | The meeting table and its chairs. |
| `world/furniture/plants-lamps.js` | 33 | Room plants and floor lamps. |
| `world/furniture/rocket.js` | 22 | The deploy rocket on its launch pad. |
| `world/furniture/room-pieces.js` | 106 | Wall clock, framed art, bookshelf, sofa corner and the globe. |
| `world/furniture/server-racks.js` | 65 | Server racks with LEDs and fans that follow the Mac's CPU. |
| `world/layout.js` | 39 | The floor plans (cozy, pro, hq): where the shared furniture stands, and the headquarters wing. |
| `world/pro/floor.js` | 351 | The company floor: rooms, partitions and furniture. |
| `world/pro/pieces.js` | 142 | Company floor building pieces: floor finishes, walls, glass, chairs, dining sets. |
| `world/pro/wing.js` | 134 | Headquarters' wing: in front of the company floor, a corridor along it, a corridor down the middle and four department rooms of two pods each (the desks, pods' screens and carpets come from the shared code). |
| `world/props/aquarium.js` | 44 | The aquarium. |
| `world/props/arcade.js` | 62 | The arcade cabinet and its little game. |
| `world/props/bins.js` | 40 | Context waste bins beside each desk. |
| `world/props/cat.js` | 103 | The office cat. |
| `world/props/dev-servers.js` | 85 | Mini servers for each running dev server, and forgotten ones. |
| `world/props/neon.js` | 22 | The neon sign. |
| `world/props/printer.js` | 25 | The printer that prints a page when a session finishes. |
| `world/props/string-lights.js` | 29 | String lights along the top of the walls. |
| `world/props/switches.js` | 37 | The light switch by the door: on the company floor it puts out the open-plan floor's light (the one that follows its people after dark), in the cozy room the room's own lights. |
| `world/props/trinkets.js` | 69 | Desk trinkets and the seeded random used by props. |
| `world/props/tv.js` | 59 | The TV with live machine stats. |
| `world/props/update.js` | 40 | Per-frame updates for the props. |
| `world/props/vacuum.js` | 33 | The robot vacuum. |
| `world/room-update.js` | 176 | Room lights, particles, the rocket, the clock and day / night. |
| `world/screens.js` | 100 | What each desk's screens show: the editor while it edits, a terminal for commands, a browser for the web, code with the match highlighted while it reads or searches, a chat while it thinks, a permission dialog while it waits for you, a screensaver while it naps. |
| `world/terrace.js` | 114 | The terrace around the office: tiles, glass railing, bollards, planters, potted plants, seating. |
| `world/windows.js` | 96 | Windows on the outer walls and the views they show. |