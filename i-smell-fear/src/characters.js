// The two mascots, drawn procedurally.
//  - Clawd: Claude Code's pixel critter, rebuilt from the terminal glyphs  ▐▛███▜▌ / ▝▜█████▛▘ / ▘▘ ▝▝
//    (quadrant pixels are 1:2, so the body is 6u wide x 4u tall, slit eyes, nub arms, four legs).
//  - Codex: the cloud-headed Codex companion with a terminal screen for a face (">_").
(function () {
  const { C, clamp, lerp } = L;

  // ---------------------------------------------------------------- CLAWD
  // (x,y) = point between the feet on the ground, u = unit in px.
  // s: { t, run, look, blink, squash, shades, glow, alpha, legs, tilt, mood }
  function clawd(ctx, x, y, u, s = {}) {
    const t = s.t || 0, run = s.run || 0, ph = (s.phase ?? t * 14);
    ctx.save();
    ctx.translate(x, y);
    if (s.alpha !== undefined) ctx.globalAlpha *= s.alpha;
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, 0.08 * u, 3.6 * u * (1 - 0.15 * Math.abs(Math.sin(ph)) * run), 0.42 * u, 0, 0, 7); ctx.fill();
    const bob = -Math.abs(Math.sin(ph)) * 0.38 * u * run + (s.hop || 0);
    const sq = s.squash || 1;
    ctx.translate(0, bob);
    if (s.tilt) ctx.rotate(s.tilt);
    ctx.scale(1 / Math.sqrt(sq), sq);
    if (s.glow) { ctx.shadowColor = C.clayGlow + (0.85 * s.glow) + ')'; ctx.shadowBlur = 2.2 * u * s.glow; }
    const body = s.color || C.clay;
    const R = (cx0, cy0, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(cx0 * u, cy0 * u, w * u + 0.5, h * u + 0.5); };
    // legs (cols 4,6,11,13 -> x -2.5,-1.5,1,2 ; 0.5u wide) with a run cycle
    const liftA = Math.max(0, Math.sin(ph)) * 0.42 * run, liftB = Math.max(0, -Math.sin(ph)) * 0.42 * run;
    const legs = [[-2.5, liftA], [-1.5, liftB], [1.0, liftA], [2.0, liftB]];
    legs.forEach(([lx, lift]) => R(lx, -1.02, 0.5, 1.02 - lift, s.legColor || C.clayDk));
    // arms (row 2 -> y -3..-2, cols 1-2 / 15-16)
    const swing = Math.sin(ph) * 0.22 * run + (s.armUp || 0);
    R(-4.0, -3 - swing - (s.armL || 0), 1.02, 1, body);
    R(3.0, -3 + swing - (s.armR || 0), 1.02, 1, body);
    // body (rows 0-3)
    R(-3, -5, 6, 4, body);
    ctx.shadowColor = 'transparent';
    // pixel shading: top highlight + bottom shade
    R(-3, -5, 6, 0.2, s.hi || C.clayLt);
    R(-3, -1.22, 6, 0.22, C.clayDk);
    R(2.78, -5, 0.22, 4, 'rgba(0,0,0,.08)');
    // eyes (row 1 -> y -4..-3, cols 5 & 12 -> x -2 / 1.5)
    const look = clamp(s.look || 0, -1, 1) * 0.42;
    const bl = clamp(s.blink || 0);
    const eh = 1 * (1 - 0.86 * bl), ey = -4 + (1 - eh) / 2 + (s.eyeY || 0);
    if (!(s.shades > 0.98)) {
      R(-2 + look, ey, 0.5, eh, '#141414');
      R(1.5 + look, ey, 0.5, eh, '#141414');
    }
    // sunglasses ("deal with it")
    if (s.shades > 0) {
      const sp = clamp(s.shades), drop = lerp(-9, 0, L.ease.outCubic(sp));
      ctx.save(); ctx.translate(0, drop * u);
      ctx.globalAlpha *= clamp(sp * 3);
      R(-3.3, -4.25, 6.6, 0.32, '#0c0c0c');
      R(-2.75, -4.05, 1.75, 1.15, '#0c0c0c');
      R(1.0, -4.05, 1.75, 1.15, '#0c0c0c');
      R(-2.45, -3.85, 0.35, 0.3, '#ffffff');
      R(1.3, -3.85, 0.35, 0.3, '#ffffff');
      R(-2.05, -3.5, 0.25, 0.22, 'rgba(255,255,255,.55)');
      R(1.7, -3.5, 0.25, 0.22, 'rgba(255,255,255,.55)');
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- CODEX
  // (x,y) = feet on ground, u = unit (head is ~2u wide).
  // s: { t, face, talk, armL, armR, tilt, squash, run, sweat, shake, tint, alpha, glitch, flip }
  const HEAD = [[0, 0, 0.92, 0.7], [-0.55, -0.5, 0.42], [0, -0.62, 0.46], [0.55, -0.5, 0.42], [-0.86, -0.04, 0.37],
    [0.86, -0.04, 0.37], [-0.62, 0.42, 0.35], [0.62, 0.42, 0.35], [0, 0.5, 0.46]];
  function headPath(ctx, u) {
    ctx.beginPath();
    HEAD.forEach(h => {
      if (h.length === 4) ctx.ellipse(h[0] * u, h[1] * u, h[2] * u, h[3] * u, 0, 0, Math.PI * 2);
      else { ctx.moveTo((h[0] + h[2]) * u, h[1] * u); ctx.arc(h[0] * u, h[1] * u, h[2] * u, 0, Math.PI * 2); }
    });
  }
  function blueGrad(ctx, u, cx, cy, r) {
    const g = ctx.createRadialGradient((cx - 0.45) * u, (cy - 0.55) * u, 0.05 * u, cx * u, cy * u, r * u);
    g.addColorStop(0, '#c3caff'); g.addColorStop(0.35, '#8794ff'); g.addColorStop(0.8, '#5a66e6'); g.addColorStop(1, '#3f48c4');
    return g;
  }
  function codex(ctx, x, y, u, s = {}) {
    const t = s.t || 0, run = s.run || 0, ph = (s.phase ?? t * 13);
    ctx.save();
    ctx.translate(x + (s.shake ? (L.noise1(t * 40, 1) * s.shake) : 0), y);
    if (s.alpha !== undefined) ctx.globalAlpha *= s.alpha;
    if (s.flip) ctx.scale(-1, 1);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, 0.05 * u, 0.95 * u, 0.16 * u, 0, 0, 7); ctx.fill();
    const bob = -Math.abs(Math.sin(ph)) * 0.16 * u * run + (s.hop || 0);
    ctx.translate(0, bob);
    if (s.tilt) ctx.rotate(s.tilt);
    const sq = s.squash || 1; ctx.scale(1 / Math.sqrt(sq), sq);
    // legs
    ctx.strokeStyle = '#4a54d4';
    const lA = Math.sin(ph) * 0.12 * run, lB = -lA;
    L.capsule(ctx, -0.28 * u, (-0.3 + lA) * u, -0.28 * u, (-0.06 + lA * 0.3) * u, 0.27 * u);
    L.capsule(ctx, 0.28 * u, (-0.3 + lB) * u, 0.28 * u, (-0.06 + lB * 0.3) * u, 0.27 * u);
    // arms (angles in rad, 0 = hanging)
    const arm = (side, ang) => {
      const sx = side * 0.47 * u, sy = -0.8 * u, len = 0.46 * u;
      const a = Math.PI / 2 - side * (0.35 + ang);
      ctx.strokeStyle = '#5c68ea';
      L.capsule(ctx, sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len, 0.23 * u);
    };
    const swing = Math.sin(ph) * 0.5 * run;
    arm(-1, (s.armL || 0) + swing); arm(1, (s.armR || 0) - swing);
    // body
    ctx.fillStyle = blueGrad(ctx, u, 0, -0.62, 0.8);
    L.rr(ctx, -0.52 * u, -0.95 * u, 1.04 * u, 0.66 * u, 0.28 * u); ctx.fill();
    // chest ">-"
    ctx.strokeStyle = '#d9e8ff'; ctx.lineWidth = 0.06 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-0.17 * u, -0.7 * u); ctx.lineTo(-0.07 * u, -0.62 * u); ctx.lineTo(-0.17 * u, -0.54 * u); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.0 * u, -0.56 * u); ctx.lineTo(0.15 * u, -0.56 * u); ctx.stroke();
    // head
    ctx.save(); ctx.translate(0, -1.72 * u);
    if (s.headTilt) ctx.rotate(s.headTilt);
    ctx.shadowColor = 'rgba(20,24,80,.45)'; ctx.shadowBlur = 0.3 * u; ctx.shadowOffsetY = 0.08 * u;
    ctx.fillStyle = blueGrad(ctx, u, 0, 0, 1.25); headPath(ctx, u); ctx.fill();
    ctx.shadowColor = 'transparent';
    // rim light
    ctx.save(); headPath(ctx, u); ctx.clip();
    const rim = ctx.createLinearGradient(-u, -u, u, u); rim.addColorStop(0, 'rgba(255,255,255,.22)'); rim.addColorStop(0.5, 'rgba(255,255,255,0)'); rim.addColorStop(1, 'rgba(10,10,60,.25)');
    ctx.fillStyle = rim; ctx.fillRect(-1.4 * u, -1.4 * u, 2.8 * u, 2.8 * u); ctx.restore();
    // screen
    const tint = s.tint || 0;
    const sg = ctx.createLinearGradient(0, -0.43 * u, 0, 0.43 * u);
    sg.addColorStop(0, tint ? `rgb(${lerp(26, 90, tint)},${lerp(33, 18, tint)},${lerp(80, 30, tint)})` : '#1b2256');
    sg.addColorStop(1, tint ? `rgb(${lerp(14, 50, tint)},12,${lerp(48, 20, tint)})` : '#0c1030');
    ctx.fillStyle = sg; L.rr(ctx, -0.66 * u, -0.44 * u, 1.32 * u, 0.88 * u, 0.25 * u); ctx.fill();
    ctx.strokeStyle = 'rgba(160,175,255,.35)'; ctx.lineWidth = 0.035 * u; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.06)'; L.rr(ctx, -0.6 * u, -0.4 * u, 1.2 * u, 0.3 * u, 0.2 * u); ctx.fill();
    face(ctx, u, s.face || 'neutral', t, s.talk || 0, s.text);
    ctx.restore();
    // sweat drops
    if (s.sweat > 0) {
      for (let i = 0; i < 3; i++) {
        const p = ((t * 1.6 + i / 3) % 1), sx = (i % 2 ? 1.02 : -1.0) * u + (i - 1) * 0.08 * u, sy = (-2.2 + p * 0.9) * u;
        ctx.globalAlpha = s.sweat * (1 - p) * (s.alpha ?? 1);
        ctx.fillStyle = '#bfe9ff'; ctx.beginPath(); ctx.moveTo(sx, sy - 0.14 * u);
        ctx.quadraticCurveTo(sx + 0.1 * u, sy, sx, sy + 0.08 * u); ctx.quadraticCurveTo(sx - 0.1 * u, sy, sx, sy - 0.14 * u); ctx.fill();
      }
    }
    ctx.restore();
  }

  function face(ctx, u, f, t, talk, text) {
    const g = C.glyph;
    ctx.save();
    ctx.strokeStyle = g; ctx.fillStyle = g; ctx.lineWidth = 0.11 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(120,230,255,.9)'; ctx.shadowBlur = 0.22 * u;
    const line = (pts) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * u, p[1] * u) : ctx.moveTo(p[0] * u, p[1] * u))); ctx.stroke(); };
    const cur = 0.5 + 0.5 * Math.sign(Math.sin(t * 7));
    switch (f) {
      case 'neutral': {
        line([[-0.42, -0.16], [-0.2, -0.02], [-0.42, 0.12]]);
        ctx.globalAlpha *= talk > 0.05 ? 1 : cur * 0.7 + 0.3;
        line([[0.08, 0.14 - talk * 0.1], [0.42, 0.14 - talk * 0.1]]);
        break;
      }
      case 'smug': {
        line([[-0.46, -0.04], [-0.16, -0.1]]);
        line([[0.14, -0.1], [0.44, -0.04]]);
        const m = 0.05 + talk * 0.08;
        ctx.beginPath(); ctx.moveTo(-0.06 * u, 0.16 * u); ctx.quadraticCurveTo(0.12 * u, (0.18 + m) * u, 0.3 * u, 0.06 * u); ctx.stroke();
        break;
      }
      case 'laugh': {
        line([[-0.44, -0.16], [-0.22, -0.04], [-0.44, 0.08]]);
        line([[0.44, -0.16], [0.22, -0.04], [0.44, 0.08]]);
        ctx.beginPath(); ctx.moveTo(-0.16 * u, 0.15 * u); ctx.quadraticCurveTo(0, (0.32 + talk * 0.06) * u, 0.16 * u, 0.15 * u); ctx.closePath(); ctx.fill();
        break;
      }
      case 'shock': {
        ctx.beginPath(); ctx.arc(-0.27 * u, -0.06 * u, 0.13 * u, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.arc(0.27 * u, -0.06 * u, 0.13 * u, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0.24 * u, 0.06 * u, (0.06 + talk * 0.06) * u, 0, 0, 7); ctx.stroke();
        break;
      }
      case 'dead': {
        [[-0.27, -0.04], [0.27, -0.04]].forEach(([cx, cy]) => { line([[cx - 0.12, cy - 0.12], [cx + 0.12, cy + 0.12]]); line([[cx + 0.12, cy - 0.12], [cx - 0.12, cy + 0.12]]); });
        line([[-0.12, 0.25], [0.12, 0.25]]);
        break;
      }
      case 'sad': {
        line([[-0.42, -0.14], [-0.14, -0.14]]); line([[-0.28, -0.14], [-0.28, 0.1]]);
        line([[0.14, -0.14], [0.42, -0.14]]); line([[0.28, -0.14], [0.28, 0.1]]);
        ctx.globalAlpha *= 0.8; line([[-0.28, 0.16], [-0.28, 0.16 + 0.12 * ((t * 2) % 1)]]);
        break;
      }
      case 'panic': {
        ctx.strokeStyle = ctx.fillStyle = '#ffdf6b'; ctx.shadowColor = 'rgba(255,200,80,.9)';
        [[-0.27], [0.27]].forEach(([cx]) => { line([[cx, -0.26], [cx, 0.02]]); ctx.beginPath(); ctx.arc(cx * u, 0.15 * u, 0.06 * u, 0, 7); ctx.fill(); });
        break;
      }
      case 'squint': {
        line([[-0.44, -0.12], [-0.22, -0.02], [-0.44, 0.08]]);
        line([[0.44, -0.12], [0.22, -0.02], [0.44, 0.08]]);
        line([[-0.1, 0.24], [0.1, 0.24]]);
        break;
      }
      case 'text': {
        ctx.font = `800 ${0.34 * u}px ${L.F.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text || 'ERR', 0, 0.02 * u);
        break;
      }
    }
    ctx.restore();
  }

  window.CHAR = { clawd, codex };
})();
