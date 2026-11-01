import type { AppState } from './types';

/**
 * Client für die server-seitige Ablage des Lernstands (server/index.mjs).
 * Der Browser behält IndexedDB als lokalen Speicher; der Server ist die Sync-Kopie,
 * die über einen Geräte-Code angesprochen wird. Kein Login, kein Cookie.
 */

export const DEVICE_CODE_KEY = 'csa-lerntool.device';
export const SYNCED_AT_KEY = 'csa-lerntool.synced-at';
export const LOCAL_CHANGED_AT_KEY = 'csa-lerntool.changed-at';

/** Obergrenze für die Lernstand-Datei (server-seitig identisch, siehe server/store.mjs). */
export const MAX_STATE_BYTES = 1_500_000;

export type SyncStatus = 'local' | 'synced' | 'pending' | 'offline' | 'error' | 'conflict';

export interface SyncInfo {
  status: SyncStatus;
  /** Geräte-Code, wenn dieses Gerät mit dem Server verknüpft ist. */
  code: string | null;
  /** Zeitstempel der letzten erfolgreichen Übertragung (Millisekunden). */
  syncedAt: number | null;
  /** Zeitstempel der Server-Kopie. */
  remoteUpdatedAt: number | null;
  /** Letzte Änderung auf diesem Gerät (für die Anzeige im Konfliktfall). */
  localChangedAt: number | null;
  /** Deutsche Kurzmeldung für die Oberfläche. */
  message: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage, oder ein Speicher, der einfach nichts tut (Privatmodus, Tests). */
export const browserStorage: StorageLike = (() => {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* Zugriff verweigert (Privacy-Einstellung) */
  }
  return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
})();

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // ohne I, L, O, U
const CODE_LENGTH = 16;

/**
 * Macht einen eingegebenen Code vergleichbar: Großschreibung, ohne Trennzeichen,
 * ohne Verwechslungs-Buchstaben (O→0, I/L→1, U→V).
 */
