// Life around the office: seasonal decorations, real weather, the wet-floor sign, the opening plaque.
export default {
  season: { halloween: 'Halloween', noel: 'Christmas', tet: 'Lunar New Year' },
  // Lunar New Year: the banner over the meeting room screen and the two couplet scrolls by the lift (one word per line)
  tet: {
    banner: 'HAPPY LUNAR NEW YEAR',
    coupletLeft: 'Good luck and joy',
    coupletRight: 'All goes your way',
  },
  wetFloor1: 'WET',
  wetFloor2: 'FLOOR',
  trophy: {
    plaque: 'OFFICE OPENED',
    plaqueDate: '{m}/{d}/{y}',
    toast: '🏆 New trophy: {name}',
  },
  // the weather line in Settings; descriptions follow the WMO weather codes Open-Meteo returns
  weather: {
    hcm: 'Hồ Chí Minh City',
    clear: 'clear sky',
    partly: 'partly cloudy',
    cloudy: 'overcast',
    fog: 'fog',
    drizzle: 'drizzle',
    rain: 'rain',
    snow: 'snow',
    showers: 'rain showers',
    storm: 'thunderstorm',
    failed: "Couldn't get the weather (offline?)",
    off: 'Rain and sun outside the office follow the real sky',
    loading: 'Getting the weather…',
  },
  nap: {
    start: '😴 12:30, the midday nap: blinds down, whoever is free has a doze (sessions that are running keep going).',
    end: '⏰ 13:30, nap time is over: blinds up, back to it!',
  },
  quota: {
    title: 'OUT OF CLAUDE',
    titleOther: 'OUT · {name}',
    main: 'Main account',
    days: '{d}d {time}',
    until: 'Back {when}',
    more: '{name} is out too · {left} left',
    leave: ['Out of Claude, time for a tea.', 'Limit reached, short break.', 'Claude is resting, so am I.', 'No more turns for now, getting a drink.'],
    chat: ['{left} until we can use it again…', 'Back {time}, hang on.', 'Finishing this chapter meanwhile.', 'Anyone for more tea?', 'Out of turns and still thinking about that bug…', 'A break clears the head.'],
    back: '🔔 Claude is back, everyone to their desks!',
    backOther: '🔔 {name} is back, to the desks!',
    cheer: ['We are back, to the desk!', 'Back to it!', 'Off to my desk.'],
  },
  altar: {
    header: 'THẦN TÀI · THỔ ĐỊA',
    left: 'Thổ năng sinh bạch ngọc',
    right: 'Địa khả xuất hoàng kim',
  },
};
