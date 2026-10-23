import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOddsApiHandler } from './odds-feed.js';
import { createPropsApiHandler } from './props-feed.js';

const defaultDist = fileURLToPath(new URL('../dist', import.meta.url));
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function respond(res, status, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(message);
}

function within(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

/** Serve a built frontend and the server-only live-odds API. */
export function createAppServer({ apiKey, fetchImpl, now, distDir = defaultDist } = {}) {
  const handler = createOddsApiHandler({ apiKey, fetchImpl, now });
  const propsHandler = createPropsApiHandler({ apiKey, fetchImpl, now });
  const root = path.resolve(distDir);
  return http.createServer((req, res) => {
    void (async () => {
      if (await propsHandler(req, res)) return;
      if (await handler(req, res)) return;
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD');
        respond(res, 405, 'Method not allowed.');
        return;
      }
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      } catch {
        respond(res, 400, 'Invalid request path.');
        return;
      }
      if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) {
        respond(res, 400, 'Invalid request path.');
        return;
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        respond(res, 404, 'API endpoint not found.');
        return;
      }
      let target = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!within(root, target)) {
        respond(res, 400, 'Invalid request path.');
        return;
      }
      let rootReal;
      try {
        rootReal = await realpath(root);
      } catch {
        respond(res, 503, 'Frontend build missing. Run npm run build first.');
        return;
      }
      try {
        if (!(await stat(target)).isFile()) throw new Error();
      } catch {
        if (/^(?:\/[A-Za-z0-9_-]+)*\/?$/.test(pathname)) target = path.join(root, 'index.html');
        else {
          respond(res, 404, 'File not found.');
          return;
        }
      }
      let resolved;
      try {
        resolved = await realpath(target);
      } catch {
        respond(res, 404, 'File not found.');
        return;
      }
      if (!within(rootReal, resolved)) {
        respond(res, 404, 'File not found.');
        return;
      }
      const body = await readFile(resolved);
      res.statusCode = 200;
      res.setHeader('Content-Type', mimeTypes[path.extname(resolved)] || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', path.extname(resolved) === '.html' ? 'no-store' : 'public, max-age=3600');
      res.setHeader('Content-Length', body.byteLength);
      res.end(req.method === 'HEAD' ? undefined : body);
    })().catch(() => {
      if (!res.headersSent) respond(res, 500, 'The server could not complete this request.');
      else res.end();
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  createAppServer().listen(port, host, () => {
    console.log(`Ultrax server is listening on port ${port}.`);
  });
}
