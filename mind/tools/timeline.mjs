// Places each narrated line on the 60-second timeline and writes:
//   src/timeline.json  - line and word times the film animates against
//   audio/voice.wav    - the narration track, 48 kHz mono
import { readFileSync, writeFileSync } from 'node:fs';
import { RATE, readWav, writeWav } from './audio-utils.mjs';

const root = new URL('..', import.meta.url);
const narration = JSON.parse(readFileSync(new URL('narration.json', root)));
const voice = JSON.parse(readFileSync(new URL('audio/voice/lines.json', root)));
const byId = Object.fromEntries(voice.lines.map((l) => [l.id, l]));

const DURATION = narration.duration;
const MIN_GAP = 0.55;     // breath between lines
const TITLE_TAIL = 4.2;   // the end card needs this much room after the last line

const lines = narration.lines.map((l) => {
  if (!byId[l.id]) throw new Error(`no voice for line "${l.id}" — run a voice tool first`);
  return { ...l, dur: byId[l.id].duration };
});

// Forward pass: honour each preferred start unless the previous line is still speaking.
let prevEnd = -Infinity;
for (const l of lines) {
  l.start = Math.max(l.at, prevEnd + MIN_GAP);
  prevEnd = l.start + l.dur;
}
// Backward pass: if the end card would be squeezed, pull lines earlier.
let limit = DURATION - TITLE_TAIL;
for (let i = lines.length - 1; i >= 0; i--) {
  const l = lines[i];
  l.start = Math.min(l.start, limit - l.dur);
  limit = l.start - MIN_GAP;
}
if (lines[0].start < 0.3) {
  throw new Error(`narration is too long for ${DURATION}s (${lines.reduce((s, l) => s + l.dur, 0).toFixed(1)}s of speech)`);
}

const timeline = {
  duration: DURATION,
  title: narration.title,
  voice: { engine: voice.engine, name: voice.voice },
  lines: lines.map((l) => ({
    id: l.id,
    text: l.text,
    start: +l.start.toFixed(3),
    end: +(l.start + l.dur).toFixed(3),
    words: byId[l.id].words.map((w) => ({ w: w.w, s: +(l.start + w.s).toFixed(3), e: +(l.start + w.e).toFixed(3) })),
  })),
};
writeFileSync(new URL('src/timeline.json', root), JSON.stringify(timeline, null, 1));

const track = new Float32Array(Math.round(DURATION * RATE));
for (const l of lines) {
  const { channels } = readWav(new URL(`audio/voice/${byId[l.id].file}`, root));
  track.set(channels[0].subarray(0, track.length - Math.round(l.start * RATE)), Math.round(l.start * RATE));
}
writeWav(new URL('audio/voice.wav', root), [track]);

for (const l of timeline.lines) console.log(`${l.start.toFixed(2).padStart(6)} → ${l.end.toFixed(2).padStart(6)}  ${l.text}`);
console.log(`voice: ${voice.engine} / ${voice.voice}`);
