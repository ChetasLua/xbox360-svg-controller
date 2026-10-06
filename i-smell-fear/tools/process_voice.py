"""Tighten the ElevenLabs v4 voice takes and build the shared timeline.

Inputs : audio/vo/L{1..9}_raw.mp3  (chosen takes)
Outputs: audio/vo/L{1..9}.wav       (gap-compressed, tempo-adjusted)
         timeline.json              (single source of truth for mix + animation)
         src/timeline.js            (same data as a global for the browser)

Word timings come from an ElevenLabs Scribe pass over the concatenated takes.
"""
import json, os, subprocess
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
BPM = 140.0
BEAT = 60.0 / BPM
MUSIC_DROP = 6.3725     # music-time of the big hit right before the drop (beat grid phase 0.3725)
DURATION = 30.0

# Scribe output on the concatenation (absolute seconds) and each take's offset in it.
OFFSETS = {"L1": 0.0, "L2": 4.04, "L3": 6.4, "L4": 12.04, "L5": 16.32,
           "L6": 21.64, "L7": 27.68, "L8": 32.84, "L9": 37.44}
SCRIBE = [("The",0.2,0.3),("real",0.48,0.74),("story",0.94,1.42),("is",1.98,2.14),("this",2.24,2.46),("one.",2.52,2.86),
 ("Chart",4.24,4.5),("crime.",4.6,5.18),
 ("Fair",6.6,6.76),("fight?",6.9,7.2),("Opus",7.6,7.88),("beats",7.94,8.18),("Astra,",8.28,8.66),("and",9.04,9.16),("it's",9.22,9.38),("forty-four",9.44,9.86),("percent",9.92,10.26),("cheaper.",10.32,10.78),
 ("Intelligence,",12.16,12.88),("tokens,",13.2,13.66),("speed,",14.0,14.38),("go.",14.7,15.02),
 ("Opus,",16.46,16.82),("fifty-eight.",17.16,17.84),("OpenAI's",18.38,18.96),("best,",19.02,19.36),("fifty-three.",19.8,20.44),
 ("Two",21.74,21.9),("hundred",21.96,22.28),("bucks?",22.44,22.84),("Eleven",23.18,23.6),("grand",23.74,24.0),("of",24.04,24.14),("Claude,",24.2,24.6),("two",24.9,25.12),("grand",25.18,25.4),("of",25.46,25.52),("OpenAI.",25.6,26.36),
 ("Fifty",28.26,28.56),("percent",28.66,29.0),("faster",29.16,29.62),("and",30.08,30.18),("still",30.44,30.74),("eating",30.78,31.0),("dust.",31.12,31.54),
 ("Reset.",33.02,33.52),("Reset.",33.86,34.42),("Reset",34.9,35.3),("for",35.36,35.52),("everyone.",35.62,36.22),
 ("I",38.56,38.64),("smell",38.72,39.0),("fear",39.24,39.66)]

# Display text for captions (Scribe drops the shouty caps / punctuation we want on screen).
DISPLAY = {
 "L1": ["The","real","story...","is","THIS","one."],
 "L2": ["CHART","CRIME!"],
 "L3": ["Fair","fight?","Opus","beats","Astra...","and","it's","44%","CHEAPER!"],
 "L4": ["INTELLIGENCE!","TOKENS!","SPEED!","GO!"],
 "L5": ["Opus:","58!","OpenAI's","best?","53."],
 "L6": ["$200","BUCKS?","$11.7K","OF","CLAUDE...","$2.1K","OF","OPENAI!"],
 "L7": ["50%","faster...","and","STILL","eating","dust!"],
 "L8": ["RESET!","RESET!","RESET","FOR","EVERYONE!"],
 "L9": ["I","smell","fear."],
}
# L6 says "Two hundred bucks" (3 words) and "Eleven grand" etc; map spoken words -> display slots.
DISPLAY_MAP = {"L6": [0,0,1,2,2,3,4,5,5,6,7]}

SPEAKER = {"L1":"codex","L2":"announcer","L3":"announcer","L4":"announcer","L5":"announcer",
           "L6":"announcer","L7":"announcer","L8":"codex","L9":"clawd"}

