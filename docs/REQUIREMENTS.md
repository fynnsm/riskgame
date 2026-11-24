# Risk Tower (Arbeitstitel) – Requirements

Version 0.10 · Stand 24.11.2026 · HWZ BDA-A25, Project Management, Projekt 1 (Gruppe Jess), Thema «Risikomanagement mit AI»

## 1. Zweck

Risk Tower ist ein Browser-Game und zugleich das ganze E-Learning der Gruppe. Die Spielerin oder der Spieler baut fünf Gebäude. Jedes Gebäude ist ein kleines Projekt, das durch Entscheide im Risikomanagement stabil bleibt oder einstürzt. Die Situationen handeln davon, wie man AI im Risikomanagement von Projekten sinnvoll einsetzt und wo ihre Grenzen liegen.

Dieses Dokument ist die verbindliche Grundlage für die Umsetzung. Offene Fragen stehen in `later/BRAINSTORMING.md`, das Inhaltsformat in `IMPORT.md`, die Arbeitsregeln für den Coding-Agenten in `CLAUDE.md`.

**Legende**

- Priorität: **M** = Muss, **S** = Soll, **K** = Kann
- Herkunft: **E** = im Gespräch entschieden, **A** = Vorgabe aus dem Auftrag des Dozenten, **V** = Vorschlag von Claude, von Fynn noch nicht bestätigt

Fynn hat am 23.11.2026 alle Punkte mit **V** bestätigt. Sie gelten damit wie **E**. Die Markierung bleibt stehen, damit die Herkunft nachvollziehbar ist.

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
4. **Situationen:** Acht Situationen, zufällig aus einem grösseren Pool. Jede hat drei Optionen. Jede Wahl verändert Budget, Zeit und Stabilität und setzt ein Stockwerk auf das Gebäude.
5. **Ende des Levels:** Fällt eine Anzeige auf null, stürzt das Gebäude ein, die Auswertung erklärt warum, und das Level beginnt neu. Bleibt es stehen, folgt die Bauabnahme: Wer zu wenige Punkte hat, besteht nicht und wiederholt das Level. Sonst bleibt das Gebäude so stehen, wie es abgeschlossen wurde, gerade oder schief.
6. **Schluss:** Nach Level 5 zeigt die Stadt alle fünf Gebäude und die Gesamtauswertung.

## 4. Funktionale Anforderungen

### 4.1 Struktur und Ablauf

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| F-101 | Theorie, Situationen und Auswertung laufen im Spiel unter einem einzigen Link | M | E |
| F-102 | Es gibt fünf Level in fester Reihenfolge | M | E |
| F-103 | Ein Level wird erst spielbar, wenn das vorherige abgeschlossen ist | S | V |
| F-104 | Level-Ablauf: Briefing, Theorie, Situationen, Auswertung | M | E |
| F-105 | Pro Durchgang werden 8 Situationen zufällig aus einem Pool von mindestens 10 gezogen (beide Zahlen pro Level einstellbar); die Level der ersten Version haben je 12 | M | E |
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
| F-212 | Eine Anzeige unter 30 gilt als kritisch. Die Anzeige sagt das in Worten, und am Gebäude steht pro kritischer Anzeige ein Warnschild mit eigenem Symbol (Münze, Uhr, Riss). Ohne kritische Anzeige gibt es kein Warnschild. Die Schwelle legt die Spiellogik fest | M | E |
| F-207 | Die Reihenfolge der Optionen wird gemischt, und die Buttons sind neutral gefärbt (keine Ampelfarben, die die Lösung verraten) | M | V |
| F-208 | Nach der Wahl zeigt das Spiel die Erklärung zur gewählten Option und die Veränderung der Anzeigen | M | E |
| F-209 | Nach einem Einsturz zeigt die Auswertung, welche Entscheide das Gebäude gekippt haben und warum; danach startet das Level neu, nicht das Spiel | M | E |
| F-210 | Jede Option trägt eine Einstufung (gut, vertretbar, riskant) für Auswertung und Lernerfolg; vor der Wahl ist sie nicht sichtbar | S | V |
| F-211 | Bauabnahme: Ein Gebäude, das stehen bleibt, gilt nur als bestanden, wenn mindestens 69 % der möglichen Punkte erreicht sind, gerundet auf den nächsten ganzen Punkt (M-26; ohne Rundgang und Ereignisse 11 von 16). Punkte geben die Entscheide (gut = 2, vertretbar = 1, riskant = 0), der Rundgang (M-13) und die Ereignisse (M-25). Sonst ist das Level nicht bestanden und wird wiederholt. Die Regel steht im Briefing | M | E |

Werte der Balance: Anzeigen beginnen bei 76; klein = 6, mittel = 14, gross = 26 Punkte. Verlauf: Am 23.11.2026 verschärft (Start 60, 6/14/26, 8 Situationen, Bauabnahme), weil das Spiel ohne Lesen zu bestehen war. Am 24.11.2026 Startwert auf 76 gehoben (Entscheid Fynn), weil sonst perfektes Spiel rechnerisch nie über 36 enden kann: Jede gute Option kostet mindestens 6 Punkte, acht Entscheide also mindestens 48 auf Budget und Zeit zusammen.

