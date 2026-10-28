// The TV with live machine stats.
import * as THREE from 'three';
import { state } from '../../core/state.js';
import { hhmm, nowMs } from '../../core/env.js';
import { scene } from '../../scene/renderer.js';
import { fitText, mat, put, rbox } from '../../scene/blocks.js';
import { LAY } from '../layout.js';
import { nightHooks } from './trinkets.js';
import { sessions } from '../../people/workers.js';
import { liveWindows, macSnap } from '../../ui/mac-drawer.js';
import { t as tr } from '../../../i18n/index.js';

let tvCanvas;
let tvTex;
export let tvM;
export const tvG = new THREE.Group();
export function drawTV() {
  const g = tvCanvas.getContext('2d'), W = 512, H = 280, F = '"Be Vietnam Pro", system-ui, sans-serif';
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0E1726'); bg.addColorStop(1, '#0A0F18'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = '#8D97AA'; g.font = `700 15px ${F}`; g.fillText(tr('world.tv.title'), 22, 32);
  g.textAlign = 'right'; g.fillText(hhmm(), W - 22, 32); g.textAlign = 'left';
  const s = macSnap, pct = s?.mem ? Math.round((s.mem.used / s.mem.total) * 100) : null;
  const lv = s?.mem ? (s.mem.pressure === 'critical' ? '#FF5F5F' : pct > 80 ? '#F2B544' : '#3DDC84') : '#5E687B';
  g.fillStyle = '#E8ECF4'; g.font = `800 64px ${F}`; g.fillText(pct === null ? '–' : `${pct}%`, 22, 104);
  g.fillStyle = '#8D97AA'; g.font = `600 14px ${F}`; g.fillText('RAM', 26, 126);
  g.fillStyle = '#263040'; g.fillRect(22, 136, 210, 10); g.fillStyle = lv; g.fillRect(22, 136, 2.1 * (pct || 0), 10);
  const cpu = s?.cpu?.percent ?? 0; g.fillStyle = '#8D97AA'; g.fillText(`CPU ${cpu}%`, 22, 172);
  g.fillStyle = '#263040'; g.fillRect(22, 180, 210, 6); g.fillStyle = '#6AAEFF'; g.fillRect(22, 180, 2.1 * Math.min(100, cpu), 6);
  const list = [...sessions.values()], n = (k) => list.filter((x) => x.status === k).length;
  const rows = [['#3DDC84', tr('world.tv.working', { n: n('work') })], ['#F2B544', tr('world.tv.waiting', { n: n('wait') })], ['#5E687B', tr('world.tv.resting', { n: n('rest') })]];
  g.font = `700 18px ${F}`;
  rows.forEach(([c, t], i) => { g.fillStyle = c; g.beginPath(); g.arc(282, 70 + i * 32, 6, 0, 7); g.fill(); g.fillStyle = '#E8ECF4'; g.fillText(t, 298, 76 + i * 32); });
  g.fillStyle = '#8D97AA'; g.font = `600 14px ${F}`;
  const today = tr('world.tv.today', { prompts: tr('world.tv.prompts', { n: state.stats.prompts || 0 }), cmds: tr('world.tv.cmds', { n: state.stats.cmd || 0 }) });
  fitText(g, today, W - 276); g.fillText(today, 274, 172); g.font = `600 14px ${F}`;
  const plan = liveWindows().find((w) => w.key === 'session');
  if (plan) { g.fillStyle = plan.pct >= 95 ? '#FF5F5F' : plan.pct >= 80 ? '#F2B544' : '#8D97AA'; g.fillText(tr('world.tv.plan', { pct: Math.round(plan.pct) }), 274, 194); }
  const now = nowMs(), b = new Array(30).fill(0); for (const e of state.feed) { const k = Math.floor((now - e.ts) / 60e3); if (k >= 0 && k < 30) b[29 - k]++; }
  const mx = Math.max(1, ...b); g.fillStyle = '#8D97AA'; g.font = `600 12px ${F}`; g.fillText(tr('world.tv.pulse'), 22, 214);
  b.forEach((v, i) => { const h = v ? 4 + (v / mx) * 40 : 2; g.fillStyle = v ? '#3DDC84' : '#263040'; g.fillRect(22 + i * 15.6, 266 - h, 10, h); });
  tvTex.needsUpdate = true;
}

export function setup() {
  /* TV on the server-room wall: live machine stats */
  tvCanvas = document.createElement('canvas');
   tvCanvas.width = 512;
   tvCanvas.height = 280;
  tvTex = new THREE.CanvasTexture(tvCanvas);
   tvTex.colorSpace = THREE.SRGBColorSpace;
   tvTex.anisotropy = 4;
  tvM = new THREE.MeshBasicMaterial({ map: tvTex });
   tvG.position.set(LAY.tv[0], LAY.tv[1], LAY.tv[2]);
   tvG.rotation.y = LAY.tv[3];
   scene.add(tvG);
  put(tvG, rbox(2.32, 1.34, 0.08, mat('#15181E', { roughness: 0.4 }), 0.03), 0, 0, 0);
  put(tvG, new THREE.Mesh(new THREE.PlaneGeometry(2.18, 1.2), tvM), 0, 0, 0.045);
  nightHooks.push((on) => tvM.color.setScalar(on ? 1.25 : 1));
}
