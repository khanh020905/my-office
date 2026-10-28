// What the characters say and are called (people/*.js): subagents arriving and reporting, the director handing out work,
// lunch and coffee, and the sleepy lines when you click someone who is resting. Speech bubbles: keep them short.
export default {
  director: 'Director',
  subagent: 'subagent',
  // the small badge on a boss's name tag
  team: { one: '{n} subagent', other: '{n} subagents' },
  needsApproval: 'Needs approval',
  // a subagent arrives at its boss, then reports back
  subOnIt: 'On it: {task}',
  subThinking: 'Working out a plan',
  subReport: 'Report: {what}',
  subReportDone: 'all done',
  bossThanks: 'Got the report, thanks! 👍',
  bgWait: 'Waiting on a background job: {desc}',
  // the director, with your prompt
  newTask: 'a new task',
  handOver: 'New task: “{what}”',
  leaveOnDesk: "Leaving it on {who}'s desk",
  directorThanks: 'Great work, thanks! 👍',
  // daily life on the company floor
  lunch: 'Off to lunch 🍱',
  brewing: 'Making a coffee ☕',
  afternoonCoffee: 'Afternoon coffee ☕',
  // clicked while napping: one line per click, in this order
  poke: {
    doneNamed: 'Finished “{done}”, let me rest a bit 😴',
    done: 'All done, let me rest a bit 😴',
    resting: 'Been resting {ago}… ping me if you need me 💤',
    boss: "Out of work, boss! Give me a new task and I'm up 😪",
    charging: 'Zzz… all done, recharging 🔋',
    wrappedNamed: '“{done}” is wrapped up, quick break first 😌',
    wrapped: 'Just a quick break, back at it soon 😌',
  },
  // reactions to what you do (people/errands.js): a lamp switched the wrong way (off after dark, on by day), a page you
  // printed, a coffee you made, the cat on someone's keyboard, a click on someone at work. One line picked at random.
  lamp: {
    off: ["Hey, I'm working here! 😤", 'Who turned the light off?', "I can't code in the dark 😩"],
    on: ["It's still daytime, no need for that 😄", 'Broad daylight, saving power 💡'],
    again: ['Again?! 😠', 'Stop messing with the lamp!'],
    last: ['Last time, okay?! 😤', "Come on, I'm in the middle of something!"],
    giveUp: ["Fine, I'll work in the dark… 😑", 'You win 🏳️'],
    giveUpDay: ['Fine, leave it on 🙄', 'Whatever you like 🏳️'],
    fixed: ['There, much better 💡', 'Right, back to work'],
    fixedDay: ['Off it goes 👍', 'Sunlight is free 🌤️'],
    already: ['Oh, someone fixed it already 😅'],
    sleepy: ['Zzz… even better for napping 😴', 'Mm… nice and dark 💤'],
  },
  // the floor's lights switched off after dark: the one who goes to the switch, everyone else, and by day
  room: {
    off: ['Who turned the lights off?! 😱', "Hey, we're working here!"],
    dark: ['Power cut?!', "I can't see my keyboard 😩", 'Lights, please!', 'Hello? Lights?'],
    fixed: ['Lights are back 💡', 'There we go, back to work'],
    day: ["It's daytime, the lights are off anyway 😄"],
  },
  print: { whose: ["A printout? I'll grab it 🖨️", "Something printed, I'll get it"], got: ['Got it 📄', 'Here it is'] },
  coffee: { who: ["Who made coffee? I'll take it ☕", 'Smells great, coming! ☕'], thanks: ['Thanks! ☕', 'Lovely. Back to work'] },
  cat: { onDesk: ['Hey kitty, not on the keyboard 😹', "Cat, I'm typing here!"], down: ['Down you go, good kitty 🐾', 'Off you go, nap on the sofa'] },
  // where someone is when not at their desk (the session list): a trip out, coming or going
  where: {
    home: 'Gone home', toShop: 'Popping out to {shop}', inShop: 'In {shop}', fromShop: 'Back from {shop}', rushing: 'Work came in, hurrying back',
    lunchDown: 'Fetching the lunch', lunchUp: 'Bringing the lunch up', leaving: 'Heading home ({how})', coming: 'On the way in ({how})',
    how: { bike: 'scooter', grab: 'GrabBike', xsm: 'Xanh SM Bike', taxi: 'Xanh SM taxi' },
  },
  // going out (outings.js): the GrabFood rider with the team's lunch, a trip to the convenience store across the street
  out: {
    rider: ["The rider's here, I'll get the lunch 🛵", 'Lunch is here! Going down 🍱'],
    thanks: ['Thanks a lot! 👍', 'Cheers, thank you 🙏'],
    lunch: ['Lunch is here, everyone! 🍱', "Food's here, let's eat! 🍱"],
    shop: ['Popping down to {shop} for a drink 🥤', 'Off to {shop} for a coffee ☕', 'Hungry, getting a bun at {shop} 🥟', 'Running to {shop}, want anything? 🛒'],
    back: ['Got my peach tea, back to it 🥤', 'All done, heading back 😄', 'Iced coffee, lovely ☕'],
    recall: ['Oh, work came in, coming! 🏃', 'Work for me, running back!'],
  },
  // woken up in first person (E next to someone asleep): stirring, what they say (or one of the poke lines), the second
  // and third time within two minutes, the fourth (they don't wake), dozing off again
  rouse: {
    stir: ['Hm…? 😪', 'Wha… who is it? 🥱', 'Mmh… what…'],
    hi: ['Oh, boss! Just recharging 🔋', 'Hi! All done here, anything new? 😳'],
    again: ['You again… 😩', 'I only just dozed off…'],
    last: ['Five more minutes, please 🙏', "Boss, I'm done with my work 😫"],
    ignore: ['Zzz… (pretending not to hear) 😑', 'Zzz… 💤'],
    back: ['Back to sleep 💤', 'Zzz…', 'Call me if you need me 😴'],
  },
  plant: { thirsty: ["This plant is thirsty, I'll water it 🪴", 'Poor thing, water coming'], done: ['There, much better 🌱', 'All perked up 🌿'] },
  // the meeting bell: on the way, the director's opening, each one's turn, the wrap-up, going back; nobody free
  meet: {
    coming: ['Meeting? Coming!', 'On my way 📋'],
    open: ['Quick five-minute sync, everyone!', 'Right, a quick round, everyone'],
    working: 'Working on: {task}', busy: ['Mid-task, nearly there'], waiting: 'Waiting for an approval',
    done: 'Finished “{task}”, ready for the next 😌', idle: ['Free right now, anything for me?'], sub: 'Helping {boss}', fine: ['All good here'],
    close: ['Great, back to work everyone! 👏', "That's it, thanks all!"],
    bye: ['Back to it', 'On it, boss!'],
    nobody: 'Nobody is free for a meeting right now',
    monday: ['Monday stand-up, everyone! Quickly, what are you on?', 'New week: a quick stand-up, all of you!'],
    mondayToast: '📋 Monday 9:00: the week’s stand-up at the meeting table',
  },
  // a new trophy: a cake on the meeting table; and a deploy: applause from the people nearby
  party: {
    coming: ['Is that cake? 🎂', 'A party? Coming!'], open: 'Congratulations, everyone: {what}! 🎉', cheer: ['Yay! 🎉', 'Amazing! 👏', 'Congrats! 🥳'],
    close: ['Cake, then back to work!'], bye: ['That was good cake 🍰', 'Back to it!'], deploy: ['Shipped! 🎉', "It's live! 👏", 'Nice! 🚀'],
  },
  busy: ['In the middle of something, one sec 🙏', 'Hm? Focusing right now', 'Almost done, hang on 👀'],
  looks: { toy: 'A · Toy chibi', pixar: 'B · Pixar chibi' },
  tea: {
    toast: '🧋 Friday 16:00: tea in the pantry, milk tea and bánh tráng trộn!',
    coming: ['Friday tea! 🧋', 'Milk tea? On my way!', 'Bánh tráng trộn! Wait for me!'],
    chat: ['Spicy, but so good!', 'Plans for the weekend, anyone?', 'Brown-sugar pearls are the best.', 'Who ordered the tea? Thank you!', 'What a week of deploys.', 'Friday at last!'],
    bye: ['Back to finish up, then home!', 'Thanks for the tea! 🧋'],
  },
  staff: {
    cleaner: 'Cleaner',
    receptionist: 'Receptionist',
    desk: 'RECEPTION',
    greet: ['Hello!', 'Good to see you!', 'Come on in!'],
    greetMorning: ['Good morning!', 'Early today!'],
    bye: ['Get home safe!', 'See you tomorrow!', 'Take care on the way!'],
    shipper: 'Shopee courier',
    cleanHi: ['Mopping now, careful, it is slippery!', 'Floor is getting a wash, mind the wet bits.'],
    cleanBin: ['Emptying the bin first.', 'Bin is full, out it goes.'],
    cleanBye: ['All done, see you tomorrow!', 'Spotless. Good night!'],
    slippery: ['Oops, wet floor, going round.', 'Slippery there, the other way.'],
    shipperHi: ['Shopee delivery!', 'Shopee parcel, I will leave it at the desk!'],
    call: ['{name}, a parcel for you!', '{name}, your Shopee parcel is here!'],
    callDoor: ['{name}, Shopee parcel!', 'Shopee delivery! {name}?'],
    coming: ['Coming!', 'That is mine, on my way!'],
    got: ['Thanks!', 'It is here!'],
    unbox: ['Let us see what is inside…', 'Just what I ordered! 📦'],
  },
};
