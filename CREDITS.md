# Credits

Risk Tower verwendet nur eigene Inhalte und Open-Source-Bibliotheken (S-10).

## Assets

- **3D-Modelle:** Alle Gebäude, Fahrzeuge und Bäume werden im Code aus einfachen Klötzen erzeugt. Es gibt keine Modell- oder Texturdateien.
- **Schrift:** Systemschrift des Geräts. Es werden keine Schriften geladen.
- **Ton:** Alle Geräusche und die Stadt-Atmosphäre werden im Browser erzeugt (`src/audio/sound.ts`). Es gibt keine Audiodateien.
- **Fälle und Theorie:** Entwürfe von Claude als Platzhalter, in den Dateien mit `autor: "CL"` und `status: "entwurf"` markiert. Die Gruppe prüft, ersetzt und ergänzt sie.

## Bibliotheken zur Laufzeit

| Bibliothek                   | Zweck                                                  | Lizenz |
| ---------------------------- | ------------------------------------------------------ | ------ |
| [three](https://threejs.org) | 3D-Darstellung                                         | MIT    |
| [zod](https://zod.dev)       | Prüfung von Inhalten, Speicherstand und URL-Parametern | MIT    |

Alle weiteren Abhängigkeiten in `package.json` sind Entwicklungswerkzeuge und werden nicht ausgeliefert.
