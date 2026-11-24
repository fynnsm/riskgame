# CLAUDE.md – Risk Tower

Browser-Game und E-Learning zum Thema «Risikomanagement mit AI» (HWZ, Modul Project Management). Fünf Level, jedes ein Gebäude. Entscheide verändern Budget, Zeit und Stabilität; fällt eine Anzeige auf null, stürzt das Gebäude ein.

## Quellen der Wahrheit

- `docs/REQUIREMENTS.md`: Was gebaut wird. Jede Anforderung hat eine ID (z. B. F-204).
- `docs/IMPORT.md`: Format der Inhaltsdateien.
- `docs/CHECKLIST.md`: Manuelle Prüfung für das, was Tests nicht sehen.
- `docs/later/BRAINSTORMING.md`: Offene Fragen. Was dort steht, ist **nicht** entschieden. Nicht umsetzen, sondern nachfragen.

Widerspricht eine Anweisung im Chat den Requirements, frag nach und passe nach der Antwort zuerst `docs/REQUIREMENTS.md` an, dann den Code.

## Stack

Vite, TypeScript (strict), Three.js, HTML/CSS ohne UI-Framework, Zod, Vitest, Playwright, ESLint, Prettier. Hosting: GitHub Pages (statisch, kein Backend).

Neue Abhängigkeiten nur nach Rückfrage, mit Begründung und Grösse.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Lokaler Entwicklungsserver |
| `npm run build` | Produktions-Build |
| `npm run preview` | Build lokal ansehen |
| `npm run typecheck` | TypeScript prüfen |
| `npm run lint` | ESLint und Prettier |
| `npm run test` | Unit-Tests mit Abdeckung |
| `npm run test:e2e` | Playwright (Handy- und Laptop-Grösse) |
| `npm run validate:content` | Inhaltsdateien gegen Schema und Regeln prüfen |
| `npm run simulate:balance` | Balance pro Level simulieren |
| `npm run content:report` | Zahlen zu den Inhalten, schreibt `docs/CONTENT-REPORT.md` |
| `npm run check` | typecheck, lint, test, validate:content, content:report (nur Vergleich), simulate:balance, build |
| `npm run check:all` | `check` plus `test:e2e` |

Fehlt einer dieser Befehle, richte ihn ein, bevor du Features baust.

Die Skripte in `scripts/` laufen direkt mit Node (ab 22.18, ohne Zusatzwerkzeug). Darum tragen alle relativen Importe die Endung `.ts`, und es gibt keine `enum` oder andere Syntax, die Node nicht einfach entfernen kann.

`VITE_SHOW_DRAFTS=1` beim Build zeigt auch Fälle im Status `entwurf` (F-906). Die End-to-End-Tests bauen damit.

## Architektur

```
content/levels/     level-1.json … level-5.json
src/core/           Spiellogik: Zustand, Anzeigen, Ziehung, Bewertung, Balance
src/content/        Schema, Laden, Prüfen
src/storage/        ProgressStore (Interface) + LocalStorageStore
src/logging/        Logger, Ringpuffer, Fehlerbericht
src/render/         Three.js: Gebäude, Stadt, Kamera, Effekte
src/ui/             HTML-Oberfläche
src/audio/          Geräusche
scripts/            validate-content, simulate-balance
tests/unit/  tests/e2e/
```

Regeln, die nicht verhandelbar sind:

1. `src/core` importiert weder Three.js noch DOM-APIs, noch `render`, `ui`, `audio`. Es läuft in Node.
2. `render`, `ui` und `audio` lesen den Zustand aus `core` und lösen Aktionen aus. Sie enthalten keine Spielregeln. Auch Neigung und Wackeln berechnet `core`.
3. Zufall kommt nur aus dem Seed-Generator in `core`. `Math.random()` und `Date.now()` sind in `core` verboten; Zeit wird hineingereicht.
4. Speicherzugriff nur über `ProgressStore`. Kein direkter Zugriff auf `localStorage` ausserhalb von `src/storage`.
5. Alle Zahlen der Balance (Startwerte, Stufenwerte, Schwellen) stehen in `src/core/balance.ts` und nirgends sonst.
6. Texte der Oberfläche stehen gesammelt in `src/ui/texts.ts`, nicht verstreut im Code.
7. Anzeigen, Texte und Buttons sind HTML über dem Canvas, nicht Teil der 3D-Szene.
8. Die App muss mit `?renderer=none` ohne 3D komplett spielbar sein. Dieser Modus dient als Ausweichlösung ohne WebGL und als Basis der End-to-End-Tests.

