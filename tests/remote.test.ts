import { describe, expect, it, vi } from 'vitest';
import { emptyState } from '../src/domain/storage';
import {
  DEVICE_CODE_KEY,
  SYNCED_AT_KEY,
  createRemoteClient,
  decideSync,
  formatDeviceCode,
  isEmptyState,
  isValidDeviceCode,
  normalizeDeviceCode,
  readDeviceCode,
  readNumber,
  stableStringify,
  stateByteSize,
  stateSignature,
  writeDeviceCode,
  writeNumber,
  type StorageLike,
} from '../src/domain/remote';

/** einfacher Speicher für die Code- und Zeitstempel-Helfer (kein localStorage in node). */
function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

describe('Geräte-Code', () => {
  it('normalisiert Eingaben so, dass sie vergleichbar werden', () => {
    expect(normalizeDeviceCode('csa-4f2k-88qd-07jt-vxy6')).toBe('4F2K88QD07JTVXY6');
    expect(normalizeDeviceCode('  csa 4f2k 88qd 07jt vxy6 ')).toBe('4F2K88QD07JTVXY6');
    // Verwechslungszeichen werden umgesetzt: O→0, I/L→1, U→V
    expect(normalizeDeviceCode('OILU')).toBe('011V');
    expect(normalizeDeviceCode('4F2K-88QD-07JT-VXY6-extra')).toHaveLength(16);
  });

  it('erkennt gültige und ungültige Codes', () => {
    expect(isValidDeviceCode('CSA-4F2K-88QD-07JT-VXY6')).toBe(true);
    expect(isValidDeviceCode('4F2K88QD07JTVXY6')).toBe(true);
    expect(isValidDeviceCode('4F2K')).toBe(false);
    expect(isValidDeviceCode('')).toBe(false);
    expect(isValidDeviceCode('###4F2K###88QD###07JT##')).toBe(false);
    expect(isValidDeviceCode('4F2K88QD07JTVXY')).toBe(false); // 15 Zeichen
  });

  it('zeigt den Code in Vierergruppen an', () => {
    expect(formatDeviceCode('4f2k88qd07jtvxy6')).toBe('CSA-4F2K-88QD-07JT-VXY6');
    expect(formatDeviceCode('4f2k 88qd-07jt-vxy6')).toBe('CSA-4F2K-88QD-07JT-VXY6');
  });

  it('merkt und vergisst den Code im Speicher', () => {
    const storage = memoryStorage();
    expect(readDeviceCode(storage)).toBeNull();
    expect(writeDeviceCode('csa-4f2k-88qd-07jt-vxy6', storage)).toBe('4F2K88QD07JTVXY6');
    expect(storage.getItem(DEVICE_CODE_KEY)).toBe('4F2K88QD07JTVXY6');
    expect(readDeviceCode(storage)).toBe('4F2K88QD07JTVXY6');
    expect(writeDeviceCode('Unsinn', storage)).toBeNull();
  });

  it('liest Zeitstempel sauber und ignoriert kaputte Werte', () => {
    const storage = memoryStorage({ [SYNCED_AT_KEY]: '1700000000000', 'kaputt': 'kein Datum' });
    expect(readNumber(SYNCED_AT_KEY, storage)).toBe(1700000000000);
    expect(readNumber('kaputt', storage)).toBe(0);
    expect(readNumber('fehlt', storage)).toBe(0);
    writeNumber(SYNCED_AT_KEY, 1700000009999, storage);
    expect(readNumber(SYNCED_AT_KEY, storage)).toBe(1700000009999);
  });
});

describe('Entscheidung über den Sync-Start', () => {
  const base = { remoteUpdatedAt: 0, localChangedAt: 0, syncedAt: 0, localEmpty: true, remoteEmpty: true };

  it('beide leer: nichts zu tun', () => {
    expect(decideSync(base)).toBe('none');
  });

  it('frische leere Server-Kopie überschreibt keinen lokalen Stand', () => {
    expect(decideSync({ ...base, remoteUpdatedAt: 500, remoteEmpty: true, localEmpty: false, localChangedAt: 400 })).toBe('push');
  });

  it('leerer Browser übernimmt den Server-Stand', () => {
    expect(decideSync({ ...base, remoteUpdatedAt: 900, remoteEmpty: false, localEmpty: true })).toBe('remote');
  });

  it('nur lokal geändert: hochladen', () => {
    expect(decideSync({ ...base, remoteEmpty: false, localEmpty: false, syncedAt: 100, localChangedAt: 400, remoteUpdatedAt: 100 })).toBe('push');
  });

  it('nur server-seitig geändert: holen', () => {
    expect(decideSync({ ...base, remoteEmpty: false, localEmpty: false, syncedAt: 100, localChangedAt: 100, remoteUpdatedAt: 400 })).toBe('remote');
  });

  it('beide Seiten geändert: nachfragen statt überschreiben', () => {
    expect(decideSync({ ...base, remoteEmpty: false, localEmpty: false, syncedAt: 100, localChangedAt: 500, remoteUpdatedAt: 400 })).toBe('conflict');
  });

  it('nichts seit der letzten Übertragung geändert: ruhe', () => {
    expect(decideSync({ ...base, remoteEmpty: false, localEmpty: false, syncedAt: 500, localChangedAt: 400, remoteUpdatedAt: 500 })).toBe('none');
  });
});

