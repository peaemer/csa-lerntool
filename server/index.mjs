#!/usr/bin/env node
// Server für das CSA-Lerntool: liefert den gebauten Client (dist/) aus und hält die
// Lernstände als eine JSON-Datei pro Geräte-Code (STATE_DIR). Ohne externe Abhängigkeiten.
//
// Umgebungsvariablen (siehe deploy/env.example):
//   PORT (8787) · HOST (127.0.0.1) · STATE_DIR · PUBLIC_DIR (dist) · TRUST_PROXY
//   MAX_STATE_BYTES (1500000) · PRUNE_DAYS (0 = aus) · LIMIT_REGISTER · LIMIT_REDEEM
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, DEFAULT_MAX_BYTES, displayCode, isValidCode, normalizeCode, signature } from './store.mjs';
import { createRateLimiter } from './ratelimit.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const setting = (name, fallback) => {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
};
const flag = (name) => /^(1|true|ja|on)$/i.test(setting(name, 'false'));
const number = (name, fallback) => {
  const value = Number(setting(name, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
};

const PORT = number('PORT', 8787);
const HOST = setting('HOST', '127.0.0.1');
const PUBLIC_DIR = resolve(setting('PUBLIC_DIR', join(ROOT, 'dist')));
const STATE_DIR = resolve(setting('STATE_DIR', join(ROOT, 'server-state')));
const TRUST_PROXY = flag('TRUST_PROXY');
const MAX_BYTES = number('MAX_STATE_BYTES', DEFAULT_MAX_BYTES);
const PRUNE_DAYS = number('PRUNE_DAYS', 0);
const LIMITS = {
  register: number('LIMIT_REGISTER', 6),
  registerWindowMs: 24 * 60 * 60 * 1000,
  redeem: number('LIMIT_REDEEM', 8),
  redeemWindowMs: 60 * 60 * 1000,
  write: number('LIMIT_WRITE', 240),
  writeWindowMs: 60 * 1000,
};

const store = createStore({ dir: STATE_DIR, maxBytes: MAX_BYTES });
const limiter = createRateLimiter();

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
    "font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'",
};

class HttpError extends Error {
  constructor(status, reason) {
    super(reason);
    this.status = status;
    this.reason = reason;
  }
}

function send(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...BASE_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress ?? 'unbekannt';
}

/** Gleichartige Herkunft prüfen (verhindert Anfragen von anderen Webseiten). */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === String(req.headers.host ?? '').toLowerCase();
  } catch {
    return false;
  }
}

function readBody(req, maxBytes = MAX_BYTES + 8192) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        rejectBody(new HttpError(413, 'Nachricht zu groß'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rejectBody);
  });
}

function codeFromRequest(req) {
  const raw = Array.isArray(req.headers['x-device-code']) ? req.headers['x-device-code'][0] : req.headers['x-device-code'];
  if (!raw) throw new HttpError(400, 'Geräte-Code fehlt (Header X-Device-Code)');
  const code = normalizeCode(raw);
  if (!isValidCode(code)) throw new HttpError(400, 'Geräte-Code hat nicht das erwartete Format');
  return code;
}

async function handleApi(req, res, apiPath) {
  const ip = clientIp(req);
  const method = req.method ?? 'GET';

  if (apiPath === '/api/health' && method === 'GET') {
    return send(res, 200, {
      ok: true,
      mode: 'state-sync',
      devices: await store.count(),
      maxSizeBytes: MAX_BYTES,
      prunedDays: PRUNE_DAYS,
    });
  }

  if (!sameOrigin(req)) throw new HttpError(403, 'Anfrage von einer anderen Herkunft abgelehnt');

  if (apiPath === '/api/register' && method === 'POST') {
    if (!limiter.allow(`register:${ip}`, LIMITS.register, LIMITS.registerWindowMs)) {
      throw new HttpError(429, 'Zu viele neue Geräte in kurzer Zeit – bitte später erneut versuchen');
    }
    const created = await store.create();
    console.log(`Gerät angemeldet: ${displayCode(created.code)}`);
    return send(res, 201, { code: created.code, updatedAt: created.updatedAt });
  }

  if (apiPath === '/api/redeem' && (method === 'POST' || method === 'PUT')) {
    if (!limiter.allow(`redeem:${ip}`, LIMITS.redeem, LIMITS.redeemWindowMs)) {
      throw new HttpError(429, 'Zu viele Versuch, einen Code zu übernehmen – bitte kurz warten');
    }
    const body = await readBody(req, 4096);
    let parsed;
    try {
      parsed = JSON.parse(body || '{}');
    } catch {
      throw new HttpError(400, 'Body ist kein JSON');
    }
    const code = normalizeCode(parsed?.code ?? '');
    if (!isValidCode(code)) throw new HttpError(400, 'Geräte-Code hat nicht das erwartete Format');
    const found = await store.read(code);
    if (!found) throw new HttpError(404, 'Kein Lernstand unter diesem Code gefunden');
    if (found.corrupted) throw new HttpError(500, 'Server-Kopie ist beschädigt');
    console.log(`Code übernommen: ${displayCode(code)}`);
    return send(res, 200, { ok: true, updatedAt: found.updatedAt, signature: found.signature });
  }

  const code = codeFromRequest(req);
  if (!limiter.allow(`state:${ip}`, LIMITS.write, LIMITS.writeWindowMs)) {
    throw new HttpError(429, 'Zu viele Anfragen – bitte kurz warten');
  }

  if (apiPath === '/api/state' && method === 'GET') {
    const found = await store.read(code);
    if (!found) return send(res, 404, { reason: 'Noch keine Server-Kopie für diesen Code' });
    if (found.corrupted) throw new HttpError(500, 'Server-Kopie ist beschädigt');
    return send(res, 200, { state: found.state, updatedAt: found.updatedAt, createdAt: found.createdAt, signature: found.signature });
  }

  if (apiPath === '/api/state' && (method === 'PUT' || method === 'POST')) {
    const body = await readBody(req);
    let parsed;
    try {
      parsed = JSON.parse(body || '{}');
    } catch {
      throw new HttpError(400, 'Body ist kein JSON');
    }
    const saved = await store.write(code, parsed?.state ?? parsed);
    return send(res, 200, { ok: true, updatedAt: saved.updatedAt, bytes: saved.bytes, signature: saved.signature });
  }

  if (apiPath === '/api/state' && method === 'DELETE') {
    const removed = await store.remove(code);
    return send(res, 200, { ok: true, removed });
  }

  throw new HttpError(404, `Unbekannter Endpunkt: ${method} ${apiPath}`);
}