Regel zu F-205 (in `src/core/balance.ts` einstellbar, am 24.11.2026 angepasst): Die Neigung beginnt, sobald die schwächste Anzeige unter 40 fällt, und wächst bis 0. Sie zählt zu 85 %, der Abstand zwischen höchster und tiefster Anzeige zu 15 %. Das Wackeln beginnt unter 30, zusammen mit der Warnung (F-212). Wer gut entscheidet, endet bei mindestens 40 und hat damit ein gerades Gebäude. Das Gebäude neigt sich in die Richtung der schwächsten Anzeige (Budget nach links, Zeit nach rechts, Stabilität nach vorn). Jedes Stockwerk wird um die Neigung des Moments versetzt aufgesetzt. Zusätzlich sieht man jedem Stockwerk den Entscheid an, der es gebaut hat: Nach einem vertretbaren sitzen die Module leicht schief, nach einem riskanten deutlich und mit einem Loch statt einem Fenster.

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
| F-411 | Stil: farbige Klötze ohne Texturen, inspiriert vom Voxel-Look bekannter Mobile-Games, aber mit eigenen Formen, Figuren und Namen. Vorlage ist die Skizze der Gruppe: isometrische Sicht, Turm aus bunten Modulen mit Fenstern, Kräne, ein hängendes Bauteil, Arbeiter, Warnschilder bei Gefahr, dichte Stadt mit Strassen, Autos und Bäumen | M | E |

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

Regeln zu F-602 und F-603 (Vorschlag von Claude, in `src/core/balance.ts` einstellbar):

- Punkte pro Entscheid: gut = 2, vertretbar = 1, riskant = 0.
- Sterne: Ein bestandenes Level (F-211) gibt immer 1 Stern. 2 Sterne ab 80 % der möglichen Punkte und einer tiefsten Anzeige von mindestens 5. 3 Sterne ab 90 % der Punkte und einer tiefsten Anzeige von mindestens 10. Ein Einsturz oder eine nicht bestandene Bauabnahme gibt keinen Stern.
- Ein Lernziel gilt als erreicht, wenn die Entscheide zu seinen Situationen im Durchgang mindestens 75 % der möglichen Punkte ergeben. Wurde keine seiner Situationen gezogen, gilt es als «nicht geprüft».
- Aktive Spielzeit (F-108): Gezählt wird die Zeit zwischen zwei Aktionen in einem Level, pro Pause höchstens 2 Minuten.

### 4.7 Speichern

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| F-701 | Der Fortschritt liegt lokal im Browser (localStorage); kein Server, keine Cookies | M | E |
| F-702 | Gespeichert wird nach jedem Schritt; nach dem Neuladen geht es an derselben Stelle weiter | M | V |
| F-703 | Der Zugriff läuft ausschliesslich über eine Schnittstelle `ProgressStore`, damit später ein Backend angeschlossen werden kann | M | E |
| F-704 | Der Speicherstand ist versioniert und wird beim Laden geprüft; ein ungültiger Stand führt zu einem sauberen Neustart mit Hinweis, nie zu einem Absturz. Der ungültige Stand wird sofort durch einen leeren ersetzt, damit der Hinweis genau einmal erscheint | M | V |
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
| F-907 | Ein Skript simuliert die Balance pro Level: Wer nur gute Optionen wählt, besteht jede Ziehung; wer nur riskante wählt, scheitert in jeder | S | V |
| F-910 | Das Balance-Skript prüft pro Level über alle Ziehungen und schlägt bei jedem Verstoss fehl: Nur gute Optionen: kein Einsturz, jede Anzeige endet bei mindestens 40, Neigung am Schluss höchstens 10 % des Maximums. Nur vertretbare: kein Einsturz, Bauabnahme nicht bestanden. Nur riskante: Einsturz spätestens beim fünften Entscheid. Zufällige Wahl (5000 Läufe): 60 bis 90 % scheitern | M | E |
| F-911 | Die Inhaltsprüfung lehnt ein Level ab, wenn weniger als 40 % der Optionen eine Budgetwirkung haben oder mehr als 60 % der Kosten der guten Optionen auf dieselbe Anzeige entfallen. Sie warnt, ohne abzulehnen, wenn die gute Option der längste Text ist (ab 50 % der Situationen mit Nennung der Grenze) oder der längste Optionstext über 30 % länger ist als der kürzeste; die Texte gehören der Gruppe | M | E |
| F-912 | `npm run content:report` schreibt `docs/CONTENT-REPORT.md` mit diesen Zahlen pro Level; die CI schlägt fehl, wenn der Bericht nicht aktuell ist | S | E |
| F-909 | Dasselbe Skript spielt jedes Level 2000-mal mit zufälligen Entscheiden. Besteht blindes Klicken in mehr als 20 % der Durchgänge, schlägt die Prüfung fehl | M | E |
| F-908 | Ein Skript erzeugt aus den JSON-Dateien eine Inhaltsdokumentation als Markdown (für das Lieferobjekt «Dokumentation der Inhalte») | K | V |

Ergänzung zu F-906 (entschieden am 23.11.2026, angepasst am 24.11.2026): Ein Build mit der Variable `VITE_SHOW_DRAFTS=1` zeigt auch Entwürfe. Die Marke «Entwurf» sehen nur Autorinnen und Autoren, nämlich mit `?debug=1` und im lokalen Entwicklungsmodus. Solange Entwürfe veröffentlicht werden, gibt die CI beim Veröffentlichen eine Warnung mit ihrer Anzahl aus. So lässt sich eine Version mit Platzhalter-Fällen online testen. Ohne die Variable gilt F-906 unverändert; ein Level mit zu wenigen freigegebenen Fällen erscheint dann als «noch nicht verfügbar».

Ergänzung zu F-504: Erlaubte Video-Hosts sind `www.youtube-nocookie.com` und `player.vimeo.com` (Vorschlag von Claude, Liste in `src/content/schema.ts` und in der CSP von `index.html`).

