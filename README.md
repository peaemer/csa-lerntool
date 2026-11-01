# CSA-Lerntool (ServiceNow Certified System Administrator)

Lokal lauffähige Web-App zur Vorbereitung auf die **CSA Mainline Exam**-Prüfung: Fragen-Trainer,
Prüfungssimulation nach Blueprint-Gewichtung, Praxisaufgaben-Generator (SNAF) für die eigene PDI,
Leitner-Wiederholung, Statistik und Import eigener Inhalte.

- Oberfläche komplett **Deutsch**, ServiceNow-Fachbegriffe bleiben **englisch**
  (Business Rule, Update Set, ACL, Catalog Item, Transform Map …).
- **Kein Konto, kein fremder Dienst:** Inhalte liegen als JSON im Projekt, der Lernstand im Browser
  (IndexedDB, Fallback localStorage).
- Optional läuft die App **auf dem eigenen Server** (Subdomain + Reverse-Proxy, z. B. Caddy) und legt den
  Lernstand dort ab; mehrere Geräte teilen sich den Stand über einen Geräte-Code
  (`server/index.mjs`, Abschnitt „Betrieb auf dem eigenen Server“).
- Alle Fragen und Aufgaben sind **selbst formulierte Übungsinhalte, keine Prüfungsfragen/Dumps**.
  Inhaltliche Unsicherheiten (Releasestand, UI-Benennung) sind mit `needsReview: true` markiert und
  werden in der App als „Inhalt prüfen“ angezeigt.

## Start

Quelle: `https://github.com/peaemer/csa-lerntool` (öffentlich, Klonen ohne Schlüssel).

Voraussetzung: Node.js 18+ (getestet mit Node 20/22) und npm.

```bash
git clone https://github.com/peaemer/csa-lerntool.git && cd csa-lerntool
npm install
npm run dev        # Entwicklung → http://localhost:5173
npm run test       # Vitest-Tests (Domain-Logik)
npm run validate   # prüft data/questions/*.json und data/tasks/*.json gegen das Schema
npm run build      # tsc --noEmit + Produktions-Build nach dist/
npm run preview    # gebauten Stand lokal ausliefern
```

Mit Server-Sync (Lernstand auf dem eigenen Rechner, zwei Terminals):

```bash
npm start          # Node-Server auf http://127.0.0.1:8787 (api/… und dist/)
npm run dev        # Vite leitet api/ automatisch auf 8787 weiter
npm run serve      # npm run build && npm start in einem Schritt
npm run smoke      # prüft eine laufende Installation (Endpunkte, Oberfläche, Fehlerfälle)
```

## Funktionen

| Bereich | Was passiert dort |
|---|---|
| **Lernmodus** | Fragen beantworten, sofortige Auswertung inkl. Erklärung, Doku-Stichwort und Leitner-Box. Fällige Fragen (Box 1 täglich, Box 2 nach 2, Box 3 nach 4, Box 4 nach 8, Box 5 nach 14 Tagen) kommen zuerst. |
| **Prüfungssimulation** | 20/30/45/60 Fragen, frei wählbare Zeit (Standard 90 min), Fragenanzahl je Blueprint-Bereich einstellbar. Fragen navigierbar, markierbar (F), Timer, Auswertung pro Bereich, keine Teilpunkte. |
| **Schwächen-Training** | Nur Fragen mit Fehlversuchen bzw. niedriger Trefferquote, gewichtet nach Bereich + Leitner-Box. |
| **Praxisaufgaben (SNAF)** | Zufällige Praxisaufgabe zum Nachbauen in der PDI: Szenario, Checkliste zum Abhaken, 3 Hinweis-Stufen, Musterlösung (Klickpfad), Häufige Fehler, Prüfungsbezug, Verständnisfragen, Notiz und Status (offen / in Arbeit / erledigt). |
| **Statistik** | Gewichtete Trefferquote (Blueprint), Trefferquote je Bereich, Tagesverlauf, Problemfragen, Zahlen zu Versuchen und fälligen Fragen, bisherige Simulationen. |
| **Inhalte & Import** | JSON-/CSV-Import für Fragen und Aufgaben, eigenes Frageformular, Backup exportieren/importieren, Vorlage für KI-gestützte Fragen. Außerdem: Lernstand mit dem Server synchronisieren (Geräte-Code anzeigen, Code eines anderen Geräts übernehmen, Konflikt entscheiden). |

