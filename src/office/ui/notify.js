// Notifications on this phone (Web Push: server/push.mjs sends them, public/sw.js shows them): Claude's answers in the
// group chat and an approval waiting, even with the office closed and the phone locked. Switched on in the phone window
// (topbar.js). An iPhone gets them only in the office added to its home screen (iOS 16.4 and later), and only over
// https (the Cloudflare address, not the home network's plain http). A tap on one opens the office, at the chat.
import { STATIC } from '../core/env.js';
import { TOKEN } from '../net/live.js';

const api = (more = {}) => { const p = new URLSearchParams(more); if (TOKEN) p.set('k', TOKEN); return `/api/push${p.size ? `?${p}` : ''}`; };
const post = (body) => fetch(api(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
const supported = () => !STATIC && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const iOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const worker = () => navigator.serviceWorker.register('/sw.js');
const b64key = (s) => { const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

/** 'on' | 'off' | 'install' (an iPhone: add it to the home screen first) | 'blocked' (said no to the browser) | 'none' (not here) */
export async function pushState() {
  if (!STATIC && iOS() && !standalone() && window.isSecureContext) return 'install';
  if (!supported()) return 'none';
  if (Notification.permission === 'denied') return 'blocked';
  const sub = await (await worker()).pushManager.getSubscription().catch(() => null);
  if (!sub) return 'off';
  const r = await fetch(api({ endpoint: sub.endpoint })).then((x) => x.json()).catch(() => null);
  return r?.on ? 'on' : 'off';
}
/** Asks (it must follow a tap), subscribes and tells the office: true when on. */
export async function pushOn() {
  if (!supported() || (await Notification.requestPermission()) !== 'granted') return false;
  const meta = await fetch(api()).then((x) => x.json()).catch(() => null); if (!meta?.key) return false;
  const reg = await worker(); await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && b64key(meta.key).join() !== new Uint8Array(sub.options?.applicationServerKey || []).join()) { await sub.unsubscribe(); sub = null; }   // (an older key of the office's)
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64key(meta.key) }).catch(() => null);
  return !!sub && !!(await post({ op: 'add', sub: sub.toJSON() }))?.ok;
}
export async function pushOff() {
  const sub = supported() && await (await worker()).pushManager.getSubscription().catch(() => null);
  if (sub) { await post({ op: 'remove', endpoint: sub.endpoint }); await sub.unsubscribe().catch(() => {}); }
  return true;
}
/** One to this phone (or, from the Mac, to every phone): whether it went. */
export async function pushTest() {
  const sub = supported() && await (await worker()).pushManager.getSubscription().catch(() => null);
  return !!(await post({ op: 'test', endpoint: sub?.endpoint || '' }))?.ok;
}

export function setup() {
  if (!supported()) return;
  worker().catch(() => {});   // (the app on a home screen needs it, and the notifications)
  // a tap on a notification: the office, at the chat for an answer (the chat window loaded when wanted: it imports this)
  const openChat = () => import('./group-chat-view.js').then((m) => m.toggle(true)).catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.k === 'open' && /[?&]chat\b/.test(e.data.url || '')) openChat(); });
  if (new URLSearchParams(location.search).has('chat')) setTimeout(openChat, 1500);
}
