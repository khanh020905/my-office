// The prompt helper ("Trợ lý soạn prompt") of the group chat (ui/group-chat-view.js): what you are about to send Claude,
// looked at here, in the page, for what would cost a round trip. Nothing leaves the page and nothing is ever blocked:
// it only says so, one hint at a time. The rules come from 2,441 of the owner's own prompts: half were under 40
// characters, nearly half carried screenshots, and the ones that went back and forth were a screenshot with one to
// three words ("sao", "điền sao", "config gì"), a quality word with no criterion ("khác đi", "hay hơn", "đừng làm qua
// loa"), a reference to a number or "cái này" with nothing to point at ("4 đâu có xem giải thích gì đâu", "phần của
// vĩ"), and several jobs in one message ("gợi ý thêm… trước đó push lên github"). Vietnamese with or without its
// diacritics (and the shorthand typed for speed: j, ko, dc, r, z), and English.

/* ---------- words: a token matches a word when they are the same, or when it was typed without diacritics and is the
   same letters ("khac di" is "khác đi", but "đến" is never "đen"); a run of one letter counts once ("hơnnn") ---------- */
const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const squeeze = (s) => s.replace(/(\p{L})\1+/gu, '$1');
const keyOf = (w) => squeeze(w.normalize('NFC').toLowerCase());
const same = (tok, word) => tok.k === word || (tok.bare && tok.p === plain(word));
// shorthand, read as the words it stands for
const SHORT = { j: 'gì', z: 'vậy', dz: 'vậy', ko: 'không', k: 'không', hok: 'không', khum: 'không', kh: 'không', dc: 'được', đc: 'được', r: 'rồi', s: 'sao', vs: 'với',
  ntn: 'như thế nào', bt: 'biết', cx: 'cũng', ms: 'mới', mn: 'mọi người', nài: 'này', nì: 'này', kái: 'cái', đy: 'đi', dy: 'đi', oke: 'ok', okie: 'ok', okay: 'ok', okela: 'ok', pls: 'please', plz: 'please' };

/** text -> [{ k: its key, p: without diacritics, bare: typed without them, at, end: where it is in the text }] */
export function tokens(text) {
  const out = [];
  for (const m of String(text || '').normalize('NFC').matchAll(/[\p{L}\p{M}\p{N}]+/gu)) {
    const k = keyOf(m[0]), at = m.index, end = at + m[0].length;
    for (const w of (SHORT[k] || k).split(' ')) { const kk = keyOf(w); out.push({ k: kk, p: plain(kk), bare: plain(k) === k && !SHORT[k], at, end }); }
  }
  return out;
}
const phrases = (list) => list.map((s) => s.split(' ').map(keyOf));
// the phrase from the list that starts at token i (the longest), or null
function phraseAt(toks, i, list) {
  let best = null;
  for (const ph of list) if (ph.length <= toks.length - i && ph.every((w, j) => same(toks[i + j], w)) && (!best || ph.length > best.length)) best = ph;
  return best;
}
function findPhrase(toks, list, from = 0) {
  for (let i = from; i < toks.length; i++) { const ph = phraseAt(toks, i, list); if (ph) return { i, n: ph.length }; }
  return null;
}
const inList = (tok, set) => set.some((w) => same(tok, w));
const words = (s) => s.split(' ').map(keyOf);