Der Stand oben links zeigt jederzeit, ob der Lernstand **lokal**, **synchron**, bei
**Übertragung**, **Server nicht erreichbar**, im **Konflikt** oder mit **Sync-Fehler** liegt.

**Tastatur:** `1`–`9` Antwort wählen · `Enter` prüfen bzw. weiter · `F` Frage markieren (nur in der
Prüfungssimulation) · `←` / `→` in der Simulation blättern.

## Projektstruktur

```
data/questions/<bereich>.json   Fragen, eine Datei pro Blueprint-Bereich
data/tasks/<bereich>.json       Praxisaufgaben, eine Datei pro Bereich
src/main.tsx           Einstiegspunkt, src/styles.css (hell/dunkel)
src/app/               store.ts (State, Persistenz, Sync), App.tsx (Shell/Navigation), useKeyboard.ts
src/domain/            types, blueprint, scoring, progress, stats, taskgen, storage, importer,
                       present (Text-Bausteine der UI), content, promptTemplate, rng, remote (Sync)
src/views/             LearnView, ExamView, WeaknessView, TasksView, StatsView, ContentView
src/components/        QuestionCard, FiltersBar, QuizRunner, SyncCard
server/index.mjs       Node-Server: dist/ ausliefern + api/… für die Lernstände
server/store.mjs       eine JSON-Datei pro Geräte-Code (atomar schreiben, Größe prüfen, aufräumen)
server/ratelimit.mjs   Zeitscheiben-Begrenzung pro Herkunft-IP
deploy/                env.example, Caddyfile.snippet, csa-lerntool.service, ecosystem.config.cjs
scripts/validate-data.mjs       Schema-Check für die JSON-Inhalte
scripts/server-smoke.mjs        Prüflauf gegen eine laufende Installation (npm run smoke)
scripts/merge-collab-once.mjs   einmalig angewendet (Collaboration-Fragen zusammengeführt)
scripts/add-correct-count.mjs   einmalig angewendet (correctCount bei multiple-Fragen ergänzt)
tests/               Vitest: selection, grading, leitner, progress, stats, storage, taskgen,
                     importer, remote
```

Inhalte werden über `src/domain/content.ts` eingebunden: alle `data/questions/*.json` und
`data/tasks/*.json` werden eingelesen. **Neue Datei anlegen = neuer Inhalt**, ohne Code-Änderung.

## Fragen-Schema (`data/questions/*.json`)

Datei enthält ein JSON-Array mit Fragen:

```json
{
  "id": "q-db-001",
  "type": "single",
  "topic": "database_security",
  "difficulty": "medium",
  "subtopic": "Data Schema",
  "question": "Fragestellung auf Deutsch?",
  "options": [
    { "id": "a", "text": "Antwortmöglichkeit" },
    { "id": "b", "text": "Antwortmöglichkeit" }
  ],
  "correct": ["a"],
  "correctCount": 1,
  "explanation": "Warum die Antwort stimmt – und warum die anderen falsch sind.",
  "docsReference": "Data Schema",
  "needsReview": false
}
```

