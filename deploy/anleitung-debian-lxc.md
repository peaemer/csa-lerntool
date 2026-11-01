# Schritt-für-Schritt: CSA-Lerntool in einem Debian-LXC (mit systemd), Caddy extern

Voraussetzungen

- Debian 12 oder 13 in einem LXC/VM **mit systemd** (`systemctl --version` funktioniert).
- Caddy läuft **woanders** (Host oder anderer Container) und ist von dort aus unter Port 80/443
  erreichbar; `csa.example.de` zeigt per DNS auf diesen Caddy.
- Von außen wird nur Caddy geöffnet; der Node-Server bleibt im internen Netz.

Platzhalter, die du überall anpassen musst

| Platzhalter | Beispiel | Bedeutung |
|---|---|---|
| `csa.example.de` | `csa.meine-site.de` | Subdomain, die Caddy bedient |
| `10.10.10.23` | IP des Debian-Containers | von Caddy aus erreichbare Adresse |
| `10.10.10.5` | IP des Caddy-Rechners | darf auf Port 8787 zugreifen |
| `/opt/csa-lerntool` | – | Installationspfad |

---

## 1. Container vorbereiten (als root)

```bash
apt update
apt install -y git curl ca-certificates
```

Node.js 22 LTS installieren (das Debian-eigene Node ist oft zu alt; mindestens Node 20 nötig):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v      # v22.x
npm -v
```

Falls der Container wenig Arbeitsspeicher hat (unter ~500 MB), vor dem Bauen Auslagerungsspeicher
anlegen: `fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`.

## 2. Projekt in den Container bringen

Das Projekt hat keinen Fernspeicher (kein `git remote`). Zwei saubere Wege:

**a) Über ein Git-Bündel vom Arbeitsplatz**

```bash
# auf dem Arbeitsplatz im Projektordner
git bundle create /tmp/csa-lerntool.bundle --all
scp /tmp/csa-lerntool.bundle root@10.10.10.23:/tmp/
# oder bei Proxmox-LXC vom Host aus: pct push 101 /tmp/csa-lerntool.bundle /tmp/csa-lerntool.bundle
```

**b) Über einen privaten Git-Speicher** (Gitea, GitHub privat): ganz normal klonen.

Dann im Container als eigener Benutzer cloned und gebaut wird (Schritt 3 und 4).

## 3. Benutzer und Verzeichnis anlegen

Der Dienstbenutzer bekommt ein eigenes Home außerhalb des Projekts – dort liegt der npm-Puffer aus
Schritt 4, und das Projektverzeichnis bleibt sauber.

```bash
useradd --system --create-home --home-dir /var/lib/csa-lerntool --shell /usr/sbin/nologin csa
mkdir -p /opt/csa-lerntool
chown -R csa:csa /opt/csa-lerntool /var/lib/csa-lerntool
```

Projekt abholen (Variante a):

```bash
sudo -u csa git clone /tmp/csa-lerntool.bundle /opt/csa-lerntool
cd /opt/csa-lerntool && git log --oneline | head -3
```

`dist/`, `node_modules/` und `server-state/` sind nicht im Versionsarchiv – die entstehen erst hier.

## 4. Abhängigkeiten installieren und bauen

Der Bau braucht die Entwicklungs-Pakete (Vite, TypeScript), der laufende Server danach **keine**
einzigen Pakete mehr – React ist in `dist/` bereits enthalten.

```bash
cd /opt/csa-lerntool
sudo -u csa npm ci              # installiert auch Entwicklungs-Pakete
sudo -u csa npm run validate    # prüft data/questions und data/tasks
sudo -u csa npm run test        # 9 Dateien / 76 Tests
sudo -u csa npm run build       # erzeugt dist/
sudo -u csa npm prune --omit=dev  # optional: räumt Entwicklungs-Pakete wieder weg
```

Bei späteren Aktualisierungen müssen die Entwicklungs-Pakete für den Build wieder da sein
(`npm ci` vor dem `npm run build`).

## 5. Konfigurationsdatei anlegen

```bash
cp deploy/env.example /etc/csa-lerntool.env
nano /etc/csa-lerntool.env
chown root:csa /etc/csa-lerntool.env
chmod 640 /etc/csa-lerntool.env
```

Inhalt für deinen Fall (Caddy läuft **nicht** im selben Container):

```bash
PORT=8787
# Wichtig: 127.0.0.1 wäre nur vom Container selbst erreichbar.
# 0.0.0.0 lauscht auf allen Adressen; dann Port per Firewall (Schritt 7) absichern.
HOST=0.0.0.0
# alternativ gezielt: HOST=10.10.10.23