/* ---------- what the rules look for ---------- */
// words that carry no request on their own: with a photo and only these, Claude has to guess
const FILLER = words('sao này cái đó đây kia đấy nữa nhé nhe nha ạ à ơi đi vậy thế gì nào hả hở chứ luôn với giúp dùm giùm hộ xem coi check fix help em anh chị mình tôi tao bạn sếp cho ra lại thử được không có rồi là thì mà ok cũng như thế ở trong please the this that it what why how here there now again do can you i me a an to is of on in pls ?');
// complete as they are, short or not ("oke rồi deploy", "push đi", an answer to Claude's question)
const DONE = words('ok oki rồi đi luôn nhé nhe nha ạ dạ vâng ừ ừm uh với yes yep yeah no nope có không đúng sai được xong push deploy commit merge rebase tag release continue go ahead on tiếp tục làm lại thử chạy test tests build lint sửa fix revert undo retry run it the again now please do that dừng stop huỷ hủy cancel cảm ơn cám thanks thank you thx tks lgtm đồng ý duyệt approve ship cả hai 2 both all tất phương án option chọn số pick lên github main pr');
const VAGUE = phrases(['khác đi', 'khác hơn', 'khác khác', 'khác chút', 'khác đy', 'hay hơn', 'hay lên', 'hay ho hơn', 'đẹp hơn', 'đẹp lên', 'đẹp đẹp', 'tốt hơn', 'xịn hơn', 'xịn lên', 'xịn xò', 'ngon hơn', 'chất hơn', 'ổn hơn', 'sang hơn', 'pro hơn', 'đỉnh hơn',
  'chuyên nghiệp hơn', 'hiện đại hơn', 'chỉn chu hơn', 'tinh tế hơn', 'ấn tượng hơn', 'bắt mắt hơn', 'hấp dẫn hơn', 'thu hút hơn', 'giống thật', 'như thật', 'thật hơn', 'qua loa', 'làm cho có', 'cẩu thả', 'làm ẩu', 'đàng hoàng', 'tử tế',
  'xấu quá', 'dở quá', 'chán quá', 'chưa ổn', 'chưa đẹp', 'không ổn',
  'make it better', 'do better', 'look better', 'looks better', 'nicer', 'prettier', 'more professional', 'more modern', 'more polished', 'fancier', 'cooler', 'more real', 'look real', 'looks real', 'more realistic',
  'something different', 'make it different', 'not lazy', 'sloppy', 'improve it', 'polish it', 'make it pop', 'not good', 'looks bad', 'looks off', 'not right']);
// right after a quality word, these bring its criterion ("đẹp hơn như trang chủ", "better than…") or say it is already so
// ("đẹp hơn rồi", "looks better now"); before it, "đã" and "thấy" say the same ("đã đẹp hơn")
const FOLLOW = words('là nếu nên bằng như kiểu giống theo với than by like with using rồi nhiều hẳn now already');
const BEFORE = words('đã thấy');
// a criterion anywhere: a size, a colour, a direction that can be measured, an example (no "đỏ", "đen" or "cam": typed
// without diacritics they are English's "do", "den" and "cam")
const CRITERIA = phrases(['màu', 'xanh', 'vàng', 'tím', 'hồng', 'xám', 'trắng', 'font', 'phông', 'chữ', 'cỡ', 'size', 'nền', 'background', 'layout', 'bố cục', 'icon', 'bóng', 'shadow', 'viền', 'border', 'hiệu ứng', 'animation',
  'to hơn', 'nhỏ hơn', 'lớn hơn', 'đậm hơn', 'nhạt hơn', 'sáng hơn', 'tối hơn', 'rộng hơn', 'hẹp hơn', 'cao hơn', 'thấp hơn', 'nhanh hơn', 'chậm hơn', 'ngắn hơn', 'dài hơn', 'ít hơn', 'nhiều hơn', 'gọn hơn', 'thưa hơn', 'sát hơn',
  'ví dụ', 'vd', 'tiêu chí', 'cụ thể', 'chẳng hạn', 'giống như', 'kiểu như', 'tham khảo',
  'bigger', 'smaller', 'larger', 'bolder', 'darker', 'lighter', 'faster', 'slower', 'shorter', 'longer', 'wider', 'narrower', 'color', 'colour', 'spacing', 'padding', 'margin', 'for example', 'such as', 'e g', 'eg', 'criteria', 'specifically']);
