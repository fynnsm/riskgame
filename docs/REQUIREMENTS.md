# Risk Tower (Arbeitstitel) – Requirements

Version 0.1 · Stand 23.11.2026 · HWZ BDA-A25, Project Management, Projekt 1 (Gruppe Jess), Thema «Risikomanagement mit AI»

## 1. Zweck

Risk Tower ist ein Browser-Game und zugleich das ganze E-Learning der Gruppe. Die Spielerin oder der Spieler baut fünf Gebäude. Jedes Gebäude ist ein kleines Projekt, das durch Entscheide im Risikomanagement stabil bleibt oder einstürzt. Die Situationen handeln davon, wie man AI im Risikomanagement von Projekten sinnvoll einsetzt und wo ihre Grenzen liegen.

Dieses Dokument ist die verbindliche Grundlage für die Umsetzung. Offene Fragen stehen in `later/BRAINSTORMING.md`, das Inhaltsformat in `IMPORT.md`, die Arbeitsregeln für den Coding-Agenten in `CLAUDE.md`.

**Legende**

- Priorität: **M** = Muss, **S** = Soll, **K** = Kann
- Herkunft: **E** = im Gespräch entschieden, **A** = Vorgabe aus dem Auftrag des Dozenten, **V** = Vorschlag von Claude, von Fynn noch nicht bestätigt

Alles mit **V** bitte einmal durchgehen und bestätigen oder streichen.

## 2. Randbedingungen aus dem Auftrag

| ID | Vorgabe | Herk. |
|---|---|---|
| R-01 | E-Learning von etwa 60 Minuten zu einem Projektmanagement-Thema für die Mitstudierenden | A |
| R-02 | Die Lösung ist mindestens 60 Tage verfügbar | A |
| R-03 | Die Lösung verursacht keine direkten Kosten | A |
| R-04 | Lernziele sind definiert und messbar | A |
| R-05 | Zusätzlich abzugeben: Konzept/Drehbuch, Dokumentation der Inhalte, Teaser-Video (max. 3 min), Evaluation mit Feedback der Mitstudierenden | A |
| R-06 | Screenshots gelten als Dokumentation | A |

Bewertungsraster und Abgabetermine liegen noch nicht vor (siehe `later/BRAINSTORMING.md`, O-10).

## 3. Spielablauf im Überblick

1. **Start:** Stadtansicht mit fünf Bauplätzen. Level 1 ist offen.
2. **Briefing:** Das Level stellt sein Projekt vor (Rahmenfall des Gebäudes).
3. **Theorie:** Einige Karten zum Prozessschritt des Levels.
4. **Situationen:** Sechs Situationen, zufällig aus einem grösseren Pool. Jede hat drei Optionen. Jede Wahl verändert Budget, Zeit und Stabilität und setzt ein Stockwerk auf das Gebäude.
5. **Ende des Levels:** Fällt eine Anzeige auf null, stürzt das Gebäude ein, die Auswertung erklärt warum, und das Level beginnt neu. Sonst bleibt das Gebäude so stehen, wie es abgeschlossen wurde, gerade oder schief.
6. **Schluss:** Nach Level 5 zeigt die Stadt alle fünf Gebäude und die Gesamtauswertung.

## 4. Funktionale Anforderungen

### 4.1 Struktur und Ablauf

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| F-101 | Theorie, Situationen und Auswertung laufen im Spiel unter einem einzigen Link | M | E |
| F-102 | Es gibt fünf Level in fester Reihenfolge | M | E |
| F-103 | Ein Level wird erst spielbar, wenn das vorherige abgeschlossen ist | S | V |
| F-104 | Level-Ablauf: Briefing, Theorie, Situationen, Auswertung | M | E |
| F-105 | Pro Durchgang werden 6 Situationen zufällig aus einem Pool von mindestens 8 gezogen (beide Zahlen pro Level einstellbar) | M | E |
| F-106 | Bei einer Wiederholung wird neu gezogen; eben gespielte Situationen kommen möglichst zuletzt wieder | S | V |
| F-107 | Abgeschlossene Level sind wiederholbar, das beste Ergebnis bleibt erhalten | S | V |
| F-108 | Die App misst die aktive Spielzeit lokal und zeigt sie in der Gesamtauswertung und im Fehlerbericht | S | V |

