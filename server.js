import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { getConfig, ROOT_DIR } from './src/config.js';
import { StudioStore } from './src/db.js';
import { createApiRouter } from './src/routes/api.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

export async function createStudioServer(options = {}) {
  const cfg = getConfig();
  const dataDir = options.dataDir || cfg.dataDir;
  const publicDir = options.publicDir || path.join(ROOT_DIR, 'public');
  const basePath = options.basePath !== undefined ? options.basePath : cfg.basePath;
  const cookiePath = options.cookiePath || (basePath ? `${basePath}/` : cfg.cookiePath);

  const store = new StudioStore(dataDir);
  await store.init();
  const handleApi = createApiRouter(store, { cookiePath });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (basePath) {
      if (url.pathname === basePath) {
        res.writeHead(301, { Location: `${basePath}/` });
        return res.end();
      }
      if (url.pathname.startsWith(`${basePath}/`)) {
        url.pathname = url.pathname.slice(basePath.length) || '/';
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return handleApi(req, res, url);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Method Not Allowed');
    }

    const reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const safeRelative = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(publicDir, safeRelative);

    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Forbidden');
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(publicDir, 'index.html');
    }

    try {
      const ext = path.extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
      });
      if (req.method === 'HEAD') return res.end();
      return res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not Found');
    }
  });

  server.requestTimeout = 0; // Allow long high-reasoning SSE runs
  server.headersTimeout = 60_000;

  return { server, store, config: cfg };
}

const isDirectEntry =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectEntry) {
  const { server, store, config } = await createStudioServer();
  server.listen(config.port, config.host, () => {
    console.log(
      `[CutSheet Studio] 服务已启动: http://${config.host}:${config.port} (storage=${store.mode}, OpenAI=${config.providers.openai.defaultModel}[${config.providers.openai.defaultEffort}], Google=${config.providers.google.defaultModel}[${config.providers.google.defaultEffort}])`
    );
  });

  const shutdown = () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
