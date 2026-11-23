# BRAINSTORMING.md – Offene Punkte für Risk Tower

Stand 23.11.2026. Nichts in dieser Datei ist entschieden. Sobald ein Punkt geklärt ist, wandert der Entscheid nach `REQUIREMENTS.md` und wird hier gestrichen.

Die ersten beiden Punkte hast du ausdrücklich zurückgestellt. Die übrigen sind mir beim Schreiben der Requirements aufgefallen.

## O-1 Füllt das Spiel wirklich 60 Minuten?

Meine Schätzung pro Level, ohne Wiederholungen:

| Teil | Dauer |
|---|---|
| Briefing | ca. 1 min |
| Theorie, 5 Karten | ca. 4 min |
| 6 Situationen mit Lesen, Entscheiden, Erklärung | ca. 7–8 min |
| Auswertung | ca. 2 min |
| **Summe** | **ca. 14–15 min** |

Das ergäbe bei fünf Leveln rund 70 Minuten. Die Zahl ist aber unsicher: Wer schnell liest und Erklärungen wegklickt, ist eher in 35 bis 40 Minuten durch, und Einstürze verlängern es wieder. Ohne Testrunde weiss das niemand.

Zu klären:

- Was verlangt der Dozent genau: 60 Minuten Material oder 60 Minuten typische Bearbeitungszeit?
- Wie messen wir es? Vorschlag: Die App misst die aktive Spielzeit (F-108), und drei bis vier Leute aus der Gruppe spielen einen Level zur Probe, sobald Meilenstein 2 steht.

Stellschrauben, falls es zu kurz ist: mehr Situationen pro Durchgang, mehr Theorie-Karten, eine kurze Reflexionsfrage am Ende jedes Levels, ein Abschlussquiz.
Falls es zu lang ist: weniger Situationen pro Durchgang, kürzere Karten.

## O-2 Wie kommt das Feedback der Mitstudierenden zu euch?

Der Auftrag verlangt eine «Evaluation des Projektmanagements und Learnings aus den Feedbacks der Mitstudierenden». Ohne Backend sieht die Gruppe aus dem Spiel selbst nichts. Den Link auf ein Formular hast du vorerst abgelehnt.

| Variante | Vorteil | Nachteil |
|---|---|---|
| Link am Schluss auf ein externes Formular | In einer Stunde gebaut, gratis | Medienbruch; du wolltest es so nicht |
| Feedback-Fragen im Spiel, am Schluss als Text zum Kopieren und Senden | Kein Backend, bleibt im Spiel | Mühsam für die Spielenden, wenig Rücklauf |
| Ergebnis-Code am Schluss, den man im Teams-Kanal postet | Sehr einfach, zeigt auch Resultate | Keine Freitext-Rückmeldung, nicht anonym |
| Kleines Backend mit Gratis-Stufe | Zentrale Resultate und Feedback | Deutlich mehr Aufwand, Datenschutz, neue Sicherheitsfragen, Kostenfreiheit über 60 Tage prüfen |
| Feedback ausserhalb des Spiels, im Unterricht oder per Teams-Umfrage | Kein Aufwand im Spiel | Nicht an den Spielmoment gekoppelt |

Zu klären: Reicht dem Dozenten qualitatives Feedback, oder erwartet er Zahlen? Braucht ihr Resultate pro Person oder nur Rückmeldungen zum E-Learning?

## O-3 Sind die Gebäude Bauprojekte oder ein Bild für beliebige Projekte?

Im Gespräch hiess es, jedes Gebäude sei «ein eigenes kleines Bauprojekt mit eigenem Fall». Dein Mockup zeigt eine Baustelle mit Lieferverzug. Die Klasse studiert aber Digital Business & AI, und AI-Fälle sind in IT- und Organisationsprojekten naheliegender als auf dem Bau.

- **Variante A:** Die Rahmenfälle sind Bauprojekte. Passt perfekt zum Bild, ist aber fachlich weiter weg von der Zielgruppe.
- **Variante B:** Das Gebäude steht als Bild für irgendein Projekt (ERP-Einführung, Cloud-Migration, Event). Näher an der Zielgruppe; das Bild trägt trotzdem.

Das Schema in `IMPORT.md` lässt beides zu. Das Beispiel dort nutzt Variante B.

## O-4 Balance

Die Startwerte (Anzeigen bei 70; klein 6, mittel 12, gross 20) sind geraten. Zu klären, sobald die Logik steht:

