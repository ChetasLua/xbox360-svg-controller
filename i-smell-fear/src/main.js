// Frame composer: scene -> camera shake / whip blur / glitch / chromatic hits -> captions -> grade.
// window.renderFrame(t) draws any instant; the player drives it from the <audio> clock.
(function () {
  const { W, H, C, F, clamp, lerp, prog, e, decay, bump, rnd } = L;
  const E = TL.events;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const buf = mk(), bctx = buf.getContext('2d');
  const chan = [mk(), mk(), mk()];
  const grain = [0, 1, 2, 3].map(k => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'), id = x.createImageData(256, 256);
    for (let i = 0; i < id.data.length; i += 4) { const v = rnd(i + k * 99991, 7) * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    x.putImageData(id, 0, 0); return c;
  });

  const scenes = TL.scenes;
  const sceneAt = t => scenes.find(s => t >= s.t0 && t < s.t1) || scenes[scenes.length - 1];
  const impacts = [[E.stamp, 30], [E.vsSlam, 14], [E.beats, 16], [E.fortyFour, 12], [E.go, 26], [E.r1_58, 8], [E.r1_53, 22], [E.badge, 12],
    [E.reset1, 18], [E.reset2, 18], [E.reset3, 28], [E.finalHit, 36], [E.fear, 6]];
  const flashes = [[E.go, '255,255,255', 0.6], [E.finalHit, '255,255,255', 0.9], [E.stamp, '255,40,40', 0.35], [E.reset1, '160,220,255', 0.4],
    [E.reset2, '160,220,255', 0.4], [E.reset3, '255,230,120', 0.5], [E.r1_58, '255,210,63', 0.18], [scenes[6].t0, '255,255,255', 0.35]];
  const whips = [scenes[4].t0, scenes[5].t0];
  const glitches = [0.1, scenes[1].t0, scenes[2].t0, E.reset1, E.reset2, E.reset3, E.tapeStop + 0.02];
  const aberr = [[E.stamp, 12], [E.go, 14], [E.r1_53, 8], [E.reset3, 16], [E.finalHit, 18], [E.fear, 10]];

  // ---------------------------------------------------------------- captions (word-synced)
  const EMPH = { 'THIS': C.yellow, 'CHART': C.red, 'CRIME!': C.red, '44%': C.green, 'CHEAPER!': C.green, 'INTELLIGENCE!': C.clay, 'TOKENS!': C.yellow,
    'SPEED!': C.codexLt, 'GO!': C.green, '58!': C.clay, '53.': C.codexLt, '$11.7K': C.clay, 'CLAUDE...': C.clay, '$2.1K': C.codexLt, 'OPENAI!': C.codexLt,
    'STILL': C.yellow, 'DUST!': C.yellow, 'RESET!': C.red, 'EVERYONE!': C.red };
  const CAP = 78, GAP = 34;
  function chunks(line) {
    const out = []; let cur = [], w = 0;
    line.display.forEach((d, i) => {
      const ww = L.measure(ctx, d.toUpperCase(), { size: CAP, font: F.anton, ls: 1 }) + GAP;
      if (cur.length && (w + ww > 930 || cur.length >= 3)) { out.push(cur); cur = []; w = 0; }
      cur.push(i); w += ww;
      if (/[?!.]$/.test(d) && !/\.\.\.$/.test(d) && cur.length >= 2) { out.push(cur); cur = []; w = 0; }
    });
    if (cur.length) out.push(cur);
    return out;
  }
  const lineChunks = {};
  function captions(c, t) {
    const line = TL.lines.find(l => l.speaker !== 'clawd' && t >= l.start - 0.05 && t < l.start + l.dur + 0.3);
    if (!line || t > E.tapeStop) return;
    lineChunks[line.id] = lineChunks[line.id] || chunks(line);
    const slotAt = line.display.map((_, s) => Math.min(...line.words.filter(w => w.slot === s).map(w => w.at)));
    let last = -1; slotAt.forEach((a, s) => { if (t >= a - 0.02) last = s; });
    if (last < 0) return;
    const ch = lineChunks[line.id].find(k => k.includes(last));
    const words = ch.filter(s => s <= last);
    const fade = 1 - prog(t, line.start + line.dur + 0.1, line.start + line.dur + 0.3);
    const y = 1232;
    // speaker tag
    const spk = line.speaker === 'codex' ? ['CODEX', C.codex, '#fff'] : ['ANNOUNCER', '#26262e', C.yellow];
    c.save(); c.globalAlpha = fade;
    const tw = L.measure(c, spk[0], { size: 20, font: F.pixel }) + 30;
    c.fillStyle = spk[1]; L.rr(c, 540 - tw / 2, y - 132, tw, 38, 19); c.fill();
    L.text(c, spk[0], 540, y - 103, { size: 20, font: F.pixel, fill: spk[2] });
    const all = ch.map(s => line.display[s].toUpperCase());
    const ws = all.map(s => L.measure(c, s, { size: CAP, font: F.anton, ls: 1 }) + GAP);
    let x = 540 - (ws.reduce((a, b) => a + b, 0) - GAP) / 2;
    ch.forEach((s, i) => {
      if (s <= last) {
        const a = slotAt[s], pop = 1 + 0.16 * Math.max(0, 1 - (t - a) / 0.16);
        const isCur = s === last;
        const col = EMPH[all[i]] || (isCur ? C.yellow : '#ffffff');
        const gw = ws[i] - GAP;
        c.save(); c.translate(x + gw / 2, y - 26); c.scale(pop, pop);
        L.text(c, all[i], -gw / 2, 26, { size: CAP, font: F.anton, align: 'left', fill: col, stroke: '#000', sw: 14, shadow: 'rgba(0,0,0,.7)', blur: 18, dy: 6, ls: 1 });
        c.restore();
      }
      x += ws[i];
    });
    c.restore();
  }

  // ---------------------------------------------------------------- compose
  function renderFrame(t) {
    t = clamp(t, 0, TL.duration - 1e-4);
    const sc = sceneAt(t);
    let sh = 0; impacts.forEach(([ti, a]) => { sh += a * decay(t, ti, 0.09); });
    bctx.save();
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.translate(L.noise1(t * 55, 1) * sh, L.noise1(t * 55, 2) * sh);
    const kz = 1 + 0.009 * SCENE_UTIL.pulse(t);           // tiny zoom kick on every beat
    bctx.translate(W / 2, H / 2); bctx.scale(kz, kz); bctx.translate(-W / 2, -H / 2);
    // whip-in: new scene slides in from the right
    let whipV = 0;
    whips.forEach(w0 => { if (t >= w0 && t < w0 + 0.2) { const p = prog(t, w0, w0 + 0.2); bctx.translate((1 - L.ease.outExpo(p)) * 520, 0); whipV = 1 - p; } });
    SCENES[sc.name](bctx, t);
    bctx.restore();

    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    let ab = 0; aberr.forEach(([ti, a]) => { ab += a * decay(t, ti, 0.07); });
    if (ab > 0.6) {
      chan.forEach((cv, i) => {
        const x = cv.getContext('2d'); x.globalCompositeOperation = 'source-over'; x.drawImage(buf, 0, 0);
        x.globalCompositeOperation = 'multiply'; x.fillStyle = ['#ff0000', '#00ff00', '#0000ff'][i]; x.fillRect(0, 0, W, H);
      });
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(chan[0], -ab, 0); ctx.drawImage(chan[1], 0, ab * 0.3); ctx.drawImage(chan[2], ab, 0);
      ctx.globalCompositeOperation = 'source-over';
    } else if (t > E.tapeStop - 0.2 && t < E.tapeStop) {
      const p = prog(t, E.tapeStop - 0.2, E.tapeStop), sy = Math.max(0.004, 1 - L.ease.inCubic(p)), sx = 1 - 0.35 * Math.pow(p, 4);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(sx, sy); ctx.drawImage(buf, -W / 2, -H / 2); ctx.restore();
      const wl = clamp((p - 0.55) / 0.45);
      ctx.fillStyle = `rgba(255,255,255,${0.95 * wl})`; ctx.fillRect(W / 2 - W * sx / 2, H / 2 - Math.max(2, H * sy / 2), W * sx, Math.max(4, H * sy));
    } else ctx.drawImage(buf, 0, 0);
    if (whipV > 0) { // horizontal motion blur smear
      for (let k = 1; k <= 5; k++) { ctx.globalAlpha = 0.18 * whipV; ctx.drawImage(buf, k * 60 * whipV, 0); }
      ctx.globalAlpha = 1;
    }
    // glitch slices
    glitches.forEach(g0 => {
      if (t < g0 - 0.02 || t > g0 + 0.12 || t < 0.04) return;
      const fr = Math.floor(t * 60);
      for (let i = 0; i < 9; i++) {
        const y = rnd(fr * 13 + i, 3) * H, h = 10 + rnd(fr * 7 + i, 4) * 90, dx = (rnd(fr * 5 + i, 5) - 0.5) * 160;
        ctx.drawImage(buf, 0, y, W, h, dx, y, W, h);
        if (i % 3 === 0) { ctx.fillStyle = i % 2 ? 'rgba(255,40,80,.18)' : 'rgba(60,220,255,.18)'; ctx.fillRect(0, y, W, h); }
      }
    });
    flashes.forEach(([ti, col, a]) => { const v = a * decay(t, ti, 0.11); if (v > 0.01) { ctx.fillStyle = `rgba(${col},${v})`; ctx.fillRect(0, 0, W, H); } });
    captions(ctx, t);
    // grade: vignette + film grain
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.42)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    const fr = Math.floor(t * 30);
    ctx.globalAlpha = 0.045; ctx.globalCompositeOperation = 'overlay';
    const gc = grain[fr % 4], ox = (rnd(fr, 1) * 256) | 0, oy = (rnd(fr, 2) * 256) | 0;
    for (let x = -ox; x < W; x += 256) for (let y = -oy; y < H; y += 256) ctx.drawImage(gc, x, y);
    ctx.restore();
  }

  window.renderFrame = renderFrame;
  window.SCENE_AT = sceneAt;
})();
