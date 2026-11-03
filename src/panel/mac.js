// The Mac, in the panel: RAM, swap, CPU and disk, why it is slow in one sentence, and the few fixes that help most with
// the same buttons as the office's drawer (src/office/ui/mac-drawer.js: confirm first, a stuck process asks again to be
// forced). Read only while the panel is on screen: every 10 s opened, every minute folded (only its RAM % shows then; an
// editor's side bar counts as on screen all day, and /api/sys runs `ps`; the server keeps a reading 3 s).
import { t as tr } from '../i18n/index.js';
import { GB, el, fmtBytes } from './fmt.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const lvl = (p, warn, crit) => (p >= crit ? 'critical' : p >= warn ? 'warn' : 'normal');
const KEY = 'panel-mac-open';
let snap = null, open = false, box = null, ctx = null, timer = 0, ctl = null, note = '', noteTimer = 0, confirmKey = null, confirmTimer = 0;
const busy = new Set(), stubborn = new Map();
try { open = localStorage.getItem(KEY) === '1'; } catch { /* private mode */ }

function verdictKey(s) {
  const swap = s.mem.swapUsed;
  if (s.mem.pressure === 'critical') return swap > GB ? 'critical' : 'squeeze';
  if (s.mem.pressure === 'warn') return swap > GB ? 'swap' : 'squeeze';
  if (swap > 4 * GB) return 'swapLeft';
  if (s.diskTight) return 'disk';
  if (s.cpu.percent > 85) return 'cpu';
  return 'ok';
}
const idleTips = (s) => { const pids = new Set((s.claude || []).map((c) => c.pid)); return (s.tips || []).filter((t) => t.action === 'kill' && pids.has(t.target)); };
// who holds the most RAM: apps, the Claude sessions together, dev servers
function holders(s) {
  const list = (s.apps || []).filter((a) => a.name !== 'Claude Code').map((a) => ({ name: a.name, mem: a.mem }));
  const sess = (s.apps || []).find((a) => a.name === 'Claude Code')?.mem || (s.claude || []).reduce((a, c) => a + c.mem, 0);
  if (sess) list.push({ name: tr('mac.held.sessions'), mem: sess });
  const dev = (s.devServers || []).reduce((a, d) => a + d.mem, 0);
  if (dev) list.push({ name: tr('mac.held.dev'), mem: dev });
  return list.sort((a, b) => b.mem - a.mem).slice(0, 3);
}
function meter(name, big, ratio, lv) {
  const m = el('div', 'pn-meter'), bar = el('span', 'pn-meter-bar'), fill = el('i'); bar.dataset.level = lv;
  fill.style.width = `${Math.min(100, Math.max(2, ratio * 100))}%`; bar.append(fill);
  m.append(el('span', null, name), bar, el('b', null, big));
  return m;
}