### 4.2 Entscheidungsmechanik

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| F-201 | Drei Anzeigen: Budget, Zeit, Stabilität, intern je 0 bis 100 | M | E |
| F-202 | Jede Situation hat genau drei Optionen; jede verschiebt die Anzeigen unterschiedlich, und jede kostet irgendwo etwas | M | E |
| F-203 | Inhalte geben Wirkungen als Stufen an (klein, mittel, gross, jeweils plus oder minus); die Umrechnung in Zahlen steht zentral an einer Stelle im Code | M | E |
| F-204 | Fällt eine Anzeige auf 0, scheitert das Projekt und das Gebäude stürzt ein | M | E |
| F-205 | Das Gebäude neigt sich und wackelt umso stärker, je tiefer die schwächste Anzeige ist und je einseitiger entschieden wurde. Neigung und Wackeln berechnet die Spiellogik, die Grafik stellt sie nur dar | M | E |
| F-206 | Es gibt keine mechanische Regel der Art «dreimal dasselbe und er fällt» | M | E |
| F-207 | Die Reihenfolge der Optionen wird gemischt, und die Buttons sind neutral gefärbt (keine Ampelfarben, die die Lösung verraten) | M | V |
| F-208 | Nach der Wahl zeigt das Spiel die Erklärung zur gewählten Option und die Veränderung der Anzeigen | M | E |
| F-209 | Nach einem Einsturz zeigt die Auswertung, welche Entscheide das Gebäude gekippt haben und warum; danach startet das Level neu, nicht das Spiel | M | E |
| F-210 | Jede Option trägt eine Einstufung (gut, vertretbar, riskant) für Auswertung und Lernerfolg; vor der Wahl ist sie nicht sichtbar | S | V |

Startwerte für die Balance (zu justieren, siehe O-4): Anzeigen beginnen bei 70; klein = 6, mittel = 12, gross = 20 Punkte.

### 4.3 AI-Bezug

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| F-301 | Die Situationen handeln vom Einsatz von AI im Risikomanagement von Projekten | M | E |
| F-302 | Ein Teil der Situationen zeigt eine konkrete AI-Ausgabe (Prompt und Antwort); die Optionen drehen sich darum, ob man ihr vertraut, sie prüft oder sie verwirft | M | E |
| F-303 | AI-Ausgaben sind vorgeschriebene Inhalte. Die App ruft zur Laufzeit keinen AI-Dienst auf | M | V |
| F-304 | Jeder Level-Pool enthält mindestens zwei Situationen mit AI-Ausgabe | S | V |

### 4.4 Level, Gebäude und Stadt

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| F-401 | Level 1: Risiken mit AI identifizieren | M | E |
| F-402 | Level 2: Risiken bewerten und priorisieren | M | E |
| F-403 | Level 3: Massnahmen planen | M | E |
| F-404 | Level 4: Risiken überwachen | M | E |
| F-405 | Level 5: Grenzen der AI (Halluzinationen, Datenschutz, Verantwortung) | M | E |
| F-406 | Jedes Level ist ein Gebäude mit eigenem Rahmenfall, also ein eigenes kleines Projekt | M | E |
| F-407 | Jede gespielte Situation setzt ein Stockwerk auf | S | V |
| F-408 | Ein abgeschlossenes Gebäude bleibt in dem Zustand stehen, in dem es abgeschlossen wurde | M | E |
| F-409 | Nach Level 5 zeigt die Stadtansicht alle fünf Gebäude mit der Gesamtauswertung | M | E |
| F-410 | Die Kulisse (Häuser, Strassen, Autos, Bäume) ist echtes 3D und bewegt sich mit der Kamera mit, wenn das Gebäude wächst | M | E |
| F-411 | Stil: farbige Klötze ohne Texturen, inspiriert vom Voxel-Look bekannter Mobile-Games, aber mit eigenen Formen, Figuren und Namen | M | E |

