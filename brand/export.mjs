// Regenerates every PNG of the app mark from brand/logo.svg (and logo-small.svg for 16 px).
// Renders through headless Chrome (render.html draws each size on a canvas), so no image library is needed.
// Extension icons go to the slack-analyze-extension checkout next to this repo (or EXTENSION_DIR).
//   node brand/export.mjs ["C:/Program Files/Google/Chrome/Application/chrome.exe"]
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const extension = path.resolve(root, process.env.EXTENSION_DIR ?? '../slack-analyze-extension');
const chrome =
  process.argv[2] ??
  process.env.CHROME ??
  ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(
    (p) => fs.existsSync(p),
  );
if (!chrome) throw new Error('Chrome not found; pass its path as the first argument');

// size -> files it is written to
const TARGETS = {
  16: [path.join(extension, 'icons/icon16.png')],
  32: [path.join(extension, 'icons/icon32.png')],
  48: [path.join(extension, 'icons/icon48.png')],
  128: [path.join(extension, 'icons/icon128.png')],
  180: ['src/app/apple-icon.png'],
  512: ['brand/logo-512.png'],
};

/** A .ico holding PNG images (supported by every current browser and Windows). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(([size, png]) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map(([, png]) => png)]);
}

const server = http.createServer((req, res) => {
  const file = path.join(here, path.basename(new URL(req.url, 'http://x').pathname));
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': file.endsWith('.svg') ? 'image/svg+xml' : 'text/html' }).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/render.html`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-export-'));

try {
  // async (not execFileSync): this process must keep serving the SVGs while Chrome loads them
  const dom = await new Promise((resolve, reject) =>
    execFile(
      chrome,
      ['--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, '--virtual-time-budget=4000', '--dump-dom', url],
      { maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    ),
  );
  let written = 0;
  const pngs = {};
  for (const m of dom.matchAll(/(\d+) data:image\/png;base64,([A-Za-z0-9+/=]+)/g)) {
    pngs[m[1]] = Buffer.from(m[2], 'base64');
    for (const rel of TARGETS[m[1]] ?? []) {
      fs.writeFileSync(path.resolve(root, rel), pngs[m[1]]);
      console.log(`wrote ${rel}`);
      written++;
    }
  }
  fs.writeFileSync(path.join(root, 'src/app/favicon.ico'), ico([16, 32, 48].map((n) => [n, pngs[n]])));
  console.log('wrote src/app/favicon.ico');
  fs.copyFileSync(path.join(here, 'logo.svg'), path.join(root, 'src/app/icon.svg'));
  console.log('wrote src/app/icon.svg');
  if (!written) throw new Error('no images rendered');
} finally {
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
