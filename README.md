# Risk Tower

Browser-Game und E-Learning zum Thema «Risikomanagement mit AI» (HWZ, Modul Project Management). Du baust fünf Gebäude. Jedes ist ein Projekt, und deine Entscheide verändern Budget, Zeit und Stabilität. Fällt eine Anzeige auf null, stürzt das Gebäude ein.

## Starten

Voraussetzung: Node.js 24 (siehe `.nvmrc`).

```bash
npm install
npm run dev
```

Danach die angezeigte Adresse im Browser öffnen. Lokal sind auch Fälle im Status `entwurf` sichtbar.

Nützliche Adressen:

- `/?renderer=none` startet den Einfach-Modus ohne 3D.
- `/?seed=123` legt die Ziehung des ersten Durchgangs fest (zum Nachstellen eines Fehlers).

## Befehle

| Befehl                     | Zweck                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev`              | Lokaler Entwicklungsserver                                                                        |
| `npm run build`            | Produktions-Build nach `dist/`                                                                    |
| `npm run check`            | Typprüfung, Lint, Unit-Tests, Inhaltsprüfung, Balance, Build                                      |
| `npm run test:e2e`         | End-to-End-Tests in Handy- und Laptop-Grösse (einmalig vorher: `npx playwright install chromium`) |
| `npm run validate:content` | Inhaltsdateien prüfen                                                                             |
| `npm run simulate:balance` | Balance pro Level simulieren                                                                      |
| `npm run format`           | Code formatieren                                                                                  |

## Fälle schreiben

Die Inhalte liegen in `content/levels/level-1.json` bis `level-5.json`. Wie ein Fall aussieht und wie man ihn mit einem LLM ins richtige Format bringt, steht in [docs/IMPORT.md](docs/IMPORT.md). Nach jeder Änderung `npm run validate:content` und `npm run simulate:balance` ausführen.

Alle Fälle in dieser Version sind Entwürfe von Claude (`autor: "CL"`, `status: "entwurf"`). Sie sind fachlich nicht geprüft und dazu da, ersetzt oder überarbeitet zu werden.

## Veröffentlichen

Der Workflow `.github/workflows/ci.yml` prüft jeden Push und Pull Request. Die Veröffentlichung auf GitHub Pages ist vorbereitet, aber ausgeschaltet. Zum Einschalten:

1. Repository öffentlich stellen (GitHub Pages ist im Gratis-Plan nur für öffentliche Repositories verfügbar).
2. Unter Settings → Pages als Quelle «GitHub Actions» wählen.
3. Unter Settings → Secrets and variables → Actions → Variables die Variable `PAGES_ENABLED` mit dem Wert `true` anlegen.
4. Solange die Fälle noch Entwürfe sind: zusätzlich die Variable `SHOW_DRAFTS` mit dem Wert `1` anlegen. Ohne sie zeigt die veröffentlichte Seite nur freigegebene Fälle (F-906).

## Dokumente

- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md): Anforderungen und Stand der Umsetzung
- [docs/IMPORT.md](docs/IMPORT.md): Format der Inhaltsdateien
- [docs/CHECKLIST.md](docs/CHECKLIST.md): Manuelle Prüfung vor einer Veröffentlichung
- [CLAUDE.md](CLAUDE.md): Arbeitsregeln für den Coding-Agenten
- [CREDITS.md](CREDITS.md): Herkunft von Assets und Bibliotheken
