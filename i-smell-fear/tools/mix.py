"""Final soundtrack: ElevenLabs v4 voices + ElevenLabs Music bed + procedural SFX, all placed from timeline.json.

Music: plays from musicOffset so its drop lands on the announcer's "GO!", tape-stops when the
panic ends, stays silent for Clawd's line, then the drop is reprised under the end card.
Writes audio/mix.wav, audio/mix.m4a (video) and audio/mix.mp3 (HTML players).
"""
import json, os, subprocess
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
TL = json.load(open(os.path.join(ROOT, "timeline.json")))
E = TL["events"]
N = int(TL["duration"]*SR)

def load(path, ch=2):
    out = subprocess.run(["ffmpeg","-v","error","-i",path,"-ac",str(ch),"-ar",str(SR),"-f","f32le","-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).astype(np.float64).reshape(-1, ch)

def db(x): return 10**(x/20)
def rms(x): return np.sqrt(np.mean(x**2) + 1e-12)

def onepole(x, fc):
    a = np.exp(-2*np.pi*fc/SR)
    y = np.empty_like(x); s = np.zeros(x.shape[1:])
    for i in range(len(x)):
        s = (1-a)*x[i] + a*s; y[i] = s
    return y

def place(dst, src, t, gain=1.0):
    i = int(round(t*SR))
    if i >= len(dst): return
    j = min(len(dst), i+len(src))
    dst[i:j] += src[:j-i]*gain

# ---------------- music ----------------
music = load(os.path.join(ROOT, "audio/music/music_raw.mp3"))
mus = np.zeros((N, 2))
off, stop, hit = TL["musicOffset"], E["tapeStop"], E["finalHit"]
a_from = int(off*SR); a_to = int(stop*SR)
src0 = 0 if off >= 0 else int(-off*SR)
seg = music[src0: src0 + (a_to - max(a_from, 0))]
mus[max(a_from, 0): max(a_from, 0) + len(seg)] = seg
# the build is very quiet: lift it (+15 dB tapering to 0 at the drop) so the setup has a tension bed
def build_gain(mt):
    return db(15 * np.clip((6.15 - mt) / 1.6, 0, 1))
mt = (np.arange(N)/SR - off)
mus *= np.where((mt >= 0) & (mt < 6.3), build_gain(mt), 1.0)[:, None]
# cold open: loop the first two bars of the build so the beat grid runs from the very start
pre = music[:int(8*TL["beat"]*SR)] * build_gain(0)
pre_at = off - 8*TL["beat"]
i0 = int(pre_at*SR); xf = int(0.05*SR)
pre = pre.copy(); pre[:xf] *= np.linspace(0, 1, xf)[:, None]; pre[-xf:] *= np.linspace(1, 0, xf)[:, None]
lo = max(0, i0); mus[lo: i0 + len(pre)] += pre[lo - i0:]
# tape stop: playback rate falls to zero over 0.6 s
Ts = 0.6; n = int(Ts*SR); tau = np.arange(n)/SR
rate = (1 - tau/Ts)**1.6
pos = (stop - off)*SR + np.cumsum(rate)
i0 = np.floor(pos).astype(int); fr = (pos - i0)[:, None]
i0 = np.clip(i0, 0, len(music)-2)
ts = music[i0]*(1-fr) + music[i0+1]*fr
ts *= np.linspace(1, 0, n)[:, None]**0.5
ts = onepole(ts, 2200)
mus[a_to:a_to+n] = ts[:N-a_to]
# end-card reprise of the drop
rep_src = int(TL["musicDrop"]*SR) - int(0.02*SR)
rep = music[rep_src: rep_src + (N - int(hit*SR))].copy()
fo = int(0.9*SR); rep[-fo:] *= np.linspace(1, 0, fo)[:, None]**1.5
mus[int(hit*SR): int(hit*SR)+len(rep)] = rep
loud = music[int((TL["musicDrop"]+0.5)*SR): int((TL["musicDrop"]+12)*SR)]
mus *= db(-17.5) / rms(loud)

# ---------------- voices ----------------
vo = np.zeros((N, 2))
for L in TL["lines"]:
    x = load(os.path.join(ROOT, f"audio/vo/{L['id']}.wav"), 1)[:, 0]
    x = x - onepole(x[:, None], 85)[:, 0]                      # high-pass rumble
    act = x[np.abs(x) > 0.02]
    x *= db(-16.5) / rms(act)                                   # level match the active speech
    x = np.tanh(x*1.6)/1.6                                      # gentle saturation / glue
    if L["speaker"] == "clawd":                                 # cinematic echo on the punchline
        echo = np.zeros(len(x) + int(1.4*SR))
        echo[:len(x)] += x
        for k in range(1, 4):
            d = int(0.29*k*SR); echo[d:d+len(x)] += x*(0.33**k)
        x = echo
    place(vo, np.stack([x, x], 1), L["start"])

# duck the music under the voices (smoothed envelope, fast attack / slow release)
env = np.abs(vo[:, 0])
blk = int(0.01*SR); m = len(env)//blk
e = env[:m*blk].reshape(m, blk).max(1)
g = np.ones(m); s = 0.0
for i in range(m):
    target = 1.0 if e[i] > 0.03 else 0.0
    s += (target - s)*(0.6 if target > s else 0.045)
    g[i] = 1 - 0.55*s
duck = np.repeat(g, blk); duck = np.concatenate([duck, np.full(N - len(duck), duck[-1])])
# let the drop hit full-force on "GO!"
gw = slice(int((TL["go"] - 0.04)*SR), int((TL["go"] + 0.45)*SR))
duck[gw] = np.maximum(duck[gw], np.linspace(1, 1, gw.stop - gw.start))
mus *= duck[:, None]

# ---------------- sfx ----------------
fx = np.zeros((N, 2))
cache = {}
for c in TL["cues"]:
    if c["sfx"] not in cache:
        cache[c["sfx"]] = load(os.path.join(ROOT, "audio/sfx", c["sfx"] + ".wav"))
    s = cache[c["sfx"]].copy()
    p = c["pan"]; s[:, 0] *= np.sqrt(0.5*(1-p))*1.414; s[:, 1] *= np.sqrt(0.5*(1+p))*1.414
    place(fx, s, c["t"], db(c["gain"]))

mix = mus + vo + fx
mix = mix - onepole(mix, 28)                                    # master high-pass: phones cannot play sub rumble anyway
if os.environ.get("STEMS"):
    np.savez_compressed(os.environ["STEMS"], mus=mus.astype(np.float32), vo=vo.astype(np.float32), fx=fx.astype(np.float32))
# ---------------- master: peak limiter ----------------
thr = db(-1.2)
peak = np.max(np.abs(mix), axis=1)
blk = int(0.002*SR); m = len(peak)//blk + 1
pk = np.pad(peak, (0, m*blk - len(peak))).reshape(m, blk).max(1)
gain = np.minimum(1, thr/(pk + 1e-9))
look = 3  # 6 ms look-ahead
gmin = np.array([gain[max(0, i-0):i+look].min() for i in range(m)])
sm = np.ones(m); s = 1.0
for i in range(m):
    s = gmin[i] if gmin[i] < s else s + (gmin[i]-s)*0.02
    sm[i] = s
G = np.repeat(sm, blk)[:N]
mix *= G[:, None]
mix = np.clip(mix, -0.999, 0.999)
print(f"mix rms {20*np.log10(rms(mix)):.1f} dBFS, peak {20*np.log10(np.max(np.abs(mix))):.1f} dBFS, min limiter gain {20*np.log10(sm.min()):.1f} dB")

raw = mix.astype(np.float32).tobytes()
wav = os.path.join(ROOT, "audio/mix.wav"); m4a = os.path.join(ROOT, "audio/mix.m4a"); mp3 = os.path.join(ROOT, "audio/mix.mp3")
subprocess.run(["ffmpeg","-v","error","-y","-f","f32le","-ar",str(SR),"-ac","2","-i","-","-c:a","pcm_s16le",wav], input=raw, check=True)
subprocess.run(["ffmpeg","-v","error","-y","-i",wav,"-c:a","aac","-b:a","192k",m4a], check=True)     # for the MP4
subprocess.run(["ffmpeg","-v","error","-y","-i",wav,"-c:a","libmp3lame","-b:a","192k",mp3], check=True)  # for the HTML players (plays in every browser)
print("wrote", wav, m4a, mp3)