### 4.5 Theorie

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| F-501 | Vor den Situationen kommt Theorie als Folge von Schritten, die aus den Inhaltsdateien stammen | M | E |
| F-502 | Schritt-Typ `karte`: Titel, Text, optional eine einfache eingebaute Grafik | M | E |
| F-503 | Schritt-Typ `video`: eingebetteter Link. Die erste Version enthält nur Karten, der Typ ist aber technisch vorhanden | M | E |
| F-504 | Videos liegen nie im Repository; sie werden nur per https-Link von erlaubten Hosts eingebettet und erst nach einem Klick geladen | M | E |
| F-505 | Beim ersten Durchgang wird jede Karte mindestens einmal gezeigt; bei einer Wiederholung ist die Theorie überspringbar | S | V |
| F-506 | Die Theorie des Levels ist während der Situationen nachschlagbar | K | V |

### 4.6 Auswertung und Lernerfolg

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| F-601 | Die Level-Auswertung zeigt den Endstand der Anzeigen und alle Entscheide mit Einstufung und Erklärung | M | E |
| F-602 | Jede Situation ist einem Lernziel des Levels zugeordnet; die Auswertung zeigt, welche Lernziele erreicht wurden | S | V |
| F-603 | Pro Level gibt es 1 bis 3 Sterne, berechnet aus Einstufungen und Endstand | S | V |
| F-604 | Die Gesamtauswertung zeigt Sterne je Level, Spielzeit und die wichtigsten Lernpunkte | S | V |
| F-605 | Wie das Feedback der Mitstudierenden zur Gruppe kommt, ist offen (O-2) | – | – |

### 4.7 Speichern

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| F-701 | Der Fortschritt liegt lokal im Browser (localStorage); kein Server, keine Cookies | M | E |
| F-702 | Gespeichert wird nach jedem Schritt; nach dem Neuladen geht es an derselben Stelle weiter | M | V |
| F-703 | Der Zugriff läuft ausschliesslich über eine Schnittstelle `ProgressStore`, damit später ein Backend angeschlossen werden kann | M | E |
| F-704 | Der Speicherstand ist versioniert und wird beim Laden geprüft; ein ungültiger Stand führt zu einem sauberen Neustart mit Hinweis, nie zu einem Absturz | M | V |
| F-705 | «Fortschritt löschen» mit Rückfrage | S | V |
| F-706 | Das Spiel weist darauf hin, dass der Stand nur auf diesem Gerät und in diesem Browser gilt | S | E |

### 4.8 Ton

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| F-801 | Geräusche für Bauen, Wahl, Wackeln, Einsturz und Erfolg | S | E |
| F-802 | Ein Stumm-Schalter ist immer sichtbar; die Wahl wird gespeichert | M | E |
| F-803 | Keine Information wird nur über Ton vermittelt | M | E |
| F-804 | Ton startet erst nach der ersten Interaktion (Vorgabe der Browser) | M | V |
| F-805 | Geräusche werden im Browser synthetisch erzeugt oder stammen aus CC0-Quellen, die in `CREDITS.md` stehen | S | V |

### 4.9 Inhalte

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| F-901 | Alle Inhalte liegen als JSON vor, eine Datei pro Level in `content/levels/` | M | E |
| F-902 | Geänderte Inhaltsdateien werden ohne Codeänderung übernommen | M | E |
| F-903 | Jede Datei wird beim Laden und in der CI gegen ein Schema geprüft; die Fehlermeldung nennt Datei, Feld und Problem auf Deutsch | M | E |
| F-904 | `IMPORT.md` beschreibt das Format so, dass ein LLM Rohtexte der Gruppe korrekt umwandelt | M | E |
| F-905 | Inhaltliche Regeln werden automatisch geprüft: genau drei Optionen, Textlängen, eindeutige IDs, jede Option mit mindestens einer negativen Wirkung, pro Situation mindestens eine gute und eine riskante Option, Pool gross genug | M | V |
| F-906 | Jede Situation hat einen Status (`entwurf`, `freigegeben`); die veröffentlichte Version zeigt nur freigegebene, lokal sind alle sichtbar | S | V |
| F-907 | Ein Skript simuliert die Balance pro Level: Wer nur gute Optionen wählt, übersteht jede Ziehung; wer nur riskante wählt, scheitert in jeder | S | V |
| F-908 | Ein Skript erzeugt aus den JSON-Dateien eine Inhaltsdokumentation als Markdown (für das Lieferobjekt «Dokumentation der Inhalte») | K | V |