async function serveStatic(req, res, path) {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') throw new HttpError(405, 'Nur GET ist erlaubt');

  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw new HttpError(400, 'Ungültige Adresse');
  }
  if (decoded.includes('\0')) throw new HttpError(400, 'Ungültige Adresse');
  if (decoded === '/' || decoded === '') decoded = '/index.html';

  const file = resolve(PUBLIC_DIR, `.${decoded}`);
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + sep)) throw new HttpError(403, 'Zugriff verweigert');
  if (basename(file).startsWith('.')) throw new HttpError(404, 'Nicht gefunden');

  let data;
  try {
    data = await readFile(file);
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'EISDIR') throw error;
    if (extname(file)) throw new HttpError(404, 'Nicht gefunden');
    data = await readFile(join(PUBLIC_DIR, 'index.html')); // Single-Page-Fallback
    return endStatic(res, method, '.html', data, false);
  }
  return endStatic(res, method, extname(file), data, file.includes(`${sep}assets${sep}`));
}

function endStatic(res, method, extension, data, immutable) {
  res.writeHead(200, {
    ...BASE_HEADERS,
    'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': extension === '.html' ? 'no-cache' : immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    ETag: `"${signature({ size: data.length })}"`,
  });
  if (method === 'HEAD') res.end();
  else res.end(data);
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname.replace(/\/{2,}/g, '/').replace(/(?<=.)\/+$/, '');
  const apiIndex = path.indexOf('/api/');
  try {
    if (apiIndex >= 0) await handleApi(req, res, path.slice(apiIndex));
    else await serveStatic(req, res, path);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : Number(error?.status) || 500;
    if (status >= 500) console.error('Fehler:', error);
    if (!res.headersSent) {
      send(res, status, { reason: error.reason ?? error.message ?? 'Interner Fehler' });
    } else {
      res.end();
    }
  } finally {
    if (process.env.LOG_REQUESTS === '1') {
      console.log(`${req.method} ${path} → ${res.statusCode} (${Date.now() - started} ms)`);
    }
  }
});

async function boot() {
  await store.init();
  const removed = await store.prune(PRUNE_DAYS);
  if (removed) console.log(`Alte Lernstände gelöscht (älter als ${PRUNE_DAYS} Tage): ${removed}`);
  try {
    await readFile(join(PUBLIC_DIR, 'index.html'));
  } catch {
    console.warn(`Hinweis: Kein index.html in ${PUBLIC_DIR} – vorher npm run build ausführen.`);
  }
  server.listen(PORT, HOST, () => {
    console.log(`CSA-Lerntool läuft auf http://${HOST}:${PORT}`);
    console.log(`  Inhalte:  ${PUBLIC_DIR}`);
    console.log(`  Lernstände: ${STATE_DIR} (max. ${(MAX_BYTES / 1000).toFixed(0)} kB pro Gerät)`);
    console.log(`  Reverse-Proxy vertraut Proxy-Headern: ${TRUST_PROXY ? 'ja' : 'nein (TRUST_PROXY=1 setzen)'}`);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n${signal} – Server fährt herunter …`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}

boot().catch((error) => {
  console.error('Start fehlgeschlagen:', error);
  process.exit(1);
});
