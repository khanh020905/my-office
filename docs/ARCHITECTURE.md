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
Claude Code ──OpenTelemetry (OTLP/HTTP JSON)──▶ /v1/metrics, /v1/logs ──▶ server/otel.mjs ──/api/burn──▶ "What eats your plan"
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
| `loops.mjs` | "Ngắt vòng lặp kẹt": a session going round in circles (the same call failing the same way N times, compaction after compaction, cost rising with nothing edited), from the hooks and the status line; the synchronous PreToolUse hook (`/hook/loop`) gets a deny, your hint or Stop back from it. |
| `otel.mjs` | "What eats your plan": an OpenTelemetry receiver for Claude Code's own cost and token counters and api_request events (OTLP/HTTP JSON at `/v1/metrics` and `/v1/logs`, loopback only). Delta and cumulative counters each counted once; a session is read from its counters, or from its events when it sent none; daily sums per session and attribution in `data/otel/`, 30 days. `src/shared/burn.js` sums them for `/api/burn` and the demo. |
| `otel-setup.mjs` | The telemetry block `install` adds to `~/.claude/settings.json` (only when there is none of yours, tagged so `uninstall` removes exactly it), and how to tell whose telemetry it is. |
| `tasks.mjs` | "Give work": a `claude -p` run on this Mac from the chat or a phone, carrying on a tagged conversation (`--resume --fork-session`) or new in a known folder; caps, photos, its answer back to the chat. |
| `bg-sessions.mjs` | Phone work as Claude Code background sessions: whether this Claude Code has them (`--help`), what `claude --bg` printed, a `claude agents --json` row as the card's state, and the settings each one gets (edits in place, `/hook/bind`, approvals and questions held until answered with `?long=1`). |
| `steer.mjs` | "Chen lời giữa chừng": a note into a working session through its inbox socket (the line it takes, whether it can take one now: permission mode and `crossSessionInbound`), else kept for when it is done. |
| `rewrite.mjs` | The chat's "✨ Viết lại cho rõ": a message for Claude rewritten as goal / context / done-when by `claude -p` on a small model, with no tools, one turn, no session saved and the hooks off; text only, one at a time, 20 an hour. The rest of the prompt helper is in the page (`src/shared/prompt-coach.js`). |
| `tenure.mjs` | Each project's working life (`data/tenure.json`): first and last session, on how many days, how many turns; which are due a farewell (Settings → More), which came back, which are still interns and which are ready to be made permanent. The first run reads, once, the dates and folders of Claude Code's transcripts (the projects already there). |
| `prefs.mjs` | The office's language (`data/prefs.json`, `OFFICE_LANG`) and the server's translator `tr()`. |

`bin/cli.mjs` installs the hooks (curl on macOS and Linux, `hooks/send.mjs` on Windows) and, through `bin/service.mjs`, the
background service: launchd, a systemd user service, or a script in the Windows Startup folder.

