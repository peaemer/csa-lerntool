# Projektstand (Stand: 01.11.2026)

Die App ist funktional fertig (siehe README.md für Bedienung, Datenformate und Grenzen) und läuft
zusätzlich als Serveranwendung mit Reverse-Proxy und server-seitigem Lernstand (README-Abschnitt
„Betrieb auf dem eigenen Server“).
Diese Datei ist nur die Notiz, um die Arbeit wieder aufzunehmen – Inhaltliches steht im README.

## Geprüfter Stand

- `npm run test` → 9 Dateien / 76 Tests grün
- `npx tsc --noEmit` → keine Fehler
- `npm run validate` → OK
- `npm run build` → OK (`dist/`)
- `npm run smoke` → 21 Prüfungen gegen den laufenden Node-Server, 0 Fehler
  (Oberfläche, CSP-Header, gzip-Komprimierung der Programmdatei 460 kB → 131 kB, 304-Antwort auf
  `If-None-Match`, Single-Page-Fallback, Pfadabschirmung, Gerät anlegen, speichern/holen/löschen,
  Signaturvergleich, fremder Code, kaputte und zu große Lernstände)
- Alle sechs Ansichten im Browser geprüft, zusätzlich der Sync-Weg: Sync gestartet → Code erschienen,
  Antwort beantwortet → Datei im Lernstand-Ordner, zweiter Browser-Tab → Server-Stand geholt,
  Code eines anderen Geräts übernommen (`csa-wd5y-…` in Kleinbuchstaben mit Vorsilbe funktionierte),
  absichtlicher Konflikt → Rückfrage erschienen und aufgelöst, Server abgeschaltet → „Server nicht
  erreichbar“, weiter gelernt, nach Neustart automatisch nachgeladen. Ohne Konsolenfehler.
- Lernstand im Browser absichtlich **leer** übergeben; Testgeräte-Codes und der Test-Lernstand-Ordner
  sind gelöscht

## Was für den Server-Betrieb dazugekommen ist

- `server/index.mjs` (Node ohne Zusatzpakete: dist/ + `api/…`), `server/store.mjs`
  (eine JSON-Datei pro Geräte-Code, atomar, Größen- und Strukturprüfung, `prune`),
  `server/ratelimit.mjs`
- `src/domain/remote.ts`: Geräte-Code (Normalisierung, `CSA-XXXX-…`-Anzeige), Signatur/Hilfsfunktionen,
  `decideSync` (lokal gegen Server, Konflikt statt Überschreiben), fetch-Client
- `src/app/store.ts`: Startablauf (einmal pro Seite, auch im StrictMode), Auto-Transfer nach jeder
  Änderung, Solidsenden beim Tab-Wechsel, Status/Bad für die Oberfläche
- `src/components/SyncCard.tsx` (Bedienung in „Inhalte & Import“) und Statusknopf oben links in `App.tsx`
- `vite.config.ts`: `api/` wird in Entwicklung und Vorschau auf `127.0.0.1:8787` durchgereicht
- `deploy/`: `env.example`, `Caddyfile.snippet`, `csa-lerntool.service`, `ecosystem.config.cjs`
- `package.json`: `start`, `serve`, `smoke`, `engines.node`; `.gitignore`: `server-state/`, `.env`, `logs/`

## Zusammenspiel Client und Server (Merksätze)

- IndexedDB bleibt der lokale Speicher, der Server ist die Sync-Kopie; offline lernen geht immer.
- Pro Gerät liegt der Code in localStorage (`csa-lerntool.device`), die Zeitstempel der letzten
  Übertragung und der letzten lokalen Änderung daneben (`csa-lerntool.synced-at`,
  `csa-lerntool.changed-at`). Danach richtet sich, wer beim Start gewinnt.
- Leere Stände gewinnen nie: eine frisch angelegte Server-Kopie überschreibt keinen gewachsenen
  lokalen Stand (Bug, der beim ersten Prüfen aufgefallen und behoben ist: der Startablauf hat den
  Stand vor dem Laden gesendet).
- Gleichzeitige Änderungen → Rückfrage in der Oberfläche, nichts läuft automatisch zusammen.
- Der Endpunkt heißt `api/…` **ohne** führende Schrägstriche, damit Unterpfad- und Subdomain-Betrieb
  gleich funktionieren; der Server erkennt `/api/` an jeder Stelle im Pfad.