### 4.10 Logging und Fehlerbericht

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| L-01 | Es gibt ein zentrales Logging-Modul; ausserhalb davon wird nicht direkt in die Konsole geschrieben | M | E |
| L-02 | Protokolliert werden: Start mit Version, Laden und Prüfen der Inhalte, jeder Zustandswechsel, jede Wahl mit IDs und Anzeigewerten, Speichern und Laden, Ton, Verlust des Grafik-Kontexts, Einbrüche der Bildrate, alle unbehandelten Fehler | M | E |
| L-03 | Die letzten 300 Einträge bleiben in einem Ringpuffer, der ein Neuladen übersteht | S | V |
| L-04 | Ein Knopf «Fehlerbericht kopieren» steht im Menü und auf jeder Fehlermeldung; er kopiert in die Zwischenablage, mit Textfeld als Ausweichlösung | M | E |
| L-05 | Der Bericht enthält Version und Commit, Zeitpunkt, Browser und Gerät, Fenstergrösse, Grafikmodus, Bildrate der letzten 30 Sekunden (Durchschnitt und Minimum) mit Qualitätsstufe, Spielstand mit Seed und Wahlfolge sowie die letzten Log-Einträge | M | E |
| L-06 | Der Bericht enthält keine Personendaten und wird nie automatisch verschickt; man sieht ihn vor dem Kopieren | M | E |
| L-07 | Mit Seed und Wahlfolge aus dem Bericht lässt sich der Ablauf als automatischer Test nachstellen | S | V |
| L-08 | Bei einem Fehler erscheint eine verständliche Fehlerseite mit dem Bericht-Knopf, nie eine weisse Seite | M | V |
| L-09 | Debug-Modus über `?debug=1`: Overlay mit Bildrate, Zeichenaufrufen, Dreiecken, Qualitätsstufe, Anzeigen und Seed, dazu Level-Sprung auch zu gesperrten Leveln | S | V |

## 5. Nicht-funktionale Anforderungen

### 5.1 Plattform und Bedienung

| ID | Anforderung | Prio | Herk. |
|---|---|---|---|
| N-101 | Das Spiel läuft im Browser ohne Installation und ohne Login | M | E |
| N-102 | Die 3D-Szene füllt das ganze Fenster. Im breiten Fenster (Laptop) steht die Texttafel rechts, im hohen (Handy) unten. Die Kamera rückt das Gebäude in den freien Teil. Entschieden am 23.11.2026, ersetzt die frühere Hochformat-Spalte | M | E |
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
| `src/ui` | HTML-Oberfläche: Anzeigen, Karten, Dialoge | `core`; aus `render` nur `director.ts` und `tuning.ts` (reine Funktionen und Zahlen ohne Three.js), damit Oberfläche und Szene denselben Ablauf kennen |
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

## 9. Stand der Umsetzung

Stand 23.11.2026, erste Version (Meilensteine M0 bis M4).

**Umgesetzt:** Gerüst mit Tests und CI; Spiellogik, Schema, Prüf- und Balance-Skript; fünf Level mit je vier Theorie-Karten und zwölf Situationen (alle als Entwurf von Claude, fachlich nicht geprüft); Bauabnahme und verschärfte Balance; Vollbild-Layout; Grafik nach der Skizze; Einfach-Modus ohne 3D; Speichern, Logging, Fehlerbericht und Fehlerseite; Gebäude in 3D mit Neigung, Wackeln und Einsturz; Stadt mit Kulisse, Stadtansicht und Gesamtauswertung.

Was noch fehlt, steht als Liste zum Abhaken in Kapitel 10.

## 10. To-do

Was bis zur Abgabe noch zu tun ist, in der Reihenfolge, in der es sinnvoll ist. Wer einen Punkt erledigt, hakt ihn im selben Pull Request ab.

### Jetzt: damit die Gruppe testen kann

- [ ] Pull Request 1 durchsehen und mergen
- [ ] Spiel auf dem eigenen Handy und Laptop durchspielen, nach `docs/CHECKLIST.md` und `docs/CHECKLIST-VISUAL.md` (Q-09, G-81)
- [ ] Repository öffentlich stellen und GitHub Pages einschalten, Schritte im README (B-01)
- [ ] Variable `SHOW_DRAFTS=1` setzen, solange die Fälle Entwürfe sind (F-906)
- [ ] Link an die Gruppe schicken

### Gruppe: Inhalte (M6)

- [ ] Entscheiden: Platzhalter-Fälle von Claude überarbeiten oder durch eigene ersetzen
- [ ] Level 1, Risiken identifizieren: 12 Fälle und 4 Karten prüfen, `status` auf `freigegeben`
- [ ] Level 2, Risiken bewerten: 12 Fälle und 4 Karten prüfen, `status` auf `freigegeben`
- [ ] Level 3, Massnahmen planen: 12 Fälle und 4 Karten prüfen, `status` auf `freigegeben`
- [ ] Level 4, Risiken überwachen: 12 Fälle und 4 Karten prüfen, `status` auf `freigegeben`
- [ ] Level 5, Grenzen der AI: 12 Fälle und 4 Karten prüfen, `status` auf `freigegeben`
- [ ] Lernziele pro Level bestätigen oder umformulieren (R-04)
- [ ] `quelle` bei jedem Fall mit der echten Quelle füllen (Buch, Kapitel, Skript)
- [ ] Prüfen, ob die Spielzeit auf rund 60 Minuten kommt; sonst mehr Fälle oder Theorie (R-01)
- [ ] Offene Fragen in `docs/later/BRAINSTORMING.md` in der Gruppe klären

### Entwicklung: Feinschliff (M5)

- [x] Ton für Bauen, Wahl, Wackeln, Einsturz und Erfolg, im Browser erzeugt (F-801, F-804, F-805)
- [x] Stumm-Schalter, immer sichtbar, Wahl gespeichert (F-802, F-803)
- [ ] Theorie während der Situationen nachschlagen (F-506)
- [x] Debug-Overlay mit Bildrate, Anzeigen, Seed und Level-Sprung über `?debug=1` (L-09)
- [ ] Kontrast nach WCAG AA und Schriftgrössen messen statt schätzen (N-302)
- [ ] Bildrate auf einem Mittelklasse-Handy messen (N-202)
- [ ] Safari auf iOS und macOS sowie Firefox von Hand prüfen (N-103)
- [ ] Skript für die Inhaltsdokumentation aus den JSON-Dateien (F-908)

