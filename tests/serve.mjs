// Minimal static server for index.html, for the tests and `npm start`. It serves the page over
// http, like GitHub Pages does. Only the page itself is served; it has no other local files.
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const page = new URL('../index.html', import.meta.url);
const port = Number(process.env.PORT || 8000);

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname !== '/' && pathname !== '/index.html') return res.writeHead(404).end('Not found');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(await readFile(page));
}).listen(port, '127.0.0.1', () => console.log(`Blunder Drills: http://127.0.0.1:${port}/`));
