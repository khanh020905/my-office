// The group chat's window (the conversation: group-chat.js), drawn after the Vietnamese messenger's group chat on a
// phone (its own web CSS and string table, and a 2026 screenshot of the app, for the colours, sizes and words): the
// blue gradient bar with the back chevron, the group's name and "👥 N thành viên", call, video and ☰; the pinned message
// under it; the conversation on a lavender-grey ground, gathered at the bottom like the app's, the others' white
// bubbles on the left (the name at the top inside the first of a run, the face beside it, the time inside the last),
// yours pale blue on the right with who has seen it; dark pills for the time lines, white ones for what the group does;
// "Tin nhắn mới" where you stopped reading; replies quoting what they answer; a recalled message's "Tin nhắn đã được
// thu hồi"; the ♡ on a bubble's corner and a small pill once someone reacts (hover a bubble for the six, a reply and,
// on yours, recall); polls and reminders as cards in the middle; "… đang soạn tin"; the input bar: stickers and emoji,
// "Tin nhắn", ••• (a poll, @ someone), the mic and a photo, or send once you type; writing to Claude, a prompt helper over
// it. No brand, logo, sticker art or sound of theirs: the stickers are drawn here, the sound is the office's own.
import { $, STATIC, el } from '../core/env.js';
import { state } from '../core/state.js';
import { icon } from './icons.js';
import { avatar } from './chat-avatars.js';
import { photoOn } from './photo.js';
import { dn, sessions } from '../people/workers.js';
import { openTaskSheet, dictate, shrink } from './task-sheet.js';
import { openBurn } from './burn.js';
import { openVault } from './vault.js';
import { toast } from './activity.js';
import { loopCard, loopPeek } from './stuck.js';
import { ciCard, ciPeek } from './ci-card.js';
import { denyCard, denyPeek } from './denied-card.js';
import { cacheWords } from './cache-words.js';
import { TOKEN } from '../net/live.js';
import { pushOn, pushState, pushTest } from './notify.js';
import { REACTIONS, byId, chat, chatPoll, chatSend, chatSendPhoto, onChat, people, react, recall, rsvp, setOpen, vote, who } from './group-chat.js';
import { coach, numberTasks } from '../../shared/prompt-coach.js';
import { t as tr, lang, locale } from '../../i18n/index.js';