### 4.10 Logging und Fehlerbericht

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| L-01 | Es gibt ein zentrales Logging-Modul; ausserhalb davon wird nicht direkt in die Konsole geschrieben | M | E |
| L-02 | Protokolliert werden: Start mit Version, Laden und Prüfen der Inhalte, jeder Zustandswechsel, jede Wahl mit IDs und Anzeigewerten, Speichern und Laden, Ton, Verlust des Grafik-Kontexts, Einbrüche der Bildrate, alle unbehandelten Fehler | M | E |
| L-03 | Die letzten 300 Einträge bleiben in einem Ringpuffer, der ein Neuladen übersteht | S | V |
| L-04 | Ein Knopf «Fehlerbericht kopieren» steht im Menü und auf jeder Fehlermeldung; er kopiert in die Zwischenablage, mit Textfeld als Ausweichlösung | M | E |
| L-05 | Der Bericht enthält Version und Commit, Zeitpunkt, Browser und Gerät, Fenstergrösse, Grafikmodus, Spielstand mit Seed und Wahlfolge sowie die letzten Log-Einträge | M | E |
| L-06 | Der Bericht enthält keine Personendaten und wird nie automatisch verschickt; man sieht ihn vor dem Kopieren | M | E |
| L-07 | Mit Seed und Wahlfolge aus dem Bericht lässt sich der Ablauf als automatischer Test nachstellen | S | V |
| L-08 | Bei einem Fehler erscheint eine verständliche Fehlerseite mit dem Bericht-Knopf, nie eine weisse Seite | M | V |
| L-09 | Debug-Modus über `?debug=1`: Overlay mit Bildrate, Anzeigen und Seed, dazu Level-Sprung | S | V |

## 5. Nicht-funktionale Anforderungen

### 5.1 Plattform und Bedienung

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| N-101 | Das Spiel läuft im Browser ohne Installation und ohne Login | M | E |
| N-102 | Hochformat zuerst; am Laptop steht dieselbe Hochformat-Spalte zentriert. Es gibt nur ein Layout | M | E |
| N-103 | Unterstützt werden die aktuellen Versionen von Chrome, Safari (iOS und macOS), Firefox und Edge | M | V |
| N-104 | Bedienbar mit Touch, Maus und Tastatur (Tasten 1, 2, 3 und Enter) | S | V |
| N-105 | Lokal startet das Projekt mit `npm install` und `npm run dev` | M | E |
| N-106 | Sprache Deutsch in Schweizer Schreibweise (kein ß), Du-Form, Währung CHF | M | E |

### 5.2 Performance

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| N-201 | Alle 3D-Objekte bestehen aus einfachen Klötzen mit flachen Farben; gleiche Objekte werden als Instanzen gezeichnet | M | E |
| N-202 | Das Spiel läuft auf einem Mittelklasse-Handy flüssig; Zielwert mindestens 30 Bilder pro Sekunde | M | E |
| N-203 | Fällt die Bildrate darunter, reduziert das Spiel selbst Schatten und Kulisse | S | V |
| N-204 | Das erste Laden überträgt höchstens rund 1 MB | S | V |
| N-205 | Im Hintergrund-Tab wird nicht gerendert; die Pixeldichte ist auf 2 begrenzt | S | V |
| N-206 | Die erste Version nutzt keine Physik-Bibliothek; der Einsturz ist eine geskriptete Animation | S | V |
| N-207 | Ohne WebGL läuft ein Einfach-Modus ohne 3D, in dem alle Lerninhalte nutzbar sind | S | V |

