// The clip's music: an original lo-fi loop made right here, nothing borrowed (no samples, no files): a Rhodes-like FM
// electric piano on Fmaj9 – Em7 – Dm9 – G13, a round bass, a swung boom-bap kit, a soft pentatonic lead, vinyl crackle
// and a small Schroeder reverb. At 96 bpm six bars fill the clip's 15 seconds: the keys alone, opening up from a
// low-pass, then the groove from the second bar, the lead from the third, a higher phrase from the fifth (10 s in, when
// the lights come on) and a fade at the end. The samples are worked out in plain JS (a fraction of a second); the
// browser only plays them into the clip's sound track, never to the speakers.
const BPM = 96, BEAT = 60 / BPM, BAR = BEAT * 4;
const CHORDS = [   // [bass, keys]
  [41, [57, 60, 64, 67]],   // Fmaj9
  [40, [55, 59, 62, 64]],   // Em7
  [38, [53, 57, 60, 64]],   // Dm9
  [43, [53, 59, 64, 69]],   // G13
];
const PHRASES = [   // per chord: [beat, midi, beats]; the second one higher, for the evening
  [[[0.5, 76, 0.5], [1, 79, 1], [2.5, 81, 0.5], [3, 79, 1]], [[0.5, 76, 0.5], [1, 74, 1.5], [3, 71, 1]], [[0.5, 72, 0.5], [1, 74, 0.5], [1.5, 76, 1.5], [3.5, 74, 0.5]], [[0, 71, 1], [1.5, 74, 0.5], [2, 74, 1.5]]],
  [[[1, 81, 0.5], [1.5, 79, 0.5], [2, 76, 1.5]], [[0, 74, 0.5], [0.5, 76, 0.5], [1, 79, 2]], [[0.5, 81, 1], [2, 79, 0.5], [2.5, 76, 1]], [[0, 74, 2], [3, 79, 0.5], [3.5, 76, 0.5]]],
];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

