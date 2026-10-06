// Render video.html frame-by-frame with headless Chromium, then encode with ffmpeg.
// usage: node render.mjs [--fps 30] [--out out/nuvanta.mp4] [--stills 3,10.5,25] [--from 0 --to 81.5] [--audio mix.wav]
import { createRequire } from 'module';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { spawnSync } from 'child_process';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const dir = path.dirname(new URL(import.meta.url).pathname);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const fps = +arg('fps', 30), out = arg('out', 'out/nuvanta.mp4'), stills = arg('stills'), workers = +arg('workers', 4), audio = arg('audio');
const types = { '.html': 'text/html', '.woff2': 'font/woff2', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((q, r) => { const f = path.join(dir, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(b); }); });
await new Promise(r => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/video.html`;
const browser = await chromium.launch();
async function newPage() { const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } }); await p.goto(url); await p.waitForFunction(() => window.READY); return p; }
const outDir = path.join(dir, 'out'); fs.mkdirSync(outDir, { recursive: true });
if (stills) {
  const p = await newPage();
  for (const s of stills.split(',')) { await p.evaluate(t => render(t), +s); await p.screenshot({ path: path.join(outDir, `still_${s}.png`) }); }
} else {
  const p0 = await newPage(); const dur = await p0.evaluate(() => DURATION); await p0.close();
  const from = +arg('from', 0), to = +arg('to', dur);
  const n = Math.round((to - from) * fps); const fdir = path.join(outDir, 'frames'); fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir);
  let done = 0;
  await Promise.all([...Array(workers)].map(async (_, w) => {
    const p = await newPage(); const a = Math.floor(n * w / workers), b = Math.floor(n * (w + 1) / workers);
    for (let i = a; i < b; i++) { await p.evaluate(t => render(t), from + i / fps); await p.screenshot({ path: path.join(fdir, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 }); if (++done % 300 === 0) console.log(`${done}/${n}`); }
  }));
  const ff = ['-y', '-framerate', String(fps), '-i', path.join(fdir, '%05d.jpg')];
  if (audio) ff.push('-i', audio, '-af', 'apad', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  ff.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.resolve(dir, out));
  const r = spawnSync('ffmpeg', ff, { stdio: ['ignore', 'ignore', 'inherit'] }); if (r.status) process.exit(r.status);
  console.log('wrote', out);
}
await browser.close(); server.close();
