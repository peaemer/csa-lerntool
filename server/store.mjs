// Datei-Ablage für die Lernstände: eine JSON-Datei pro Geräte-Code.
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32 (ohne I, L, O, U)
export const CODE_LENGTH = 16; // 16 Zeichen × 5 Bit = 80 Bit, per Zufall
export const DEFAULT_MAX_BYTES = 1_500_000;

/** Gleiche Normalisierung wie im Client (src/domain/remote.ts). */
export function normalizeCode(input) {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/^CSA/, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V')
    .slice(0, CODE_LENGTH);
}

export function isValidCode(code) {
  const normalized = normalizeCode(code);
  return normalized.length === CODE_LENGTH && [...normalized].every((c) => ALPHABET.includes(c));
}

export function displayCode(code) {
  const normalized = normalizeCode(code);
  return `CSA-${(normalized.match(/.{1,4}/g) ?? []).join('-')}`;
}

function generateCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (const byte of bytes) code += ALPHABET[byte & 31];
  return code;
}

const LIST_FIELDS = ['attempts', 'examResults', 'userQuestions', 'userTasks', 'seenTaskVariants'];
const MAP_FIELDS = ['answers', 'taskStatus', 'taskNotes', 'taskChecks'];

/** Schlüssel sortiert, damit Client und Server zum selben Signatur-Wert kommen. */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

/** Kurzfassung des Lernstands (Länge + Hash), vergleichbar mit src/domain/remote.ts. */
export function signature(value) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

/**
 * Grobe Prüfung der Struktur (die inhaltliche Aufarbeitung macht der Client mit
 * normalize() in src/domain/storage.ts). Zurück kommt null bei in Ordnung, sonst
 * ein deutscher Grund für die Meldung im Browser.
 */
export function stateProblem(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 'state ist kein Objekt';
  for (const field of LIST_FIELDS) {
    if (state[field] !== undefined && !Array.isArray(state[field])) return `${field} muss eine Liste sein`;
  }
  for (const field of MAP_FIELDS) {
    const value = state[field];
    if (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value))) {
      return `${field} muss ein Objekt sein`;
    }
  }
  for (const [field, limit] of [
    ['attempts', 20000],
    ['examResults', 2000],
    ['userQuestions', 5000],
    ['userTasks', 2000],
    ['seenTaskVariants', 5000],
  ]) {
    if (Array.isArray(state[field]) && state[field].length > limit) return `${field} enthält zu viele Einträge`;
  }
  return null;
}

function fileFor(dir, code) {
  const normalized = normalizeCode(code);
  if (!isValidCode(normalized)) throw new Error('unzulässiger Geräte-Code');
  return join(dir, `${normalized}.json`);
}

async function readRecord(file) {
  try {
    const raw = await readFile(file, 'utf8');
    const record = JSON.parse(raw);
    return { record, bytes: Buffer.byteLength(raw, 'utf8') };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) return { record: null, corrupted: true, bytes: 0 };
    throw error;
  }
}

export function createStore({ dir, maxBytes = DEFAULT_MAX_BYTES }) {
  return {
    dir,
    maxBytes,

    async init() {
      await mkdir(dir, { recursive: true });
    },

    /** Neuer Geräte-Code, noch ohne Inhalt. */
    async create() {
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = generateCode();
        if (!(await readRecord(fileFor(dir, code)))) {
          return { code: normalizeCode(code), updatedAt: Date.now() };
        }
      }
      throw new Error('kein freier Geräte-Code erhalten');
    },

    /** Gibt null zurück, wenn es keine Server-Kopie gibt. */
    async read(code) {
      const found = await readRecord(fileFor(dir, code));
      if (!found) return null;
      if (found.corrupted) return { corrupted: true };
      return {
        state: found.record.state ?? null,
        updatedAt: Number(found.record.updatedAt) || 0,
        createdAt: Number(found.record.createdAt) || 0,
        signature: String(found.record.signature ?? '') || signature(found.record.state ?? null),
      };
    },

    /** Atomares Schreiben (Temporärdatei + Umbenennen), letzter Schreibgewinner zählt. */
    async write(code, state) {
      const problem = stateProblem(state);
      if (problem) {
        const error = new Error(problem);
        error.status = 400;
        throw error;
      }
      const record = {
        version: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        signature: signature(state),
        state,
      };
      const text = JSON.stringify(record);
      const bytes = Buffer.byteLength(text, 'utf8');
      if (bytes > maxBytes) {
        const error = new Error(`Lernstand ist zu groß (${bytes} Bytes, erlaubt ${maxBytes} Bytes)`);
        error.status = 413;
        throw error;
      }
      const file = fileFor(dir, code);
      const existing = await readRecord(file);
      if (existing?.record?.createdAt) record.createdAt = existing.record.createdAt;
      const finalText = JSON.stringify(record);
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, finalText, 'utf8');
      await rename(tmp, file);
      return { updatedAt: record.updatedAt, signature: record.signature, bytes: Buffer.byteLength(finalText, 'utf8') };
    },

    async remove(code) {
      try {
        await unlink(fileFor(dir, code));
        return true;
      } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
      }
    },

    async count() {
      try {
        const names = await readdir(dir);
        return names.filter((name) => /^[0-9A-Z]{16}\.json$/.test(name)).length;
      } catch {
        return 0;
      }
    },

    /** Alte Kopien löschen (PRUNE_DAYS). Gibt die Anzahl der Löschungen zurück. */
    async prune(days) {
      if (!(days > 0)) return 0;
      const limit = Date.now() - days * 24 * 60 * 60 * 1000;
      let removed = 0;
      for (const name of await readdir(dir)) {
        if (!/^[0-9A-Z]{16}\.json$/.test(name)) continue;
        const found = await readRecord(join(dir, name));
        const updatedAt = Number(found?.record?.updatedAt) || 0;
        if (updatedAt && updatedAt < limit) {
          await unlink(join(dir, name)).catch(() => undefined);
          removed++;
        }
      }
      return removed;
    },
  };
}
