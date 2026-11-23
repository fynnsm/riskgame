# Credits

Risk Tower verwendet nur eigene Inhalte und Open-Source-Bibliotheken (S-10).

## Assets

- **3D-Modelle:** Alle Gebäude, Fahrzeuge und Bäume werden im Code aus einfachen Klötzen erzeugt. Es gibt keine Modell- oder Texturdateien.
- **Schrift:** Systemschrift des Geräts. Es werden keine Schriften geladen.
- **Ton:** Noch nicht umgesetzt (Meilenstein M5). Geplant sind im Browser erzeugte Geräusche (F-805).
- **Fälle und Theorie:** Entwürfe von Claude als Platzhalter, in den Dateien mit `autor: "CL"` und `status: "entwurf"` markiert. Die Gruppe prüft, ersetzt und ergänzt sie.

## Bibliotheken zur Laufzeit

| Bibliothek                   | Zweck                                                  | Lizenz |
| ---------------------------- | ------------------------------------------------------ | ------ |
| [three](https://threejs.org) | 3D-Darstellung                                         | MIT    |
| [zod](https://zod.dev)       | Prüfung von Inhalten, Speicherstand und URL-Parametern | MIT    |

Alle weiteren Abhängigkeiten in `package.json` sind Entwicklungswerkzeuge und werden nicht ausgeliefert.
