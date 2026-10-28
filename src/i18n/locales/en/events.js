// How events read on screen (ui/event-text.js): the lines in the feed and the session drawer, the speech bubbles over the
// characters, and the safe words streamer mode shows in place of paths, commands and prompts. Bubbles sit over people's
// heads, so keep them short.
export default {
  // a session's state in the list and the drawer
  status: { work: 'working', wait: 'needs approval', rest: 'resting' },
  // where people go for each kind of work
  station: {
    dining: 'dining room', board: 'whiteboard', library: 'library', desk: 'desk', server: 'server room', globe: 'window',
    coffee: 'coffee corner', meeting: 'meeting room', director: "director's office", wc: 'restroom',
  },
  // streamer mode: what a label becomes when it could show a path, command, prompt or URL
  generic: {
    prompt: 'a new task', read: 'a file', grep: 'something', glob: 'a folder', skill: 'a skill', edit: 'a file', write: 'a file',
    bash: 'run a command', web: 'something', fetch: 'a web page', mcp: 'a tool', wait: 'an action', fail: 'an action', deploy: 'a new version',
  },
  // one line per event, for the feed and the drawer (the first letter is capitalised where it starts a line)
  verb: {
    prompt: 'new task: “{label}”',
    read: 'read {label}',
    grep: 'search “{label}”',
    glob: 'list files {label}',
    skill: 'open {label}',
    edit: 'edit {label}',
    write: 'write {label}',
    plan: 'update {label}',
    web: 'search the web for “{label}”',
    fetch: 'fetch {label}',
    mcp: 'use {label}',
    agent: 'start subagent {label}',
    agentDesc: 'start subagent {label}: {desc}',
    compact: 'compact the conversation',
    ask: 'has a question for you',
    wait: 'waiting for your approval: {label}',
    fail: 'error: {label}',
    stopNamed: 'done: “{label}”',
    stop: 'done, off to make coffee',
    interrupt: 'stopped midway (you pressed Esc)',
    idle: 'waiting for your message',
    deploy: 'deploy {label} 🚀',
    commit: 'commit: “{label}” 🖨️',
    commitHidden: 'commit 🖨️',
    push: 'push code to {target} 🚀',
    ciRed: 'CI is red: {label}',
    ciRedDefault: 'tests failing',
    ciGreen: 'CI is green again: {label}',
    ciGreenDefault: 'tests passing',
    start: 'session opened',
    end: 'session closed',
    substart: 'subagent {label} joins the meeting room',
    substop: 'subagent {label} reports back',
    use: 'use {label}',
  },
  // speech bubbles over the characters
  bubble: {
    wait: 'Needs approval: {label}',
    ask: 'A question for you',
    fail: 'Error: {label}',
    stop: 'All done',
    interrupt: 'Stopped, as you asked',
    idle: 'Waiting for you',
    compact: 'Compacting history',
    agent: 'Handing off to {label}',
    deploy: 'Deploying {label}',
    plan: 'Updating the to-do list',
  },
};
