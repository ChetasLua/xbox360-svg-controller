# I Smell Fear — Codex vs Clawd

A 30-second, 60 fps, 1080×1350 (4:5) animated reply to
[@thsottiaux's "The real story is this one"](https://x.com/thsottiaux/status/2107295839655952486) (Oct 6, 2026).
Everything on screen is drawn by JavaScript on a `<canvas>`; the voices are ElevenLabs **v4**, the music bed is
ElevenLabs Music v2.5, and the sound effects are synthesized in numpy.

| file | what |
| --- | --- |
| `out/i-smell-fear.mp4` | the video (H.264 + AAC, 30.0 s, faststart, ready to post on X) |
| `i-smell-fear.html` | single-file player: fonts, code and soundtrack (MP3) inlined, opens straight from disk |
| `index.html`, `src/` | the animation source (`lib.js` helpers, `characters.js` mascots, `scenes.js`, `main.js` compositor) |
| `timeline.json` | every cue: word-level voice timestamps, beat grid, scene cuts, SFX hits |
| `tools/` | the pipeline below |

## Story (each beat lands on a real voice word or music hit)

1. **The real story** — the tweet card with the AA chart (Sol max $0.72 vs Opus max $5.98). Codex mascot reads it,
   smug. The fine print appears: *Intelligence 52 ≠ 58*. **CHART CRIME** stamp.
2. **Fair fight** — same weight class: GPT-6 Astra (max) 53 · $3.26/task vs Claude Opus 5.5 (high) 54 · $1.82/task → **−44%**.
3. **Start grid** — "Intelligence! Tokens! Speed! GO!" — start lights on each word; the music drop hits on *GO*.
4. **Race 1 · Intelligence** — Opus 58 (#1/224). Codex bonks the 53 ceiling. Top 6 on the index = all Anthropic; OpenAI's best is #7.
5. **Race 2 · Tokens** — $200/mo plan value: Claude Max 20x $11,726 vs ChatGPT Pro 200 $2,084 → **5.6× more value** (SemiAnalysis). Pro 200 limits 20× → 10×.
6. **Race 3 · Speed** — "+50% faster" sticker, still 63/58 tok/s vs Opus 97 and Sonnet 128.
7. **Finish** — 3–0. Codex mashes the RESET button ("ship one thing or a full reset").
8. **I smell fear** — tape stop, spotlight, sniff, shades, Tibo's own line handed back.
9. **Frontier means first** — the original Jul 9 tweet, stamped *RETURN TO SENDER*, plus sources.

## Fact check (as of Oct 6, 2026)

| claim in the video | source | note |
| --- | --- | --- |
| Tibo: "The real story is this one", quoting the Sol max $0.72 vs Opus max $5.98 chart | [x.com/thsottiaux/status/2107295839655952486](https://x.com/thsottiaux/status/2107295839655952486) | quote of Meet Pandya's AA cost chart |
| "I smell fear" | [x.com/thsottiaux/status/2075287108680601929](https://x.com/thsottiaux/status/2075287108680601929) | Jul 9, 2026, replying to @ClaudeDevs' rate-limit reset. The line is "smell", not "see". |
| Opus 5.5 (max) 58, #1/224 · Sonnet 5.5 (max) 56 · Opus 5.5 (high) 54 · GPT-6 Astra (max) 53, #7 · GPT-6.1 Sol (max) 52 | [artificialanalysis.ai/leaderboards/models](https://artificialanalysis.ai/leaderboards/models) | Intelligence Index v4.3.2. Top 6 are Anthropic models (Opus/Sonnet 5.5, Fable 5.1). |
| Cost per index task: Astra max $3.26 vs Opus high $1.82 (−44%); Sol max $0.72; Opus max $5.98 | Artificial Analysis cost-per-task chart | at ~equal intelligence the other way round, Sol max ($0.72, 52) is cheaper than Opus medium ($1.34, 51). |
| Output speed: Sonnet 5.5 128 · Opus 5.5 97 · Astra 63 · Sol 58 tok/s | AA model pages (max settings, API) | Opus 5.5 at high/xhigh/medium is 78–79 tok/s. |
| "~50% faster" | [x.com/thsottiaux/status/2107158998495748264](https://x.com/thsottiaux/status/2107158998495748264) | Day 1 of the 28-day sprint, ChatGPT-plan traffic. Press reports ~30 → ~50 tok/s. |
| $200 plans: Claude Max 20x $11,726/mo vs ChatGPT Pro 200 $2,084/mo of API-equivalent value (5.6×) | SemiAnalysis chart shared by [@petergostev](https://x.com/petergostev/status/2107200834077438078) | agentic workload at list API prices. 5.6× is *value*; Opus lists at ~2× Sol per token, so it is roughly 2.8× the tokens. |
| Pro 200 limits 20× → 10× Plus | DevDay 2026 coverage ([daily.dev / TNW](https://daily.dev/posts/openai-halves-pro-200-usage-and-launches-a-500-chatgpt-plan-at-devday-vbxlojybv)) | effective Oct 30. |

Known counter-argument: tokens/sec is not time-per-task. At max effort Opus 5.5 spends ~260M output tokens on the
index versus ~67M for Sol, so per task the OpenAI models can finish sooner. The video labels the speed race as raw
output tokens/sec, which is the metric OpenAI chose to brag about.

## Rebuild

```bash
python3 tools/process_voice.py   # tighten ElevenLabs takes -> audio/vo/*.wav + timeline.json (+ src/timeline.js)
python3 tools/make_sfx.py        # procedural SFX -> audio/sfx/
python3 tools/mix.py             # music (drop on "GO!"), ducking, tape stop, final hit -> audio/mix.wav/.m4a
python3 -m http.server 8765 &    # serve the folder
node tools/render.cjs            # Playwright -> PNG frames -> ffmpeg -> out/video_only.mp4  (npm i playwright)
tools/mux.sh                     # + soundtrack -> out/i-smell-fear.mp4
python3 tools/build_standalone.py
```

## Credits

- Voices: ElevenLabs **eleven_v4** — "Inferno – Arrogant Male Villain" (Codex), "David – Sports Arena Announcer",
  "The Duke – Gritty Mob Boss" (Clawd). Takes verified word-for-word with ElevenLabs Scribe.
- Music: ElevenLabs Music v2.5 (140 BPM instrumental).
- Fonts (SIL OFL, via Fontsource): Anton, Inter, JetBrains Mono, Press Start 2P.
- The Codex companion (OpenAI) and Clawd (Anthropic) are redrawn here for parody and commentary. Not affiliated with either company.
