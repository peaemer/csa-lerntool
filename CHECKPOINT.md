# Projektstand (Stand: 01.11.2026)

Die App ist funktional fertig (siehe README.md für Bedienung, Datenformate und Grenzen).
Diese Datei ist nur die Notiz, um die Arbeit wieder aufzunehmen – Inhaltliches steht im README.

## Geprüfter Stand

- `npm run test` → 8 Dateien / 54 Tests grün
- `npx tsc --noEmit` → keine Fehler
- `npm run validate` → OK
- `npm run build` → OK (`dist/`)
- Alle sechs Ansichten im Browser geprüft (Lernmodus, Prüfungssimulation, Schwächen-Training,
  Praxisaufgaben, Statistik, Inhalte & Import), ohne Konsolenfehler
- Lernstand im Browser absichtlich **leer** übergeben (IndexedDB `csa-lerntool` gelöscht,
  `localStorage.clear()`); Prüf- und Importtest-Einträge sind nicht mehr vorhanden

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

Git-Repo auf Branch `main`. Erster Commit `16b0266` (Ausgangszustand), danach ein Commit für den
Zusammenführungs- und Validator-Schritt. Kein Remote, nichts gepusht. `.gitignore` hält
`node_modules/` und `dist/` draußen.

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
- Der Dev-Server läuft auf Port 5177 (`npx vite --port 5177 --strictPort`), weil 5173 belegt war.
- `scripts/validate-data.mjs` prüft jetzt auch, ob `correct` zum `type` passt (eine Antwort bei
  `single`/`boolean`, zwei oder mehr bei `multiple`) und ob `multiple` ein passendes `correctCount` hat.
  Sechs multiple-Fragen in `migration_integration.json` bekamen deshalb nachträglich ein `correctCount`.
- Auffälligkeit beim Prüfen: in vier Erklärungen/Antworttexten standen chinesische Zeichen mitten im
  deutschen Text (stumme Beschädigung). Korrigiert in `self_service.json` (2),
  `migration_integration.json`, `collaboration.json` und `checkpoints/collab_original_recovered.json`.
  Beim nächsten Ändern der Inhalte lohnt ein Scan, z. B.
  `Select-String -Path data\questions\*.json -Pattern '[\u4E00-\u9FFF]' -Encoding UTF8`.