/** the music for `dur` seconds as two channels of samples, [left, right], its loudest just under 1 (pure: no browser) */
export function lofi(dur, SR = 48000) {
  const N = Math.ceil(dur * SR), BARS = Math.ceil(dur / BAR);
  const L = new Float32Array(N), R = new Float32Array(N), wetL = new Float32Array(N), wetR = new Float32Array(N);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), noise = () => rnd() * 2 - 1;
  // swing: the off 16ths come late
  const at = (bar, beat) => { const q = Math.floor(beat * 4 + 1e-6), frac = beat * 4 - q; return bar * BAR + (q + (q % 2 ? 0.16 : 0) + frac) * BEAT / 4; };
  function add(t0, sample, len, pan = 0, wet = 0) {
    const i0 = Math.round(t0 * SR), n = Math.round(len * SR), gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
    for (let k = 0; k < n; k++) {
      const i = i0 + k; if (i < 0) continue; if (i >= N) break;
      const s = sample(k / SR);
      L[i] += s * gl; R[i] += s * gr;
      if (wet) { wetL[i] += s * gl * wet; wetR[i] += s * gr * wet; }
    }
  }
  // the electric piano: an FM bell decaying into a warm sine, two slightly detuned voices
  const epiano = (t0, midi, dur1, vel, pan) => { const f = mtof(midi); add(t0, (t) => {
    const env = Math.min(1, t / 0.006) * Math.exp(-t / 1.7) * (t > dur1 ? Math.exp(-(t - dur1) / 0.18) : 1), I = 1.6 * Math.exp(-t * 7) + 0.18;
    const a = Math.sin(2 * Math.PI * f * t + I * Math.sin(2 * Math.PI * f * t)), b = Math.sin(2 * Math.PI * f * 1.0035 * t + I * 0.8 * Math.sin(2 * Math.PI * f * t));
    return (a + b * 0.6) * env * vel * 0.055;
  }, dur1 + 1.2, pan, 0.28); };
  // the bass: a round sine with a touch of grit
  const bass = (t0, midi, dur1, vel) => { const f = mtof(midi); add(t0, (t) => {
    const env = Math.min(1, t / 0.01) * (0.65 + 0.35 * Math.exp(-t / 0.25)) * (t > dur1 ? Math.exp(-(t - dur1) / 0.06) : 1);
    return Math.tanh(1.6 * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t))) * env * vel * 0.2;
  }, dur1 + 0.3); };
  // the kit: a pitched-down kick, a snare from a band of noise and a tone, hats from high-passed noise
  const kick = (t0, vel) => { let ph = 0; add(t0, (t) => { const f = 48 + 75 * Math.exp(-t / 0.03); ph += 2 * Math.PI * f / SR; return (Math.sin(ph) * Math.exp(-t / 0.28) + (t < 0.004 ? noise() * 0.3 : 0)) * vel * 0.5; }, 0.6); };
  const snare = (t0, vel) => { let lp = 0, hp = 0, prev = 0; add(t0, (t) => {
    const n = noise(); hp = 0.75 * (hp + n - prev); prev = n; lp += (hp - lp) * 0.45;
    return (lp * Math.exp(-t / 0.13) * 0.9 + Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t / 0.05) * 0.5) * vel * 0.22;
  }, 0.4, 0.05, 0.25); };
  const hat = (t0, vel, open = false) => { let hp = 0, prev = 0; add(t0, (t) => { const n = noise(); hp = 0.92 * (hp + n - prev); prev = n; return hp * Math.exp(-t / (open ? 0.22 : 0.035)) * vel * 0.07; }, open ? 0.5 : 0.12, 0.3); };
  // the lead: sine and triangle with a slow vibrato
  const leadNote = (t0, midi, dur1, vel) => { const f = mtof(midi); add(t0, (t) => {
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5 * t) * Math.min(1, t / 0.3), p = 2 * Math.PI * f * vib * t, tri = (2 / Math.PI) * Math.asin(Math.sin(p));
    const env = Math.min(1, t / 0.04) * (t > dur1 ? Math.exp(-(t - dur1) / 0.12) : 0.85 + 0.15 * Math.exp(-t / 0.3));
    return (Math.sin(p) * 0.7 + tri * 0.3) * env * vel * 0.085;
  }, dur1 + 0.6, 0.12, 0.35); };

  for (let b = 0; b < BARS; b++) {
    const [root, keys] = CHORDS[b % 4];
    // the chord on 1 with a light strum, a softer push on the and of 2
    keys.forEach((m, j) => epiano(at(b, 0) + j * 0.012, m, BEAT * 2.2, 0.95 - j * 0.05 + rnd() * 0.08, -0.25 + j * 0.17));
    if (b >= 1) keys.forEach((m, j) => epiano(at(b, 2.5) + j * 0.01, m, BEAT * 1.1, 0.55 + rnd() * 0.1, -0.2 + j * 0.13));
    if (b < 1) continue;   // the first bar: the keys alone
    bass(at(b, 0), root, BEAT * 1.4, 1); bass(at(b, 2.5), root, BEAT * 0.4, 0.8); bass(at(b, 3.25), root + 7, BEAT * 0.55, 0.75);
    kick(at(b, 0), 1); kick(at(b, 2.5), 0.85); if (b % 2) kick(at(b, 3.75), 0.5);
    snare(at(b, 1), 1); snare(at(b, 3), 1);
    for (let e = 0; e < 8; e++) hat(at(b, e / 2), (e % 2 ? 0.45 : 0.8) * (0.85 + rnd() * 0.3), e === 7 && b % 4 === 3);
    if (b < 2) continue;
    for (const [beat, m, d] of PHRASES[b >= 4 ? 1 : 0][b % 4]) leadNote(at(b, beat), m, d * BEAT, 0.85 + rnd() * 0.15);
  }
  // vinyl: a quiet bed of noise and sparse crackles
  for (let i = 0; i < N; i++) { const c = rnd() < 0.00012 ? noise() * 0.12 : 0, h = noise() * 0.0035; L[i] += c + h; R[i] += c * 0.8 + h; }
  // reverb on the wet send: four damped combs and two allpasses a side (lengths at 44.1 kHz, scaled)
  const k = SR / 44100;
  const reverb = (inp, out, offs) => {
    const combs = [1116, 1188, 1277, 1356].map((d) => ({ buf: new Float32Array(Math.round((d + offs) * k)), i: 0, lp: 0 }));
    const aps = [556, 441].map((d) => ({ buf: new Float32Array(Math.round((d + offs) * k)), i: 0 }));
    for (let n = 0; n < N; n++) {
      let s = 0;
      for (const c of combs) { const y = c.buf[c.i]; c.lp = y * 0.6 + c.lp * 0.4; c.buf[c.i] = inp[n] + c.lp * 0.8; c.i = (c.i + 1) % c.buf.length; s += y; }
      s *= 0.25;
      for (const a of aps) { const y = a.buf[a.i], v = s + y * 0.5; a.buf[a.i] = v; a.i = (a.i + 1) % a.buf.length; s = y - v * 0.5; }
      out[n] += s;
    }
  };
  reverb(wetL, L, 0); reverb(wetR, R, 23);
  // master: the first bar opens from a low-pass, a warm low-pass after, a soft clip, the fades, then normalised
  let l1 = 0, r1 = 0, peak = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR, open = Math.min(1, t / BAR), cut = 600 + (9000 - 600) * open * open, a = 1 - Math.exp(-2 * Math.PI * cut / SR);
    l1 += (L[i] - l1) * a; r1 += (R[i] - r1) * a;
    const fade = Math.min(1, t / 0.05) * Math.max(0, Math.min(1, (dur - t) / 1.5));
    L[i] = Math.tanh(l1 * 1.15) * fade; R[i] = Math.tanh(r1 * 1.15) * fade;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const g = 0.89 / (peak || 1);
  for (let i = 0; i < N; i++) { L[i] *= g; R[i] *= g; }
  return [L, R];
}

/** the music as a sound track for a MediaRecorder: { track, start, stop }, or null when the browser can't make it. The
 *  buffer runs half a second past the music (silence), in case the recording stops a frame late. */
export function musicTrack(dur) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    const ctx = new AC(), [l, r] = lofi(dur, ctx.sampleRate), buf = ctx.createBuffer(2, l.length + Math.round(ctx.sampleRate / 2), ctx.sampleRate);
    buf.copyToChannel(l, 0); buf.copyToChannel(r, 1);
    const src = ctx.createBufferSource(), dest = ctx.createMediaStreamDestination();
    src.buffer = buf; src.connect(dest);   // (not to ctx.destination: the clip carries it, the speakers stay quiet)
    const track = dest.stream.getAudioTracks()[0];
    if (!track) { ctx.close().catch(() => {}); return null; }
    let started = false;
    return {
      track,
      start() { ctx.resume().catch(() => {}); src.start(); started = true; },
      stop() { try { if (started) src.stop(); } catch { /* already over */ } track.stop(); ctx.close().catch(() => {}); },
    };
  } catch { return null; }
}