| Feld | Regeln |
|---|---|
| `id` | eindeutig, Konvention `q-<bereichskürzel>-<nr>` (Duplikate werden vom Import übersprungen) |
| `type` | `single` (1 richtig), `multiple` (2–3 richtige), `boolean` (Wahr/Falsch) |
| `topic` | einer der Blueprint-Keys: `platform_navigation`, `instance_configuration`, `collaboration`, `self_service`, `database_security`, `migration_integration` |
| `difficulty` | `easy`, `medium`, `hard` |
| `options` | bei `single`/`multiple` in `data/` mindestens 4 (Import genügt 2); bei `boolean` weglassen (die App erzeugt „Wahr“/„Falsch“) |
| `correct` | IDs der richtigen Optionen; bei `single` und `boolean` genau eine, bei `multiple` zwei oder mehr |
| `correctCount` | bei `multiple` gesetzt (die Prüfung zeigt an, wie viele Antworten zu wählen sind); muss zu `correct` passen |
| `docsReference` | englisches Stichwort für die ServiceNow-Dokumentation |
| `needsReview` | `true`, wenn Inhalt/Version geprüft werden sollte |

Bewertung wie im echten Exam: **exakte Antwortmenge, kein Partial Credit**, leere Antwort = falsch.

Import und `npm run validate` prüfen dieselben Regeln: bekannter `topic` bzw. `area`, gültiger `type`,
genau eine richtige Antwort bei `single`/`boolean`, zwei oder mehr bei `multiple`, `correctCount` stimmt mit
`correct` überein, `explanation` und `docsReference` sind vorhanden. Der Validator ist strenger als der
Import: in `data/` müssen `single`/`multiple` mindestens vier Optionen haben, beim Import genügen zwei.

## Aufgaben-Schema (`data/tasks/*.json`)

```json
{
  "id": "t-db-001",
  "title": "Feld {field} auf {table} anlegen",
  "area": "database_security",
  "difficulty": "beginner",
  "estimatedMinutes": 20,
  "scenario": "Szenario in einer fiktiven Instance …",
  "requirements": ["Schritt 1", "Schritt 2", "Schritt 3"],
  "hints": ["Hinweis Stufe 1", "Hinweis Stufe 2", "Hinweis Stufe 3"],
  "solution": "Application Composer > … (Klickpfad)",
  "commonMistakes": ["Feld ohne u-Präfix angelegt"],
  "examRelevance": "Warum das prüfungsrelevant ist",
  "comprehensionQuestions": [{ "question": "Verständnisfrage?", "answer": "Musterantwort" }],
  "variables": { "table": ["u_laptop", "u_hardware"], "field": ["u_purchase_date"] }
}
```

- `area`: Blueprint-Key, `difficulty`: `beginner` | `advanced` | `exam`.
- `requirements` (Checkliste) und `hints` (drei Stufen) brauchen mindestens 3 Einträge.
- **Platzhalter** `{table}`, `{role}`, `{group}`, `{field}`, `{condition}`, `{app}`, `{user}` werden pro
  Durchlauf neu gewürfelt. Globale Pools sind in `src/domain/taskgen.ts` definiert (`GLOBAL_POOLS`); eine Aufgabe kann
  einzelne Pools mit `variables` überschreiben. Eine gespielte Variante (Task-ID + gewürfelte Werte) kommt
  erst wieder, wenn alle Varianten dieser Aufgabe durch sind – Notizen, Status und Checkliste bleiben dabei
  an der Aufgabe hängen. Sind alle Varianten eines Filters durch, zeigt die App einen Hinweis und kann die
  Varianten-Historie löschen.

Nach Änderungen an den JSON-Dateien: `npm run validate` (prüft u. a. unbekannte Themen/areas, zu wenige
Optionen, `correctCount`-Abweichungen, doppelte IDs, Platzhalter ohne Pool).

## Import (JSON und CSV)

Unter **Inhalte & Import** eigener Inhalt nachträglich ergänzbar – importiert wird in den lokalen
Speicher, die Dateien in `data/` bleiben unverändert. Duplikate werden anhand der `id` erkannt
(auch gegen den Standpool), kaputte Einträge werden mit Grund aufgelistet und übersprungen.

**JSON:** Format wie in `data/questions/*.json` (Array oder einzelnes Objekt).

