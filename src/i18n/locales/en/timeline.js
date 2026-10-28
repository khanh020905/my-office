// The timeline (replay/timeline.js): one lane per session, what it did and when, and how long it waited for you.
// The kinds are the ones src/shared/timeline.js builds; the page names them here.
export default {
  kind: {
    think: 'Thinking', read: 'Reading files', edit: 'Editing files', shell: 'Running commands', web: 'Web', agent: 'Subagents',
    wait: 'Waiting for your approval', turn: 'Your turn', idle: 'Idle',
  },
  subagent: 'subagent',
  loadFailed: "Couldn't load the timeline.",
  kpi: {
    wait: 'waiting for approval',
    waitNote: 'Time sessions spent waiting for you to click Allow or answer',
    turn: 'your turn',
    turnNote: 'From when Claude finished until you wrote back, counting at most 30 minutes each time',
    work: 'sessions worked',
    workNote: 'Added up across all sessions, so it can be longer than the range shown',
    prompts: 'prompts',
  },
  nothingYesterday: 'Nothing was recorded yesterday.',
  nothingHere: "No session worked in this range. The office only records while it's running.",
  rowWork: 'worked {time}',
  rowWait: 'waited {time} for approval',
  openSession: 'Open this session',
  sessionClosed: 'This session has closed',
  sessionClosedToast: 'This session has closed.',
  truncated: 'Too many events in this range, showing only the first part.',
  mark: { prompt: 'You sent a prompt', fail: 'Error', deploy: 'Deploy' },
  // under "Timeline" in the activity panel
  waitToday: 'Claude waited {time} for you today',
  hint: 'see what each session did and how long it waited for you',
  tipClick: 'Click to replay this moment',
  demoNoReplay: "The demo can't replay yet. Open the real office to replay your sessions.",
  // the CSV export
  csvHead: 'Session,Subagent,Start,End,Seconds,Kind,Details',
  csvFile: 'my-office-timeline-{day}.csv',
  csvSaved: { one: 'Saved {n} row to your Downloads folder.', other: 'Saved {n} rows to your Downloads folder.' },
};
