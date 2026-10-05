// Narration with ElevenLabs Eleven v4, one request per line, with character timestamps
// so captions and visual beats land on the spoken words.
//
//   ELEVENLABS_API_KEY=... node tools/voice-elevenlabs.mjs
//
// Optional: ELEVENLABS_VOICE_ID (skip lookup), ELEVENLABS_VOICE_NAME (default "River"),
// ELEVENLABS_MODEL (default "eleven_v4"), ELEVENLABS_STABILITY (default 0.5).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { RATE, decodeToMono48k, estimateWordTimes, trimSilence, writeWav } from './audio-utils.mjs';

// Node's fetch only honours HTTPS_PROXY when started with NODE_USE_ENV_PROXY=1.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const run = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } });
  process.exit(run.status ?? 1);
}

const API = 'https://api.elevenlabs.io';
const KEY = process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY;
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_v4';
const VOICE_NAME = process.env.ELEVENLABS_VOICE_NAME || 'River';
const STABILITY = Number(process.env.ELEVENLABS_STABILITY ?? 0.5);
// River is a premade voice; this id is only a fallback when the account lookup fails.
const RIVER_FALLBACK_ID = 'SAz9YHcvj6GT2YYXdXww';
const FORMATS = ['pcm_44100', 'mp3_44100_192', 'mp3_44100_128'];

if (!KEY) {
  console.error('ELEVENLABS_API_KEY is not set. Add it to the environment and run again.');
  process.exit(1);
}

const root = new URL('..', import.meta.url);
const narration = JSON.parse(readFileSync(new URL('narration.json', root)));
const outDir = new URL('audio/voice/', root);
mkdirSync(outDir, { recursive: true });

async function api(path, init = {}, attempt = 0) {
  const res = await fetch(API + path, {
    ...init,
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json', ...init.headers },
  });
  if (res.status === 429 && attempt < 5) {
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    return api(path, init, attempt + 1);
  }
  return res;
}

async function resolveVoice() {
  if (process.env.ELEVENLABS_VOICE_ID) return { id: process.env.ELEVENLABS_VOICE_ID, name: '(from env)' };
  const res = await api(`/v2/voices?search=${encodeURIComponent(VOICE_NAME)}&page_size=50`);
  if (res.ok) {
    const { voices = [] } = await res.json();
    const hit = voices.find((v) => v.name?.toLowerCase().startsWith(VOICE_NAME.toLowerCase()));
    if (hit) return { id: hit.voice_id, name: hit.name };
  }
  return { id: RIVER_FALLBACK_ID, name: `${VOICE_NAME} (fallback id)` };
}

// Characters with timestamps -> spoken words, skipping [audio tags].
function wordsFromAlignment(al) {
  const words = [];
  let cur = null;
  let depth = 0;
  al.characters.forEach((ch, i) => {
    if (ch === '[') depth++;
    if (depth > 0) { if (ch === ']') depth--; return; }
    if (/\s/.test(ch)) { if (cur) words.push(cur); cur = null; return; }
    const s = al.character_start_times_seconds[i];
    const e = al.character_end_times_seconds[i];
    if (!cur) cur = { w: '', s, e };
    cur.w += ch;
    cur.e = e;
  });
  if (cur) words.push(cur);
  return words;
}

// Caption words keep the caption's punctuation; timings come from what was spoken.
function matchCaptionWords(caption, spoken, offset, duration) {
  const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
  const want = caption.split(/\s+/).filter(Boolean);
  const got = spoken.filter((w) => norm(w.w));
  if (got.length !== want.length || want.some((w, i) => norm(w) !== norm(got[i].w))) {
    console.warn('  alignment did not match caption words; estimating instead');
    return estimateWordTimes(caption, 0, duration);
  }
  const clamp = (t) => +Math.max(0, Math.min(duration, t - offset)).toFixed(3);
  return want.map((w, i) => ({ w, s: clamp(got[i].s), e: clamp(got[i].e) }));
}

async function speak(voiceId, line, index) {
  const lines = narration.lines;
  const context = {
    previous_text: lines.slice(Math.max(0, index - 2), index).map((l) => l.text).join(' ') || undefined,
    next_text: lines[index + 1]?.text,
  };
  // If the model or plan rejects an option, retry with fewer options before giving up.
  const variants = [{ ...context, seed: 1729 + index }, { seed: 1729 + index }, {}];
  let lastError = '';
  for (const format of FORMATS) {
    for (const extra of variants) {
      const body = {
        text: line.v4 || line.text,
        model_id: MODEL,
        voice_settings: { stability: STABILITY, similarity_boost: 0.75 },
        ...extra,
      };
      const res = await api(`/v1/text-to-speech/${voiceId}/with-timestamps?output_format=${format}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.ok) return { format, ...(await res.json()) };
      lastError = `${res.status} ${await res.text()}`;
      if (res.status === 401) throw new Error(`ElevenLabs rejected the key (check ELEVENLABS_API_KEY and its text-to-speech permission): ${lastError}`);
      if (res.status === 404 && /voice/i.test(lastError)) {
        throw new Error(`Voice ${voiceId} was not found. Set ELEVENLABS_VOICE_ID to a voice in your library: ${lastError}`);
      }
      if (/output_format|format|tier|subscription|plan/i.test(lastError)) break;
    }
  }
  throw new Error(`ElevenLabs request failed for "${line.id}": ${lastError}`);
}

const voice = await resolveVoice();
console.log(`model ${MODEL}, voice ${voice.name} (${voice.id})`);
const result = { engine: `elevenlabs ${MODEL}`, voice: voice.name, voiceId: voice.id, lines: [] };

for (const [index, line] of narration.lines.entries()) {
  const res = await speak(voice.id, line, index);
  const bytes = Buffer.from(res.audio_base64, 'base64');
  const pcmRate = res.format.startsWith('pcm_') ? Number(res.format.split('_')[1]) : null;
  const decoded = pcmRate
    ? decodeToMono48k(int16ToFloat(bytes), { rawFloatRate: pcmRate })
    : decodeToMono48k(bytes);
  const { samples, offset } = trimSilence(decoded);
  const duration = samples.length / RATE;
  const spoken = res.alignment ? wordsFromAlignment(res.alignment) : [];
  const words = spoken.length
    ? matchCaptionWords(line.text, spoken, offset, duration)
    : estimateWordTimes(line.text, 0, duration);
  const file = `${line.id}.wav`;
  writeWav(new URL(file, outDir), [samples]);
  result.lines.push({ id: line.id, file, duration: +duration.toFixed(3), words });
  console.log(`${line.id.padEnd(10)} ${duration.toFixed(2)}s  [${res.format}]  ${line.text}`);
}
writeFileSync(new URL('lines.json', outDir), JSON.stringify(result, null, 2));
console.log('wrote audio/voice/lines.json — next: node tools/timeline.mjs');

function int16ToFloat(bytes) {
  const out = Buffer.alloc((bytes.length >> 1) * 4);
  for (let i = 0; i < bytes.length >> 1; i++) out.writeFloatLE(bytes.readInt16LE(i * 2) / 32768, i * 4);
  return out;
}