# lead_keep: silence kept before first word (None = keep everything, e.g. a laugh/sniff lives there)
# gaps: max inter-word gap (number) or per-gap list; tempo: pitch-preserving speed-up
CFG = {
 "L1": dict(lead_keep=0.10, gaps=0.36, tail=0.18, tempo=1.00),
 "L2": dict(lead_keep=0.05, gaps=0.20, tail=0.22, tempo=1.00),
 "L3": dict(lead_keep=0.06, gaps=0.16, tail=0.18, tempo=1.12),
 "L4": dict(lead_keep=0.05, gaps=[0.22,0.22,0.28], tail=0.20, tempo=1.10),
 "L5": dict(lead_keep=0.06, gaps=[0.22,0.30,0.16,0.28], tail=0.16, tempo=1.10),
 "L6": dict(lead_keep=0.05, gaps=0.18, tail=0.16, tempo=1.12),
 "L7": dict(lead_keep=None, gaps=0.20, tail=0.16, tempo=1.10),
 "L8": dict(lead_keep=0.08, gaps=0.16, tail=0.15, tempo=1.06),
 "L9": dict(lead_keep=None, gaps=9.0, tail=0.35, tempo=1.00),
}

def load(path):
    out = subprocess.run(["ffmpeg","-v","error","-i",path,"-ac","1","-ar",str(SR),"-f","f32le","-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).copy()

def save_wav(path, x):
    subprocess.run(["ffmpeg","-v","error","-y","-f","f32le","-ar",str(SR),"-ac","1","-i","-",
                    "-c:a","pcm_s16le",path], input=x.astype(np.float32).tobytes(), check=True)

def rms_db(x):
    return 20*np.log10(np.sqrt(np.mean(x**2)) + 1e-9) if len(x) else -120

def words_for(lid):
    off = OFFSETS[lid]
    ids = list(OFFSETS)
    nxt = OFFSETS[ids[ids.index(lid)+1]] if lid != ids[-1] else 1e9
    return [(w, s-off, e-off) for (w, s, e) in SCRIBE if off <= s < nxt]

def compress(x, words, cfg):
    dur = len(x)/SR
    cuts = []
    if cfg["lead_keep"] is not None and words[0][1] > cfg["lead_keep"]:
        cuts.append((0.0, words[0][1]-cfg["lead_keep"]))
    gaps = cfg["gaps"]
    for i in range(len(words)-1):
        mg = gaps[i] if isinstance(gaps, list) else gaps
        e, s = words[i][2], words[i+1][1]
        if s - e > mg:
            a, b = e + mg/2, s - mg/2
            if rms_db(x[int(a*SR):int(b*SR)]) < -34:      # only cut real silence
                cuts.append((a, b))
    tail_end = min(dur, words[-1][2] + cfg["tail"])
    if tail_end < dur:
        cuts.append((tail_end, dur))
    # assemble with 6 ms crossfades
    keep, t = [], 0.0
    for a, b in cuts:
        if a > t: keep.append((t, a))
        t = max(t, b)
    if t < dur: keep.append((t, dur))
    xf = int(0.006*SR)
    out = np.zeros(0, dtype=np.float32)
    for a, b in keep:
        seg = x[int(a*SR):int(b*SR)].copy()
        if len(out) and len(seg) > 2*xf:
            ramp = np.linspace(0, 1, xf, dtype=np.float32)
            out[-xf:] = out[-xf:]*(1-ramp) + seg[:xf]*ramp
            seg = seg[xf:]
        out = np.concatenate([out, seg])
    fade = int(0.03*SR)
    out[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    def remap(tt):
        removed = sum(min(b, tt) - a for a, b in cuts if a < tt)
        return tt - removed
    return out, remap

def tempo(x, f):
    if abs(f-1) < 1e-6: return x
    out = subprocess.run(["ffmpeg","-v","error","-f","f32le","-ar",str(SR),"-ac","1","-i","-",
                          "-af",f"atempo={f}","-f","f32le","-"], input=x.tobytes(),
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).copy()

lines = {}
for lid in OFFSETS:
    raw = load(os.path.join(ROOT, "audio/vo", f"{lid}_raw.mp3"))
    words = words_for(lid)
    cfg = CFG[lid]
    y, remap = compress(raw, words, cfg)
    y = tempo(y, cfg["tempo"])
    save_wav(os.path.join(ROOT, "audio/vo", f"{lid}.wav"), y)
    hop = SR // 30
    env = np.sqrt(np.convolve(y**2, np.ones(hop)/hop, "same")[::hop])
    env = np.clip(env / (np.percentile(env, 95) + 1e-9), 0, 1)
    disp = DISPLAY[lid]
    dmap = DISPLAY_MAP.get(lid, list(range(len(words))))
    ws = []
    for i, (w, s, e) in enumerate(words):
        ws.append(dict(spoken=w, slot=dmap[i], t0=round(remap(s)/cfg["tempo"], 3), t1=round(remap(e)/cfg["tempo"], 3)))
    lines[lid] = dict(id=lid, speaker=SPEAKER[lid], dur=round(len(y)/SR, 3), words=ws, display=disp,
                      env=[round(float(v), 2) for v in env])
    print(f"{lid}: raw {len(raw)/SR:.2f}s -> {len(y)/SR:.2f}s  first {ws[0]['t0']:.2f} last {ws[-1]['t1']:.2f}")

# ---------- placement ----------
def end(lid): return place[lid] + lines[lid]["dur"]
place = {}
place["L1"] = 0.30
place["L2"] = end("L1") - 0.04
place["L3"] = end("L2") + 0.06
go_onset = lines["L4"]["words"][3]["t0"]
place["L4"] = end("L3") + 0.05
GO = place["L4"] + go_onset
place["L5"] = end("L4") + 0.0
place["L6"] = end("L5") + 0.06
place["L7"] = end("L6") + 0.06
place["L8"] = end("L7") + 0.06
fear = lines["L9"]["words"][-1]
tape_stop = end("L8") - 0.05
place["L9"] = tape_stop + 0.30
fear_end = place["L9"] + fear["t1"]
beats = [GO + n*BEAT for n in range(-40, 60)]
final_hit = min(b for b in beats if b >= fear_end + 0.10)
music_offset = GO - MUSIC_DROP

for lid in lines:
    lines[lid]["start"] = round(place[lid], 3)
    for w in lines[lid]["words"]:
        w["at"] = round(place[lid] + w["t0"], 3)
        w["until"] = round(place[lid] + w["t1"], 3)

def wat(lid, i): return lines[lid]["words"][i]["at"]
events = {
  "stamp": wat("L2", 0),
  "fair": wat("L3", 0), "opusBeats": wat("L3", 2), "beats": wat("L3", 3), "fortyFour": wat("L3", 7), "cheaper": wat("L3", 9),
  "intel": wat("L4", 0), "tokens": wat("L4", 1), "speed": wat("L4", 2), "go": GO,
  "r1Opus": wat("L5", 0), "r1_58": wat("L5", 1), "r1OpenAI": wat("L5", 2), "r1_53": wat("L5", 4),
  "r2Bucks": wat("L6", 0), "r2Claude": wat("L6", 3), "r2OpenAI": wat("L6", 7),
  "r3Fifty": wat("L7", 0), "r3And": wat("L7", 3), "r3Dust": wat("L7", 6),
  "reset1": wat("L8", 0), "reset2": wat("L8", 1), "reset3": wat("L8", 2),
  "tapeStop": round(tape_stop, 3), "sniff": round(place["L9"] + 0.08, 3),
  "smellI": wat("L9", 0), "smell": wat("L9", 1), "fear": wat("L9", 2),
  "finalHit": round(final_hit, 3), "end": DURATION,
}
# derived visual beats shared by the animation and the mixer
E = events
r3_start = place["L7"] - 0.04 + 0.12
E.update({
  "cardIn": -0.3, "codexIn": -0.7, "fine52": E["stamp"] - 0.30, "fine58": E["stamp"] - 0.16,
  "vsSlam": E["fair"] - 0.10, "badge": E["r2OpenAI"] + 0.62, "snip": E["r2OpenAI"] + 1.02,
  "r3Start": r3_start, "sonnetFin": r3_start + 1.55, "opusFin": r3_start + 1.55*128/97,
  "flag": place["L8"] - 0.04 + 0.02, "shades": E["sniff"] + 0.78, "beat0": GO,
})
cues = [  # (time, sfx, gain dB, pan -1..1)
  (0.0, "glitch", -12, 0), (0.02, "pop", -12, 0),
  (E["fine52"], "ding", -13, -0.3), (E["fine58"], "ding_hi", -13, 0.3),
  (E["stamp"], "stamp", -2, 0), (E["stamp"], "siren", -12, 0),
  (E["vsSlam"], "slam", -6, 0), (E["beats"], "punch", -5, 0.2), (E["fortyFour"], "slap", -6, 0.3), (E["cheaper"], "kaching", -9, 0.3),
  (place["L4"] - 0.03, "whip", -11, 0),
  (E["intel"], "beep", -10, 0), (E["tokens"], "beep", -10, 0), (E["speed"], "beep", -10, 0), (GO, "beep_go", -8, 0), (GO, "whoosh", -10, 0),
  (E["r1Opus"], "zoom", -12, 0.4), (E["r1_58"], "fanfare_s", -12, 0.3), (E["r1_53"] - 0.02, "bonk", -4, -0.3),
  (E["r2Bucks"] + 0.05, "coin", -10, -0.4), (E["r2Bucks"] + 0.17, "coin", -10, 0.4),
  *[(E["r2Claude"] + 0.09*k, "coin", -23, 0.45) for k in range(12)],
  (E["r2OpenAI"] + 0.25, "coin", -15, -0.45), (E["r2OpenAI"] + 0.45, "sad", -11, -0.4),
  (E["badge"], "slam", -10, 0), (E["snip"], "snip", -7, -0.4),
  (place["L7"] - 0.06, "whip", -11, 0), (r3_start, "zoom", -13, 0), (E["r3Fifty"], "nitro", -10, -0.3),
  (E["sonnetFin"] - 0.15, "zoom", -11, 0.5), (E["opusFin"] - 0.15, "zoom", -12, 0.5), (E["r3Dust"] - 0.25, "dust", -12, -0.3),
  (E["flag"], "fanfare", -10, 0.3),
  (E["reset1"], "button", -4, -0.2), (E["reset2"], "button", -4, -0.2), (E["reset3"], "button", -3, -0.2), (E["reset3"] + 0.3, "powerdown", -9, 0),
  (E["shades"], "bling", -10, 0), (final_hit, "boom", -2, 0), (final_hit, "slam", -7, 0),
]
scenes = [
  ("tweet", 0.0, events["stamp"] + 1.05),
  ("fair", events["stamp"] + 1.05, place["L4"] - 0.02),
  ("grid", place["L4"] - 0.02, GO),
  ("race1", GO, place["L6"] - 0.04),
  ("race2", place["L6"] - 0.04, place["L7"] - 0.04),
  ("race3", place["L7"] - 0.04, place["L8"] - 0.04),
  ("finish", place["L8"] - 0.04, tape_stop),
  ("fear", tape_stop, final_hit),
  ("endcard", final_hit, DURATION),
]
TL = dict(duration=DURATION, fps=60, width=1080, height=1350, bpm=BPM, beat=BEAT, go=round(GO, 4),
          musicOffset=round(music_offset, 4), musicDrop=MUSIC_DROP,
          lines=[lines[k] for k in lines], events={k: round(v, 3) for k, v in events.items()},
          cues=[dict(t=round(t, 3), sfx=s, gain=g, pan=p) for t, s, g, p in cues],
          scenes=[dict(name=n, t0=round(a, 3), t1=round(b, 3)) for n, a, b in scenes])
json.dump(TL, open(os.path.join(ROOT, "timeline.json"), "w"), indent=1)
with open(os.path.join(ROOT, "src/timeline.js"), "w") as f:
    f.write("// generated by tools/process_voice.py\nwindow.TL = " + json.dumps(TL) + ";\n")
print("GO", round(GO, 3), "music offset", round(music_offset, 3))
for s in TL["scenes"]: print(f"  {s['name']:8s} {s['t0']:6.2f} -> {s['t1']:6.2f}  ({s['t1']-s['t0']:.2f}s)")
for k, v in TL["events"].items(): print(f"  {k}={v}", end="")
print()