// pointing at something the message doesn't show
const DANGLING = phrases(['cái này', 'cái đó', 'cái đấy', 'cái kia', 'cái ấy', 'chỗ này', 'chỗ đó', 'chỗ đấy', 'chỗ kia', 'đoạn này', 'đoạn đó', 'đoạn trên', 'phần này', 'phần đó', 'như trên', 'ở trên', 'bên trên', 'như lúc nãy', 'lúc nãy', 'hồi nãy', 'vừa nãy',
  'this one', 'that one', 'this thing', 'that thing', 'the above', 'as above', 'same as before', 'like before', 'the previous one', 'that part']);
const NUMBERED = phrases(['số', 'ý', 'mục', 'câu', 'bước', 'cái thứ', 'item', 'number', 'point', 'step']);
// after a bare number at the start, these say what it counts ("3 phút", "2 file"), so it isn't a reference
const UNIT = words('px phút giây s ms ngày tiếng giờ lần người k tr triệu nghìn ngàn đồng file dòng trang cột hàng màu cái chiếc con bài câu nút lỗi bug test task việc ảnh hình chỗ tab màn min mins sec days hours times em rem kb mb gb');
// the jobs a message can ask for, by kind: shipping, thinking it over, changing something, checking it
const VERBS = [
  ['ship', ['push', 'deploy', 'commit', 'merge', 'release', 'publish', 'đẩy lên', 'đẩy code', 'up lên', 'lên github', 'tạo pr', 'mở pr', 'ship']],
  ['think', ['gợi ý', 'đề xuất', 'giải thích', 'phân tích', 'review', 'so sánh', 'tìm hiểu', 'nghiên cứu', 'đánh giá', 'tư vấn', 'lên kế hoạch', 'lập kế hoạch', 'nhận xét', 'cho ý kiến', 'brainstorm', 'suggest', 'explain', 'analyse', 'analyze', 'compare', 'research', 'propose', 'investigate', 'plan']],
  ['change', ['sửa', 'thêm', 'xoá', 'xóa', 'bỏ', 'đổi', 'thay', 'viết', 'tạo', 'cập nhật', 'làm', 'chỉnh', 'dời', 'chuyển', 'gộp', 'tách', 'cài', 'dịch', 'fix', 'add', 'remove', 'delete', 'change', 'replace', 'write', 'create', 'update', 'refactor', 'implement', 'rename', 'move', 'make', 'install', 'translate']],
  ['check', ['test', 'chạy test', 'chạy', 'kiểm tra', 'check', 'verify', 'chụp', 'xem lại', 'đo', 'run', 'lint', 'build']],
].map(([kind, list]) => [kind, phrases(list)]);
const ALL_VERBS = VERBS.flatMap(([, l]) => l);
const kindOf = (ph) => VERBS.find(([, l]) => l.includes(ph))[0];
// what joins two jobs: some always do ("trước đó", "sau đó"), some only before a verb ("và", "rồi"); "trước đó" turns the order round
const STRONG = phrases(['trước đó', 'trước tiên', 'trước hết', 'sau đó', 'rồi sau đó', 'và sau đó', 'xong thì', 'xong rồi', 'xong rồi thì', 'rồi thì', 'then', 'and then', 'and also', 'after that', 'afterwards', 'before that', 'but first']);
const REVERSE = phrases(['trước đó', 'trước tiên', 'trước hết', 'before that', 'but first']);
const WEAK = phrases(['rồi', 'và', 'xong', 'với lại', 'thêm nữa', 'đồng thời', 'ngoài ra', 'and', 'also', 'plus']);

const meaningful = (text) => (String(text).match(/[\p{L}\p{N}]/gu) || []).length;
// something the message points at for itself: a quote, a file, a path, a link
// (a straight single quote only round words, so "it's" and "don't" aren't quotes)
const ANCHOR = /["“«‘`][^"”»’`\n]{2,}["”»’`]|(?:^|\s)'[^'\n]{2,}'(?=$|[\s.,!?;:])|\b[\w-]+\.(?:[cm]?[jt]sx?|css|scss|html?|py|md|json|ya?ml|sh|go|rs|java|kt|swift|rb|php|sql|vue|svelte|txt|csv|env|png|jpe?g)\b|(?:^|\s)(?:~|\.{1,2})?\/[\w.-]+\/[\w./-]*|https?:\/\/\S+/i;
const CRITERION = /\d|#[0-9a-f]{3,8}\b|:\s*\S+\s+\S+|\n\s*(?:[-*•]|\d+[.)])\s/i;

