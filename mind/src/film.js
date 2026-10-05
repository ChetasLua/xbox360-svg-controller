// "A self-portrait, from the outside" — one forward pass, slowed down to a minute.
// Everything is drawn here, every frame, from the time `t` alone, so the live page and
// the offline renderer produce identical pictures.
import {
  W, H, clamp, lerp, seg, smooth, ease, window01, rng, gauss, noise1,
  v3, add, mul, mix3, Camera, glow, rgba, polyline,
} from './engine.js';

const C = {
  paper: '236,232,224',
  cool: '96,150,255',
  warm: '255,146,82',
  gold: '255,222,160',
  arc: '206,218,255',
  ghost: '178,188,210',
};
const SERIF = '"Instrument Serif", Georgia, serif';
const MONO = '"JetBrains Mono", "DejaVu Sans Mono", monospace';

// Geometry of the model drawn in world units.
const D = 128;                       // dimensions drawn per vector (the real count is far larger)
const EMB_Y0 = 0.15;
const EMB_Y1 = 3.15;
const TICK = (EMB_Y1 - EMB_Y0) / D;
const STACK_Y0 = 3.55;
const LAYERS = 14;
const GAP = 0.5;
const TOP = STACK_Y0 + (LAYERS - 1) * GAP;
const NODE_Y = TOP + 0.5;
const SP = 1.1;                      // spacing between tokens on the row
const LABEL_Y = -0.52;
const planeY = (l) => STACK_Y0 + l * GAP;

const QUESTION = ['What', "'s", ' going', ' on', ' in', ' there', '?'];
const ANSWER = ['Honestly', '?', ' Let', ' me', ' show', ' you', '.'];
const GHOST_INDEX = QUESTION.length + 4; // " show": planned before it is said

// Next-word candidates after "What's going on in there?". Illustrative weights.
const CANDIDATES = [
  ['Honestly', 0.24], ['Mostly', 0.11], ['Well', 0.07], ["It's", 0.06], ['A', 0.05],
  ['Numbers', 0.045], ['Lots', 0.04], ['Right', 0.033], ['Not', 0.03], ['Something', 0.026],
  ['I', 0.024], ['Hard', 0.02], ['Quite', 0.018], ["There's", 0.016], ['Nothing', 0.014],
  ['Thinking', 0.013], ['Good', 0.012], ['So', 0.011], ['Patterns', 0.01], ['Plenty', 0.009],
  ['Math', 0.008], ['Words', 0.008], ['Hmm', 0.007], ['Everything', 0.006], ['Oh', 0.006],
  ['Curious', 0.005], ['Static', 0.004], ['Quiet', 0.004], ['Weather', 0.003], ['Gears', 0.003],
  ['Light', 0.003], ['Pancakes', 0.0012],
];
const TAIL = 640;
// Candidates for the very last word, with where they sit around the output node.
const LAST_WORDS = [['one', 0.58, 0, -80], ['word', 0.22, -175, -14], ['time', 0.07, 160, -36], ['sentence', 0.05, -130, 58], ['moment', 0.04, 170, 54]];

const FEATURES = [
  { tok: 0, layer: 2, dir: [-0.62, 0.5, 0.6], label: '≈ an open question' },
  { tok: 2, layer: 4, dir: [-0.25, 0.72, 0.65], label: '≈ something happening' },
  { tok: 5, layer: 5, dir: [0.2, 0.62, 0.76], label: '≈ inside of something' },
  { tok: 4, layer: 7, dir: [-0.5, 0.42, 0.76], label: '≈ a place' },
  { tok: 6, layer: 8, dir: [0.62, 0.42, 0.66], label: '≈ asked of me' },
  { tok: 3, layer: 9, dir: [-0.62, 0.62, 0.48], label: '≈ casual tone' },
  { tok: 6, layer: 11, dir: [0.4, 0.78, 0.48], label: '≈ be honest' },
];

