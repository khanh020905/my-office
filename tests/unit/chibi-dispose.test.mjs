import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// makeChibi draws two small canvas textures (the shadow, the steam): enough of a canvas for that, no browser needed
const ctx2d = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} };
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
const { makeChibi, disposeChibi, wearOuter, wearHat, wearLanyard } = await import('../../src/office/people/chibi-rig.js');

// everything a rig draws with, and which of those got a 'dispose'
function watch(root) {
  const geos = new Set(), mats = new Set(), texs = new Set(), gone = new Set();
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    for (const m of [].concat(o.material || [])) { mats.add(m); if (m.map) texs.add(m.map); }
  });
  for (const x of [...geos, ...mats, ...texs]) x.addEventListener('dispose', () => gone.add(x));
  return { geos, mats, texs, gone };
}

test('a rig thrown away gives back every geometry it made, the coat, hat and lanyard put on later too', () => {
  const { root, P } = makeChibi({ name: 'Mai', look: 'toy' }, 0.78);
  wearOuter(P, true, {}); wearHat(P); wearLanyard(P, true);   // (built after the rig: the coat on the way out, the Christmas hat, the badge)
  const w = watch(root), sprite = root.getObjectByProperty('isSprite', true);
  disposeChibi(P);
  for (const g of w.geos) if (g !== sprite?.geometry) assert.ok(w.gone.has(g), `geometry ${g.type} disposed`);
  assert.ok([...w.geos].filter((g) => w.gone.has(g)).length > 60, 'a whole body');
  // materials are only garbage (their compiled shaders stay for the next person); textures (the shadow, the steam) are shared
  for (const m of w.mats) assert.ok(!w.gone.has(m), `material ${m.type} left alone`);
  for (const t of w.texs) assert.ok(!w.gone.has(t), 'textures left alone');
});

test('a sprite keeps its geometry: three.js shares one for every sprite', () => {
  const { root, P } = makeChibi({ name: 'Long', look: 'pixar' });
  const sprite = root.getObjectByProperty('isSprite', true);
  assert.ok(sprite, 'the rig has its steam sprite');
  let gone = false; sprite.geometry.addEventListener('dispose', () => { gone = true; });
  disposeChibi(P);
  assert.equal(gone, false);
});

test('what other modules hung on the rig is theirs, and another rig is untouched', () => {
  const a = makeChibi({ name: 'A' }), b = makeChibi({ name: 'B' });
  const cupGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.08), cupM = new THREE.MeshStandardMaterial();
  a.P.armR.hand.add(new THREE.Mesh(cupGeo, cupM));   // (a cup errands.js put in the hand: shared by every cup)
  let cupGone = false; for (const x of [cupGeo, cupM]) x.addEventListener('dispose', () => { cupGone = true; });
  const wb = watch(b.root);
  disposeChibi(a.P);
  assert.equal(cupGone, false, 'the shared cup stays');
  assert.equal(wb.gone.size, 0, 'the other rig keeps everything');
});

test('twice is harmless', () => {
  const { root, P } = makeChibi({ name: 'C' });
  const w = watch(root); let n = 0;
  for (const g of w.geos) g.addEventListener('dispose', () => n++);
  disposeChibi(P);
  assert.ok(n > 0);
  const after = n; disposeChibi(P); disposeChibi(P);
  assert.equal(n, after, 'nothing disposed a second time');
});
