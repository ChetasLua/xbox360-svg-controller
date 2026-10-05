// Stand-in narration from a small local model (Kokoro 82M), used only to time the
// film when no ElevenLabs key is available. `npm run voice` replaces it with Eleven v4.
//
//   node tools/voice-draft.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { KokoroTTS } from 'kokoro-js';
import { RATE, decodeToMono48k, estimateWordTimes, trimSilence, writeWav } from './audio-utils.mjs';

// Node's fetch only honours HTTPS_PROXY when started with NODE_USE_ENV_PROXY=1.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const run = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } });
  process.exit(run.status ?? 1);
}

const root = new URL('..', import.meta.url);
const narration = JSON.parse(readFileSync(new URL('narration.json', root)));
const outDir = new URL('audio/voice/', root);
mkdirSync(outDir, { recursive: true });

const VOICE = process.env.DRAFT_VOICE || 'af_heart';
const SPEED = Number(process.env.DRAFT_SPEED || 0.94);
const PAUSE = { ',': 0.16, '.': 0.42, '?': 0.42, '!': 0.42 };

const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' });

const result = { engine: 'kokoro-82m (draft)', voice: VOICE, lines: [] };
for (const line of narration.lines) {
  // Synthesize sentence by sentence so each sentence boundary is known exactly.
  const sentences = line.text.match(/[^.?!]+[.?!]+/g).map((s) => s.trim());
  const parts = [];
  const words = [];
  let cursor = 0;
  for (const sentence of sentences) {
    const audio = await tts.generate(sentence, { voice: VOICE, speed: SPEED });
    const pcm = Buffer.from(audio.audio.buffer, audio.audio.byteOffset, audio.audio.byteLength);
    const { samples } = trimSilence(decodeToMono48k(pcm, { rawFloatRate: audio.sampling_rate }), { tailMs: 40 });
    const dur = samples.length / RATE;
    words.push(...estimateWordTimes(sentence, cursor, cursor + dur));
    parts.push(samples);
    const gap = PAUSE[sentence.at(-1)] ?? 0.3;
    parts.push(new Float32Array(Math.round(gap * RATE)));
    cursor += dur + gap;
  }
  parts.pop();
  const total = parts.reduce((n, p) => n + p.length, 0);
  const samples = new Float32Array(total);
  let o = 0;
  for (const p of parts) { samples.set(p, o); o += p.length; }
  const file = `${line.id}.wav`;
  writeWav(new URL(file, outDir), [samples]);
  result.lines.push({ id: line.id, file, duration: +(samples.length / RATE).toFixed(3), words });
  console.log(`${line.id.padEnd(10)} ${(samples.length / RATE).toFixed(2)}s  ${line.text}`);
}
writeFileSync(new URL('lines.json', outDir), JSON.stringify(result, null, 2));
