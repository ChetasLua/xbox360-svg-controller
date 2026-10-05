// Small WAV helpers shared by the voice, timeline, and score tools.
// Everything is mono or stereo PCM16 at 48 kHz once it leaves these helpers.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

export const RATE = 48000;

export function readWav(path) {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path} is not a WAV file`);
  }
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = buf.subarray(body, Math.min(buf.length, body + size));
    }
    pos = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error(`${path}: missing fmt or data chunk`);
  const frames = Math.floor(data.length / (fmt.channels * fmt.bits / 8));
  const channels = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      const o = (i * fmt.channels + c) * fmt.bits / 8;
      let v;
      if (fmt.format === 3 && fmt.bits === 32) v = data.readFloatLE(o);
      else if (fmt.bits === 16) v = data.readInt16LE(o) / 32768;
      else if (fmt.bits === 24) v = (data.readIntLE(o, 3)) / 8388608;
      else if (fmt.bits === 32) v = data.readInt32LE(o) / 2147483648;
      else throw new Error(`${path}: unsupported ${fmt.bits}-bit WAV`);
      channels[c][i] = v;
    }
  }
  return { sampleRate: fmt.sampleRate, channels };
}

export function writeWav(path, channels, sampleRate = RATE) {
  const frames = channels[0].length;
  const n = channels.length;
  const buf = Buffer.alloc(44 + frames * n * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + frames * n * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(n, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * n * 2, 28);
  buf.writeUInt16LE(n * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(frames * n * 2, 40);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < n; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      buf.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  }
  writeFileSync(path, buf);
}

// Decode any audio ffmpeg understands (mp3, wav, raw float) to mono 48 kHz samples.
export function decodeToMono48k(input, { rawFloatRate } = {}) {
  const args = ['-v', 'error'];
  if (rawFloatRate) args.push('-f', 'f32le', '-ar', String(rawFloatRate), '-ac', '1');
  args.push('-i', 'pipe:0', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', 'pipe:1');
  const res = spawnSync('ffmpeg', args, { input, maxBuffer: 1 << 30 });
  if (res.status !== 0) throw new Error(`ffmpeg decode failed: ${res.stderr}`);
  const out = res.stdout;
  return new Float32Array(out.buffer, out.byteOffset, out.length / 4).slice();
}

// Cut leading and trailing silence, keeping a short natural tail.
export function trimSilence(samples, { thresholdDb = -46, headMs = 25, tailMs = 90 } = {}) {
  const threshold = Math.pow(10, thresholdDb / 20);
  const win = Math.round(RATE * 0.01);
  const loud = (i) => {
    let peak = 0;
    for (let k = i; k < Math.min(samples.length, i + win); k++) peak = Math.max(peak, Math.abs(samples[k]));
    return peak > threshold;
  };
  let a = 0;
  while (a < samples.length && !loud(a)) a += win;
  let b = samples.length - win;
  while (b > a && !loud(b)) b -= win;
  const start = Math.max(0, a - Math.round(RATE * headMs / 1000));
  const end = Math.min(samples.length, b + win + Math.round(RATE * tailMs / 1000));
  const out = samples.slice(start, end);
  // Short raised-cosine edges so cut points never click.
  const fade = Math.min(Math.round(RATE * 0.005), out.length >> 2);
  for (let i = 0; i < fade; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fade);
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return { samples: out, offset: start / RATE };
}

// Spread a sentence's duration across its words, weighting by length and punctuation.
export function estimateWordTimes(text, start, end) {
  const words = text.split(/\s+/).filter(Boolean);
  const weight = (w) => w.replace(/[^\p{L}\p{N}']/gu, '').length + 1.5 + (/[,;:]$/.test(w) ? 2.5 : 0) + (/[.!?]$/.test(w) ? 3.5 : 0);
  const total = words.reduce((s, w) => s + weight(w), 0);
  let t = start;
  return words.map((w) => {
    const d = (end - start) * weight(w) / total;
    const item = { w, s: +t.toFixed(3), e: +(t + d * 0.86).toFixed(3) };
    t += d;
    return item;
  });
}