**CSV für Fragen** – Spalten:
`id,type,topic,difficulty,subtopic,question,options,correct,explanation,docsReference,needsReview`

**CSV für Aufgaben** – Spalten:
`id,title,area,difficulty,estimatedMinutes,scenario,requirements,hints,solution,commonMistakes,examRelevance`

- Das Trennzeichen der Kopfzeile wird erkannt: `,`, `;` oder Tabulator. Datenzeilen mit abweichendem
  Trennzeichen werden zugeordnet, wenn die Spaltenanzahl passt.
- **Mehrfachwerte in einer Zelle** (Optionen, `correct`, `requirements`, `hints`, `commonMistakes`) mit `|`
  oder `;` trennen. Beispiel: `"Trigger|Conditions|Actions"` bzw. `"Trigger;Conditions;Actions"`. Achtung: Der
  Zelleninhalt wird nach dem CSV-Parsing zusätzlich an `;` und `|` getrennt – Antworttexte dürfen deshalb
  selbst kein Semikolon und keinen Senkrechten Strich enthalten.
- `correct` als Options-ID (`a`, `b`, …) oder Nummer (`1`, `2`, …).
- Zellen mit Sonderzeichen in `"..."` setzen (verdoppelte `""` innerhalb einer Zelle zählen als ein
  Anführungszeichen).
- Zeilen mit mehr/weniger Spalten als die Kopfzeile werden nicht geraten, sondern mit Hinweis abgelehnt.
- CSV-Zeilen durchlaufen **dieselbe Prüfung wie JSON** (bekannter `topic`/`area`, `type`, `question`,
  `explanation`, `docsReference`, mindestens zwei Optionen, mindestens drei Checklisten-Punkte und drei
  Hinweis-Stufen bei Aufgaben).
- CSV kann nur die flachen Felder abbilden. `comprehensionQuestions` und eigene `variables` (Platzhalter-Pools)
  gehen ausschließlich per JSON-Import.

## Lernstand, Backup und Löschen

Der gesamte Lernstand (Antwort-Historie, Leitner-Boxen, Prüfungsergebnisse, Aufgaben-Notizen/Status,
eigene Fragen/Aufgaben, Einstellungen) liegt in **IndexedDB** `csa-lerntool` (Store `state`, Key `app`);
falls der Browser IndexedDB ablehnt, in localStorage. Ist ein Geräte-Code eingetragen, zusätzlich als
Kopie auf dem Server (siehe nächster Abschnitt).

- **Backup:** Inhalte & Import → „Backup exportieren“ erzeugt eine JSON-Datei mit allem außer statischen
  Inhalten. „Backup importieren“ ersetzt den aktuellen Stand (mit Rückfrage).
- **Löschen:** im Browser die IndexedDB-Datenbank `csa-lerntool` löschen (Entwicklerwerkzeuge → Anwendung →
  IndexedDB) oder `localStorage.clear()` im Fallback-Fall. Dev-Daten können auch über die App selbst
  zurückgebaut werden: Aufgaben-Status zurücksetzen, Varianten-Historie löschen. Die Server-Kopie wird
  davon **nicht** berührt – sie lässt sich im Bereich „Inhalte & Import“ löschen.

## Betrieb auf dem eigenen Server

Die App läuft als ein einziger Node-Prozess ohne zusätzliche Pakete: `server/index.mjs` liefert den
gebauten Client aus `dist/` **und** die `api/`-Endpunkte für die Lernstände. Davor sitzt ein
Reverse-Proxy (Vorlage: `deploy/Caddyfile.snippet`), der HTTPS erledigt.

Ablauf auf dem Server (Beispielpfad `/opt/csa-lerntool`):

