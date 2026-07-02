import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./public', import.meta.url)));
const host = process.env.WEB_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.WEB_PORT || '3000', 10);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method Not Allowed');
    return;
  }

  const path = resolveRequestPath(request.url || '/');
  const filePath = path && readableFile(path) ? path : join(root, 'index.html');

  if (!readableFile(filePath)) {
    sendText(response, 404, 'Not Found');
    return;
  }

  const fileSize = statSync(filePath).size;
  response.writeHead(200, {
    'Cache-Control': cacheControl(filePath),
    'Content-Length': fileSize,
    'Content-Type': contentTypes.get(extname(filePath)) || 'application/octet-stream',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  process.stdout.write(`Runlane web console listening on ${host}:${port}\n`);
});

process.on('SIGTERM', () => closeServer());
process.on('SIGINT', () => closeServer());

function closeServer() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

function resolveRequestPath(rawUrl) {
  try {
    const url = new URL(rawUrl, 'http://127.0.0.1');
    const decodedPath = decodeURIComponent(url.pathname);
    const normalizedPath = normalize(decodedPath).replace(/^([/\\])+/, '');
    const candidate = resolve(root, normalizedPath);

    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
      return null;
    }

    return candidate;
  } catch {
    return null;
  }
}

function readableFile(path) {
  return Boolean(path && existsSync(path) && statSync(path).isFile());
}

function cacheControl(path) {
  const extension = extname(path);

  if (extension === '.html') {
    return 'no-store';
  }

  if (path.includes(`${sep}assets${sep}`)) {
    return 'public, max-age=31536000, immutable';
  }

  return 'public, max-age=3600';
}

function sendText(response, status, message) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(message);
}
