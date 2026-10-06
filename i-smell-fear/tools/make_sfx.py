"""Procedural sound effects for the video (numpy only). Writes audio/sfx/<name>.wav (48 kHz stereo)."""
import os, subprocess
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "audio/sfx")
SR = 48000
rng = np.random.default_rng(7)

def T(d): return np.arange(int(d*SR))/SR
def noise(d): return rng.standard_normal(int(d*SR)).astype(np.float64)
def expdec(d, tau): return np.exp(-T(d)/tau)
def sweep_phase(f0, f1, d, curve="exp"):
    t = T(d)
    f = f0*(f1/f0)**(t/d) if curve == "exp" else f0 + (f1-f0)*t/d
    return 2*np.pi*np.cumsum(f)/SR
def square(ph, duty=0.5): return np.where((ph/(2*np.pi)) % 1 < duty, 1.0, -1.0)
def saw(ph): return 2*((ph/(2*np.pi)) % 1) - 1

def onepole_lp(x, fc):
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    a = np.exp(-2*np.pi*fc/SR)
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)):
        s = (1-a[i])*x[i] + a[i]*s; y[i] = s
    return y
def lp(x, fc, order=2):
    for _ in range(order): x = onepole_lp(x, fc)
    return x
def hp(x, fc, order=1):
    for _ in range(order): x = x - onepole_lp(x, fc)
    return x
def bp(x, lo, hi): return lp(hp(x, lo, 2), hi, 2)

def reverb(x, dur=0.6, wet=0.25, bright=4000):
    ir = noise(dur) * np.exp(-T(dur)/(dur/5))
    ir = lp(ir, bright, 1); ir /= np.sqrt(np.sum(ir**2)) + 1e-9
    n = len(x) + len(ir)
    y = np.fft.irfft(np.fft.rfft(x, n)*np.fft.rfft(ir, n), n)[:n]
    out = np.zeros(n); out[:len(x)] += x
    return out*(1-wet) + y*wet*0.9

def pad(x, d):
    n = int(d*SR)
    return np.concatenate([x, np.zeros(max(0, n-len(x)))])[:max(n, len(x))]

def at(dst, src, t):
    i = int(t*SR); j = min(len(dst), i+len(src)); dst[i:j] += src[:j-i]; return dst

def stereo(x, pan=0.0, width=0.0):
    l = x*np.sqrt(0.5*(1-pan)); r = x*np.sqrt(0.5*(1+pan))
    if width > 0:
        d = int(0.011*SR); r = np.concatenate([np.zeros(d), r])[:len(x)]*(1-width) + r*width
    return np.stack([l, r], 1)

def norm(x, peak=0.9):
    m = np.max(np.abs(x)) + 1e-9
    return x*(peak/m)

def write(name, x):
    if x.ndim == 1: x = stereo(x)
    fade = int(0.004*SR); x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    x = norm(x)
    subprocess.run(["ffmpeg","-v","error","-y","-f","f32le","-ar",str(SR),"-ac","2","-i","-","-c:a","pcm_s16le",
                    os.path.join(OUT, name + ".wav")], input=x.astype(np.float32).tobytes(), check=True)

def bell(f, d, partials=((1,1,.8),(2.0,.5,.5),(2.76,.35,.35),(4.07,.2,.25),(5.4,.1,.15))):
    t = T(d); y = np.zeros_like(t)
    for r, a, tau in partials: y += a*np.sin(2*np.pi*f*r*t)*np.exp(-t/tau)
    return y*(1-np.exp(-t/0.002))

def chip(notes, step, tail=0.25, duty=0.5, vib=0.0):
    out = np.zeros(int((len(notes)*step + tail)*SR))
    for k, f in enumerate(notes):
        d = step if k < len(notes)-1 else step + tail
        t = T(d); ph = 2*np.pi*f*t + (vib*np.sin(2*np.pi*6*t)*f/6 if k == len(notes)-1 else 0)
        env = np.minimum(1, t/0.004)*np.exp(-t/(d*0.9 if k == len(notes)-1 else 1))
        at(out, 0.35*square(ph, duty)*env, k*step)
    return lp(out, 7000, 1)

os.makedirs(OUT, exist_ok=True)

# --- glitch: stuttered digital bursts
y = np.zeros(int(0.32*SR)); t0 = 0.0
while t0 < 0.28:
    d = rng.uniform(0.015, 0.045); kind = rng.integers(3)
    if kind == 0: seg = 0.5*square(2*np.pi*rng.uniform(150, 1800)*T(d))
    elif kind == 1: seg = np.round(noise(d)*3)/3*0.5
    else: seg = 0.4*square(sweep_phase(rng.uniform(300, 900), rng.uniform(1500, 4000), d))
    at(y, seg*np.hanning(len(seg))**0.2, t0); t0 += d + rng.uniform(0, 0.015)