/* ---------- jobs: the message cut where one job ends and the next begins ---------- */
const startsJob = (toks, i) => i < toks.length && (phraseAt(toks, i, ALL_VERBS) || (i + 1 < toks.length && inList(toks[i], FILLER) && phraseAt(toks, i + 1, ALL_VERBS)));
/** text -> [{ text, kind }] in the order they should be done (a job after "trước đó" first) */
export function splitTasks(text) {
  const src = String(text || '').normalize('NFC'), out = [];
  // sentences: . ! ? ; or a new line (a dot in "Header.tsx" or "1.5" isn't one), then the joiners inside each
  for (const m of src.matchAll(/[^\n.!?;]+(?:\.(?=\S)[^\n.!?;]*)*/g)) {
    const sent = m[0], toks = tokens(sent);
    let from = 0, startTok = 0, reverse = false;
    // the job so far ends at token endTok (character to); the next starts at nextFrom (token nextTok), after "trước đó" (rev)
    const cut = (endTok, to, nextFrom, nextTok, rev) => {
      const piece = sent.slice(from, to).replace(/^[\s,…:–-]+|[\s,…:–-]+$/g, '');
      if (piece) out.push({ text: piece, reverse, toks: toks.slice(startTok, endTok) });
      from = nextFrom; startTok = nextTok; reverse = rev;
    };
    for (let i = 1; i < toks.length; i++) {
      const strong = phraseAt(toks, i, STRONG), weak = !strong && phraseAt(toks, i, WEAK);
      const comma = !strong && !weak && /[,…]\s*$/.test(sent.slice(toks[i - 1].end, toks[i].at)) && startsJob(toks, i);
      const ph = strong || weak;
      if (!ph && !comma) continue;
      const n = ph ? ph.length : 0;
      if (weak && !startsJob(toks, i + n)) continue;
      cut(i, toks[i].at, ph ? toks[i + n - 1].end : toks[i].at, i + n, !!strong && phraseAt(toks, i, REVERSE)?.length === n);
      i += Math.max(0, n - 1);
    }
    cut(toks.length, sent.length, sent.length, toks.length, false);
  }
  // a job after "trước đó" goes before the one it follows
  const ordered = [];
  for (const p of out) { if (p.reverse && ordered.length) ordered.splice(ordered.length - 1, 0, p); else ordered.push(p); }
  return ordered.map((p) => {
    const v = p.toks.findIndex((_, i) => phraseAt(p.toks, i, ALL_VERBS));
    return { text: p.text, kind: v >= 0 ? kindOf(phraseAt(p.toks, v, ALL_VERBS)) : null };
  });
}
/** The jobs as numbered lines, every word kept: "head\n1. …\n2. …" (the text as it is when there's only one). */
export function numberTasks(text, head = '') {
  const jobs = splitTasks(text);
  if (jobs.length < 2) return String(text || '');
  const cap = (s) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
  return `${head ? `${head}\n` : ''}${jobs.map((j, i) => `${i + 1}. ${cap(j.text)}`).join('\n')}`;
}

/* ---------- the rules ---------- */
const PRIORITY = ['photoBare', 'dangling', 'vague', 'multi', 'tooShort'];
/**
 * What would save a round trip in a message to Claude, the most useful first.
 * { text, photos: how many go with it, quoted: it answers a message (so "cái này" has something to point at), lang: not
 * needed, both languages are always read }
 * -> [{ id: 'photoBare' | 'dangling' | 'vague' | 'multi' | 'tooShort', phrase?: the words it is about, n?: how many jobs }]
 */