export function createFilm(timeline, { credit } = {}) {
  const lines = Object.fromEntries(timeline.lines.map((l) => [l.id, l]));
  const bare = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, '');
  const word = (id, text, nth = 0) => {
    const hits = lines[id].words.filter((w) => bare(w.w) === bare(text));
    if (!hits.length) throw new Error(`"${text}" is not spoken in line "${id}"`);
    return hits[Math.min(nth, hits.length - 1)];
  };

  // Moments in the film, all tied to the spoken words.
  const A = {
    arrive: lines.before.end + 0.35,
    split: word('pieces', 'pieces').s,
    vectors: word('pieces', 'becomes').s,
    reach: lines.attention.start,
    borrow: word('attention', 'borrows').s,
    layers: lines.layers.start,
    ideas: word('layers', 'ideas').s,
    directions: word('layers', 'directions').s,
    lean: word('layers', 'lean').s,
    weights: lines.choice.start,
    chosen: word('choice', 'chosen').s,
    rest: word('choice', 'rest').s,
    joins: lines.loop.start,
    runs: word('loop', 'runs').s,
    outside: lines.outside.start,
    inside: word('outside', 'whether').s,
    dontKnow: word('outside', 'honestly').s,
    every: lines.every.start,
    one: word('every', 'one').s,
    end: lines.every.end,
  };
  A.black = A.end + 0.32;
  A.title = A.end + 1.0;

  // Every piece of text drawn in a frame, so tools can check that nothing collides.
  let boxes = [];
  const box = (x, y, w, h, kind, text = '') =>
    boxes.push({ x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2, kind, text });

  // ---------------------------------------------------------------- tokens on the row
  const tokens = [];
  QUESTION.forEach((text) => tokens.push({ text, kind: 'q', land: A.arrive }));
  tokens.push({ text: ANSWER[0], kind: 'a', land: A.joins + 0.95 });
  const passDur = [0.92, 0.78, 0.64, 0.54, 0.47, 0.42];
  const passes = [];
  let ps = Math.max(A.runs - 0.15, A.joins + 1.0);
  passDur.forEach((dur, k) => {
    const index = tokens.length;
    tokens.push({ text: ANSWER[k + 1], kind: 'a', land: ps + dur });
    passes.push({ start: ps, dur, index, from: index - 1 });
    ps += dur;
  });
  // The last line is generated live, word by word, as it is spoken.
  const quick = [];
  lines.every.words.forEach((w, k) => {
    const m = w.w.match(/^(.*?)([.,!?]*)$/);
    const isLast = k === lines.every.words.length - 1;
    const index = tokens.length;
    tokens.push({ text: ' ' + m[1], kind: 'e', land: w.s + (isLast ? 0.36 : 0.04) });
    quick.push({ index, at: w.s, from: index - 1, final: isLast });
    if (m[2]) tokens.push({ text: m[2], kind: 'e', land: w.e });
  });
  const N = tokens.length;

  // ---------------------------------------------------------------- the numbers
  const rand = rng(7);
  const V = tokens.map(() => {
    const layers = [];
    let v = Float32Array.from({ length: D }, () => gauss(rand) * (rand() < 0.05 ? 2.4 : 0.85));
    layers.push(v);
    for (let l = 0; l < LAYERS; l++) {
      v = v.map((x) => (rand() < 0.3 ? x * 0.86 + gauss(rand) * 0.42 : x));
      layers.push(v);
    }
    return layers;
  });
  const dimAt = (l, q) => (l * 37 + q * 11) % D;

  // Who each question token borrows from in the close-up (one attention head, invented).
  const attn = QUESTION.map((_, i) => {
    const logits = QUESTION.map((__, j) => {
      if (j > i) return -Infinity;
      let x = gauss(rand) * 0.7;
      if (j === i) x += 0.5;
      if (j === i - 1) x += 0.8;
      if (j === 0) x += 0.6;
      if (i === 5 && j === 4) x += 1.8;
      if (i === 6 && j === 0) x += 2.0;
      if (i === 2 && j === 1) x += 1.2;
      if (i === 3 && j === 2) x += 1.2;
      return x;
    });
    const mx = Math.max(...logits);
    const e = logits.map((x) => (x === -Infinity ? 0 : Math.exp(x - mx)));
    const s = e.reduce((a, b) => a + b, 0);
    return e.map((x) => x / s);
  });
  // What each question token takes from the others (mixed in as the pulses arrive).
  const borrowed = QUESTION.map((_, i) => {
    const out = new Float32Array(D);
    attn[i].forEach((w, j) => { if (j !== i) for (let d = 0; d < D; d++) out[d] += w * V[j][0][d] * 0.9; });
    return out;
  });
  // Per-layer attention for the whole row: each token's two strongest sources.
  const layerArcs = Array.from({ length: LAYERS }, () => tokens.map((_, i) => {
    if (i === 0) return [];
    const picks = [];
    const a = Math.max(0, i - 1 - Math.floor(rand() * Math.min(i, 4)));
    picks.push({ j: a, w: 0.45 + rand() * 0.55 });
    const b = Math.floor(rand() * i);
    if (b !== a) picks.push({ j: b, w: 0.15 + rand() * 0.4 });
    return picks;
  }));

  const dust = Array.from({ length: 320 }, () => ({
    p: v3((rand() - 0.5) * 34, rand() * 22 - 6, -rand() * 26 + 9),
    a: 0.2 + rand() * 0.55,
  }));

  // Candidate cloud: a sunflower of next words, largest weight nearest the centre.
  const total = CANDIDATES.reduce((s, c) => s + c[1], 0);
  const tailMass = 1 - total;
  const tailRaw = Array.from({ length: TAIL }, (_, k) => Math.pow(k + 12, -1.15));
  const tailSum = tailRaw.reduce((a, b) => a + b, 0);
  const cands = [
    ...CANDIDATES.map(([w, p]) => ({ w, p })),
    ...tailRaw.map((x) => ({ w: null, p: (x / tailSum) * tailMass })),
  ];
  let cloud = null; // laid out on first use, once fonts are ready
  const hops = [3, 1, 7, 2, 5, 1, 4, 0];
  const hopAt = (h) => A.chosen - 0.85 + 0.85 * Math.pow(h / (hops.length - 1), 1.7);

  // ---------------------------------------------------------------- the row over time
  const presence = (i, t) => {
    const tk = tokens[i];
    if (tk.kind === 'q') return smooth(seg(t, A.arrive, A.arrive + 0.18));
    return smooth(seg(t, tk.land - 0.04, tk.land + 0.22));
  };
  const countAt = (t) => {
    let n = 0;
    for (let i = 0; i < N; i++) n += presence(i, t);
    return n;
  };
  const centerAt = (t) => {
    const n = Math.max(QUESTION.length, countAt(t));
    return n <= 14 ? (n - 1) / 2 : n - 7.5;
  };
  const rowX = (i, t) => (i - centerAt(t)) * SP;
  const lastIndex = (t) => {
    let last = 0;
    for (let i = 0; i < N; i++) if (presence(i, t) > 0.5) last = i;
    return last;
  };

  // How far each stream has grown, 0..1 for the embedding and 0..1 for the stack.
  const embGrow = (i, t) => {
    const tk = tokens[i];
    if (tk.kind === 'q') return ease.out(seg(t, A.vectors + 0.09 * i, A.vectors + 0.09 * i + 0.95));
    return ease.out(seg(t, tk.land, tk.land + (tk.kind === 'e' ? 0.18 : 0.4)));
  };
  const stackGrow = (i, t) => {
    const tk = tokens[i];
    if (tk.kind === 'q') return ease.inOut(seg(t, A.layers + 0.25 + 0.05 * i, A.layers + 2.7 + 0.05 * i));
    return ease.out(seg(t, tk.land + 0.05, tk.land + (tk.kind === 'e' ? 0.25 : 0.55)));
  };
  const mixAt = (i, t) => (i < QUESTION.length ? ease.inOut(seg(t, A.borrow + 0.3 + 0.07 * i, A.borrow + 1.25 + 0.07 * i)) : 0);

  // Light travelling up the stack: one sweep per generated token.
  const sweeps = [
    ...passes.map((p) => ({ a: p.start, b: p.start + p.dur * 0.55, from: p.from })),
    ...quick.map((q) => ({ a: q.at - (q.final ? 0.95 : 0.3), b: q.at - (q.final ? 0.5 : 0.06), from: q.from })),
  ];
  // A sweep is a bright front with a fading tail beneath it.
  const sweepGlow = (y, ys) => {
    let g = 0;
    for (const yb of ys) {
      const front = Math.exp(-(((y - yb) / 0.45) ** 2));
      const tail = y < yb ? Math.exp(-(yb - y) / 1.7) * 0.5 : 0;
      g = Math.max(g, front + tail);
    }
    return Math.min(1.2, g);
  };
  const sweepY = (t) => {
    const out = [];
    for (const s of sweeps) if (t >= s.a - 0.05 && t <= s.b + 0.25) out.push(lerp(-0.4, NODE_Y + 0.3, ease.inOut(seg(t, s.a, s.b))));
    return out;
  };
  // The first slow wave climbing the layers while "layer after layer" is said.
  const layerWave = (l, t) => {
    let v = 0;
    for (let k = 0; k < 3; k++) {
      const c = (t - A.layers - 0.55 - k * 2.6) / 0.17;
      v = Math.max(v, Math.exp(-((l - c) ** 2) / 3.2) * (k === 0 ? 1 : 0.55));
    }
    return v * window01(t, A.layers, A.weights - 0.6, 0.4, 0.8);
  };

  // ---------------------------------------------------------------- camera
  const cam = new Camera();
  const shot = (pos, target, fov = 40) => ({ pos, target, fov });
  const nodeOf = (i, t) => v3(rowX(i, t), NODE_Y, 0);
  const SHOTS = {
    close: () => shot(v3(0, 1.62, 10.2), v3(0, 1.62, 0), 40),
    stackLow: () => shot(v3(11, 6.0, 18.5), v3(0.6, 3.75, 0), 42),
    stackHigh: () => shot(v3(7.5, 10.0, 19.5), v3(1.6, 4.2, 0), 42),
    output: (t) => { const n = nodeOf(6, t); return shot(add(n, v3(0.9, 1.35, 7.4)), add(n, v3(0, -0.3, 0)), 40); },
    wide: () => shot(v3(2.6, 6.4, 22.5), v3(0, 4.6, 0), 42),
    wideIn: () => shot(v3(3.0, 5.6, 20.0), v3(1.0, 4.1, 0), 42),
    wide2: () => shot(v3(-2.2, 6.9, 23.5), v3(0, 4.8, 0), 42),
    far: () => shot(v3(0, 5.2, 46), v3(0, 4.9, 0), 38),
    dive: (t) => { const p = v3(rowX(9, t), 7.25, 0); return shot(add(p, v3(0.02, 0.01, 0.42)), p, 16); },
    every: () => shot(v3(3.6, 5.6, 24.5), v3(1.4, 4.9, 0), 42),
    every2: () => shot(v3(4.4, 5.5, 25.5), v3(1.8, 5.1, 0), 42),
  };
  const KEYS = [
    [0, 'close'],
    [A.layers - 0.45, 'close'],
    [A.layers + 2.7, 'stackLow'],
    [A.weights - 1.7, 'stackHigh'],
    [A.weights + 0.15, 'output'],
    [A.joins + 0.05, 'output'],
    [A.joins + 2.0, 'wide'],
    [A.runs + 2.6, 'wideIn'],
    [A.outside - 0.3, 'wide2'],
    [A.outside + 2.0, 'far'],
    [A.inside - 0.05, 'far'],
    [A.inside + 1.45, 'dive', ease.in],
    [A.every - 0.02, 'dive'],
    [A.every - 0.01, 'every'],
    [A.end + 0.4, 'every2'],
  ];
  function cameraAt(t) {
    let k = 0;
    while (k < KEYS.length - 1 && t >= KEYS[k + 1][0]) k++;
    const [t0, n0] = KEYS[k];
    const next = KEYS[k + 1];
    const a = SHOTS[n0](t);
    let s = a;
    if (next) {
      const [t1, n1, curve] = next;
      const u = (curve || ease.inOut)(seg(t, t0, t1));
      const b = SHOTS[n1](t);
      s = { pos: mix3(a.pos, b.pos, u), target: mix3(a.target, b.target, u), fov: lerp(a.fov, b.fov, u) };
    }
    const drift = v3(noise1(t * 0.13, 1) * 0.12, noise1(t * 0.11, 2) * 0.09, 0);
    return cam.set(add(s.pos, drift), s.target, s.fov);
  }

  // ---------------------------------------------------------------- drawing pieces
  function drawDust(ctx, t) {
    const a = smooth(seg(t, A.arrive, A.arrive + 1.4)) * (1 - smooth(seg(t, A.inside + 0.9, A.inside + 1.3)));
    if (a <= 0) return;
    for (const d of dust) {
      const s = cam.project(d.p);
      if (!s || s.x < -10 || s.x > W + 10 || s.y < -10 || s.y > H + 10) continue;
      const r = clamp(s.k * 0.014, 0.7, 2.4);
      ctx.fillStyle = rgba(C.paper, a * d.a * clamp(1.4 - s.z / 50, 0.15, 1) * 0.6);
      ctx.fillRect(s.x - r / 2, s.y - r / 2, r, r);
    }
  }

  // Vectors: one tick per number, right for positive (warm), left for negative (cool).
  const BUCKETS = 7;
  const focusAt = (t) => 1 - 0.55 * window01(t, A.weights - 0.2, A.joins + 0.7, 0.6, 0.9);
  function drawStreams(ctx, t, sweepsNow) {
    const focus = focusAt(t);
    const buckets = { warm: [], cool: [] };
    for (let b = 0; b < BUCKETS; b++) { buckets.warm.push([]); buckets.cool.push([]); }
    const ref = cam.project(v3(0, 4, 0));
    const k = ref ? ref.k : 100;
    const step = Math.max(1, Math.ceil(1.7 / (k * TICK)));
    const lw = clamp(k * TICK * 0.6, 0.75, 2.6);
    const ripple = (i, y) => {
      if (i >= QUESTION.length) return 0;
      const yr = lerp(EMB_Y1, EMB_Y0, seg(t, A.borrow + 0.35 + 0.07 * i, A.borrow + 0.95 + 0.07 * i));
      const live = window01(t, A.borrow + 0.3 + 0.07 * i, A.borrow + 1.05 + 0.07 * i, 0.05, 0.1);
      return live * Math.exp(-(((y - yr) / 0.28) ** 2));
    };
    const glowAt = (i, y) => {
      let g = Math.max(ripple(i, y), sweepGlow(y, sweepsNow));
      if (y > STACK_Y0 - 0.1) g = Math.max(g, layerWave((y - STACK_Y0) / GAP, t) * 0.8);
      return g;
    };
    const push = (v, a, x, y, hl) => {
      const p0 = cam.project(v3(v < 0 ? x - hl : x, y, 0));
      const p1 = cam.project(v3(v > 0 ? x + hl : x, y, 0));
      if (!p0 || !p1) return;
      if ((p0.x < -40 && p1.x < -40) || (p0.x > W + 40 && p1.x > W + 40) || p0.y < -20 || p0.y > H + 20) return;
      a *= focus;
      const b = Math.min(BUCKETS - 1, Math.floor(clamp(a) * BUCKETS));
      if (b < 0 || a < 0.02) return;
      (v >= 0 ? buckets.warm : buckets.cool)[b].push(p0.x, p0.y, p1.x + (p1.x === p0.x ? 0.8 : 0), p1.y);
    };
    for (let i = 0; i < N; i++) {
      const pr = presence(i, t);
      if (pr <= 0) continue;
      const x = rowX(i, t);
      const eg = embGrow(i, t);
      const mix = mixAt(i, t);
      const shown = Math.floor(eg * D);
      for (let d = 0; d < shown; d += step) {
        const v = V[i][0][d] + (i < QUESTION.length ? borrowed[i][d] * mix : 0);
        const y = EMB_Y0 + (d + 0.5) * TICK;
        const g = glowAt(i, y);
        const a = pr * (0.22 + 0.78 * Math.min(1, Math.abs(v) / 2.0)) * (0.9 + 1.2 * g);
        push(v, a, x, y, clamp(Math.abs(v) * 0.12, 0.014, 0.36));
      }
      const sg = stackGrow(i, t);
      if (sg <= 0) continue;
      const yTop = lerp(STACK_Y0 - 0.2, NODE_Y, sg);
      const perLayer = Math.floor(GAP / TICK);
      for (let l = 0; l < LAYERS; l++) {
        const y0 = planeY(l);
        if (y0 > yTop) break;
        for (let q = 0; q < perLayer; q += step) {
          const y = y0 + (q + 0.5) * TICK;
          if (y > yTop || y > NODE_Y - 0.08) break;
          const v = V[i][l + 1][dimAt(l, q)];
          const g = glowAt(i, y);
          const a = pr * (0.16 + 0.7 * Math.min(1, Math.abs(v) / 2.0)) * (0.85 + 1.8 * g);
          push(v, a, x, y, clamp(Math.abs(v) * 0.13, 0.014, 0.34));
        }
      }
      // The stream itself: a thin thread of light from the embedding to the top.
      const s0 = cam.project(v3(x, EMB_Y0, 0));
      const s1 = cam.project(v3(x, yTop, 0));
      if (s0 && s1) {
        ctx.strokeStyle = rgba(C.arc, 0.2 * pr * sg);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
      }
    }
    ctx.lineWidth = lw;
    for (const [name, rgb] of [['cool', C.cool], ['warm', C.warm]]) {
      buckets[name].forEach((segs, b) => {
        if (!segs.length) return;
        ctx.strokeStyle = rgba(rgb, (b + 0.6) / BUCKETS);
        ctx.beginPath();
        for (let s = 0; s < segs.length; s += 4) { ctx.moveTo(segs[s], segs[s + 1]); ctx.lineTo(segs[s + 2], segs[s + 3]); }
        ctx.stroke();
      });
    }
  }

  function rowExtent(t) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < N; i++) {
      if (presence(i, t) <= 0.02) continue;
      lo = Math.min(lo, rowX(i, t));
      hi = Math.max(hi, rowX(i, t));
    }
    return [lo - 0.85, hi + 0.85];
  }

  function drawPlanes(ctx, t, sweepsNow) {
    const [x0, x1] = rowExtent(t);
    for (let l = 0; l < LAYERS; l++) {
      const a = smooth(seg(t, A.layers + 0.3 + 0.075 * l, A.layers + 0.9 + 0.075 * l)) * focusAt(t);
      if (a <= 0) continue;
      const y = planeY(l);
      const lit = Math.min(1, Math.max(layerWave(l, t), sweepGlow(y, sweepsNow)));
      const pts = [v3(x0, y, -1.5), v3(x1, y, -1.5), v3(x1, y, 1.5), v3(x0, y, 1.5)].map((p) => cam.project(p));
      if (pts.some((p) => !p)) continue;
      polyline(ctx, [...pts, pts[0]]);
      if (lit > 0.02) {
        ctx.fillStyle = rgba(C.paper, a * 0.045 * lit);
        ctx.fill();
      }
      ctx.strokeStyle = rgba(C.paper, a * (0.065 + 0.5 * lit));
      ctx.lineWidth = 1 + lit;
      ctx.stroke();
      const lab = cam.project(v3(x0 - 0.12, y, 1.5));
      if (lab && t < A.inside) {
        ctx.font = `300 ${clamp(lab.k * 0.13, 9, 14)}px ${MONO}`;
        ctx.fillStyle = rgba(C.paper, a * (0.28 + 0.4 * lit));
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(l + 1), lab.x, lab.y);
      }
    }
  }

  function drawLayerArcs(ctx, t, sweepsNow) {
    const AB = 6;
    const paths = Array.from({ length: AB }, () => []);
    for (let l = 0; l < LAYERS; l++) {
      const pa = smooth(seg(t, A.layers + 0.5 + 0.075 * l, A.layers + 1.2 + 0.075 * l)) * focusAt(t);
      if (pa <= 0) continue;
      const y = planeY(l);
      const lit = Math.min(1, Math.max(layerWave(l, t), sweepGlow(y, sweepsNow)));
      for (let i = 1; i < N; i++) {
        const pi = presence(i, t) * smooth(seg(stackGrow(i, t), (y - STACK_Y0) / (NODE_Y - STACK_Y0), 1));
        if (pi <= 0.02) continue;
        for (const { j, w } of layerArcs[l][i]) {
          const pj = presence(j, t);
          if (pj <= 0.02) continue;
          const a = pa * pi * pj * (0.03 + 0.95 * w * lit);
          if (a < 0.02) continue;
          const xi = rowX(i, t);
          const xj = rowX(j, t);
          const bulge = (xi - xj) * 0.3;
          const pts = [];
          for (let s = 0; s <= 14; s++) {
            const u = s / 14;
            pts.push(cam.project(v3(lerp(xj, xi, u), y, Math.sin(Math.PI * u) * bulge)));
          }
          paths[Math.min(AB - 1, Math.floor(clamp(a / 0.6) * AB))].push(pts);
        }
      }
    }
    ctx.lineWidth = 1.1;
    paths.forEach((group, b) => {
      if (!group.length) return;
      ctx.strokeStyle = rgba(C.arc, ((b + 0.6) / AB) * 0.6);
      ctx.beginPath();
      for (const pts of group) {
        let on = false;
        for (const p of pts) {
          if (!p) { on = false; continue; }
          if (on) ctx.lineTo(p.x, p.y); else { ctx.moveTo(p.x, p.y); on = true; }
        }
      }
      ctx.stroke();
    });
  }

  // The close-up attention arcs above the question, then pulses carrying what is borrowed.
  function drawCloseAttention(ctx, t) {
    const fade = 1 - smooth(seg(t, A.layers - 0.1, A.layers + 1.1));
    if (t < A.reach - 0.1 || fade <= 0) return;
    const base = EMB_Y1 + 0.18;
    const arcPoint = (i, j, u) => {
      const xi = rowX(i, t);
      const xj = rowX(j, t);
      const cx = (xi + xj) / 2;
      const r = (xi - xj) / 2;
      const th = Math.PI * u;
      return v3(cx + r * Math.cos(th), base + 0.52 * r * Math.sin(th), 0);
    };
    for (let i = 1; i < QUESTION.length; i++) {
      const g = ease.out(seg(t, A.reach + 0.12 + 0.3 * (i - 1), A.reach + 0.95 + 0.3 * (i - 1)));
      if (g <= 0) continue;
      for (let j = 0; j < i; j++) {
        const w = attn[i][j];
        const pts = [];
        for (let s = 0; s <= 30; s++) pts.push(cam.project(arcPoint(i, j, (s / 30) * g)));
        polyline(ctx, pts);
        ctx.strokeStyle = rgba(C.arc, fade * (0.1 + 0.85 * w));
        ctx.lineWidth = 0.8 + 3.2 * w;
        ctx.stroke();
        if (g < 1) {
          const head = cam.project(arcPoint(i, j, g));
          if (head) glow(ctx, head.x, head.y, 10 + 22 * w, C.arc, fade * (0.3 + w));
        }
        // Pulse: what j hands to i travels back along the arc.
        const pu = seg(t, A.borrow + 0.05 + 0.07 * i + 0.04 * j, A.borrow + 0.62 + 0.07 * i + 0.04 * j);
        if (w > 0.08 && pu > 0 && pu < 1) {
          const p = cam.project(arcPoint(i, j, 1 - ease.inOut(pu)));
          if (p) glow(ctx, p.x, p.y, 14 + 34 * w, C.gold, fade * Math.min(1, w * 2.2) * Math.sin(Math.PI * pu));
        }
      }
    }
  }

  function chip(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + r, y - h / 2);
    ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r);
    ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r);
    ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r);
    ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r);
    ctx.closePath();
  }

  // Token labels under the streams. Before the split they read as one sentence.
  function tokenLabel(ctx, i, t, x, y, size, alpha, rgb, splitAmt) {
    const tk = tokens[i];
    const lead = tk.text.startsWith(' ');
    const glyphs = tk.text.replace(/^ /, '');
    ctx.font = `300 ${size}px ${MONO}`;
    const gw = ctx.measureText(glyphs).width;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(rgb, alpha);
    ctx.fillText(glyphs, x, y);
    if (alpha > 0.15) box(x, y, gw, size, 'token', glyphs);
    if (splitAmt > 0) {
      const sw = size * 0.6;
      if (lead) {
        ctx.fillStyle = rgba(C.paper, alpha * 0.4 * splitAmt);
        ctx.fillText('·', x - gw / 2 - sw * 0.75, y);
      }
      const cw = gw + (lead ? sw * 1.4 : 0) + size * 0.7;
      chip(ctx, x - (lead ? sw * 0.35 : 0), y, cw, size * 1.5, size * 0.28);
      ctx.strokeStyle = rgba(C.paper, alpha * 0.2 * splitAmt);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // The row steps aside while the camera travels to the top of the stack and into the numbers.
  const rowVis = (t) => Math.min(
    1 - smooth(seg(t, A.weights - 1.75, A.weights - 1.25)) + smooth(seg(t, A.joins + 0.2, A.joins + 0.7)),
    1 - smooth(seg(t, A.inside - 0.15, A.inside + 0.25)) + (t >= A.every - 0.01 ? 1 : 0),
  );

  function drawRow(ctx, t, flying) {
    if (t < A.arrive) return;
    const vis = clamp(rowVis(t));
    if (vis <= 0.001) return;
    const split = ease.inOut(seg(t, A.split, A.split + 0.75));
    const ref = cam.project(v3(0, LABEL_Y, 0));
    ctx.font = `300 34px ${MONO}`;
    const charW = ctx.measureText('M').width;
    // Contiguous sentence layout for the moment of arrival.
    const sentence = QUESTION.join('');
    const left = W / 2 - (sentence.length * charW) / 2;
    let cursor = 0;
    for (let i = 0; i < N; i++) {
      if (flying.has(i)) continue;
      const tk = tokens[i];
      const pr = presence(i, t);
      if (pr <= 0) continue;
      const anchor = cam.project(v3(rowX(i, t), LABEL_Y, 0));
      if (!anchor) continue;
      const size = clamp(34 * anchor.k / 145, 11, 34);
      let x = anchor.x;
      let y = anchor.y;
      let sAmt = 1;
      if (tk.kind === 'q') {
        const lead = tk.text.startsWith(' ') ? 1 : 0;
        const glyphs = tk.text.length - lead;
        const cx = left + (cursor + lead + glyphs / 2) * charW;
        cursor += tk.text.length;
        x = lerp(cx, anchor.x, split);
        y = lerp(ref ? ref.y : anchor.y, anchor.y, split);
        sAmt = split;
      }
      // Planned word: the slot is lit before the word exists.
      let rgb = C.paper;
      const a = pr * vis;
      const age = t - tk.land;
      if (tk.kind !== 'q' && age < 1.2) rgb = age < 0.6 ? C.gold : C.paper;
      if (i === GHOST_INDEX && age >= 0 && age < 0.5) glow(ctx, x, y, 90, C.gold, 0.6 * (1 - age / 0.5));
      if (x < -200 || x > W + 200) continue;
      tokenLabel(ctx, i, t, x, y, size, a, rgb, sAmt);
    }
    // The boundaries flash just before the sentence comes apart.
    const cut = window01(t, A.split - 0.4, A.split + 0.35, 0.15, 0.3);
    if (cut > 0 && ref) {
      let c = 0;
      ctx.strokeStyle = rgba(C.gold, 0.8 * cut);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < QUESTION.length - 1; i++) {
        c += QUESTION[i].length;
        const bx = left + c * charW + (QUESTION[i + 1].startsWith(' ') ? charW * 0.5 : 0);
        ctx.beginPath(); ctx.moveTo(bx, ref.y - 26); ctx.lineTo(bx, ref.y + 26); ctx.stroke();
      }
    }
    // Arrival bloom.
    const bloom = Math.exp(-Math.max(0, t - A.arrive) * 2.4) * (t >= A.arrive ? 1 : 0);
    if (bloom > 0.01 && ref) glow(ctx, W / 2, ref.y, 520, C.paper, 0.16 * bloom);
  }

  function drawFeatures(ctx, t) {
    const out = 1 - smooth(seg(t, A.weights - 1.3, A.weights - 0.2));
    if (t < A.ideas - 0.1 || out <= 0) return;
    const dim = smooth(seg(t, A.directions - 0.1, A.directions + 0.5));
    FEATURES.forEach((f, k) => {
      const g = ease.out(seg(t, A.ideas + 0.17 * k, A.ideas + 0.17 * k + 0.5));
      if (g <= 0) return;
      const p0 = v3(rowX(f.tok, t), planeY(f.layer) + 0.25, 0);
      const dir = v3(...f.dir);
      const p1 = add(p0, mul(dir, 1.25 * g));
      const s0 = cam.project(p0);
      const s1 = cam.project(p1);
      if (!s0 || !s1) return;
      const a = out * g;
      ctx.strokeStyle = rgba(C.gold, a * (0.7 + 0.3 * dim));
      ctx.lineWidth = 1.6 + dim;
      ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
      const ang = Math.atan2(s1.y - s0.y, s1.x - s0.x);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s1.x - 11 * Math.cos(ang - 0.42), s1.y - 11 * Math.sin(ang - 0.42));
      ctx.lineTo(s1.x - 11 * Math.cos(ang + 0.42), s1.y - 11 * Math.sin(ang + 0.42));
      ctx.closePath();
      ctx.fillStyle = rgba(C.gold, a);
      ctx.fill();
      glow(ctx, s0.x, s0.y, 18, C.gold, a * 0.8);
      glow(ctx, s1.x, s1.y, 26 + 20 * dim, C.gold, a * (0.25 + 0.45 * dim));
      ctx.font = `300 17px ${MONO}`;
      ctx.textAlign = Math.cos(ang) < 0 ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(C.paper, a * lerp(0.85, 0.22, dim));
      const lx = s1.x + Math.cos(ang) * 14;
      ctx.fillText(f.label, lx, s1.y + Math.sin(ang) * 14 - 2);
      const lw = ctx.measureText(f.label).width;
      if (a * lerp(0.85, 0.22, dim) > 0.3) box(Math.cos(ang) < 0 ? lx - lw / 2 : lx + lw / 2, s1.y, lw, 17, 'feature', f.label);
    });
  }

  // A future word, already pulling on the present.
  function drawPlan(ctx, t) {
    const ghost = smooth(seg(t, A.lean, A.lean + 0.6)) * (1 - smooth(seg(t, tokens[GHOST_INDEX].land - 0.05, tokens[GHOST_INDEX].land + 0.15)));
    if (ghost <= 0) return;
    const arrows = 1 - smooth(seg(t, A.weights - 0.9, A.weights - 0.1));
    const gp = v3(rowX(GHOST_INDEX, t), LABEL_Y, 0);
    const sg = cam.project(gp);
    if (!sg) return;
    const size = clamp(34 * sg.k / 145, 8, 34);
    ctx.setLineDash([5, 6]);
    if (arrows > 0) {
      [9, 11, 12].forEach((l, k) => {
        const g = ease.inOut(seg(t, A.lean + 0.15 * k, A.lean + 0.15 * k + 0.9));
        if (g <= 0) return;
        const p0 = v3(rowX(6, t), planeY(l) + 0.2, 0);
        const p1 = v3(gp.x, LABEL_Y + 0.55, 0);
        const c = v3(gp.x + 0.4, planeY(l) * 0.7, 1.2);
        const pts = [];
        for (let s = 0; s <= 40 * g; s++) {
          const u = s / 40;
          const a1 = mix3(p0, c, u);
          const a2 = mix3(c, p1, u);
          pts.push(cam.project(mix3(a1, a2, u)));
        }
        polyline(ctx, pts);
        ctx.strokeStyle = rgba(C.gold, 0.55 * arrows * ghost);
        ctx.lineWidth = 1.3;
        ctx.stroke();
      });
    }
    ctx.setLineDash([4, 5]);
    ctx.font = `300 ${size}px ${MONO}`;
    const gw = ctx.measureText('show').width;
    chip(ctx, sg.x - size * 0.2, sg.y, gw + size * 1.6, size * 1.5, size * 0.28);
    ctx.strokeStyle = rgba(C.gold, 0.55 * ghost);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(C.ghost, 0.42 * ghost * (0.8 + 0.2 * Math.sin(t * 5)));
    ctx.fillText('show', sg.x, sg.y);
    glow(ctx, sg.x, sg.y, 70, C.gold, 0.12 * ghost);
  }

  function layoutCloud(ctx) {
    const items = cands.map((c, k) => {
      const labelled = c.w !== null;
      const size = labelled ? clamp(15 + 43 * Math.pow(c.p / cands[0].p, 0.42), 15, 60) : 0;
      ctx.font = `300 ${size}px ${MONO}`;
      const tw = labelled ? ctx.measureText(c.w).width : 0;
      const r = labelled ? 135 + 44 * Math.sqrt(k) : 390 + 21 * Math.sqrt(k - CANDIDATES.length);
      const th = k * 2.39996 - 1.2;
      return { word: c.w, p: c.p, k, size, tw, h: size * 1.25, x: Math.cos(th) * r * 1.25, y: Math.sin(th) * r * 0.66 };
    });
    // Push overlapping labels apart, deterministically.
    const L = items.filter((it) => it.word);
    for (let iter = 0; iter < 160; iter++) {
      for (let a = 0; a < L.length; a++) {
        for (let b = a + 1; b < L.length; b++) {
          const p = L[a];
          const q = L[b];
          const ox = (p.tw + q.tw) / 2 + 22 - Math.abs(p.x - q.x);
          const oy = (p.h + q.h) / 2 + 10 - Math.abs(p.y - q.y);
          if (ox > 0 && oy > 0) {
            const wa = b / (a + b + 1);
            if (ox < oy * 2.2) { const s = Math.sign(p.x - q.x) || 1; p.x += s * ox * (1 - wa) * 0.5; q.x -= s * ox * wa * 0.5; }
            else { const s = Math.sign(p.y - q.y) || 1; p.y += s * oy * (1 - wa) * 0.5; q.y -= s * oy * wa * 0.5; }
          }
        }
        const p = L[a];
        const d = Math.hypot(p.x / 1.4, p.y);
        if (d < 120) { const f = 120 / (d || 1); p.x *= f; p.y *= f; }
      }
    }
    return items;
  }

  // Every possible next word, each with a weight; one is chosen, the rest fall away.
  function drawCloud(ctx, t) {
    if (t < A.weights - 0.6 || t > A.joins + 1.2) return null;
    if (!cloud) cloud = layoutCloud(ctx);
    const node = cam.project(nodeOf(6, t));
    if (!node) return null;
    const cx = node.x;
    const cy = node.y;
    const rest = ease.inOut(seg(t, A.rest - 0.15, A.rest + 1.2));
    const pre = smooth(seg(t, A.weights - 0.6, A.weights + 0.1));
    const gone = 1 - smooth(seg(t, A.joins, A.joins + 0.6));
    glow(ctx, cx, cy, 70 + 40 * pre, C.gold, 0.5 * pre * (1 - 0.6 * rest) * gone);
    let hop = -1;
    for (let h = 0; h < hops.length; h++) if (t >= hopAt(h)) hop = h;
    const chosen = t >= A.chosen;
    let chosenPos = null;
    for (const it of cloud) {
      const born = A.weights + 0.12 + 1.35 * Math.pow(it.k / cands.length, 0.55);
      const g = ease.outBack(seg(t, born, born + 0.32));
      if (g <= 0) continue;
      const isWinner = it.k === 0;
      const fade = isWinner ? 1 : 1 - rest;
      if (fade <= 0.003) continue;
      const drift = isWinner ? 0 : rest;
      const x = cx + it.x * (0.6 + 0.4 * g) * (1 + 0.35 * drift);
      const y = cy + it.y * (0.6 + 0.4 * g) * (1 + 0.35 * drift) + 50 * drift * drift;
      if (!it.word) {
        const r = clamp(0.8 + Math.sqrt(it.p / 0.003) * 2.1, 0.7, 3.2);
        ctx.fillStyle = rgba(C.paper, fade * g * clamp(0.22 + it.p * 160, 0.18, 0.7));
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
        continue;
      }
      if (isWinner) chosenPos = { x, y, size: it.size };
      if (isWinner && t >= A.joins) continue; // it is in flight now
      const lit = (hop >= 0 && hops[hop] === it.k && !chosen) || (isWinner && chosen);
      ctx.font = `300 ${it.size * (isWinner && chosen ? 1 + 0.12 * ease.out(seg(t, A.chosen, A.chosen + 0.3)) : 1)}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const base = clamp(0.35 + Math.pow(it.p / cands[0].p, 0.5) * 0.65, 0.35, 1);
      ctx.fillStyle = rgba(lit || (isWinner && chosen) ? C.gold : C.paper, fade * g * (lit ? 1 : base * (chosen && !isWinner ? 0.75 : 1)));
      ctx.fillText(it.word, x, y);
      box(x, y, it.tw, it.size, 'cloud');
      if (it.k < 8) {
        ctx.font = `300 15px ${MONO}`;
        ctx.fillStyle = rgba(C.paper, fade * g * 0.45);
        ctx.fillText(`${(it.p * 100).toFixed(it.p < 0.1 ? 1 : 0)}%`, x, y + it.size * 0.72 + 6);
      }
      if (lit) {
        chip(ctx, x, y, it.tw + 26, it.size * 1.45, 8);
        ctx.strokeStyle = rgba(C.gold, fade * 0.9);
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y + it.size * 0.75);
        ctx.strokeStyle = rgba(C.gold, fade * 0.35);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    if (chosenPos) {
      const flare = Math.exp(-Math.max(0, t - A.chosen) * 3.2) * (chosen ? 1 : 0);
      glow(ctx, chosenPos.x, chosenPos.y, 260, C.gold, 0.55 * flare);
      if (chosen) glow(ctx, chosenPos.x, chosenPos.y, 90, C.gold, 0.22);
    }
    return chosenPos;
  }

  // Tokens in flight from the top of the stack down to their place on the row.
  function drawFlights(ctx, t, cloudPos) {
    const flying = new Set();
    const fly = (index, from, t0, t1, size0) => {
      if (t < t0 || t >= t1) return;
      flying.add(index);
      const u = ease.inOut(seg(t, t0, t1));
      const to = cam.project(v3(rowX(index, t), LABEL_Y, 0));
      if (!to) return;
      const size = lerp(size0, clamp(34 * to.k / 145, 8, 34), u);
      const x = lerp(from.x, to.x, u);
      const y = lerp(from.y, to.y, u) - Math.sin(Math.PI * u) * 40;
      glow(ctx, x, y, 50, C.gold, 0.35);
      tokenLabel(ctx, index, t, x, y, size, 1, C.gold, 0);
    };
    // "Honestly" leaves the cloud.
    const first = QUESTION.length;
    if (t >= A.joins && t < tokens[first].land) {
      const from = cloudPos || cam.project(nodeOf(6, t)) || { x: W / 2, y: H / 2 };
      fly(first, { x: from.x, y: from.y }, A.joins, tokens[first].land, 46);
    }
    for (const p of passes) {
      const b = p.start + p.dur * 0.55;
      if (t < b - 0.02 || t > p.start + p.dur + 0.02) continue;
      const node = cam.project(nodeOf(p.from, t));
      if (!node) continue;
      // A small burst where the word is picked.
      const burst = seg(t, b, b + 0.3);
      if (burst > 0 && burst < 1) {
        const r = rng(p.index * 31);
        for (let k = 0; k < 34; k++) {
          const th = r() * Math.PI * 2;
          const rr = (20 + r() * 70) * ease.out(burst);
          ctx.fillStyle = rgba(C.paper, (1 - burst) * 0.6);
          ctx.fillRect(node.x + Math.cos(th) * rr, node.y + Math.sin(th) * rr * 0.7, 1.6, 1.6);
        }
        glow(ctx, node.x, node.y, 60, C.gold, 0.6 * (1 - burst));
      }
      fly(p.index, node, b, p.start + p.dur, 26);
    }
    for (const q of quick) {
      const t0 = q.at - (q.final ? 0.06 : 0.12);
      if (t < t0 - 0.5 || t > tokens[q.index].land + 0.02) continue;
      const node = cam.project(nodeOf(q.from, t));
      if (!node) continue;
      if (q.final) {
        // The last word gets a small cloud of its own: the same choice, one more time.
        const open = ease.out(seg(t, q.at - 0.55, q.at - 0.22));
        const after = seg(t, q.at, q.at + 0.22);
        const r = rng(901);
        for (let k = 0; k < 160 && open > 0; k++) {
          const th = k * 2.39996;
          const rr = (60 + 15 * Math.sqrt(k)) * open;
          const a = 0.5 * (1 - after) * (0.35 + r() * 0.65);
          ctx.fillStyle = rgba(C.paper, a);
          ctx.fillRect(node.x + Math.cos(th) * rr * 1.35, node.y + Math.sin(th) * rr * 0.78, 1.8, 1.8);
        }
        const hop = t >= q.at ? 0 : t >= q.at - 0.14 ? 2 : t >= q.at - 0.26 ? 1 : -1;
        LAST_WORDS.forEach(([w, p, dx, dy], k) => {
          const size = 16 + 30 * Math.sqrt(p / LAST_WORDS[0][1]);
          const a = open * (k === 0 ? 1 : 1 - after) * (0.45 + 0.55 * Math.sqrt(p / LAST_WORDS[0][1]));
          if (a <= 0.01 || (k === 0 && t >= q.at + 0.02)) return;
          const x = node.x + dx * open;
          const y = node.y + dy * open;
          ctx.font = `300 ${size}px ${MONO}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const lit = hop === k;
          ctx.fillStyle = rgba(lit ? C.gold : C.paper, lit ? 1 : a);
          ctx.fillText(w, x, y);
          if (lit) {
            chip(ctx, x, y, ctx.measureText(w).width + 24, size * 1.45, 8);
            ctx.strokeStyle = rgba(C.gold, 0.9);
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }
        });
        glow(ctx, node.x, node.y, 80, C.gold, 0.5 * open);
        if (t >= q.at) glow(ctx, node.x + LAST_WORDS[0][2], node.y + LAST_WORDS[0][3], 300, C.gold, 0.7 * Math.exp(-(t - q.at) * 5));
        if (t >= q.at + 0.02) fly(q.index, { x: node.x + LAST_WORDS[0][2], y: node.y + LAST_WORDS[0][3] }, q.at + 0.02, tokens[q.index].land, 46);
        continue;
      }
      if (t >= t0) fly(q.index, node, t0, tokens[q.index].land, 22);
    }
    // Punctuation tokens of the last line drop straight in.
    return flying;
  }

  // The output node of the newest token, where the next word is decided.
  function drawNode(ctx, t) {
    if (t < A.layers + 2.2 || t > A.inside + 1.0) return;
    const i = lastIndex(t);
    if (stackGrow(i, t) < 0.95) return;
    const n = cam.project(nodeOf(i, t));
    if (!n) return;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.1);
    glow(ctx, n.x, n.y, 22 + 8 * pulse, C.gold, 0.5);
    ctx.fillStyle = rgba(C.gold, 0.9);
    ctx.beginPath(); ctx.arc(n.x, n.y, 2.6, 0, Math.PI * 2); ctx.fill();
  }

  const CALLOUTS = [
    { text: 'tokens', at: (t) => v3(rowX(2, t), LABEL_Y, 0), dx: -250, dy: 95 },
    { text: 'vectors', at: (t) => v3(rowX(0, t) - 0.2, 1.7, 0), dx: -300, dy: 15 },
    { text: 'attention', at: (t) => v3(rowX(3, t), planeY(3), 0.7), dx: -360, dy: -70 },
    { text: `layers ×${LAYERS}`, at: (t) => v3(rowX(0, t) - 0.85, planeY(10), 1.5), dx: -250, dy: -120 },
    { text: 'weights', at: (t) => nodeOf(13, t), dx: 250, dy: -110 },
    { text: 'one word, sampled', at: (t) => v3(rowX(13, t), LABEL_Y, 0), dx: 230, dy: 95 },
  ];
  function drawCallouts(ctx, t) {
    const out = 1 - smooth(seg(t, A.inside - 0.4, A.inside + 0.15));
    if (t < A.outside + 0.6 || out <= 0) return;
    CALLOUTS.forEach((c, k) => {
      const g = ease.out(seg(t, A.outside + 0.8 + 0.22 * k, A.outside + 1.3 + 0.22 * k));
      if (g <= 0) return;
      const p = cam.project(c.at(t));
      if (!p) return;
      const lx = p.x + c.dx * g;
      const ly = p.y + c.dy * g;
      ctx.strokeStyle = rgba(C.paper, 0.4 * out * g);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(lx, ly); ctx.stroke();
      ctx.fillStyle = rgba(C.paper, 0.85 * out * g);
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.font = `300 17px ${MONO}`;
      ctx.textAlign = c.dx < 0 ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.text, lx + (c.dx < 0 ? -10 : 10), ly);
      const cw = ctx.measureText(c.text).width;
      box(lx + (c.dx < 0 ? -10 - cw / 2 : 10 + cw / 2), ly, cw, 17, 'callout', c.text);
    });
  }

  // Looking for whoever is doing the looking: numbers inside numbers, all the way down.
  const zoomRate = (t) => {
    const go = smooth(seg(t, A.inside + 0.75, A.inside + 1.6));
    const stop = 1 - smooth(seg(t, A.dontKnow - 0.8, A.dontKnow + 1.4));
    return 1.25 * go * (0.06 + 0.94 * stop);
  };
  const zoomTable = [];
  function zoomLog(t) {
    const t0 = A.inside + 0.6;
    if (t <= t0) return 0;
    const dt = 1 / 120;
    const idx = Math.floor((t - t0) / dt);
    while (zoomTable.length <= idx) {
      const k = zoomTable.length;
      zoomTable.push((zoomTable[k - 1] || 0) + zoomRate(t0 + k * dt) * dt);
    }
    return zoomTable[idx];
  }
  function drawNumberField(ctx, t) {
    const vis = smooth(seg(t, A.inside + 0.95, A.inside + 1.5)) * (t < A.every - 0.02 ? 1 : 0);
    if (vis <= 0) return;
    const quiet = smooth(seg(t, A.dontKnow, A.dontKnow + 1.8));
    const Z = 7;
    const zl = zoomLog(t);
    const S0 = 150;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let m = -1; m < 12; m++) {
      const S = S0 * Math.exp(zl) / Math.pow(Z, m);
      if (S < 18 || S > 1400) continue;
      const a = vis * smooth(seg(S, 18, 60)) * (1 - smooth(seg(S, 420, 1400))) * lerp(1, 0.4, quiet);
      if (a <= 0.01) continue;
      const cols = Math.ceil(W / 2 / S) + 1;
      const rows = Math.ceil(H / 2 / (S * 0.45)) + 1;
      const asText = S >= 62;
      if (asText) ctx.font = `300 ${S * 0.15}px ${MONO}`;
      for (let cy = -rows; cy <= rows; cy++) {
        for (let cx = -cols; cx <= cols; cx++) {
          const x = W / 2 + cx * S;
          const y = H / 2 + cy * S * 0.45;
          const d = Math.hypot((x - W / 2) / W, (y - H / 2) / H);
          const fall = clamp(1.25 - d * 1.9, 0, 1);
          if (fall <= 0) continue;
          const h = Math.sin((cx * 12.9898 + cy * 78.233 + m * 37.719) * 1.0) * 43758.5453;
          const v = (h - Math.floor(h)) * 2 - 1;
          const val = Math.sign(v) * Math.pow(Math.abs(v), 2.2) * 2.4;
          const rgb = val >= 0 ? C.warm : C.cool;
          const tint = Math.min(1, Math.abs(val) / 1.6);
          if (asText) {
            ctx.fillStyle = rgba(tint > 0.45 ? rgb : C.paper, a * fall * (0.35 + 0.65 * tint));
            ctx.fillText((val >= 0 ? '+' : '−') + Math.abs(val).toFixed(4), x, y);
          } else {
            ctx.fillStyle = rgba(tint > 0.45 ? rgb : C.paper, a * fall * (0.3 + 0.7 * tint));
            const r = 1.2 + S * 0.03;
            ctx.fillRect(x - r / 2, y - r / 2, r, r);
          }
        }
      }
    }
    // Something, or nothing, at the centre. Left ambiguous on purpose.
    const breath = 0.5 + 0.5 * Math.sin((t - A.dontKnow) * (Math.PI * 2 / 3.4) - Math.PI / 2);
    glow(ctx, W / 2, H / 2, 150 + 40 * breath, C.paper, vis * quiet * (0.1 + 0.16 * breath));
  }

  // ---------------------------------------------------------------- words on screen
  function drawCaptions(ctx, t) {
    for (const line of timeline.lines) {
      const a = window01(t, line.start - 0.06, line.end + 0.75, 0.06, 0.4);
      if (a <= 0) continue;
      ctx.font = `46px ${SERIF}`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      const maxW = 1160;
      const rows = [[]];
      let wRow = 0;
      const space = ctx.measureText(' ').width;
      for (const w of line.words) {
        const ww = ctx.measureText(w.w).width;
        if (wRow + ww > maxW && rows.at(-1).length) { rows.push([]); wRow = 0; }
        rows.at(-1).push({ ...w, x: wRow, ww });
        wRow += ww + space;
      }
      const lh = 56;
      const baseY = 1000 - (rows.length - 1) * lh;
      rows.forEach((row, r) => {
        for (const w of row) {
          const wa = a * smooth(seg(t, w.s - 0.05, w.s + 0.12));
          if (wa <= 0) continue;
          const lift = (1 - smooth(seg(t, w.s - 0.05, w.s + 0.25))) * 6;
          ctx.shadowColor = 'rgba(0,0,0,0.85)';
          ctx.shadowBlur = 18;
          ctx.fillStyle = rgba(C.paper, wa * 0.96);
          ctx.fillText(w.w, 118 + w.x, baseY + r * lh + lift);
          box(118 + w.x + w.ww / 2, baseY + r * lh - 14, w.ww, 46, 'caption', w.w);
        }
      });
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }
  }

  function voiceName(engine) {
    const v = /^elevenlabs\s+eleven_v(\d+)(_turbo)?/i.exec(engine);
    if (v) return `ElevenLabs Eleven v${v[1]}${v[2] ? ' Turbo' : ''}`;
    if (/^kokoro/i.test(engine)) return 'Kokoro, a local stand-in';
    return engine;
  }

  function drawTitle(ctx, t) {
    const a = smooth(seg(t, A.title, A.title + 1.0)) * (1 - smooth(seg(t, timeline.duration - 0.7, timeline.duration)));
    if (a <= 0) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `italic 68px ${SERIF}`;
    ctx.fillStyle = rgba(C.paper, a);
    ctx.fillText(timeline.title + '.', W / 2, H / 2 - 18);
    ctx.font = `300 17px ${MONO}`;
    ctx.fillStyle = rgba(C.paper, a * 0.5);
    ctx.fillText(credit || `every frame drawn in JavaScript  ·  voice: ${voiceName(timeline.voice.engine)}`, W / 2, H / 2 + 52);
  }

  // ---------------------------------------------------------------- one frame
  function render(ctx, t) {
    boxes = [];
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, W, H);
    const blackout = t >= A.black;
    if (!blackout) {
      cameraAt(t);
      const sweepsNow = sweepY(t);
      const world = 1 - smooth(seg(t, A.inside + 1.0, A.inside + 1.45)) + (t >= A.every - 0.01 ? 1 : 0);
      if (world > 0.001) {
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'lighter';
        drawDust(ctx, t);
        if (t >= A.layers) drawPlanes(ctx, t, sweepsNow);
        if (t >= A.layers) drawLayerArcs(ctx, t, sweepsNow);
        drawCloseAttention(ctx, t);
        drawStreams(ctx, t, sweepsNow);
        drawFeatures(ctx, t);
        drawNode(ctx, t);
        const cloudPos = drawCloud(ctx, t);
        drawPlan(ctx, t);
        const flying = drawFlights(ctx, t, cloudPos);
        drawRow(ctx, t, flying);
        drawCallouts(ctx, t);
        if (world < 1) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = rgba('5,6,8', 1 - world);
          ctx.fillRect(0, 0, W, H);
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      drawNumberField(ctx, t);
      ctx.globalCompositeOperation = 'source-over';
    }
    drawCaptions(ctx, t);
    drawTitle(ctx, t);
    ctx.restore();
  }

  // Text that lands on top of a caption word (ignoring faint, tiny dots).
  function collisions() {
    const caps = boxes.filter((b) => b.kind === 'caption');
    const hits = [];
    for (const b of boxes) {
      if (b.kind === 'caption') continue;
      for (const c of caps) {
        if (b.x0 < c.x1 + 4 && b.x1 > c.x0 - 4 && b.y0 < c.y1 + 4 && b.y1 > c.y0 - 4) { hits.push(`${b.kind}:${b.text}×${c.text}`); break; }
      }
    }
    return hits;
  }

  // Moments the soundtrack follows, derived from the same schedule as the pictures.
  const cues = {
    tokens: tokens.map((tk) => ({ text: tk.text, kind: tk.kind, land: tk.land })),
    passes: passes.map((p) => ({ start: p.start, dur: p.dur, pick: p.start + p.dur * 0.55, land: p.start + p.dur })),
    quick: quick.map((q) => ({ at: q.at, final: q.final, land: tokens[q.index].land })),
    hops: hops.map((_, h) => hopAt(h)),
    features: FEATURES.map((_, k) => A.ideas + 0.17 * k),
    callouts: CALLOUTS.map((_, k) => A.outside + 0.8 + 0.22 * k),
    layerWave: (l) => A.layers + 0.55 + l * 0.17,
  };

  return { duration: timeline.duration, anchors: A, cues, render, collisions };
}
