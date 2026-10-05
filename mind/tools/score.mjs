// The soundtrack, synthesized sample by sample and cued from the film's own schedule,
// then mixed under the narration.
//
//   node tools/score.mjs   -> audio/score.wav, audio/mix.wav, audio/mix.m4a
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFilm } from '../src/film.js';
import { rng } from '../src/engine.js';
import { RATE, readWav, writeWav } from './audio-utils.mjs';

const root = new URL('..', import.meta.url);
const timeline = JSON.parse(readFileSync(new URL('src/timeline.json', root)));
const { anchors: A, cues } = createFilm(timeline);
const DUR = timeline.duration;
const N = Math.round(DUR * RATE);
const TAU = Math.PI * 2;

const dry = [new Float32Array(N), new Float32Array(N)];
const send = [new Float32Array(N), new Float32Array(N)];
const rand = rng(2026);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const pans = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];

function write(i, v, pan, wet) {
  if (i < 0 || i >= N) return;
  const [gl, gr] = pan;
  dry[0][i] += v * gl;
  dry[1][i] += v * gr;
  send[0][i] += v * gl * wet;
  send[1][i] += v * gr * wet;
}

// ------------------------------------------------------------------ instruments
function sine({ at, dur, f, f2 = f, amp, pan = 0, att = 0.01, rel = 0.3, wet = 0.3, vib = 0, shape = 'lin' }) {
  const i0 = Math.round(at * RATE);
  const n = Math.round((dur + rel) * RATE);
  const p = pans(pan);
  let ph = rand() * TAU;
  for (let k = 0; k < n; k++) {
    const t = k / RATE;
    const u = Math.min(1, t / dur);
    const f0 = shape === 'exp' ? f * Math.pow(f2 / f, u) : f + (f2 - f) * u;
    ph += (TAU * f0 * (1 + vib * Math.sin(TAU * 5.1 * t))) / RATE;
    const e = t < att ? Math.sin((Math.PI / 2) * (t / att)) ** 2 : t < dur ? 1 : Math.exp((-(t - dur) / rel) * 3);
    write(i0 + k, Math.sin(ph) * amp * e, p, wet);
  }
}

// FM bell: bright at the strike, mellowing as the modulation decays.
function bell({ at, f, amp, pan = 0, decay = 2.4, ratio = 3.5, index = 2.0, wet = 0.5 }) {
  const i0 = Math.round(at * RATE);
  const n = Math.round(decay * 4 * RATE);
  const p = pans(pan);
  for (let k = 0; k < n; k++) {
    const t = k / RATE;
    const I = index * Math.exp(-t / (decay * 0.22));
    const e = Math.min(1, t / 0.003) * Math.exp(-t / decay);
    write(i0 + k, Math.sin(TAU * f * t + I * Math.sin(TAU * f * ratio * t)) * amp * e, p, wet);
  }
}

function pluck({ at, f, amp, pan = 0, decay = 0.7, wet = 0.35 }) {
  const i0 = Math.round(at * RATE);
  const n = Math.round(decay * 4 * RATE);
  const p = pans(pan);
  for (let k = 0; k < n; k++) {
    const t = k / RATE;
    let v = 0;
    for (let h = 1; h <= 5; h++) v += Math.sin(TAU * f * h * t) * Math.exp(-t / (decay / (1 + 0.9 * (h - 1)))) / h ** 1.6;
    write(i0 + k, v * amp * Math.min(1, t / 0.002), p, wet);
  }
}

function tick({ at, amp, pan = 0, f = 3200, decay = 0.006, wet = 0.15 }) {
  const i0 = Math.round(at * RATE);
  const n = Math.round(decay * 8 * RATE);
  const p = pans(pan);
  let lp = 0;
  for (let k = 0; k < n; k++) {
    const t = k / RATE;
    const noise = rand() * 2 - 1;
    lp += 0.35 * (noise - lp);
    write(i0 + k, (noise - lp) * 0.5 * amp * Math.exp(-t / decay) + Math.sin(TAU * f * t) * amp * 0.6 * Math.exp(-t / (decay * 1.5)), p, wet);
  }
}