- Wie viele riskante Entscheide soll ein Level verzeihen? Mein Vorschlag: zwei gehen, beim dritten wird es kritisch.
- Soll man Anzeigen über den Startwert hinaus auffüllen können?
- Werden die Level schwieriger, oder bleiben sie gleich?
- Beginnt jedes Gebäude mit frischen Anzeigen, oder nimmt man den Stand mit? Frisch ist fairer und einfacher zu balancieren.

## O-5 Name

«Risk Tower» ist ein Arbeitstitel. Der Auftrag verlangt einen Projektnamen. Seit es fünf Gebäude sind, würde auch etwas mit «City» passen. Vor der Wahl kurz prüfen, ob es unter dem Namen schon ein bekanntes Spiel gibt.

## O-6 Wer schreibt, wer prüft?

40 Fälle, 15 Lernziele und rund 25 Theorie-Karten sind viel Text, und er muss fachlich stimmen, weil er benotet wird.

- Wer übernimmt welches Level? Naheliegend: fünf Personen, fünf Level, eine Person koordiniert und baut.
- Wer gibt frei? Vorschlag: nie die Autorin oder der Autor selbst.
- Worauf stützt ihr die Inhalte? Das Kursbuch und der PMBOK sind die Referenz des Dozenten; für den AI-Teil braucht ihr zusätzliche Quellen.
- Ein LLM formatiert nur. Lässt die Gruppe die Fälle auch von einem LLM erfinden, werden sie generisch, und das fällt beim Thema «Risikomanagement mit AI» besonders auf.

## O-7 Arbeitsteilung und das Risiko im eigenen Projekt

Das ist mein kritischster Punkt. Die Note bewertet Projektführung und Projektausführung der ganzen Gruppe. Im Moment liegt die Technik bei dir allein.

- Was passiert, wenn du zwei Wochen ausfällst? Mindestens eine zweite Person sollte das Projekt lokal starten und veröffentlichen können.
- Echtes 3D mit bewegter Kulisse ist der teuerste Teil und für die Lernziele der unwichtigste. Die Reihenfolge der Meilensteine stellt deshalb sicher, dass ab Meilenstein 2 ein abgabefähiges E-Learning ohne 3D existiert. Bitte nicht umdrehen.
- Gibt es einen Termin, ab dem nur noch Inhalte und Fehler bearbeitet werden und keine neuen Features mehr kommen?
- Passend zum Thema: Führt ihr für dieses Projekt selbst ein Risikoregister? Das wäre ein starkes Element für die Evaluation.

## O-8 Wie wird der Lernerfolg gemessen?

Der Auftrag fragt nach messbaren Lernzielen. Sterne aus den Entscheiden (F-603) messen, ob jemand im Spiel gut entschieden hat. Ob jemand das Wissen danach hat, messen sie nur bedingt, vor allem nach mehreren Versuchen.

Ideen: ein kurzes Quiz vor und nach dem Spiel zum Vergleich; pro Lernziel eine Kontrollfrage in der Auswertung; nur der erste Versuch jeder Situation zählt für die Lernziele.

## O-9 Kleinere Punkte

- **Ton:** standardmässig an oder aus? Im Unterricht spricht einiges für aus.
- **Einstufung zeigen:** direkt nach jeder Wahl oder erst in der Level-Auswertung?
- **Theorie überspringen:** beim ersten Mal erlauben oder nicht?
- **Video-Hosts:** Welche kämen in Frage, falls später Videos dazukommen?
- **Eigene Domain:** nicht nötig; die Adresse von GitHub Pages reicht, ist aber lang. Ein QR-Code für den Unterricht hilft.

## O-10 Was noch fehlt

- Bewertungsraster des Dozenten
- Abgabetermine (Projektinitialisierungsauftrag, Projektauftrag mit Plan, Drehbuch-Entwurf, E-Learning mit Teaser, Lessons Learned)
- Vorlagen aus Teams (CO-STAR, Projektskizze)
- Bestätigung des Dozenten, dass ein selbst entwickeltes Spiel als E-Learning gilt und was «60 Minuten» genau heisst

Sobald das Raster da ist, sollten wir die Requirements dagegen prüfen.

## O-11 Ideen für später

- Verzögerte Folgen: Ein ignoriertes Risiko tritt zwei Situationen später ein.
- Ereigniskarten, die unabhängig von der Wahl eintreten und zeigen, ob vorgesorgt wurde.
- Ein sichtbares Risikoregister im Spiel, das sich mit den Entscheiden füllt.
- Stadt als Bild zum Teilen am Schluss.
- Aufnahmen aus dem Spiel als Material für das Teaser-Video.
- Backend für zentrale Resultate (hängt an O-2).
