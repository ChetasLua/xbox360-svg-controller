"""'$200 a month. Here's your receipt.' — every plan costs the same, prints at the same speed,
one line per $500 of API-equivalent value (SemiAnalysis, Oct 2026). Usage: python3 receipt.py <fps> <outdir>"""
import math, os, sys
from PIL import Image, ImageDraw, ImageFont

FPS = int(sys.argv[1]) if len(sys.argv) > 1 else 30
OUT = sys.argv[2] if len(sys.argv) > 2 else "rc_frames"
os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))

W, H, S = 1080, 1350, 2
BG = (22, 22, 21)
INK = (240, 238, 232)
MUTED = (140, 138, 132)
PAPER = (250, 249, 244)
PINK = (40, 40, 38)          # receipt text
PGRAY = (150, 148, 140)
STAMP = (206, 62, 50)
PRINTER = (58, 58, 55)
OAI = (16, 163, 127)
OPUS = (217, 119, 87)
SONNET = (232, 170, 70)
FABLE = (196, 96, 58)

_fc = {}
def font(kind, size):
    k = (kind, size)
    if k not in _fc:
        p = {"bold": os.path.join(HERE, "fonts/Inter-Bold.otf"),
             "semi": os.path.join(HERE, "fonts/Inter-SemiBold.otf"),
             "med": os.path.join(HERE, "fonts/Inter-Medium.otf"),
             "mono": "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
             "monob": "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf"}[kind]
        _fc[k] = ImageFont.truetype(p, int(size * S))
    return _fc[k]

def T(d, xy, s, kind, size, col, anchor="la"):
    d.text((xy[0] * S, xy[1] * S), s, font=font(kind, size), fill=col, anchor=anchor)

def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))

PER_LINE = 500.0
LH = 30            # px per printed line
HEAD = 64          # receipt header block
SLOT_Y = 300

class Lane:
    def __init__(self, cx, w, name, plan, col, cap, mult, note=None):
        self.cx, self.w, self.name, self.plan, self.col = cx, w, name, plan, col
        self.cap, self.mult, self.note = cap, mult, note

ACTS = [
    dict(dur=4.2, t0=0.3, rate=1260.0, title="Flagships",
         lanes=[Lane(290, 400, "GPT-6 Astra", "CHATGPT PRO $200", OAI, 2897, 14.5),
                Lane(790, 400, "Fable 5.1", "CLAUDE MAX $200", FABLE, 2485, 12.4, "ONLY USED 50% OF PLAN")],
         captions=[(0.0, "Same $200. Print the receipt."),
                   (2.35, "Flagships: basically even…"),
                   (3.0, "…and Fable only used half your plan.")]),
    dict(dur=10.2, t0=0.3, rate=1560.0, title="Daily drivers",
         lanes=[Lane(190, 300, "GPT-6.1 Sol", "CHATGPT PRO $200", OAI, 2084, 10.4),
                Lane(540, 300, "Opus 5.5", "CLAUDE MAX $200", OPUS, 11726, 58.6),
                Lane(890, 300, "Sonnet 5.5", "CLAUDE MAX $200", SONNET, 12529, 62.6)],
         captions=[(0.0, "Daily drivers. Same $200."),
                   (1.75, "ChatGPT's receipt is done."),
                   (3.4, "Claude's is still printing."),
                   (8.5, "5.6× longer on Opus. 6× on Sonnet.")]),
]
FADE = 0.15

def zigzag_bottom(x0, x1, y, tooth=10):
    pts = [(x1, y)]
    x = x1
    up = True
    while x > x0:
        x = max(x0, x - tooth / 2)
        pts.append((x, y + (0 if up else tooth * 0.6)))
        up = not up
    return pts