### 5.3 Barrierefreiheit

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| N-301 | Anzeigen, Texte und Buttons sind HTML über der 3D-Fläche, nicht in die 3D-Szene gezeichnet | M | V |
| N-302 | Kontrast nach WCAG AA, Schrift mindestens 16 px, Touch-Ziele mindestens 44 px | S | V |
| N-303 | Keine Information nur über Farbe; jede Anzeige hat Beschriftung und Wert | M | V |
| N-304 | Bei der Systemeinstellung «Bewegung reduzieren» entfallen Wackeln der Kamera und starke Effekte | S | V |

### 5.4 Sicherheit und Datenschutz

Die App ist eine statische Seite ohne Server. Die Risiken liegen deshalb bei fremden Inhalten im Browser, bei Abhängigkeiten, beim öffentlichen Repository und bei dem, was die Gruppe in die Fälle schreibt.

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| S-01 | Kein Backend, keine Konten, keine Personendaten, kein Tracking, keine Cookies | M | E |
| S-02 | Keine Schlüssel oder Zugangsdaten im Repository oder im ausgelieferten Code; kein Aufruf von AI-Diensten aus dem Browser | M | V |
| S-03 | Zur Laufzeit werden keine Ressourcen von Dritten geladen (CDN, Schriften, Analyse); einzige Ausnahme sind Videos nach einem Klick | M | V |
| S-04 | Inhalte aus JSON und aus dem lokalen Speicher gelten als nicht vertrauenswürdig: Sie werden nur als Text eingefügt, nie als HTML, und nie ausgeführt | M | V |
| S-05 | Eine Content Security Policy per Meta-Tag erlaubt nur eigene Quellen und die Video-Hosts der Allowlist | M | V |
| S-06 | Video-Links: nur https, nur Hosts der Allowlist, Einbettung in einem eingeschränkten iframe | M | V |
| S-07 | Wenige Abhängigkeiten, Lockfile im Repository, Installation in der CI mit `npm ci`, `npm audit` in der CI, automatische Update-Hinweise | M | V |
| S-08 | GitHub: `main` ist geschützt (Pull Request und grüne CI), Workflows haben minimale Rechte, Secret Scanning mit Push-Schutz ist aktiv, alle mit Schreibrecht nutzen 2FA | S | V |
| S-09 | Fälle sind anonymisiert: keine echten Namen von Firmen, Kunden oder Personen und keine vertraulichen Daten von Arbeitgebern, weil das Repository öffentlich ist | M | V |
| S-10 | Nur eigene oder CC0-lizenzierte Assets; Nachweis in `CREDITS.md` | S | V |

Grenze von S-05: GitHub Pages erlaubt keine eigenen HTTP-Header. Ein Schutz gegen das Einbetten der Seite in fremde Seiten (frame-ancestors) ist per Meta-Tag nicht möglich. Für ein Lernspiel ohne Konten ist das vertretbar.

### 5.5 Qualität und Tests

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| Q-01 | Die Spiellogik ist strikt von der 3D-Darstellung getrennt und läuft ohne Browser | M | E |
| Q-02 | Jedes Feature hat automatische Tests. Fehlen sie für berührten Code, werden mindestens zwei geschrieben: ein Normalfall und ein Grenz- oder Fehlerfall | M | E |
| Q-03 | Bei jeder Änderung läuft die gesamte Test-Suite lokal | M | E |
| Q-04 | Bei jedem Push und Pull Request laufen in GitHub Actions: Typprüfung, Lint, Unit-Tests, Inhaltsprüfung, Balance-Simulation, Build, End-to-End-Tests. Veröffentlicht wird nur bei grünem Lauf | M | E |
| Q-05 | Testabdeckung für Logik, Inhalte, Speicher und Logging: mindestens 90 % der Zeilen und Verzweigungen (Startwert) | S | V |
| Q-06 | Zufall kommt nur aus einem Generator mit Seed, damit jeder Ablauf wiederholbar ist | M | V |
| Q-07 | End-to-End-Tests in Handy- und Laptop-Grösse: ganzes Level, Einsturz mit Neustart, Neuladen mitten im Level, defekter Speicherstand, Fehlerbericht | M | V |
| Q-08 | Jeder Bugfix beginnt mit einem Test, der den Fehler zeigt | M | V |
| Q-09 | Eine manuelle Checkliste deckt ab, was Tests nicht sehen: Optik, Ton, echte Geräte | S | V |

