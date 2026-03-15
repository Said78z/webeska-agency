const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const leadHandler = require('./api/lead');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const ROOT = process.cwd();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res, pathname) {
  const cleanPath = pathname === '/' ? '/index.html' : pathname;
  const unsafePath = path.normalize(cleanPath).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(ROOT, unsafePath);

  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { ok: false, error: 'forbidden' });
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (error.code === 'ENOENT') {
        sendJson(res, 404, { ok: false, error: 'not_found' });
        return;
      }
      sendJson(res, 500, { ok: false, error: 'read_error' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
}

function invokeApiHandler(handler, req, res, body) {
  req.body = body;

  const wrappedRes = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      sendJson(res, this.statusCode, payload);
      return this;
    },
  };

  Promise.resolve(handler(req, wrappedRes)).catch(() => {
    sendJson(res, 500, { ok: false, error: 'internal_error' });
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url || '/');
  const pathname = parsed.pathname || '/';

  if (pathname === '/api/lead') {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        req.socket.destroy();
      }
    });

    req.on('end', () => {
      let body = {};
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          sendJson(res, 400, { ok: false, error: 'invalid_json' });
          return;
        }
      }

      invokeApiHandler(leadHandler, req, res, body);
    });

    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`Local server running on http://localhost:${PORT}`);
});
