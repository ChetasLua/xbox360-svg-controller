// Nine scenes, each a pure function of absolute time t. Event times come from timeline.json
// (word-level timestamps of the ElevenLabs takes), so every hit lands on the voice / music.
(function () {
  const { W, H, C, F, clamp, lerp, prog, e, spring, decay, bump, rnd } = L;
  const E = TL.events;
  const lineById = Object.fromEntries(TL.lines.map(l => [l.id, l]));
  const talk = (id, t) => {
    const l = lineById[id]; const i = Math.floor((t - l.start) * 30);
    return i >= 0 && i < l.env.length ? l.env[i] : 0;
  };
  const wordAt = (id, i) => lineById[id].words[i].at;

  // kick-synced pulse on the music's beat grid (only while the beat is running)
  const pulse = t => {
    if (t < TL.go || (t > E.tapeStop && t < E.finalHit)) return 0;
    const n = Math.floor((t - TL.go) / TL.beat);
    return decay(t, TL.go + n * TL.beat, 0.11) * (n % 2 ? 0.55 : 1);
  };
  // ---------------------------------------------------------------- shared backgrounds
  function glow(ctx, x, y, r, col) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  function base(ctx, t, o = {}) {
    ctx.fillStyle = o.bg || C.bg; ctx.fillRect(-150, -150, W + 300, H + 300);
    const pu = pulse(t);
    ctx.save();
    glow(ctx, o.ax ?? 120, o.ay ?? 220, (o.ar ?? 820) * (1 + 0.12 * pu), o.ac ?? 'rgba(217,119,87,0.17)');
    glow(ctx, o.bx ?? 980, o.by ?? 1100, (o.br ?? 820) * (1 + 0.12 * pu), o.bc ?? 'rgba(109,124,255,0.15)');
    ctx.restore();
    ctx.fillStyle = `rgba(255,255,255,${0.05 + 0.07 * pu})`;
    const off = (t * (o.drift || 12)) % 54;
    for (let x = 27; x < W; x += 54) for (let y = -54 + off; y < H; y += 54) ctx.fillRect(x, y, 2, 2);
  }
  // synthwave floor with scrolling lines
  function floor(ctx, t, hy, speed, colA, colB) {
    const vx = W / 2;
    ctx.save();
    const g = ctx.createLinearGradient(0, hy, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.lineWidth = 2;
    for (let i = -12; i <= 12; i++) {
      ctx.strokeStyle = i < 0 ? colA : colB;
      ctx.globalAlpha = 0.28; ctx.beginPath(); ctx.moveTo(vx + i * 22, hy); ctx.lineTo(vx + i * 260, H + 40); ctx.stroke();
    }
    for (let k = 0; k < 14; k++) {
      const z = ((k + (t * speed) % 1)) / 14, y = hy + (H - hy) * z * z;
      ctx.globalAlpha = 0.3 * z; ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(-50, y); ctx.lineTo(W + 50, y); ctx.stroke();
    }
    ctx.restore();
  }
  function header(ctx, t, t0, tag, title, sub, col) {
    const p = spring(t, t0, 2.4, 0.5), x = lerp(-420, 60, p);
    ctx.save(); ctx.globalAlpha = clamp(p * 1.4);
    ctx.fillStyle = col; L.rr(ctx, x, 62, L.measure(ctx, tag, { size: 26, font: F.pixel }) + 34, 50, 25); ctx.fill();
    L.text(ctx, tag, x + 17, 99, { size: 26, font: F.pixel, fill: '#0b0b0b', align: 'left' });
    L.text(ctx, title, x + 2, 212, { size: 112, font: F.anton, align: 'left', ls: 3, fill: C.ink, shadow: col, blur: 30 });
    L.text(ctx, sub, x + 4, 256, { size: 27, weight: 600, align: 'left', fill: '#a9a49c' });
    ctx.restore();
  }
  function footnote(ctx, str, y = 1272, a = 1) {
    L.text(ctx, str, W / 2, y, { size: 21, weight: 500, fill: 'rgba(200,196,188,.62)', alpha: a, maxW: 1000 });
  }
  function pill(ctx, x, y, str, bg, fg = '#0b0b0b', size = 24, align = 'center') {
    const w = L.measure(ctx, str, { size, weight: 800, ls: 1 }) + size * 1.2, h = size * 1.7;
    const x0 = align === 'center' ? x - w / 2 : x;
    ctx.fillStyle = bg; L.rr(ctx, x0, y - h / 2, w, h, h / 2); ctx.fill();
    L.text(ctx, str, x0 + w / 2, y + size * 0.36, { size, weight: 800, fill: fg, ls: 1 });
    return w;
  }

  // ================================================================ 1. THE TWEET
  function verified(ctx, x, y, r) {
    ctx.save(); ctx.fillStyle = C.xblue; L.star(ctx, x, y, r, r * 0.82, 8); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = r * 0.28; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - r * 0.42, y + r * 0.02); ctx.lineTo(x - r * 0.1, y + r * 0.34); ctx.lineTo(x + r * 0.45, y - r * 0.32); ctx.stroke();
    ctx.restore();
  }
  function tweet(ctx, t) {
    base(ctx, t);
    const zoom = 1 + 0.08 * e(t, E.fine52 - 0.25, E.stamp - 0.02, 'inOutCubic') - 0.08 * e(t, E.stamp, E.stamp + 0.35, 'outCubic');
    ctx.save();
    ctx.translate(540, 860); ctx.scale(zoom, zoom); ctx.translate(-540, -860);
    const cp = spring(t, E.cardIn, 1.9, 0.6);
    const x = 64, y = 96 + (1 - cp) * 160, w = 952, h = 860;
    ctx.globalAlpha = clamp(cp * 1.6);
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
    ctx.fillStyle = '#000'; L.rr(ctx, x, y, w, h, 30); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#2f3336'; ctx.lineWidth = 2; ctx.stroke();
    // avatar = the Codex mascot (stand-in for the poster)
    ctx.save(); ctx.beginPath(); ctx.arc(x + 82, y + 82, 42, 0, 7); ctx.clip();
    ctx.fillStyle = '#20264f'; ctx.fillRect(x + 30, y + 30, 110, 110);
    CHAR.codex(ctx, x + 82, y + 160, 40, { t, face: 'smug' });
    ctx.restore();
    L.text(ctx, 'Tibo', x + 142, y + 72, { size: 34, weight: 800, align: 'left' });
    verified(ctx, x + 142 + L.measure(ctx, 'Tibo', { size: 34, weight: 800 }) + 22, y + 61, 15);
    L.text(ctx, '@thsottiaux · Oct 6', x + 142, y + 112, { size: 29, weight: 500, align: 'left', fill: '#71767b' });
    L.text(ctx, '𝕏', x + w - 50, y + 78, { size: 40, weight: 800, fill: '#e7e9ea' });
    // tweet body, karaoke-highlighted as the Codex voice reads it
    const words = ['The', 'real', 'story', 'is', 'this', 'one'];
    let cx = x + 42;
    words.forEach((wd, i) => {
      const at = wordAt('L1', i), on = t >= at, cur = on && (i === words.length - 1 ? t < at + 0.5 : t < wordAt('L1', i + 1));
      const ww = L.measure(ctx, wd + ' ', { size: 44, weight: 500 });
      const pop = 1 + 0.12 * bump(t, at, 0.25);
      ctx.save(); ctx.translate(cx + ww / 2, y + 188); ctx.scale(pop, pop);
      L.text(ctx, wd, -ww / 2, 0, { size: 44, weight: 500, align: 'left', fill: cur ? C.yellow : '#e7e9ea' });
      ctx.restore(); cx += ww;
    });
    // embedded chart (Artificial Analysis style)
    const px = x + 40, py = y + 236, pw = w - 80, ph = 582;
    ctx.fillStyle = '#f7f6f2'; L.rr(ctx, px, py, pw, ph, 20); ctx.fill();
    L.text(ctx, 'Cost per Intelligence Index Task', px + 34, py + 58, { size: 33, weight: 600, align: 'left', fill: '#1b1b1b', font: F.inter });
    L.text(ctx, 'USD per task · lower is better', px + 34, py + 96, { size: 23, weight: 500, align: 'left', fill: '#7a7770' });
    ctx.fillStyle = '#8c6cf0'; ctx.save(); ctx.translate(px + pw - 300, py + 50);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, -26); ctx.lineTo(28, -26); ctx.lineTo(10, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(32, -26); ctx.lineTo(42, -26); ctx.lineTo(24, 0); ctx.fill(); ctx.restore();
    L.text(ctx, 'Artificial Analysis', px + pw - 248, py + 50, { size: 27, weight: 600, align: 'left', fill: '#3d3a35', font: 'Georgia, serif' });
    const yb = py + 440, sc = 47;
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 2;
    for (let k = 0; k <= 6; k += 2) { ctx.beginPath(); ctx.moveTo(px + 24, yb - k * sc); ctx.lineTo(px + pw - 24, yb - k * sc); ctx.stroke(); }
    ctx.setLineDash([]);
    const gp = e(t, -0.45, 0.3, 'outCubic');
    // Sol bar
    const bw = 230, sx = px + 140, ox = px + pw - 140 - bw;
    const sh = 0.72 * sc * gp;
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(sx, yb - sh, bw, sh);
    L.text(ctx, '$0.72', sx + bw / 2, yb - sh - 14, { size: 34, weight: 700, fill: '#111', alpha: gp });
    // Opus bar (stacked like AA's token-type breakdown)
    const segs = [[2.42, '#e0b3a3'], [1.07, '#d49b85'], [1.68, '#c98670'], [0.70, '#bb6f56']];
    let acc = 0;
    segs.forEach(([v, col]) => { const hh = v * sc * gp; ctx.fillStyle = col; ctx.fillRect(ox, yb - acc - hh, bw, hh + 0.5); acc += hh; });
    const pulse = 1 + 0.08 * bump(t, wordAt('L1', 4), 0.35);
    ctx.save(); ctx.translate(ox + bw / 2, yb - acc - 16); ctx.scale(pulse, pulse);
    L.text(ctx, '$5.98', 0, 0, { size: 34, weight: 700, fill: '#111', alpha: gp }); ctx.restore();
    L.text(ctx, 'GPT-6.1 Sol (max)', sx + bw / 2, yb + 46, { size: 26, weight: 600, fill: '#2a2a2a' });
    L.text(ctx, 'Claude Opus 5.5 (max)', ox + bw / 2, yb + 46, { size: 26, weight: 600, fill: '#2a2a2a' });
    // the fine print the chart left out
    const tag = (cx2, cy, str, t0, rot) => {
      const p = spring(t, t0, 3, 0.45); if (p <= 0) return;
      ctx.save(); ctx.translate(cx2, cy); ctx.rotate(rot); ctx.scale(p, p);
      ctx.fillStyle = C.yellow; L.rr(ctx, -150, -30, 300, 60, 10); ctx.fill();
      L.text(ctx, str, 0, 12, { size: 30, weight: 800, font: F.mono, fill: '#111' });
      ctx.restore();
    };
    tag(sx + bw / 2, yb + 100, 'INTELLIGENCE 52', E.fine52, -0.03);
    tag(ox + bw / 2, yb + 100, 'INTELLIGENCE 58', E.fine58, 0.03);
    const neq = spring(t, E.fine58 + 0.06, 3, 0.4);
    if (neq > 0) L.text(ctx, '≠', px + pw / 2, yb + 118, { size: 90 * neq, weight: 900, fill: C.red });
    ctx.restore();
    // Codex mascot, smug, reading the tweet
    const ci = spring(t, E.codexIn, 2.3, 0.38);
    const isLaugh = t > wordAt('L1', 4) && t < E.stamp;
    const shocked = t >= E.stamp;
    const point = e(t, wordAt('L1', 2) - 0.1, wordAt('L1', 2) + 0.15, 'outBack');
    CHAR.codex(ctx, 150, 1262 + (1 - ci) * 520 - (shocked ? 40 * bump(t, E.stamp, 0.3) : 0), 88, {
      t, face: shocked ? 'shock' : isLaugh ? 'laugh' : 'smug', talk: talk('L1', t), armR: shocked ? 2.2 : point * 1.9,
      armL: shocked ? 2.2 : 0, tilt: isLaugh ? Math.sin(t * 22) * 0.05 : 0, sweat: shocked ? 1 : 0, shake: shocked ? 4 : 0,
      hop: -16 * bump(t, wordAt('L1', 4), 0.22),
    });
    // CHART CRIME stamp + police lights
    const sp = prog(t, E.stamp, E.stamp + 0.13);
    if (t > E.stamp - 0.01 && t < E.stamp + 1.05) {
      const ph = Math.floor((t - E.stamp) / 0.105) % 2;
      glow(ctx, ph ? 0 : W, -40, 900, ph ? 'rgba(255,40,40,0.38)' : 'rgba(40,90,255,0.38)');
    }
    L.stamp(ctx, 'CHART CRIME', 548, 520, 148, -0.13 + 0.01 * Math.sin(t * 30) * decay(t, E.stamp, 0.2), C.red, sp, 'COMPARING A 52 TO A 58');
  }

  // ================================================================ 2. FAIR FIGHT
  function fighter(ctx, t, x, y, w, h, o) {
    const p = spring(t, E.vsSlam, 2.2, 0.42);
    const dx = (1 - p) * (o.side < 0 ? -700 : 700);
    const hit = o.side < 0 ? bump(t, E.beats, 0.35) : 0;
    ctx.save();
    ctx.translate(x + w / 2 + dx - hit * 40, y + h / 2); ctx.rotate(o.side < 0 ? -0.07 * hit : 0.02 * bump(t, E.opusBeats, 0.5));
    const s = o.side > 0 ? 1 + 0.05 * bump(t, E.opusBeats, 0.6) : 1; ctx.scale(s, s);
    ctx.translate(-w / 2, -h / 2);
    ctx.shadowColor = o.col; ctx.shadowBlur = 40;
    ctx.fillStyle = '#121218'; L.rr(ctx, 0, 0, w, h, 34); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = o.col; ctx.lineWidth = 4; ctx.stroke();
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.45); g.addColorStop(0, L.rgba(o.col, 0.35)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; L.rr(ctx, 2, 2, w - 4, h * 0.45, 32); ctx.fill();
    o.mascot(ctx, w / 2, 200);
    L.text(ctx, o.name, w / 2, 262, { size: 37, weight: 800, maxW: w - 40 });
    pill(ctx, w / 2, 306, o.tag, o.col, '#0b0b0b', 22);
    L.text(ctx, o.score, w / 2, 506, { size: 172, font: F.anton, fill: '#fff', shadow: L.rgba(o.col, 0.8), blur: o.win ? 40 * (0.5 + 0.5 * Math.sin(t * 12)) : 0 });
    L.text(ctx, 'INTELLIGENCE INDEX', w / 2, 552, { size: 22, weight: 700, fill: '#8f8a83', ls: 3 });
    ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(30, 588, w - 60, 2);
    const pc = o.priceCol || '#fff';
    L.text(ctx, o.price, w / 2 - 40, 680, { size: 92, font: F.anton, fill: pc });
    L.text(ctx, '/task', w / 2 + 110, 680, { size: 30, weight: 700, fill: '#8f8a83' });
    if (o.strike > 0) {
      ctx.strokeStyle = C.red; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(w / 2 - 150, 652); ctx.lineTo(w / 2 - 150 + 230 * o.strike, 640); ctx.stroke();
    }
    ctx.restore();
  }
  function fair(ctx, t) {
    base(ctx, t, { ax: 900, ay: 400, ac: 'rgba(217,119,87,0.22)', bx: 150, by: 500, bc: 'rgba(109,124,255,0.22)' });
    // diagonal energy split
    ctx.save(); ctx.globalAlpha = 0.5 * spring(t, E.vsSlam, 2, 0.5);
    const sg = ctx.createLinearGradient(500, 0, 580, 0); sg.addColorStop(0, 'rgba(109,124,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,.5)'); sg.addColorStop(1, 'rgba(217,119,87,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(560, 230); ctx.lineTo(600, 230); ctx.lineTo(480, 1060); ctx.lineTo(440, 1060); ctx.fill(); ctx.restore();
    const tp = spring(t, E.vsSlam - 0.06, 2.6, 0.45);
    ctx.save(); ctx.translate(540, 170); ctx.scale(lerp(2.2, 1, clamp(tp)), lerp(2.2, 1, clamp(tp))); ctx.globalAlpha = clamp(tp * 2);
    L.text(ctx, 'FAIR FIGHT', 0, 0, { size: 132, font: F.anton, ls: 6, fill: C.ink, shadow: 'rgba(255,255,255,.35)', blur: 24 });
    ctx.restore();
    L.text(ctx, 'same weight class: OpenAI\'s flagship vs Opus on HIGH', 540, 222, { size: 28, weight: 600, fill: '#aaa59d', alpha: clamp(tp) });
    const win = t > E.beats;
    const cheap = spring(t, E.fortyFour, 3, 0.4);
    fighter(ctx, t, 44, 262, 474, 730, {
      side: -1, col: C.codex, name: 'GPT-6 Astra (max)', tag: "OPENAI'S FLAGSHIP", score: '53', price: '$3.26',
      priceCol: t > E.fortyFour ? '#ff8a8a' : '#fff', strike: e(t, E.fortyFour + 0.05, E.fortyFour + 0.3, 'outCubic'),
      mascot: (c, mx, my) => CHAR.codex(c, mx, my - 6 + 3 * Math.sin(t * 9), 56, { t, face: t > E.fortyFour ? 'shock' : win ? 'sad' : 'squint', sweat: t > E.fortyFour ? 1 : 0, shake: win ? 2 : 0 }),
    });
    fighter(ctx, t, 562, 262, 474, 730, {
      side: 1, col: C.clay, name: 'Claude Opus 5.5 (high)', tag: 'NOT EVEN MAX', score: '54', price: '$1.82', win,
      priceCol: t > E.fortyFour ? C.green : '#fff',
      mascot: (c, mx, my) => CHAR.clawd(c, mx, my - 30 * Math.abs(Math.sin(t * 6)) * (win ? 1 : 0.2), 21, { t, look: -0.6, glow: win ? 0.8 : 0.2 }),
    });
    // VS badge
    const vp = spring(t, E.vsSlam + 0.05, 3, 0.35);
    if (vp > 0) {
      ctx.save(); ctx.translate(540, 560); ctx.scale(vp, vp); ctx.rotate(-0.12);
      ctx.fillStyle = C.yellow; L.star(ctx, 0, 0, 92, 66, 12); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 6; ctx.stroke();
      L.text(ctx, 'VS', 0, 30, { size: 86, font: F.anton, fill: '#111' });
      ctx.restore();
    }
    // punch impact on "beats"
    const ip = prog(t, E.beats, E.beats + 0.25);
    if (ip > 0 && ip < 1) {
      ctx.save(); ctx.globalAlpha = 1 - ip; ctx.strokeStyle = '#fff'; ctx.lineWidth = 8;
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(300 + Math.cos(a) * 60 * (1 + ip * 3), 640 + Math.sin(a) * 60 * (1 + ip * 3)); ctx.lineTo(300 + Math.cos(a) * 110 * (1 + ip * 3), 640 + Math.sin(a) * 110 * (1 + ip * 3)); ctx.stroke(); }
      ctx.restore();
    }
    if (win) { const wp = spring(t, E.beats, 3, 0.4); ctx.save(); ctx.translate(950, 310); ctx.rotate(0.2); ctx.scale(wp, wp); pill(ctx, 0, 0, '54 > 53', C.green, '#06210f', 30); ctx.restore(); }
    L.sticker(ctx, 968, 640, 84, 0.16, cheap, [{ s: '-44%', y: 12, size: 58 }, { s: 'CHEAPER', y: 46, size: 23 }]);
    if (cheap > 0) L.burst(ctx, t, E.cheaper, 800, 900, 26, { kind: 'coin', size: 17, v: 1100, seed: 4, a0: -Math.PI * 0.95, spread: Math.PI * 0.9 });
    footnote(ctx, 'Artificial Analysis · Intelligence Index v4.3.2 · cost per Intelligence Index task · Oct 6 2026', 1036);
  }

  // ================================================================ 3. STARTING GRID
  function lights(ctx, t) {
    const x0 = 210, y0 = 70, pods = 3, gap = 230;
    ctx.save();
    ctx.fillStyle = '#16161c'; L.rr(ctx, 150, 40, 780, 175, 26); ctx.fill();
    ctx.strokeStyle = '#2a2a33'; ctx.lineWidth = 3; ctx.stroke();
    const on = [E.intel, E.tokens, E.speed];
    const go = t >= E.go;
    for (let i = 0; i < pods; i++) {
      const cx = x0 + 100 + i * gap;
      for (let j = 0; j < 2; j++) {
        const cy = y0 + 42 + j * 66, lit = t >= on[i];
        ctx.fillStyle = '#060608'; ctx.beginPath(); ctx.arc(cx, cy, 30, 0, 7); ctx.fill();
        if (go) { ctx.shadowColor = C.green; ctx.shadowBlur = 40; ctx.fillStyle = C.green; }
        else if (lit) { ctx.shadowColor = C.red; ctx.shadowBlur = 40 * (0.7 + 0.3 * decay(t, on[i], 0.2)); ctx.fillStyle = C.red; }
        else { ctx.shadowColor = 'transparent'; ctx.fillStyle = '#2a0d0d'; }
        ctx.beginPath(); ctx.arc(cx, cy, 24, 0, 7); ctx.fill(); ctx.shadowColor = 'transparent';
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(cx - 8, cy - 9, 7, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }
  function grid(ctx, t) {
    base(ctx, t, { ac: 'rgba(217,119,87,0.12)', bc: 'rgba(109,124,255,0.12)' });
    floor(ctx, t, 820, 0.8, 'rgba(217,119,87,1)', 'rgba(109,124,255,1)');
    lights(ctx, t);
    const rows = [['🧠', 'INTELLIGENCE', 'AA Intelligence Index', E.intel, C.clay], ['🪙', 'TOKENS', 'API value of a $200 plan', E.tokens, C.yellow], ['⚡', 'SPEED', 'output tokens / sec', E.speed, C.codex]];
    rows.forEach(([ic, label, sub, t0, col], i) => {
      const p = spring(t, t0 - 0.03, 2.8, 0.42); if (p <= 0) return;
      const y = 360 + i * 150;
      ctx.save(); ctx.translate(540 + (1 - p) * 900, y); ctx.globalAlpha = clamp(p * 2);
      ctx.fillStyle = 'rgba(18,18,24,.92)'; L.rr(ctx, -440, -62, 880, 124, 28); ctx.fill();
      ctx.fillStyle = col; L.rr(ctx, -440, -62, 16, 124, 8); ctx.fill();
      L.emoji(ctx, ic, -360, 2, 70);
      L.text(ctx, label, -290, 30, { size: 92, font: F.anton, align: 'left', ls: 2 });
      ctx.restore();
    });
    // racers on the line
    L.checker(ctx, 0, 934, W, 26, 26);
    const crouch = 1 - 0.06 * Math.abs(Math.sin((t - E.go) * Math.PI / TL.beat));
    CHAR.clawd(ctx, 330, 930, 19, { t, squash: crouch, look: 1, blink: (t % 2.2) < 0.08 ? 1 : 0 });
    CHAR.codex(ctx, 770, 930, 80, { t, face: 'squint', squash: crouch });
    L.text(ctx, 'CLAUDE', 330, 1012, { size: 28, font: F.pixel, fill: C.clay });
    L.text(ctx, 'OPENAI', 770, 1012, { size: 28, font: F.pixel, fill: C.codexLt });
    if (t > E.go - 0.02) {
      const p = prog(t, E.go, E.go + 0.25);
      L.text(ctx, 'GO!', 540, 720, { size: 260 * lerp(0.4, 1.3, p), font: F.anton, fill: C.green, alpha: 1 - p * 0.6, stroke: '#04140a', sw: 18 });
    }
  }

  // ================================================================ 4. RACE 1: INTELLIGENCE
  const X = v => 110 + (v - 40) * (860 / 20);
  function lane(ctx, y, h, col) {
    ctx.fillStyle = '#15151b'; L.rr(ctx, 40, y, 1000, h, 22); ctx.fill();
    ctx.strokeStyle = L.rgba(col, 0.55); ctx.lineWidth = 3; ctx.stroke();
    ctx.setLineDash([26, 22]); ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(60, y + h / 2 + 34); ctx.lineTo(1020, y + h / 2 + 34); ctx.stroke(); ctx.setLineDash([]);
  }
  function race1(ctx, t) {
    base(ctx, t, { drift: 60 });
    header(ctx, t, E.go, 'RACE 1/3', 'INTELLIGENCE', 'Artificial Analysis Intelligence Index · Oct 6 2026', C.clay);
    const yA = 288, yB = 488, h = 182;
    lane(ctx, yA, h, C.clay); lane(ctx, yB, h, C.codex);
    for (let v = 40; v <= 60; v += 5) {
      L.text(ctx, String(v), X(v), yB + h + 30, { size: 24, font: F.mono, weight: 700, fill: '#77736c' });
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(X(v) - 1, yA + 10, 2, yB + h - yA - 20);
    }
    L.text(ctx, 'Claude Opus 5.5 (max)', 62, yA + 40, { size: 25, weight: 700, align: 'left', fill: C.clayLt });
    L.text(ctx, "OpenAI's best · GPT-6 Astra (max)", 62, yB + 40, { size: 25, weight: 700, align: 'left', fill: C.codexLt });
    // finish ribbon at 58 and the wall at 53
    const fx = X(58) + 26;
    L.checker(ctx, fx, yA + 54, 22, h - 64, 11, 0.6, t);
    const wx = X(53) + 30, wp = spring(t, E.go + 0.25, 2.5, 0.5);
    ctx.save(); ctx.translate(wx, yB + h - 10); ctx.scale(1, wp);
    for (let r = 0; r < 6; r++) for (let c2 = 0; c2 < 2; c2++) {
      ctx.fillStyle = (r + c2) % 2 ? '#8e3b2c' : '#a5473a';
      ctx.fillRect(c2 * 26 + (r % 2 ? -13 : 0), -(r + 1) * 24, 25, 22);
    }
    ctx.restore();
    if (wp > 0.5) pill(ctx, wx + 18, yB + 30, 'CEILING 53', '#a5473a', '#fff', 20);
    // Clawd sprint 40 -> 58
    const pa = e(t, E.go, E.r1_58, 'inOutCubic');
    const va = lerp(40, 58, pa);
    const done = t >= E.r1_58;
    CHAR.clawd(ctx, X(va), yA + h - 22 - (done ? 34 * Math.abs(Math.sin((t - E.r1_58) * 7)) * decay(t, E.r1_58, 1.2) : 0), 12, { t, run: done ? 0 : 1, phase: t * 26, look: 1, glow: done ? 1 : 0.4 });
    for (let k = 1; k < 5 && !done; k++) CHAR.clawd(ctx, X(va) - k * 46, yA + h - 22, 12, { t, run: 1, phase: t * 26 - k, alpha: 0.18 / k });
    const numA = spring(t, E.r1_58, 3, 0.35);
    L.text(ctx, String(Math.round(va)), X(va) - 92, yA + 150, { size: 64 + 30 * numA * decay(t, E.r1_58, 0.6), font: F.anton, align: 'right', fill: done ? C.yellow : '#fff', stroke: '#000', sw: 8 });
    if (done) { const bp = spring(t, E.r1_58, 2.8, 0.4); ctx.save(); ctx.translate(fx + 10, yA + 30); ctx.scale(bp, bp); pill(ctx, -40, 0, '#1 / 224', C.yellow, '#111', 22); ctx.restore(); }
    L.burst(ctx, t, E.r1_58, fx, yA + 90, 30, { size: 15, v: 950, seed: 11 });
    // Codex jog 40 -> 53, bonk
    const pb = e(t, E.go + 0.2, E.r1_53, 'inQuad');
    const bonked = t >= E.r1_53;
    const vb = bonked ? 53 - 0.9 * Math.sin(Math.min(1, (t - E.r1_53) / 0.25) * Math.PI / 2) : lerp(40, 53, pb);
    CHAR.codex(ctx, X(vb) - 20, yB + h - 16, 44, { t, run: bonked ? 0 : 1, phase: t * 18, face: bonked ? 'dead' : t > E.r1OpenAI ? 'shock' : 'squint', sweat: 1, tilt: bonked ? -0.25 * decay(t, E.r1_53, 0.5) : 0.1 });
    if (bonked) for (let i = 0; i < 3; i++) { const a = t * 6 + i * 2.1; L.text(ctx, '★', X(vb) - 20 + Math.cos(a) * 46, yB + h - 116 + Math.sin(a) * 14, { size: 30, fill: C.yellow }); }
    L.text(ctx, String(bonked ? 53 : Math.floor(vb + 0.0001)), X(vb) + 40, yB + 118, { size: 64 + 26 * decay(t, E.r1_53, 0.5), font: F.anton, align: 'left', fill: bonked ? '#ff8a8a' : '#fff', stroke: '#000', sw: 8 });
    // leaderboard
    const board = [['Claude Opus 5.5 (max)', 58, 'a'], ['Claude Sonnet 5.5 (max)', 56, 'a'], ['Claude Opus 5.5 (xhigh)', 56, 'a'], ['Claude Opus 5.5 (high)', 54, 'a'],
      ['Claude Fable 5.1 (max)', 53, 'a'], ['Claude Fable 5.1 (xhigh)', 53, 'a'], ['GPT-6 Astra (max)', 53, 'o']];
    const by = 772;
    L.text(ctx, 'TOP 7 OF 224 MODELS', 60, by - 16, { size: 24, font: F.pixel, align: 'left', fill: '#cfc9bf', alpha: prog(t, E.r1Opus, E.r1Opus + 0.3) });
    board.forEach(([name, v, who], i) => {
      const t0 = i < 6 ? E.r1Opus + 0.25 + i * 0.1 : E.r1OpenAI;
      const p = spring(t, t0, 2.6, 0.8); if (p <= 0) return;
      const y = by + 12 + i * 40, col = who === 'a' ? C.clay : C.codex;
      ctx.save(); ctx.translate((1 - p) * 700, 0);
      if (who === 'o') { ctx.fillStyle = L.rgba(C.codex, 0.18); L.rr(ctx, 50, y - 3, 980, 38, 10); ctx.fill(); }
      L.text(ctx, String(i + 1), 82, y + 28, { size: 26, font: F.mono, weight: 800, fill: col });
      L.text(ctx, name, 116, y + 28, { size: 25, weight: 700, align: 'left', fill: who === 'a' ? '#f1e6de' : '#dfe2ff' });
      const bw = (v - 40) * 22;
      ctx.fillStyle = col; L.rr(ctx, 560, y + 8, bw, 24, 6); ctx.fill();
      L.text(ctx, String(v), 560 + bw + 16, y + 30, { size: 28, font: F.anton, align: 'left', fill: '#fff' });
      ctx.restore();
    });
    const bp = spring(t, E.r1_53 - 0.35, 2.6, 0.45);
    if (bp > 0) {
      ctx.save(); ctx.globalAlpha = clamp(bp * 2);
      ctx.strokeStyle = C.clay; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(1018, by + 12); ctx.lineTo(1034, by + 12); ctx.lineTo(1034, by + 246); ctx.lineTo(1018, by + 246); ctx.stroke();
      ctx.translate(1000, by + 142); ctx.rotate(-Math.PI / 2); ctx.scale(bp, bp);
      ctx.restore();
      ctx.save(); ctx.translate(838, by - 26); ctx.rotate(-0.03); ctx.scale(bp, bp);
      pill(ctx, 0, 0, 'TOP 6 = ALL ANTHROPIC', C.clay, '#170a05', 26); ctx.restore();
    }
  }

  // ================================================================ 5. RACE 2: TOKENS
  function tank(ctx, t, x, y, w, h, val, max, col, colLt, label, label2) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.04)'; L.rr(ctx, x, y, w, h, 40); ctx.fill();
    ctx.save(); L.rr(ctx, x, y, w, h, 40); ctx.clip();
    const lvl = y + h - h * clamp(val / max);
    const g = ctx.createLinearGradient(0, lvl, 0, y + h); g.addColorStop(0, colLt); g.addColorStop(1, col);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, y + h);
    for (let i = 0; i <= 40; i++) { const xx = x + i / 40 * w; ctx.lineTo(xx, lvl + Math.sin(i * 0.5 + t * 7) * 7 * clamp(val / max * 6)); }
    ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 14; i++) { // bubbles / pixel tokens
      const bx = x + 20 + rnd(i, 8) * (w - 40), sp = 120 + rnd(i, 9) * 160;
      const by = y + h - ((t * sp + rnd(i, 10) * 600) % Math.max(1, (y + h - lvl)));
      if (by > lvl + 10) { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(bx, by, 7, 7); }
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 4; L.rr(ctx, x, y, w, h, 40); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; L.rr(ctx, x + 16, y + 30, 14, h - 60, 7); ctx.fill();
    for (let k = 2000; k < max; k += 2000) { const yy = y + h - h * k / max; ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x + w - 30, yy, 18, 3); L.text(ctx, '$' + k / 1000 + 'K', x + w + 12, yy + 8, { size: 20, font: F.mono, weight: 700, align: 'left', fill: '#6f6b65' }); }
    L.text(ctx, label, x + w / 2, y + h + 50, { size: 31, weight: 800 });
    L.text(ctx, label2, x + w / 2, y + h + 86, { size: 25, weight: 600, fill: '#9b968e' });
    ctx.restore();
    return lvl;
  }
  function race2(ctx, t) {
    base(ctx, t, { drift: 40 });
    header(ctx, t, TL.scenes[4].t0, 'RACE 2/3', 'TOKENS', 'API value you get from a $200/mo plan · SemiAnalysis', C.yellow);
    const max = 12000, tx1 = 170, tx2 = 640, ty = 340, tw = 270, th = 640;
    const vO = 2084 * e(t, E.r2OpenAI, E.r2OpenAI + 0.55, 'outCubic');
    const vC = 11726 * e(t, E.r2Claude, E.r2Claude + 1.0, 'outCubic');
    const lvlO = tank(ctx, t, tx1, ty, tw, th, vO, max, '#3a43b8', '#7d89ff', 'ChatGPT Pro 200', '$200/mo · GPT-6.1 Sol');
    const lvlC = tank(ctx, t, tx2, ty, tw, th, vC, max, '#a5482c', '#f09a74', 'Claude Max 20x', '$200/mo · Opus 5.5');
    // $200 coins dropping in
    [[tx1 + tw / 2, 0], [tx2 + tw / 2, 0.12]].forEach(([cx, d]) => {
      const t0 = E.r2Bucks - 0.05 + d, dt = t - t0; if (dt < 0 || dt > 0.75) return;
      const yy = lerp(330, ty + th - 40, clamp(dt / 0.55) ** 2);
      L.coin(ctx, cx, yy, 46, dt * 14); L.text(ctx, '$200', cx, yy - 60, { size: 30, font: F.anton, fill: C.yellow, alpha: 1 - clamp((dt - 0.5) / 0.25) });
    });
    if (t > E.r2Claude) L.burst(ctx, t, E.r2Claude + 0.15, tx2 + tw / 2, lvlC, 18, { kind: 'coin', size: 16, v: 700, seed: 21, a0: -Math.PI * 0.85, spread: Math.PI * 0.7, life: 1.3 });
    // value readouts
    if (vC > 1) L.text(ctx, '$' + Math.round(vC).toLocaleString('en-US'), tx2 + tw / 2, Math.max(ty + 66, lvlC - 96), { size: 74, font: F.anton, fill: '#fff', stroke: '#2a0f05', sw: 10 });
    if (vC > 1) L.text(ctx, 'per month', tx2 + tw / 2, Math.max(ty + 100, lvlC - 62), { size: 24, weight: 700, fill: C.clayLt });
    if (vO > 1) L.text(ctx, '$' + Math.round(vO).toLocaleString('en-US'), tx1 + tw / 2, lvlO - 150, { size: 74, font: F.anton, fill: '#fff', stroke: '#0c0f33', sw: 10 });
    if (vO > 1) L.text(ctx, 'per month', tx1 + tw / 2, lvlO - 122, { size: 24, weight: 700, fill: C.codexLt });
    // mascots ride their token level
    CHAR.clawd(ctx, tx2 + tw / 2, Math.min(ty + th, lvlC) - 4, 13, { t, look: -1, glow: vC > 5000 ? 0.9 : 0.2, hop: -18 * Math.abs(Math.sin(t * 8)) * (vC > 11000 ? 1 : 0) });
    const sad = t > E.r2OpenAI + 0.45;
    CHAR.codex(ctx, tx1 + tw / 2, Math.min(ty + th, lvlO) - 2, 38, { t, face: sad ? 'sad' : t > E.r2Claude + 0.4 ? 'shock' : 'neutral', headTilt: sad ? -0.15 : 0, sweat: t > E.r2Claude + 0.4 ? 1 : 0 });
    // 5.6x badge
    L.sticker(ctx, 540, 425, 104, -0.12, spring(t, E.badge, 3, 0.4), [{ s: '5.6×', y: 24, size: 96 }, { s: 'MORE VALUE', y: 66, size: 26 }]);
    // scissors: Pro 200 limits halved
    const sp = spring(t, E.snip, 3, 0.45);
    if (sp > 0) {
      ctx.save(); ctx.translate(tx1 + tw / 2 + 70, 588); ctx.rotate(-0.05); ctx.scale(sp, sp);
      ctx.fillStyle = '#25161a'; L.rr(ctx, -250, -34, 500, 68, 16); ctx.fill(); ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.stroke();
      L.text(ctx, '✂ PRO 200 LIMITS: 20× → 10×', 0, 11, { size: 27, weight: 800, fill: '#ffb0b0' });
      ctx.restore();
    }
    footnote(ctx, 'SemiAnalysis, Oct 2026: plan\'s full monthly limit priced at list API rates (GPT-6.1 Sol vs Claude Opus 5.5, agentic workload)', 1290);
  }

  // ================================================================ 6. RACE 3: SPEED
  function race3(ctx, t) {
    base(ctx, t, { drift: 120 });
    header(ctx, t, TL.scenes[5].t0, 'RACE 3/3', 'SPEED', 'output tokens per second · Artificial Analysis API', C.codexLt);
    const lanes = [['Claude Sonnet 5.5', 128, 'a', 11], ['Claude Opus 5.5', 97, 'a', 13], ['GPT-6 Astra', 63, 'o', 37], ['GPT-6.1 Sol', 58, 'o', 37]];
    const x0 = 250, x1 = 930, k = (x1 - x0) / (128 * 1.55), y0 = 290, lh = 166;
    L.checker(ctx, x1 + 30, y0 - 4, 24, lanes.length * lh, 12, 0.5, t);
    lanes.forEach(([name, sp, who, u], i) => {
      const y = y0 + i * lh, col = who === 'a' ? C.clay : C.codex;
      ctx.fillStyle = i % 2 ? '#131318' : '#17171d'; ctx.fillRect(0, y, W, lh - 8);
      ctx.fillStyle = L.rgba(col, 0.8); ctx.fillRect(0, y, 8, lh - 8);
      L.text(ctx, name, 28, y + 34, { size: 26, weight: 800, align: 'left', fill: who === 'a' ? C.clayLt : C.codexLt });
      let x = x0 + Math.max(0, t - E.r3Start) * sp * k;
      const nitro = who === 'o' ? e(t, E.r3Fifty, E.r3Fifty + 0.3) : 0;
      if (who === 'o') x += 26 * nitro * (1 - e(t, E.r3Fifty + 0.5, E.r3Fifty + 1.4));
      const fin = x >= x1; x = Math.min(x, x1 + 20);
      const gy = y + lh - 26;
      if (who === 'a') {
        for (let d = 0; d < 9; d++) { // pixel dust trail
          const dx = x - 60 - d * 34 - (t * 300 % 34), a = 0.5 * (1 - d / 9) * (fin ? decay(t, E.r3Start + (x1 - x0) / (sp * k), 0.8) : 1);
          ctx.fillStyle = `rgba(217,119,87,${a})`; ctx.fillRect(dx, gy - 16 - (d % 3) * 9, 12, 12);
        }
        CHAR.clawd(ctx, x, gy, u, { t, run: fin ? 0 : 1, phase: t * 30, look: 1, glow: 0.6 });
      } else {
        if (nitro > 0 && t < E.r3Fifty + 1.4) { // nitro flame
          ctx.save(); ctx.globalAlpha = 0.9 * (1 - e(t, E.r3Fifty + 0.9, E.r3Fifty + 1.4));
          for (let f = 0; f < 3; f++) { ctx.fillStyle = ['#ffd23f', '#ff8a3d', '#ff3b3b'][f]; ctx.beginPath(); ctx.ellipse(x - 70 - f * 10, gy - 50, 30 - f * 6 + 6 * Math.sin(t * 40 + f), 12 - f * 2, 0, 0, 7); ctx.fill(); }
          ctx.restore();
        }
        const dusty = t > E.r3And;
        CHAR.codex(ctx, x, gy, u, { t, run: 1, phase: t * 16, face: dusty ? 'sad' : t > E.r3Fifty ? 'smug' : 'squint', sweat: dusty ? 1 : 0 });
        if (t > E.r3Fifty) { const pp = spring(t, E.r3Fifty, 3, 0.4); ctx.save(); ctx.translate(x + 120, y + 42); ctx.rotate(-0.08); ctx.scale(pp, pp); pill(ctx, 0, 0, '+50% FASTER!', C.yellow, '#111', 19); ctx.restore(); }
        if (dusty) {
          const dp = prog(t, E.r3And, E.r3Dust + 0.3);
          for (let p = 0; p < 7; p++) {
            ctx.fillStyle = `rgba(190,150,120,${0.35 * dp})`;
            ctx.beginPath(); ctx.arc(x + 40 + p * 40 + Math.sin(t * 3 + p) * 10, gy - 40 - (p % 3) * 20, 30 + 20 * rnd(p, 2) * dp, 0, 7); ctx.fill();
          }
        }
      }
      // speedometer readout
      const shown = Math.round(sp * e(t, E.r3Start, E.r3Start + 0.9));
      L.text(ctx, String(shown), 1050, y + 100, { size: 76, font: F.anton, align: 'right', fill: who === 'a' ? '#fff' : '#c7cbf7', stroke: '#000', sw: 6 });
      L.text(ctx, 'tok/s', 1050, y + 130, { size: 20, weight: 700, align: 'right', fill: '#8e8a83' });
      if (fin) { const fp = spring(t, E.r3Start + (x1 - x0) / (sp * k), 3, 0.4); ctx.save(); ctx.translate(840, y + 40); ctx.scale(fp, fp); pill(ctx, 0, 0, i === 0 ? '1ST' : '2ND', C.yellow, '#111', 22); ctx.restore(); }
    });
    footnote(ctx, 'Oct 5 "Day 1": GPT-6 Astra & GPT-6.1 Sol ~50% faster on ChatGPT plans · AA API speeds: 128 / 97 vs 63 / 58 tok/s', 1290);
  }

  // ================================================================ 7. FINISH + RESET PANIC
  function finish(ctx, t) {
    const t0 = TL.scenes[6].t0;
    base(ctx, t, { ac: 'rgba(217,119,87,0.26)', ax: 820, ay: 600 });
    // scoreboard
    const sp = spring(t, t0, 2.5, 0.5);
    ctx.save(); ctx.translate(0, (1 - sp) * -320);
    ctx.fillStyle = '#121218'; L.rr(ctx, 40, 40, 1000, 330, 30); ctx.fill(); ctx.strokeStyle = C.clay; ctx.lineWidth = 4; ctx.stroke();
    L.text(ctx, 'FINAL SCORE', 540, 104, { size: 34, font: F.pixel, fill: '#d8d2c8' });
    L.text(ctx, 'CLAUDE 3 – 0 OPENAI', 540, 196, { size: 96, font: F.anton, fill: '#fff', ls: 2, shadow: C.clay, blur: 26 });
    [['🧠', '58 vs 53'], ['🪙', '$11.7K vs $2.1K'], ['⚡', '97 vs 63 tok/s']].forEach(([ic, s], i) => {
      const x = 200 + i * 340, p = spring(t, t0 + 0.12 + i * 0.1, 3, 0.4);
      ctx.save(); ctx.translate(x, 300); ctx.scale(p, p);
      L.emoji(ctx, ic, -110, -4, 40); L.text(ctx, s, -80, 8, { size: 27, weight: 800, align: 'left', fill: C.clayLt }); L.text(ctx, '✓', 120, 10, { size: 36, weight: 900, fill: C.green });
      ctx.restore();
    });
    ctx.restore();
    // podium + Clawd with flag
    ctx.fillStyle = '#1d1d25'; L.rr(ctx, 650, 860, 330, 260, 18); ctx.fill();
    L.text(ctx, '1', 815, 1050, { size: 150, font: F.anton, fill: C.clay });
    const flagT = t - t0;
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(900, 860); ctx.lineTo(900, 560); ctx.stroke();
    ctx.save(); ctx.translate(904, 566);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#f2f2f2'; ctx.fillRect(i * 22, j * 22 + Math.sin(flagT * 10 - i * 0.7) * 8 * (i / 6), 22.5, 22.5); }
    ctx.restore();
    CHAR.clawd(ctx, 790, 858 - 26 * Math.abs(Math.sin(flagT * 6.5)), 17, { t, look: -1, glow: 1, armR: 0.6 * Math.abs(Math.sin(flagT * 6.5)) });
    L.burst(ctx, t, E.flag, 800, 700, 50, { v: 1200, seed: 31, size: 16 });
    L.burst(ctx, t, E.flag + 0.5, 700, 600, 40, { v: 1000, seed: 32, size: 14, kind: 'coin' });
    // reset button + panicking Codex
    const resets = [E.reset1, E.reset2, E.reset3];
    let n = 0; resets.forEach(r => { if (t >= r) n++; });
    const lastR = resets[Math.max(0, n - 1)];
    const press = n ? bump(t, lastR - 0.02, 0.22) : 0;
    const bx = 330, byy = 900;
    ctx.fillStyle = '#2a2a33'; L.rr(ctx, bx - 150, byy - 20, 300, 140, 20); ctx.fill();
    ctx.fillStyle = '#5a0f12'; ctx.beginPath(); ctx.ellipse(bx, byy - 4, 120, 34, 0, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(bx - 30, byy - 70 + press * 30, 10, bx, byy - 40 + press * 30, 130);
    g.addColorStop(0, '#ff8a8a'); g.addColorStop(0.5, '#ff2d2d'); g.addColorStop(1, '#a50f14');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(bx, byy - 30 + press * 26, 112, 64 * (1 - press * 0.45), 0, Math.PI, 0); ctx.ellipse(bx, byy - 30 + press * 26, 112, 22, 0, 0, Math.PI); ctx.fill();
    L.text(ctx, 'RESET', bx, byy + 76, { size: 44, font: F.anton, fill: '#fff', ls: 4 });
    L.text(ctx, 'FOR EVERYONE', bx, byy + 106, { size: 18, weight: 800, fill: '#ff9d9d', ls: 3 });
    resets.forEach((r, i) => { // shockwave rings
      const p = prog(t, r, r + 0.5); if (p <= 0 || p >= 1) return;
      ctx.save(); ctx.globalAlpha = 1 - p; ctx.strokeStyle = i === 2 ? C.yellow : '#9fd8ff'; ctx.lineWidth = 10 * (1 - p);
      ctx.beginPath(); ctx.ellipse(bx, byy - 40, 140 + 520 * p, 60 + 240 * p, 0, 0, 7); ctx.stroke(); ctx.restore();
    });
    const jump = n ? Math.max(0, Math.sin(Math.min(Math.PI, (t - lastR + 0.18) / 0.36 * Math.PI))) : 0;
    CHAR.codex(ctx, bx - 10, byy - 96 - 60 * (1 - press) * (n ? 1 : 0) + (n ? 0 : 0) - jump * 30 + 60 * press, 70, {
      t, face: n >= 3 ? 'text' : n ? 'panic' : 'shock', text: 'RESET?', armL: 2.6 - press * 2.2, armR: 2.6 - press * 2.2,
      shake: 6, sweat: 1, tint: n ? 0.6 * decay(t, lastR, 0.4) : 0, squash: 1 - 0.18 * press,
    });
    if (n) L.text(ctx, 'RESETS: ' + '×' + n, bx, 470, { size: 46, font: F.pixel, fill: C.yellow, stroke: '#000', sw: 10, alpha: 0.9 });
    if (t >= E.reset3) {
      for (let i = 0; i < 16; i++) { // reset tokens raining
        const dt = t - E.reset3 - i * 0.03; if (dt < 0) continue;
        const xx = 80 + rnd(i, 41) * 920, yy = -60 + dt * (700 + rnd(i, 42) * 500) + 0.5 * 900 * dt * dt;
        ctx.save(); ctx.translate(xx, yy); ctx.rotate((rnd(i, 43) - 0.5) * 0.8);
        pill(ctx, 0, 0, '↻ RESET', i % 2 ? '#ff4d4d' : '#9fd8ff', '#111', 22); ctx.restore();
      }
    }
  }

  // ================================================================ 8. I SMELL FEAR
  function fear(ctx, t) {
    const t0 = TL.scenes[7].t0, lt = t - t0;
    ctx.fillStyle = '#030304'; ctx.fillRect(-150, -150, W + 300, H + 300);
    const z = 1 + 0.16 * e(t, t0, E.finalHit, 'inOutQuad');
    ctx.save(); ctx.translate(540, 820); ctx.scale(z, z); ctx.translate(-540, -820);
    // spotlight
    const flick = 0.92 + 0.08 * Math.sin(lt * 37) * Math.sin(lt * 13);
    const on = e(t, t0 + 0.12, t0 + 0.35);
    ctx.save(); ctx.globalAlpha = on * flick;
    const cone = ctx.createLinearGradient(0, 0, 0, 960);
    cone.addColorStop(0, 'rgba(255,236,210,.0)'); cone.addColorStop(1, 'rgba(255,236,210,.22)');
    ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(470, -40); ctx.lineTo(610, -40); ctx.lineTo(860, 930); ctx.lineTo(220, 930); ctx.fill();
    ctx.fillStyle = 'rgba(255,236,210,.16)'; ctx.beginPath(); ctx.ellipse(540, 930, 330, 52, 0, 0, 7); ctx.fill();
    ctx.restore();
    // trembling Codex in the dark
    CHAR.codex(ctx, 900, 900, 34, { t, face: 'shock', sweat: 1, shake: 3, alpha: 0.55 * on });
    // Clawd: sniff, shades, stare
    const sn = bump(t, E.sniff, 0.16) + bump(t, E.sniff + 0.2, 0.16);
    const shadesP = prog(t, E.shades - 0.4, E.shades);
    CHAR.clawd(ctx, 540, 928, 42, { t, squash: 1 + 0.09 * sn, look: t < E.sniff + 0.5 ? 0.6 * Math.sin(lt * 5) : 0, blink: sn > 0.3 ? 1 : 0, shades: shadesP, glow: 0.35 * on });
    if (sn > 0.05) ['sniff', 'sniff'].forEach((s, i) => L.text(ctx, s, 760 + i * 40, 650 - i * 46, { size: 30, font: F.pixel, fill: '#d8d2c8', alpha: bump(t, E.sniff + i * 0.2, 0.35) }));
    if (shadesP >= 1) { const gp = bump(t, E.shades, 0.3); ctx.fillStyle = `rgba(255,255,255,${gp})`; L.star(ctx, 640, 770, 34 * gp, 6, 4); ctx.fill(); }
    ctx.restore();
    // the line, in his own words
    const words = [['I', E.smellI], ['SMELL', E.smell], ['FEAR.', E.fear]];
    let total = 0; const sizes = words.map(([w2]) => L.measure(ctx, w2 + ' ', { size: 160, font: F.anton }));
    sizes.forEach(s => (total += s));
    let x = 540 - total / 2;
    words.forEach(([w2, at2], i) => {
      const p = spring(t, at2, 3.2, 0.45);
      if (p > 0) {
        const isFear = i === 2, sh = isFear ? Math.sin(t * 60) * 3 * decay(t, at2, 0.6) : 0;
        ctx.save(); ctx.translate(x + sizes[i] / 2 + sh, 1170); ctx.scale(lerp(1.6, 1, clamp(p)), lerp(1.6, 1, clamp(p)));
        L.text(ctx, w2, -sizes[i] / 2 + 10, 0, { size: 160, font: F.anton, align: 'left', fill: isFear ? '#ff6a3d' : '#fff', alpha: clamp(p * 2), shadow: isFear ? 'rgba(255,90,40,.9)' : 'rgba(255,255,255,.4)', blur: isFear ? 50 : 20 });
        ctx.restore();
      }
      x += sizes[i];
    });
  }

  // ================================================================ 9. END CARD
  function endcard(ctx, t) {
    const t0 = E.finalHit, lt = t - t0;
    ctx.fillStyle = '#0a0806'; ctx.fillRect(-150, -150, W + 300, H + 300);
    ctx.save(); ctx.translate(540, 760); ctx.rotate(lt * 0.25);
    for (let i = 0; i < 18; i++) { ctx.rotate(Math.PI * 2 / 18); ctx.fillStyle = i % 2 ? 'rgba(217,119,87,.10)' : 'rgba(217,119,87,.04)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-90, -1200); ctx.lineTo(90, -1200); ctx.fill(); }
    ctx.restore();
    glow(ctx, 540, 760, 520, 'rgba(217,119,87,0.25)');
    const p1 = spring(t, t0, 2.6, 0.45), p2 = spring(t, t0 + 0.14, 2.6, 0.45);
    ctx.save(); ctx.translate(540, 250); ctx.scale(lerp(1.8, 1, clamp(p1)), lerp(1.8, 1, clamp(p1))); ctx.globalAlpha = clamp(p1 * 2);
    L.text(ctx, 'FRONTIER', 0, 0, { size: 190, font: F.anton, ls: 6, fill: '#fff' }); ctx.restore();
    ctx.save(); ctx.translate(540, 420); ctx.scale(lerp(1.8, 1, clamp(p2)), lerp(1.8, 1, clamp(p2))); ctx.globalAlpha = clamp(p2 * 2);
    const wm = L.measure(ctx, 'MEANS ', { size: 150, font: F.anton, ls: 4 }), wf = L.measure(ctx, 'FIRST.', { size: 150, font: F.anton, ls: 4 });
    L.text(ctx, 'MEANS ', -(wm + wf) / 2, 0, { size: 150, font: F.anton, ls: 4, align: 'left', fill: '#fff' });
    L.text(ctx, 'FIRST.', -(wm + wf) / 2 + wm, 0, { size: 150, font: F.anton, ls: 4, align: 'left', fill: C.clay, shadow: 'rgba(217,119,87,.8)', blur: 40 });
    ctx.restore();
    const beat = Math.abs(Math.sin((t - TL.go) * Math.PI / TL.beat));
    CHAR.clawd(ctx, 540, 760 - 22 * beat, 22, { t, shades: 1, glow: 0.8, squash: 1 + 0.05 * beat });
    const p3 = spring(t, t0 + 0.3, 2.6, 0.5);
    L.text(ctx, '#1 of 224 models  ·  OpenAI\'s best is #7', 540, 850, { size: 34, weight: 800, fill: '#f1e6de', alpha: clamp(p3 * 2) });
    // the callback: his own tweet, returned
    const p4 = spring(t, t0 + 0.45, 2.4, 0.5);
    ctx.save(); ctx.translate(540, 1010 + (1 - p4) * 200); ctx.globalAlpha = clamp(p4 * 2);
    ctx.fillStyle = '#000'; L.rr(ctx, -420, -80, 840, 160, 24); ctx.fill(); ctx.strokeStyle = '#2f3336'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(-350, -22, 32, 0, 7); ctx.clip(); ctx.fillStyle = '#20264f'; ctx.fillRect(-390, -60, 80, 80); CHAR.codex(ctx, -350, 38, 30, { t, face: 'smug' }); ctx.restore();
    L.text(ctx, 'Tibo', -300, -26, { size: 28, weight: 800, align: 'left' });
    L.text(ctx, '@thsottiaux · Jul 9', -224, -26, { size: 25, weight: 500, align: 'left', fill: '#71767b' });
    L.text(ctx, '@ClaudeDevs', -300, 30, { size: 34, weight: 500, align: 'left', fill: C.xblue });
    L.text(ctx, 'I smell fear', -300 + L.measure(ctx, '@ClaudeDevs ', { size: 34, weight: 500 }), 30, { size: 34, weight: 500, align: 'left', fill: '#e7e9ea' });
    ctx.restore();
    L.stamp(ctx, 'RETURN TO SENDER', 742, 1058, 46, -0.12, C.red, prog(t, t0 + 0.85, t0 + 0.97));
    footnote(ctx, 'Sources: Artificial Analysis (Intelligence Index v4.3.2, cost/task, output speed · Oct 6 2026) · SemiAnalysis · @thsottiaux posts Jul 9, Oct 5 & Oct 6 2026', 1180, clamp(p3));
    footnote(ctx, 'Parody / commentary. Mascots belong to their makers.', 1212, clamp(p3) * 0.8);
  }

  window.SCENES = { tweet, fair, grid, race1, race2, race3, finish, fear, endcard };
  window.SCENE_UTIL = { talk, glow, pulse };
})();