// Band-passed noise whose centre glides from f0 to f1.
function sweep({ at, dur, f0, f1, amp, q = 3, pan = 0, wet = 0.4, curve = (u) => Math.sin(Math.PI * u) ** 1.5 }) {
  const i0 = Math.round(at * RATE);
  const n = Math.round(dur * RATE);
  const p = pans(pan);
  let low = 0;
  let band = 0;
  for (let k = 0; k < n; k++) {
    const u = k / n;
    const fc = f0 * Math.pow(f1 / f0, u);
    const F = 2 * Math.sin((Math.PI * Math.min(fc, RATE / 6)) / RATE);
    const x = rand() * 2 - 1;
    low += F * band;
    const high = x - low - band / q;
    band += F * high;
    const edge = Math.min(1, k / (RATE * 0.008), (n - k) / (RATE * 0.012));
    write(i0 + k, band * amp * curve(u) * edge, p, wet);
  }
}

// Slow chord: each note is three slightly detuned sines that breathe on their own.
function pad({ from, to, notes, amp, att = 2.2, rel = 2.6, wet = 0.6, air = 0.12 }) {
  const i0 = Math.round(from * RATE);
  const n = Math.round((to - from + rel) * RATE);
  const sustain = to - from;
  notes.forEach((m, idx) => {
    const p = pans(((idx % 2) * 2 - 1) * 0.35 * (0.4 + (idx / notes.length)));
    const level = amp * (m < 45 ? 1.25 : 1) / Math.sqrt(notes.length);
    for (const cents of [-5, 0, 5]) {
      const f = mtof(m) * Math.pow(2, cents / 1200);
      const lfoRate = 0.05 + rand() * 0.12;
      const lfoPh = rand() * TAU;
      let ph = rand() * TAU;
      for (let k = 0; k < n; k++) {
        const t = k / RATE;
        ph += (TAU * f) / RATE;
        const e = t < att ? smooth01(t / att) : t < sustain ? 1 : Math.exp((-(t - sustain) / rel) * 3);
        const lfo = 0.75 + 0.25 * Math.sin(TAU * lfoRate * t + lfoPh);
        const v = (Math.sin(ph) + air * Math.sin(2 * ph)) * level * e * lfo / 3;
        write(i0 + k, v, p, wet);
      }
    }
  });
}
const smooth01 = (x) => x * x * (3 - 2 * x);

// A spray of tiny tones: many small numbers, heard at once.
function grains({ from, to, rate, notes, amp, len = 0.04, wet = 0.45, glide = 1, density = () => 1 }) {
  const count = Math.round((to - from) * rate);
  for (let g = 0; g < count; g++) {
    const u = rand();
    if (rand() > density(u)) continue;
    const at = from + u * (to - from);
    const f = mtof(notes[Math.floor(rand() * notes.length)]);
    const d = len * (0.6 + rand() * 0.8);
    const i0 = Math.round(at * RATE);
    const n = Math.round(d * RATE);
    const p = pans(rand() * 1.6 - 0.8);
    const a = amp * (0.4 + rand() * 0.6);
    let ph = 0;
    for (let k = 0; k < n; k++) {
      const w = Math.sin((Math.PI * k) / n) ** 2;
      ph += (TAU * f * (1 + (glide - 1) * (k / n))) / RATE;
      write(i0 + k, Math.sin(ph) * a * w, p, wet);
    }
  }
}

// ------------------------------------------------------------------ the cues
const D_PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88, 90, 93];
const CHORD = {
  Dmaj9: [38, 45, 52, 54, 57, 61],
  Bm9: [35, 42, 50, 54, 57, 61],
  Gmaj9: [31, 38, 47, 54, 57, 61],
  Asus: [33, 40, 47, 54, 57, 64],
  thin: [54, 57, 61, 66],
  end: [38, 45, 54, 57, 64],
};

// The message arrives.
bell({ at: A.arrive, f: mtof(74), amp: 0.07, decay: 3.2, index: 1.4, wet: 0.7 });
sine({ at: A.arrive, dur: 0.05, f: mtof(38), amp: 0.16, rel: 0.9 });
pad({ from: A.arrive, to: A.layers + 0.6, notes: CHORD.Dmaj9, amp: 0.05, att: 3.0 });

// It comes apart into pieces.
for (let k = 0; k < 6; k++) tick({ at: A.split - 0.36 + k * 0.028, amp: 0.05, f: 2600 + k * 260, pan: -0.6 + k * 0.24 });
sweep({ at: A.split - 0.05, dur: 0.8, f0: 900, f1: 4200, amp: 0.05, q: 2.5, wet: 0.5 });

// Each piece becomes numbers.
for (let i = 0; i < 7; i++) {
  grains({ from: A.vectors + 0.09 * i, to: A.vectors + 0.09 * i + 0.95, rate: 70, notes: D_PENTA.slice(5), amp: 0.022, len: 0.03, wet: 0.35 });
}

