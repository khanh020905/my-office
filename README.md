# My Office

English · [Tiếng Việt](README.vi.md)

A 3D office where your Claude Code sessions come to work. Each session is a character at a desk:

- it walks to the library to read files;
- it types at its desk while it edits;
- it goes to the server room to run commands;
- it launches a rocket when you deploy.

The office also looks after your Mac: RAM per session, forgotten dev servers, one-click cleanup.

![My Office: the company floor with sessions at work](docs/media/demo.gif)

**Try it before you install anything.** The demo has made-up projects and needs no Claude Code: run `npm run dev` and
open <http://localhost:4310/?demo>. Or try it online, nothing to install: <https://khanh020905.github.io/my-office/>
(a static build of the same demo, published by `.github/workflows/pages.yml`).

> My Office is a community project. It is not made by, endorsed by or affiliated with Anthropic.

## Quick start

You need Node.js 20.9 or newer and Claude Code, on macOS, Linux or Windows. The machine panel (RAM, CPU, disk, dev
servers, cleanup) reads each system its own way; opening a session's IDE window and quitting apps are macOS only.

```bash
git clone https://github.com/khanh020905/my-office.git && cd my-office
npm install
node bin/cli.mjs install --service   # adds the hooks to ~/.claude/settings.json and runs the office at login
node bin/cli.mjs doctor              # checks Node, the server, every hook and the background service
```

Then open <http://localhost:4310>.

- `install` backs up `settings.json` before changing it and only adds My Office's own hooks. Running it again adds
  nothing twice.
- To remove everything: `node bin/cli.mjs uninstall`.

| Command | What it does |
| --- | --- |
| `install [--service] [--lan] [--no-approve] [--no-status]` | Adds three kinds of hooks: event hooks, approval hooks, and a status line that reports your plan's usage. Your own status line keeps running inside it. `--service` runs the office in the background from login: launchd on macOS, a systemd user service on Linux, the Startup folder on Windows (no admin needed). `--lan` lets a phone on the same Wi-Fi watch. `--no-approve` leaves out the approval hooks. `--no-status` leaves your status line alone. |
| `uninstall` | Removes every My Office hook and the background service, and keeps the rest of `settings.json`. |
| `doctor` | Checks each step and says what is missing and how to fix it. |
| `start [--lan]` | Runs the server in this terminal (no launchd). |
| `pin [--new]` | Shows the phone PIN; `--new` changes it and signs every phone out. |

- Restart after changing the code: `launchctl kickstart -k gui/$(id -u)/com.my-office` (macOS) or
  `systemctl --user restart my-office` (Linux). `node bin/cli.mjs doctor` prints the right command for your system.
- Logs: `tail -f data/server.log`.

## What's inside

### The office

- **Three floor plans** (Settings → Office):
  - **Cozy** is one open room.
  - **Company** is a whole 22 × 17 m floor: the director's office, a glass meeting room, a library, a server room, a
    lobby, restrooms, a dining room and a lounge. Desks are grouped in pods by project folder.
  - **Headquarters** adds a wing of four department rooms (44 desks in all). Each room's door plaque shows the project
    working there.
- **You are the director.** Every prompt you send is carried to the right desk. When the work is done, the person
  reports back to your office before taking a break.
- **Subagents** come in through the door and get their brief from their boss. They work where their task belongs,
  report back, and leave.
- **Resting sessions** lean back with a pillow and a blanket after a while. Click a sleeping one and it tells you what
  it finished.
- **People react to you**:
  - switch off a lamp after dark and whoever works next to it complains, walks over and switches it back on (do it
    again and they get crosser; the fourth time they give up);
  - the light switch by the door puts out the whole floor: everyone says so, and the nearest goes to switch it back on;
  - print a page or make a coffee and someone comes for it;
  - pet the cat and it goes to sit on someone's keyboard, who lifts it down;
  - click someone at work and they look up for a second;
  - ring the bell on the meeting table: everyone free comes in, each says what they are working on, and the director
    sends them back;
  - a new trophy brings a cake to the meeting table and a round of applause; a deploy gets applause from the desks
    nearby;
  - plants dry out after a few hours and droop; click a thirsty one and someone waters it.
- **Late at night**, sessions that have been resting for half an hour put their coats on and go home by the lift. They
  come back as soon as there is work, or in the morning. With the city outside they go by the street, each their own way:
  their own scooter from the row parked on the pavement in front of the building, a GrabBike or Xanh SM bike (on the
  back), or a Xanh SM taxi. The session list says where anyone out is ("In Circle K", "Heading home (GrabBike)").
