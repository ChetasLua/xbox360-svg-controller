import math, os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1200, 675
FPS = int(sys.argv[1]) if len(sys.argv) > 1 else 20
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "frames")
os.makedirs(OUT, exist_ok=True)

BG = (14, 14, 16)
PANEL = (26, 26, 30)
GRID = (40, 40, 46)
TXT = (240, 238, 232)
MUTED = (140, 140, 150)
DIM = (90, 90, 100)
ANT = (233, 128, 76)       # Anthropic / Claude
ANT_D = (120, 66, 40)
OAI = (31, 160, 138)       # OpenAI
RED = (238, 84, 80)
GOLD = (245, 190, 80)

def F(w, s):
    return ImageFont.truetype(os.path.join(HERE, "fonts", f"Inter-{w}.otf"), s)

fonts = {}
def font(w, s):
    k = (w, s)
    if k not in fonts:
        fonts[k] = F(w, s)
    return fonts[k]

def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))

def ease(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3

def ease_back(x):
    x = clamp(x)
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2

def prog(t, a, b):
    return clamp((t - a) / (b - a))

def mix(c1, c2, a):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * a) for i in range(3))

def fade(c, a):
    return mix(BG, c, clamp(a))

def text(d, xy, s, w, size, col, alpha=1.0, anchor="la"):
    d.text(xy, s, font=font(w, size), fill=fade(col, alpha), anchor=anchor)

def tw(s, w, size):
    return font(w, size).getlength(s)

def money(v):
    return "${:,.0f}".format(v)

def bar(d, x, y, w, h, col, r=8):
    if w < 1:
        return
    d.rounded_rectangle([x, y, x + w, y + h], radius=min(r, w / 2), fill=col)

def striped(img, x, y, w, h, col, alpha):
    if w < 2:
        return
    layer = Image.new("RGB", (int(w), int(h)), fade(ANT_D, alpha))
    ld = ImageDraw.Draw(layer)
    for i in range(-int(h), int(w) + int(h), 14):
        ld.line([(i, h), (i + h, 0)], fill=fade(col, alpha * 0.85), width=5)
    mask = Image.new("L", layer.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=8, fill=255)
    img.paste(layer, (int(x), int(y)), mask)

def header(d, kicker, title, a, sub=None):
    y_off = (1 - ease(a)) * 14
    text(d, (60, 44 + y_off), kicker, "Bold", 16, GOLD, a)
    text(d, (60, 70 + y_off), title, "ExtraBold", 40, TXT, a)
    if sub:
        text(d, (60, 122 + y_off), sub, "Medium", 19, MUTED, a)

def footer(d, a=1.0):
    text(d, (60, H - 34), "Data: SemiAnalysis Tokenomics (Oct 2026) · agentic workload · API-equivalent value per month",
         "Medium", 14, DIM, a)
    # little brand marks
    x = W - 60
    s = "OpenAI"
    text(d, (x, H - 34), s, "SemiBold", 14, OAI, a, anchor="ra")
    x -= tw(s, "SemiBold", 14) + 22
    d.ellipse([x + 6, H - 30, x + 14, H - 22], fill=fade(OAI, a))
    s = "Anthropic"
    x -= 14
    text(d, (x, H - 34), s, "SemiBold", 14, ANT, a, anchor="ra")
    x -= tw(s, "SemiBold", 14) + 22
    d.ellipse([x + 6, H - 30, x + 14, H - 22], fill=fade(ANT, a))

def pill(d, cx, cy, s, col, a, size=22):
    if a <= 0:
        return
    sc = ease_back(a)
    size_s = max(6, int(size * sc))
    wdt = tw(s, "Black", size_s) + size_s * 1.1
    hgt = size_s * 1.7
    d.rounded_rectangle([cx - wdt / 2, cy - hgt / 2, cx + wdt / 2, cy + hgt / 2], radius=hgt / 2,
                        fill=fade(col, clamp(a * 2)))
    text(d, (cx, cy), s, "Black", size_s, BG, clamp(a * 2), anchor="mm")

# ---------------------------------------------------------------- scenes
SCENES = []
def scene(dur):
    def deco(fn):
        SCENES.append((dur, fn))
        return fn
    return deco