/* ---------- the fixes ---------- */
async function act(key, body) {
  const r = await fetch(ctx.q('/api/sys/action'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
  say(r ? r.message || (r.ok ? tr('mac.action.done') : tr('mac.action.failed')) : tr('mac.action.unreachable'));
  if (r?.stubborn) stubborn.set(key, body); else stubborn.delete(key);
}
function say(text) { note = text; clearTimeout(noteTimer); noteTimer = setTimeout(() => { note = ''; render(); }, 8000); }
function button(key, verb, run, o = {}) {
  const b = el('button', `pn-btn${o.cls ? ` ${o.cls}` : ''}`, verb); b.type = 'button'; b.dataset.fk = key;
  if (busy.has(key)) { b.textContent = tr('mac.action.working'); b.disabled = true; return b; }
  if (confirmKey === key) { b.textContent = o.confirm || tr('mac.action.sure', { verb }); b.classList.add(o.force ? 'pn-btn--no' : 'pn-btn--ok'); }
  b.addEventListener('click', () => {
    if (confirmKey !== key) { confirmKey = key; clearTimeout(confirmTimer); confirmTimer = setTimeout(() => { confirmKey = null; render(); }, 4500); render(); return; }
    confirmKey = null; busy.add(key); render();
    run().finally(() => { busy.delete(key); poll(); });
  });
  return b;
}
function fix(key, body, verb, o) {
  if (stubborn.has(key)) return button(`${key}:force`, tr(body.action === 'quit' ? 'mac.action.forceQuit' : 'mac.action.forceStop'), () => act(key, { ...body, force: true }), { force: true, confirm: tr('mac.action.sureForce') });
  return button(key, verb, () => act(key, body), o);
}

/* ---------- drawing ---------- */
function render() {
  if (!box) return;
  const focus = box.contains(document.activeElement) ? document.activeElement.dataset?.fk || (document.activeElement.classList.contains('pn-mac-h') ? '' : null) : null;
  const head = el('button', 'pn-mac-h'); head.type = 'button'; head.setAttribute('aria-expanded', String(open));
  head.append(el('span', 'pn-mac-t', tr('panel.mac.title')));
  if (snap?.mem) {
    const ram = pct(snap.mem.used, snap.mem.total), lv = snap.mem.pressure === 'critical' ? 'critical' : snap.tight ? 'warn' : 'normal';
    const sum = el('span', 'pn-mac-sum', `RAM ${ram}%`); sum.dataset.level = lv; head.append(sum);
  }
  head.append(el('i', 'pn-mac-chev'));
  head.addEventListener('click', () => { open = !open; try { localStorage.setItem(KEY, open ? '1' : '0'); } catch { /* private mode */ } render(); sync(); });
  const parts = [head];
  if (open) {
    if (!snap?.mem) parts.push(el('p', 'pn-empty', tr('mac.measuring')));
    else {
      const s = snap, key = verdictKey(s), lv = key === 'ok' ? 'normal' : key === 'swapLeft' || key === 'disk' || key === 'cpu' || key === 'squeeze' ? 'warn' : 'critical';
      const v = el('div', 'pn-verdict'); v.dataset.level = lv;
      v.append(el('i', 'pn-vdot'), el('span', null, tr(`mac.verdict.${key}`, { swap: fmtBytes(s.mem.swapUsed), free: fmtBytes(s.disk.free), pct: key === 'cpu' ? s.cpu.percent : pct(s.mem.used, s.mem.total) })));
      parts.push(v);
      const who = holders(s);
      if (key !== 'ok' && key !== 'disk' && who.length) parts.push(el('p', 'pn-who', tr('mac.verdict.who', { list: who.map((g) => `${g.name} ${fmtBytes(g.mem)}`).join(' · ') })));
      const m = el('div', 'pn-meters');
      m.append(
        meter('RAM', `${pct(s.mem.used, s.mem.total)}%`, s.mem.used / s.mem.total, s.mem.pressure === 'critical' ? 'critical' : s.tight ? 'warn' : 'normal'),
        meter('Swap', s.mem.swapTotal ? fmtBytes(s.mem.swapUsed) : '0', s.mem.swapTotal ? s.mem.swapUsed / s.mem.swapTotal : 0, s.mem.swapUsed > 8 * GB ? 'critical' : s.mem.swapUsed > 2 * GB ? 'warn' : 'normal'),
        meter('CPU', `${s.cpu.percent}%`, s.cpu.percent / 100, lvl(s.cpu.percent, 60, 85)),
        meter(tr('mac.meter.disk'), `${pct(s.disk.used, s.disk.total)}%`, s.disk.used / s.disk.total, s.diskTight ? 'warn' : 'normal'),
      );
      parts.push(m);
      // the fixes: close every idle session at once, then the few other tips that free RAM (apps are never quit in bulk)
      const idle = idleTips(s), idleIds = new Set(idle.map((t) => t.id)), acts = el('div', 'pn-fixes');
      if (idle.length) {
        const n = idle.length, gain = idle.reduce((a, t) => a + t.gain, 0);
        acts.append(button('closeIdle', tr('mac.verdict.closeIdle', { n, size: fmtBytes(gain) }), () => act('closeIdle', { action: 'closeIdle', items: idle.map((t) => ({ target: t.target, start: t.start })) }), { cls: 'pn-btn--wide', confirm: tr('mac.verdict.closeIdleSure', { n }) }));
      }
      for (const t of (s.tips || []).filter((x) => x.action && !x.disk && !idleIds.has(x.id) && x.action !== 'quit' && x.id !== 'info:ide').slice(0, 3)) {
        const row = el('div', 'pn-fix'), txt = el('span', 'pn-fix-t'); txt.append(el('b', null, t.title), el('small', null, tr('mac.tips.gainRam', { size: fmtBytes(t.gain) })));
        row.append(txt, fix(t.id, { action: t.action, target: t.target, start: t.start }, t.verb)); acts.append(row);
      }
      if (acts.childNodes.length) parts.push(acts);
    }
    if (note) parts.push(el('p', 'pn-note', note));
  }
  box.replaceChildren(...parts);
  box.dataset.open = open ? '1' : '0';
  if (focus != null) (focus ? box.querySelector(`[data-fk="${CSS.escape(focus)}"]`) : box.querySelector('.pn-mac-h'))?.focus({ preventScroll: true });
}

/* ---------- reading, only while looked at ---------- */
async function poll() {
  ctl?.abort(); ctl = new AbortController();
  try {
    const r = await fetch(ctx.q('/api/sys'), { signal: ctl.signal });
    if (!r.ok) return;
    const d = await r.json();
    if (d?.mem) snap = d;
  } catch { return; }
  if (!document.querySelector('.pn-mac button:active')) render();
}
function sync() {
  clearInterval(timer); timer = 0;
  if (document.visibilityState !== 'visible') { ctl?.abort(); return; }
  poll(); timer = setInterval(poll, open ? 10_000 : 60_000);
}
/** the section's own element (kept by the page across its redraws); ctx = { q } adds the access token to a path */
export function startMac(node, c) {
  box = node; ctx = c; render(); sync();
  document.addEventListener('visibilitychange', sync);
}
