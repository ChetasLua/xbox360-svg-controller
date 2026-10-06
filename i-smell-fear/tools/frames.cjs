// usage: node tools/frames.cjs <outdir> t1 t2 ...   -> PNG stills of index.html?render at those times
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [outdir, ...ts] = process.argv.slice(2);
  fs.mkdirSync(outdir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  await page.goto(process.env.URL || 'http://127.0.0.1:8765/index.html?render');
  await page.waitForFunction('window.ready === true', null, { timeout: 30000 });
  for (const t of ts) {
    const data = await page.evaluate(tt => { window.renderFrame(+tt); return document.getElementById('c').toDataURL('image/png'); }, t);
    fs.writeFileSync(path.join(outdir, `f_${(+t).toFixed(2).padStart(6, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
  }
  await browser.close();
})();