write("glitch", stereo(y, 0, 0.6))

# --- whoosh / whip / zoom
def whoosh(d, f0, f1, f2, pan0=-0.6, pan1=0.6):
    t = T(d); x = noise(d)
    fc = np.where(t < d*0.55, f0*(f1/f0)**(t/(d*0.55)), f1*(f2/f1)**((t-d*0.55)/(d*0.45)))
    y = bp(x, fc*0.5, fc*1.6)
    y *= np.sin(np.pi*np.clip(t/d, 0, 1))**2
    pan = np.linspace(pan0, pan1, len(y))
    return np.stack([y*np.sqrt(0.5*(1-pan)), y*np.sqrt(0.5*(1+pan))], 1)
write("whoosh", whoosh(0.5, 300, 2600, 700))
write("whip", whoosh(0.26, 900, 5200, 2200, -0.9, 0.9))
z = whoosh(0.7, 200, 1800, 400, -1, 1)
zt = T(0.7); engine = 0.25*saw(sweep_phase(260, 120, 0.7))*np.sin(np.pi*zt/0.7)**3
z[:, 0] += lp(engine, 2500)*np.linspace(1, 0.2, len(zt)); z[:, 1] += lp(engine, 2500)*np.linspace(0.2, 1, len(zt))
write("zoom", z)

# --- pops
t = T(0.14); write("pop", np.sin(sweep_phase(320, 980, 0.14))*np.exp(-t/0.035) + 0.3*noise(0.14)*np.exp(-t/0.003))
t = T(0.2); write("pop2", np.sin(sweep_phase(180, 760, 0.2))*np.minimum(1, t/0.01)*np.exp(-t/0.06))

# --- dings
write("ding", reverb(bell(1568, 1.0), 0.6, 0.2))
write("ding_hi", reverb(bell(2093, 1.0), 0.6, 0.2))

# --- stamp: heavy rubber stamp on paper
d = 0.8; t = T(d)
thump = np.sin(sweep_phase(110, 42, d))*np.exp(-t/0.16)
slap = bp(noise(d), 1200, 5000)*np.exp(-t/0.025)
thock = np.sin(2*np.pi*230*t)*np.exp(-t/0.05)
y = np.tanh(1.6*(1.0*thump + 0.55*slap + 0.4*thock))
write("stamp", stereo(reverb(y, 0.5, 0.18), 0, 0.3))

