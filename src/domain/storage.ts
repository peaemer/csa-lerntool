import type { AppState, Settings } from './types';
import { BLUEPRINT } from './blueprint';

export const DB_NAME = 'csa-lerntool';
const STORE = 'state';
const KEY = 'app';

/** Erster Start: Systemfarbe (hell/dunkel) übernehmen, sofern bekannt. */
function preferredTheme(): 'light' | 'dark' {
  if (typeof matchMedia !== 'function') return 'light';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function defaultSettings(): Settings {
  return {
    theme: preferredTheme(),
    shuffleAnswers: true,
    examMinutes: 90,
    examQuestions: 60,
    weights: Object.fromEntries(BLUEPRINT.map((d) => [d.key, d.weight])) as Record<string, number>,
    filterTopic: null,
    filterDifficulty: null,
    filterStatus: 'all',
  };
}

export function emptyState(): AppState {
  return {
    answers: {},
    attempts: [],
    examResults: [],
    taskStatus: {},
    taskNotes: {},
    taskChecks: {},
    seenTaskVariants: [],
    settings: defaultSettings(),
    userQuestions: [],
    userTasks: [],
  };
}

function normalize(incoming: unknown): AppState {
  const base = emptyState();
  if (!incoming || typeof incoming !== 'object') return base;
  const value = incoming as Partial<AppState>;
  return { ...base, ...value, settings: { ...base.settings, ...(value.settings ?? {}) } };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB ist der Standardspeicher; localStorage dient als Fallback (z. B. in Testumgebungen). */
export async function loadState(): Promise<AppState> {
  if (typeof indexedDB === 'undefined') {
    if (typeof localStorage === 'undefined') return emptyState();
    const raw = localStorage.getItem(KEY);
    return normalize(raw ? JSON.parse(raw) : undefined);
  }
  const db = await openDb();
  const value = await new Promise<AppState | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result as AppState | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return normalize(value);
}

export async function saveState(state: AppState) {
  if (typeof indexedDB === 'undefined') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state));
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(state, KEY);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

/** Fortschritts-Backup als JSON (für Export/Download). */
export function serializeState(state: AppState) {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), state }, null, 2);
}

export function parseState(json: string): AppState {
  const raw = JSON.parse(json);
  return normalize(raw.state ?? raw);
}
