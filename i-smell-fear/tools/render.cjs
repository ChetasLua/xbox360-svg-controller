// Offline renderer: drives index.html?render frame-by-frame and pipes PNGs into ffmpeg (video only;
// tools/mux.sh adds the soundtrack). usage: node tools/render.cjs [out.mp4] [fps] [from] [to]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const out = process.argv[2] || path.join(root, 'out/video_only.mp4');
  const fps = +(process.argv[3] || 60), from = +(process.argv[4] || 0), to = +(process.argv[5] || 30);
  const url = process.env.URL || 'http://127.0.0.1:8765/index.html?render';
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync', '--force-device-scale-factor=1'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(url);
  await page.waitForFunction('window.ready === true', null, { timeout: 30000 });
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
    '-g', String(fps * 2), '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n0 = Math.round(from * fps), n1 = Math.round(to * fps);
  const t0 = Date.now();
  for (let i = n0; i < n1; i++) {
    const b64 = await page.evaluate(t => { window.renderFrame(t); return document.getElementById('c').toDataURL('image/png').slice(22); }, i / fps);
    const buf = Buffer.from(b64, 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if ((i - n0) % 120 === 0) console.log(`frame ${i}/${n1}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log('done', out, ((Date.now() - t0) / 1000).toFixed(1) + 's');
})();
