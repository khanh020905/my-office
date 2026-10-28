// The week in review: a 1080 × 1350 picture card (the office as it looks right now, then the week's numbers) to save as
// a PNG or copy, for sharing. The numbers come from /api/wrapped (the server reads its own replay logs); the demo
// makes up a plausible week. In streamer mode project names are left out.
import { state } from '../core/state.js';
import { $ } from '../core/env.js';
import { renderer } from '../scene/renderer.js';
import { drawFrame } from '../scene/quality.js';
import { OFFICE_MARK } from '../world/pro/pieces.js';
import { DEMO } from '../demo/demo.js';
import { TOKEN } from '../net/live.js';
import { toast } from './activity.js';
import { t as tr, num, locale } from '../../i18n/index.js';

const W = 1080, H = 1350;
// weekday 0 is Sunday; 1 Jan 2023 was one
const weekdayName = (i) => (Number.isInteger(i) && i >= 0 && i < 7 ? new Intl.DateTimeFormat(locale(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + i))) : '');
const ddmm = (day) => { const [, m, d] = String(day || '').split('-'); return d ? tr('wrapped.date', { d, m }) : ''; };
// hours as shown (one decimal): the number that picks the plural matches the one on the card
const hrs = (x) => { const n = Math.round((Number(x) || 0) * 10) / 10; return { n, h: num(n, 1) }; };
let lastData = null;

const demoWeek = () => ({ from: '2026-10-21', to: '2026-10-27', days: 7, hoursSum: 63.4, hoursWall: 38.2, waitHours: 9.6, stats: { prompts: 312, edit: 1840, read: 4210, cmd: 2985, web: 140, deploy: 9 },
  commits: 46, pushes: 21, longestMin: 214, cost: 412.5, sessions: 27, projects: [{ name: 'landing-page', hours: 21.3 }, { name: 'shop-api', hours: 17.8 }], busiest: { day: '2026-10-23', weekday: 4, hours: 14.2 } });