def draw_stamp(img, cx, cy, text, sub, a):
    if a <= 0:
        return
    sc = 1.0 + 0.6 * (1 - clamp(a / 0.6))   # slam in
    alpha = int(235 * clamp(a / 0.4))
    w, h = 210, 78
    layer = Image.new("RGBA", (int(w * S * 1.0), int(h * S * 1.0)), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle([3 * S, 3 * S, (w - 3) * S, (h - 3) * S], radius=8 * S, outline=STAMP + (alpha,), width=4 * S)
    ld.text((w / 2 * S, 30 * S), text, font=font("monob", 30), fill=STAMP + (alpha,), anchor="mm")
    ld.text((w / 2 * S, 58 * S), sub, font=font("monob", 13), fill=STAMP + (alpha,), anchor="mm")
    layer = layer.resize((int(layer.width * sc), int(layer.height * sc)), Image.BICUBIC)
    layer = layer.rotate(-8, resample=Image.BICUBIC, expand=True)
    img.paste(layer, (int(cx * S - layer.width / 2), int(cy * S - layer.height / 2)), layer)

def render(act, t):
    img = Image.new("RGB", (W * S, H * S), BG)
    d = ImageDraw.Draw(img)
    T(d, (60, 46), "$200 a month.", "bold", 50, INK)
    T(d, (60, 104), "Here's your receipt.", "bold", 50, MUTED)
    for ln in act["lanes"]:
        v = clamp(act["rate"] * (t - act["t0"]), 0, ln.cap)
        done_t = act["t0"] + ln.cap / act["rate"]
        done = t >= done_t
        cx, w = ln.cx, ln.w
        x0, x1 = cx - w / 2, cx + w / 2
        # header
        T(d, (cx, 178), ln.name, "bold", 30, ln.col, "ma")
        T(d, (cx, 218), "${:,.0f}".format(v), "monob", 34, INK, "ma")
        if done:
            T(d, (cx, 262), ln.note or f"{ln.mult:.1f}× WHAT YOU PAID", "mono", 15, ln.col if ln.note else MUTED, "ma")
        # paper
        n_lines = v / PER_LINE
        plen = HEAD + (math.ceil(n_lines - 1e-9) * LH + 10 if done else n_lines * LH)
        if t >= act["t0"] - 0.05:
            py0, py1 = SLOT_Y, SLOT_Y + plen
            d.rectangle([x0 * S, py0 * S, x1 * S, py1 * S], fill=PAPER)
            zz = zigzag_bottom(x0, x1, py1)
            d.polygon([(px * S, py * S) for px, py in [(x0, py1 - 1)] + zz[::-1] + [(x1, py1 - 1)]], fill=PAPER)
            # receipt header
            T(d, (cx, SLOT_Y + 14), ln.plan, "monob", 15, PINK, "ma")
            T(d, (cx, SLOT_Y + 36), "-" * int((w - 30) / 9.0), "mono", 15, PGRAY, "ma")
            full = int(n_lines)
            for i in range(full):
                y = SLOT_Y + HEAD + i * LH
                T(d, (x0 + 14, y + 4), f"#{i+1:02d} API VALUE", "mono", 15, PINK)
                T(d, (x1 - 14, y + 4), "$500.00", "mono", 15, PINK, "ra")
            rem = ln.cap - full * PER_LINE
            if done and rem > 0.5:
                y = SLOT_Y + HEAD + full * LH
                T(d, (x0 + 14, y + 4), f"#{full+1:02d} API VALUE", "mono", 15, PINK)
                T(d, (x1 - 14, y + 4), "${:,.2f}".format(rem), "mono", 15, PINK, "ra")
        # printer on top of paper
        d.rounded_rectangle([(x0 - 14) * S, (SLOT_Y - 18) * S, (x1 + 14) * S, (SLOT_Y + 4) * S], radius=8 * S, fill=PRINTER)
        d.rectangle([(x0 - 2) * S, (SLOT_Y - 2) * S, (x1 + 2) * S, (SLOT_Y + 2) * S], fill=(20, 20, 19))
        if not done and t >= act["t0"]:
            blink = (int(t * 6) % 2 == 0)
            d.ellipse([(x1 + 2) * S, (SLOT_Y - 11) * S, (x1 + 8) * S, (SLOT_Y - 5) * S], fill=(110, 220, 120) if blink else PRINTER)
        if done:
            sy = SLOT_Y + HEAD + max(0, (math.ceil(ln.cap / PER_LINE) * LH)) - 40
            draw_stamp(img, cx + 10, max(SLOT_Y + 70, sy), "PAID $200", "THANK YOU", t - done_t)
    cap = act["captions"][0][1]
    for ts, c in act["captions"]:
        if t >= ts:
            cap = c
    T(d, (60, 1218), cap, "semi", 38, INK)
    T(d, (60, 1278), "1 line = $500 of API-equivalent value / month · agentic workload · SemiAnalysis, Oct 2026",
      "med", 17, MUTED)
    return img

def main():
    total = sum(a["dur"] for a in ACTS)
    n = int(round(total * FPS))
    bgimg = Image.new("RGB", (W, H), BG)
    for fi in range(n):
        gt = fi / FPS
        base = 0.0
        for i, a in enumerate(ACTS):
            if gt < base + a["dur"] or i == len(ACTS) - 1:
                idx = i
                break
            base += a["dur"]
        act, t = ACTS[idx], gt - base
        img = render(act, t).resize((W, H), Image.LANCZOS)
        al = 1.0
        if idx > 0 and t < FADE:
            al = t / FADE
        if idx < len(ACTS) - 1 and t > act["dur"] - FADE:
            al = (act["dur"] - t) / FADE
        if al < 1.0:
            img = Image.blend(bgimg, img, max(0.0, al))
        img.save(os.path.join(OUT, f"f{fi:04d}.png"))
    print("frames", n, "seconds", total)

if __name__ == "__main__":
    main()
