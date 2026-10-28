// The 3D world: text painted on screens, signs and plaques (drawn once when the scene is built, or redrawn on a timer),
// the backdrops, and the renderer's own messages.
export default {
  noWebgl: "This browser can't turn on WebGL, so the 3D office can't be drawn.",
  softwareGl: 'Your browser is drawing 3D without a GPU, so the office runs in light mode.',
  scene: { city: 'City', country: 'Countryside', beach: 'Beach' },
  // the water cooler's little screen
  cooler: '{Mac} CPU',
  // door plaques on the company floor: a title and an optional line under it
  plaque: {
    director: 'DIRECTOR',
    directorSub: '',
    meeting: 'MEETING ROOM',
    meetingSub: '',
    library: 'LIBRARY',
    librarySub: '',
  },
  nameplate: 'DIRECTOR',
  slideSub: "This week's progress",
  arcadeSoon: 'COMING SOON',
  catSay: 'meow~ ♥',
  dev: {
    title: { one: '{label} · port {ports}', other: '{label} · ports {ports}' },
    lost: { one: '{n} forgotten dev server · click to stop it', other: '{n} forgotten dev servers · click to stop them' },
  },
  // the server room TV
  tv: {
    title: 'SERVER ROOM',
    working: '{n} working',
    waiting: '{n} waiting',
    resting: '{n} resting',
    today: 'Today: {prompts} · {cmds}',
    prompts: { one: '{n} prompt', other: '{n} prompts' },
    cmds: { one: '{n} command', other: '{n} commands' },
    plan: '5-hour limit: {pct}%',
    pulse: 'Activity, last 30 min',
  },
  // headquarters: the department rooms' door plaques and the wing's signs
  dept: {
    free: 'DEPARTMENT {n}',
    freeSub: 'free for the next project',
    name: '{name}',
    sub: 'Department {n}',
    hq: 'HEADQUARTERS',
    hqSub: 'Departments',
    board: 'Sprint board',
    cols: ['To do', 'Doing', 'Done'],
  },
};