PUBLIC_DIR=/opt/csa-lerntool/dist
STATE_DIR=/opt/csa-lerntool/server-state

# Caddy setzt X-Forwarded-For – nur dann darf die Zugriffsbegrenzung die echte Besucher-IP nutzen.
TRUST_PROXY=1

MAX_STATE_BYTES=1500000
PRUNE_DAYS=0
LIMIT_REGISTER=6
LIMIT_REDEEM=8
LIMIT_WRITE=240
LOG_REQUESTS=0
```

## 6. Dienst einrichten

```bash
cp deploy/csa-lerntool.service /etc/systemd/system/csa-lerntool.service
systemctl daemon-reload
systemctl enable --now csa-lerntool
systemctl status csa-lerntool --no-pager
journalctl -u csa-lerntool -n 30 --no-pager
```

Der Dienst schreibt Meldungen ins Journal, z. B. `CSA-Lerntool läuft auf http://0.0.0.0:8787`.
Probe von innen:

```bash
curl -s http://127.0.0.1:8787/api/health
# {"ok":true,"mode":"state-sync","devices":0,"maxSizeBytes":1500000,"prunedDays":0}
```

## 7. Port 8787 nur für Caddy freigeben

Ohne Konto ist der Node-Server kein geschützter Eingang – er darf nicht im öffentlichen Netz stehen.

```bash
apt install -y ufw
ufw default deny incoming
ufw allow from 10.10.10.5 to any port 8787 proto tcp   # Caddy-Rechner
ufw allow from 10.10.10.0/24 to any port 22 proto tcp  # SSH, falls nötig
ufw enable
```

Alternativ in `/etc/csa-lerntool.env` nur `HOST=10.10.10.23` eintragen und den Port gar nicht
erst freigeben.

## 8. Caddy konfigurieren (dort, wo Caddy läuft)

In die Caddyfile des anderen Containers/Hosts:

```
csa.example.de {
	# Der Node-Server liefert Oberfläche UND api/… selbst, Caddy leitet nur weiter.
	reverse_proxy 10.10.10.23:8787

	encode zstd gzip

	# Optional zweite Schicht (empfohlen, weil der Geräte-Code kein Passwort ist):
	#   caddy hash_password --password 'DEIN_PASSWORD'
	# basic_auth {
	# 	lernende:r $2a$14$HIERDERHASH
	# }
}
```

```bash
caddy fmt --overwrite /etc/caddy/Caddyfile
systemctl reload caddy     # bzw. den Caddy-Container neu starten
journalctl -u caddy -n 30 --no-pager   # ausgestellt? Let's Encrypt braucht Port 80/443 nach außen
```

Wichtig: Caddy darf den `Host`-Header nicht umbiegen (kein `header_up Host …`) und keinen Pfad
abschneiden (kein `handle_path`) – der Server prüft die Herkunft an `Host` und erkennt `api/`
an jeder Stelle des Pfades.

## 9. Von außen prüfen

```bash
curl -I https://csa.example.de/
curl -s https://csa.example.de/api/health
node scripts/server-smoke.mjs https://csa.example.de   # 21 Prüfungen, am Ende aufgeräumt
```