Runtime state lives in `data/` (git-ignored): the access token, phone PIN, replay logs (7 days), usage sums (`otel/`, 30 days), totals, each project's working life (`tenure.json`), caches.

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
| `audio/sfx.js` | 73 | Sounds, synthesized in the browser. |
| `core/env.js` | 72 | Page-wide basics: DOM helpers, the floor plan choice, replay clock, office clock, season, formatting. |
| `core/loop.js` | 229 | The render loop and its frame budget. |
| `core/optimize.js` | 141 | Merging static meshes into fewer draw calls, then starting. |
| `core/state.js` | 3 | Values that more than one module assigns (the clock, the selection, mode switches…), on one shared object so any module can change them. |
| `demo/demo.js` | 324 | Demo mode: fictional projects and a fictional Mac. |
| `interact/first-person.js` | 261 | First person: walk the office as your own character, and (with the city outside) down the lift and out on the street: the pavements, the zebras (the traffic stops for you), the shops, the bánh mì cart. |
| `interact/place-cards.js` | 201 | Place cards: what happens at each place. |
| `interact/place-chips.js` | 182 | Place chips over the furniture and label decluttering. |
| `interact/props.js` | 279 | Furniture you can point at: highlight, tooltip, click actions. |
| `interact/rings.js` | 16 | Selection and hover rings on the floor. |
| `life/altar.js` | 172 | The Thần Tài – Thổ Địa altar in the lobby (company floor), and the offerings on the lunar 1st and 15th. |
| `life/incidents.js` | 94 | Incidents: repeated failures turn the office red. |
| `life/nap.js` | 63 | The midday nap, 12:30–13:30: blinds down, the room a little dimmer, everyone resting naps at their desk. |
| `life/photostrips.js` | 135 | The release history on the whiteboard: each version tag sends four people to the photo booth across the street (people/photobooth.js) and the strip they bring back, four frames of silly poses with the version written under them, is pinned along the bottom of the board's right half. |
| `life/post.js` | 113 | The post box: every commit is a letter in it. |
| `life/quota.js` | 139 | Out of Claude: an account's plan limit used up, its people on a break until it resets. |
| `life/rain.js` | 77 | Umbrellas and a wet-floor sign when it rains. |
| `life/seasons.js` | 234 | Seasonal decorations: Halloween, Christmas, Tết. |
| `life/tests.js` | 116 | The test board: a screen on a stand in the server room (in the small office, on the wall by the racks) with a row for each session at a desk. |
| `life/trophies.js` | 119 | The trophy cabinet and the opening plaque. |
| `life/weather.js` | 90 | Real weather outside (Open-Meteo). |
| `life/your-turn.js` | 37 | "Your turn": sessions that finished or wait for you. |
| `net/live.js` | 151 | The live connection: sessions, desks, teams, events. |
| `people/accountant.js` | 255 | The accountant (company floor): her desk in the director's office, the day's API cost on her screen, the report to the director at 17:30, and a word with whoever spends the most when the plan's limit gets near. |
| `people/bedding.js` | 64 | Nap bedding: blanket, pillow, folding it away. |
| `people/billiards.js` | 484 | Pool in the lounge (company floor; the table: world/props/billiards.js). |
| `people/breaks.js` | 87 | Lunch and the afternoon coffee queue. |
| `people/chibi-rig.js` | 879 | Office characters, two looks on one rig:   toy   (A) designer-toy chibi, ~2 heads: big round head, low wide-set bean eyes, stubby legs, chunky sneakers, matte vinyl. |
| `people/comnha.js` | 195 | Cơm nhà: lunch brought from home, warmed at the pantry's two microwaves at noon (company floor; the corner: world/props/microwave.js; who brought some today, and what: src/shared/comnha.js). |
| `people/comtrua.js` | 171 | Lunch at the quán cơm bình dân across the street (world/backdrops/eat-com.js). |
| `people/director.js` | 129 | The director: brings each prompt to its desk, receives reports. |
| `people/errands.js` | 283 | People reacting to what you do in the office: switch off the lamp someone is working by and they get up and switch it back on; print a page and someone fetches it; make a coffee and someone comes for it; the cat on a keyboard gets lifted down; a thirsty plant gets watered; click someone at work and they look up. |
| `people/evswap.js` | 186 | A battery swap (world/backdrops/street-ev.js). |
| `people/farewell.js` | 380 | The farewell (tiệc chia tay): a project the office remembers that has had no session for a month (Settings → More: 14, 30, 60 or 90 days, or never; server/tenure.mjs keeps each project's working life and says which are due) gets a last afternoon. |
| `people/foosball.js` | 166 | Foosball in the lounge (the company floor): now and then two people who are resting play a game at the table (one asks, the other comes over), rods spinning, the ball rattling up and down the pitch, the goals counted out loud, the winner pleased with themselves. |
| `people/gaming.js` | 277 | Video games on the lounge TV (company floor). |
| `people/gatherings.js` | 155 | Gatherings round the meeting table: the bell on it calls a quick meeting (everyone free comes, each says what they are on, the director wraps up), a new trophy brings a cake (everyone comes and claps), and a deploy gets a round of applause from the people sitting nearby. |
| `people/guard.js` | 217 | The building's security guard (bảo vệ) at the office's street door, with the city outside. |
| `people/hr.js` | 362 | HR and the attendance terminal (company floor). |
| `people/interns.js` | 196 | Interns made permanent (thực tập sinh lên chính thức). |
| `people/karaoke-songs.js` | 51 | The karaoke box's songs (people/karaoke.js): words written for the office, nobody else's. |
| `people/karaoke.js` | 342 | Karaoke in the box on the dev floor (company floor; the booth: world/props/karaoke.js). |
| `people/look.js` | 9 | Which character look (A / B) this viewer chose. |
| `people/navigation.js` | 255 | The walking graph, desk spots and stations people go to. |
| `people/nhau.js` | 231 | An evening at the quán nhậu across the street (world/backdrops/street-nhau.js). |
| `people/outings.js` | 592 | Going out: before lunch a GrabFood rider brings the team's lunch to the kerb and whoever is resting goes down for it; now and then someone resting pops down to the convenience store across the street and comes back with what that chain is known for (Circle K's mì ly, GS25's tokbokki, 7-Eleven's onigiri…); late at night, whoever is still there goes down to the Circle K for a cup of noodles. |
| `people/payday.js` | 124 | Payday (the 5th, the 10th or the month's last day: world/backdrops/street-atm.js isPayday). |
| `people/photobooth.js` | 223 | A strip from the photo booth for every release (world/backdrops/street-photo.js; the release: a new version tag in a session's repository or a GitHub release, server/git.mjs). |
| `people/pickle.js` | 193 | Pickleball after work (world/backdrops/street-pickle.js). |
| `people/rounds.js` | 130 | The director's rounds (company floor): twice a day out of the corner office and round the desks. |
| `people/staff.js` | 383 | People who work here but aren't sessions: the receptionist, the evening cleaner, a Shopee courier with a parcel. |
| `people/team-lines.js` | 28 | Dashed lines from a boss to its subagents. |
| `people/teatime.js` | 89 | Friday 16:00: afternoon tea. |
| `people/workers.js` | 538 | Workers: one character per session or subagent, what they do and where they walk. |
| `replay/replay.js` | 162 | Replay and recording. |
| `replay/timeline.js` | 193 | The timeline: one lane per session. |
| `scene/blocks.js` | 32 | Building blocks: materials, rounded boxes, cylinders, rugs, canvas textures. |
| `scene/lights.js` | 35 | Sun, sky light and the room lamps (per-room night lighting on the company floor). |
| `scene/quality.js` | 77 | Graphics quality: Auto (the default), Low, Medium or High, each viewer's own choice (Settings → Display). |
| `scene/renderer.js` | 91 | Renderer, cameras, orbit controls, post-processing and environment light. |
| `ui/activity.js` | 301 | The activity column and the session list. |
| `ui/burn.js` | 212 | What eats your plan: where Claude Code's usage goes, by model, MCP server, skill, plugin, subagent, project and session. |
| `ui/cache-words.js` | 53 | How a session's prompt cache reads on screen ("Đồng hồ bộ nhớ đệm", src/shared/cache-clock.js; the cups on the desks are world/props/cups.js): the line under the session drawer's folder, the one under the chat's "Gửi tới" and in its list of conversations, list mode's cards, and the switch in Settings → More for the "about to go cold" notification. |
| `ui/camera-bar.js` | 58 | The camera toolbar. |
| `ui/chat-avatars.js` | 72 | Round photos for the group chat (group-chat-view.js): each person's own chibi, head and shoulders, drawn once by the office's renderer (the way Settings draws its portraits: same materials, light and tone mapping) and kept as a data URL. |
| `ui/clip-music.js` | 122 | The clip's music: an original lo-fi loop made right here, nothing borrowed (no samples, no files): a Rhodes-like FM electric piano on Fmaj9 – Em7 – Dm9 – G13, a round bass, a swung boom-bap kit, a soft pentatonic lead, vinyl crackle and a small Schroeder reverb. |
| `ui/event-text.js` | 125 | How events read on screen: actions per event type, verbs, bubble text, streamer mode. |
| `ui/group-chat-view.js` | 891 | The group chat's window (the conversation: group-chat.js), drawn after the Vietnamese messenger's group chat on a phone (its own web CSS and string table, and a 2026 screenshot of the app, for the colours, sizes and words): the blue gradient bar with the back chevron, the group's name and "👥 N thành viên", call, video and ☰; the pinned message under it; the conversation on a lavender-grey ground, gathered at the bottom like the app's, the others' white bubbles on the left (the name at the top inside the first of a run, the face beside it, the time inside the last), yours pale blue on the right with who has seen it; dark pills for the time lines, white ones for what the group does; "Tin nhắn mới" where you stopped reading; replies quoting what they answer; a recalled message's "Tin nhắn đã được thu hồi"; the ♡ on a bubble's corner and a small pill once someone reacts (hover a bubble for the six, a reply and, on yours, recall); polls and reminders as cards in the middle; "… đang soạn tin"; the input bar: stickers and emoji, "Tin nhắn", ••• (a poll, @ someone), the mic and a photo, or send once you type; writing to Claude, a prompt helper over it. |
| `ui/group-chat.js` | 196 | The company group chat, on the page (the window: group-chat-view.js; the people and what they say: src/shared/chat-engine.js). |
| `ui/icons.js` | 85 | Stroke icons (24 px grid) and the icon helper. |
| `ui/image-view.js` | 28 | Images in the feed: a session that read, wrote or edited an image gets a thumbnail on that line (activity.js), and a click opens it here, large, over the office (the server serves it by id: GET /api/image). |
| `ui/lite.js` | 49 | List mode: the sessions as cards, no 3D. |
| `ui/look-switch.js` | 19 | Switching the character look. |
| `ui/mac-drawer.js` | 675 | The Mac drawer: memory, CPU, dev servers, plan limits, cleanup. |
| `ui/notify.js` | 64 | Notifications on this phone (Web Push: server/push.mjs sends them, public/sw.js shows them): Claude's answers in the group chat and an approval waiting, even with the office closed and the phone locked. |
| `ui/permissions.js` | 149 | Approve / deny cards and Claude's questions. |
| `ui/phone.js` | 94 | The office on a phone: an app-like layout for small screens, upright or held sideways. |
| `ui/photo.js` | 138 | Photo mode: the office alone over the whole window, the camera free (any angle, closer or further, pan with the right button), then a PNG at the screen's size, Full HD or 4K. |
| `ui/portraits.js` | 62 | Portraits of the two character looks for Settings → Characters: two people in each look, drawn by the office's own renderer (same materials, light and tone mapping, so they match what you will see) into a canvas, the first time the tab opens. |
| `ui/session-account.js` | 54 | "Change account" in a session's drawer (on this computer only): the accounts of the plan card, each with what it has left. |
| `ui/session-drawer.js` | 384 | The session drawer: chat, steps, subagents. |
| `ui/settings.js` | 123 | Settings popover: backdrop, floor plan, look, time, toggles. |
| `ui/stranded.js` | 159 | "Việc bỏ quên" in the Mac drawer: the worktrees and checkouts of the repositories the office knows that still hold work (files not committed, commits not pushed, stashes), and worktrees with nothing left in them that could go. |
| `ui/stuck.js` | 97 | Stuck sessions ("Ngắt vòng lặp kẹt", server/loops.mjs): the card in the group chat (what repeats, Stop, a hint for Claude) and the row in Settings → More (on or off, after how many failures, after how many minutes of spending with nothing edited). |
| `ui/task-sheet.js` | 98 | "Giao việc": giving Claude work from the group chat (server/tasks.mjs runs it on the Mac). |
| `ui/timelapse.js` | 156 | A 15-second clip of the office to share: square (1080 × 1080) for a feed or vertical (1080 × 1920) for Reels, TikTok and Shorts, the camera turning slowly round the floor, people at four times their pace, the day running into the evening (a clock in the corner from 8:00 to 23:00, the lights coming on at six), a title at the start and the day's numbers over the last two and a half seconds, with an original lo-fi tune under it (clip-music.js; it can be turned off). |
| `ui/tips.js` | 115 | The first visit: a short tour of what you can click. |
| `ui/topbar.js` | 232 | Phone modal, notifications, the night switch. |
| `ui/whiteboard.js` | 282 | The whiteboard: agents' tasks and your own sticky notes. |
| `ui/wrapped.js` | 107 | The week in review: a 1080 × 1350 picture card (the office as it looks right now, then the week's numbers) to save as a PNG or copy, for sharing. |
| `world/backdrops/beach.js` | 117 | Beach backdrop: sand, surf, palms, umbrellas and loungers. |
| `world/backdrops/city.js` | 306 | The city backdrop: street grid, buildings, rooftops, lamps and traffic. |
| `world/backdrops/countryside.js` | 186 | Countryside backdrop: rice paddies, dikes, a river, a bridge, a village. |
| `world/backdrops/eat-com.js` | 304 | … |
| `world/backdrops/index.js` | 49 | Choosing the backdrop: city, countryside or beach. |
| `world/backdrops/shared.js` | 82 | Pieces shared by the countryside and beach backdrops. |
| `world/backdrops/shop-dmx.js` | 379 | Điện Máy Xanh (dienmayxanh.com), the appliance chain of the Thế Giới Di Động group, as its shops look in Vietnam in 2026: the long sky-blue sign with the mark in a yellow circle (a runner made of slanted squares, a round head) and "Điện máy" then "XANH" in yellow, leaning forward, the second word heavy capitals; posters on the glass (máy lạnh for the hot season, trả góp 0%); inside, the TV wall at the back with the screens lit, front-loading washing machines on an island, a row of fridges, split air conditioners along the wall with yellow price cards, stand fans turning by the window, rice cookers and air fryers on a table, two massage chairs someone is always trying, and the till in blue and yellow; staff in blue; open 8:00–22:00. |
| `world/backdrops/shop-highlands.js` | 285 | Highlands Coffee, as its street-front shops look in Vietnam in 2026: the deep red ("đỏ đô") sign with the name in white raised letters and the emblem beside it (the 2022 one: an oval, like a coffee bean, with its mountain, river and plain), warm wood inside with red set on the counters and a wall, the black and red of the staff; the order counter with the espresso machine, the phin filters and a case of cakes; the menu board over it at the official prices (Phin Sữa Đá 29.000đ, Freeze Trà Xanh 55.000đ, Trà Sen Vàng and Phindi Hạnh Nhân 45.000đ); wooden tables and a bar along the window, a table on the pavement; open 7:00–23:00. |
| `world/backdrops/shop-katinat.js` | 269 | Katinat (KATINAT Coffee & Tea House: the Saigon Kafé of 2016, named after rue Catinat, today's Đồng Khởi), as its shops look in 2026: the navy sign with KATINAT in warm-lit raised letters the colour of milk coffee (the brand's #BF9369), heavy narrow capitals whose foot bows (the outer letters longer), COFFEE & TEA HOUSE spaced out under them; glass all along the front, plants by the door; inside, navy and warm wood, globe lamps hung low, the counter with its row of layered cups (the "rainbow cup" that made the name), the menu lightbox at the official prices (Trà Sữa Oolong Nướng 42.000đ, Oolong Nướng Huyền Châu 55.000đ, Bơ Già Dừa Non 55.000đ, size S), and the navy wall with the name on it that everyone takes their picture against. |
| `world/backdrops/shop-longchau.js` | 222 | Nhà thuốc FPT Long Châu (FPT Retail's pharmacies: 2,700 of them in all 34 provinces), as its shops look in 2026: the long blue sign (blue aluminium, unlit white letters) with the logo as its file has it: FPT's three slanted tiles in their own blue, orange and green (#034EA2, #F37021, #51B848), "FPT Retail" under them, and NHÀ THUỐC over LONG CHÂU in heavy white capitals; the GPP plate by the door, the posters for buying online with home delivery and the app ("Long Châu – Chuyên gia thuốc"), the free hotline 1800 6928; inside, bright and white, shelves of medicines behind the long counter (the prescription ones, as GPP wants them, out of reach), supplements and skin care along the wall, a bench to wait on; the pharmacists in white coats over blue; open 6:00–22:00, as most of them. |
| `world/backdrops/shop-mixue.js` | 263 | Mixue (Mixue Ice Cream & Tea), as its shops look in Vietnam in 2026: a red front (about #E50914) with "MIXUE" in white letters lit from inside and standing off the board on black sides, "Since 1997" and "Ice Cream & Tea" beside it, the Snow King holding a cone; a round snowman light box out on a bracket; the "I LOVE YOU ♥ YOU LOVE ME" sign; an order counter facing the street with the soft-serve machine on it, the tea brewers and the cup sealer behind, the menu's light boxes across the back wall (the prices of the Đà Nẵng AEON store's June 2026 menu: the 10.000đ cone, the 25.000đ sundae and milk tea…), white tables and low brown stools; staff in black T-shirts; open 9:00–22:00; the Snow King's statue by the door, and on weekend evenings the Snow King himself dancing out front to the tune. |
| `world/backdrops/shop-paint.js` | 37 | A shop seen from across the street, painted: for the fronts too far from the office to be rooms you walk into (shops.js keeps the nearest few as rooms, the rest as their sign and a picture of the inside behind the glass). |
| `world/backdrops/shop-phuclong.js` | 274 | Phúc Long Coffee & Tea (a tea house from Bảo Lộc's hills, since 1968), as its street shops look in 2026: the deep green sign (the brand's #006F3C) with its crest in white (the domed badge, a cup with a tea leaf over it: the leaf of the 2025 "Ủ Vị Tâm Giao" identity, the band across, SINCE 1968 under it) and PHÚC LONG in heavy white capitals, COFFEE & TEA spaced out under them; inside, wood and green, the wall of tea tins and packets (it still sells its teas by the packet), the counter with its menu at the official prices (Trà Sữa Phúc Long and Hồng Trà Sữa 55.000đ, Trà Đào 60.000đ, size M), a long table for groups; staff in black with the dark green apron; open 7:00–22:30, as most of its street shops. |
| `world/backdrops/shop-tgdd.js` | 277 | Thế Giới Di Động (thegioididong.com), as its shops look in Vietnam in 2026: the long yellow sign with the name in black, all lower case and leaning forward a little, and the mark beside it (a figure on the move in a circle: "the world" and "on the move"), yellow and black the chain's two colours; the glass front with the promotions on it (trả góp 0%, thu cũ đổi mới); inside, long white tables of phones on their stands with yellow price tags, the wall of accessories, the till in black and yellow at the back; staff in yellow shirts and black trousers; open 8:00–22:00. |
| `world/backdrops/shops.js` | 939 | Shops near the office: the long street fronts nearest to it (one to a building) become shops, as in the city you picked for the weather. |
| `world/backdrops/street-atm.js` | 234 | … |
| `world/backdrops/street-corner.js` | 143 | … |
| `world/backdrops/street-csgt.js` | 738 | … |
| `world/backdrops/street-ev.js` | 287 | Electric scooters and the battery-swap cabinet on the corner (city backdrop). |
| `world/backdrops/street-folk.js` | 154 | People for the street's set pieces (the park's mornings and evenings, the chess game at the trà đá stall, a wedding): figures like the pavement's walkers, but whose arms and legs move on their own, standing or sitting on a seat. |
| `world/backdrops/street-life.js` | 1187 | Life on the city's streets: cars, taxis (Xanh SM's cyan VinFasts among them), SUVs, vans, buses and scooters (Grab and Xanh SM riders in their jackets, GrabFood with the green box) that keep their distance and stop at the lights, a bus that calls at the stop near the office, and people on the pavements who wait for the green and cross on the zebras (a few in conical hats; umbrellas when it rains). |
| `world/backdrops/street-lunar.js` | 84 | … |
| `world/backdrops/street-morning.js` | 103 | … |
| `world/backdrops/street-nhau.js` | 272 | … |
| `world/backdrops/street-park.js` | 360 | … |
| `world/backdrops/street-photo.js` | 213 | A Korean-style self photo studio across the street (city backdrop), the kind that opened on every busy street in Vietnam's cities in 2024–2026: a pink container on a park's edge, "Chụp ảnh Hàn Quốc" in pink neon over the glass, and inside two booths behind their curtains (pink and black; the feet of whoever is in there show under them), each with its camera and screen and a ring light, the props table by the door (a basket of cat-ear and bunny-ear headbands, giant heart sunglasses, party hats and bucket hats), a mirror, the printer and a wall of sample strips; the price board out on the pavement (a 4-frame strip 70k, the big 6-frame one 100k). |
| `world/backdrops/street-pickle.js` | 480 | A pickleball court by a park near the office (city backdrop), as they have sprung up all over Vietnam's cities since 2024: one outdoor court, the real size (20 × 44 ft: 6.10 × 13.41 m), laid lengthways across the park's edge and the old lane of a street no traffic uses any more; the blue acrylic court on green, its white lines 2 in wide (the non-volley zone, the "kitchen", 7 ft either side of the net; the centre lines from it to the baselines), the net 34 in high in the middle and 36 in at the posts (22 ft long, the posts a foot outside the sidelines), a chain-link fence round it with dark green windscreens at the ends, four poles of LED floodlights for the evening, the board at the gate ("Sân pickleball · 200.000–300.000đ/giờ sau 17h"), two benches with water bottles, bags, spare paddles and a bucket of balls (the perforated yellow ones). |
| `world/backdrops/street-repair.js` | 120 | … |
| `world/backdrops/street-riders.js` | 148 | … |
| `world/backdrops/street-shade.js` | 102 | … |
| `world/backdrops/street-signals.js` | 64 | … |
| `world/backdrops/street-siren.js` | 77 | … |
| `world/backdrops/street-spots.js` | 76 | … |
| `world/backdrops/street-wedding.js` | 254 | … |
| `world/backdrops/street-wires.js` | 76 | … |
| `world/cozy-room.js` | 54 | The cozy plan's room: floor and walls. |
| `world/desks.js` | 183 | Desks and office chairs, and each person's coat and backpack at their desk. |
| `world/entrance.js` | 113 | The cozy plan's door and the company floor's lift. |
| `world/furniture/board.js` | 25 | The whiteboard's frame (its drawing lives in ui/whiteboard.js). |
| `world/furniture/coffee.js` | 33 | The coffee corner (the pantry counter on the company floor). |
| `world/furniture/meeting.js` | 44 | The meeting table and its chairs. |
| `world/furniture/plants-lamps.js` | 33 | Room plants and floor lamps. |
| `world/furniture/rocket.js` | 22 | The deploy rocket on its launch pad. |
| `world/furniture/room-pieces.js` | 107 | Wall clock, framed art, bookshelf, sofa corner and the globe. |
| `world/furniture/server-racks.js` | 65 | Server racks with LEDs and fans that follow the Mac's CPU. |
| `world/layout.js` | 43 | The floor plans (cozy, pro, hq): where the shared furniture stands, and the headquarters wing. |
| `world/pro/floor.js` | 341 | The company floor: rooms, partitions and furniture. |
| `world/pro/pieces.js` | 142 | Company floor building pieces: floor finishes, walls, glass, chairs, dining sets. |
| `world/pro/wing.js` | 134 | Headquarters' wing: in front of the company floor, a corridor along it, a corridor down the middle and four department rooms of two pods each (the desks, pods' screens and carpets come from the shared code). |
| `world/props/aquarium.js` | 44 | The aquarium. |
| `world/props/arcade.js` | 62 | The arcade cabinet and its little game. |
| `world/props/billiards.js` | 124 | The pool table (company floor), on the lounge's right side between the sofa and the arcade: a 7-foot table (green cloth with its spots, cushions, walnut rails inlaid with pearl diamonds, six leather pockets, turned legs), a rug under it, chalk on the rail, and a round cue stand by the arcade. |
| `world/props/bins.js` | 41 | Context waste bins beside each desk. |
| `world/props/cat.js` | 103 | The office cat. |
| `world/props/cups.js` | 103 | A cup of coffee on each resting desk ("Đồng hồ bộ nhớ đệm"): its steam fades as the session's prompt cache cools (src/shared/cache-clock.js) and is gone once the cache is cold, when writing to the session again means it reads the whole conversation back. |
| `world/props/dev-servers.js` | 85 | Mini servers for each running dev server, and forgotten ones. |
| `world/props/game-tv.js` | 94 | The lounge TV (company floor): a 55" TV on a low walnut media unit against the back wall, facing the sofa, with a games console standing beside it, two controllers lying on top, a soundbar, a plant, and a glow on the wall behind it that takes the colour of the picture. |
| `world/props/karaoke.js` | 109 | The karaoke box (company floor), where the front phone booth was, like the coin-op booths in Vietnamese malls: a soundproof cabin on a dark base, black frame, purple acoustic felt at the back and on the side toward the phone booth, glass toward the room so you can watch the singers, a lit KARAOKE band over the glass and over the door, an LED strip round the roof and the base. |
| `world/props/microwave.js` | 231 | The pantry's microwave corner (company floor): two microwaves side by side on a low cabinet against the library's wall, where everyone who brought lunch from home warms it at noon (people/comnha.js). |
| `world/props/neon.js` | 22 | The neon sign. |
| `world/props/printer.js` | 25 | The printer that prints a page when a session finishes. |
| `world/props/shredder.js` | 178 | Paper by context: an in-tray on every desk whose stack grows with its session's context window (loose sheets and a red flag past 85 %), and a paper shredder by the printer. |
| `world/props/string-lights.js` | 29 | String lights along the top of the walls. |
| `world/props/switches.js` | 37 | The light switch by the door: on the company floor it puts out the open-plan floor's light (the one that follows its people after dark), in the cozy room the room's own lights. |
| `world/props/trinkets.js` | 69 | Desk trinkets and the seeded random used by props. |
| `world/props/tv-games.js` | 951 | Video games on the lounge TV (world/props/game-tv.js; people/gaming.js plays them): football, a split-screen racer and a rooftop fighter, drawn as pixel art on a small 2D canvas and played by two players: people resting in the office, a computer player (game.ai) or you in first person. |
| `world/props/tv.js` | 59 | The TV with live machine stats. |
| `world/props/update.js` | 44 | Per-frame updates for the props. |
| `world/props/vacuum.js` | 33 | The robot vacuum. |
| `world/room-update.js` | 176 | Room lights, particles, the rocket, the clock and day / night. |
| `world/screens.js` | 100 | What each desk's screens show: the editor while it edits, a terminal for commands, a browser for the web, code with the match highlighted while it reads or searches, a chat while it thinks, a permission dialog while it waits for you, a screensaver while it naps. |
| `world/terrace.js` | 114 | The terrace around the office: tiles, glass railing, bollards, planters, potted plants, seating. |
| `world/windows.js` | 96 | Windows on the outer walls and the views they show. |