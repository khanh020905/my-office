// The karaoke box's songs (people/karaoke.js): words written for the office, nobody else's. Each has its Vietnamese
// words and an English version of them; the tune is made from the Vietnamese words the way folk songs are, each
// syllable a note that rises with the sắc and ngã tones and falls with huyền, hỏi and nặng (a line ends at home), on
// a five-note scale, so the same words always sing to the same tune.
export const SONGS = [
  { id: 'deploy', mood: 'minor', beat: 0.5, base: 57, sky: ['#1B1F4A', '#5B3A8C', '#E86A8A'],
    title: { vi: 'Deploy lúc nửa đêm', en: 'Deploying at Midnight' },
    vi: ['Đêm nay phố vắng em ngồi một mình', 'Màn hình xanh ngắt cà phê đã nguội', 'Tay em run run bấm nút deploy', 'Cầu cho mọi thứ chạy ngon chạy êm', 'Ơi con bug nhỏ đừng về đêm nay', 'Để em ngủ yên đến sáng mai'],
    en: ['Late at night the street is empty, here I sit alone', 'Screen is glowing blue, my coffee has gone cold', 'Trembling hands, I press deploy', 'Pray it all runs smooth and right', 'Little bug, oh please don’t come tonight', 'Let me sleep until the morning light'] },
  { id: 'monday', mood: 'major', beat: 0.38, base: 55, sky: ['#7EC8F2', '#BFE6FF', '#FFE6A8'],
    title: { vi: 'Thứ Hai đầu tuần', en: 'Monday Morning' },
    vi: ['Sáng thứ Hai em mở máy lên', 'Ly cà phê sữa đá trên bàn', 'Test đỏ rồi xanh xanh rồi lại đỏ', 'Sửa hoài không xong em vẫn cười', 'Commit một cái push lên thật nhanh', 'Tuần này chắc chắn sẽ thật vui'],
    en: ['Monday morning, I switch on my screen', 'Iced milk coffee on my desk', 'Tests go red, then green, then red again', 'Still not fixed, but still I smile', 'Commit it now and push it fast', 'This week is going to be fun'] },
  { id: 'friday', mood: 'major', beat: 0.4, base: 57, sky: ['#F7A35C', '#F5C16C', '#FDE7C2'],
    title: { vi: 'Chiều thứ Sáu', en: 'Friday Afternoon' },
    vi: ['Chiều thứ Sáu nắng vàng ngoài phố', 'Trà sữa về rồi cả phòng ơi', 'Bánh tráng trộn cay cay ngon quá', 'Ngồi bên nhau kể chuyện tuần qua', 'Mai cuối tuần mình đi chơi nhé', 'Code để thứ Hai tính sau'],
    en: ['Friday afternoon, the sun is gold outside', 'Milk tea is here, come on, everyone', 'Spicy rice paper salad, so good', 'Sitting close, we talk about the week', 'The weekend’s here, let’s go out and play', 'The code can wait till Monday comes'] },
  { id: 'limit', mood: 'minor', beat: 0.48, base: 52, sky: ['#2A3550', '#4E6A8E', '#C9B37E'],
    title: { vi: 'Hết lượt Claude', en: 'Out of Claude' },
    vi: ['Năm tiếng trôi qua Claude đã mệt rồi', 'Em ra pantry ngồi nhìn đồng hồ', 'Đếm từng phút một mong lượt quay về', 'Ly trà đã cạn mà vẫn chưa xong', 'Bao giờ đặt lại mình lại cùng nhau', 'Viết tiếp những dòng code còn dang dở'],
    en: ['Five hours gone, and Claude is tired now', 'I sit in the pantry watching the clock', 'Counting every minute till it comes back', 'My tea is gone, the work’s not done', 'When it resets, we’ll be back together', 'Writing the lines of code we left behind'] },
];

const SCALE = { major: [0, 2, 4, 7, 9], minor: [0, 3, 5, 7, 10] };
const TONE = { '́': 2, '̃': 3, '̀': -1, '̉': -1, '̣': -2 };   // sắc, ngã, huyền, hỏi, nặng
const toneOf = (word) => { for (const ch of word.normalize('NFD')) if (ch in TONE) return TONE[ch]; return 0; };
const step = (scale, i) => scale[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);
/** The song's tune: { notes: [{ t, d, midi, line, word }], lines: [{ t, end }], length } in beats, from its Vietnamese words. */
export function tune(song) {
  const scale = SCALE[song.mood], notes = [], lines = [];
  let t = 4, idx = 4, seed = song.id.length * 7;   // (a bar of the backing before the first line)
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  song.vi.forEach((line, li) => {
    const words = line.split(/\s+/), start = t;
    words.forEach((w, wi) => {
      const last = wi === words.length - 1, tone = toneOf(w);
      if (last) idx = idx > 2 ? 5 : 0;                                         // home at the end of the line
      else if (tone) idx += tone + (tone < 0 && rnd() < 0.3 ? 1 : 0);
      else idx += idx > 5 ? -1 : idx < 3 ? 1 : rnd() < 0.5 ? 0 : rnd() < 0.5 ? 1 : -1;
      idx = Math.max(0, Math.min(8, idx));
      const d = last ? 3 : wi === words.length - 2 ? 1 : rnd() < 0.22 ? 0.5 : 1;
      notes.push({ t, d, midi: song.base + step(scale, idx), line: li, word: wi });
      t += d;
    });
    lines.push({ t: start, end: t });
    t = Math.ceil(t / 2) * 2 + 1;   // (a breath, then the next line on the beat)
  });
  return { notes, lines, length: t + 4 };
}
// the chords under it, a bar each: I–vi–IV–V (major) or i–VI–III–VII (minor), as semitones over the key
export const CHORDS = { major: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], minor: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]] };