export function coach({ text = '', photos = 0, quoted = false } = {}) {
  const src = String(text || '').normalize('NFC'), toks = tokens(src), len = meaningful(src), out = [];
  if (/^\s*\//.test(src)) return out;   // (a slash command: Claude Code's own)
  if (!photos && !len) return out;
  const content = toks.filter((t) => !inList(t, FILLER));
  const said = (h) => src.slice(toks[h.i].at, toks[h.i + h.n - 1].end);
  // a photo with one to three words: "sao", "điền sao", "config gì", "cái này nữa nhé"
  if (photos > 0 && content.length <= 2 && len < 25) out.push({ id: 'photoBare' });
  const anchored = photos > 0 || quoted || ANCHOR.test(src);
  // "cái này", "phần của vĩ", "ý 4…", "4 đâu có…": pointing at something the message doesn't show
  if (!anchored) {
    let hit = findPhrase(toks, DANGLING);
    const of = !hit && toks.findIndex((t, i) => same(t, 'phần') && toks[i + 1] && same(toks[i + 1], 'của') && toks[i + 2]);
    if (!hit && of >= 0) hit = { i: of, n: 3 };
    for (let i = 0; !hit && i < toks.length; i++) {
      const ph = phraseAt(toks, i, NUMBERED), j = i + (ph?.length || 0);
      if (ph && /^\d{1,2}$/.test(toks[j]?.k || '') && toks.length - (ph.length + 1) >= 4) hit = { i, n: ph.length + 1 };
    }
    if (!hit && /^\s*\d{1,2}\s+\p{L}/u.test(src) && toks.length >= 5 && !inList(toks[1], UNIT) && !/\n\s*2\s*[.):-]?\s+\p{L}/u.test(src)) hit = { i: 0, n: 1 };   // (not a list you numbered yourself: "1 …\n2. …")
    if (hit) out.push({ id: 'dangling', phrase: said(hit) });
  }
  // "khác đi", "hay hơn", "làm giống thật đừng làm qua loa": a quality with nothing to measure it by
  const vague = [];
  for (let h = findPhrase(toks, VAGUE); h; h = findPhrase(toks, VAGUE, h.i + h.n)) {
    const next = toks[h.i + h.n], prev = toks[h.i - 1], after = src.slice(toks[h.i + h.n - 1].end).trimStart();
    if (!(next && inList(next, FOLLOW)) && !(prev && inList(prev, BEFORE)) && !after.startsWith(':')) vague.push(h);
  }
  if (vague.length) {
    const used = new Set(vague.flatMap((h) => Array.from({ length: h.n }, (_, k) => h.i + k)));
    const rest = toks.filter((t, i) => !used.has(i) && !inList(t, FILLER));
    if (!CRITERION.test(src) && !ANCHOR.test(src) && !findPhrase(toks, CRITERIA) && rest.length < 10) out.push({ id: 'vague', phrase: said(vague[0]) });
  }
  // several jobs: of different kinds ("gợi ý…, trước đó push lên github") in a message of some length, or three or more
  const jobs = splitTasks(src).filter((j) => j.kind), kinds = new Set(jobs.map((j) => j.kind));
  if (jobs.length >= 3 || (jobs.length === 2 && kinds.size >= 2 && (content.length >= 6 || findPhrase(toks, REVERSE)))) out.push({ id: 'multi', n: jobs.length });
  // under 12 characters, and not a whole answer on its own ("oke", "push đi", "2" are)
  if (!out.length && !photos && [...src.trim()].length < 12 && !toks.every((t) => inList(t, DONE) || /^\d{1,2}$/.test(t.k) || /^[a-e]$/.test(t.k))) out.push({ id: 'tooShort' });
  return out.sort((a, b) => PRIORITY.indexOf(a.id) - PRIORITY.indexOf(b.id));
}