- **Out of Claude**: when an account's plan limit (the 5 hours or the week) is used up, the people on that account leave
  their desks for a break: a tea at the pantry tables, a book, a chat. A board on the wall counts down to when it can be
  used again; when it resets the bell rings and they go back to their desks. Anyone whose session is still working keeps
  working. (`?limitout=30` shows it for half an hour.)
- **The week's rhythm**: Monday 9:00 the bell rings for the stand-up by itself and everyone free goes round the meeting
  table saying what they're on; Friday 16:00 there's milk tea and bánh tráng trộn in the pantry for whoever is resting.
- **Staff who aren't sessions**: on the company floor a receptionist sits at the lobby reception from 7:45 to 18:15,
  greeting whoever comes out of the lift and seeing them off in the evening. Twice a day a Shopee courier comes up with a parcel for someone resting: he leaves it on the counter, the
  receptionist calls out the name, and they come for it, carry it back to the desk and open it (in the small office he
  calls from the door). At 18:30 the cleaner comes with her trolley, mops the aisles one by one behind a yellow "wet
  floor" sign (the floor shines until it dries, and people walk round it), empties the big bin and goes home.
- **Project areas**: each project (its git repository) has its own desks: on the company floor half a pod (the two
  desks facing each other), with a carpet in the project's colour and its team chip; a project with more sessions takes
  the other half too. The office remembers where each project sat, so its sessions come back to the same desks; only
  when every area is taken do projects share. In the small office, a row each.
- **The Thần Tài – Thổ Địa altar** (company floor): a red-lacquered shrine on the floor by the reception, facing the
  lobby: Ông Địa and Thần Tài inside, the couplet on its pillars, an incense bowl, red altar lamps lit after dark. On the
  lunar 1st and 15th (the real lunar calendar) the receptionist sets out five fruits on a footed dish, xôi gấc and
  yellow chrysanthemums, lights three sticks of incense and bows; the smoke rises for most of an hour (`?lunar=1` to see
  it any day).
- **The midday nap**, 12:30–13:30: the blinds come down, the room dims a little, and whoever has nothing running naps
  at their desk, half leaning back under a blanket, half head down on the desk. An alarm at 13:30, and the blinds go up.