// Reaching back: one glassy swell per token, then the borrowed pieces arrive.
[69, 71, 74, 76, 78, 81].forEach((m, k) => {
  sine({ at: A.reach + 0.12 + 0.3 * k, dur: 0.55, f: mtof(m), amp: 0.03, att: 0.18, rel: 1.1, wet: 0.7, vib: 0.002 });
});
for (let i = 1; i < 7; i++) {
  for (const j of [0, i - 1]) {
    pluck({ at: A.borrow + 0.6 + 0.07 * i + 0.04 * j, f: mtof(D_PENTA[3 + i + (j ? 1 : 0)]), amp: 0.035, decay: 0.5, pan: -0.5 + i * 0.16 });
  }
}

// Layer after layer.
pad({ from: A.layers - 0.4, to: A.weights + 0.2, notes: CHORD.Bm9, amp: 0.05, att: 2.4 });
sweep({ at: A.layers, dur: 3.2, f0: 160, f1: 2600, amp: 0.035, q: 1.6, wet: 0.6, curve: (u) => Math.sin(Math.PI * u) });
const B_PENTA = [59, 62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88, 90];
for (let l = 0; l < 14; l++) pluck({ at: cues.layerWave(l), f: mtof(B_PENTA[l]), amp: 0.022, decay: 0.45, pan: -0.7 + l * 0.1 });

// Ideas light up.
[71, 74, 78, 81, 85, 76, 83].forEach((m, k) => {
  bell({ at: cues.features[k], f: mtof(m), amp: 0.032, decay: 2.0, index: 1.6, ratio: 2.76, pan: k % 2 ? 0.45 : -0.45, wet: 0.6 });
});
sine({ at: A.directions - 0.1, dur: 1.4, f: mtof(35), amp: 0.06, att: 0.5, rel: 1.4 });

// A word that has not been said yet: a swell toward a note that only lands later.
sine({ at: A.lean - 0.2, dur: 1.5, f: mtof(81), amp: 0.025, att: 1.45, rel: 0.08, wet: 0.8, shape: 'exp' });
sine({ at: A.lean + 1.3, dur: A.weights - A.lean - 1.2, f: mtof(93), amp: 0.006, att: 0.6, rel: 1.2, wet: 0.9, vib: 0.004 });

// Every possible next word, at once.
pad({ from: A.weights - 0.5, to: A.joins + 0.4, notes: CHORD.Gmaj9, amp: 0.05, att: 1.6 });
grains({ from: A.weights + 0.1, to: A.weights + 1.7, rate: 260, notes: [...D_PENTA, 95, 98], amp: 0.016, len: 0.06, wet: 0.6, density: (u) => 1 - u * 0.6 });
grains({ from: A.weights + 1.7, to: A.rest, rate: 26, notes: D_PENTA.slice(6), amp: 0.01, len: 0.09, wet: 0.7 });
cues.hops.slice(0, -1).forEach((t, h) => tick({ at: t, amp: 0.07, f: 2300 + (h % 3) * 300, pan: h % 2 ? 0.3 : -0.3 }));

// One is chosen.
bell({ at: A.chosen, f: mtof(74), amp: 0.075, decay: 3.6, index: 1.8, wet: 0.65 });
bell({ at: A.chosen + 0.004, f: mtof(78), amp: 0.055, decay: 3.2, index: 1.5, wet: 0.65 });
sine({ at: A.chosen, dur: 0.06, f: mtof(38), f2: mtof(37.5), amp: 0.16, rel: 1.0 });

// The rest never happen.
grains({ from: A.rest - 0.1, to: A.rest + 1.3, rate: 90, notes: D_PENTA.slice(4), amp: 0.014, len: 0.18, wet: 0.8, glide: 0.62, density: (u) => 1 - u });
sweep({ at: A.rest - 0.1, dur: 1.6, f0: 5200, f1: 700, amp: 0.022, q: 2, wet: 0.7, curve: (u) => (1 - u) ** 2 * Math.min(1, u * 8) });

