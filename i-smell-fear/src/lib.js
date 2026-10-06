// Small drawing + timing toolkit shared by every scene. Everything is a pure function of time,
// so any frame can be rendered on demand (that is what makes the offline 60 fps render exact).
(function () {
  const L = {};
  L.W = 1080; L.H = 1350;
  L.clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  L.lerp = (a, b, t) => a + (b - a) * t;
  L.prog = (t, a, b) => L.clamp((t - a) / (b - a));
  L.ease = {
    inQuad: x => x * x,
    outQuad: x => 1 - (1 - x) * (1 - x),
    inOutQuad: x => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
    inCubic: x => x * x * x,
    outCubic: x => 1 - Math.pow(1 - x, 3),
    inOutCubic: x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outQuart: x => 1 - Math.pow(1 - x, 4),
    outExpo: x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inExpo: x => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
    outBack: (x, s = 1.9) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
    outElastic: x => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
  };
  // eased progress helper: e(t, a, b, 'outCubic')
  L.e = (t, a, b, name = 'outCubic') => L.ease[name](L.prog(t, a, b));
  // damped spring 0 -> 1 that starts at t0 (overshoots, settles)
  L.spring = (t, t0, freq = 2.6, damp = 0.32) => {
    if (t <= t0) return 0;
    const x = t - t0, w = 2 * Math.PI * freq;
    return 1 - Math.exp(-damp * w * x) * Math.cos(w * Math.sqrt(1 - damp * damp) * x);
  };
  L.decay = (t, t0, tau) => (t < t0 ? 0 : Math.exp(-(t - t0) / tau));
  L.bump = (t, t0, dur) => { const p = (t - t0) / dur; return p < 0 || p > 1 ? 0 : Math.sin(Math.PI * p); };
  L.hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); };
  L.rnd = (i, salt = 0) => L.hash(i * 12.9898 + salt * 78.233 + 0.5);
  L.noise1 = (x, salt = 0) => { // smooth value noise
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return L.lerp(L.rnd(i, salt), L.rnd(i + 1, salt), u) * 2 - 1;
  };

  // ---------- color ----------
  L.C = {
    bg: '#09090d', ink: '#f5f1ea', dim: '#9a968f', faint: '#5d5a55',
    clay: '#d97757', clayLt: '#f0a585', clayDk: '#b2563a', clayGlow: 'rgba(217,119,87,',
    codex: '#6d7cff', codexLt: '#a9b3ff', codexDk: '#4049c8', codexGlow: 'rgba(109,124,255,',
    screen: '#11163a', glyph: '#8deaff',
    red: '#ff3b3b', yellow: '#ffd23f', green: '#3ddc84', xblue: '#1d9bf0',
  };
  L.rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  // ---------- shapes ----------
  L.rr = (ctx, x, y, w, h, r) => {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  L.capsule = (ctx, x1, y1, x2, y2, w) => {
    ctx.beginPath(); ctx.lineCap = 'round'; ctx.lineWidth = w;
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  L.star = (ctx, x, y, r1, r2, n, rot = 0) => {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? r2 : r1, a = rot + i * Math.PI / n - Math.PI / 2;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  };

  // ---------- text ----------
  L.F = {
    anton: 'Anton, Impact, "Arial Narrow Bold", sans-serif',
    inter: 'Inter, "Inter Display", system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", ui-monospace, Menlo, monospace',
    pixel: '"Press Start 2P", monospace',
    emoji: '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
  };
  // text(ctx, str, x, y, {size, font, weight, fill, stroke, sw, align, base, ls, shadow, blur, alpha, maxW})
  L.text = (ctx, str, x, y, o = {}) => {
    ctx.save();
    const size = o.size || 40;
    ctx.font = `${o.weight || ''} ${size}px ${o.font || L.F.inter}`.trim();
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.base || 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (o.ls || 0) + 'px';
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    let sx = 1;
    if (o.maxW) { const w = ctx.measureText(str).width; if (w > o.maxW) sx = o.maxW / w; }
    ctx.translate(x, y); ctx.scale(sx, 1);
    if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.blur || 0; ctx.shadowOffsetY = o.dy || 0; }
    if (o.stroke) {
      ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.lineWidth = o.sw || size * 0.12;
      ctx.strokeStyle = o.stroke; ctx.strokeText(str, 0, 0);
      if (!o.shadowFill) ctx.shadowColor = 'transparent';
    }
    if (o.fill !== null) { ctx.fillStyle = o.fill || L.C.ink; ctx.fillText(str, 0, 0); }
    ctx.restore();
  };
  L.measure = (ctx, str, o = {}) => {
    ctx.save();
    ctx.font = `${o.weight || ''} ${o.size || 40}px ${o.font || L.F.inter}`.trim();
    if ('letterSpacing' in ctx) ctx.letterSpacing = (o.ls || 0) + 'px';
    const w = ctx.measureText(str).width; ctx.restore(); return w;
  };
  L.emoji = (ctx, e, x, y, size, alpha = 1) => {
    ctx.save(); ctx.globalAlpha *= alpha; ctx.font = `${size}px ${L.F.emoji}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e, x, y); ctx.restore();
  };

  // ---------- reusable props ----------
  // rubber stamp with ink speckle; p = slam progress (0..1), r = rotation (rad)
  L.stamp = (ctx, str, x, y, size, rot, color, p, sub) => {
    if (p <= 0) return;
    const s = L.lerp(2.8, 1, L.ease.outQuart(p));
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    ctx.globalAlpha *= L.clamp(p * 3);
    ctx.font = `${size}px ${L.F.anton}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = size * 0.04 + 'px';
    const w = ctx.measureText(str).width, padX = size * 0.35, h = size * (sub ? 1.75 : 1.32);
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = size * 0.09; L.rr(ctx, -w / 2 - padX, -h / 2, w + padX * 2, h, size * 0.16); ctx.stroke();
    ctx.lineWidth = size * 0.03; L.rr(ctx, -w / 2 - padX + size * 0.12, -h / 2 + size * 0.12, w + padX * 2 - size * 0.24, h - size * 0.24, size * 0.1); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(str, 0, sub ? -size * 0.16 : size * 0.04);
    if (sub) { ctx.font = `700 ${size * 0.26}px ${L.F.inter}`; if ('letterSpacing' in ctx) ctx.letterSpacing = size * 0.03 + 'px'; ctx.fillText(sub, 0, size * 0.52); }
    // worn-ink speckles
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 90; i++) {
      const px = (L.rnd(i, 3) - 0.5) * (w + padX * 2), py = (L.rnd(i, 4) - 0.5) * h, pr = 1 + L.rnd(i, 5) * size * 0.05;
      ctx.globalAlpha = 0.35 + L.rnd(i, 6) * 0.5; ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fill();
    }
    ctx.restore();
  };

  // starburst sticker (e.g. -44%)
  L.sticker = (ctx, x, y, r, rot, p, lines, fill = L.C.yellow, ink = '#111') => {
    if (p <= 0) return;
    const s = L.lerp(2.2, 1, L.ease.outBack(L.clamp(p)));
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s); ctx.globalAlpha *= L.clamp(p * 4);
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
    ctx.fillStyle = fill; L.star(ctx, 0, 0, r, r * 0.84, 18); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.stroke();
    lines.forEach(l => L.text(ctx, l.s, 0, l.y, { size: l.size, font: l.font || L.F.anton, fill: l.fill || ink }));
    ctx.restore();
  };

  // 8-bit token coin
  L.coin = (ctx, x, y, r, spin = 0, color = '#ffc93c', edge = '#c98a12') => {
    const sx = Math.max(0.12, Math.abs(Math.cos(spin)));
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, 1);
    ctx.fillStyle = edge; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -r * 0.06, r * 0.84, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-r * 0.45, -r * 0.55, r * 0.22, r * 0.6);
    ctx.fillStyle = edge; ctx.fillRect(-r * 0.12, -r * 0.45, r * 0.24, r * 0.8);
    ctx.restore();
  };

  L.checker = (ctx, x, y, w, h, cell, wave = 0, t = 0) => {
    const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const off = wave ? Math.sin(t * 9 + i * 0.5) * wave * (i / cols) : 0;
      ctx.fillStyle = (i + j) % 2 ? '#111' : '#f2f2f2';
      ctx.fillRect(x + i * cell, y + j * cell + off, cell + 0.6, cell + 0.6);
    }
  };

  // deterministic burst of confetti / pixel coins around (x,y) launched at t0
  L.burst = (ctx, t, t0, x, y, n, o = {}) => {
    const dt = t - t0; if (dt < 0 || dt > (o.life || 1.6)) return;
    for (let i = 0; i < n; i++) {
      const a = (o.a0 ?? -Math.PI) + (o.spread ?? Math.PI) * L.rnd(i, o.seed || 1);
      const v = (o.v || 900) * (0.45 + 0.75 * L.rnd(i, (o.seed || 1) + 1));
      const g = o.g ?? 1600;
      const px = x + Math.cos(a) * v * dt, py = y + Math.sin(a) * v * dt + 0.5 * g * dt * dt;
      const life = 1 - dt / (o.life || 1.6);
      const sz = (o.size || 14) * (0.6 + 0.8 * L.rnd(i, 9));
      ctx.save(); ctx.globalAlpha *= L.clamp(life * 2.2);
      ctx.translate(px, py); ctx.rotate(dt * 9 * (L.rnd(i, 5) - 0.5) * 2);
      const cols = o.colors || [L.C.clay, L.C.yellow, '#fff', L.C.clayLt];
      ctx.fillStyle = cols[i % cols.length];
      if (o.kind === 'coin') L.coin(ctx, 0, 0, sz, dt * 12 + i);
      else ctx.fillRect(-sz / 2, -sz / 4, sz, sz / 2);
      ctx.restore();
    }
  };

  window.L = L;
})();