```bash
git clone https://github.com/peaemer/csa-lerntool.git /opt/csa-lerntool
cd /opt/csa-lerntool
sudo -u csa npm ci
sudo -u csa npm run build         # dist/ entsteht; Inhalte sind dann mit eingebaut
sudo cp deploy/env.example /etc/csa-lerntool.env && sudo nano /etc/csa-lerntool.env
sudo install -d -o csa -g csa /opt/csa-lerntool/server-state   # Ordner für die Lernstände
sudo cp deploy/csa-lerntool.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now csa-lerntool
journalctl -u csa-lerntool -f     # Protokoll
```

Der Lernstand-Ordner muss existieren, bevor der Dienst startet: die Unit hält ihn mit
`ReadWritePaths=` fest und vergibt sonst `status=226/NAMESPACE`
(`Failed to set up mount namespacing: …/server-state`). `STATE_DIR` in der Umgebungsdatei und
`ReadWritePaths=` in der Unit müssen auf denselben Ordner zeigen.

Stattdessen mit pm2: `pm2 start deploy/ecosystem.config.cjs` (Pfad in der Datei anpassen). Ein
Prozess genügt; die Sync-Kopien liegen als Dateien, die Zugriffsbegrenzung gilt je Prozess.

Eine ausformulierte Anleitung für einen Debian-LXC mit systemd und externem Caddy (einschließlich
Firewall, Backup und Fehlerbildern) steht in `deploy/anleitung-debian-lxc.md`.

