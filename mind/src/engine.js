// Math, camera, and drawing helpers for the film. No images: every pixel comes from
// paths, gradients, and text drawn on a 2D canvas.

export const W = 1920;
export const H = 1080;

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
};
// Rises over [a, a+fadeIn], holds, falls over [b-fadeOut, b].
export const window01 = (t, a, b, fadeIn = 0.3, fadeOut = 0.3) =>
  Math.min(smooth(seg(t, a, a + fadeIn)), 1 - smooth(seg(t, b - fadeOut, b)));

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
export function gauss(rand) {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}
// Hash-based value noise in 1D, smooth and deterministic.
export function noise1(x, seed = 0) {
  const h = (n) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x);
  const f = x - i;
  return lerp(h(i), h(i + 1), smooth(f)) * 2 - 1;
}

export const v3 = (x, y, z) => ({ x, y, z });
export const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a, s) => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len = (a) => Math.hypot(a.x, a.y, a.z);
export const norm = (a) => mul(a, 1 / (len(a) || 1));
export const mix3 = (a, b, t) => v3(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));

export class Camera {
  set(pos, target, fovDeg = 40, roll = 0) {
    this.pos = pos;
    this.f = norm(sub(target, pos));
    const worldUp = v3(Math.sin(roll), Math.cos(roll), 0);
    this.r = norm(cross(this.f, worldUp));
    this.u = cross(this.r, this.f);
    this.focal = (H / 2) / Math.tan((fovDeg * Math.PI) / 360);
    return this;
  }
  // World point -> screen point, or null when behind the camera.
  project(p) {
    const d = sub(p, this.pos);
    const z = dot(d, this.f);
    if (z < 0.05) return null;
    const k = this.focal / z;
    return { x: W / 2 + dot(d, this.r) * k, y: H / 2 - dot(d, this.u) * k, z, k };
  }
}

// Soft round light, pre-rendered once per color and stamped with additive blending.
const glowCache = new Map();
export function glowSprite(rgb, size = 128) {
  const key = `${rgb}|${size}`;
  if (glowCache.has(key)) return glowCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(0.18, `rgba(${rgb},0.55)`);
  grad.addColorStop(0.45, `rgba(${rgb},0.14)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glowCache.set(key, c);
  return c;
}

export function glow(ctx, x, y, radius, rgb, alpha = 1) {
  if (alpha <= 0.002 || radius <= 0.2) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(glowSprite(rgb), x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

export const rgba = (rgb, a) => `rgba(${rgb},${Math.max(0, Math.min(1, a)).toFixed(4)})`;

export function polyline(ctx, pts) {
  let started = false;
  ctx.beginPath();
  for (const p of pts) {
    if (!p) { started = false; continue; }
    if (started) ctx.lineTo(p.x, p.y);
    else { ctx.moveTo(p.x, p.y); started = true; }
  }
}