// It joins the others, and everything runs again.
sweep({ at: A.joins, dur: 0.95, f0: 2200, f1: 380, amp: 0.04, q: 2.2, wet: 0.5 });
pluck({ at: cues.tokens[7].land, f: mtof(62), amp: 0.06, decay: 0.9 });
sine({ at: cues.tokens[7].land, dur: 0.04, f: mtof(38), amp: 0.12, rel: 0.6 });
pad({ from: A.joins - 0.2, to: A.outside + 0.4, notes: CHORD.Dmaj9, amp: 0.05, att: 1.4 });
const PICK = [69, 71, 74, 76, 78, 81];
cues.passes.forEach((p, k) => {
  sweep({ at: p.start, dur: p.pick - p.start + 0.05, f0: 260, f1: 3000, amp: 0.03, q: 2.4, wet: 0.35, curve: (u) => u ** 1.5 });
  bell({ at: p.pick, f: mtof(PICK[k]), amp: 0.04, decay: 1.1, index: 1.3, wet: 0.5, pan: -0.2 + k * 0.08 });
  pluck({ at: p.land, f: mtof(k % 2 ? 45 : 50), amp: 0.06, decay: 0.55, pan: 0.1 });
});
// The planned word arrives: the note from earlier finally lands.
bell({ at: cues.tokens[11].land, f: mtof(81), amp: 0.05, decay: 2.2, index: 1.2, wet: 0.7 });

// From the outside.
pad({ from: A.outside - 0.3, to: A.inside + 0.6, notes: CHORD.thin, amp: 0.04, att: 1.6, wet: 0.75 });
cues.callouts.forEach((t, k) => pluck({ at: t, f: mtof(86 + (k % 3) * 2), amp: 0.018, decay: 0.35, pan: k < 4 ? -0.5 : 0.5 }));

// Into the numbers.
sweep({ at: A.inside - 0.05, dur: 1.55, f0: 150, f1: 5200, amp: 0.06, q: 1.4, wet: 0.5, curve: (u) => u ** 2 * (1 - smooth01(Math.max(0, u - 0.85) / 0.15)) });
sine({ at: A.inside, dur: 1.4, f: mtof(50), f2: mtof(74), amp: 0.025, att: 0.6, rel: 0.4, shape: 'exp' });
grains({ from: A.inside + 1.2, to: A.dontKnow + 1.6, rate: 55, notes: [88, 90, 93, 95, 98, 100], amp: 0.01, len: 0.012, wet: 0.25, density: (u) => 1 - 0.85 * u });

// "I honestly don't know": one open fifth, breathing with the light.
{
  const from = A.dontKnow;
  const to = A.every - 0.1;
  const i0 = Math.round(from * RATE);
  const n = Math.round((to - from + 0.4) * RATE);
  const notes = [42, 49, 54, 61];
  const phases = notes.map(() => rand() * TAU);
  for (let k = 0; k < n; k++) {
    const t = k / RATE;
    const breath = 0.5 + 0.5 * Math.sin((t * TAU) / 3.4 - Math.PI / 2);
    const e = smooth01(Math.min(1, t / 1.2)) * (t > to - from ? Math.exp((-(t - (to - from)) / 0.4) * 3) : 1);
    let v = 0;
    notes.forEach((m, j) => { v += Math.sin(TAU * mtof(m) * t + phases[j]) / (j + 1.5); });
    write(i0 + k, v * 0.045 * e * (0.35 + 0.65 * breath), pans(0), 0.7);
  }
}

// All of that, for every word.
pad({ from: A.every - 0.05, to: A.black, notes: CHORD.Asus, amp: 0.055, att: 0.25, rel: 0.05 });
cues.quick.forEach((q, k) => {
  sweep({ at: q.at - (q.final ? 0.95 : 0.3), dur: q.final ? 0.5 : 0.26, f0: 320, f1: 3600, amp: 0.022, q: 2.4, wet: 0.3, curve: (u) => u ** 1.5 });
  if (!q.final) {
    tick({ at: q.at, amp: 0.05, f: 2800, pan: -0.3 + k * 0.06 });
    pluck({ at: q.at, f: mtof([57, 61, 64, 66, 69][k % 5]), amp: 0.03, decay: 0.3 });
  }
});
const last = cues.quick.at(-1);
grains({ from: last.at - 0.5, to: last.at - 0.05, rate: 220, notes: D_PENTA, amp: 0.014, len: 0.05, wet: 0.5 });
bell({ at: last.at, f: mtof(74), amp: 0.08, decay: 2.5, index: 1.8, wet: 0.6 });
bell({ at: last.at, f: mtof(81), amp: 0.05, decay: 2.2, index: 1.4, wet: 0.6 });
sine({ at: last.at, dur: 0.05, f: mtof(38), amp: 0.16, rel: 0.5 });

