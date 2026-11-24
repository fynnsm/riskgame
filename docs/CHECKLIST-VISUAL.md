# Sicht- und Hörprüfung auf echten Geräten (G-81)

Diese Punkte lassen sich nicht automatisch prüfen. Die Tests zeigen, dass nichts abstürzt und dass die richtigen Bildschirme erscheinen. Ob etwas gut aussieht, sich richtig anfühlt, flüssig läuft und gut klingt, sieht und hört nur ein Mensch. **Claude hat keinen dieser Punkte selbst geprüft:** Die Grafik wurde nur auf einzelnen Standbildern aus einem Browser ohne Bildschirm angeschaut, Bewegung und Ton gar nicht.

Vor jeder Veröffentlichung auf allen drei Geräten durchgehen. Hilfsmittel: `?debug=1` zeigt Bildrate, Zeichenaufrufe und Qualitätsstufe; `?quality=0`, `1` oder `2` legt die Qualitätsstufe fest.

## Geräte

- [ ] iPhone mit Safari
- [ ] Android-Handy mit Chrome
- [ ] Laptop (Chrome, dazu Firefox oder Safari)

## Bildrate

Mit `?debug=1` ablesen, je auf der Stufe, die das Gerät von selbst wählt.

- [ ] Startseite: mindestens 30 Bilder pro Sekunde
- [ ] Level mit acht Stockwerken: mindestens 30
- [ ] Level 5 (Nacht): mindestens 30
- [ ] Schlussbildschirm mit Feuerwerk: mindestens 30
- [ ] Das Handy wird nach zehn Minuten nicht auffällig warm
- [ ] Tippen und Tasten reagieren sofort, auch während die Stadt sich bewegt

Liegt ein Wert darunter: Wert, Gerät und Qualitätsstufe notieren. Der Fehlerbericht im Menü enthält Durchschnitt und Minimum der letzten 30 Sekunden.

## Licht und Tageszeiten

- [ ] Level 1 wirkt wie Morgen, 2 wie Mittag, 3 wie Nachmittag, 4 wie Abend, 5 wie Nacht
- [ ] In der Nacht sind Gebäude, Arbeiter und Warnschilder noch gut erkennbar
- [ ] Fenster und Strassenlampen leuchten nachts sichtbar
- [ ] Die Texttafel ist bei jeder Tageszeit gut lesbar
- [ ] Der Stadtrand verschwindet im Dunst und bricht nicht hart ab

## Leben in der Stadt

- [ ] Wolken ziehen langsam und verdecken das Gebäude nie
- [ ] Ein Flugzeug quert ab und zu; während eines Levels fliegt es am Gebäude vorbei, nicht darüber
- [ ] Autos, Lieferwagen, Bus und Tram fahren nicht ineinander und halten vor Kreuzungen
- [ ] Fussgänger, Ballon und Vögel sind zu sehen (nur Qualitätsstufe 2)
- [ ] Nichts davon lenkt beim Lesen einer Situation ab

## Gebäude und Baustelle

- [ ] Die fünf Gebäude sind in der Stadt auf einen Blick zu unterscheiden
- [ ] Ein neues Stockwerk senkt sich ab, federt kurz, Staub steigt auf; das dauert nicht zu lang
- [ ] Nach einem guten Entscheid blitzt ein grüner Rahmen, nach einem riskanten fällt ein Brocken
- [ ] Die Neigung ändert sich weich, nicht ruckartig
- [ ] Warnschilder erscheinen nur, wenn eine Anzeige «kritisch» zeigt, und ihr Symbol passt zur Anzeige

## Bildschirme nach einem Level

- [ ] Bestanden: Dach, Kameraschwenk, Banner, Sterne einzeln; es fühlt sich belohnend an
- [ ] 3 Sterne: Feuerwerk ist gut zu sehen; 2 Sterne: Konfetti; 1 Stern: nur das Banner
- [ ] Nicht bestanden: Der Prüfer geht um das Gebäude, Absperrband, Stempel
- [ ] Einsturz: Die Stockwerke fallen nacheinander, Staub, die Kamera wackelt kurz
- [ ] Jede Sequenz lässt sich mit Tippen, Enter und Escape überspringen
- [ ] Keine Sequenz dauert länger als vier Sekunden

## Schlussbildschirm und Startseite

- [ ] Die Kamera fliegt an allen fünf Gebäuden vorbei
- [ ] Das Flugzeug zieht ein Banner mit einem Klotz pro Stern
- [ ] Der Abend wird zur Nacht, das Feuerwerk ist gut zu sehen
- [ ] «Stadt ansehen»: Ziehen mit Finger und Maus dreht die Stadt, «Zurück» bringt die Auswertung
- [ ] «Bild speichern» legt ein PNG ab, und das Bild zeigt die Stadt (nicht schwarz, nicht leer)
- [ ] Startseite: Die Kamera gleitet langsam; der Hauptknopf heisst passend «Spielen», «Weiterspielen» oder «Schlussbild ansehen»

## Oberfläche

- [ ] Handy: Alle drei Anzeigen samt Symbol, Menü- und Ton-Knopf sind ganz sichtbar
- [ ] Die Zahl einer Anzeige zählt nach einem Entscheid sichtbar; die Differenz schwebt kurz daneben
- [ ] Handy: «Text einklappen» gibt den Blick auf das Gebäude frei; beim Setzen eines Stockwerks klappt die Tafel kurz von selbst ein, und das stört nicht
- [ ] Laptop: «Text einklappen» schiebt die Spalte aus dem Bild und holt sie wieder
- [ ] Schrift im Browser auf 200 % vergrössert: nichts ist abgeschnitten

## Ton

Lautsprecher an, Stumm-Schalter auf «Ton an».

- [ ] Vor dem ersten Tippen ist nichts zu hören
- [ ] Wahl, Aufsetzen des Stockwerks, Warnung, Einsturz, bestanden, Sterne, Feuerwerk, Stempel und Flugzeug sind zu hören und passen zum Bild
- [ ] Nichts ist unangenehm laut oder schrill; die Stadt-Atmosphäre ist kaum zu hören
- [ ] «Ton aus» schaltet sofort alles stumm, auch die Atmosphäre, und bleibt nach dem Neuladen aus
- [ ] iPhone: Der Ton funktioniert auch mit dem Stummschalter am Gerät so, wie man es erwartet
- [ ] Mit Ton aus fehlt keine Information

## Bewegung reduzieren

In den Systemeinstellungen «Bewegung reduzieren» einschalten.

- [ ] Kein Kameraflug, kein Schwenk, kein Wackeln, kein Blitzen
- [ ] Nach dem letzten Entscheid erscheint die Auswertung sofort
- [ ] Wolken und Verkehr stehen still
- [ ] Alles bleibt bedienbar und verständlich

## Ohne 3D

Mit `?renderer=none` öffnen.

- [ ] Ein ganzes Level, «bestanden», «nicht bestanden», Einsturz und der Schlussbildschirm sind als Text vorhanden
