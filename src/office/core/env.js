// Page-wide basics: DOM helpers, the floor plan choice, replay clock, office clock, season, formatting.
import * as THREE from 'three';
import { t, num } from '../../i18n/index.js';

export const $ = (id) => document.getElementById(id);
// The online demo: a static export with no server behind it (next.config.mjs, OFFICE_STATIC=1). It always runs demo mode.
export const STATIC = process.env.NEXT_PUBLIC_OFFICE_STATIC === '1';
export let stage;
export let reduceMotion;
export let LAYOUT;
export let PRO;
export let HQ;
export const PLANS = ['cozy', 'pro', 'hq'];
export let small;
export const V2 = THREE.Vector2;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const short = (s, n = 30) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
export const pad2 = (n) => String(n).padStart(2, '0');
// While replaying, "now" is the replay clock, so durations and "N min ago" read as they did at that moment.
export const replay = { on: false, playing: false, speed: 60, clock: 0, from: 0, to: 0, items: [], i: 0, range: '1h', last: 0, loading: false, ended: false };
export const nowMs = () => (replay.on ? replay.clock : Date.now());
let AT_SHIFT;
export const officeNow = () => new Date(nowMs() + AT_SHIFT);
// Decorations by date: Halloween (20/10–1/11), Christmas (12/12–31/12), Tết (two weeks before the lunar new year to
// a week after). Settings → "Seasonal decorations" turns it off; ?season=halloween|noel|tet|none overrides it.
const TET = { 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03', 2031: '01-23', 2032: '02-11', 2033: '01-31' };
export let SEASON;
export const hhmm = (ts = nowMs(), sec = false) => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}` + (sec ? `:${pad2(d.getSeconds())}` : ''); };
export const tint = (hex, amt) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), amt).getHexString();
export const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
export const GB = 1024 ** 3;
export const fmtBytes = (b) => (b >= GB ? t('time.gb', { n: num(b / GB, b >= 10 * GB ? 0 : 1) }) : t('time.mb', { n: num(Math.max(1, Math.round(b / 1024 ** 2))) }));
export function fmtAgo(sec) {
  if (sec >= 86400) { const n = Math.floor(sec / 86400); return t('time.day', { n }); }
  if (sec >= 3600) return t('time.hourMin', { h: Math.floor(sec / 3600), m: Math.floor((sec % 3600) / 60) });
  if (sec >= 60) return t('time.min', { n: Math.floor(sec / 60) });
  return t('time.sec', { n: Math.max(0, Math.floor(sec)) });
}
export const fmtClock = (s) => { s = Math.max(0, Math.floor(s)); return s >= 3600 ? `${Math.floor(s / 3600)}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}` : `${Math.floor(s / 60)}:${pad2(s % 60)}`; };

export function setup() {
  stage = $('stage');
  reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Floor plan, each viewer's own choice: 'pro' (a company floor, the default), 'cozy' (one open room)
  // or 'hq' (headquarters: the company floor plus a wing of department rooms). Switching reloads the page;
  // ?layout=cozy|pro|hq overrides it for one visit.
  LAYOUT = (() => { const q = new URLSearchParams(location.search).get('layout'); if (PLANS.includes(q)) return q; const def = 'pro'; try { const v = localStorage.getItem('office-layout'); return PLANS.includes(v) ? v : def; } catch { return def; } })();
  // the company floor's rooms, people and habits; headquarters is the company floor plus a wing of departments
  PRO = LAYOUT === 'pro' || LAYOUT === 'hq';
  HQ = LAYOUT === 'hq';
  small = matchMedia('(max-width: 720px)');
  // The office's wall clock (lunch, the afternoon coffee, the season's decorations). ?at=12:10 or ?at=2026-12-24T20:00
  // pretends it is that time, for screenshots and for trying a season out.
  AT_SHIFT = (() => {
    const q = new URLSearchParams(location.search).get('at'); if (!q) return 0;
    const hm = /^(\d{1,2}):(\d{2})$/.exec(q), d = new Date();
    const at = hm ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), +hm[1], +hm[2]) : new Date(q);
    return Number.isFinite(at.getTime()) ? at.getTime() - Date.now() : 0;
  })();
  SEASON = (() => {
    const q = new URLSearchParams(location.search).get('season');
    if (['halloween', 'noel', 'tet', 'none'].includes(q)) return q === 'none' ? null : q;
    try { if (localStorage.getItem('office-season') === 'off') return null; } catch { /* storage blocked */ }
    const d = officeNow(), y = d.getFullYear(), md = (d.getMonth() + 1) * 100 + d.getDate();
    if (md >= 1020 && md <= 1101) return 'halloween';
    if (md >= 1212 && md <= 1231) return 'noel';
    for (const yy of [y, y + 1]) { if (!TET[yy]) continue; const t = new Date(`${yy}-${TET[yy]}T00:00:00`), days = (d - t) / 864e5; if (days >= -14 && days <= 7) return 'tet'; }
    return null;
  })();
}