### Entwicklung: nach der ersten Testrunde

- [ ] Schwierigkeit mit der Gruppe testen: Ist die Bauabnahme bei 69 % richtig, zu streng oder zu mild? (F-211)
- [ ] Balance mit den echten Fällen justieren: Startwerte, Stufen, Sterne in `src/core/balance.ts` (O-4)
- [ ] Regeln für Sterne, Lernziele und Neigung in der Gruppe bestätigen oder ändern (F-205, F-602, F-603)
- [ ] Erlaubte Video-Hosts bestätigen, falls Videos dazukommen (F-504)
- [ ] Grafik auf echten Handys prüfen: Bildrate mit der dichten Stadt, Lesbarkeit der Tafel (N-202)
- [ ] Entscheiden, ob eine Pixel-Schrift wie in der Skizze eingebunden wird; braucht eine Schriftdatei mit passender Lizenz (S-10)
- [ ] Rückmeldungen und Fehlerberichte der Gruppe abarbeiten, je mit einem Test zuerst (Q-08)

### GitHub

- [ ] `main` schützen: Pull Request und grüne CI als Pflicht (S-08)
- [ ] Secret Scanning mit Push-Schutz einschalten (S-08)
- [ ] 2FA bei allen mit Schreibrecht prüfen (S-08)
- [ ] Vor der Abgabe `SHOW_DRAFTS` wieder entfernen, sobald alle Fälle freigegeben sind (F-906)

### Abgabe (aus dem Auftrag)

- [ ] Konzept und Drehbuch (R-05)
- [ ] Dokumentation der Inhalte, Screenshots zählen (R-05, R-06)
- [ ] Teaser-Video, höchstens 3 Minuten (R-05)
- [ ] Evaluation: festlegen, wie das Feedback der Mitstudierenden zur Gruppe kommt, und auswerten (R-05, F-605)
- [ ] Sicherstellen, dass die Seite mindestens 60 Tage online bleibt (R-02)
- [ ] Bewertungsraster und Abgabetermine beim Dozenten einholen (O-10)

## 11. Grafik-Update

Aus dem Auftrag «Update 2», Teil B. Ziel: Das Spiel soll sich fertig und belohnend anfühlen. Es ändert sich keine Spielregel. Entschieden am 24.11.2026: Die fünf Level bekommen unterschiedliche Tageszeiten.

Stand: **U** = umgesetzt, **O** = offen.