Automatische Tests beweisen, dass Logik, Inhalte und Abläufe stimmen. Ob das Spiel gut aussieht, sich gut anfühlt und auf dem iPhone einer Mitstudentin läuft, zeigen sie nicht. Dafür braucht es Q-09 und Testrunden mit der Gruppe.

### 5.6 Hosting und Betrieb

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| B-01 | Hosting auf GitHub Pages aus einem öffentlichen Repository; Veröffentlichung über GitHub Actions ab `main` | M | E |
| B-02 | Die Fälle samt Lösungen sind damit öffentlich einsehbar; das ist akzeptiert | – | E |
| B-03 | Version und Commit sind im Spiel sichtbar | S | V |

## 6. Technik

| Bereich | Entscheid | Herk. |
|---|---|---|
| Build | Vite | E |
| Sprache | TypeScript im strikten Modus | E |
| 3D | Three.js | E |
| Oberfläche | HTML und CSS ohne UI-Framework | V |
| Schema-Prüfung | Zod | V |
| Unit-Tests | Vitest | V |
| End-to-End-Tests | Playwright | V |
| Stilprüfung | ESLint und Prettier | V |

**Module**

| Ordner | Aufgabe | Darf abhängen von |
|---|---|---|
| `src/core` | Spielzustand, Anzeigen, Ziehung, Bewertung, Balance | nichts ausser `content`-Typen |
| `src/content` | Schema, Laden und Prüfen der JSON-Dateien | – |
| `src/storage` | `ProgressStore` und die localStorage-Umsetzung | `core` |
| `src/logging` | Logger, Ringpuffer, Fehlerbericht | – |
| `src/render` | Three.js-Szene: Gebäude, Stadt, Kamera, Effekte | `core` (nur lesend) |
| `src/ui` | HTML-Oberfläche: Anzeigen, Karten, Dialoge | `core` |
| `src/audio` | Geräusche | – |

## 7. Nicht im Umfang der ersten Version

- Backend, zentrale Resultate, Ranglisten
- Login oder Konten
- Weitere Sprachen
- Echte Physik
- Live-Anbindung an ein AI-Modell
- Videos als Inhalt (nur der technische Typ ist vorhanden)

## 8. Reihenfolge der Umsetzung

Das Spiel ist ab Meilenstein 2 ohne 3D spielbar. So kann die Gruppe Fälle schreiben und testen, während die Grafik entsteht, und das grösste Risiko (3D-Aufwand) gefährdet den Inhalt nicht.

| Nr. | Meilenstein | Ergebnis |
|---|---|---|
| M0 | Gerüst | Projekt, Tests, CI und Veröffentlichung laufen mit einer leeren Seite |
| M1 | Logik und Inhalte | Spiellogik, Schema, Prüf-Skripte, alles getestet, noch ohne Oberfläche |
| M2 | Spielbar ohne 3D | Ein Level von Anfang bis Ende im Einfach-Modus, mit Speichern und Logging |
| M3 | Gebäude in 3D | Gebäude, Wackeln, Neigung, Einsturz |
| M4 | Stadt und alle Level | Kulisse, fünf Level, Stadtansicht, Gesamtauswertung |
| M5 | Feinschliff | Ton, Barrierefreiheit, Performance, Fehlerbericht |
| M6 | Inhalte fertig | Alle Fälle freigegeben, Balance justiert, Testrunde mit der Gruppe |
