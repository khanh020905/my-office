// The activity column, the session list and the stat tiles (ui/activity.js), plus the live connection (net/live.js).
export default {
  image: { view: 'View the image', close: 'Close', gone: 'This image is no longer on the computer.' },
  subagent: 'subagent',
  working: 'working',
  starting: 'Starting…',
  more: '+{n} more',
  openSubChat: "Open this subagent's conversation",
  openChat: "Open this session's conversation",
  openToApprove: 'Open to approve',
  seeError: 'See error',
  openOnPhone: 'Open on your phone',
  empty: {
    att: 'Nothing has needed your attention in the last hour.',
    type: 'No activity of this type yet.',
    all: 'Waiting for the first activity…',
  },
  doing: {
    wait: 'Waiting for your approval',
    bg: 'Background: {desc}',
    justDone: 'Just finished',
    resting: 'Resting · {time}',
    working: 'Working',
  },
  // the session list's groups
  group: {
    wait: 'Needs your approval',
    work: 'Working',
    rest: 'Resting',
  },
  waitingFor: 'waiting {time}',
  runsIn: '{dir} · running in {origin}',
  remoteOn: 'Remote Control is on: you can open it on your phone',
  ramTitle: "This session's RAM (child processes included)",
  ctxTitle: 'Context {used} / {max} · API price ≈ {cost}',
  // the stat tiles
  kpi: {
    prompts: 'Prompts',
    read: 'Reads',
    edit: 'Edits',
    cmd: 'Cmds',   // the tile is narrow: "Commands" does not fit
    cost: 'API price',
  },
  kpiToday: '{label} today',
  costTitle: "Equivalent list API price of the open sessions (not your bill if you're on a Pro/Max plan)",
  sessions: { one: '{n} session', other: '{n} sessions' },
  subsRunning: { one: '{n} subagent running', other: '{n} subagents running' },
  noSessions: 'No sessions yet',
  docTitle: '({n}) Your turn · My Office',
  // net/live.js: the connection chip and the team name over each pod of desks
  live: {
    on: 'receiving data',
    off: 'connection lost, retrying…',
    otherProject: 'other',
    team: 'Team {name}{more} · {n}',
    teamShared: "{name}'s desks, shared with: {others}",
    teamTitle: 'Desks of the {name} project',
  },
};