Die Smoke-Prüfung legt ein Testgerät an, speichert und löscht wieder. Wenn du bei
`Zu viele neue Geräte in kurzer Zeit` landest: die Begrenzung lässt pro IP nur 6 Neuanmeldungen
pro Tag zu – kurz warten oder die Zahl in der Umgebungsdatei erhöhen.

## 10. Erster Start und Geräte verbinden

1. `https://csa.example.de` öffnen → **Inhalte & Import** → *Lernstand auf dem Server*.
2. „Sync auf diesem Gerät starten“ antippen. Oben links steht danach **Lernstand: synchron**, im
   Kasten der Code, z. B. `CSA-4D7M-7BK7-QH9H-T1WJ`. Notiere ihn – er ist der Zugang.
3. Anderes Gerät (Handy) öffnen → „Code eines anderen Geräts übernehmen“ → Code eintragen →
   **Übernehmen**. Der Lernstand wird geladen, beide Geräte hängen an derselben Kopie.
4. Älterer Lernstand aus einem anderen Browser: dort **Backup exportieren**, am neuen Gerät
   **Backup importieren**, danach Sync starten. Der Stand wandert dann hoch.
5. Statusknopf oben links zeigt jederzeit: lokal · synchron · Übertragung · Server nicht erreichbar ·
   Konflikt · Sync-Fehler. Bei **Konflikt** fragt die App, welcher Stand weiter zählt.

## 11. Sichern und Zurücksichern

```bash
mkdir -p /backup
tar czf /backup/csa-lernstaende-$(date +%F).tar.gz -C /opt/csa-lerntool server-state
```

Täglich z. B. über einen systemd-Timer oder cron. Zurücksicherung:

```bash
systemctl stop csa-lerntool
tar xzf /backup/csa-lernstaende-2026-11-01.tar.gz -C /opt/csa-lerntool
systemctl start csa-lerntool
```

Zusätzlich exportiert die App auf Wunsch eine JSON-Datei je Browser (Backup-Knopf) – die gehört zu
den Browser, nicht auf den Server.

## 12. Aktualisieren

Variante a (Bündel):

```bash
cd /opt/csa-lerntool
sudo -u csa git fetch /tmp/csa-lerntool.bundle main   # bzw. git pull aus deinem Fernspeicher
sudo -u csa git merge FETCH_HEAD
sudo -u csa npm ci
sudo -u csa npm run validate && sudo -u csa npm run build
sudo -u csa npm prune --omit=dev
systemctl restart csa-lerntool
journalctl -u csa-lerntool -n 20 --no-pager
```

Die Lernstände in `server-state/` bleiben bei jedem Update erhalten.

## 13. Wenn etwas nicht läuft

| Erscheinung | Ursache und Weg |
|---|---|
| `Hinweis: Kein index.html in …dist` | nicht gebaut – Schritt 4 wiederholen (`npm ci && npm run build`) |
| `EADDRINUSE` | Port 8787 belegt – `ss -ltnp \| grep 8787`, anderen Port setzen |
| `EACCES` beim Speichern | Rechte: `chown -R csa:csa /opt/csa-lerntool/server-state` |
| App lädt, Sync sagt „Server nicht erreichbar“ | `HOST` steht auf `127.0.0.1`, Caddy erreicht den Container nicht, oder Firewall zu – Schritt 5 und 7 |
| `403 Anfrage von einer anderen Herkunft abgelehnt` | Caddy verändert den `Host`-Header; `header_up Host` entfernen |
| `404 Unbekannter Endpunkt: GET /…` | Caddy schneidet den Pfad ab (`handle_path`) – ohne Pfad-Abschneiden weiterleiten |
| `429 Zu viele …` | Zugriffsbegrenzung erreicht – warten oder `LIMIT_*` anpassen |
| Zertifikatsausstellung schlägt fehl | DNS zeigt nicht auf den Caddy, oder Port 80/443 ist nicht offen |
| Seite unterhalb eines Unterpfads geplant | Subdomain beibehalten; Unterpfad braucht `base` im Build – bisher nicht eingerichtet |
