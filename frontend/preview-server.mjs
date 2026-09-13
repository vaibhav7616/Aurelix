// Static server for live previews (SPA fallback, binds 0.0.0.0, no host allowlist)
// + same-origin reverse proxy for the API so browsers never call the API port
// directly (avoids CORS + preview-token issues on the second origin).
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = parseInt(process.env.PORT ?? '5173', 10);
const API_HOST = process.env.API_HOST ?? '127.0.0.1';
const API_PORT = parseInt(process.env.API_PORT ?? '4000', 10);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };

const shouldProxy = (p) => p === '/ready' || p.startsWith('/api/') || p.startsWith('/socket.io');

function proxyHttp(req, res) {
  const upstream = http.request(
    { host: API_HOST, port: API_PORT, path: req.url, method: req.method, headers: { ...req.headers, host: `${API_HOST}:${API_PORT}` } },
    (up) => { res.writeHead(up.statusCode ?? 502, up.headers); up.pipe(res); },
  );
  upstream.on('error', () => { res.writeHead(502); res.end('api unavailable'); });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (shouldProxy(urlPath)) { proxyHttp(req, res); return; }
    let file = path.join(root, urlPath);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(500); res.end('error'); }
});

// websocket upgrade (socket.io) -> backend
server.on('upgrade', (req, clientSocket) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!shouldProxy(urlPath)) { clientSocket.destroy(); return; }
  const upstream = http.request({
    host: API_HOST, port: API_PORT, path: req.url, method: req.method,
    headers: { ...req.headers, host: `${API_HOST}:${API_PORT}` },
  });
  upstream.on('upgrade', (upRes, upSocket) => {
    clientSocket.write(`HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}\r\n`);
    for (const [k, v] of Object.entries(upRes.headers)) clientSocket.write(`${k}: ${v}\r\n`);
    clientSocket.write('\r\n');
    upSocket.pipe(clientSocket);
    clientSocket.pipe(upSocket);
    // either side dropping (ECONNRESET on abrupt close) must never crash the server
    upSocket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upSocket.destroy());
    upSocket.on('close', () => clientSocket.destroy());
    clientSocket.on('close', () => upSocket.destroy());
  });
  clientSocket.on('error', () => upstream.destroy());
  upstream.on('error', () => clientSocket.destroy());
  upstream.end();
});
process.on('uncaughtException', (e) => console.error('[preview] uncaught', e?.code || e?.message || e));

server.listen(port, '0.0.0.0', () => console.log(`aurelix web on :${port} (api -> ${API_HOST}:${API_PORT})`));