| ID | Anforderung | Prio | Stand |
|---|---|---|---|
| G-01 | Änderungen des Grafik-Updates liegen nur in `src/render`, `src/ui`, `src/audio`. Braucht die Darstellung eine neue Information, liefert `core` sie als Zustand | M | U |
| G-02 | Nur Klötze mit flachen Farben: keine Texturen, Bilddateien oder externen Modelle; eigene Formen und Figuren | M | U |
| G-03 | Zufall für Dekoration kommt aus einem eigenen Generator in `render`; der Generator des Spiels läuft dadurch nie weiter | M | U |
| G-04 | Jede Animation ist überspringbar (Klick, Enter, Escape) und hält die Bedienung höchstens 4 Sekunden auf | M | U (Sequenzen nach einem Level: Klick, Enter, Escape, höchstens 3.75 Sekunden; Schlussbildschirm und Startseite halten niemanden auf, weil Text und Knöpfe von Anfang an da sind) |
| G-05 | Bei «Bewegung reduzieren»: keine Kamerafahrten, kein Kamerawackeln, kein Blitzen; stattdessen Überblendung auf das Endbild | M | U für alles bisher Umgesetzte |
| G-06 | `?renderer=none` bleibt vollständig spielbar; jeder neue Bildschirm hat dort eine Text-Entsprechung | M | U |
| G-07 | Alle Farben stehen in `src/render/palette.ts`, alle Zeiten und Mengen in `src/render/tuning.ts` | M | U |
| G-08 | Leistungsgrenzen gemäss `docs/PERFORMANCE.md`: Zeichenaufrufe höchstens das 1.5-Fache des Ist-Zustands, höchstens 80 kB zusätzliche Übertragung, mindestens 30 Bilder pro Sekunde auf einem Mittelklasse-Handy | M | U (Messung und Test), Bildrate nur auf echten Geräten prüfbar |
| G-09 | Jede neue Darstellung nennt, was sie auf Qualitätsstufe 0, 1 und 2 zeigt; Stufe 0 zeigt keine Dekoration ausser Wolken | M | U (Regel in `director.ts`) |
| G-10 | Regie-Schicht `src/render/director.ts`: reine Funktionen ohne Three.js, die aus dem Spielzustand Anweisungen für die Szene berechnen; vollständig unit-getestet | M | U |
| G-20 | Himmel als Farbverlauf passend zur Tageszeit; ein gerichtetes Licht und ein Umgebungslicht; weiche Schatten nur auf Stufe 2; leichter Dunst zum Stadtrand | M | U |
| G-21 | Tageszeiten: Level 1 Morgen, 2 Mittag, 3 Nachmittag, 4 Abendlicht, 5 Nacht mit leuchtenden Fenstern und Strassenlampen; Startseite Mittag; Schlussansicht Abend mit Übergang zur Nacht | M | U |
| G-30 | Wolken: 6 bis 10 Klotz-Wolken in zwei Höhen, ziehen langsam, mit Schatten auf der Stadt (alle Stufen) | S | U (auf Stufe 2 echte Schatten, sonst weiche Flecken; Wolken weichen dem Gebäude aus) |
| G-31 | Flugzeug quert alle 20 bis 40 Sekunden, mit Schatten; nie über der Bildmitte während einer Entscheidung (Stufe 1, 2) | S | U (während eines Levels fliegt es immer seitlich am Gebäude vorbei) |
| G-32 | Heissluftballon und Vogelschwarm (Stufe 2) | K | U |
| G-33 | Verkehr mit Bus, Lieferwagen und Tram; Fahrzeuge fahren an Kreuzungen nicht ineinander (Stufe 1, 2) | S | U (eine gemeinsame Ampelphase für alle Kreuzungen; getestet über zehn simulierte Minuten) |
| G-34 | Fussgänger auf Trottoirs mit einfacher Lauf-Animation (Stufe 2) | K | U |
| G-35 | Bäume wiegen leicht, Wasserflächen schimmern, Rauch aus einzelnen Kaminen (Stufe 1, 2) | K | U |
| G-36 | Nachts leuchten Fenster zufällig, Fahrzeuge haben Lichter (Stufe 1, 2) | S | U |
| G-40 | Gebäudetypen: `projekt.gebaeude` bestimmt Fassade, Fensterraster, Farben und Dachaufbau; die fünf Gebäude sind in der Stadtansicht auf einen Blick unterscheidbar | M | U |
| G-41 | Stockwerk setzen: Kran schwenkt ein, Stockwerk senkt sich ab und federt, Staub, Arbeiter reagieren; höchstens 1.2 Sekunden | S | U (Kran schwenkt, Stockwerk federt, Staub; die Arbeiter reagieren noch nicht auf das Setzen) |
| G-42 | Reaktion auf die Wahl am neuen Stockwerk (gut: grüner Schein; riskant: versetzt, Risse, ein Brocken fällt); die Einstufung steht immer auch als Text da | S | U (grüner Rahmen statt Schein, weil die Klötze nicht leuchten können; Risse und ein fallender Brocken) |
| G-43 | Wackeln und Neigung bewegen sich weich; im kritischen Bereich lösen sich kleine Teile, die Arbeiter treten zurück | S | U (Neigung folgt weich; im kritischen Bereich treten die Arbeiter zurück, lose Teile fallen nur nach riskanten Entscheiden) |
| G-44 | Fertigstellung: Dach wird aufgesetzt, Gerüst und Kran verschwinden, der Bauzaun weicht einem Vorplatz mit Bäumen | S | U |
| G-45 | Einsturz: Stockwerke kippen nacheinander in Neigungsrichtung, Staubwolke, Trümmer bleiben liegen, Schild «Baustopp», kurzes Kamerawackeln | S | U (das Wort «Baustopp» steht in der Auswertung, weil Klötze keine Schrift tragen) |
| G-50 | Bildschirm «Level bestanden»: Fertigstellung, Kameraschwenk im Viertelkreis, Banner «Bauabnahme bestanden», Sterne einzeln, dann die Auswertung; Feier nach Sternen (3: Feuerwerk, Fahne, Jubel; 2: Konfetti, Fahne; 1: nur Banner) | M | U (der Schwenk geht 45 Grad zur Seite und zurück statt 90 Grad weiter, damit nach der Sequenz dieselbe Ansicht steht; die Arbeiter jubeln oder nicken noch nicht) |
| G-51 | Bildschirm «Bauabnahme nicht bestanden»: Figur mit Klemmbrett, Stempel «Nicht abgenommen», Absperrband; kein Jubel, kein Einsturz | M | U |
| G-52 | Bildschirm «Einsturz»: Sequenz aus G-45, dann die Auswertung | M | U |
| G-53 | Eigener Schlussbildschirm nach fünf Leveln: Kameraflug, Flugzeug mit Banner, Übergang zur Nacht, Feuerwerk, Titel nach Sternen (15: Goldene Stadt; 11 bis 14: Solide Stadt; 5 bis 10: Stadt mit Baustellen), Gesamtauswertung als eigene Seite | M | U (das Banner am Flugzeug trägt pro Stern einen Klotz statt einer Zahl, weil Klötze keine Schrift tragen) |
| G-54 | Schlussbildschirm: «Stadt ansehen» (Oberfläche aus, Kamera frei), «Bild speichern» (PNG, nichts wird hochgeladen), «Nochmals spielen» | S | U |
| G-55 | Startseite: Schriftzug, langsamer Kameraflug, ein Hauptknopf («Spielen» oder «Weiterspielen»), Bauplätze zeigen den Zustand; Einleitungstext nur, solange kein Level abgeschlossen ist | M | U |
| G-56 | Levelstart: Die Kamera fliegt von der Stadtansicht zum Bauplatz | S | U (die Kamera gleitet von der Stadtansicht zum Bauplatz) |
| G-57 | Jeder Bildschirm setzt beim Erscheinen den Fokus auf seine Überschrift | M | U |
| G-60 | Anzeigen mit Symbol (Münze, Uhr, Gebäude); Wertänderung zählt sichtbar, die Differenz schwebt kurz daneben; unter 30 pulsiert der Rahmen ruhig | S | U |
| G-61 | Fortschrittspunkte zeigen das Symbol der Einstufung mit kurzer Animation | K | U |
| G-62 | Karten und Dialoge einheitlich; Übergänge zwischen Bildschirmen 150 bis 250 ms | S | U (Übergänge 200 ms) |
| G-63 | Handy: Das Textfeld lässt sich auf etwa ein Drittel einklappen und klappt beim Setzen eines Stockwerks kurz von selbst ein | S | U |
| G-64 | Laptop: Ein Knopf blendet die Spalte aus | S | U |
| G-65 | Theorie-Grafiken im selben Stil wie das Spiel | K | U |
| G-70 | Ton: Geräusche für Fertigstellung, Sterne, Feuerwerk, Stempel und Flugzeug, leise Stadt-Atmosphäre; alles über den Stumm-Schalter; keine Information nur über Ton | S | U (alle Geräusche im Browser erzeugt; mit dem Stumm-Schalter aus F-802) |
| G-80 | E2E-Tests für die neuen Bildschirme, für reduzierte Bewegung, für `?renderer=none` und für die Zeichenaufrufe; ein Lauf speichert Bildschirmfotos als Artefakt der CI | M | U |
| G-81 | `docs/CHECKLIST-VISUAL.md`: was auf echten Geräten zu prüfen ist, inklusive Ton und Bildrate | S | U |

