import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATIC_QUESTIONS, STATIC_TASKS } from '../domain/content';
import {
  LOCAL_CHANGED_AT_KEY,
  SYNCED_AT_KEY,
  createRemoteClient,
  decideSync,
  forgetDeviceCode,
  formatDeviceCode,
  isEmptyState,
  readDeviceCode,
  readNumber,
  writeDeviceCode,
  writeNumber,
  type RemoteClient,
  type RemoteSnapshot,
  type SyncDecision,
  type SyncInfo,
} from '../domain/remote';
import { emptyState, loadState, normalizeState, saveState } from '../domain/storage';
import type { AppState, Question, Task } from '../domain/types';

export type Mutator = (draft: AppState) => void;

export interface Store {
  state: AppState;
  ready: boolean;
  mutate: (fn: Mutator) => void;
  questions: Question[];
  tasks: Task[];
  /** Stand der Server-Synchronisation für Anzeige und Bedienung. */
  sync: SyncInfo;
  /** Server-Kopie und lokaler Stand sind beide verändert – Entscheidung nötig. */
  conflict: RemoteSnapshot | null;
  busy: boolean;
  note: string | null;
  setNote: (text: string | null) => void;
  /** Server-Kopie für dieses Gerät anlegen (Geräte-Code wird erzeugt). */
  enableSync: () => Promise<void>;
  /** Code eines anderen Geräts übernehmen (dort weiterlernen). */
  attachCode: (code: string) => Promise<void>;
  /** Verbindung lösen – der Server behält die Kopie. */
  detach: () => void;
  pushNow: () => Promise<void>;
  pullNow: () => Promise<void>;
  deleteRemote: () => Promise<void>;
  checkServer: () => Promise<void>;
  /** Konfliktfall: eigener Stand hochladen oder Server-Stand übernehmen. */
  resolveConflict: (choice: 'local' | 'remote') => Promise<void>;
}

interface BootResult {
  local: AppState;
  code: string | null;
  decision: SyncDecision | 'offline';
  snapshot: RemoteSnapshot | null;
  reason?: string;
}

/**
 * Der Startablauf (lokal laden, Server-Kopie holen, Entscheidung treffen) läuft einmal
 * pro Seitenvorgang – auch im StrictMode der Entwicklung wird er nicht zweimal ausgeführt.
 */
let bootTask: Promise<BootResult> | null = null;