- **The look of the place**:
  - two character looks (A · Toy, B · Pixar);
  - three backdrops (city, countryside, beach);
  - a living city: cars shaped like the ones Vietnam drives (VinFast VF3 and VF8, Toyota Vios and Fortuner, Honda City,
    Kia Morning, Ford Ranger, Mitsubishi Xpander, mostly from Kenney's Car Kit), Xanh SM's cyan electric taxis, buses and
    scooters, all stopping at the traffic lights. Grab and
    Xanh SM drivers wear the company's jacket and helmet with its logo on the back, the chest and the helmet; most carry
    a passenger in the company's helmet; GrabFood drivers carry the green box; many riders wear a face mask; people who wait for the green and
    cross on the zebras (umbrellas when it rains), and the shops of the city picked for the weather: GS25, Circle K and
    7-Eleven in Ho Chi Minh City, Circle K, GS25 and WinMart+ in Hanoi, WinMart+ with mì Quảng and seafood in Đà Nẵng.
    The streets follow the office clock: in the morning and evening rush twice the scooters, riding three abreast and
    crawling; empty streets in the small hours. Cars pull in to the kerb in front of the shops and along the park,
    indicating, and pull out again later; taxis stop for a fare with their hazard lights on. Street food across the
    street: a bánh mì cart in the morning and late afternoon, a trà đá stall of plastic stools (full in the evening, a
    bulb over it at night); women selling fruit from baskets on a shoulder pole, lottery ticket sellers;
  - the parks across the street go by the hour: old people at their morning exercise in rows at 5:00, badminton and a
    circle kicking a đá cầu at 16:30, children running round, people on the stone benches in the evening (a phone's glow
    after dark). At the trà đá stall two old men play cờ tướng while a few watch, and now and then someone doesn't like
    a move;
  - weekends: a house near the office has a wedding. A pink-and-white tent goes up over its pavement with a flower arch
    (Lễ Vu Quy or Lễ Tân Hôn, 囍). At 8:36 a white car with roses on the bonnet comes for the bride while the family waits
    in áo dài. There's a feast at midday and in the evening, with the couple going round the tables, guests' scooters
    along the kerb and bulbs along the eaves at night (`?wedding` for any day);
  - street trades: two or three xe ôm men wait on their scooters at a corner (6:30–19:30) and sleep on them at the midday
    nap, feet on the handlebar and hats over their faces; someone naps in a hammock between two park trees. From 5:30 to
    8:30 a woman sells xôi from her baskets beside a steaming bánh cuốn pot: people on their way in eat standing, sit
    for a plate, or buy from their scooter at the kerb. By day a barber works under a mirror nailed to a tree, next to a
    vá xe corner with tyres, a compressor and a scooter up on its stand;
  - concrete poles with sagging bundles of power cables along the streets, coils of spare cable and a transformer box.
    Now and then an ambulance (115) or a fire engine (114) comes through with lights flashing and siren sounding;
    traffic pulls over to let it by (`?siren` to see one);
  - traffic lights have Vietnam's countdown boxes beside them, red or green digits counting down the light. On a hot
    sunny day (33 °C+, from the real weather) scooters wait at a red light back in a street tree's shade instead of at
    the stop line;
  - riders as you see them on Vietnamese streets: on sunny days many women in floral "ninja" sun suits with sunglasses
    and a wrap skirt; now and then a scooter carries a fridge, a ladder, a gas cylinder, a potted tree, a chicken cage or
    a stack of styrofoam boxes taller than the rider. On the lunar 1st and 15th, in front of small family shops, someone
    burns votive paper in a steel drum by an offering table (`?lunar=1` to see it any day);
  - going out (city backdrop): before lunch on the company floor a GrabFood rider stops at the kerb and someone resting goes
    down in the lift for the team's lunch; now and then someone resting pops down to the convenience store across the
    street, waits for the green man, and comes back with a drink. Work coming in calls them back at a run;
  - day and night by the clock;
  - real weather, if you pick a city;
  - seasonal decorations (Halloween, Christmas, Lunar New Year).
- **Walk in**: explore the office in first person (WASD to move, E to use what is in front of you). Walk up to someone
  asleep and press E to wake them: they stretch, say something, and doze off again (and get crosser if you keep at it).
  With the city outside, press E at the lift (or the door) to go down to the street: walk the pavements, cross (the
  traffic stops for you), get a drink at the convenience store, a bánh mì at the cart, and E at the door to go back up.
- **A short tour on the first visit** points at what you can click (the lamp, the switch, the coffee machine, the
  printer, the cat, the bell, a person, walking in). Settings → More → "Show the tour again".
- **A 15-second clip** (in photo mode): a square video of the office from morning to evening, the camera turning
  slowly, with a title and the day's numbers. MP4 in Chrome, ready for a post.
- **Photo mode** (P): hide every panel, turn the camera any way you like, and save a PNG up to 4K with the names
  painted in.

### Your work, live

- **Desk screens** show what each session is doing: the editor, a terminal, a browser, a chat, a permission dialog.
- **Git**:
  - a desk gets messier as uncommitted files pile up;
  - a commit prints a page on the printer;
  - a push launches the rocket;
  - a failing CI run shows a red notice (with a siren, if sounds are on).
- **The whiteboard** lists each session's task and progress, plus your own sticky notes.
- **Timeline and replay**: one lane per session; replay the last hour or day at up to ×120; export it as a video.
- **Weekly recap**: a picture card of your week with Claude, ready to save or paste into a post. It shows the hours,
  prompts, edits and commands, the cost at API prices, and your busiest project.
- **A trophy cabinet** for milestones: 1,000 prompts, 10,000 edits, the first deploy, and more.

### Approve from the office

- **Permission requests** show up as cards: Allow, Always allow, Deny. Keys Y, N and A answer the top card.
- **Risky commands** are marked red, need two clicks and never offer "Always allow". That covers recursive deletes,
  force pushes, `curl | sh`, `sudo`, and anything mentioning prod.
- **Claude's questions and plans** are cards too, with every option, a free-text answer, and "approve" or "keep
  editing".
- **When this applies**: only while the page is open and visible, and for at most 45 seconds. Otherwise Claude Code
  asks as usual. You can turn this off in Settings.

### Your plan and your Mac

- **The plan pill** shows your closest usage limit (5 hours, weekly, per model) and warns at 80% and 95%. With a second
  Claude Code login on the same machine (its own `CLAUDE_CONFIG_DIR`, such as `~/.claude-org2`), that account's limits
  show too, and its sessions wear a small badge with the account's name.
- **The Mac pill** opens RAM, swap, CPU and disk, with suggestions: stop a forgotten dev server, close an idle session,
  quit a heavy app, clear caches. Every action is checked first and logged.
- **Each session** has a context bar and a waste bin that fills up with context. It also shows its cost at API prices:
  with a subscription, this is not your bill.

### Small things

- English or Vietnamese (Settings → Display).
- Graphics: Auto, Low, Medium or High. Auto steps down by itself when frames come late, and remembers it per device.
- Streamer mode blurs commands, paths and chat for recording.
- List mode turns the 3D off and shows sessions as cards. It saves battery and works without WebGL.
- Open on your phone: same Wi-Fi, 6-digit PIN, watch only.

## Privacy and safety

- **Everything stays on your Mac.** Hooks post to `127.0.0.1` in the background. If the office is not running, Claude
  Code carries on as normal.
- **Secrets are masked.** Strings that look like passwords, tokens or API keys are masked before they are stored or
  shown.
- **Plan usage** is read the way the IDE's Usage panel reads it:
  - the office takes Claude Code's login from the Keychain each time, and never stores or logs it;
  - it asks Anthropic for the numbers every 2 minutes while a page is open;
  - the address it calls is undocumented and may change.
- **Network calls you can switch off**:

  | Call | When it happens | Off switch |
  | --- | --- | --- |
  | Plan usage | while a page is open | `OFFICE_USAGE=0` |
  | GitHub CI check, through your `gh` login | while a page is open | `OFFICE_CI=0` |
  | Translation into Vietnamese | only in Vietnamese mode | `OFFICE_TRANSLATE=0` |
  | Weather | only after you pick a city | leave the city empty |

- **Stop buttons** re-check the process ID **and its start time** just before acting. A new process that reused an
  old ID is never stopped by mistake. Every stop, cleanup and approval is written to `data/actions.log`.
- **Phones**:
  - The server listens on `127.0.0.1` unless you install with `--lan`.
  - Phones need the PIN; five wrong tries lock that address for 15 minutes.
  - Phones can only watch: approvals and hooks come from the Mac alone.
  - The page is plain HTTP, so only use `--lan` on a network you trust.

## Settings from the environment

| Variable | Default | What it does |
| --- | --- | --- |
| `OFFICE_PORT` | `4310` | The port. |
| `OFFICE_HOST` | `127.0.0.1` | The address to listen on (`install --lan` sets it for you). |
| `OFFICE_LANG` | `en` | The language until someone picks one in Settings. |
| `OFFICE_DATA_DIR` | `data/` | Where the office keeps its files. |
| `OFFICE_USAGE` | on | `0` stops reading your plan's usage. |
| `OFFICE_CI` | on | `0` stops checking CI runs with `gh`. |
| `OFFICE_TRANSLATE` | on | `0` leaves Claude's English descriptions untranslated in Vietnamese mode. |

## Development

```bash
npm install
npm run dev                   # Turbopack with hot reload: http://localhost:4310/?demo
npm run lint && npm run typecheck && npm test
npm run build && npm run test:e2e   # all of them (CI runs the @smoke ones: no GPU there)
node scripts/build-demo.mjs   # the static online demo, into demo-site/
node scripts/record-gif.mjs   # this README's GIF, recorded from a running office
npm run smoke                 # starts the built server and checks it works on this system
```

| Part | Where | Built with |
| --- | --- | --- |
| The server | `server/` | plain Node.js |
| The page | `app/` and `src/components/` | Next.js (App Router) |
| The 3D office | `src/office/` | three.js, one module per thing |
| Every word on screen | `src/i18n/locales/` | one folder per language |

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the map. Read [CONTRIBUTING.md](CONTRIBUTING.md) before sending a pull
request.

## Credits

| What | From | Licence |
| --- | --- | --- |
| Ideas | agents-at-work | |
| Ideas, and the dangerous-command patterns | cubicle-crew | MIT |
| Ideas, and the RAM-growth and CPU rules | cc-reaper | Apache-2.0 |
| Libraries | [three.js](https://threejs.org), qrcode.js | MIT |
| Fonts | Be Vietnam Pro, JetBrains Mono | SIL Open Font License |
| Brand icons | [Simple Icons](https://simpleicons.org) | CC0 |
| Car models | [Kenney Car Kit](https://kenney.nl/assets/car-kit), see `public/assets/vehicles/README.md` | CC0 |
| Shop signs and liveries (Circle K, GS25, 7-Eleven, WinMart, Xanh SM, Grab, Shopee) | Wikimedia Commons, see `public/assets/brands/README.md`; the Shopee mark from Simple Icons | public domain as text logos; trademarks of their owners, not affiliated |
| Weather | [Open-Meteo](https://open-meteo.com) | |

## Licence

[MIT](LICENSE). The brand names and logos above stay their owners' trademarks; My Office is not affiliated with any of them.