Caddy (Subdomain, automatisches Let's Encrypt):

```
csa.beispiel.de {
    reverse_proxy 127.0.0.1:8787
    encode zstd gzip
}
```

Caddy muss keine Pfade und keine statischen Dateien kennen – der Node-Server setzt die Pass- und
Cache-Header selbst (`index.html` ungecacht, `assets/*` ein Jahr lang).

**Komprimierung:** der Node-Server liefert HTML, CSS, JS und die API-Antworten selbst gegrappt aus,
wenn der Browser `Accept-Encoding: gzip` mitschickt (460 kB Programmdatei → 131 kB) und antwortet auf
erneute Anfragen mit `If-None-Match` mit 304. Caddys `encode zstd gzip` richtet sich zusätzlich an
Clients, die zstd bevorzugen; bereits komprimierte Antworten lässt Caddy unberührt.

### Umgebungsvariablen

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `8787` | Port des Node-Servers (nur intern). |
| `HOST` | `127.0.0.1` | Abhör-Adresse. `127.0.0.1` ist richtig, wenn der Proxy auf demselben Rechner läuft. |
| `PUBLIC_DIR` | `dist` | Verzeichnis mit dem gebauten Client. |
| `STATE_DIR` | `server-state` | Ordner für die Lernstände (eine Datei pro Geräte-Code). |
| `TRUST_PROXY` | `0` | Auf `1` setzen, damit die Zugriffsbegrenzung die echte Besucher-IP aus `X-Forwarded-For` nutzt. |
| `MAX_STATE_BYTES` | `1500000` | Obergrenze pro Lernstand (1,5 MB). |
| `PRUNE_DAYS` | `0` | Kopien löschen, die länger nicht genutzt wurden (`0` = behalten). |
| `LIMIT_REGISTER` / `LIMIT_REDEEM` / `LIMIT_WRITE` | `6` / `8` / `240` | Anfragen je IP: neue Geräte pro Tag, Code-Übernahmen pro Stunde, api/`state`-Zugriffe pro Minute. |
| `LOG_REQUESTS` | `0` | `1` schreibt jede Anfrage ins Protokoll. |

### Wie der Geräte-Code funktioniert

Beim ersten Start auf einem verknüpften Gerät erzeugt die App unter **Inhalte & Import → Lernstand auf
dem Server** einen Code wie `CSA-WD5Y-1R6Y-8R8X-P06T` (16 Zeichen, 80 Bit Zufall). Auf einem zweiten
Gerät diesen Code unter „Code eines anderen Geräts übernehmen“ eintragen – der Browser holt den Stand
und synchronisiert ab dann dorthin.

- **Wer den Code kennt, kann den Lernstand lesen und überschreiben.** Er ist kein Passwort, aber
  behandle ihn entsprechend; bei Bedarf die zusätzliche `basic_auth`-Schicht in der Caddy-Vorlage
  aktivieren.
- Synchronisiert wird automatisch nach einer Änderung (kurze Rückfrage, wenn beide Seiten seit der
  letzten Übertragung gelernt haben). Es wird nichts ungefragt überschrieben.
- Verloren geht der Stand nur, wenn du „Server-Kopie löschen“ wählst oder die Datei in `server-state/`
  löschst. Der lokale Stand im Browser bleibt bei „Verknüpfung lösen“ erhalten.
- Backup der Lernstände: Ordner `server-state/` sichern (z. B. `tar czf lernstände.tar.gz server-state/`).
  Restore = Dateien zurückspielen. Zusätzlich gibt es pro Browser den JSON-Export unter „Backup“.
- Bestehender lokaler Lernstand wandert beim ersten „Eigenen Stand senden“ auf den Server; die App
  fragt nach, wenn auf dem Server schon etwas liegt.

Prüfen einer Installation: `npm run smoke` (localhost) oder
`node scripts/server-smoke.mjs https://csa.beispiel.de` – testet Oberfläche, Sicherheits-Header,
Single-Page-Fallback, Anlegen/Speichern/Holen/Löschen, abgelehnte Fremd-Codes, kaputte und zu große
Lernstände und löscht den angelegten Testcode wieder.

### Inhalte ändern

Die Fragen und Aufgaben sind in den Build eingebaut. Nach Änderungen an `data/**/*.json`:
`npm run validate` und dann `npm run build` auf dem Server (der Node-Server merkt sich `index.html`
nicht – der Browser holt beim nächsten Laden die neue Version, die Programmdateien tragen einen Hash
im Namen).

## Eigene Fragen mit einer KI ergänzen

In **Inhalte & Import** liegt eine Prompt-Vorlage (`src/domain/promptTemplate.ts`) zum Kopieren. Sie
erzwingt: eigene Formulierung statt Dumps, deutsche Fragen mit englischen Fachbegriffen, Blueprint-Treue,
das JSON-Schema oben und `needsReview: true` bei Unsicherheit. Ablauf:

1. Vorlage kopieren, `<ANZAHL>`, `<BEREICH-KEY>`, `<UNTERTHEMA>` und bestehende IDs einsetzen.
2. Antwort (JSON-Array) oben in „Inhalte ergänzen“ einfügen → Importieren.
3. `npm run validate` läuft nur über die Dateien in `data/`; importierten Inhalt danach bei Bedarf in eine
   `data/questions/*.json` übertragen, damit er versioniert ist.

**Bitte prüfen:** KI-Ergebnisse sind ungeprüft. Vor dem Lernen die `needsReview`-Fragen gegen die
ServiceNow-Dokumentation abgleichen.

## Blueprint und Prüfungsrahmen

Quelle des Blueprint (Domains, Gewichte, Unterthemen): ServiceNow Knowledge Base **KB0011554**, CSA
Mainline Exam, Stand Januar 2026 – gepflegt in `src/domain/blueprint.ts`.

| Bereich | Gewicht |
|---|---|
| Platform Overview and Navigation | 7 % |
| Instance Configuration | 10 % |
| Configuring Applications for Collaboration | 20 % |
| Self Service & Automation | 20 % |
| Database Management and Platform Security | 30 % |
| Data Migration and Integration | 13 % |

Prüfungsrahmen: 60 Fragen, 90 Minuten, Cut Score nicht publiziert. Die Simulation bildet das nach
(anpassbare Gewichte je Bereich, wählbare Fragenanzahl), ersetzt aber keine offizielle Angabe.

## Tests

`npm run test` (Vitest, aktuell 9 Dateien / 76 Tests) deckt die Domain-Logik ab:

- `selection.test.ts` – Blueprint-Verteilung und -Auswahl, Schwächen-Training, Reihenfolge im Lernmodus,
  reproduzierbarer Zufall
- `grading.test.ts` – Bewertung (exakte Antwortmengen, keine Teilpunkte) und Statuslogik
  (neu / in Arbeit / falsch / gemeistert)
- `leitner.test.ts` – Box-Wechsel, wachsende Intervalle, Fälligkeit, Priorität nach Fehlversuchen
- `progress.test.ts` – Versuchsprotokoll, Auswertung einer Simulation, `commitExam`
- `stats.test.ts` – lückenloser Tagesverlauf, Problemfragen, schwache Bereiche, Trefferquote je Modus,
  Statuszahlen
- `storage.test.ts` – Export/Import-Roundtrip des Lernstands, kaputte und vertauschte Felder werden
  repariert, Trefferquote je Bereich und Prüfungsreife
- `taskgen.test.ts` – Platzhalterauflösung, keine Doppelvarianten, Gewichtung schwacher Bereiche, Statusfilter
- `importer.test.ts` – JSON- und CSV-Import (Trenner, Zelllisten, gemischte Trenner, Typ- und
  Antwortzahl-Prüfung, Fehlerberichte)
- `remote.test.ts` – Geräte-Code (Normalisierung, Prüfung, Anzeige), Sync-Entscheidung einschließlich
  Konfliktfall, Vergleichssignatur von Lernständen, Client gegen einen Schein-Server

Zufallslogik ist mit dem deterministischen PRNG `makeRng(seed)` (`src/domain/rng.ts`) testbar. Der
End-to-End-Weg (Oberfläche ausliefern, Gerät anlegen, speichern, holen, löschen, Fehlerfälle) läuft
über `npm run smoke`, weil dort der Node-Server selbst geprüft wird – nicht die Domain-Logik.

## Bekannte Grenzen

- Der Stand von ServiceNow-Oberflächen ändert sich mit jedem Release. Bei versionssensiblen Aussagen steht
  `needsReview: true` in den Daten bzw. „Inhalt prüfen“ in der App.
- Die Auswertung einer Simulation ist kein offizielles Ergebnis – der Cut Score ist nicht publiziert.
- Inhaltliche Korrektheit: Dieses Tool prüft nicht, ob eine Frage fachlich richtig ist – die `explanation`
  ist die einzige Quelle. Importierte oder per KI erzeugte Inhalte vor dem Lernen gegen die
  ServiceNow-Dokumentation abgleichen.
- Der Import prüft nur das Schema (und dass `correct` auf existierende Optionen zeigt), nicht die Fachlogik.
- **Sync ohne Konto:** Der Geräte-Code ist kein Passwort. Wer ihn kennt, kann die Server-Kopie lesen und
  überschreiben. Bei öffentlich erreichbarer Subdomain die `basic_auth`-Schicht in der Caddy-Vorlage
  aktivieren oder den Code nicht weitergeben.
- Pro Code liegt **eine** Kopie auf dem Server – kein Verlauf und kein Zusammenführen zweier Stände.
  Haben zwei Geräte gleichzeitig gelernt, fragt die App, welcher Stand weiter zählt; der andere wird
  dabei überschrieben (Export-Dateien bleiben als Rettungsring erhalten).
- Lernstand-Größe: eine Kopie ist auf `MAX_STATE_BYTES` begrenzt (Standard 1,5 MB, das reicht für
  mehrere tausend Versuche). `PRUNE_DAYS` löscht ungenutzte Kopien – für Dauerbetrieb auf `0` lassen.
- Ohne Server-Verknüpfung oder ohne Netzverbindung arbeitet die App unverändert rein lokal weiter; der
  Stand wird beim nächsten Mal automatisch nachgetragen.
- Fragen und Aufgaben sind in den Build eingebaut (`import.meta.glob`): Nach Änderungen an `data/`
  immer `npm run build` laufen lassen, sonst liefert der Server den alten Inhalt aus.