## 12. Nachtest zu Update 2

Aus dem Auftrag «Nachtest zu Update 2» vom 24.11.2026. Stand: **U** = umgesetzt, **O** = offen.

| ID | Anforderung | Prio | Stand |
|---|---|---|---|
| T-01 | Dreiecke: höchstens 150’000 auf Qualitätsstufe 1 und 80’000 auf Stufe 0, als Grenzen in `tuning.ts` und per E2E-Test geprüft; am Handy startet das Spiel auf Stufe 1 | M | U (verdeckte Flächen werden nicht weggelassen, siehe `docs/PERFORMANCE.md`; die Bildrate ist auf keinem echten Gerät gemessen) |
| T-02 | Feier bei bestandenem Level: Banner zuerst, Sterne gross über dem Bild und nach spätestens 2 Sekunden alle sichtbar, bei 3 Sternen mindestens drei Explosionen mit je 30 bis 60 Klötzen, bei 2 Sternen Konfetti über die ganze Bildbreite; das Textfeld bleibt währenddessen eingeklappt. Dasselbe sinngemäss im Schlussbildschirm | M | U |
| T-03 | Level 5: Die Baustelle hat eigene Scheinwerfer; Stockwerke, Neigung und Warnzeichen sind nachts so gut lesbar wie am Tag | M | U |
| T-04 | Anzeigen brechen kein Wort um. Unter 430 px zeigen sie nur Symbol und Wert; die Beschriftung bleibt als `aria-label` | M | U |
| T-05 | Schlussbildschirm: Level und Sterne in zwei Spalten, Sterne rechtsbündig; «3 von 3 Sternen» bleibt für Bildschirmleser | S | U |
| T-06 | Ton-Knopf: Lautsprecher als eingebettetes SVG, durchgestrichen im stummen Zustand; Beschriftung «Ton: an» und «Ton: aus»; `aria-pressed` und `aria-label` gesetzt | S | U |
| T-07 | Handy: Liegen die Optionen unter dem sichtbaren Bereich, führt ein Hinweis «Was tust du? ↓» am Fuss des Textfelds mit einem Tipp dorthin. Während einer Situation darf das Textfeld 65 % der Höhe einnehmen | M | U |
| T-08 | `index.html` zeigt einen statischen Ladezustand (Schriftzug und «Wird geladen …») ohne Skript und ohne Inline-Stil; er verschwindet, sobald die Oberfläche steht | S | U |
| T-09 | `docs/CONTENT-REPORT.md` listet pro Level die betroffenen Situationen mit den Zeichenzahlen der drei Optionen nebeneinander | S | U |

## 13. Mechaniken (Update 3)

Aus dem Auftrag «Update 3 – Neue Spielmechaniken». Drei Mechaniken verlängern das Spiel um rund 15 bis 20 Minuten und machen das Budget zu einer echten Entscheidungsgrösse. Anders als das Grafik-Update ändert dieses Kapitel Spielregeln. Anforderung F-202 («genau drei Optionen») gilt weiterhin, aber nur für Situationen.

Entschieden am 24.11.2026 (Fynn): Rundgang in Level 1, Ereignisse und Massnahmen in Level 3, 4 und 5; beide zählen für die Bauabnahme nach Qualität des Entscheids; Beispielinhalte von Claude Code als Entwurf mit Autor «CC»; ein Teil der Vorhersagen stammt von einer AI, die sich irren kann.

Stand: **U** = umgesetzt, **O** = offen.

### 13.1 Grundsätze

| ID | Anforderung | Prio | Stand |
|---|---|---|---|
| M-01 | Datengetrieben: Ein Level hat Rundgang oder Ereignisse genau dann, wenn seine Datei den Block `rundgang` oder `ereignisse` enthält. Kein Level-spezifischer Code | M | U (Schema) |
| M-02 | Alle Regeln liegen in `src/core`, alle Zahlen in `src/core/balance.ts`. Jede Regel hat Unit-Tests, bevor Oberfläche oder 3D entstehen | M | U |
| M-03 | Sämtlicher Zufall (Ziehung, Eintreten von Ereignissen) wird beim Start des Durchgangs aus dem Seed bestimmt und im Spielstand gespeichert. Ein Durchgang ist aus Seed und Eingaben vollständig wiederholbar | M | U |
| M-04 | Kein Zeitdruck, keine Geschicklichkeit. Alles ist mit Tastatur bedienbar und läuft mit `?renderer=none` als Text | M | U |
| M-05 | Schema der Inhalte Version 2; Level-Dateien ohne die neuen Blöcke bleiben gültig | M | U |
| M-06 | Spielstand Version 3: abgeschlossene Level und Sterne bleiben erhalten, ein laufender Durchgang wird mit einmaligem Hinweis verworfen. Ist nur der laufende Durchgang unlesbar, gilt dasselbe | M | U |
| M-07 | `docs/IMPORT.md` beschreibt beide Formate; `content:report` zeigt Rundgang-Stellen und Ereignisse mit Status und führt von Claude erstellte Inhalte in einer eigenen Liste | M | U |
| M-08 | Log-Ereignisse `tour.start`, `tour.classify`, `tour.finish`, `event.forecast`, `event.verify`, `event.strategy`, `event.resolve`, je mit IDs und Anzeigewerten; der Fehlerbericht enthält sie | M | U |