let root, body, typingEl, pinEl, newBtn, input, bar, stickersEl, membersEl, mentionEl, moreEl, replyEl, headSub, headAv, toEl, pickEl, quickEl, attachEl, convEl;
let replyTo = null, readTo = null, stickTab = 'sticker';   // the message you answer; the last one read when the window shut; the panel's tab
let steerTo = null;   // a run at work you cut in on (its card's 💬): { task, name }
const RUN_MS = 3 * 60e3, GAP_MS = 20 * 60e3;   // one run of bubbles: the same person within 3 minutes; a time line after 20 quiet minutes
const seeVotes = new Set();   // polls whose voters are listed
const p2 = (n) => String(n).padStart(2, '0');
const fmtTime = (ts) => { const d = new Date(ts); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
// the time lines: "14:32 Hôm nay", "Hôm qua", within the week "Thứ Hai 27/10/2026", else "27/09/2026"
function timeLabel(ts) {
  const d = new Date(ts), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
  const date = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
  const day = d.toDateString() === now.toDateString() ? tr('chat.today') : d.toDateString() === y.toDateString() ? tr('chat.yesterday')
    : now - d < 7 * 864e5 ? `${d.toLocaleDateString(locale(), { weekday: 'long' })} ${date}` : date;
  return `${fmtTime(ts)} ${day}`;
}
const mask = (text) => (state.streamer ? String(text || '').replace(/“[^”]*”/g, '“…”') : String(text || ''));
const meP = () => ({ key: 'me', name: tr('chat.boss') });
const faceOf = (key, name) => (key === 'me' ? meP() : { ...(who(key) || {}), key, name: who(key)?.name || name || '?' });
const nameOf = (key) => (key === 'me' ? tr('chat.you') : who(key)?.name || '');

/* ---------- stickers: drawn here (no one's artwork): a big emoji and a caption in round, outlined letters ---------- */
const STICKER_EMOJI = ['👌', '🙏', '👀', '🔥', '💪', '🤭', '🎉', '🥺'];
const EMOJI = '😀 😁 😂 🤣 😊 😍 🥰 😘 😎 🤩 🥳 😅 😆 😉 🤗 🤔 😴 🥱 😮 😢 😭 😡 🤯 🙄 😬 🤭 🫡 🫠 👍 👎 👏 🙏 💪 👌 ✌️ 🤝 👀 ❤️ 💔 🔥 ✨ 🎉 🎂 🍻 🧋 ☕ 🍜 🍱 🍗 🛵 🚀 💯 ✅ ❌ ⚠️ 🐛 💻 📦 📌 🕘'.split(' ');
const stickerCache = new Map();
function stickerUrl(i) {
  if (stickerCache.has(i)) return stickerCache.get(i);
  const c = document.createElement('canvas'); c.width = c.height = 260; const g = c.getContext('2d');
  g.font = '128px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(STICKER_EMOJI[i % STICKER_EMOJI.length], 130, 104);
  const cap = tr('chat.stickers', null, 'list')[i] || '';
  g.font = '900 40px "Baloo 2", "Be Vietnam Pro", system-ui, sans-serif'; g.lineJoin = 'round';
  g.lineWidth = 13; g.strokeStyle = '#FFFFFF'; g.strokeText(cap, 130, 212);
  g.lineWidth = 4; g.strokeStyle = '#1B2A4A'; g.strokeText(cap, 130, 212); g.fillStyle = '#FFD24A'; g.fillText(cap, 130, 212);
  const url = c.toDataURL('image/png'); stickerCache.set(i, url); return url;
}

/* ---------- a message ---------- */
function reactPill(m) {
  const all = Object.entries(m.reacts || {}).filter(([, l]) => l.length);
  if (!all.length) return null;
  const pill = el('span', 'zc-rx'), n = all.reduce((a, [, l]) => a + l.length, 0);
  pill.append(...all.sort((a, b) => b[1].length - a[1].length).slice(0, 3).map(([e]) => el('i', null, e)));
  if (n > 1) pill.append(el('b', null, String(n)));
  pill.title = all.map(([e, l]) => `${e} ${l.map(nameOf).filter(Boolean).join(', ')}`).join('\n');
  return pill;
}
// over a bubble: the six reactions, a reply and (yours) recall; on a touch screen, a tap shows them
function tools(m, mine) {
  const box = el('span', 'zc-tools'), pick = el('span', 'zc-pick');
  REACTIONS.forEach((e, i) => { const b = el('button', 'zc-pick-b', e); b.type = 'button'; b.style.animationDelay = `${i * 20}ms`; b.addEventListener('click', (ev) => { ev.stopPropagation(); react(m, e); }); pick.append(b); });
  const rep = el('button', 'zc-tool'); rep.type = 'button'; rep.title = tr('chat.reply'); rep.append(icon('reply'));
  rep.addEventListener('click', (ev) => { ev.stopPropagation(); setReply(m); });
  box.append(pick, rep);
  if (mine) { const rc = el('button', 'zc-tool'); rc.type = 'button'; rc.title = tr('chat.recall'); rc.append(icon('undo')); rc.addEventListener('click', (ev) => { ev.stopPropagation(); recall(m); }); box.append(rc); }
  return box;
}
function pollCard(m) {
  const card = el('div', 'zc-poll'), voters = new Set(m.poll.opts.flatMap((o) => o.by)), max = Math.max(1, ...m.poll.opts.map((o) => o.by.length)), open = seeVotes.has(m.id);
  card.append(el('span', 'zc-card-tag', `📊 ${tr('chat.pollTag')}`), el('b', 'zc-poll-q', m.poll.q));
  m.poll.opts.forEach((o, i) => {
    const row = el('button', 'zc-poll-o' + (o.by.includes('me') ? ' is-mine' : '')); row.type = 'button';
    const fill = el('i', 'zc-poll-bar'); fill.style.width = `${(o.by.length / max) * 100}%`;
    const faces = el('span', 'zc-poll-faces'); for (const k of o.by.slice(-3)) faces.append(avatar(faceOf(k), 18));
    row.append(fill, el('span', 'zc-poll-t', o.t), faces, el('b', 'zc-poll-c', String(o.by.length)));
    row.addEventListener('click', () => vote(m, i));
    card.append(row);
    if (open && o.by.length) card.append(el('small', 'zc-poll-who', o.by.map(nameOf).filter(Boolean).join(', ')));
  });
  card.append(el('small', 'zc-poll-n', tr('chat.pollVoters', { n: voters.size })));
  const btn = el('button', 'zc-card-btn', tr(open ? 'chat.pollSee' : voters.has('me') ? 'chat.pollChange' : 'chat.pollVote')); btn.type = 'button';
  btn.addEventListener('click', () => { if (open) seeVotes.delete(m.id); else seeVotes.add(m.id); redrawOne(m); });
  card.append(btn);
  return card;
}
// a reminder ("Nhắc hẹn"): the date on a calendar leaf, the time, the repeat, who's going, yes or no
function remindCard(m) {
  const r = m.remind, d = new Date(r.at), card = el('div', 'zc-remind'), leaf = el('span', 'zc-leaf');
  leaf.append(el('b', null, d.toLocaleDateString(locale(), { month: 'short' }).replace('.', '')), el('strong', null, String(d.getDate())));
  const info = el('span', 'zc-rm-info');
  info.append(el('span', 'zc-card-tag', `⏰ ${tr('chat.remindTag')}`), el('b', 'zc-rm-t', r.title), el('small', null, `${fmtTime(r.at)} · ${d.toLocaleDateString(locale(), { weekday: 'long', day: '2-digit', month: '2-digit' })}`));
  if (r.repeat) info.append(el('small', null, `🔁 ${tr('chat.remindWeek')}`));
  const top = el('div', 'zc-rm-top'); top.append(leaf, info);
  const going = el('div', 'zc-rm-going'), faces = el('span', 'zc-poll-faces');
  for (const k of r.yes.slice(-4)) faces.append(avatar(faceOf(k), 20));
  going.append(faces, el('small', null, r.done ? tr('chat.remindDone') : tr('chat.remindGoing', { n: r.yes.length })));
  const acts = el('div', 'zc-rm-acts');
  for (const [yes, label] of [[false, 'chat.remindNo'], [true, 'chat.remindYes']]) {
    const b = el('button', `zc-rm-b${yes ? ' is-yes' : ''}${(yes ? r.yes : r.no).includes('me') ? ' is-on' : ''}`, tr(label)); b.type = 'button'; b.disabled = !!r.done;
    b.addEventListener('click', () => rsvp(m, yes)); acts.append(b);
  }
  card.append(top, going, acts);
  return card;
}
function quote(r) {
  const q = el('span', 'zc-quote'); q.append(el('b', null, r.name), el('span', null, mask(r.text)));
  q.addEventListener('click', (ev) => { ev.stopPropagation(); flash(r.id); });
  return q;
}
function content(m) {
  if (m.recalled) return el('span', 'zc-text zc-muted', tr('chat.recalled'));
  if (m.kind === 'sticker') { const img = el('img', 'zc-sticker'); img.src = stickerUrl(m.sticker); img.alt = tr('chat.sticker'); return img; }
  if (m.kind === 'photo') {
    if (!m.photo) return el('span', 'zc-text zc-muted', tr('chat.photo'));
    const box = el('span', 'zc-photo'), img = el('img'); img.src = m.photo; img.alt = tr('chat.photo'); box.append(img, el('span', 'zc-ptime', fmtTime(m.at))); return box;
  }
  if (m.kind === 'work') return workCard(m);
  if (m.kind === 'loop') return loopCard(m, redrawOne);   // (a session stuck in a loop: ui/stuck.js)
  if (m.kind === 'deny') return denyCard(m, redrawOne);   // (a call auto mode refused: ui/denied-card.js)
  if (m.kind === 'ci') return ciCard(m, redrawOne);   // (a repository's CI gone red, "Sửa luôn": ui/ci-card.js)
  if (bigEmoji(m.text)) return el('span', 'zc-bigemo', m.text);
  const t = el('span', 'zc-text');
  // @names in blue, the way the app shows a mention: the whole name of someone in the group (names have spaces), else one word
  const names = [tr('chat.boss'), tr('chat.everyone'), 'All', ...people().map((id) => dn(sessions.get(id)))].filter(Boolean).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})|@[^\\s,.!?:]+)`, 'u');
  // a long one (a whole prompt, Claude's answer) folded the way the app does, "Xem thêm" to read it all
  const full = mask(m.text), long = !opened.has(m.id) && (full.length > 700 || full.split('\n').length > 14);
  const shown = long ? `${full.split('\n').slice(0, 10).join('\n').slice(0, 520).trimEnd()}…` : full;
  if (m.tag === 'claude') { t.classList.add('zc-md'); t.append(md(shown)); }   // (Claude's answer: its Markdown, laid out)
  else for (const part of shown.split(re)) { if (part?.startsWith('@')) t.append(el('span', 'zc-at', part)); else if (part) t.append(part); }
  if (long) {
    const more = el('button', 'zc-readmore', tr('chat.readMore')); more.type = 'button';
    more.addEventListener('click', (e) => { e.stopPropagation(); opened.add(m.id); redrawOne(m); });
    t.append(el('br'), more);
  }
  return t;
}
const opened = new Set();   // the long messages you unfolded
/* Claude's Markdown, laid out with elements (never as HTML): headings, **bold**, *italic*, `code`, code blocks, lists,
   quotes, tables, rules and links (http and https only) */
function inline(text) {
  const f = document.createDocumentFragment(), re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|\[[^\]\n]+\]\((?:https?:\/\/)[^)\s]+\)|https?:\/\/[^\s<>()]+)/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > at) f.append(text.slice(at, m.index));
    const t = m[0];
    if (t[0] === '`') f.append(el('code', null, t.slice(1, -1)));
    else if (t.startsWith('**') || t.startsWith('__')) { const b = el('b'); b.append(inline(t.slice(2, -2))); f.append(b); }
    else if (t[0] === '*') { const i = el('i'); i.append(inline(t.slice(1, -1))); f.append(i); }
    else {
      const [label, href] = t[0] === '[' ? [t.slice(1, t.indexOf('](')), t.slice(t.indexOf('](') + 2, -1)] : [t, t];
      const a = el('a', null, label); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; f.append(a);
    }
    at = m.index + t.length;
  }
  if (at < text.length) f.append(text.slice(at));
  return f;
}
function md(text) {
  const f = document.createDocumentFragment(), lines = text.split('\n');
  let list = null, para = null;
  const end = () => { list = null; para = null; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {   // a code block (to its closing fence, or the end)
      const code = []; for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
      const pre = el('pre'); pre.append(el('code', null, code.join('\n'))); f.append(pre); end(); continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l)) {   // a table: its rows (the |---| line under the head skipped)
      const rows = []; for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => c.trim()));
      i--;
      const box = el('div', 'zc-md-table'), table = el('table');
      rows.forEach((r, k) => { const tr = el('tr'); for (const c of r) { const td = el(k ? 'td' : 'th'); td.append(inline(c)); tr.append(td); } table.append(tr); });
      box.append(table); f.append(box); end(); continue;
    }
    if (!l.trim()) { end(); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { const b = el('div', `zc-md-h zc-md-h${h[1].length}`); b.append(inline(h[2])); f.append(b); end(); continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(l)) { f.append(el('hr')); end(); continue; }
    const q = /^\s*>\s?(.*)$/.exec(l);
    if (q) { const b = el('div', 'zc-md-q'); b.append(inline(q[1])); f.append(b); end(); continue; }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
    if (li) {
      const kind = /\d/.test(li[2]) ? 'ol' : 'ul';
      if (!list || list.tagName.toLowerCase() !== kind) { list = el(kind); if (kind === 'ol') list.start = parseInt(li[2], 10) || 1; f.append(list); }
      const item = el('li'); if (li[1].length >= 2) item.className = 'zc-md-sub'; item.append(inline(li[3])); list.append(item); para = null; continue;
    }
    if (para) para.append(el('br'), inline(l)); else { para = el('p'); para.append(inline(l)); f.append(para); list = null; }
  }
  return f;
}
// the clocks of the cards at work, every second while the chat is open
setInterval(() => { if (!root || root.hidden) return; for (const x of root.querySelectorAll('.zc-work-h small[data-at]')) x.textContent = tr('chat.card.meta', { n: Number(x.dataset.n), took: clock(Date.now() - Number(x.dataset.at)) }); }, 1000);
// Claude at work on what you sent it: what it is doing (its latest steps, live), an approval it waits for, then done
const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function workCard(m) {
  const w = m.work || {}, state = w.state || 'work', live = state === 'work' || state === 'wait';
  const box = el('div', `zc-work is-${state}`), head = el('div', 'zc-work-h');
  head.append(el('i', 'zc-work-ic', state === 'done' ? '✅' : state === 'fail' ? '⚠️' : state === 'stopped' ? '⏹' : state === 'wait' ? '⏳' : ''), el('b', null, tr(`chat.card.${state}`)),
    el('small', null, tr('chat.card.meta', { n: w.n || 0, took: clock((w.end || Date.now()) - (w.at || m.at)) })));
  if (live) Object.assign(head.lastChild.dataset, { at: String(w.at || m.at), n: String(w.n || 0) });   // (its clock runs on: tick())
  box.append(head);
  if (state === 'wait' && w.ask) box.append(el('div', 'zc-work-ask', tr(w.perm || w.attach ? 'chat.card.askHere' : 'chat.card.ask', { what: w.ask })));   // (a background session's: no 45 s)
  // right here: allow or deny what it waits for (a risky command: deny only, as on any phone), stop it
  if (live) {
    const acts = el('div', 'zc-work-acts');
    const btn = (label, cls, fn) => { const b = el('button', `zc-work-btn ${cls}`, label); b.type = 'button'; b.addEventListener('click', async (e) => { e.stopPropagation(); b.disabled = true; const r = await fn(); if (!r?.ok) { b.disabled = false; toast(r?.message || tr('drawer.unreachable'), 6000); } }); return b; };
    const call = (url, body) => fetch(`${url}${tq()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    if (state === 'wait' && w.perm) {
      if (!w.risky) acts.append(btn(tr('chat.card.allow'), 'is-ok', () => call('/api/perm', { id: w.perm, choice: 'allow' })));
      acts.append(btn(tr('chat.card.deny'), 'is-no', () => call('/api/perm', { id: w.perm, choice: 'deny' })));
    }
    if (w.task) { const st = el('button', 'zc-work-btn is-steer', tr('chat.steer.btn')); st.type = 'button'; st.addEventListener('click', (e) => { e.stopPropagation(); setSteer({ task: w.task, name: m.name }); }); acts.append(st); }   // (a note while it works: what you write next)
    if (w.task) acts.append(btn(tr('chat.card.stop'), 'is-stop', () => call('/api/tasks/stop', { id: w.task })));
    if (acts.children.length) box.append(acts);
    if (state === 'wait' && w.perm && w.risky) box.append(el('small', 'zc-work-none', tr('chat.card.risky')));
  }
  const steps = w.steps || [], all = opened.has(m.id);
  const list = el('ol', 'zc-work-steps');
  for (const st of all ? steps : live ? steps.slice(-4) : []) list.append(el('li', null, st));
  if (list.children.length) box.append(list);
  if (!all && steps.length > (live ? 4 : 0)) {
    const more = el('button', 'zc-readmore', tr(live ? 'chat.card.all' : 'chat.card.show', { n: w.n || steps.length })); more.type = 'button';
    more.addEventListener('click', (e) => { e.stopPropagation(); opened.add(m.id); redrawOne(m); });
    box.append(more);
  }
  if (!live && !steps.length) box.append(el('small', 'zc-work-none', tr('chat.card.none')));
  // a background session (server/bg-sessions.mjs): how to open it on the Mac, its command to select whole
  if (w.attach) { const [a, b = ''] = tr('chat.card.attach', { cmd: '\u0001' }).split('\u0001'), hint = el('small', 'zc-work-attach'); hint.append(a, el('code', null, w.attach), b); box.append(hint); }
  return box;
}
// one to three emoji and nothing else (a 👍 sent with the button, say): shown big, without a bubble
const EMO_ONLY = /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*){1,3}$/u;
const bigEmoji = (t) => !!t && t.length <= 24 && EMO_ONLY.test(t.trim());
function row(m, prev, nextM) {
  if (m.kind === 'sys') return el('div', 'zc-sys', m.text);
  if (m.kind === 'poll' || m.kind === 'remind') { const r = el('div', 'zc-row zc-row--card is-first'); r.dataset.id = m.id; r.append(m.kind === 'poll' ? pollCard(m) : remindCard(m)); return r; }
  const run = (a, b) => a && b && a.kind !== 'sys' && a.kind !== 'poll' && a.kind !== 'remind' && a.from === b.from && Math.abs(b.at - a.at) <= RUN_MS;
  const mine = m.from === 'me', first = !run(prev, m), last = !run(m, nextM);
  const r = el('div', `zc-row${mine ? ' is-mine' : ''}${first ? ' is-first' : ''}${last ? ' is-last' : ''}`); r.dataset.id = m.id;
  if (!mine) {
    const slot = el('span', 'zc-av-slot'); if (first || m.tag === 'claude') slot.append(avatar(faceOf(m.from, m.name), 32));
    const s = m.tag === 'claude' && sessions.get(m.from);   // (Claude's answer: a tap on its face opens that conversation)
    if (s?.sid) { slot.classList.add('is-click'); slot.title = tr('chat.conv.open'); slot.addEventListener('click', () => openConv({ id: s.id, sid: s.sid, name: dn(s), folder: folderOf(s) })); }
    r.append(slot);
  }
  const bare = !m.recalled && (m.kind === 'sticker' || m.kind === 'photo' || (m.kind === 'text' && bigEmoji(m.text)));
  const bub = el('div', `zc-bub${bare ? ' is-bare' : ''}`);
  // (Claude's answer: always named and marked, under its card too)
  if (!mine && (first || m.tag === 'claude') && !bare) { const n = el('span', 'zc-name', m.name); if (m.tag === 'claude') n.append(el('i', 'zc-claude', tr('chat.claudeTag'))); bub.append(n); }
  if (m.reply && !m.recalled) bub.append(quote(m.reply));
  bub.append(content(m));
  if (last && !bare) bub.append(el('span', 'zc-time', fmtTime(m.at)));
  if (!m.recalled) {
    const rx = reactPill(m); if (rx) bub.append(rx);
    else if (!mine && !bare) { const heart = el('button', 'zc-like'); heart.type = 'button'; heart.title = tr('chat.react'); heart.append(el('i', null, '♡')); heart.addEventListener('click', (ev) => { ev.stopPropagation(); react(m, '❤️'); }); bub.append(heart); }
    bub.append(tools(m, mine));
    bub.addEventListener('click', () => { for (const x of body.querySelectorAll('.zc-bub.is-tools')) if (x !== bub) x.classList.remove('is-tools'); bub.classList.toggle('is-tools'); });   // (touch: tap for the tools)
  }
  r.append(bub);
  return r;
}

/* ---------- drawing ---------- */
const atBottom = () => body.scrollHeight - body.scrollTop - body.clientHeight < 80;
function redraw() {
  if (!root) return;
  const list = chat.msgs, frag = document.createDocumentFragment();
  frag.append(el('div', 'zc-push'));   // (pushes a short conversation down to the input, like the app)
  let newDone = false;
  for (let i = 0; i < list.length; i++) {
    if (i === 0 || list[i].at - list[i - 1].at > GAP_MS || new Date(list[i].at).toDateString() !== new Date(list[i - 1].at).toDateString()) frag.append(el('div', 'zc-day', timeLabel(list[i].at)));
    // where you stopped reading: "Tin nhắn mới"
    if (!newDone && readTo && i > 0 && list[i - 1].id === readTo && list.slice(i).some((m) => m.kind !== 'sys' && m.from !== 'me')) { newDone = true; const line = el('div', 'zc-newline'); line.append(el('span', null, tr('chat.newLine'))); frag.append(line); }
    frag.append(row(list[i], list[i - 1], list[i + 1]));
  }
  // the latest message of others keeps its ♡ in view (the way the app shows it on the newest bubble)
  const rows = frag.querySelectorAll('.zc-row:not(.is-mine) .zc-like'); rows[rows.length - 1]?.classList.add('is-on');
  // under your last message: the faces of those who have seen it (the people in the office), or "Đã nhận"
  const lastMsg = [...list].reverse().find((m) => m.kind !== 'sys');
  if (lastMsg?.from === 'me') {
    const seen = el('div', 'zc-seen'), ppl = people(), st = el('span', 'zc-seen-st');
    st.append(icon('checks'), document.createTextNode(tr(ppl.length ? 'chat.seen' : 'chat.received')));
    seen.append(st);
    if (ppl.length) { for (const id of ppl.slice(0, 4)) seen.append(avatar(who(id), 16)); if (ppl.length > 4) seen.append(el('span', 'zc-seen-n', `+${ppl.length - 4}`)); }
    frag.append(seen);
  }
  body.replaceChildren(frag);
  drawPin(); drawHead();
}
// a new message at the end: added on its own (redrawing every row would take a bubble out from under the pointer);
// the one before may lose its time and its ♡, the "seen" line moves under it
function appendOne(m) {
  const list = chat.msgs, i = list.indexOf(m), prev = list[i - 1];
  if (i < 0 || i !== list.length - 1 || !prev || (prev.kind !== 'sys' && !body.querySelector(`.zc-row[data-id="${CSS.escape(prev.id)}"]`))) { redraw(); return; }
  body.querySelector('.zc-seen')?.remove();
  if (m.at - prev.at > GAP_MS || new Date(m.at).toDateString() !== new Date(prev.at).toDateString()) body.append(el('div', 'zc-day', timeLabel(m.at)));
  if (prev.kind !== 'sys') redrawOne(prev);
  body.append(row(m, prev, undefined));
  if (m.from !== 'me' && m.kind !== 'sys') { for (const x of body.querySelectorAll('.zc-like.is-on')) x.classList.remove('is-on'); const likes = body.querySelectorAll('.zc-row:not(.is-mine) .zc-like'); likes[likes.length - 1]?.classList.add('is-on'); }
  if (m.from === 'me') { const seen = el('div', 'zc-seen'), ppl = people(), st = el('span', 'zc-seen-st'); st.append(icon('checks'), document.createTextNode(tr(ppl.length ? 'chat.seen' : 'chat.received'))); seen.append(st); for (const id of ppl.slice(0, 4)) seen.append(avatar(who(id), 16)); body.append(seen); }
  drawPin(); drawHead();
}
function redrawOne(m) {
  const old = body?.querySelector(`.zc-row[data-id="${CSS.escape(m.id)}"]`); if (!old) return;
  const i = chat.msgs.findIndex((x) => x.id === m.id); old.replaceWith(row(chat.msgs[i] || m, chat.msgs[i - 1], chat.msgs[i + 1]));
}
function flash(id) { const r = body.querySelector(`.zc-row[data-id="${CSS.escape(id || '')}"]`); r?.scrollIntoView({ block: 'center', behavior: 'smooth' }); r?.classList.add('is-flash'); setTimeout(() => r?.classList.remove('is-flash'), 1400); }
function drawHead() { headSub.textContent = tr('chat.members', { n: people().length + 1 }); headAv.replaceChildren(groupAvatar(46)); }
function drawPin() {
  const m = chat.pinned && byId(chat.pinned);
  pinEl.hidden = !m || m.recalled;
  if (m && !m.recalled) pinEl.querySelector('.zc-pin-t').textContent = m.kind === 'poll' ? `📊 ${m.poll.q}` : m.kind === 'remind' ? `⏰ ${m.remind.title}` : `${m.name}: ${mask(m.text)}`;
}
function drawTyping() {
  const t = chat.typing;
  typingEl.hidden = !t.length;
  if (t.length) typingEl.querySelector('span').textContent = tr('chat.typing', { name: t.length > 1 ? `${t[0]} +${t.length - 1}` : t[0] });
}
function badge() {
  const b = $('chat-badge'); if (!b) return;
  b.hidden = !chat.unread; b.textContent = chat.unread > 5 ? '5+' : String(chat.unread);
}
// the group's picture: four of its faces in a square, the last a count of the rest when there are more
function groupAvatar(size = 40) {
  const box = el('span', 'zc-gav'), ids = people(), t = Math.round(size / 2) - 1;
  box.style.width = box.style.height = `${size}px`;
  const faces = [meP(), ...ids.map((id) => who(id))];
  for (const p of faces.slice(0, faces.length > 4 ? 3 : 4)) box.append(avatar(p, t));
  if (faces.length > 4) { const n = el('span', 'zc-gav-n', String(Math.min(99, faces.length - 3))); n.style.width = n.style.height = `${t}px`; box.append(n); }
  return box;
}
// a small card by the button for a new message while the window is shut (like a conversation in the app's list)
let peekTimer = 0;
function peek(m) {
  if (chat.open || m.kind === 'sys' || m.from === 'me' || photoOn()) return;
  let p = $('zc-peek'); if (!p) { p = el('button', 'zc-peek'); p.id = 'zc-peek'; p.type = 'button'; p.addEventListener('click', () => toggle(true)); document.body.append(p); }
  if (m.kind === 'work') return;   // (a card at work: its answer is the news)
  const txt = m.kind === 'loop' ? loopPeek(m) : m.kind === 'ci' ? ciPeek(m) : m.kind === 'deny' ? denyPeek(m) : m.kind === 'text' ? mask(m.text) : m.kind === 'poll' ? `📊 ${m.poll.q}` : m.kind === 'remind' ? `⏰ ${m.remind.title}` : m.kind === 'photo' ? tr('chat.photo') : tr('chat.sticker');
  const box = el('span', 'zc-peek-t'); box.append(el('b', null, tr('chat.group')), el('span', null, `${m.name}: ${txt}`));
  p.replaceChildren(groupAvatar(44), box);
  p.hidden = false; p.classList.remove('is-out'); clearTimeout(peekTimer);
  peekTimer = setTimeout(() => { p.classList.add('is-out'); setTimeout(() => { p.hidden = true; }, 300); }, 4200);
}
onChat((what, m) => {
  badge();
  if (what === 'add') peek(m);
  if (!root || root.hidden) return;
  if (what === 'typing') { drawTyping(); return; }
  if (what === 'update') { redrawOne(m); drawPin(); return; }
  const stick = atBottom() || m?.from === 'me';
  if (what === 'add') appendOne(m); else redraw();
  if (stick) body.scrollTop = body.scrollHeight;
  else if (what === 'add' && m.kind !== 'sys') { const n = (Number(newBtn.dataset.n) || 0) + 1; newBtn.dataset.n = String(n); newBtn.textContent = tr('chat.newMsgs', { n }); newBtn.hidden = false; }
});

/* ---------- the input: text, a reply, @ someone, stickers and emoji, a poll, a photo; send once something is typed ---------- */
function syncBar() { bar.classList.toggle('has-text', !!input.value.trim()); root.classList.toggle('has-text', !!input.value.trim()); }
function setReply(m) {
  if (m && steerTo) setSteer(null);
  replyTo = m;
  const s = m?.tag === 'claude' && sessions.get(m.from);   // (an answer from Claude: what you write back goes to it)
  if (s?.sid) setTarget({ id: s.id, sid: s.sid, name: dn(s), folder: folderOf(s) });
  replyEl.hidden = !m && !steerTo; coachLater();
  if (m) {
    const t = m.kind === 'text' ? mask(m.text) : m.kind === 'poll' ? `📊 ${m.poll.q}` : m.kind === 'photo' ? tr('chat.photo') : tr('chat.sticker');
    replyEl.querySelector('b').textContent = tr('chat.replyTo', { name: m.from === 'me' ? tr('chat.you') : m.name });
    replyEl.querySelector('.zc-reply-t').textContent = t;
    input.focus();
  }
}
function send() {
  const v = input.value; input.value = ''; syncBar(); mentionEl.hidden = true; input.style.height = '';
  if (steerTo && v.trim()) { const to = steerTo; setSteer(null); steerSend(to, v.trim()); drawCoach(); return; }
  if (target && (v.trim() || attach.length)) { sendTo(v.trim() || tr('chat.to.photoOnly')); setReply(null); drawCoach(); return; }
  if (v.trim()) chatSend(v, { replyTo: replyTo?.id });
  setReply(null);
  // @ a conversation: give it this as work? (one tap opens the sheet with it filled in: its folder, photos, send)
  const tagged = v.trim() && [...sessions.values()].sort((a, b) => dn(b).length - dn(a).length).find((s) => v.includes(`@${dn(s)}`));
  if (tagged) setTimeout(() => {
    const ask = el('div', 'zc-ask'), yes = el('button', 'zc-ask-yes', tr('chat.task.askYes')), no = el('button', 'zc-ask-no', tr('chat.task.askNo'));
    yes.type = no.type = 'button';
    yes.addEventListener('click', () => { ask.remove(); openTaskSheet(root, { to: { id: tagged.id }, text: v.replace(`@${dn(tagged)}`, '').trim() }); });
    no.addEventListener('click', () => ask.remove());
    ask.append(el('span', null, tr('chat.task.ask', { name: dn(tagged), folder: folderOf(tagged) })), no, yes);
    body.append(ask); body.scrollTop = body.scrollHeight;
  }, 300);
}
/* ---------- who gets what you write: the whole group (people chatting), or one conversation, Claude for real (it goes to
   that conversation as work on its own branch, and the answer comes back here from its person: server, POST /api/tasks
   { chat }); chosen above the input, or by replying to one of Claude's answers ---------- */
const DEMO_CHAT = STATIC || new URLSearchParams(location.search).has('demo');
const tq = () => (TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : '');
let target = null;   // { id, sid, name, folder } a conversation, { dir, name, folder, fresh } a new one in a project, or null: the whole group
try { target = DEMO_CHAT ? null : JSON.parse(sessionStorage.getItem('office-chat-to') || 'null'); } catch { /* storage blocked */ }
function setTarget(t) {
  target = t; try { sessionStorage.setItem('office-chat-to', JSON.stringify(t)); } catch { /* storage blocked */ }
  if (pickEl) pickEl.hidden = true;
  drawTarget();
}
function drawTarget() {
  if (!toEl) return;
  const chip = el('button', `zc-to-chip${target ? ' is-on' : ''}`); chip.type = 'button'; chip.title = tr('chat.to.pick');
  chip.append(el('small', null, tr('chat.to.label')));
  if (target?.dir) chip.append(el('span', 'zc-to-icon', target.fresh ? '＋' : '📁'), el('b', null, target.name));
  else if (target) chip.append(avatar(faceOf(target.id, target.name), 20), el('b', null, target.name));
  else chip.append(el('b', null, `💬 ${tr('chat.to.group')}`));
  chip.append(el('i', 'zc-to-caret', '▾'));
  chip.addEventListener('click', openPick);
  toEl.replaceChildren(chip);
  if (target) {
    const x = el('button', 'zc-ib zc-to-x'); x.type = 'button'; x.title = tr('chat.to.clear'); x.append(icon('x')); x.addEventListener('click', () => setTarget(null));
    toEl.append(el('small', 'zc-to-sub', tr(target.dir ? (target.fresh ? 'chat.to.subNew' : 'chat.to.subMine') : 'chat.to.sub', { folder: target.folder })), x);
    if (target.id) { const c = el('small', 'zc-to-cache'); toEl.insertBefore(c, x); drawToCache(); }   // (its prompt cache: answer while it is warm)
  }
  const narrow = matchMedia('(max-width: 640px)').matches;   // (a phone: the short one; whom it goes to is on the "To" chip just above)
  input.placeholder = target ? tr(narrow ? 'chat.to.placeholderShort' : 'chat.to.placeholder', { name: target.name }) : tr(narrow ? 'chat.placeholder' : 'chat.placeholderPc', { group: tr('chat.group') });
  root.classList.toggle('is-to', !!target);
  input.maxLength = target ? 4000 : 600;   // (work for Claude takes up to 4000 characters, server/tasks.mjs; the group's chat 600)
  if (target?.sid) { const c = el('button', 'zc-ib zc-to-conv'); c.type = 'button'; c.title = tr('chat.conv.open'); c.append(el('span', null, '📜')); c.addEventListener('click', () => openConv(target)); toEl.insertBefore(c, toEl.querySelector('.zc-to-x')); }
  for (const b of root.querySelectorAll('.zc-photo-btn')) b.hidden = !state.isLocal && !target;   // (to Claude: a photo from this device; to the group: a photo of the office, the Mac's)
  drawQuick(); if (!target) { attach = []; drawAttach(); }
  drawCoach();
}
// the conversation's prompt cache under "To": warm for how long (cheap to carry on), or cold (it reads it all again)
function drawToCache() {
  const c = toEl?.querySelector('.zc-to-cache'); if (!c) return;
  const w = cacheWords(sessions.get(target?.id)?.cache, matchMedia('(max-width: 640px)').matches ? 'chatShort' : 'chat');   // (a phone: the short one)
  c.hidden = !w.text; c.dataset.state = w.state; if (c.textContent !== w.text) c.textContent = w.text;
}
setInterval(() => { if (root && !root.hidden) drawToCache(); }, 20_000);

/* ---------- quick commands over the input (to a conversation or a project): a tap fills the input, ✎ changes them ----------
   Shared by the Mac and the phones (data/quick.json); the office's own until you change them. */
let quick = null;
const QUICK0 = () => ['test', 'commit', 'deploy', 'today', 'errors'].map((k) => ({ label: tr(`chat.quick.${k}`), prompt: tr(`chat.quick.${k}Prompt`) }));
async function loadQuick() { const r = await fetch(`/api/quick${tq()}`).then((x) => x.json()).catch(() => null); quick = r?.list?.length ? r.list : QUICK0(); drawQuick(); }
let keepChip = null;   // "⭐ Lưu câu này": shown while what you are writing isn't one of them yet
const canKeep = () => !!quick && input.value.trim().length >= 6 && !quick.some((q) => q.prompt === input.value.trim());
function drawQuick() {
  if (!quickEl) return;
  quickEl.hidden = !target || !quick;
  if (quickEl.hidden) return;
  const chip = (label, fn, cls = '') => { const b = el('button', `zc-quick-c ${cls}`, label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  keepChip = chip(tr('chat.quick.keep'), keepQuick, 'is-keep'); keepChip.hidden = !canKeep();
  keepChip.addEventListener('pointerdown', (e) => e.preventDefault());   // (the input keeps its focus and the keyboard)
  quickEl.replaceChildren(...quick.map((q) => chip(q.label, () => { input.value = q.prompt; syncBar(); input.dispatchEvent(new Event('input')); input.focus(); })),
    keepChip, chip('✎', editQuick, 'is-edit'));
}
// what you are writing, kept as a quick command in one tap: named after its first words (✎ renames it)
async function keepQuick() {
  const text = input.value.trim(); if (!text || !quick) return;
  if (quick.length >= 12) { toast(tr('chat.quick.full'), 5000); editQuick(); return; }
  const first = text.split('\n')[0].trim(), label = first.length > 22 ? `${first.slice(0, 21).trimEnd()}…` : first;
  const r = await fetch(`/api/quick${tq()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ list: [...quick, { label, prompt: text }] }) }).then((x) => x.json()).catch(() => null);
  if (!r?.ok) { toast(tr('drawer.unreachable')); return; }
  quick = r.list.length ? r.list : QUICK0(); drawQuick(); toast(tr('chat.quick.kept', { label }), 5000);
}
function editQuick() {
  mentionEl.hidden = moreEl.hidden = stickersEl.hidden = true;
  const rows = el('div', 'zc-quick-ed'), list = quick.map((q) => ({ ...q }));
  const draw = () => {
    rows.replaceChildren(el('small', 'zc-to-h', tr('chat.quick.edit')), ...list.map((q, i) => {
      const r = el('div', 'zc-quick-row'), l = el('input', 'zc-more-in'), p = el('textarea', 'zc-more-in'), x = el('button', 'zc-ib zc-reply-x');
      l.value = q.label; l.maxLength = 24; l.placeholder = tr('chat.quick.label'); p.value = q.prompt; p.rows = 2; p.maxLength = 2000; p.placeholder = tr('chat.quick.prompt');
      for (const f of [l, p]) f.addEventListener('keydown', (e) => e.stopPropagation());
      l.addEventListener('input', () => { q.label = l.value; }); p.addEventListener('input', () => { q.prompt = p.value; });
      x.type = 'button'; x.append(icon('x')); x.addEventListener('click', () => { list.splice(i, 1); draw(); });
      r.append(l, x, p); return r;
    }));
    const acts = el('div', 'zc-quick-acts'), add = el('button', 'zc-quick-c', tr('chat.quick.add')), reset = el('button', 'zc-quick-c', tr('chat.quick.reset')), save = el('button', 'zc-quick-c is-save', tr('chat.quick.save'));
    for (const b of [add, reset, save]) b.type = 'button';
    add.addEventListener('click', () => { if (list.length < 12) { list.push({ label: '', prompt: '' }); draw(); } });
    reset.addEventListener('click', () => { list.splice(0, list.length, ...QUICK0()); draw(); });
    save.addEventListener('click', async () => {
      const r = await fetch(`/api/quick${tq()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ list }) }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { toast(tr('drawer.unreachable')); return; }
      quick = r.list.length ? r.list : QUICK0(); pickEl.hidden = true; drawQuick(); toast(tr('chat.quick.saved'));
    });
    acts.append(add, reset, save); rows.append(acts);
  };
  draw(); pickEl.replaceChildren(rows); pickEl.hidden = false;
}

/* ---------- photos with what you write to Claude: from the camera or the gallery, made smaller here ---------- */
let attach = [];
function drawAttach() {
  if (!attachEl) return;
  attachEl.hidden = !attach.length;
  attachEl.replaceChildren(...attach.map((u, i) => { const t = el('span', 'zc-attach-t'), img = el('img'), x = el('button', null, '✕'); img.src = u; x.type = 'button'; x.addEventListener('click', () => { attach.splice(i, 1); drawAttach(); }); t.append(img, x); return t; }));
  coachLater();   // (a photo more or less: another hint, maybe)
}
function pickPhotos() {
  const f = el('input'); f.type = 'file'; f.accept = 'image/*'; f.multiple = true;
  f.addEventListener('change', async () => { for (const file of [...f.files].slice(0, 4 - attach.length)) { try { attach.push(await shrink(file)); } catch { /* not an image it can read */ } } drawAttach(); input.focus(); });
  f.click();
}

/* ---------- the prompt helper, writing to Claude (its rules: src/shared/prompt-coach.js, worked out right here): one hint at
   a time over the input once you stop typing (~400 ms), with chips that edit what you wrote; it never stops a message
   going, and a hint you close or use stays away for the rest of that message. "✨ Viết lại cho rõ" asks Claude itself, on
   the Mac (POST /api/prompt/rewrite: the words only, never the photos), and "Hoàn tác" puts yours back. Off in Settings →
   More → Group chat. ---------- */
let coachEl = null, coachT = 0, rewriting = false, undo = null;   // undo: { before, after } once rewritten, until you change it
const coachOff = new Set();   // the hints closed or used for the message being written
const coachOn = () => { try { return localStorage.getItem('office-coach') !== 'off'; } catch { return true; } };
// (emptied: a new message at once, so a hint closed for the last one may come again; else once you stop typing)
const coachLater = () => { clearTimeout(coachT); if (!input.value.trim() && !attach.length) drawCoach(); else coachT = setTimeout(drawCoach, 400); };
// a chip's change: the input sized to it, the caret where you go on typing, the keyboard kept up
function setDraft(text, caret = text.length) {
  input.value = text; syncBar(); input.style.height = ''; input.style.height = `${Math.min(110, input.scrollHeight)}px`;
  input.focus(); input.setSelectionRange(caret, caret);
}
const addLine = (line) => setDraft(`${input.value.replace(/\s+$/, '')}\n${line}`);
// "Trích lại…": quotes (“”) right after the words that point, the caret between them
function quoteAt(h) {
  const v = input.value, at = h.phrase ? v.indexOf(h.phrase) : -1, end = at < 0 ? v.replace(/\s+$/, '').length : at + h.phrase.length;
  setDraft(`${v.slice(0, end)} “”${v.slice(end)}`, end + 2);
}
const CHIPS = {
  photoBare: ['fixPhoto', 'likePhoto', 'explainPhoto', 'fillPhoto'].map((k) => [k, () => setDraft(`${tr(`chat.coach.chip.${k}Text`)}${input.value.trim()}`)]),
  vague: ['notOld', 'criteria', 'example'].map((k) => [k, () => addLine(tr(`chat.coach.chip.${k}Text`))]),
  dangling: [['quote', quoteAt]],
  multi: [['number', () => setDraft(numberTasks(input.value.trim(), tr('chat.coach.chip.inOrder')))]],
  tooShort: [['result', () => addLine(tr('chat.coach.chip.resultText'))]],
};
function drawCoach() {
  clearTimeout(coachT);
  if (!coachEl || rewriting) return;
  const text = input.value;
  if (!text.trim() && !attach.length) coachOff.clear();   // (a new message: every hint may come again)
  if (undo && text !== undo.after) undo = null;   // (changed since: yours from here on)
  const hint = !undo && target && coachOn() ? coach({ text, photos: attach.length, quoted: !!replyTo, lang: lang() }).find((h) => !coachOff.has(h.id)) : null;
  coachEl.hidden = !hint && !undo;
  if (coachEl.hidden) { coachEl.replaceChildren(); delete coachEl.dataset.hint; return; }
  const chips = el('div', 'zc-coach-chips'), x = el('button', 'zc-ib zc-reply-x zc-coach-x'); x.type = 'button'; x.title = tr('chat.coach.close'); x.append(icon('x'));
  const chip = (k, label, fn, cls = 'zc-coach-c') => {
    const b = el('button', cls, label); b.type = 'button'; b.dataset.k = k;
    b.addEventListener('pointerdown', (e) => e.preventDefault());   // (the input keeps the keyboard up)
    b.addEventListener('click', () => fn(b)); return b;
  };
  coachEl.classList.toggle('is-done', !!undo);
  if (undo) {   // (one line: what happened, "Hoàn tác", ✕)
    coachEl.dataset.hint = 'rewritten';
    chips.append(chip('undo', tr('chat.coach.undo'), () => { const t = undo.before; undo = null; setDraft(t); drawCoach(); }));
    x.addEventListener('click', () => { undo = null; drawCoach(); });
    coachEl.replaceChildren(el('i', 'zc-coach-ic', '✨'), el('span', 'zc-coach-t', tr('chat.coach.rewritten')), chips, x);
    return;
  }
  coachEl.dataset.hint = hint.id;
  const done = () => { coachOff.add(hint.id); coachEl.hidden = true; };   // (hidden until you type again: then the next one, if any)
  for (const [k, fn] of CHIPS[hint.id]) chips.append(chip(k, tr(`chat.coach.chip.${k}`), () => { done(); fn(hint); }));
  x.addEventListener('click', done);
  coachEl.replaceChildren(el('i', 'zc-coach-ic', '💡'), el('span', 'zc-coach-t', tr(`chat.coach.${hint.id}`, { phrase: hint.phrase || '', n: hint.n || 2 })), x, chips);
  // the rewrite on a line of its own under the chips, in violet: it is the one that asks Claude (and spends a little)
  if (text.trim()) { const ai = chip('rewrite', tr('chat.coach.rewrite'), rewrite, 'zc-coach-ai'); ai.title = tr('chat.coach.rewriteTitle'); coachEl.append(ai); }
}
// "✨ Viết lại cho rõ": the input waits (read-only) while Claude rewrites it; what you wrote comes back with "Hoàn tác"
async function rewrite(btn) {
  const before = input.value; if (rewriting || !before.trim()) return;
  rewriting = true; btn.disabled = true; btn.textContent = tr('chat.coach.rewriting'); input.readOnly = true; coachEl.classList.add('is-busy');
  const r = await fetch(`/api/prompt/rewrite${tq()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: before, lang: lang(), photos: attach.length }) }).then((x) => x.json()).catch(() => null);
  rewriting = false; input.readOnly = false; coachEl.classList.remove('is-busy');
  if (r?.ok && r.text && input.value === before) { undo = { before, after: r.text }; setDraft(r.text); }
  else if (!r?.ok) toast(r?.message || tr('drawer.unreachable'), 7000);
  drawCoach();
}

/* ---------- one conversation on its own screen: everything said in it and what Claude did, as in the Claude app, kept up to
   date while open; what you write goes to it (server: GET /api/log, the session's transcript) ---------- */
let conv = null;   // { id, sid, name, folder, timer, sig }
function openConv(t) {
  const s = sessions.get(t.id); if (!s) { toast(tr('chat.conv.gone')); return; }
  closeConv();
  if (target?.sid !== t.sid) setTarget({ id: t.id, sid: t.sid, name: t.name, folder: t.folder });
  conv = { ...t, sig: '' };
  const head = el('div', 'zc-conv-h'), back = el('button', 'zc-ib'); back.type = 'button'; back.title = tr('chat.conv.back'); back.append(icon('chevron'));
  back.addEventListener('click', closeConv);
  const who = el('span', 'zc-men-t'); who.append(el('b', null, t.name), el('small', null, `📁 ${t.folder}`));
  head.append(back, avatar(faceOf(t.id, t.name), 30), who);
  const list = el('div', 'zc-conv-list');
  convEl.replaceChildren(head, list); convEl.hidden = false; body.hidden = true;
  const load = async () => {
    if (!conv || document.hidden) return;
    const p = new URLSearchParams({ id: t.id }); if (TOKEN) p.set('k', TOKEN);
    const r = await fetch(`/api/log?${p}`).then((x) => x.json()).catch(() => null);
    if (!conv || !r?.items) return;
    const sig = `${r.items.length}:${r.items.at(-1)?.ts}:${r.items.at(-1)?.text?.length || 0}`; if (sig === conv.sig) return; conv.sig = sig;
    const atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    list.replaceChildren(...convItems(r.items));
    if (atEnd || !list.dataset.seen) { list.scrollTop = list.scrollHeight; list.dataset.seen = '1'; }
  };
  load(); conv.timer = setInterval(load, 5000);
}
function closeConv() { if (!conv) return; clearInterval(conv.timer); conv = null; convEl.hidden = true; convEl.replaceChildren(); body.hidden = false; body.scrollTop = body.scrollHeight; }
// the transcript's items as the conversation: yours on the right, Claude's (laid out) on the left, its steps as small lines
const STEP_IC = { read: '📖', grep: '🔍', glob: '🔍', edit: '✏️', write: '📝', bash: '▶', cmd: '▶', test: '🧪', web: '🌐', fetch: '🌐', search: '🌐', agent: '🤖', mcp: '🔌', plan: '📋', skill: '📚', todo: '☑️' };
function convItems(items) {
  const out = []; let steps = null;
  for (const it of items) {
    if (it.role === 'tool') {
      if (!steps) { steps = el('div', 'zc-conv-steps'); out.push(steps); }
      steps.append(el('div', null, `${STEP_IC[it.type] || '⚙️'} ${it.label}${it.desc ? ` · ${it.desc}` : ''}`));
      continue;
    }
    steps = null;
    if (it.role === 'note' || it.role === 'summary') {
      const n = el('div', 'zc-sys', it.role === 'summary' ? tr('chat.conv.summary') : it.text);
      if (it.role === 'summary') { n.classList.add('is-click'); n.addEventListener('click', () => { n.replaceWith(Object.assign(el('div', 'zc-conv-sum'), { textContent: it.text })); }); }
      out.push(n); continue;
    }
    const mine = it.role === 'user', r = el('div', `zc-row zc-conv-row${mine ? ' is-mine' : ''} is-first is-last`), b = el('div', 'zc-bub'), txt = el('span', 'zc-text');
    if (mine) txt.textContent = it.text + (it.imgs ? `  🖼×${it.imgs}` : ''); else { txt.classList.add('zc-md'); txt.append(md(it.text)); }
    if (!mine) r.append(el('span', 'zc-av-slot'));
    b.append(txt, el('span', 'zc-time', it.ts ? fmtTime(it.ts) : '')); r.append(b); out.push(r);
  }
  return out;
}
// the list: the group, then each conversation open now (its folder, what it's doing)
async function openPick() {
  if (!pickEl.hidden) { pickEl.hidden = true; return; }
  mentionEl.hidden = moreEl.hidden = stickersEl.hidden = true;
  pickEl.replaceChildren(el('small', 'zc-to-h', tr('chat.to.pick'))); pickEl.hidden = false;
  const r = await fetch(`/api/tasks${tq()}`).then((x) => x.json()).catch(() => null);
  const opt = (face, title, sub, on, pick, off) => {
    const b = el('button', `zc-to-o${on ? ' is-sel' : ''}`); b.type = 'button'; b.disabled = !!off;
    const t = el('span', 'zc-men-t'); t.append(el('b', null, title), el('small', null, sub)); b.append(face, t);
    b.addEventListener('click', pick); return b;
  };
  const items = [opt(el('span', 'zc-to-group', '💬'), tr('chat.to.group'), tr('chat.to.groupSub'), !target, () => setTarget(null))];
  if (r?.ok && !r.allowed) items.push(el('p', 'zc-to-note', tr('chat.to.notAllowed')));
  items.push(el('small', 'zc-to-h', tr('chat.to.sessions')));
  const list = r?.sessions || [];
  if (!list.length) items.push(el('p', 'zc-to-note', r ? tr('chat.to.none') : tr('drawer.unreachable')));
  for (const s of list) {
    const folder = s.dir.split('/').slice(-2).join('/'), st = tr(s.status === 'rest' ? 'chat.memberRest' : s.status === 'wait' ? 'chat.memberWait' : 'chat.memberWork');
    const cw = s.status === 'work' ? '' : cacheWords(s.cache, 'chat').text;   // (at work it is warm anyway)
    const o = opt(avatar(faceOf(s.id, s.name), 30), s.name, `📁 ${folder} · ${st}${cw ? ` · ${cw}` : ''}`, target?.sid === s.sid, () => { setTarget({ id: s.id, sid: s.sid, name: s.name, folder }); input.focus(); }, r && !r.allowed);
    o.dataset.sid = s.sid;
    const see = el('span', 'zc-to-see', '📜'); see.title = tr('chat.conv.open');
    see.addEventListener('click', (e) => { e.stopPropagation(); pickEl.hidden = true; openConv({ id: s.id, sid: s.sid, name: s.name, folder }); });
    o.append(see); items.push(o);
  }
  // a new conversation in a project (the folders sessions have worked in, the latest first): Claude starts fresh there
  if (r?.projects?.length) {
    items.push(el('small', 'zc-to-h', tr('chat.to.newTitle')));
    for (const p of r.projects) {
      const folder = p.dir.split('/').slice(-2).join('/');
      const o = opt(el('span', 'zc-to-group zc-to-proj', '📁'), p.name, p.dir, target?.dir === p.dir, () => { setTarget({ dir: p.dir, name: p.name, folder, fresh: true }); input.focus(); }, r && !r.allowed);
      o.dataset.dir = p.dir; o.append(el('i', 'zc-to-pill', tr('chat.to.newPill'))); items.push(o);
    }
  }
  pickEl.replaceChildren(...items);
}
/* ---------- "Chen lời giữa chừng": a note for a conversation while it works ("sửa luôn test", "sai file rồi, dừng"), from its
   card's 💬 or when "To" finds it busy; Claude reads it between two steps, or it goes once it is done (server: POST
   /api/tasks/steer, server/steer.mjs) ---------- */
function setSteer(x) {
  steerTo = x; if (x) replyTo = null;
  replyEl.hidden = !x && !replyTo;
  root.classList.toggle('is-steer', !!x);
  if (!x) { drawTarget(); return; }   // (its placeholder back)
  replyEl.querySelector('b').textContent = tr('chat.steer.bar', { name: x.name });
  replyEl.querySelector('.zc-reply-t').textContent = tr('chat.steer.hint');
  input.placeholder = tr('chat.steer.placeholder'); input.focus();
}
async function steerSend(to, text) {
  const r = await fetch(`/api/tasks/steer${tq()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task: to.task, sid: to.sid, dir: to.dir, text }) }).then((x) => x.json()).catch(() => null);
  if (r?.ok) return;   // (what happened is said in the group: in now, or kept for when it is done)
  toast(r?.code === 'notAllowed' ? tr('chat.to.notAllowed') : r?.message || tr('drawer.unreachable'), 7000);
  if (!input.value) { input.value = text; syncBar(); }   // (nothing lost: back in the input)
}
// "To" a conversation at work: in now, mid-way, or kept in the input for later
function askSteer(to, text) {
  const ask = el('div', 'zc-ask zc-steer-ask'), yes = el('button', 'zc-ask-yes', tr('chat.steer.yes')), no = el('button', 'zc-ask-no', tr('chat.steer.no'));
  yes.type = no.type = 'button';
  yes.addEventListener('click', () => { ask.remove(); steerSend({ sid: to.sid, dir: to.dir }, text); });
  no.addEventListener('click', () => { ask.remove(); if (!input.value) { input.value = text; syncBar(); } });
  ask.append(el('span', null, tr('chat.steer.ask', { name: to.name })), no, yes);
  body.append(ask); body.scrollTop = body.scrollHeight;
}
async function sendTo(text) {
  const to = target, images = attach.slice(), body = to.dir ? { dir: to.dir, text, images, chat: true, fresh: !!to.fresh } : { sid: to.sid, text, images, chat: true };
  attach = []; drawAttach();
  const r = await fetch(`/api/tasks${tq()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
  if (!r?.ok && images.length) { attach = images; drawAttach(); }   // (not sent: the photos stay)
  if (r?.ok) {
    if (conv) setTimeout(() => { if (conv) conv.sig = ''; }, 1500);   // (the conversation screen: drawn again with it)
    if (to.fresh && target === to) setTarget({ ...to, fresh: false });   // (what you write next carries on that new conversation)
    notifyNudge();
    return;
  }
  if ((r?.code === 'busy' || r?.code === 'macBusy') && !to.fresh) { askSteer(to, text); return; }   // (at work: cut in?)
  toast(r?.code === 'notAllowed' ? tr('chat.to.notAllowed') : r?.message || tr('drawer.unreachable'), 7000);
  if (!input.value) { input.value = text; syncBar(); }   // (nothing lost: back in the input)
}
// on a phone that could get notifications but doesn't: a bar at the top of the chat (one tap turns them on; an iPhone is
// shown how to add the office to its home screen first), until turned on or closed for the day
let notifyBar = null;
async function drawNotifyBar() {
  if (!notifyBar || state.isLocal || DEMO_CHAT) return;
  let gone = false; try { gone = localStorage.getItem('office-notify-bar') === new Date().toDateString(); } catch { /* storage blocked */ }
  const st = gone ? 'gone' : await pushState();
  notifyBar.hidden = !(st === 'off' || st === 'install');
  if (notifyBar.hidden) return;
  const go = el('button', 'zc-nb-go', tr('chat.notifyBarBtn')), x = el('button', 'zc-ib zc-reply-x'); go.type = x.type = 'button'; x.append(icon('x'));
  x.addEventListener('click', () => { notifyBar.hidden = true; try { localStorage.setItem('office-notify-bar', new Date().toDateString()); } catch { /* storage blocked */ } });
  go.addEventListener('click', async () => {
    if (st === 'install') { $('btn-phone')?.click(); return; }   // (the phone window: the steps to the home screen)
    go.disabled = true;
    const r = await pushOn();
    if (r.ok) { toast(tr('topbar.phone.notifyDone')); pushTest(); notifyBar.hidden = true; return; }
    go.disabled = false; toast(tr(r.why === 'denied' ? 'topbar.phone.notifyDenied' : 'topbar.phone.notifyWhy', { why: r.why, detail: r.detail || '' }), 9000);
  });
  notifyBar.replaceChildren(el('span', null, tr(st === 'install' ? 'chat.notifyBarInstall' : 'chat.notifyBar')), go, x);
}
// on a phone that could get notifications but doesn't yet: a word, once a day, that it can know when Claude answers
async function notifyNudge() {
  if (state.isLocal) return;
  try { if (localStorage.getItem('office-notify-nudge') === new Date().toDateString()) return; localStorage.setItem('office-notify-nudge', new Date().toDateString()); } catch { return; }
  const st = await pushState();
  if (st === 'off' || st === 'install') toast(tr(st === 'off' ? 'chat.to.nudgeOn' : 'chat.to.nudgeInstall'), 9000);
}
// a session's project folder, short (its last two parts), and what it's doing now
const folderOf = (s) => { const d = String(s?.dir || '').replace(/\/+$/, ''); return d.split('/').slice(-2).join('/') || d; };
const statusOf = (s) => tr(s.status === 'rest' ? 'chat.memberRest' : s.status === 'wait' ? 'chat.memberWait' : 'chat.memberWork');
// @: every conversation (not only those in the office now), newest first, with its folder and what it's doing; one with
// Remote Control also gets "Giao việc ↗", which opens it in the Claude app (the real way to give it work)
function mentions() {
  const m = /@([^\s@]*)$/.exec(input.value.slice(0, input.selectionStart));
  if (!m) { mentionEl.hidden = true; return; }
  const q = m[1].toLowerCase();
  const list = [...sessions.values()].filter((s) => `${dn(s)} ${s.dir || ''}`.toLowerCase().includes(q)).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)).slice(0, 8);
  if (!list.length) { mentionEl.replaceChildren(el('small', 'zc-men-empty', tr('chat.noSessions'))); mentionEl.hidden = false; return; }
  mentionEl.replaceChildren(...list.map((s) => {
    const row = el('div', 'zc-men-row'), b = el('button', 'zc-men-o'); b.type = 'button';
    const t = el('span', 'zc-men-t'); t.append(el('b', null, dn(s)), el('small', null, `📁 ${folderOf(s)} · ${statusOf(s)}`));
    b.append(avatar(faceOf(s.id, dn(s)), 30), t);
    b.addEventListener('pointerdown', (e) => e.preventDefault());   // (the input keeps the keyboard up)
    b.addEventListener('click', () => { const pos = input.selectionStart, before = input.value.slice(0, pos).replace(/@[^\s@]*$/, `@${dn(s)} `); input.value = before + input.value.slice(pos); input.setSelectionRange(before.length, before.length); mentionEl.hidden = true; syncBar(); input.focus(); });
    const task = el('button', 'zc-men-task'); task.type = 'button'; task.title = tr('chat.task.title'); task.append(icon('clipboard'));
    task.addEventListener('pointerdown', (e) => e.preventDefault());
    task.addEventListener('click', () => { mentionEl.hidden = true; openTaskSheet(root, { to: { id: s.id }, text: input.value.replace(/@[^\s@]*$/, '').trim() }); });
    row.append(b, task);
    if (s.link) { const go = el('a', 'zc-men-go', tr('chat.giveWork')); go.href = s.link; go.target = '_blank'; go.rel = 'noopener'; row.append(go); }
    return row;
  }));
  mentionEl.hidden = false;
}
// the panel under the input: stickers (sent at once) or emoji (into the text), the way the app has both behind 😊
function drawStickers() {
  const tabs = el('div', 'zc-stk-tabs');
  for (const [k, label] of [['sticker', 'chat.stickerTab'], ['emoji', 'chat.emojiTab']]) {
    const b = el('button', `zc-stk-tab${stickTab === k ? ' is-on' : ''}`, tr(label)); b.type = 'button'; b.addEventListener('click', () => { stickTab = k; drawStickers(); }); tabs.append(b);
  }
  const grid = el('div', stickTab === 'sticker' ? 'zc-stk-grid' : 'zc-emo-grid');
  if (stickTab === 'sticker') grid.append(...tr('chat.stickers', null, 'list').map((cap, i) => {
    const b = el('button', 'zc-stk'); b.type = 'button'; b.title = cap; const img = el('img'); img.src = stickerUrl(i); img.alt = cap; b.append(img);
    b.addEventListener('click', () => { stickersEl.hidden = true; chatSend('', { sticker: i, replyTo: replyTo?.id }); setReply(null); });
    return b;
  }));
  else grid.append(...EMOJI.map((e) => { const b = el('button', 'zc-emo', e); b.type = 'button'; b.addEventListener('click', () => { input.setRangeText(e, input.selectionStart, input.selectionEnd, 'end'); syncBar(); input.focus(); }); return b; }));
  stickersEl.replaceChildren(tabs, grid);
}
// ••• : a poll of your own (a question and up to four choices), or @ someone
function drawMore() {
  const form = el('form', 'zc-more-poll'), q = el('input', 'zc-more-in'); q.placeholder = tr('chat.pollAsk'); q.maxLength = 120; q.required = true;
  const opts = [0, 1, 2, 3].map((i) => { const o = el('input', 'zc-more-in'); o.placeholder = `${i + 1}.`; o.maxLength = 60; o.required = i < 2; return o; });
  const go = el('button', 'zc-card-btn', tr('chat.newPoll')); go.type = 'submit';
  form.append(el('b', null, `📊 ${tr('chat.newPoll')}`), q, ...opts, go);
  form.addEventListener('submit', (e) => { e.preventDefault(); const list = opts.map((o) => o.value.trim()).filter(Boolean); if (!q.value.trim() || list.length < 2) return; moreEl.hidden = true; chatPoll(q.value.trim(), list); });
  for (const inp of [q, ...opts]) inp.addEventListener('keydown', (e) => e.stopPropagation());
  const at = el('button', 'zc-more-o'); at.type = 'button'; at.append(icon('at'), el('span', null, tr('chat.mention')));
  at.addEventListener('click', () => { moreEl.hidden = true; input.focus(); input.setRangeText(input.value && !/\s$/.test(input.value) ? ' @' : '@', input.selectionStart, input.selectionEnd, 'end'); mentions(); });
  const task = el('button', 'zc-more-o'); task.type = 'button'; task.append(icon('clipboard'), el('span', null, tr('chat.task.title')));
  task.addEventListener('click', () => { moreEl.hidden = true; openTaskSheet(root); });
  // what eats the plan (ui/burn.js): from the chat too, so a phone reaches it
  const burn = el('button', 'zc-more-o'); burn.type = 'button'; burn.append(icon('chart'), el('span', null, tr('burn.open')));
  burn.addEventListener('click', () => { moreEl.hidden = true; openBurn(); });
  // every conversation's words, kept after Claude Code deletes them (ui/vault.js)
  const vault = el('button', 'zc-more-o'); vault.type = 'button'; vault.append(icon('book'), el('span', null, tr('vault.open')));
  vault.addEventListener('click', () => { moreEl.hidden = true; openVault(); });
  moreEl.replaceChildren(task, burn, vault, at, form);
}
function drawMembers() {
  const rows = [];
  const add = (p, note, link) => {
    const r = el('div', 'zc-mem'), t = el('span', 'zc-mem-t'); t.textContent = p.name; r.append(avatar(p, 40), t, el('small', null, note));
    // a session with Remote Control: give it work in the Claude app (the real way to prompt it from here)
    if (link) { const a = el('a', 'zc-mem-go', tr('chat.giveWork')); a.href = link; a.target = '_blank'; a.rel = 'noopener'; r.append(a); }
    rows.push(r);
  };
  add({ ...meP(), name: `${tr('chat.boss')} (${tr('chat.you')})` }, tr('chat.memberYou'));
  for (const s of [...sessions.values()].sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))) add(faceOf(s.id, dn(s)), `${statusOf(s)} · 📁 ${folderOf(s)}`, s.link);
  for (const k of ['reception', 'hr', 'accountant', 'cleaner']) { const p = who(k); if (p) add(p, tr('chat.memberStaff')); }
  membersEl.replaceChildren(el('b', 'zc-mem-h', `${tr('chat.membersTitle')} (${rows.length})`), ...rows, el('p', 'zc-mem-note', tr('chat.note')));
}
const ib = (name, title, fn, cls = '') => { const b = el('button', `zc-ib ${cls}`); b.type = 'button'; b.title = title; b.append(icon(name)); if (fn) b.addEventListener('click', fn); else { b.disabled = true; b.classList.add('is-deco'); } return b; };
const only = (box) => { for (const x of [stickersEl, moreEl]) if (x !== box) x.hidden = true; };
const openStickers = (tab) => { only(stickersEl); if (!stickersEl.hidden && stickTab === tab) { stickersEl.hidden = true; return; } stickTab = tab; stickersEl.hidden = false; drawStickers(); };
const openMore = () => { only(moreEl); moreEl.hidden = !moreEl.hidden; if (!moreEl.hidden) drawMore(); };

