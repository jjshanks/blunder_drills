import http from 'node:http'; import fs from 'node:fs';
const iso = process.argv[2] === 'iso'; const port = iso ? 8811 : 8810;
http.createServer((q, r) => { const h = { 'content-type': 'text/html' };
  if (iso) Object.assign(h, { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' });
  r.writeHead(200, h); r.end(fs.readFileSync(new URL(q.url.startsWith('/w') ? './wpage.html' : './page.html', import.meta.url))); }).listen(port);