## Tests

Das ist der wichtigste Abschnitt. Halte ihn bei jeder Änderung ein, ohne Ausnahme und ohne darauf hingewiesen zu werden.

1. **Vor der Arbeit:** `npm run check` ausführen. Ist es rot, zuerst das beheben oder melden.
2. **Jedes Feature bekommt Tests im selben Arbeitsschritt.** Mindestens ein Normalfall und ein Grenz- oder Fehlerfall.
3. **Fehlen Tests für Code, den du anfasst:** Schreibe mindestens zwei neue (Normalfall plus Grenz- oder Fehlerfall), bevor du ihn änderst.
4. **Bugfix:** Zuerst ein Test, der den Fehler zeigt und fehlschlägt. Dann der Fix.
5. **Nach jeder Änderung:** `npm run check` komplett ausführen, nicht nur die betroffene Datei. Bei Änderungen an `ui`, `render`, `storage` oder am Ablauf zusätzlich `npm run test:e2e`.
6. **Nie** Tests löschen, abschwächen, mit `.skip` oder `.only` einchecken oder Schwellen senken, damit der Lauf grün wird. Ist ein Test falsch, erkläre warum und frag nach.
7. **Melde das Ergebnis ehrlich:** Anzahl Tests, was fehlschlug, was du nicht prüfen konntest. Sage nie «alle Tests grün», ohne sie gerade ausgeführt zu haben.

Was getestet sein muss:

- `core`: jede Regel aus Kapitel 4.2 der Requirements, Grenzen der Anzeigen (nie unter 0, nie über 100), Einsturz genau bei 0, Ziehung (keine Duplikate, gleiche Ziehung bei gleichem Seed), Sterne, Neigung.
- `content`: gültige Datei wird akzeptiert; für jede Regel aus `IMPORT.md` gibt es eine ungültige Datei, die mit verständlicher Meldung abgelehnt wird.
- `storage`: speichern und laden, alter Stand, defekter Stand, voller oder gesperrter Speicher (z. B. privater Modus).
- `logging`: Ringpuffer-Grenze, Inhalt des Fehlerberichts, keine Personendaten im Bericht.
- Wiedergabe: Ein Ablauf aus Seed und Wahlfolge ergibt immer denselben Endzustand.
- E2E in zwei Fenstergrössen (390×844 und 1366×768): ganzes Level, Einsturz und Neustart, Neuladen mitten im Level, defekter Speicherstand, «Fehlerbericht kopieren», Tastaturbedienung.

Abdeckung für `core`, `content`, `storage`, `logging`: mindestens 90 % Zeilen und Verzweigungen. `render` wird nicht über Abdeckung gemessen, sondern über E2E und die manuelle Checkliste.

Tests sind deterministisch: kein echter Zufall, keine echte Uhr, kein Netzwerk.

## Sicherheit