// The end card.
pad({ from: A.title - 0.2, to: DUR - 1.6, notes: CHORD.end, amp: 0.05, att: 1.4, rel: 1.4, wet: 0.7 });
bell({ at: A.title + 0.15, f: mtof(74), amp: 0.045, decay: 3.4, index: 1.1, wet: 0.8 });

// ------------------------------------------------------------------ space and mix
function freeverb(input, { room = 0.86, damp = 0.3, offset = 0 }) {
  const out = new Float32Array(N);
  const scale = RATE / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((n) => ({ buf: new Float32Array(Math.round((n + offset) * scale)), i: 0, store: 0 }));
  const aps = [556, 441, 341, 225].map((n) => ({ buf: new Float32Array(Math.round((n + offset) * scale)), i: 0 }));
  const fb = room * 0.28 + 0.7;
  for (let k = 0; k < N; k++) {
    const x = input[k] * 0.015;
    let y = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.store = o * (1 - damp) + c.store * damp;
      c.buf[c.i] = x + c.store * fb;
      if (++c.i >= c.buf.length) c.i = 0;
      y += o;
    }
    for (const a of aps) {
      const b = a.buf[a.i];
      a.buf[a.i] = y + b * 0.5;
      y = b - y;
      if (++a.i >= a.buf.length) a.i = 0;
    }
    out[k] = y;
  }
  return out;
}
const wet = [freeverb(send[0], {}), freeverb(send[1], { offset: 23 })];

// Hard cut to silence when the picture cuts to black; the end card fades in on its own.
const gate = (t) => (t < A.black ? 1 : t < A.title - 0.25 ? Math.max(0, 1 - (t - A.black) / 0.03) : 1);
const score = [new Float32Array(N), new Float32Array(N)];
for (let c = 0; c < 2; c++) {
  for (let k = 0; k < N; k++) {
    const t = k / RATE;
    const gWet = t >= A.black && t < A.title - 0.25 ? 0 : 1;
    score[c][k] = (dry[c][k] + wet[c][k] * 3.2 * gWet) * gate(t);
  }
}
writeWav(new URL('audio/score.wav', root), score);

// Duck the score under the voice.
const voice = readWav(new URL('audio/voice.wav', root)).channels[0];
const win = Math.round(RATE * 0.02);
const env = new Float32Array(N);
let level = 0;
for (let k = 0; k < N; k += win) {
  let s = 0;
  for (let j = k; j < Math.min(N, k + win); j++) s += voice[j] * voice[j];
  const rms = Math.sqrt(s / win);
  const target = Math.min(1, rms / 0.05);
  level += (target - level) * (target > level ? 0.5 : 0.04);
  env.fill(level, k, Math.min(N, k + win));
}
const mix = [new Float32Array(N), new Float32Array(N)];
let peak = 0;
for (let k = 0; k < N; k++) {
  const duck = 1 - 0.45 * env[k];
  for (let c = 0; c < 2; c++) {
    const v = voice[k] * 0.9 + score[c][k] * duck * 1.6;
    mix[c][k] = Math.tanh(v * 1.05) / 1.05;
    peak = Math.max(peak, Math.abs(mix[c][k]));
  }
}
writeWav(new URL('audio/mix.wav', root), mix);

// Loudness for online video: -16 LUFS integrated, true peak under -1.5 dBTP.
const mixWav = fileURLToPath(new URL('audio/mix.wav', root));
const m4a = fileURLToPath(new URL('audio/mix.m4a', root));
const measure = spawnSync('ffmpeg', ['-hide_banner', '-i', mixWav, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
const stats = JSON.parse(measure.stderr.slice(measure.stderr.lastIndexOf('{')));
const norm = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:offset=${stats.target_offset}:linear=true`;
// AAC for the MP4; MP3 for the live page, since every browser can decode it.
const mp3 = fileURLToPath(new URL('audio/mix.mp3', root));
for (const [out, codec] of [[m4a, ['-c:a', 'aac', '-b:a', '192k']], [mp3, ['-c:a', 'libmp3lame', '-b:a', '192k']]]) {
  const enc = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', mixWav, '-af', `${norm},aresample=48000`, ...codec, out], { encoding: 'utf8' });
  if (enc.status !== 0) throw new Error(enc.stderr);
}
console.log(`score + voice mixed (pre-norm peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS, input ${stats.input_i} LUFS) -> audio/mix.m4a, audio/mix.mp3`);
