// Sounds, synthesized in the browser.
import { reduceMotion, replay } from '../core/env.js';

export let sfx;

export function setup() {
  /* ---------- sounds: synthesized in the browser (no files), each kind rate-limited, muted with one switch ---------- */
  sfx = (() => {
    let ctx = null, on = true;
    try { on = localStorage.getItem('office-sound') !== 'off'; } catch { /* storage blocked */ }
    const last = new Map();
    const unlock = () => { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ } } if (ctx?.state === 'suspended') ctx.resume(); };
    addEventListener('pointerdown', unlock, { passive: true }); addEventListener('keydown', unlock);
    const tone = (f, t0, dur, type = 'sine', vol = 0.15, f2 = null) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    };
    const noise = (t0, dur, vol = 0.05, hp = 1800) => {
      const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol; s.buffer = b; s.connect(f).connect(g).connect(ctx.destination); s.start(t0);
    };
    const SOUNDS = {
      perm: (t) => { tone(880, t, 0.16, 'triangle', 0.16); tone(1175, t + 0.13, 0.22, 'triangle', 0.14); },
      turn: (t) => { tone(659, t, 0.18, 'sine', 0.12); tone(988, t + 0.12, 0.3, 'sine', 0.1); },
      key: (t) => noise(t, 0.03, 0.025, 3500),
      print: (t) => { for (let i = 0; i < 6; i++) noise(t + i * 0.09, 0.06, 0.03, 900); },
      ding: (t) => { tone(1318.5, t, 0.55, 'sine', 0.08); tone(1046.5, t + 0.26, 0.8, 'sine', 0.08); },
      deploy: (t) => { tone(220, t, 1.1, 'sawtooth', 0.05, 880); noise(t, 1.1, 0.04, 400); },
      siren: (t) => { for (let i = 0; i < 3; i++) { tone(620, t + i * 0.6, 0.3, 'square', 0.05, 880); tone(880, t + i * 0.6 + 0.3, 0.3, 'square', 0.05, 620); } },
      meow: (t) => { tone(740, t, 0.35, 'sine', 0.1, 520); tone(1480, t, 0.3, 'sine', 0.025, 1040); },
      pop: (t) => tone(520, t, 0.08, 'sine', 0.08, 900),
      chat: (t) => { tone(1568, t, 0.11, 'sine', 0.07); tone(2093, t + 0.08, 0.2, 'sine', 0.06); },
      bloop: (t) => { tone(320, t, 0.12, 'sine', 0.1, 760); tone(420, t + 0.14, 0.12, 'sine', 0.08, 900); },
      brew: (t) => { noise(t, 1.4, 0.035, 2600); tone(110, t, 1.2, 'sine', 0.04, 90); },
      rustle: (t) => { noise(t, 0.12, 0.04, 3200); noise(t + 0.1, 0.16, 0.03, 3800); },
      click: (t) => tone(1800, t, 0.03, 'square', 0.04),
      coin: (t) => { tone(988, t, 0.09, 'square', 0.05); tone(1319, t + 0.08, 0.3, 'square', 0.05); },
      beep: (t) => { tone(1046, t, 0.09, 'square', 0.04); tone(1318, t + 0.12, 0.09, 'square', 0.04); },
      buzz: (t) => tone(120, t, 0.5, 'sawtooth', 0.03, 110),
      thunder: (t) => { noise(t, 2.2, 0.09, 60); tone(48, t, 1.8, 'sine', 0.12, 30); },
      bell: (t) => { tone(2093, t, 1.1, 'sine', 0.09); tone(2637, t, 0.7, 'sine', 0.04); tone(4186, t, 0.25, 'sine', 0.02); },
      water: (t) => { for (let i = 0; i < 5; i++) noise(t + i * 0.22, 0.3, 0.025, 700 + i * 120); },
      clap: (t) => { for (let i = 0; i < 26; i++) noise(t + Math.random() * 1.6, 0.04, 0.04 * Math.random() + 0.015, 1500); },
      thud: (t) => { for (let i = 0; i < 3; i++) { tone(95, t + i * 0.22, 0.12, 'sine', 0.16, 60); noise(t + i * 0.22, 0.06, 0.05, 300); } },
    };
    const GAP = { bell: 0.6, water: 1.5, clap: 1.5, ding: 1, key: 0.18, perm: 1, turn: 1.5, print: 1, deploy: 3, siren: 4, meow: 0.8, pop: 0.15, bloop: 0.5, brew: 1.5, rustle: 0.25, click: 0.08, coin: 0.4, beep: 0.5, buzz: 0.6, thud: 2, thunder: 5 };
    return {
      get on() { return on; },
      set(v) { on = v; try { localStorage.setItem('office-sound', v ? 'on' : 'off'); } catch { /* storage blocked */ } if (v) unlock(); },
      play(name) {
        if (!on || replay.on || !ctx || ctx.state !== 'running' || reduceMotion && name === 'key') return;
        const now = ctx.currentTime; if (now - (last.get(name) ?? -9) < (GAP[name] || 0.2)) return;
        last.set(name, now); SOUNDS[name]?.(now + 0.01);
      },
    };
  })();
}
