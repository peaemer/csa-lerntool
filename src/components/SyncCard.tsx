import { useState } from 'react';
import type { Store } from '../app/store';
import { formatDeviceCode } from '../domain/remote';

interface Props {
  store: Store;
}

const STATUS_LABEL: Record<string, string> = {
  local: 'nur lokal',
  synced: 'synchron',
  pending: 'wartet',
  offline: 'Server nicht erreichbar',
  error: 'Fehler',
  conflict: 'Konflikt',
};

const STATUS_CLASS: Record<string, string> = {
  local: 'badge',
  synced: 'badge ok',
  pending: 'badge warn',
  offline: 'badge warn',
  error: 'badge bad',
  conflict: 'badge bad',
};

/**
 * Server-Synchronisation: Geräte-Code anzeigen, Code eines anderen Geräts übernehmen,
 * Konfliktfall entscheiden lassen. IndexedDB bleibt der lokale Speicher – der Server ist
 * die Kopie, über die mehrere Geräte denselben Lernstand nutzen.
 */
export function SyncCard({ store }: Props) {
  const [codeInput, setCodeInput] = useState('');
  const [askDelete, setAskDelete] = useState(false);

  const { sync, conflict, busy, note } = store;
  const code = sync.code;
  const lastSync = sync.syncedAt ? new Date(sync.syncedAt).toLocaleString('de-DE') : 'noch nie';

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(formatDeviceCode(code));
      store.setNote('Geräte-Code in die Zwischenablage gelegt.');
    } catch {
      store.setNote(`Code manuell übernehmen: ${formatDeviceCode(code)}`);
    }
  };

  return (
    <div className="card">
      <h2>
        Lernstand auf dem Server{' '}
        <span className={STATUS_CLASS[sync.status] ?? 'badge'}>{STATUS_LABEL[sync.status] ?? sync.status}</span>
      </h2>
      <p className="muted">{sync.message}</p>

      {conflict ? (
        <div className="explain">
          <strong>Beide Seiten haben seit der letzten Übertragung gelernt</strong>
          <p className="muted">
            Server-Kopie zuletzt {new Date(conflict.updatedAt).toLocaleString('de-DE')} · dieser Browser zuletzt{' '}
            {sync.localChangedAt ? new Date(sync.localChangedAt).toLocaleString('de-DE') : 'seit der letzten Übertragung nicht geändert'}.
            Es wird nichts automatisch überschrieben.
          </p>
          <div className="row">
            <button className="primary" disabled={busy} onClick={() => void store.resolveConflict('local')}>
              Stand dieses Geräts zum Server senden
            </button>
            <button className="ghost" disabled={busy} onClick={() => void store.resolveConflict('remote')}>
              Server-Stand übernehmen
            </button>
          </div>
        </div>
      ) : null}

      {code ? (
        <>
          <div className="row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Geräte-Code dieses Browsers</label>
              <code style={{ fontSize: 15 }}>{formatDeviceCode(code)}</code>
            </div>
            <button className="ghost" onClick={() => void copyCode()}>
              kopieren
            </button>
          </div>
          <p className="muted">
            Zuletzt synchronisiert: {lastSync}. Wer diesen Code kennt, kann den Lernstand lesen und überschreiben –
            ihn also wie ein Passwort behandeln.
          </p>
          <div className="row">
            <button className="primary" disabled={busy} onClick={() => void store.pullNow()}>
              Server-Stand holen
            </button>
            <button className="ghost" disabled={busy} onClick={() => void store.pushNow()}>
              Eigenen Stand senden
            </button>
            <button className="ghost" disabled={busy} onClick={() => void store.checkServer()}>
              Server prüfen
            </button>
            <button className="ghost" disabled={busy} onClick={() => store.detach()}>
              Verknüpfung lösen
            </button>
            {askDelete ? (
              <>
                <button
                  className="ghost"
                  disabled={busy}
                  onClick={() => {
                    setAskDelete(false);
                    void store.deleteRemote();
                  }}
                >
                  Server-Kopie wirklich löschen
                </button>
                <button className="ghost" onClick={() => setAskDelete(false)}>
                  abbrechen
                </button>
              </>
            ) : (
              <button className="ghost" disabled={busy} onClick={() => setAskDelete(true)}>
                Server-Kopie löschen
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="row">
          <button className="primary" disabled={busy} onClick={() => void store.enableSync()}>
            Sync auf diesem Gerät starten
          </button>
          <span className="muted">Erzeugt einen neuen Geräte-Code und lädt den Lernstand auf den Server.</span>
        </div>
      )}

      <h3>Code eines anderen Geräts übernehmen</h3>
      <p className="muted">
        Auf dem anderen Gerät (z. B. dem Handy) den Code hier eintragen, um denselben Lernstand zu nutzen. Dieser
        Browser übernimmt danach den Server-Stand – eigene Fortschritte hier gehen dabei verloren, solange kein
        Konflikt mehr offen ist.
      </p>
      <div className="row">
        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 240 }}>
          <label htmlFor="device-code">Geräte-Code</label>
          <input
            id="device-code"
            value={codeInput}
            placeholder="CSA-XXXX-XXXX-XXXX-XXXX"
            onChange={(event) => setCodeInput(event.target.value)}
          />
        </div>
        <button
          className="primary"
          disabled={busy || !codeInput.trim()}
          onClick={() => {
            void store.attachCode(codeInput).then(() => setCodeInput(''));
          }}
        >
          Übernehmen
        </button>
      </div>

      {note ? <p className="muted">{note}</p> : null}
    </div>
  );
}
