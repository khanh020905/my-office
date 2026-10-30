// A shop seen from across the street, painted: for the fronts too far from the office to be rooms you walk into (shops.js
// keeps the nearest few as rooms, the rest as their sign and a picture of the inside behind the glass). The bits every
// such picture has: the glass's frame with its door, a pane's sheen, the people inside, a hanging lamp, a pot plant.
// Drawn into a front's rect of the shared canvas (x, y, w, h in its pixels), once, and again only at opening and closing.

/** the glass front over a painted inside: mullions where the real ones are (shops.js: ±2.2 and the door's ±0.82 of 6.6 m),
    the door's head, the sill, a sheen across each pane */
export function glassOver(g, x, y, w, h) {
  g.save();
  g.fillStyle = 'rgba(255,255,255,.07)';
  for (const a of [0, 0.38, 0.84]) { g.beginPath(); g.moveTo(x + w * (a + 0.02), y + h); g.lineTo(x + w * (a + 0.09), y); g.lineTo(x + w * (a + 0.14), y); g.lineTo(x + w * (a + 0.07), y + h); g.closePath(); g.fill(); }
  g.fillStyle = '#4A515B';
  for (const f of [0, 0.167, 0.376, 0.624, 0.833, 1]) g.fillRect(x + w * f - 5, y, 10, h);
  g.fillRect(x + w * 0.376, y + h * 0.1, w * 0.248, 7);   // (the door's head)
  g.fillRect(x, y + h - 12, w, 12);
  g.restore();
}
/** someone inside: head, hair, shoulders in their shirt (s: the head's radius); seated ones lower, behind a table */
export function figure(g, x, y, s, shirt, hair = '#2B2420') {
  g.fillStyle = shirt; g.beginPath(); g.roundRect(x - s * 1.25, y + s * 0.9, s * 2.5, s * 2.6, s * 0.7); g.fill();
  g.fillStyle = '#EDC4A2'; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
  g.fillStyle = hair; g.beginPath(); g.arc(x, y - s * 0.18, s * 1.02, Math.PI * 1.02, Math.PI * 1.98); g.fill();
}
/** a lamp hung from the ceiling on its cord, glowing (a globe: round; else a shade) */
export function lamp(g, x, top, y, r, c = '#FFE2A8', globe = true) {
  g.strokeStyle = 'rgba(30,26,22,.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, top); g.lineTo(x, y - r); g.stroke();
  const glow = g.createRadialGradient(x, y, r * 0.2, x, y, r * 3.2); glow.addColorStop(0, 'rgba(255,226,168,.45)'); glow.addColorStop(1, 'rgba(255,226,168,0)');
  g.fillStyle = glow; g.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
  g.fillStyle = c; g.beginPath();
  if (globe) g.arc(x, y, r, 0, Math.PI * 2); else { g.moveTo(x - r, y + r * 0.5); g.lineTo(x + r, y + r * 0.5); g.lineTo(x + r * 0.45, y - r * 0.5); g.lineTo(x - r * 0.45, y - r * 0.5); g.closePath(); }
  g.fill();
}
/** a pot plant on the floor: the pot, round clumps of leaves */
export function plant(g, x, y, s, pot = '#3A3F47') {
  g.fillStyle = pot; g.beginPath(); g.moveTo(x - s * 0.5, y - s * 0.7); g.lineTo(x + s * 0.5, y - s * 0.7); g.lineTo(x + s * 0.38, y); g.lineTo(x - s * 0.38, y); g.closePath(); g.fill();
  for (const [dx, dy, k, c] of [[-0.35, -1.25, 0.5, '#3E7A3A'], [0.32, -1.4, 0.48, '#4E8E45'], [0, -1.85, 0.55, '#5FA04F'], [-0.1, -1.1, 0.45, '#2F6A30']]) { g.fillStyle = c; g.beginPath(); g.arc(x + dx * s, y + dy * s, k * s, 0, Math.PI * 2); g.fill(); }
}
