"""Painterly stroke decomposition (Hertzmann-style) of a reference painting.
Emits a compact binary stroke list that a JS canvas renderer replays."""
import base64, random, struct, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = sys.argv[1]
OUT = sys.argv[2]
random.seed(3)

ref_img = Image.open(SRC).convert("RGB")
W, H = ref_img.size
ref = np.asarray(ref_img, dtype=np.float32)

LAYERS = [(26, 0.0), (16, 12.0), (16, 12.0), (11, 12.0), (11, 12.0), (8, 13.0), (8, 13.0), (6, 14.0), (6, 14.0), (4, 16.0), (4, 16.0)]   # (radius, error threshold)
MAXLEN, MINLEN, FC = 20, 4, 0.5
STEP_K = 0.7

canvas = Image.new("RGB", (W, H), tuple(int(v) for v in ref.reshape(-1, 3).mean(0)))
strokes = []

def lum(a):
    return 0.30 * a[..., 0] + 0.59 * a[..., 1] + 0.11 * a[..., 2]

def sobel(L):
    gx = np.zeros_like(L); gy = np.zeros_like(L)
    gx[:, 1:-1] = L[:, 2:] - L[:, :-2]
    gy[1:-1, :] = L[2:, :] - L[:-2, :]
    return gx, gy

def draw_stroke(d, pts, r, col):
    """Palette-knife mark: flat ends, mitred body (canvas lineCap='butt', lineJoin='round')."""
    if len(pts) == 1:
        x, y = pts[0]
        d.rectangle([x - r, y - r * 0.8, x + r, y + r * 0.8], fill=col)
        return
    d.line(pts, fill=col, width=int(round(2 * r)), joint="curve")

for R, T in LAYERS:
    refb = np.asarray(ref_img.filter(ImageFilter.GaussianBlur(R * 0.3)), dtype=np.float32)
    cv = np.asarray(canvas, dtype=np.float32)
    D = np.sqrt(((cv - refb) ** 2).sum(-1))
    gx0, gy0 = sobel(lum(np.asarray(ref_img.filter(ImageFilter.GaussianBlur(max(1.5, R * 0.5))), dtype=np.float32)))
    # structure tensor, smoothed: gives the dominant local edge direction even in flat areas
    def blur(a, s):                                       # 3 box passes ~ gaussian
        r = max(1, int(round(s * 0.9)))
        for _ in range(3):
            c = np.cumsum(np.pad(a, ((0, 0), (r + 1, r)), mode="edge"), axis=1)
            a = (c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)
            c = np.cumsum(np.pad(a, ((r + 1, r), (0, 0)), mode="edge"), axis=0)
            a = (c[2 * r + 1:, :] - c[:-2 * r - 1, :]) / (2 * r + 1)
        return a
    sig = max(4.0, R * 1.2)
    Jxx, Jxy, Jyy = blur(gx0 * gx0, sig), blur(gx0 * gy0, sig), blur(gy0 * gy0, sig)
    ang = 0.5 * np.arctan2(2 * Jxy, Jxx - Jyy)          # gradient direction
    coh = np.sqrt((Jxx - Jyy) ** 2 + 4 * Jxy ** 2)
    gx, gy = np.cos(ang) * (coh + 1e-3), np.sin(ang) * (coh + 1e-3)
    grid = max(2, R if R > 6 else (R * 2) // 3)
    layer = []
    for gy0 in range(0, H, grid):
        for gx0 in range(0, W, grid):
            cell = D[gy0:gy0 + grid, gx0:gx0 + grid]
            if cell.size == 0 or cell.mean() <= T:
                continue
            iy, ix = np.unravel_index(np.argmax(cell), cell.shape)
            x, y = gx0 + ix, gy0 + iy
            col = refb[y, x]
            pts = [(x, y)]
            ldx = ldy = 0.0
            for i in range(MAXLEN):
                xi, yi = int(min(W - 1, max(0, x))), int(min(H - 1, max(0, y)))
                if i >= MINLEN:
                    if np.abs(refb[yi, xi] - cv[yi, xi]).sum() < np.abs(refb[yi, xi] - col).sum():
                        break
                g1, g2 = gx[yi, xi], gy[yi, xi]
                if g1 * g1 + g2 * g2 < 1e-6:
                    break
                dx, dy = -g2, g1
                if ldx * dx + ldy * dy < 0:
                    dx, dy = -dx, -dy
                dx, dy = FC * dx + (1 - FC) * ldx, FC * dy + (1 - FC) * ldy
                n = (dx * dx + dy * dy) ** 0.5
                dx, dy = dx / n, dy / n
                x, y = x + R * STEP_K * dx, y + R * STEP_K * dy
                if not (0 <= x < W and 0 <= y < H):
                    break
                pts.append((x, y))
                ldx, ldy = dx, dy
            if len(pts) < MINLEN + 1:
                continue
            layer.append((R, tuple(int(round(c)) for c in col), [(int(round(px)), int(round(py))) for px, py in pts]))
    random.shuffle(layer)
    cvs = np.asarray(canvas, dtype=np.float32).copy()
    kept = []
    for R_, col, pts in layer:
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        x0, y0 = max(0, min(xs) - R_ - 1), max(0, min(ys) - R_ - 1)
        x1, y1 = min(W, max(xs) + R_ + 2), min(H, max(ys) + R_ + 2)
        if x1 <= x0 or y1 <= y0:
            continue
        m = Image.new("L", (x1 - x0, y1 - y0), 0)
        draw_stroke(ImageDraw.Draw(m), [(px - x0, py - y0) for px, py in pts], R_, 255)
        mk = np.asarray(m) > 127
        if not mk.any():
            continue
        tgt = ref[y0:y1, x0:x1][mk]
        cur = cvs[y0:y1, x0:x1][mk]
        c = tgt.mean(0)
        col = tuple(int(round(v)) for v in c)
        c = np.array(col, dtype=np.float32)
        before = np.abs(tgt - cur).sum()
        after = np.abs(tgt - c).sum()
        if after < before * (0.97 if R_ < 26 else 1.01):
            region = cvs[y0:y1, x0:x1]
            region[mk] = c
            kept.append((R_, col, pts))
    canvas = Image.fromarray(np.clip(cvs, 0, 255).astype(np.uint8))
    layer = kept
    strokes += layer
    cv = np.asarray(canvas, dtype=np.float32)
    print(f"R={R:2d} strokes={len(layer):6d} total={len(strokes):6d} mean|err|={np.abs(cv - ref).mean():.2f}", flush=True)

canvas.save(OUT + ".preview.png")

# pack: per stroke  [r u8][R G B u8x3][n u8][x0 u16][y0 u16] then (n-1) * [dx i8][dy i8]
buf = bytearray()
for R, (r, g, b), pts in strokes:
    buf += struct.pack("<BBBBBHH", R, r, g, b, len(pts), pts[0][0], pts[0][1])
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        buf += struct.pack("<bb", bx - ax, by - ay)
open(OUT, "w").write(base64.b64encode(bytes(buf)).decode())
print("strokes", len(strokes), "bytes", len(buf), "b64", (len(buf) * 4) // 3)
print("bg", tuple(int(v) for v in ref.reshape(-1, 3).mean(0)))