### 13.2 Baustellen-Rundgang

| ID | Anforderung | Prio | Stand |
|---|---|---|---|
| M-10 | Nach der Theorie und vor Situation 1 geht die Spielerin oder der Spieler über die Baustelle. Eine AI-Drohne hat vorab Stellen markiert | M | U |
| M-11 | Pro Durchgang 8 Stellen: 3 echte Risiken, von der AI gefunden; 2 Fehlalarme; 2 echte Risiken, von der AI übersehen; 1 Stelle ohne Risiko und ohne Markierung. Jeder Ort kommt höchstens einmal vor | M | U |
| M-12 | Jede Stelle öffnet eine Karte mit der Beobachtung und den Knöpfen «Ins Risikoregister» und «Kein Risiko». Die Wahl ist bis zum Abschluss änderbar; ein Zähler zeigt «x von 8 beurteilt»; «Rundgang beenden» ist jederzeit möglich, nicht beurteilte Stellen zählen als «Kein Risiko» | M | U |
| M-13 | Wirkung: 7 oder 8 richtig geben + klein auf die Start-Stabilität und 2 Punkte für die Bauabnahme; 5 oder 6 lassen die Stabilität unverändert und geben 1 Punkt; 0 bis 4 kosten − klein und geben 0 Punkte | M | U |
| M-14 | Die Auflösung zeigt alle 8 Stellen mit richtig oder falsch, der Erklärung und einem Hinweis, ob die Drohne richtig lag. Briefing und Auswertung nennen den Rundgang und die Punkte | M | U |
| M-15 | Darstellung: Kamera über der ganzen Baustelle, die Drohne fliegt eine Runde und setzt Markierungen; jede Stelle ist zusätzlich ein HTML-Knopf in einer Liste «Orte»; beurteilte Stellen zeigen vor der Auflösung nur «beurteilt» | S | U (Kamera bleibt auf der Baustelle; Knöpfe über den Pins sind HTML) |

Balance mit Rundgang: In der Simulation beurteilt die sorgfältige Spielweise den Rundgang gut, die vertretbare mittel, die riskante schlecht; wer zufällig wählt, wirft für jede Stelle eine Münze. Weil zufälliges Spielen dadurch häufiger scheitert, wurde in Level 1 eine Wirkung angepasst (L1-S01, riskante Option: Stabilität «-gross» zu «-mittel»). Der Wert liegt mit 89 % knapp unter der Grenze von 90 %.

### 13.3 Ereignisse und Massnahmen

| ID | Anforderung | Prio | Stand |
|---|---|---|---|
| M-20 | Pro Durchgang 3 Ereignis-Runden, nach dem 2., 4. und 6. Entscheid: Meldung mit Wahrscheinlichkeit und Auswirkung, Wahl einer Strategie, Kosten sofort, Auflösung nach dem nächsten Stockwerk | M | U |
| M-21 | Vier Strategien in fester Reihenfolge: Vermeiden (keine Auswirkung), Vermindern (jede Auswirkung eine Stufe kleiner), Übertragen (Auswirkung auf das Budget entfällt), Akzeptieren (volle Auswirkung, kostenlos). Kosten und Wirkung sind vor der Wahl sichtbar; nicht verfügbare Strategien sind gesperrt und nennen den Grund | M | U |
| M-22 | Wahrscheinlichkeit: tief 20 %, mittel 40 %, hoch 60 % | M | U |
| M-23 | AI-Prognose: Ein Ereignis kann seine Wahrscheinlichkeit als Prognose einer AI zeigen, mit Begründung. «Im Team prüfen» kostet 3 Punkte Zeit und zeigt die tatsächliche Wahrscheinlichkeit. Die Auswertung hält fest, ob einer unzuverlässigen Prognose ungeprüft vertraut wurde | M | U |
| M-24 | Reihenfolge: Kosten der Strategie sofort; Auswirkung des Ereignisses bei der Auflösung, nach der Wirkung des Entscheids derselben Runde. Fällt eine Anzeige auf 0, stürzt das Gebäude ein | M | U |
| M-25 | Punkte: Eine empfohlene Strategie gibt 1 Punkt, unabhängig vom Ausgang. Die Empfehlung bezieht sich auf die tatsächliche Wahrscheinlichkeit | M | U |
| M-26 | Bauabnahme: Die Schwelle ist ein Anteil von 0.69 der möglichen Punkte, gerundet auf die nächste ganze Zahl (ohne neue Mechaniken 11 von 16). Briefing und Sterne folgen derselben Logik. Ersetzt die Rundung von F-211 | M | U |
| M-27 | Auswertung pro Ereignis: «Gut entschieden», «Gut entschieden, trotzdem Pech», «Glück gehabt» oder «Hier hat die Vorsorge gefehlt». Nach einem Einsturz erscheinen Ereignisse, die dazu beigetragen haben, in der Liste der Ursachen | M | U (fünfte Aussage «Sicher, aber teuer» zu bestätigen) |
| M-28 | Darstellung: Das Ereignis kündigt sich in der Szene an (Wolken, stehender Lastwagen, leere Arbeitsplätze, Funken am Kran, Figur mit Aktenkoffer). Die gewählte Massnahme wird als Bauteil sichtbar und bleibt am fertigen Gebäude. Tritt das Ereignis ein, spielt eine Szene von höchstens 2 Sekunden, überspringbar | S | U (Bewegung und Erkennbarkeit auf echten Geräten zu prüfen) |
| M-29 | Balance: Die Simulation prüft pro Level mit Ereignissen die sechs Kombinationen aus dem Auftrag, Abschnitt 5; keine einzelne Strategie ist immer richtig | M | O (Simulation U; drei Bedingungen offen, siehe 13.4) |


