import { W, H } from './engine.js';
import { createFilm } from './film.js';

const params = new URLSearchParams(location.search);
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
canvas.width = W;
canvas.height = H;

async function loadFonts() {
  const faces = [
    ['Instrument Serif', 'instrument-serif-latin-400-normal.woff2', { style: 'normal', weight: '400' }],
    ['Instrument Serif', 'instrument-serif-latin-400-italic.woff2', { style: 'italic', weight: '400' }],
    ['JetBrains Mono', 'jetbrains-mono-latin-300-normal.woff2', { weight: '300' }],
    ['JetBrains Mono', 'jetbrains-mono-latin-400-normal.woff2', { weight: '400' }],
  ];
  await Promise.all(faces.map(async ([family, file, desc]) => {
    const face = new FontFace(family, `url(fonts/${file})`, desc);
    document.fonts.add(await face.load());
  }));
}

const ready = (async () => {
  await loadFonts();
  const timeline = await (await fetch('src/timeline.json', { cache: 'no-store' })).json();
  return createFilm(timeline, { credit: params.get('credit') || undefined });
})();

if (params.has('render')) {
  // Driven frame by frame by tools/render.mjs.
  window.__film = {
    ready: ready.then((film) => ({ duration: film.duration, anchors: film.anchors })),
    async frame(t, type = 'image/jpeg', quality = 0.96) {
      const film = await ready;
      film.render(ctx, t);
      return canvas.toDataURL(type, quality);
    },
    async check(t) {
      const film = await ready;
      film.render(ctx, t);
      return film.collisions();
    },
    async pixels(t) {
      const film = await ready;
      film.render(ctx, t);
      const { data } = ctx.getImageData(0, 0, W, H);
      let s = '';
      const chunk = 0x8000;
      for (let i = 0; i < data.length; i += chunk) s += String.fromCharCode.apply(null, data.subarray(i, i + chunk));
      return btoa(s);
    },
  };
} else {
  const audio = document.querySelector('audio');
  const button = document.querySelector('button');
  const film = await ready;
  const still = Number(params.get('t') || 0);
  film.render(ctx, still);
  document.body.classList.add('loaded');

  let raf = 0;
  const loop = () => {
    film.render(ctx, audio.currentTime);
    if (!audio.paused && !audio.ended) raf = requestAnimationFrame(loop);
  };
  const play = async () => {
    cancelAnimationFrame(raf);
    if (audio.ended || audio.currentTime >= film.duration - 0.05) audio.currentTime = 0;
    document.body.classList.add('playing');
    try { await audio.play(); } catch { document.body.classList.remove('playing'); return; }
    raf = requestAnimationFrame(loop);
  };
  button.addEventListener('click', play);
  audio.addEventListener('pause', () => document.body.classList.remove('playing'));
  audio.addEventListener('ended', () => { document.body.classList.remove('playing'); film.render(ctx, film.duration - 0.01); });
  canvas.addEventListener('click', () => (audio.paused ? play() : audio.pause()));
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); audio.paused ? play() : audio.pause(); }
  });
}
