// Renderer, cameras, orbit controls, post-processing and environment light.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HQ, PRO, el, small, stage } from '../core/env.js';
import { t as tr } from '../../i18n/index.js';

/* ---------- renderer ---------- */
export let renderer;
export let SOFTWARE_GL;
export const labels = new CSS2DRenderer();
export const scene = new THREE.Scene();
export const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
export const fpCam = new THREE.PerspectiveCamera(70, 1, 0.05, 240);
export let HOME;
export let BASE_ZOOM;
export let controls;
let msaa;
export let composer;
export const renderPass = new RenderPass(scene, camera);
export const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.55, 0.92);
let pmrem;
export let envDay;
export let envNight;
export function resize() {
  const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
  renderer.setSize(w, h); labels.setSize(w, h);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  const aspect = w / h, s = Math.max(8.8, 12 / aspect);
  camera.left = -s * aspect; camera.right = s * aspect; camera.top = s; camera.bottom = -s;
  camera.updateProjectionMatrix();
  fpCam.aspect = aspect; fpCam.updateProjectionMatrix();
}

export function setup() {
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
  catch (err) { stage.append(el('p', 'empty panel', tr('world.noWebgl'))); throw err; }
  // Without a GPU (a virtual machine, a CI runner, a browser that fell back to SwiftShader) every frame is drawn by the
  // CPU and takes seconds: then the office runs light, with no shadows or post effects, a quarter of the pixels and a few
  // frames a second, so the page stays usable.
  SOFTWARE_GL = (() => { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); })();
  renderer.setPixelRatio(SOFTWARE_GL ? 0.5 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = !SOFTWARE_GL;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);
  labels.domElement.className = 'labels';
  stage.appendChild(labels.domElement);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  HOME = HQ ? new THREE.Vector3(3, 0.3, 9) : PRO ? new THREE.Vector3(3, 0.3, 0.7) : new THREE.Vector3(0, 0.3, 0.2);
  BASE_ZOOM = (small.matches ? 1.35 : 1) * (HQ ? 0.56 : PRO ? 0.8 : 1);
  camera.position.set(...(HQ ? [19, 23, 19] : PRO ? [17, 20, 17] : [18, 16, 18])).add(HOME);
  camera.zoom = BASE_ZOOM;
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minZoom = HQ ? 0.36 : PRO ? 0.5 : 0.7;
   controls.maxZoom = 3.4;
  controls.minPolarAngle = 0.55;
   controls.maxPolarAngle = 1.15;
  controls.minAzimuthAngle = 0.12;
   controls.maxAzimuthAngle = 1.45;
  controls.update();
  // Image pipeline: HDR render -> bloom (lamps, screens, city lights) -> ACES tone mapping; MSAA on desktop.
  msaa = !small.matches;
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: msaa ? 4 : 0 }));
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // Image-based light: a bright studio room by day, a dark blue room with a warm ceiling glow by night.
  pmrem = new THREE.PMREMGenerator(renderer);
  envDay = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  envNight = (() => {
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.035, 0.05, 0.11), side: THREE.BackSide })));
    const warm = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.0, 0.5), side: THREE.DoubleSide }));
    warm.position.set(0, 5.5, 0); warm.rotation.x = Math.PI / 2; s.add(warm);
    const cool = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.35, 0.7), side: THREE.DoubleSide }));
    cool.position.set(0, 2, -5.8); s.add(cool);
    return pmrem.fromScene(s, 0.02).texture;
  })();
  scene.environment = envDay;
  new ResizeObserver(resize).observe(stage);
  resize();
}