Offen zu M-27, bitte bestätigen: Der Auftrag nennt vier Aussagen. Für einen Fall passt keine davon: Jemand wählt mehr Schutz, als das Risiko wert war (zum Beispiel «Vermeiden», wo «Akzeptieren» empfohlen ist). Das ist weder Glück noch fehlende Vorsorge. Die Regeln kennen dafür eine fünfte Aussage, Arbeitstitel «Sicher, aber teuer». Sie gibt wie jede nicht empfohlene Strategie keinen Punkt.

Ebenfalls festgelegt, weil der Auftrag es offen lässt:

- Ein Ereignis wird nur angekündigt, wenn danach noch ein Stockwerk folgt, auf dem es aufgelöst werden kann. Ein Level mit sechs Entscheiden hat darum zwei Runden, eines mit acht alle drei.
- Fällt eine Anzeige schon durch die Kosten der Strategie oder durch die Prüfung im Team auf null, stürzt das Gebäude sofort ein.
- Das oberste Stockwerk zeigt die Anzeigen von jetzt, nicht die vom Moment, als es gesetzt wurde: Was ein Ereignis seither gekostet hat, sieht man an der Neigung.
- Wurde eine empfohlene Strategie gewählt und das Ereignis richtete keinen Schaden an (weil es ausblieb oder vermieden wurde), heisst es «Gut entschieden»; «trotzdem Pech» nur, wenn trotz empfohlener Strategie Schaden blieb.

### 13.4 Balance mit Ereignissen: Stand und offene Entscheidung

`npm run simulate:balance` spielt jedes Level mit Ereignissen in 5000 Durchgängen pro Spielweise, mit denselben Schritten wie das Spiel. Gemessen in Level 3, 4 und 5 (die Werte der drei Level liegen innerhalb von einem Prozentpunkt):

| Spielweise (gute Entscheide, ausser «zufällig») | Auftrag | Gemessen | Stand |
|---|---|---|---|
| Immer empfohlen, alle drei Ereignisse treten ein | kein Einsturz, bestanden | 0 Einstürze, 0 nicht bestanden | erfüllt, erzwungen |
| dito | jede Anzeige mindestens 30 | tiefste Anzeige 14; in der Hälfte der Durchgänge mindestens 32 | **offen** |
| Erst alle Prognosen prüfen, dann empfohlen | kein Einsturz | 0 Einstürze | erfüllt, erzwungen |
| Immer akzeptieren | mindestens 40 % scheitern | 5 % scheitern; 52 % scheitern oder enden mit einer kritischen Anzeige | **offen** |
| Immer vermeiden | Zeit unter 20 in mindestens 50 % | 97 % | erfüllt, erzwungen |
| Immer vermindern | Budget unter 30 in mindestens 50 % | 88 % | erfüllt, erzwungen |
| Immer übertragen | Budget unter 30 in mindestens 50 % | 54 % | erfüllt, erzwungen |
| Zufällige Entscheide, zufällige Strategien | 60 bis 90 % scheitern | 94 % | **offen** |

«Erzwungen» heisst: Wird die Bedingung verletzt, bricht `npm run check` ab. Die drei offenen Bedingungen werden gemessen und mit «OFFEN» ausgegeben, brechen aber nicht ab, bis entschieden ist, was für sie gilt.

Warum die drei nicht zusammen mit den anderen zu erfüllen sind:

- Gute Entscheide kosten in Level 3 bis 5 je 6 Punkte Budget oder 6 Punkte Zeit. Nach acht Entscheiden stehen Budget und Zeit zusammen bei 104, einzeln zwischen 40 und 64; die Stabilität steht immer bei 100. In der ungünstigsten Ziehung bleiben also 10 Punkte Abstand zu 30. Das reicht für eine einzige kleine Massnahme. Eine Mindestanzeige von 30 lässt sich nur halten, wenn empfohlene Strategien fast nichts kosten oder ihre Kosten auf der Stabilität liegen. Dann ist das Budget gerade keine Entscheidungsgrösse.
- Wer gut entscheidet und alles akzeptiert, hat genug Punkte für die Bauabnahme (16 von 19, nötig 13). Scheitern kann er nur durch Einsturz. Dafür müssten zwei bis drei Ereignisse dieselbe Anzeige um zusammen 50 bis 60 Punkte senken, und zwar in 40 % der Durchgänge. Solche Ereignisse dürften mit der empfohlenen Strategie aber fast nichts kosten (erster Punkt). Empfohlen wäre dann immer «Vermeiden», und die Regel «jede Strategie mindestens einmal empfohlen» fiele.
- Zufällig gewählte Strategien treffen die empfohlene in rund 28 % der Fälle, zufällig gewählte Optionen holen die Hälfte der Punkte. Die Ereignisse heben die Schwelle (13 von 19) also stärker, als sie zufälligen Spielern Punkte bringen.

Vorschlag, zu entscheiden von Fynn (ändert Werte in `src/core/balance.ts`):

1. Mindestanzeige bei empfohlenen Strategien: 10 statt 30 (gemessen 14).
2. «Immer akzeptieren»: mindestens 40 % der Durchgänge scheitern **oder enden mit einer Anzeige im kritischen Bereich** (gemessen 52 %). Wer nichts tut, bekommt dann meist ein schiefes Gebäude mit Warnschild statt eines Einsturzes.
3. Zufälliges Spielen in Leveln mit Ereignissen: 60 bis 95 % statt 60 bis 90 %.