- Kein Backend, keine Konten, kein Tracking, keine Cookies, keine Personendaten.
- Keine Schlüssel, Tokens oder Zugangsdaten im Repository. Kein Aufruf von AI-Diensten oder anderen fremden APIs aus dem Browser.
- Keine Ressourcen von Dritten zur Laufzeit (CDN, Schriften, Analyse). Alles wird gebündelt.
- Inhalte aus JSON und aus `localStorage` sind nicht vertrauenswürdig. Einfügen nur mit `textContent` oder gleichwertig. Kein `innerHTML`, kein `eval`, kein `new Function`.
- Alles, was von aussen kommt (JSON, Speicherstand, URL-Parameter), wird mit einem Schema geprüft, bevor es verwendet wird.
- Video-Links: nur `https`, nur Hosts aus der Allowlist in `src/content`, Einbettung erst nach Klick, iframe mit `sandbox` und `referrerpolicy="no-referrer"`.
- Die Content Security Policy in `index.html` nicht lockern, ohne nachzufragen.
- GitHub-Workflows: minimale `permissions`, Schreibrechte nur im Deploy-Job.
- `npm audit` läuft in der CI. Meldungen der Stufe «high» oder höher nicht ignorieren.

## Logging

- Nur über `src/logging` loggen. Kein direktes `console.*` im übrigen Code (Lint-Regel).
- Jeder neue Ablaufschritt, jede Aktion der Spielerin oder des Spielers und jeder Fehlerpfad bekommt einen Log-Eintrag mit sprechendem Ereignisnamen (`level.start`, `choice.made`, `storage.load.invalid`) und den nötigen IDs.
- Fehler nie verschlucken. Ein `catch` loggt immer, mit Ursache.
- Keine Personendaten und keine frei eingegebenen Texte in Logs.
- Der Fehlerbericht muss Version, Commit, Seed und Wahlfolge enthalten, damit sich der Ablauf als Test nachstellen lässt.

Kommt ein Fehlerbericht aus dem Team: Zuerst aus Seed und Wahlfolge einen fehlschlagenden Test bauen, dann beheben.

## Inhalte

- Inhaltsdateien nur gemäss `docs/IMPORT.md` ändern. Fachliche Texte der Gruppe nicht umschreiben oder erfinden; bei Fehlern melden.
- Ändert sich das Schema: `schemaVersion` erhöhen, `docs/IMPORT.md`, Prüf-Skript, Tests und alle Level-Dateien im selben Schritt anpassen.
- Sprache der Oberfläche: Deutsch in Schweizer Schreibweise (kein ß), Du-Form, Währung CHF.

## Performance und Darstellung

- Nur einfache Klötze, flache Farben, keine Texturen. Gleiche Objekte als `InstancedMesh`.
- Ziel: mindestens 30 Bilder pro Sekunde auf einem Mittelklasse-Handy. Pixeldichte auf 2 begrenzen. Im Hintergrund-Tab nicht rendern.
- `prefers-reduced-motion` respektieren.
- Geometrien, Materialien und Listener beim Szenenwechsel freigeben.

## Arbeitsweise

- Arbeite entlang der Meilensteine in Kapitel 8 der Requirements. Kleine Schritte, je ein Thema pro Commit.
- Nenne bei jeder Umsetzung die IDs der Anforderungen, die sie erfüllt.
- Unklare oder fehlende Anforderung: nachfragen, nicht raten.
- Code, Bezeichner, Kommentare und Commits auf Englisch; Texte für Spielerinnen und Spieler auf Deutsch.
- Commits im Format `feat: …`, `fix: …`, `test: …`, `docs: …`, `chore: …`.
- Kein direkter Push auf `main`; Änderungen über Branch und Pull Request.
- Kommentare erklären das Warum, nicht das Was.

## Fertig ist eine Änderung erst, wenn

- [ ] die Anforderung mit ID erfüllt ist,
- [ ] neue Tests dafür vorhanden sind (mindestens Normalfall und Grenz- oder Fehlerfall),
- [ ] `npm run check` grün ist, bei Ablauf- oder Oberflächenänderungen auch `npm run test:e2e`,
- [ ] neue Abläufe und Fehlerpfade geloggt werden,
- [ ] keine Regel aus «Architektur» und «Sicherheit» verletzt ist,
- [ ] `docs/` angepasst ist, falls sich Verhalten, Schema oder Entscheide geändert haben,
- [ ] du gesagt hast, was du nicht automatisch prüfen konntest (Optik, Ton, echte Geräte).
