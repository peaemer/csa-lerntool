#!/usr/bin/env node
// Prüft eine laufende Installation des CSA-Lerntools: Oberfläche, Sync-Endpunkte,
// Fehlerbehandlung. Gegen eine echte Server-Adresse dieselbe Datei benutzen.
//
//   npm run smoke                       → http://127.0.0.1:8787
//   node scripts/server-smoke.mjs https://csa.beispiel.de
//
// Am Ende ist der angelegte Geräte-Code wieder gelöscht.
const base = (process.argv[2] ?? process.env.SMOKE_URL ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok      ${label}${detail ? ` – ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FEHLER  ${label}${detail ? ` – ${detail}` : ''}`);
  }
}

async function request(path, init = {}, code) {
  const headers = { Origin: base, ...(init.headers ?? {}) };
  if (code) headers['X-Device-Code'] = code;
  const response = await fetch(`${base}${path}`, { ...init, headers });
  let body = null;
  const text = await response.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, ok: response.ok, body, headers: response.headers };
}

console.log(`Prüfe ${base}`);

const health = await request('/api/health');
check('api/health antwortet', health.ok && health.body?.ok === true, `Geräte: ${health.body?.devices}`);
check('health nennt die Größen-Obergrenze', typeof health.body?.maxSizeBytes === 'number');

const index = await request('/');
check('Oberfläche wird ausgeliefert', index.status === 200 && String(index.body).includes('<div id="root">'));
check('Sicherheits-Hersteller gesetzt', String(index.headers.get('content-security-policy') ?? '').includes("default-src 'self'"));
check('index.html wird nicht gecacht', index.headers.get('cache-control') === 'no-cache');

const deep = await request('/irgendeine/unteradresse');
check('Single-Page-Fallback funktioniert', deep.status === 200 && String(deep.body).includes('<div id="root">'));

const outside = await request('/%2e%2e/package.json');
check('Pfad nach außerhalb wird nicht ausgeliefert', outside.status === 403 || outside.status === 404, `Status ${outside.status}`);

const created = await request('/api/register', { method: 'POST' });
check('Gerät anmelden', created.status === 201 && typeof created.body?.code === 'string', created.body?.code);
const code = created.body?.code ?? '';

const sample = {
  version: 1,
  state: {
    answers: { 'q-beispiel': { questionId: 'q-beispiel', topic: 'collaboration', difficulty: 'easy', box: 3, correctCount: 2, wrongCount: 0, firstSeen: 1, lastSeen: 2, history: [1, 1] } },
    attempts: [],
    examResults: [],
    taskStatus: { 't-beispiel': 'done' },
    taskNotes: {},
    taskChecks: {},
    seenTaskVariants: [],
    userQuestions: [],
    userTasks: [],
  },
};

const saved = await request('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sample) }, code);
check('Lernstand speichern', saved.ok && typeof saved.body?.updatedAt === 'number', `${saved.body?.bytes} Bytes`);

const loaded = await request('/api/state', {}, code);
check('Lernstand wieder holen', loaded.ok && loaded.body?.state?.taskStatus?.['t-beispiel'] === 'done');
check('Signatur stimmt mit der Speicher-Signatur überein', loaded.body?.signature === saved.body?.signature, loaded.body?.signature);

const other = await request('/api/state', {}, '0000000000000000');
check('fremder Code wird nicht gelesen', other.status === 404, other.body?.reason);

const redeemed = await request('/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: `csa-${code}` }) });
check('Code mit CSA-Vorsilbe übernehmen', redeemed.ok && redeemed.body?.ok === true);

const foreign = await request('/api/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '0000000000000000' }) });
check('unbekannten Code ablehnen', foreign.status === 404 || foreign.status === 400, foreign.body?.reason);

const broken = await request('/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: { attempts: 'keine Liste' } }) }, code);
check('kaputte Struktur ablehnen', broken.status === 400, broken.body?.reason);

const huge = await request(
  '/api/state',
  { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: { taskNotes: { 't-gross': 'x'.repeat((health.body?.maxSizeBytes ?? 1500000) + 10) } } }) },
  code,
);
check('zu großen Lernstand ablehnen', huge.status === 413, huge.body?.reason);

const removed = await request('/api/state', { method: 'DELETE' }, code);
check('Server-Kopie löschen', removed.ok && removed.body?.removed === true);

const gone = await request('/api/state', {}, code);
check('nach dem Löschen ist die Kopie weg', gone.status === 404);

console.log(`\n${passed} geprüft, ${failed} Fehler`);
process.exit(failed === 0 ? 0 : 1);
