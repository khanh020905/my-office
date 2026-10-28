// What each desk's screens show: the editor while it edits, a terminal for commands, a browser for the web, code with
// the match highlighted while it reads or searches, a chat while it thinks, a permission dialog while it waits for you,
// a screensaver while it naps. A few textures drawn once and shared; each desk scrolls its own copy.
import * as THREE from 'three';

const W = 512, H = 640;   // twice the screen's height: the bottom half scrolls into view and wraps round
const KINDS = ['off', 'code', 'read', 'term', 'web', 'chat', 'wait', 'sleep'];
let base = null;          // kind -> texture (the shared drawing)
const perDesk = [];       // desk -> kind -> its own clone (own scroll offset, same pixels on the GPU)

function canvas(draw) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); draw(g);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 0.5); t.anisotropy = 4;
  return t;
}
// a seeded random, so every desk's code looks the same on every load
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const codeLines = (g, x0, y0, rows, palette, highlight = -1) => {
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * 20;
    if (r === highlight) { g.fillStyle = 'rgba(255, 214, 102, .28)'; g.fillRect(0, y - 4, W, 20); }
    g.fillStyle = '#4B5263'; g.fillRect(8, y + 3, 18, 8);   // line number
    let x = x0 + Math.floor(rnd() * 4) * 14;
    const n = 1 + Math.floor(rnd() * 5);
    for (let k = 0; k < n && x < W - 20; k++) { const w = 18 + rnd() * 70; g.fillStyle = palette[Math.floor(rnd() * palette.length)]; g.fillRect(x, y + 2, w, 10); x += w + 8; }
  }
};
const DRAW = {
  off: (g) => { const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#0C1622'); gr.addColorStop(1, '#101C2B'); g.fillStyle = gr; g.fillRect(0, 0, W, H); },
  code: (g) => { g.fillStyle = '#1E1F2B'; g.fillRect(0, 0, W, H); g.fillStyle = '#262838'; g.fillRect(0, 0, 34, H); codeLines(g, 44, 10, 32, ['#C792EA', '#82AAFF', '#C3E88D', '#F78C6C', '#89DDFF', '#D6DEEB', '#D6DEEB']); },
  read: (g) => { g.fillStyle = '#1E1F2B'; g.fillRect(0, 0, W, H); g.fillStyle = '#262838'; g.fillRect(0, 0, 34, H); codeLines(g, 44, 10, 32, ['#C792EA', '#82AAFF', '#C3E88D', '#D6DEEB'], 9); g.fillStyle = 'rgba(255, 214, 102, .28)'; g.fillRect(0, 10 + 25 * 20 - 4, W, 20); },
  term: (g) => {
    g.fillStyle = '#0B0F14'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < 32; r++) {
      const y = 10 + r * 20, prompt = rnd() < 0.3;
      if (prompt) { g.fillStyle = '#5BE37D'; g.fillRect(10, y + 2, 10, 10); g.fillStyle = '#E6EDF3'; g.fillRect(28, y + 2, 60 + rnd() * 220, 10); }
      else { g.fillStyle = rnd() < 0.12 ? '#FF7B72' : rnd() < 0.2 ? '#FFD166' : '#8B949E'; g.fillRect(10, y + 2, 40 + rnd() * 380, 10); }
    }
  },
  web: (g) => {
    g.fillStyle = '#F4F5F7'; g.fillRect(0, 0, W, H);
    for (let p = 0; p < 2; p++) {   // two pages one above the other, for the scroll
      const y0 = p * 320;
      g.fillStyle = '#DDE1E7'; g.fillRect(0, y0, W, 30); g.fillStyle = '#FFFFFF'; g.fillRect(60, y0 + 7, W - 120, 16);
      g.fillStyle = '#3F7CC4'; g.fillRect(24, y0 + 50, W - 48, 90);
      g.fillStyle = '#FFFFFF'; g.fillRect(44, y0 + 72, 200, 16); g.fillRect(44, y0 + 98, 140, 10);
      for (let r = 0; r < 6; r++) { g.fillStyle = '#B8BEC8'; g.fillRect(24, y0 + 160 + r * 22, 280 + rnd() * 160, 9); }
      g.fillStyle = '#E8742A'; g.fillRect(340, y0 + 160, 148, 100);
    }
  },
  chat: (g) => {
    g.fillStyle = '#F7F5F0'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < 8; r++) {
      const y = 16 + r * 78, you = r % 2 === 0, w = 180 + rnd() * 200, h = 30 + Math.floor(rnd() * 3) * 14;
      g.fillStyle = you ? '#E3D9F7' : '#FFFFFF'; g.fillRect(you ? W - w - 16 : 16, y, w, h);
      g.fillStyle = you ? '#A08BD8' : '#D97757'; if (!you) { g.beginPath(); g.arc(30, y + 14, 8, 0, 7); g.fill(); }
      g.fillStyle = '#9AA0AA'; for (let k = 0; k < h / 14 - 1; k++) g.fillRect(you ? W - w - 4 : 46, y + 10 + k * 14, w - 44 - rnd() * 40, 6);
    }
  },
  wait: (g) => {
    DRAW.code(g); g.fillStyle = 'rgba(8, 10, 16, .55)'; g.fillRect(0, 0, W, H);
    for (const y0 of [0, 320]) {
      g.fillStyle = '#2A2F3A'; g.fillRect(96, y0 + 90, 320, 140); g.fillStyle = '#FFB23F'; g.fillRect(96, y0 + 90, 320, 8);
      g.fillStyle = '#E6EDF3'; g.fillRect(118, y0 + 120, 220, 12); g.fillStyle = '#8B949E'; g.fillRect(118, y0 + 144, 180, 8);
      g.fillStyle = '#3DDC84'; g.fillRect(232, y0 + 182, 80, 28); g.fillStyle = '#4B5263'; g.fillRect(322, y0 + 182, 80, 28);
    }
  },
  sleep: (g) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#141B33'); gr.addColorStop(0.5, '#1D1640'); gr.addColorStop(1, '#141B33'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.6})`; g.fillRect(rnd() * W, rnd() * H, 2, 2); }
    g.fillStyle = 'rgba(201, 184, 255, .85)'; g.font = '700 54px system-ui, sans-serif'; g.fillText('z', 300, 150); g.font = '700 38px system-ui, sans-serif'; g.fillText('z', 350, 110); g.font = '700 26px system-ui, sans-serif'; g.fillText('z', 385, 82);
    g.font = '700 54px system-ui, sans-serif'; g.fillText('z', 300, 470); g.font = '700 38px system-ui, sans-serif'; g.fillText('z', 350, 430);
  },
};
function textures() {
  if (!base) { base = {}; for (const k of KINDS) { seed = 7 + KINDS.indexOf(k); base[k] = canvas(DRAW[k]); } }
  return base;
}
// the texture every screen starts with: set at start-up so the material is compiled with a map once and later swaps
// only change the image (no shader rebuild)
export const offTexture = () => textures().off;

const KIND_OF = { edit: 'code', write: 'code', bash: 'term', deploy: 'term', web: 'web', fetch: 'web', mcp: 'web', read: 'read', grep: 'read', glob: 'read', skill: 'read' };
// what a desk's screen should show for its session (s) and person (w)
export function screenKind(s, w) {
  if (!s || !w) return 'off';
  if (w.anim === 'sleep') return 'sleep';
  if (s.status === 'wait') return 'wait';
  return KIND_OF[s.last?.type] || 'chat';
}
// swap the picture when the kind changes; scroll while the person types at the desk
export function updateScreen(i, scr, kind, dt, busy) {
  const own = (perDesk[i] ||= {});
  let tex = own[kind];
  if (!tex) { tex = own[kind] = textures()[kind].clone(); tex.offset.y = (i * 0.137) % 1; }
  if (scr.map !== tex) { scr.map = tex; scr.emissiveMap = tex; }
  if (busy && kind !== 'sleep' && kind !== 'off' && kind !== 'wait') tex.offset.y = (tex.offset.y + dt * (kind === 'term' ? 0.09 : kind === 'web' ? 0.02 : 0.045)) % 1;
}