@scene(1.7)
def s_intro(img, d, t, T):
    out = 1 - prog(t, T - 0.2, T)
    a1 = prog(t, 0.0, 0.3) * out
    a2 = prog(t, 0.45, 0.75) * out
    text(d, (W / 2, 270 - 10 * (1 - ease(a1))), "Same $200 a month.", "Black", 70, TXT, a1, anchor="mm")
    text(d, (W / 2, 370 - 10 * (1 - ease(a2))), "How much AI do you actually get?", "ExtraBold", 38, GOLD, a2, anchor="mm")

@scene(3.6)
def s_flagship(img, d, t, T):
    out = 1 - prog(t, T - 0.2, T)
    ha = prog(t, 0, 0.3) * out
    header(d, "FLAGSHIPS · $200 PLANS", "Fable 5.1  vs  GPT-6 Astra", ha,
           "API-equivalent value per month")
    x0, maxw, maxv = 300, 760, 9000
    rows = [("GPT-6 Astra", "ChatGPT Pro 200", 2897, OAI, 230),
            ("Fable 5.1", "Claude Max 20x", 2485, ANT, 330)]
    for v in range(0, 9001, 1500):
        gx = x0 + maxw * v / maxv
        d.line([(gx, 200), (gx, 470)], fill=fade(GRID, ha))
        text(d, (gx, 478), "$0" if v == 0 else f"${v/1000:g}K", "Medium", 13, DIM, ha, anchor="ma")
    for i, (name, plan, v, col, y) in enumerate(rows):
        g = ease(prog(t, 0.25 + i * 0.15, 0.95 + i * 0.15)) * out
        text(d, (60, y + 6), name, "ExtraBold", 26, col, ha)
        text(d, (60, y + 40), plan, "Medium", 16, MUTED, ha)
        w = maxw * v / maxv * g
        bar(d, x0, y, w, 64, fade(col, out))
        if g > 0.02:
            text(d, (x0 + w + 14, y + 32), money(v * g), "ExtraBold", 28, TXT, out, anchor="lm")
    a = prog(t, 1.1, 1.35) * out
    text(d, (60, 525), "Close fight on the flagship…", "Bold", 22, TXT, a)
    b = prog(t, 1.45, 1.7) * out
    text(d, (60, 558), "…but Fable only uses HALF your Claude plan. The other half is still yours.", "Medium", 19, GOLD, b)
    c = ease(prog(t, 1.7, 2.5)) * out
    fw = maxw * 2485 / maxv
    ext = maxw * 5863 / maxv * c
    if c > 0:
        d.rectangle([x0 + fw + 2, 330, x0 + fw + 200, 394], fill=BG)
        striped(img, x0 + fw + 4, 330, ext, 64, ANT, out)
        tot = 2485 + 5863 * c
        text(d, (x0 + fw + ext + 14, 362), money(tot), "ExtraBold", 28, ANT, out, anchor="lm")
        text(d, (x0 + fw + 14, 320), "+ $5,863 of Opus 5.5 with the remaining 50%", "SemiBold", 14, ANT, prog(t, 1.9, 2.2) * out, anchor="ls")
    pill(d, 960, 545, "2.9× total value", ANT, prog(t, 2.6, 2.9) * out, 24)

@scene(4.2)
def s_mid(img, d, t, T):
    out = 1 - prog(t, T - 0.2, T)
    ha = prog(t, 0, 0.3) * out
    header(d, "DAILY DRIVERS · $200 PLANS", "Sonnet 5.5 & Opus 5.5  vs  GPT-6.1 Sol", ha,
           "The models both labs tell you to use every day — API-equivalent value per month")
    x0, maxw, maxv = 300, 620, 13000
    rows = [("GPT-6.1 Sol", "ChatGPT Pro 200", 2084, OAI, None, 200),
            ("Opus 5.5", "Claude Max 20x", 11726, ANT, "5.6×", 315),
            ("Sonnet 5.5", "Claude Max 20x", 12529, (247, 196, 112), "6.0×", 430)]
    for v in range(0, 13001, 2000):
        gx = x0 + maxw * v / maxv
        d.line([(gx, 185), (gx, 525)], fill=fade(GRID, ha))
    for i, (name, plan, v, col, mult, y) in enumerate(rows):
        g = ease(prog(t, 0.25 + i * 0.25, 1.3 + i * 0.25)) * out
        text(d, (60, y + 4), name, "ExtraBold", 26, col, ha)
        text(d, (60, y + 38), plan, "Medium", 16, MUTED, ha)
        w = maxw * v / maxv * g
        bar(d, x0, y, w, 70, fade(col, out))
        if g > 0.02:
            text(d, (x0 + w + 14, y + 35), money(v * g), "ExtraBold", 28, TXT, out, anchor="lm")
        if mult:
            pill(d, 1110, y + 35, mult, col, prog(t, 1.6 + i * 0.2, 1.9 + i * 0.2) * out, 26)
    v = prog(t, 2.5, 2.8) * out
    text(d, (W / 2, 572), "Same ~5–6× gap on the $100 and $20 plans too.", "Bold", 22, GOLD, v, anchor="mm")

