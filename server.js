const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const PORT = process.env.PORT ? Number(process.env.PORT) : 5173;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const DEFAULT_STORE = {
  ukeire_users_v1: [],
  ukeire_session_v1: '',
  ukeire_nohinsho_records_v1: [],
  ukeire_sidebar_collapsed_v1: '0'
};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function normalizeStore(data) {
  if (!data || typeof data !== 'object') return { ...DEFAULT_STORE };
  return {
    ukeire_users_v1: Array.isArray(data.ukeire_users_v1) ? data.ukeire_users_v1 : [],
    ukeire_session_v1: typeof data.ukeire_session_v1 === 'string' ? data.ukeire_session_v1 : '',
    ukeire_nohinsho_records_v1: Array.isArray(data.ukeire_nohinsho_records_v1) ? data.ukeire_nohinsho_records_v1 : [],
    ukeire_sidebar_collapsed_v1: data.ukeire_sidebar_collapsed_v1 === '1' ? '1' : '0'
  };
}

async function ensureStoreFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(STORE_FILE, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(STORE_FILE, JSON.stringify(DEFAULT_STORE, null, 2), 'utf8');
  }
}

async function readStore() {
  await ensureStoreFile();
  const raw = await fsp.readFile(STORE_FILE, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { ...DEFAULT_STORE };
  }
  const normalized = normalizeStore(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
    await writeStore(normalized);
  }
  return normalized;
}

async function writeStore(data) {
  await ensureStoreFile();
  const normalized = normalizeStore(data);
  await fsp.writeFile(STORE_FILE, JSON.stringify(normalized, null, 2), 'utf8');
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function resolveStaticPath(requestPath) {
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  const decoded = decodeURIComponent(safePath.split('?')[0]);
  const normalized = path.normalize(decoded).replace(/^([.][.][/\\])+/, '');
  return path.join(ROOT_DIR, normalized);
}

async function serveStatic(req, res, urlPath) {
  const filePath = resolveStaticPath(urlPath);
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      const data = await fsp.readFile(indexPath);
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES['.html'] });
      res.end(data);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const data = await fsp.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);

    if (urlObj.pathname === '/api/store') {
      if (req.method === 'GET') {
        const store = await readStore();
        sendJson(res, 200, store);
        return;
      }

      if (req.method === 'PUT') {
        const body = await readRequestBody(req);
        let payload;
        try {
          payload = JSON.parse(body || '{}');
        } catch {
          sendJson(res, 400, { error: 'Invalid JSON' });
          return;
        }

        await writeStore(payload);
        const store = await readStore();
        sendJson(res, 200, store);
        return;
      }

      sendJson(res, 405, { error: 'Method Not Allowed' });
      return;
    }

    await serveStatic(req, res, urlObj.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Internal Server Error' });
  }
});

ensureStoreFile()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  });