# --- siren (hi-lo, megaphone colored)
d = 1.05; t = T(d)
f = np.where((t // 0.21) % 2 == 0, 960.0, 770.0)
f = onepole_lp(f, 30)  # glide between tones
ph = 2*np.pi*np.cumsum(f*(1 + 0.004*np.sin(2*np.pi*7*t)))/SR
y = sum(np.sin(k*ph)/k for k in range(1, 7))
y = bp(y, 450, 3200)*np.minimum(1, t/0.05)*np.minimum(1, (d-t)/0.25)
write("siren", stereo(np.tanh(1.5*y), 0, 0.5))

# --- slam / impact
d = 1.1; t = T(d)
sub = np.sin(sweep_phase(62, 30, d))*np.exp(-t/0.45)
crack = lp(noise(d), 5000)*np.exp(-t/0.05)
mid = np.sin(2*np.pi*150*t)*np.exp(-t/0.12)
write("slam", stereo(reverb(np.tanh(1.8*(sub + 0.6*crack + 0.5*mid)), 0.8, 0.22), 0, 0.4))

# --- punch / slap
d = 0.32; t = T(d)
write("punch", np.tanh(2*(np.sin(sweep_phase(140, 55, d))*np.exp(-t/0.07) + 0.7*lp(noise(d), 2200)*np.exp(-t/0.035))))
d = 0.26; t = T(d)
write("slap", np.tanh(1.5*(bp(noise(d), 1800, 7000)*np.exp(-t/0.02) + 0.6*np.sin(2*np.pi*180*t)*np.exp(-t/0.04))))

# --- ka-ching
d = 1.0; t = T(d)
ka = bp(noise(d), 1500, 6000)*np.exp(-t/0.012)
ching = bell(2637, d, ((1,1,.55),(1.33,.7,.45),(2.41,.4,.3),(3.9,.25,.2)))
ching2 = np.roll(bell(3520, d, ((1,1,.5),(1.5,.5,.35),(2.6,.3,.2))), int(0.06*SR))
write("kaching", stereo(reverb(0.8*ka + 0.6*ching + 0.5*ching2, 0.5, 0.15), 0, 0.5))

# --- beeps (start lights)
t = T(0.22); write("beep", lp(0.6*square(2*np.pi*880*t, 0.5), 3500)*np.minimum(1, t/0.004)*np.minimum(1, (0.22-t)/0.03))
t = T(0.5); write("beep_go", lp(0.6*square(2*np.pi*1760*t, 0.5), 5000)*np.minimum(1, t/0.004)*np.exp(-t/0.35))

# --- 8-bit stuff
C6, E6, G6, C7, G5 = 1046.5, 1318.5, 1568.0, 2093.0, 784.0
write("fanfare_s", chip([C6, E6, G6, C7], 0.055, 0.22))
write("fanfare", stereo(chip([G5, C6, E6, G6, E6, G6], 0.085, 0.0) if False else
                        np.concatenate([chip([G5, C6, E6, G6], 0.09, 0.0), chip([C7], 0.0, 0.45, 0.25, vib=8)]), 0, 0.5))
write("coin", chip([988, 1319], 0.065, 0.28, 0.5))
write("bling", stereo(reverb(chip([2093, 2637, 3136, 4186], 0.04, 0.3, 0.25), 0.5, 0.25), 0, 0.6))
sad = np.zeros(int(1.1*SR))
for k, (f, d) in enumerate([(392, .2), (370, .2), (349, .2), (330, .5)]):
    tt = T(d); ph = 2*np.pi*f*tt + (np.sin(2*np.pi*5*tt)*3 if k == 3 else 0)
    at(sad, lp(0.35*square(ph, 0.3), 2500)*np.minimum(1, tt/0.01)*np.minimum(1, (d-tt)/0.05), k*0.2)
write("sad", sad)

# --- bonk (cartoon head hits wall)
d = 0.6; t = T(d)
y = np.sin(sweep_phase(620, 170, 0.16, "exp")); y = pad(y, d)*np.exp(-t/0.12)
wood = bp(noise(d), 700, 2400)*np.exp(-t/0.018)
stars = sum(0.12*np.sin(2*np.pi*f*t)*np.exp(-np.maximum(0, t-o)/0.08)*(t > o) for f, o in [(3136, .12), (3951, .2), (4699, .28)])
write("bonk", np.tanh(1.5*(y + 0.8*wood)) + stars)

# --- snip (scissors)
d = 0.3; y = np.zeros(int(d*SR))
for o in (0.0, 0.075):
    tt = T(0.05); at(y, hp(noise(0.05), 5000, 2)*np.exp(-tt/0.006) + 0.4*np.sin(2*np.pi*4600*tt)*np.exp(-tt/0.02), o)
write("snip", y)

# --- nitro boost
d = 0.9; t = T(d)
roar = lp(noise(d), 300*(10**(t/d)))*(np.sin(np.pi*np.clip(t/d, 0, 1))**0.7)
engine = 0.4*saw(sweep_phase(90, 260, d))*(1 + 0.3*np.sin(2*np.pi*28*t))*np.sin(np.pi*t/d)
write("nitro", stereo(np.tanh(1.5*(roar + lp(engine, 3000))), 0, 0.5))

# --- dust puff
d = 0.7; t = T(d)
write("dust", lp(noise(d), 900)*np.sin(np.pi*np.clip(t/d, 0, 1))**2*np.exp(-t/0.3))

# --- big arcade reset button
d = 0.7; t = T(d)
thunk = np.sin(sweep_phase(120, 60, d))*np.exp(-t/0.07)
click = bp(noise(d), 2500, 7000)*np.exp(-t/0.006)
zap = (0.5*square(2*np.pi*60*t, 0.3) + 0.5*hp(noise(d), 2000))*np.exp(-np.maximum(0, t-0.03)/0.12)*(t > 0.03)
boop = np.sin(sweep_phase(650, 180, d))*np.exp(-t/0.16)
write("button", np.tanh(1.4*(thunk + 0.7*click + 0.25*lp(zap, 5000) + 0.35*boop)))

# --- CRT power down
d = 0.85; t = T(d)
write("powerdown", np.sin(sweep_phase(1100, 55, d))*np.exp(-t/0.35)*np.minimum(1, t/0.01) + 0.1*hp(noise(d), 4000)*np.exp(-t/0.05))

# --- final boom
d = 2.4; t = T(d)
sub = np.sin(sweep_phase(72, 26, 1.6)); sub = pad(sub, d)*np.exp(-t/0.9)
crack = bp(noise(d), 900, 7000)*np.exp(-t/0.07)
body = lp(noise(d), 400)*np.exp(-t/0.35)
write("boom", stereo(reverb(np.tanh(2.2*(sub + 0.5*crack + 0.6*body)), 1.4, 0.25), 0, 0.5))
print("sfx:", sorted(os.listdir(OUT)))
