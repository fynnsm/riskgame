# Leistung

Messwerte der 3D-Darstellung und die Grenzen, die für das Grafik-Update gelten (Auftrag Update 2, B0).

## Ist-Zustand vor dem Grafik-Update

Gemessen am 24.11.2026 auf dem Stand von Pull Request 12, mit `?debug=1&quality=1` (Qualitätsstufe 1, ohne Schatten), in einem Headless-Chromium mit Software-Rendering. Zeichenaufrufe und Dreiecke stammen aus `renderer.info` und sind in beiden Fenstergrössen (390×844 und 1366×768) gleich.

| Szene | Zeichenaufrufe | Dreiecke |
|---|---|---|
| Startseite (Stadt, fünf leere Bauplätze) | 7 | 140’856 |
| Level mit acht Stockwerken | 8 | 143’160 |
| Schlussansicht (fünf fertige Gebäude) | 12 | 151’416 |

Übertragung beim ersten Laden (gzip): 213.9 kB, davon HTML 0.5 kB, CSS 3.0 kB, Spiel 71.2 kB und 3D-Darstellung 139.2 kB. Im Einfach-Modus `?renderer=none` wird die 3D-Darstellung nicht geladen.

**Bildrate: nicht gemessen.** Ein Headless-Browser rendert in Software und sagt nichts über ein Handy aus (dort gemessen: rund 14 Bilder pro Sekunde bei 1280×760, was auf echter Hardware nicht zutrifft). Die Bildrate muss auf echten Geräten gemessen werden: Das Debug-Overlay (`?debug=1`) zeigt sie an, und der Fehlerbericht enthält Durchschnitt und Minimum der letzten 30 Sekunden. Siehe `docs/CHECKLIST.md`.

Auf Qualitätsstufe 2 kommen die Schatten dazu; jedes Objekt wird dann ein zweites Mal gezeichnet, die Zeichenaufrufe verdoppeln sich also ungefähr.

## Grenzen für das Grafik-Update

| Grösse | Grenze | Wo geprüft |
|---|---|---|
| Zeichenaufrufe auf Qualitätsstufe 1 | höchstens das 1.5-Fache des Ist-Zustands: Startseite 10, Level 12, Schlussansicht 18 | `tests/e2e/performance.spec.ts`, bei jedem Lauf |
| Zusätzliche Übertragung | höchstens 80 kB komprimiert, also insgesamt höchstens 293.9 kB | von Hand nach `npm run build`, Werte hier nachführen |
| Bildrate auf einem Mittelklasse-Handy, Qualitätsstufe 1 | mindestens 30 | nur auf echten Geräten |
| Gleiche Objekte | als `InstancedMesh` | Code-Review; die Zeichenaufrufe zeigen Verstösse sofort |

Reicht die Leistung nicht, wird in dieser Reihenfolge gestrichen: Schatten, Menge der Dekoration, Partikel. Nie die Lesbarkeit von Gebäude und Anzeigen.

Die Nacht (Level 5) braucht einen Zeichenaufruf mehr als der Tag, weil Lampen und leuchtende Fenster unbeleuchtet gezeichnet werden. Die Dreiecke sind mit den Strassenlampen und Schattenflächen auf rund 175’000 bis 186’000 gestiegen.

Alles Bewegte der Dekoration (Fahrzeuge, Wolken, Flugzeug, Ballon, Vögel, Fussgänger, Rauch, wiegende Baumkronen) liegt in einem einzigen Zeichenaufruf, der den früheren Aufruf für die Autos ersetzt. Dazu kommt auf Stufe 0 und 1 ein Aufruf für die weichen Schattenflecken unter Wolken und Flugzeug, nachts einer für die Scheinwerfer. Ein Level bei Nacht braucht damit 12 Zeichenaufrufe und liegt genau auf der Grenze: Die folgenden Schritte dürfen dort keinen weiteren hinzufügen.

## Messen

```bash
npx playwright test performance
```

gibt pro Szene eine Zeile `MEASURE …` mit Zeichenaufrufen und Dreiecken aus. Von Hand: Seite mit `?debug=1&quality=1` öffnen und das Overlay ablesen. `quality=0`, `1` oder `2` legt die Qualitätsstufe fest und schaltet das automatische Herunterstufen aus.

## Verlauf

| Datum | Stand | Startseite | Level | Schlussansicht | Übertragung |
|---|---|---|---|---|---|
| 24.11.2026 | vor dem Grafik-Update (Pull Request 12) | 7 | 8 | 12 | 213.9 kB |
| 24.11.2026 | Himmel, Licht, Tageszeiten (B2): Strassenlampen, Nachtlichter, Schattenflächen | 8 | 9 | 13 | 215.0 kB |
| 24.11.2026 | Leben in Himmel und Stadt (B3): Wolken, Flugzeug, Ballon, Vögel, Verkehr, Fussgänger, Rauch | 9 | 10 | 14 | 218.6 kB |
| 24.11.2026 | Gebäudetypen und Baustelle (B4) | 9 | 10 | 14 | 220.2 kB |
| 24.11.2026 | Bildschirme nach einem Level (B5): Feuerwerk, Konfetti, Prüfer, Absperrband | 9 | 10 | 14 | 222.6 kB |
| 24.11.2026 | Schlussbildschirm, Startseite, Kameraflug (B5) | 9 | 10 | 14 | 224.8 kB |
| 24.11.2026 | Oberfläche und Ton (B6, B7) | 9 | 10 | 14 | 227.7 kB |