function build() {
  root = el('section', 'zc'); root.id = 'zchat'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', tr('chat.group'));
  // the bar: on a computer white, the group's picture, its name and members, then search, call, video, the info panel
  // and a close; on a phone the blue one, with back, call, video and ☰ (group-chat.css swaps them)
  const head = el('header', 'zc-head');
  headSub = el('small', 'zc-sub'); headAv = el('span', 'zc-head-av zc-pc');
  const title = el('div', 'zc-title'), sub = el('span', 'zc-subline'); sub.append(icon('users'), headSub);
  title.append(el('b', null, tr('chat.group')), sub);
  const members = () => { membersEl.hidden = !membersEl.hidden; if (!membersEl.hidden) drawMembers(); };
  head.append(ib('back', tr('chat.close'), () => toggle(false), 'zc-back zc-mo'), headAv, title,
    ib('search', '', null, 'zc-pc'), ib('call', ''), ib('video', ''), ib('panel', tr('chat.membersTitle'), members, 'zc-pc'), ib('menu', tr('chat.membersTitle'), members, 'zc-mo'), ib('x', tr('chat.close'), () => toggle(false), 'zc-pc zc-close'));
  pinEl = el('button', 'zc-pin'); pinEl.type = 'button'; pinEl.hidden = true;
  const pinText = el('span', 'zc-pin-x'); pinText.append(el('b', null, tr('chat.pinned')), el('span', 'zc-pin-t'));
  const pinIc = el('span', 'zc-pin-ic'); pinIc.append(icon('pinbar'));
  pinEl.append(pinIc, pinText, el('span', 'zc-pin-more zc-pc', '···'));
  pinEl.addEventListener('click', () => flash(chat.pinned));
  body = el('div', 'zc-body');
  body.addEventListener('scroll', () => { if (atBottom()) { newBtn.hidden = true; newBtn.dataset.n = '0'; } }, { passive: true });
  newBtn = el('button', 'zc-new'); newBtn.type = 'button'; newBtn.hidden = true; newBtn.addEventListener('click', () => { body.scrollTop = body.scrollHeight; });
  typingEl = el('div', 'zc-typing'); typingEl.hidden = true; typingEl.append(el('i', 'zc-dots'), el('span'));
  mentionEl = el('div', 'zc-men'); mentionEl.hidden = true;
  stickersEl = el('div', 'zc-stks'); stickersEl.hidden = true;
  moreEl = el('div', 'zc-more'); moreEl.hidden = true;
  // answering a message: "Trả lời <tên>" over the input, with what it says and an ✕
  replyEl = el('div', 'zc-reply'); replyEl.hidden = true;
  const replyX = el('button', 'zc-ib zc-reply-x'); replyX.type = 'button'; replyX.title = tr('chat.cancel'); replyX.append(icon('x')); replyX.addEventListener('click', () => { setReply(null); if (steerTo) setSteer(null); });
  const replyText = el('span', 'zc-reply-q'); replyText.append(el('b'), el('span', 'zc-reply-t'));
  replyEl.append(icon('reply'), replyText, replyX);
  // a computer's toolbar over the input: stickers, a photo of the office, a file, a card, a poll, @, more
  const photoBtn = (cls) => { const b = ib('image', tr('chat.sendPhoto'), () => (target ? pickPhotos() : chatSendPhoto()), `${cls} zc-photo-btn`); b.hidden = !state.isLocal; return b; };   // (to the group: a photo of the office as it is now, taken on the Mac; to Claude: one of yours)
  const atBtn = () => { moreEl.hidden = true; input.focus(); input.setRangeText(input.value && !/\s$/.test(input.value) ? ' @' : '@', input.selectionStart, input.selectionEnd, 'end'); mentions(); };
  const toolbar = el('div', 'zc-toolbar zc-pc');
  toolbar.append(ib('smile', tr('chat.stickerTab'), () => openStickers('sticker')), photoBtn(''), ib('clip', ''), ib('card', ''), ib('chart', tr('chat.newPoll'), openMore), ib('at', tr('chat.mention'), atBtn),
    ib('clipboard', tr('chat.task.title'), () => openTaskSheet(root), 'zc-task-btn'), ib('format', ''), ib('more', tr('chat.more'), openMore));
  bar = el('form', 'zc-bar');
  input = el('textarea', 'zc-in'); input.rows = 1; input.maxLength = 600;
  input.placeholder = tr(matchMedia('(max-width: 640px)').matches ? 'chat.placeholder' : 'chat.placeholderPc', { group: tr('chat.group') });
  input.addEventListener('input', () => { syncBar(); mentions(); input.style.height = ''; input.style.height = `${Math.min(110, input.scrollHeight)}px`; coachLater(); if (keepChip) keepChip.hidden = !canKeep(); });
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } if (e.key === 'Escape') { if (steerTo) setSteer(null); else if (replyTo) setReply(null); else toggle(false); } });
  // the phone's 🎤: speak into the input (the browser's speech recognition, in the office's language)
  let stopMic = null;
  const micBtn = ib('mic', tr('chat.task.mic'), () => { if (stopMic) { stopMic(); stopMic = null; } else stopMic = dictate(micBtn, input, () => { syncBar(); input.dispatchEvent(new Event('input')); }); }, 'zc-mo zc-when-empty zc-mic');
  const like = el('button', 'zc-like-send zc-pc zc-when-empty', '👍'); like.type = 'button'; like.title = tr('chat.like'); like.addEventListener('click', () => { chatSend('👍', { replyTo: replyTo?.id }); setReply(null); });
  const sendBtn = el('button', 'zc-send'); sendBtn.type = 'submit'; sendBtn.title = tr('chat.send'); sendBtn.append(icon('send'), el('span', 'zc-send-t', tr('chat.sendPc')));
  bar.append(ib('smile', tr('chat.sticker'), () => openStickers('sticker'), 'zc-mo'), input,
    ib('more', tr('chat.more'), openMore, 'zc-mo zc-when-empty'), micBtn, photoBtn('zc-mo zc-when-empty'),
    ib('smile', tr('chat.emojiTab'), () => openStickers('emoji'), 'zc-pc'), like, sendBtn);
  bar.addEventListener('submit', (e) => { e.preventDefault(); send(); });
  membersEl = el('aside', 'zc-mems'); membersEl.hidden = true;
  // what this chat is (and isn't): a word over the input until you close it
  const hint = el('div', 'zc-hint'), hintX = el('button', 'zc-ib zc-reply-x'); hintX.type = 'button'; hintX.title = tr('chat.close'); hintX.append(icon('x'));
  hint.append(el('span', null, tr('chat.hintRc')), hintX);
  try { hint.hidden = localStorage.getItem('office-chat-hint') === 'seen'; } catch { /* storage blocked */ }
  hintX.addEventListener('click', () => { hint.hidden = true; try { localStorage.setItem('office-chat-hint', 'seen'); } catch { /* storage blocked */ } });
  toEl = el('div', 'zc-to'); toEl.hidden = DEMO_CHAT; pickEl = el('div', 'zc-to-pick'); pickEl.hidden = true;
  quickEl = el('div', 'zc-quick'); quickEl.hidden = true; attachEl = el('div', 'zc-attach'); attachEl.hidden = true;
  coachEl = el('div', 'zc-coach'); coachEl.hidden = true; coachEl.setAttribute('role', 'status'); coachEl.setAttribute('aria-label', tr('chat.coach.label'));
  convEl = el('div', 'zc-conv'); convEl.hidden = true;
  if (!DEMO_CHAT) loadQuick();
  notifyBar = el('div', 'zc-nbar'); notifyBar.hidden = true;
  root.append(head, notifyBar, pinEl, body, convEl, newBtn, typingEl, mentionEl, replyEl, hint, stickersEl, moreEl, toolbar, pickEl, quickEl, attachEl, coachEl, toEl, bar, membersEl);
  drawTarget();
  $('app').append(root);
}
export function toggle(on = !chat.open) {
  if (!root) build();
  if (!on) readTo = [...chat.msgs].reverse().find((m) => m.kind !== 'sys')?.id || null;   // (where to draw "Tin nhắn mới" next time)
  root.hidden = !on; setOpen(on); $('btn-chat')?.setAttribute('aria-pressed', String(on));
  state.covered = on && document.documentElement.classList.contains('is-phone');   // (full screen on a phone: the office under it barely draws)
  if (on) {
    redraw(); drawTyping();
    const line = body.querySelector('.zc-newline');
    if (line) line.scrollIntoView({ block: 'center' }); else body.scrollTop = body.scrollHeight;
    $('zc-peek')?.setAttribute('hidden', ''); fitKeyboard(); setTimeout(() => input.focus({ preventScroll: true }), 30);
    drawNotifyBar();
  }
  badge();
}
function fitKeyboard() {
  const vv = window.visualViewport;
  if (!root || root.hidden || !vv || !matchMedia('(max-width: 640px)').matches) { if (root) { root.style.height = ''; root.style.top = ''; } return; }
  root.style.top = `${vv.offsetTop}px`; root.style.height = `${vv.height}px`;
  if (document.activeElement === input) body.scrollTop = body.scrollHeight;
}
export function setup() {
  window.visualViewport?.addEventListener('resize', fitKeyboard); window.visualViewport?.addEventListener('scroll', fitKeyboard);
  $('btn-chat')?.addEventListener('click', () => toggle());
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && chat.open && !e.defaultPrevented) toggle(false); });
  badge();
}