// the office right now: draw a frame and copy it in the same task, before the browser clears the canvas
function officeShot() {
  drawFrame();
  return renderer.domElement;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function draw(d, shot) {
  const c = $('wrap-canvas'), g = c.getContext('2d'), F = '"Be Vietnam Pro", system-ui, sans-serif';
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1C1638'); bg.addColorStop(0.55, '#121A2E'); bg.addColorStop(1, '#0D1322');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (const [x, y, r, col] of [[930, 120, 380, 'rgba(217, 119, 87, .22)'], [120, 980, 420, 'rgba(140, 79, 168, .22)']]) { const gl = g.createRadialGradient(x, y, 0, x, y, r); gl.addColorStop(0, col); gl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gl; g.fillRect(0, 0, W, H); }
  // header: the mark, the name, the week
  g.save(); g.translate(60, 52); g.scale(2.6, 2.6); g.fillStyle = '#E8865F'; g.fill(new Path2D(OFFICE_MARK), 'evenodd'); g.restore();
  g.fillStyle = '#F6EFE4'; g.font = `800 34px ${F}`; g.textBaseline = 'middle'; g.fillText('My Office', 136, 84);
  g.fillStyle = '#A9B1C4'; g.font = `600 28px ${F}`; g.textAlign = 'right'; g.fillText(d.from === d.to ? ddmm(d.to) : `${ddmm(d.from)} – ${ddmm(d.to)}`, W - 60, 84); g.textAlign = 'left';
  g.fillStyle = '#FFFFFF'; g.font = `800 64px ${F}`; g.fillText(tr('wrapped.title'), 60, 178);
  // the office picture, cropped to fill its frame
  const fx = 60, fy = 236, fw = W - 120, fh = 470;
  g.save(); roundRect(g, fx, fy, fw, fh, 28); g.clip();
  if (shot) { const s = Math.max(fw / shot.width, fh / shot.height), sw = fw / s, sh = fh / s; g.drawImage(shot, (shot.width - sw) / 2, (shot.height - sh) / 2, sw, sh, fx, fy, fw, fh); }
  g.restore(); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; roundRect(g, fx, fy, fw, fh, 28); g.stroke();
  // the headline number
  g.fillStyle = '#FFB86B'; g.font = `800 120px ${F}`; g.fillText(tr('wrapped.hours', hrs(d.hoursSum)), 60, 788);
  g.fillStyle = '#DCE3F0'; g.font = `600 30px ${F}`; g.fillText(tr('wrapped.worked', hrs(d.hoursWall)), 64, 884);
  g.fillStyle = '#8D97AA'; g.font = `500 26px ${F}`; g.fillText(`${tr('wrapped.waited', hrs(d.waitHours))} · ${tr('wrapped.sessions', { n: d.sessions || 0, c: num(d.sessions) })}`, 64, 926);
  // four tiles
  const tiles = [[num(d.stats?.prompts), tr('wrapped.prompts')], [num(d.stats?.edit), tr('wrapped.edits')], [num(d.stats?.cmd), tr('wrapped.cmds')], [`$${num(d.cost)}`, tr('wrapped.cost')]];
  tiles.forEach(([v, k], i) => {
    const x = 60 + i * 245, y = 972;
    roundRect(g, x, y, 225, 150, 22); g.fillStyle = 'rgba(255,255,255,.06)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.10)'; g.stroke();
    g.fillStyle = '#FFFFFF'; g.font = `800 ${v.length > 6 ? 40 : 50}px ${F}`; g.fillText(v, x + 22, y + 60);
    g.fillStyle = '#A9B1C4'; g.font = `600 24px ${F}`; g.fillText(k, x + 22, y + 112);
  });
  // the week's highlights
  const top = d.projects?.[0], lines = [
    top ? tr('wrapped.topProject', { name: state.streamer ? tr('wrapped.aProject') : top.name, ...hrs(top.hours) }) : null,
    d.busiest ? tr('wrapped.busiestDay', { day: weekdayName(d.busiest.weekday), date: ddmm(d.busiest.day) }) : null,
    d.longestMin ? tr('wrapped.longest', { time: d.longestMin >= 60 ? tr('time.hourMin', { h: Math.floor(d.longestMin / 60), m: d.longestMin % 60 }) : tr('time.min', { n: d.longestMin }) }) : null,
    d.commits || d.pushes ? `${tr('wrapped.commits', { n: d.commits || 0, c: num(d.commits) })} · ${tr('wrapped.pushes', { n: d.pushes || 0, c: num(d.pushes) })}` : null,
  ].filter(Boolean).slice(0, 3);
  g.fillStyle = '#E6EBF5'; g.font = `600 30px ${F}`;
  lines.forEach((t, i) => g.fillText(t, 60, 1170 + i * 48));
  g.fillStyle = '#5E6880'; g.font = `500 22px ${F}`; g.textAlign = 'right'; g.fillText(tr('wrapped.footer'), W - 60, H - 40); g.textAlign = 'left';
}

async function open() {
  const modal = $('wrap-modal'); modal.hidden = false;
  $('wrap-note').textContent = tr('wrapped.loading');
  const shot = document.createElement('canvas'), src = officeShot();   // copy the frame now, the fetch takes a moment
  shot.width = src.width; shot.height = src.height; shot.getContext('2d').drawImage(src, 0, 0);
  let d;
  if (DEMO) d = demoWeek();
  else {
    try { d = await (await fetch(`/api/wrapped${TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : ''}`)).json(); }
    catch { $('wrap-note').textContent = tr('wrapped.loadFailed'); return; }
  }
  lastData = d;
  // canvas text does not wait for web fonts: load the weights the card uses first (the sample text pulls in both the Latin
  // and the Vietnamese subsets)
  await Promise.all(['800 40px', '600 30px', '500 26px'].map((f) => document.fonts.load(`${f} "Be Vietnam Pro"`, 'Tuần ờ'))).catch(() => {});
  draw(d, shot);
  $('wrap-note').textContent = d.days < 7 ? tr('wrapped.partial', { n: d.days }) : tr('wrapped.full');
}
const fileName = () => tr('wrapped.fileName', { date: lastData?.to || tr('wrapped.fileNow') });
function save() {
  $('wrap-canvas').toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fileName(); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, 'image/png');
}
function copy() {
  $('wrap-canvas').toBlob(async (b) => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast(tr('wrapped.copied')); }
    catch { toast(tr('wrapped.copyFailed', { button: tr('ui.wrapped.save') })); }
  }, 'image/png');
}

export function setup() {
  $('wrap-open').addEventListener('click', open);
  $('wrap-save').addEventListener('click', save);
  $('wrap-copy').addEventListener('click', copy);
  const modal = $('wrap-modal');
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) modal.hidden = true; });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) modal.hidden = true; });
}