## Laufende Prozesse und Ports

- Vite-Entwicklungsserver: Port 5177 (`npx vite --port 5177 --strictPort`, weil 5173 belegt war)
- Node-Server für den Sync: Port 8787 (`npm start`), Lernstände im Temp-Ordner
  `csa-state-test` (nur für den Prüfbetrieb, siehe oben: gelöscht)
- Vorschau des Build-Standes: `npm run preview` (Port 4173)

## Datenbestand

| Bereich | Fragen | Aufgaben |
|---|---|---|
| collaboration | 32 | 4 |
| database_security | 24 | 8 |
| instance_configuration | 15 | 3 |
| migration_integration | 18 | 5 |
| platform_navigation | 12 | 2 |
| self_service | 30 | 4 |
| **Gesamt** | **131** | **26** |

`npm run validate` zählt Fragen und Aufgaben zusammen pro Bereich (collaboration: 36 usw.).
24 Fragen stehen auf `needsReview: true` (in der App „Inhalt prüfen“), bei den Aufgaben keine.

## Versionskontrolle

Git-Repo auf Branch `main`, drei Commits: Ausgangszustand (`16b0266`), Zusammenführungs- und
Validator-Schritt (`42bdd93`), Server-Version mit Sync, Deploy-Vorlagen und Doku. Kein Remote,
nichts gepusht. `.gitignore` hält `node_modules/`, `dist/` und `server-state/` draußen.

## Mögliche nächste Schritte

- Geräte-Verwaltung von außen (Liste, einzelne Kopie löschen) wäre nur als Wartungsskript nötig –
  aktuell nur über den Ordner `server-state/` machbar.
- Wer richtige Konten statt Geräte-Codes will: `server/store.mjs` hat mit der Datei pro Schlüssel schon
  die richtige Ablage; Login (Passwort-Hash, Session-Cookie) käme als eigene Schicht darüber.
- `PRUNE_DAYS` steht auf `0`; wer aufräumen will, setzt es in der Umgebung und startet neu.

## Notizen zu collaboration.json

Früher wurde `data/questions/collaboration.json` versehentlich mit einer Neuformulierung (28 Fragen)
überschrieben. 31 Fragen des früheren Standes liegen in `checkpoints/collab_original_recovered.json`;
eine Frage (ursprünglich `q-collab-025`) war nicht wiederherstellbar.

Entschieden und umgesetzt: die 28 Fragen behalten und die vier nur im Recovery-Ordner vorhandenen
hinzugefügt – `q-collab-023b` umbenannt in `q-collab-032`, dazu `q-collab-029`, `q-collab-030`,
`q-collab-031`. Damit 32 Fragen. Die beiden inhaltlich grenzwertigen (`q-collab-029`, `q-collab-030`)
behalten `needsReview: true`.

## Sonstige Notizen

- `scripts/merge-collab-once.mjs` und `scripts/add-correct-count.mjs` sind einmalige Hilfsskripte und
  wurden schon ausgeführt. Beim erneuten Lauf bricht das erste mit „existiert bereits“ ab, das zweite
  findet nichts mehr zu tun. Also nicht nochmal starten.
- `checkpoints/*.before.json` sind Sicherungen früherer Datenstände (instance_configuration,
  platform_navigation) und können gelöscht werden, sobald der aktuelle Stand abgenommen ist.
- `scripts/validate-data.mjs` prüft jetzt auch, ob `correct` zum `type` passt (eine Antwort bei
  `single`/`boolean`, zwei oder mehr bei `multiple`) und ob `multiple` ein passendes `correctCount` hat.
  Sechs multiple-Fragen in `migration_integration.json` bekamen deshalb nachträglich ein `correctCount`.
- Auffälligkeit beim Prüfen: in vier Erklärungen/Antworttexten standen chinesische Zeichen mitten im
  deutschen Text (stumme Beschädigung). Korrigiert in `self_service.json` (2),
  `migration_integration.json`, `collaboration.json` und `checkpoints/collab_original_recovered.json`.
  Beim nächsten Ändern der Inhalte lohnt ein Scan, z. B.
  `Select-String -Path data\questions\*.json -Pattern '[\u4E00-\u9FFF]' -Encoding UTF8`.
  Auch beim Schreiben von deutschem Text in Code-Dateien auf diesen Zeichen bleiben – der Scan oben
  läuft deshalb über alle Quelldateien, nicht nur über `data/`.