@scene(2.6)
def s_cut(img, d, t, T):
    out = 1 - prog(t, T - 0.2, T)
    ha = prog(t, 0, 0.3) * out
    header(d, "MEANWHILE · SEPTEMBER 29, 2026", "OpenAI just halved its $200 plan", ha,
           "ChatGPT Pro 200, API-equivalent value per month — before vs after the cut")
    x0, maxw, maxv = 300, 520, 6000
    rows = [("GPT-6 Astra", 5734, 2897, "−49%", 230), ("GPT-6.1 Sol", 5904, 2084, "−65%", 370)]
    for i, (n, before, after, pct, y) in enumerate(rows):
        text(d, (60, y + 20), n, "ExtraBold", 26, OAI, ha)
        text(d, (60, y + 54), "was " + money(before), "Medium", 16, MUTED, ha)
        g = ease(prog(t, 0.15, 0.45)) * out
        s = ease(prog(t, 0.6 + i * 0.15, 1.3 + i * 0.15))
        full = maxw * before / maxv * g
        now = maxw * (before - (before - after) * s) / maxv * g
        if s > 0:
            d.rounded_rectangle([x0, y, x0 + full, y + 80], radius=8, outline=fade(RED, out * 0.9), width=2)
            for k in range(int(x0 + now), int(x0 + full), 14):
                d.line([(k, y + 78), (min(k + 30, x0 + full - 4), y + 2 + max(0, k + 30 - (x0 + full - 4)) * 76 / 30)], fill=fade((90, 40, 40), out), width=4)
        bar(d, x0, y, now, 80, fade(OAI, out))
        if g > 0.02:
            text(d, (x0 + full + 16, y + 40), money(before - (before - after) * s), "ExtraBold", 30, TXT, out, anchor="lm")
        pa = prog(t, 1.35 + i * 0.15, 1.6 + i * 0.15) * out
        if pa > 0:
            text(d, (1140, y + 40), pct, "Black", 34, RED, pa, anchor="rm")
    v = prog(t, 1.7, 1.95) * out
    text(d, (60, 530), "Same price, half the usage.", "Bold", 24, GOLD, v)

@scene(2.3)
def s_outro(img, d, t, T):
    a1 = prog(t, 0.0, 0.3)
    a2 = prog(t, 0.3, 0.55)
    a3 = prog(t, 0.6, 0.85)
    sc = ease_back(prog(t, 0.0, 0.4))
    size = max(8, int(150 * sc))
    text(d, (W / 2, 220), "~5×", "Black", size, ANT, a1, anchor="mm")
    text(d, (W / 2, 335), "more AI per dollar on Claude", "ExtraBold", 40, TXT, a2, anchor="mm")
    text(d, (W / 2, 410), "Sonnet $12.5K · Opus $11.7K · GPT-6.1 Sol $2.1K  of API value / month on $200", "Medium", 20, MUTED, a3, anchor="mm")
    text(d, (W / 2, 442), "28.6B Opus tokens vs 10.2B Sol tokens  ·  Fable 5.1 on top", "Medium", 20, MUTED, a3, anchor="mm")
    text(d, (W / 2, 530), "Anthropic mogs.", "Black", 38, GOLD, prog(t, 0.95, 1.2), anchor="mm")

# ---------------------------------------------------------------- render
total = sum(d for d, _ in SCENES)
n = int(round(total * FPS))
print("frames", n, "seconds", total)
for fi in range(n):
    gt = fi / FPS
    acc = 0
    for dur, fn in SCENES:
        if gt < acc + dur or fn is SCENES[-1][1]:
            break
        acc += dur
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    fn(img, d, gt - acc, dur)
    footer(d)
    # progress bar
    d.rectangle([0, H - 4, W * (fi + 1) / n, H], fill=ANT)
    img.save(os.path.join(OUT, f"f{fi:04d}.png"))