async function bootSequence(client: RemoteClient): Promise<BootResult> {
  const local = await loadState().catch((err: unknown) => {
    console.warn('Fortschritt konnte nicht geladen werden', err);
    return emptyState();
  });
  const code = readDeviceCode();
  if (!code) return { local, code: null, decision: 'none', snapshot: null };
  try {
    const snapshot = await client.fetchState(code);
    const decision = decideSync({
      remoteUpdatedAt: snapshot?.updatedAt ?? 0,
      localChangedAt: readNumber(LOCAL_CHANGED_AT_KEY),
      syncedAt: readNumber(SYNCED_AT_KEY),
      localEmpty: isEmptyState(local),
      remoteEmpty: !snapshot || isEmptyState(snapshot.state),
    });
    return { local, code, decision, snapshot };
  } catch (err) {
    return { local, code, decision: 'offline', snapshot: null, reason: (err as Error).message };
  }
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Uhrzeit für Kurzmeldungen. */
function clock(value: number): string {
  return new Date(value).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Zentraler App-State: einmal aus IndexedDB laden, jede Änderung wird persistiert.
 * Zusätzlich läuft die Synchronisation mit dem Server (Geräte-Code), sofern vorhanden.
 */
export function useStore(): Store {
  const [state, setState] = useState<AppState>(() => emptyState());
  const [ready, setReady] = useState(false);
  const [conflict, setConflict] = useState<RemoteSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncInfo>(() => {
    const code = readDeviceCode();
    return {
      status: code ? 'offline' : 'local',
      code,
      syncedAt: readNumber(SYNCED_AT_KEY) || null,
      remoteUpdatedAt: null,
      localChangedAt: readNumber(LOCAL_CHANGED_AT_KEY) || null,
      message: code ? 'Server-Kopie wird geprüft …' : 'Lernstand nur in diesem Browser',
    };
  });

  const client = useMemo(() => createRemoteClient(), []);
  const stateRef = useRef(state);
  stateRef.current = state;
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const conflictRef = useRef<RemoteSnapshot | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const patchSync = useCallback((patch: Partial<SyncInfo>) => {
    setSync((previous) => ({ ...previous, ...patch }));
  }, []);

  /** Lernstand zum Server senden; Zeitstempel der Übertragung merken. */
  const pushNow = useCallback(async () => {
    const code = readDeviceCode();
    if (!code) return;
    setBusy(true);
    try {
      const saved = await client.pushState(code, stateRef.current);
      writeNumber(SYNCED_AT_KEY, saved.updatedAt);
      writeNumber(LOCAL_CHANGED_AT_KEY, 0);
      conflictRef.current = null;
      setConflict(null);
      patchSync({
        status: 'synced',
        code,
        syncedAt: saved.updatedAt,
        remoteUpdatedAt: saved.updatedAt,
        localChangedAt: null,
        message: `Lernstand auf dem Server gespeichert · ${clock(saved.updatedAt)}`,
      });
    } catch (err) {
      patchSync({ status: 'error', message: `Speichern auf dem Server fehlgeschlagen: ${reason(err)}` });
    } finally {
      setBusy(false);
    }
  }, [client, patchSync]);

  /** Server-Stand holen und lokal übernehmen (ersetzt den Stand in diesem Browser). */
  const pullNow = useCallback(async () => {
    const code = readDeviceCode();
    if (!code) return;
    setBusy(true);
    try {
      const snapshot = await client.fetchState(code);
      if (!snapshot || !snapshot.state) {
        patchSync({ remoteUpdatedAt: snapshot?.updatedAt ?? null, message: 'Server-Kopie ist noch leer.' });
        return;
      }
      const incoming = normalizeState(snapshot.state);
      stateRef.current = incoming;
      setState(incoming);
      await saveState(incoming);
      writeNumber(SYNCED_AT_KEY, snapshot.updatedAt || Date.now());
      writeNumber(LOCAL_CHANGED_AT_KEY, 0);
      conflictRef.current = null;
      setConflict(null);
      patchSync({
        status: 'synced',
        code: readDeviceCode(),
        syncedAt: Date.now(),
        remoteUpdatedAt: snapshot.updatedAt,
        localChangedAt: null,
        message: `Lernstand vom Server geholt · Stand ${clock(snapshot.updatedAt || Date.now())}`,
      });
    } catch (err) {
      patchSync({ status: 'error', message: `Server-Stand konnte nicht geladen werden: ${reason(err)}` });
    } finally {
      setBusy(false);
    }
  }, [client, patchSync]);

  const schedulePush = useCallback(() => {
    const code = readDeviceCode();
    if (!code || conflictRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      void pushNow();
    }, 800);
  }, [pushNow]);

  useEffect(() => {
    let alive = true;
    if (!bootTask) bootTask = bootSequence(client);
    void bootTask.then((boot) => {
      if (!alive) return;
      // Vor dem Senden muss der Referenz-Stand gesetzt sein – sonst geht ein leerer
      // Zustand an den Server, obwohl IndexedDB Inhalte hat.
      stateRef.current = boot.local;
      setState(boot.local);
      setReady(true);
      if (boot.decision === 'offline') {
        patchSync({ status: 'offline', message: `Server nicht erreichbar (${boot.reason ?? ''}) – gelernt wird lokal weiter.` });
        return;
      }
      if (boot.decision === 'conflict' && boot.snapshot) {
        conflictRef.current = boot.snapshot;
        setConflict(boot.snapshot);
        patchSync({
          status: 'conflict',
          remoteUpdatedAt: boot.snapshot.updatedAt,
          localChangedAt: readNumber(LOCAL_CHANGED_AT_KEY) || null,
          message: 'Beide Seiten haben gelernt – bitte wählen, welcher Stand weitergezählt wird.',
        });
        return;
      }
      if (boot.decision === 'remote' && boot.snapshot?.state) {
        const incoming = normalizeState(boot.snapshot.state);
        stateRef.current = incoming;
        setState(incoming);
        void saveState(incoming);
        // Zeitstempel merken, sonst würde beim nächsten Laden erneut geholt.
        writeNumber(SYNCED_AT_KEY, boot.snapshot.updatedAt || Date.now());
        writeNumber(LOCAL_CHANGED_AT_KEY, 0);
        patchSync({
          status: 'synced',
          syncedAt: boot.snapshot.updatedAt,
          remoteUpdatedAt: boot.snapshot.updatedAt,
          localChangedAt: null,
          message: `Lernstand vom Server geholt (${clock(boot.snapshot.updatedAt || Date.now())}).`,
        });
        return;
      }
      if (boot.decision === 'push') {
        patchSync({ status: 'pending', remoteUpdatedAt: boot.snapshot?.updatedAt ?? null, message: 'Lernstand wird auf den Server geladen …' });
        void pushNow();
        return;
      }
      patchSync({
        status: boot.code ? 'synced' : 'local',
        remoteUpdatedAt: boot.snapshot?.updatedAt ?? null,
        message: boot.code ? 'Lernstand ist auf dem Server.' : 'Lernstand nur in diesem Browser',
      });
    });
    return () => {
      alive = false;
    };
  }, [client, patchSync, pushNow]);

  // Beim Verlassen des Tab sofort senden, damit nichts liegen bleibt.
  useEffect(() => {
    const flush = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
      if (readDeviceCode() && !conflictRef.current) void pushNow();
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [pushNow]);

  const mutate = useCallback(
    (fn: Mutator) => {
      const draft = structuredClone(stateRef.current);
      fn(draft);
      stateRef.current = draft;
      setState(draft);
      writeNumber(LOCAL_CHANGED_AT_KEY, Date.now());
      void saveState(draft).catch((err: unknown) => console.warn('Fortschritt konnte nicht gesichert werden', err));
      if (readDeviceCode() && !conflictRef.current) {
        patchSync({ status: 'pending', localChangedAt: Date.now(), message: 'Änderung wartet auf die Übertragung …' });
        schedulePush();
      }
    },
    [patchSync, schedulePush],
  );

  const enableSync = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const created = await client.register();
      const code = writeDeviceCode(created.code);
      patchSync({ status: 'pending', code, message: 'Gerät verknüpft – Lernstand wird geladen …' });
      if (code) {
        const saved = await client.pushState(code, stateRef.current);
        writeNumber(SYNCED_AT_KEY, saved.updatedAt);
        writeNumber(LOCAL_CHANGED_AT_KEY, 0);
        patchSync({ status: 'synced', syncedAt: saved.updatedAt, remoteUpdatedAt: saved.updatedAt, localChangedAt: null, message: `Lernstand auf dem Server gespeichert · ${clock(saved.updatedAt)}` });
      }
      setNote(`Neuer Geräte-Code: ${formatDeviceCode(created.code)}. Auf den anderen Geräten dort eintragen.`);
    } catch (err) {
      patchSync({ status: 'error', message: `Verknüpfung fehlgeschlagen: ${reason(err)}` });
      setNote(`Der Server ist nicht erreichbar: ${reason(err)}`);
    } finally {
      setBusy(false);
    }
  }, [client, patchSync]);

  const attachCode = useCallback(
    async (input: string) => {
      setBusy(true);
      setNote(null);
      try {
        const check = await client.redeem(input);
        if (!check.ok) {
          setNote(check.reason ?? 'Code gehört nicht.');
          patchSync({ status: 'error', message: check.reason ?? 'Code gehört nicht.' });
          return;
        }
        const code = writeDeviceCode(input);
        if (!code) {
          setNote('Code konnte nicht gemerkt werden.');
          return;
        }
        patchSync({ code, remoteUpdatedAt: check.updatedAt });
        await pullNow();
      } catch (err) {
        patchSync({ status: 'error', message: `Code konnte nicht übernommen werden: ${reason(err)}` });
        setNote(`Code konnte nicht übernommen werden: ${reason(err)}`);
      } finally {
        setBusy(false);
      }
    },
    [client, patchSync, pullNow],
  );

  const detach = useCallback(() => {
    forgetDeviceCode();
    conflictRef.current = null;
    setConflict(null);
    patchSync({ status: 'local', code: null, syncedAt: null, remoteUpdatedAt: null, message: 'Sync gelöst – gelernt wird nur noch lokal.' });
    setNote('Sync gelöst. Die Server-Kopie bleibt erhalten und ist über den Code weiter nutzbar.');
  }, [patchSync]);

  const deleteRemote = useCallback(async () => {
    const code = readDeviceCode();
    if (!code) return;
    setBusy(true);
    try {
      await client.deleteState(code);
      conflictRef.current = null;
      setConflict(null);
      patchSync({ status: 'local', syncedAt: null, remoteUpdatedAt: null, message: 'Server-Kopie gelöscht – Sync ist aus.' });
      forgetDeviceCode();
      setNote('Server-Kopie gelöscht. Der lokale Lernstand in diesem Browser bleibt, bis er auch hier gelöscht wird.');
    } catch (err) {
      patchSync({ status: 'error', message: `Server-Kopie konnte nicht gelöscht werden: ${reason(err)}` });
    } finally {
      setBusy(false);
    }
  }, [client, patchSync]);

  const checkServer = useCallback(async () => {
    setBusy(true);
    try {
      const health = await client.health();
      setNote(`Server erreichbar · ${health.devices} Gerät(e) verknüpft · Lernstand max. ${Math.round(health.maxSizeBytes / 1000)} kB`);
      patchSync({ message: 'Server erreichbar.' });
    } catch (err) {
      setNote(`Server nicht erreichbar: ${reason(err)}`);
      patchSync({ status: 'offline', message: 'Server nicht erreichbar.' });
    } finally {
      setBusy(false);
    }
  }, [client, patchSync]);

  const resolveConflict = useCallback(
    async (choice: 'local' | 'remote') => {
      if (choice === 'local') await pushNow();
      else await pullNow();
    },
    [pullNow, pushNow],
  );

  const questions = useMemo(
    () => [...STATIC_QUESTIONS, ...state.userQuestions],
    [state.userQuestions],
  );
  const tasks = useMemo(() => [...STATIC_TASKS, ...state.userTasks], [state.userTasks]);

  return {
    state,
    ready,
    mutate,
    questions,
    tasks,
    sync,
    conflict,
    busy,
    note,
    setNote,
    enableSync,
    attachCode,
    detach,
    pushNow,
    pullNow,
    deleteRemote,
    checkServer,
    resolveConflict,
  };
}