export function normalizeDeviceCode(input: string): string {
  const raw = String(input ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/^CSA/, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
  return raw.slice(0, CODE_LENGTH);
}

export function isValidDeviceCode(code: string): boolean {
  const normalized = normalizeDeviceCode(code);
  return normalized.length === CODE_LENGTH && [...normalized].every((c) => CODE_ALPHABET.includes(c));
}

/** anzeigbar in Vierergruppen: CSA-4F2K-… */
export function formatDeviceCode(code: string): string {
  const normalized = normalizeDeviceCode(code);
  const groups = normalized.match(/.{1,4}/g) ?? [];
  return groups.length ? `CSA-${groups.join('-')}` : '';
}

export function readDeviceCode(storage: StorageLike = browserStorage): string | null {
  const stored = storage.getItem(DEVICE_CODE_KEY);
  return stored && isValidDeviceCode(stored) ? normalizeDeviceCode(stored) : null;
}

export function writeDeviceCode(code: string, storage: StorageLike = browserStorage): string | null {
  if (!isValidDeviceCode(code)) return null;
  const normalized = normalizeDeviceCode(code);
  storage.setItem(DEVICE_CODE_KEY, normalized);
  return normalized;
}

export function forgetDeviceCode(storage: StorageLike = browserStorage) {
  storage.removeItem(DEVICE_CODE_KEY);
  storage.removeItem(SYNCED_AT_KEY);
}

export function readNumber(key: string, storage: StorageLike = browserStorage): number {
  const value = Number(storage.getItem(key));
  return Number.isFinite(value) ? value : 0;
}

export function writeNumber(key: string, value: number, storage: StorageLike = browserStorage) {
  storage.setItem(key, String(value));
}

/** Reihenfolge-unabhängiger Text eines Objekts, damit man Stände vergleichen kann. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function stateSignature(state: unknown): string {
  const text = stableStringify(state);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

export function stateByteSize(state: unknown): number {
  const text = stableStringify(state);
  // Näherung für UTF-8: Umlaute zählen als 2 Bytes.
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
    if (code > 0xffff) i++;
  }
  return bytes;
}

/** Lernstand ohne nennenswerte Inhalte (dient der Entscheidung beim ersten Sync). */
export function isEmptyState(state: AppState | null | undefined): boolean {
  if (!state) return true;
  return (
    Object.keys(state.answers ?? {}).length === 0 &&
    (state.attempts ?? []).length === 0 &&
    (state.examResults ?? []).length === 0 &&
    Object.keys(state.taskStatus ?? {}).length === 0 &&
    Object.keys(state.taskNotes ?? {}).length === 0 &&
    (state.userQuestions ?? []).length === 0 &&
    (state.userTasks ?? []).length === 0
  );
}

export interface SyncDecisionInput {
  /** Zeitstempel der Server-Kopie (0 = keine Kopie vorhanden). */
  remoteUpdatedAt: number;
  /** Letzte lokale Änderung (0 = nie lokal geändert). */
  localChangedAt: number;
  /** Letzte gemeinsame Übertragung (0 = noch nie synchronisiert). */
  syncedAt: number;
  /** Lokaler Stand ist inhaltlich leer. */
  localEmpty: boolean;
  /** Server-Kopie ist inhaltlich leer oder fehlt ganz. */
  remoteEmpty: boolean;
}

export type SyncDecision = 'none' | 'remote' | 'push' | 'conflict';

/**
 * Wer gewinnt beim Start? Verglichen wird mit dem Zeitpunkt der letzten gemeinsamen
 * Übertragung: hat nur eine Seite seitdem geändert, wird diese übernommen – haben beide
 * geändert, fragt die Oberfläche nach (kein automatischer Datenverlust).
 * Leere Stände gewinnen nie: eine frisch angelegte Server-Kopie überschreibt keinen
 * gewachsenen lokalen Lernstand und umgekehrt.
 */
export function decideSync(input: SyncDecisionInput): SyncDecision {
  const { remoteUpdatedAt, localChangedAt, syncedAt, localEmpty, remoteEmpty } = input;
  if (remoteEmpty && localEmpty) return 'none';
  if (remoteEmpty) return localEmpty ? 'none' : 'push';
  if (localEmpty) return 'remote';
  const remoteChanged = remoteUpdatedAt > syncedAt;
  const localChanged = localChangedAt > syncedAt;
  if (remoteChanged && localChanged) return 'conflict';
  if (remoteChanged) return 'remote';
  if (localChanged) return 'push';
  return 'none';
}

export interface RemoteHealth {
  ok: boolean;
  /** Anzahl gespeicherter Geräte-Codes (ohne Inhalte). */
  devices: number;
  maxSizeBytes: number;
}

export interface RemoteSnapshot {
  state: AppState | null;
  updatedAt: number;
  signature: string;
}

export interface RedeemResult {
  ok: boolean;
  updatedAt: number;
  reason?: string;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

async function call(fetchImpl: FetchLike, url: string, init: RequestInit = {}) {
  const response = await fetchImpl(url, init);
  if (response.status === 404) return null;
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const reason = (body as { reason?: string } | null)?.reason ?? `HTTP ${response.status}`;
    throw new Error(reason);
  }
  return body;
}

export function createRemoteClient(fetchImpl: FetchLike = (...args) => fetch(...args)) {
  const withCode = (code: string) => ({ 'X-Device-Code': code });
  return {
    async health(): Promise<RemoteHealth> {
      const body = (await call(fetchImpl, 'api/health')) as RemoteHealth | null;
      if (!body) throw new Error('nicht erreichbar');
      return body;
    },
    /** Neue Server-Kopie anlegen; gibt den Geräte-Code zurück. */
    async register(): Promise<{ code: string; updatedAt: number }> {
      const body = (await call(fetchImpl, 'api/register', { method: 'POST' })) as
        | { code: string; updatedAt: number }
        | null;
      if (!body?.code) throw new Error('Server hat keinen Code erhalten');
      return body;
    },
    async fetchState(code: string): Promise<RemoteSnapshot | null> {
      const body = (await call(fetchImpl, 'api/state', { headers: withCode(code) })) as RemoteSnapshot | null;
      return body;
    },
    async pushState(code: string, state: AppState): Promise<{ updatedAt: number; signature: string }> {
      const body = (await call(fetchImpl, 'api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...withCode(code) },
        body: JSON.stringify({ state }),
      })) as { updatedAt: number; signature: string } | null;
      if (!body) throw new Error('Server hat den Stand nicht übernommen');
      return body;
    },
    /** Code eines anderen Geräts übernehme (damit dort weitergelernt wird). */
    async redeem(codeInput: string): Promise<RedeemResult> {
      const body = (await call(fetchImpl, 'api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalizeDeviceCode(codeInput) }),
      })) as RedeemResult | null;
      return body ?? { ok: false, updatedAt: 0, reason: 'Server antwortet nicht' };
    },
    /** Server-Kopie löschen (lokaler Stand bleibt erhalten). */
    async deleteState(code: string): Promise<void> {
      await call(fetchImpl, 'api/state', { method: 'DELETE', headers: withCode(code) });
    },
  };
}

export type RemoteClient = ReturnType<typeof createRemoteClient>;
