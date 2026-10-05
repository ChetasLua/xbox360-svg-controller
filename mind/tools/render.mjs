// Renders the film frame by frame in headless Chromium and encodes it with ffmpeg.
//
//   node tools/render.mjs                         full film -> self-portrait.mp4
//   node tools/render.mjs --stills 2,6.5,30 --out /tmp/stills
//   node tools/render.mjs --from 20 --to 32 --out /tmp/clip.mp4 --no-audio
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const FPS = Number(opt('fps', 30));
const stills = opt('stills');
const out = opt('out', join(root, stills ? 'stills' : 'self-portrait.mp4'));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.wav': 'audio/wav' };
const server = createServer((req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
  createReadStream(path).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => { if (m.type() === 'error') console.error('page:', m.text()); });
page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
await page.goto(`${base}/index.html?render${opt('credit') ? `&credit=${encodeURIComponent(opt('credit'))}` : ''}`);
const info = await page.evaluate(() => window.__film.ready);

const grab = (t) => page.evaluate(([tt]) => window.__film.frame(tt), [t]);

if (flag('check')) {
  // Scan the film for text drawn over the captions.
  let bad = 0;
  for (let t = 0; t < info.duration; t += 0.1) {
    const hits = await page.evaluate(([tt]) => window.__film.check(tt), [t]);
    if (hits.length) { bad++; console.log(t.toFixed(1).padStart(5), hits.slice(0, 4).join('  ')); }
  }
  console.log(bad ? `${bad} frames with collisions` : 'no text collides with the captions');
} else if (stills) {
  mkdirSync(out, { recursive: true });
  const times = stills === 'auto'
    ? Array.from({ length: Math.floor(info.duration) }, (_, i) => i + 0.5)
    : stills.split(',').map(Number);
  for (const t of times) {
    const url = await grab(t);
    const file = join(out, `t${t.toFixed(2).padStart(6, '0')}.jpg`);
    writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log(`${times.length} stills -> ${out}`);
} else {
  const from = Number(opt('from', 0));
  const to = Number(opt('to', info.duration));
  const frames = Math.round((to - from) * FPS);
  const audio = !flag('no-audio') && existsSync(join(root, 'audio/mix.m4a'));
  const ff = spawn('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0',
    ...(audio ? ['-ss', String(from), '-t', String(to - from), '-i', join(root, 'audio/mix.m4a')] : []),
    '-c:v', 'libx264', '-preset', opt('preset', 'slow'), '-crf', opt('crf', '17'), '-tune', 'film',
    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart',
    ...(audio ? ['-c:a', 'copy', '-shortest'] : []),
    out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const started = Date.now();
  for (let f = 0; f < frames; f++) {
    const url = await grab(from + f / FPS);
    const buf = Buffer.from(url.split(',')[1], 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % (FPS * 2) === 0) {
      const el = (Date.now() - started) / 1000;
      process.stdout.write(`\rframe ${f}/${frames}  ${(f / Math.max(el, 0.001)).toFixed(1)} fps  `);
    }
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error(`ffmpeg exited ${c}`)))));
  console.log(`\n${frames} frames in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${out}`);
}

await browser.close();
server.close();