describe('Vergleich von Lernständen', () => {
  it('ignoriert die Reihenfolge der Felder', () => {
    const a = { answers: { q1: { box: 1 }, q2: { box: 2 } }, attempts: [{ at: 1 }] };
    const b = { attempts: [{ at: 1 }], answers: { q2: { box: 2 }, q1: { box: 1 } } };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(stateSignature(a)).toBe(stateSignature(b));
    expect(stateSignature(a)).not.toBe(stateSignature({ ...a, answers: { q1: { box: 5 } } }));
  });

  it('erkennt leere und gefüllte Stände', () => {
    expect(isEmptyState(emptyState())).toBe(true);
    expect(isEmptyState(null)).toBe(true);
    const filled = emptyState();
    filled.attempts.push({
      id: 'a-1',
      mode: 'learn',
      timestamp: 1,
      questionId: 'q-1',
      topic: 'collaboration',
      difficulty: 'easy',
      correct: true,
      durationMs: 1000,
      answer: ['a'],
    });
    expect(isEmptyState(filled)).toBe(false);
  });

  it('schätzt die Größe des Lernstands in Bytes', () => {
    const small = stateByteSize(emptyState());
    const filled = emptyState();
    filled.taskNotes['t-1'] = 'Notiz mit Umlauten äöüß';
    expect(stateByteSize(filled)).toBeGreaterThan(small);
  });
});

describe('Client gegen einen Schein-Server', () => {
  function fakeFetch(handler: (url: string, init?: RequestInit) => { status: number; body?: unknown }) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const result = handler(String(url), init);
      return {
        status: result.status,
        ok: result.status >= 200 && result.status < 300,
        json: async () => result.body ?? null,
      } as Response;
    });
    return { fetchImpl, calls };
  }

  it('legt ein Gerät an und liefert den Code', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ status: 201, body: { code: '4F2K88QD07JTVXY6', updatedAt: 10 } }));
    const client = createRemoteClient(fetchImpl);
    const created = await client.register();
    expect(created.code).toBe('4F2K88QD07JTVXY6');
    expect(calls[0].url).toBe('api/register');
    expect(calls[0].init?.method).toBe('POST');
  });

  it('sendet Geräte-Code und Inhalt beim Hochladen', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ status: 200, body: { updatedAt: 42, signature: 'ab-12' } }));
    const client = createRemoteClient(fetchImpl);
    await client.pushState('4F2K88QD07JTVXY6', emptyState());
    const init = calls[0].init;
    expect(calls[0].url).toBe('api/state');
    expect(init?.method).toBe('PUT');
    expect((init?.headers as Record<string, string>)['X-Device-Code']).toBe('4F2K88QD07JTVXY6');
    expect(JSON.parse(String(init?.body)).state.answers).toEqual({});
  });

  it('liefert null, wenn es noch keine Server-Kopie gibt', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 404, body: { reason: 'Keine Server-Kopie' } }));
    const client = createRemoteClient(fetchImpl);
    expect(await client.fetchState('4F2K88QD07JTVXY6')).toBeNull();
  });

  it('meldet deutsche Gründe vom Server als Fehler', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 429, body: { reason: 'Zu viele Anfragen – bitte kurz warten' } }));
    const client = createRemoteClient(fetchImpl);
    await expect(client.pushState('4F2K88QD07JTVXY6', emptyState())).rejects.toThrow('Zu viele Anfragen');
  });

  it('übernimmt einen fremden Code und prüft ihn vorher', async () => {
    const seen: string[] = [];
    const { fetchImpl } = fakeFetch((url, init) => {
      seen.push(url);
      const code = JSON.parse(String(init?.body)).code;
      return code === '4F2K88QD07JTVXY6'
        ? { status: 200, body: { ok: true, updatedAt: 7 } }
        : { status: 400, body: { reason: 'Format stimmt nicht' } };
    });
    const client = createRemoteClient(fetchImpl);
    expect(await client.redeem('csa-4f2k-88qd-07jt-vxy6')).toEqual({ ok: true, updatedAt: 7 });
    expect(seen).toEqual(['api/redeem']);
  });
});
