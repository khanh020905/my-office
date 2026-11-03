// Small formatters the panel shares (the office's own live in src/office/core/env.js, which pulls in the 3D world).
import { t as tr, num } from '../i18n/index.js';

export const GB = 1024 ** 3;
export const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const pad2 = (n) => String(n).padStart(2, '0');
export const hhmm = (ts) => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
export const fmtBytes = (b) => (b >= GB ? tr('time.gb', { n: num(b / GB, b >= 10 * GB ? 0 : 1) }) : tr('time.mb', { n: num(Math.max(1, Math.round(b / 1024 ** 2))) }));
export const level = (pct) => (pct >= 95 ? 'critical' : pct >= 80 ? 'warn' : 'ok');
// "at 14:00" today, else weekday + date + time
export function resetText(ts) {
  const d = new Date(ts), now = new Date(), t = hhmm(ts);
  if (d.toDateString() === now.toDateString()) return tr('mac.plan.at', { time: t });
  return tr('mac.plan.date', { day: tr('mac.plan.weekdays', null, 'list')[d.getDay()], d: pad2(d.getDate()), m: pad2(d.getMonth() + 1), time: t });
}
