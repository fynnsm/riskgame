# IMPORT.md – Fälle für Risk Tower ins richtige Format bringen

Diese Datei ist für zwei Leser geschrieben: für dich als Autorin oder Autor und für das LLM, dem du sie gibst.

## So gehst du vor

1. Schreibe deine Fälle in normalem Text. Was ein Fall braucht, steht unter «Was ein guter Fall enthält».
2. Kopiere **diese ganze Datei** und darunter deine Fälle in ein LLM deiner Wahl.
3. Das LLM gibt dir JSON zurück. Lies es durch: Stimmt der Inhalt noch mit dem überein, was du gemeint hast?
4. Füge die Situationen in die passende Datei `content/levels/level-N.json` ein, in die Liste `situationen`.
5. Führe `npm run validate:content` aus. Fehler stehen mit Datei, Feld und Grund da.
6. Erstelle einen Pull Request. Eine zweite Person aus der Gruppe prüft den Fall fachlich und setzt `status` auf `freigegeben`.

**Vor dem Kopieren in ein LLM und vor dem Einchecken:** Das Repository ist öffentlich. Schreibe keine echten Namen von Firmen, Kunden oder Personen und nichts Vertrauliches aus deinem Betrieb in einen Fall. Ändere Branche, Zahlen und Namen so, dass niemand den echten Fall erkennt.

## Was ein guter Fall enthält

- **Eine konkrete Situation** aus einem Projekt, in der AI im Risikomanagement eine Rolle spielt, passend zum Thema des Levels.
- **Drei Optionen**, die alle vernünftig klingen. Keine Option ist offensichtlich dumm.
- **Jede Option kostet etwas.** Riskante Optionen wirken im Moment oft billig und schnell, kosten aber Stabilität. Gute Optionen kosten meist etwas Zeit oder Budget und bringen Stabilität.
- **Eine Erklärung pro Option:** Warum ist das gut, vertretbar oder riskant? Das ist der Teil, aus dem man lernt.
- **Optional eine AI-Ausgabe:** der Prompt und die Antwort, über die entschieden wird.

Die fünf Level:

| Level | Thema | `prozessschritt` |
|---|---|---|
| 1 | Risiken mit AI identifizieren | `identifizieren` |
| 2 | Risiken bewerten und priorisieren | `bewerten` |
| 3 | Massnahmen planen | `massnahmen` |
| 4 | Risiken überwachen | `ueberwachen` |
| 5 | Grenzen der AI: Halluzinationen, Datenschutz, Verantwortung | `grenzen` |

Die drei Anzeigen:

| Anzeige | Bedeutung |
|---|---|
| `budget` | Geld, das dem Projekt bleibt |
| `zeit` | Zeitpuffer bis zum Termin |
| `stabilitaet` | Wie gut das Projekt gegen Risiken abgesichert ist. Unbehandelte, übersehene oder falsch eingeschätzte Risiken senken sie |

---

## Anweisungen an das LLM

Du wandelst Fallbeschreibungen für das Lernspiel «Risk Tower» in JSON um. Halte dich genau an die folgenden Regeln.

### Ausgabe

- Gib **nur JSON** in einem einzigen Codeblock aus, ohne Text davor oder danach.
- Bekommst du einzelne Fälle, gib ein JSON-Array von Situationen aus (Format «Situation»). Bekommst du ausdrücklich den Auftrag für ein ganzes Level, gib ein Level-Objekt aus (Format «Level-Datei»).
- Verwende exakt die Feldnamen unten. Erfinde keine zusätzlichen Felder und lasse keine Pflichtfelder weg.
- Setze `status` immer auf `"entwurf"`.

### Inhalt

- **Erfinde keine Fachinhalte.** Formuliere um, kürze, strukturiere, aber ändere die Aussage nicht.
- Fehlt etwas, das du nicht aus dem Text ableiten kannst (z. B. die dritte Option, eine Erklärung oder das Level), gib statt JSON eine kurze Liste mit Rückfragen aus.
- Deutsch in Schweizer Schreibweise: **kein ß**, immer «ss». Du-Form. Währung CHF.
- Keine echten Namen von Firmen, Produkten des Arbeitgebers oder Personen. Findest du welche im Text, ersetze sie durch neutrale Bezeichnungen («ein Spital», «der Lieferant»).
- Nur reiner Text. Kein HTML, kein Markdown, keine Emojis, keine Zeilenumbrüche innerhalb eines Feldes.

### Wirkungen

Jede Option hat für jede der drei Anzeigen eine Wirkung. Erlaubte Werte:

`"-gross"`, `"-mittel"`, `"-klein"`, `"0"`, `"+klein"`, `"+mittel"`, `"+gross"`

Gib nie Zahlen an. Die App rechnet die Stufen selbst um.

Leite die Wirkungen aus dem Text ab:

- Kostet Geld: `budget` negativ. Spart Geld: `budget` positiv.
- Braucht Zeit oder verzögert: `zeit` negativ. Spart Zeit: `zeit` positiv.
- Senkt oder kontrolliert Risiken: `stabilitaet` positiv. Lässt Risiken unbehandelt, übernimmt AI-Ergebnisse ungeprüft oder schafft neue Risiken: `stabilitaet` negativ.
- Im Zweifel die kleinere Stufe wählen. `gross` nur für klar einschneidende Folgen.
- `budget` steht für Geld und für Arbeitsstunden anderer (Workshop, Beratung, Team). `zeit` steht für den Terminplan: Du machst etwas allein oder nacheinander, oder es wird gewartet.
- Eine gute Option kostet **entweder** `-klein` Budget **oder** `-klein` Zeit, nicht beides und nicht mehr. Sonst steht am Schluss auch bei lauter guten Entscheiden ein schiefes Gebäude.
- Eine riskante Option wirkt fast immer `-gross` auf `stabilitaet`, höchstens in einem Drittel der Fälle `-mittel`.
- Eine vertretbare Option kostet spürbar Zeit oder Budget (oft `-mittel`), aber nie so viel, dass acht davon ein Gebäude zum Einsturz bringen.

### Regeln, die geprüft werden

1. Genau **drei** Optionen mit den IDs `"A"`, `"B"`, `"C"`.
2. **Jede** Option hat mindestens eine negative Wirkung.
3. Pro Situation mindestens eine Option mit `einstufung: "gut"` und mindestens eine mit `"riskant"`.
4. Die Wirkungen einer guten Option sind in der Summe besser als die jeder riskanten Option derselben Situation.
5. Die Position sagt nichts über die Qualität: Verteile die gute Option zufällig auf A, B oder C. Die App mischt zusätzlich.
6. `lernziel` muss eine ID aus den `lernziele` des Levels sein. Kennst du sie nicht, frag nach.
7. IDs sind eindeutig und folgen dem Muster unten.
8. Pro Level haben mindestens 40 % aller Optionen eine Budgetwirkung ungleich `"0"`.
9. Pro Level entfallen höchstens 60 % der Kosten der guten Optionen auf dieselbe Anzeige. Verteile sie also etwa hälftig auf Budget und Zeit.
10. `npm run simulate:balance` muss bestehen: lauter gute Entscheide enden in jeder Anzeige bei mindestens 40, lauter vertretbare führen nie zum Einsturz, lauter riskante spätestens beim fünften Entscheid.
11. Maximale Längen (Zeichen inklusive Leerzeichen):

| Feld | Maximum |
|---|---|
| `titel` (Situation, Karte) | 60 |
| `situation` | 450 |
| `aiAusgabe.prompt` | 200 |
| `aiAusgabe.antwort` | 600 |
| Option `text` | 100 |
| Option `erklaerung` | 400 |
| Karte `text` | 600 |
| Lernziel `text` | 160 |

Ist ein Text zu lang, kürze ihn, ohne die Aussage zu ändern.

Zusätzlich gibt die Prüfung Hinweise aus, ohne abzulehnen: wenn die gute Option der längste der drei Texte ist und wenn der längste Optionstext mehr als 30 % länger ist als der kürzeste. Schreibe die drei Optionen deshalb etwa gleich lang, sonst erkennt man die richtige Antwort an der Länge.

### Format «Situation»

| Feld | Pflicht | Inhalt |
|---|---|---|
| `id` | ja | `L<Level>-S<zweistellige Nummer>`, z. B. `L1-S03` |
| `lernziel` | ja | ID eines Lernziels des Levels, z. B. `L1-Z1` |
| `titel` | ja | Kurzer Titel |
| `situation` | ja | Die Ausgangslage, endet mit der Frage, was du tust |
| `aiAusgabe` | nein | Objekt mit `prompt` und `antwort`; nur wenn über eine konkrete AI-Antwort entschieden wird |
| `optionen` | ja | Genau drei Optionen |
| `quelle` | nein | Woher der Fachinhalt stammt (Buch, Kapitel, Skript) |
| `autor` | ja | Kürzel der Autorin oder des Autors, kein voller Name |
| `status` | ja | `"entwurf"` oder `"freigegeben"` |

Option:

| Feld | Pflicht | Inhalt |
|---|---|---|
| `id` | ja | `"A"`, `"B"` oder `"C"` |
| `text` | ja | Was du tust, als Handlung formuliert |
| `wirkung` | ja | Objekt mit `budget`, `zeit`, `stabilitaet` |
| `einstufung` | ja | `"gut"`, `"vertretbar"` oder `"riskant"` |
| `erklaerung` | ja | Warum diese Wahl so eingestuft ist und was daraus folgt |

### Format «Level-Datei»

| Feld | Pflicht | Inhalt |
|---|---|---|
| `schemaVersion` | ja | `2` |
| `id` | ja | `level-1` bis `level-5` |
| `nummer` | ja | 1 bis 5 |
| `titel` | ja | Titel des Levels |
| `prozessschritt` | ja | Wert aus der Tabelle der fünf Level |
| `projekt` | ja | Rahmenfall: `titel`, `beschreibung` (max. 400 Zeichen), `gebaeude` |
| `lernziele` | ja | 2 bis 4 Einträge mit `id` (`L<Level>-Z<Nummer>`) und `text` |
| `theorie` | ja | 3 bis 7 Schritte vom Typ `karte` oder `video` |
| `situationenProDurchgang` | ja | Standard `8` |
| `situationen` | ja | Mindestens `situationenProDurchgang + 2` Einträge |

Erlaubte Werte für `projekt.gebaeude`: `"wohnhaus"`, `"buero"`, `"schule"`, `"spital"`, `"turm"`.

Theorie-Schritt `karte`: `typ`, `id` (`L<Level>-T<Nummer>`), `titel`, `text`, optional `grafik`. Erlaubte Werte für `grafik`: `"risikomatrix"`, `"prozess"`, `"strategien"`, `"register"`.

Theorie-Schritt `video`: `typ`, `id`, `titel`, `url` (nur https), `dauerSekunden`, `transkript` (Kurzfassung des Inhalts als Text, max. 600 Zeichen).

### Beispiel

Gekürzt auf eine Karte und eine Situation. Eine echte Level-Datei braucht mindestens zehn Situationen.

```json
{
  "schemaVersion": 2,
  "id": "level-1",
  "nummer": 1,
  "titel": "Risiken mit AI identifizieren",
  "prozessschritt": "identifizieren",
  "projekt": {
    "titel": "Einführung eines neuen ERP-Systems",
    "beschreibung": "Ein Handelsbetrieb mit 120 Mitarbeitenden löst sein altes ERP ab. Du leitest das Projekt und stehst am Anfang der Planung.",
    "gebaeude": "buero"
  },
  "lernziele": [
    {
      "id": "L1-Z1",
      "text": "Du kannst AI-Vorschläge für Risiken als Ausgangspunkt nutzen und weisst, warum sie geprüft und ergänzt werden müssen."
    },
    {
      "id": "L1-Z2",
      "text": "Du kannst einen Prompt so formulieren, dass die AI projektspezifische statt allgemeine Risiken liefert."
    }
  ],
  "theorie": [
    {
      "typ": "karte",
      "id": "L1-T1",
      "titel": "Was ist ein Risiko?",
      "text": "Ein Risiko ist ein unsicheres Ereignis, das die Ziele deines Projekts beeinflusst, wenn es eintritt. Bevor du Risiken bewerten oder behandeln kannst, musst du sie kennen. Darum beginnt Risikomanagement mit dem Identifizieren und dem Festhalten im Risikoregister.",
      "grafik": "prozess"
    }
  ],
  "situationenProDurchgang": 8,
  "situationen": [
    {
      "id": "L1-S01",
      "lernziel": "L1-Z1",
      "titel": "Die schnelle Risikoliste",
      "situation": "Morgen ist der Kick-off. Du hast noch kein Risikoregister und bittest ein AI-Tool um Hilfe. In wenigen Sekunden liefert es eine Liste mit 15 Risiken. Sie klingt professionell, könnte aber zu fast jedem IT-Projekt passen. Was tust du?",
      "aiAusgabe": {
        "prompt": "Nenne mir die wichtigsten Risiken für ein ERP-Einführungsprojekt.",
        "antwort": "1. Unklare Anforderungen 2. Widerstand der Mitarbeitenden 3. Budgetüberschreitung 4. Probleme bei der Datenmigration 5. Abhängigkeit vom Lieferanten ... (15 Punkte)"
      },
      "optionen": [
        {
          "id": "A",
          "text": "Du übernimmst die Liste unverändert ins Risikoregister.",
          "wirkung": { "budget": "0", "zeit": "+klein", "stabilitaet": "-gross" },
          "einstufung": "riskant",
          "erklaerung": "Du sparst Zeit, aber die Liste kennt dein Projekt nicht. Spezifische Risiken wie eure Altdaten oder die Hochsaison im Lager fehlen, und niemand im Team steht hinter dem Register."
        },
        {
          "id": "B",
          "text": "Du nutzt die Liste als Start und prüfst sie in einem kurzen Workshop mit dem Team.",
          "wirkung": { "budget": "-klein", "zeit": "-klein", "stabilitaet": "+mittel" },
          "einstufung": "gut",
          "erklaerung": "Die AI liefert die Breite, das Team das Wissen über euer Projekt. Ihr streicht Unpassendes, ergänzt Spezifisches, und das Register wird von den Beteiligten getragen."
        },
        {
          "id": "C",
          "text": "Du verwirfst die Liste und sammelst die Risiken wie immer allein von Hand.",
          "wirkung": { "budget": "-klein", "zeit": "-mittel", "stabilitaet": "+klein" },
          "einstufung": "vertretbar",
          "erklaerung": "Dein Register passt zum Projekt, kostet aber viel Zeit, und allein übersiehst du leichter etwas. Die AI hätte dir als Checkliste gegen blinde Flecken geholfen."
        }
      ],
      "quelle": "Eigenes Beispiel der Gruppe",
      "autor": "FM",
      "status": "entwurf"
    }
  ]
}
```

## Rundgang und Ereignisse (ab Schema 2)

Zwei weitere Arten von Inhalt. Ein Level hat sie genau dann, wenn seine Datei den Block `rundgang` oder `ereignisse` enthält. Für beide gelten dieselben Grundregeln wie für Situationen: nur JSON ausgeben, keine Fachinhalte erfinden, Schweizer Schreibweise ohne ß, Du-Form, CHF, keine echten Namen, nur reiner Text, `status` immer `"entwurf"`. Schreibe keine Zahlen, Gesetze oder Studien hinein, die im Rohtext nicht stehen.

### Format «Rundgang»

Vor der ersten Situation geht die Spielerin oder der Spieler über die Baustelle. Eine AI-Drohne hat Stellen markiert. Manche Markierungen sind Fehlalarme, und manche echten Risiken hat die Drohne übersehen, weil nur der Betrieb sie kennt. Zu jeder Stelle wird entschieden: «Ins Risikoregister» oder «Kein Risiko».

| Feld | Pflicht | Inhalt |
|---|---|---|
| `einleitung` | ja | Kurzer Text vor dem Rundgang, max. 300 Zeichen |
| `stellenProDurchgang` | ja | Immer `8` |
| `stellen` | ja | Der Pool, mindestens 12 Stellen (siehe Regeln) |

Stelle:

| Feld | Pflicht | Inhalt |
|---|---|---|
| `id` | ja | `L<Level>-R<zweistellige Nummer>`, z. B. `L1-R03` |
| `ort` | ja | Einer von: `lager`, `kran`, `container`, `geruest`, `zufahrt`, `baubuero`, `team`, `material`, `nachbarn`, `technik` |
| `beobachtung` | ja | Was man an dieser Stelle sieht oder erfährt, max. 200 Zeichen. Sie verrät nicht, ob es ein Risiko ist |
| `istRisiko` | ja | `true` oder `false` |
| `drohne` | ja | `"markiert"` oder `"nicht_markiert"` |
| `erklaerung` | ja | Warum es ein Risiko ist oder nicht, und warum die Drohne richtig oder falsch lag, max. 300 Zeichen |
| `lernziel` | ja | ID eines Lernziels des Levels |
| `autor` | ja | Kürzel |
| `status` | ja | `"entwurf"` oder `"freigegeben"` |

Aus `istRisiko` und `drohne` ergeben sich vier Typen. Pro Durchgang werden gezogen:

| Typ | `istRisiko` | `drohne` | Gezogen | Mindestens im Pool |
|---|---|---|---|---|
| Echtes Risiko, von der AI gefunden | `true` | `markiert` | 3 | 4 |
| Fehlalarm der AI | `false` | `markiert` | 2 | 3 |
| Echtes Risiko, von der AI übersehen | `true` | `nicht_markiert` | 2 | 3 |
| Kein Risiko, nicht markiert | `false` | `nicht_markiert` | 1 | 2 |

Regeln, die geprüft werden:

1. `stellenProDurchgang` ist 8.
2. Von jedem Typ gibt es mindestens eine Stelle mehr, als gezogen wird.
3. Pro Durchgang kommt jeder `ort` höchstens einmal vor. Verteile die Stellen deshalb auf möglichst viele verschiedene Orte; liegen zu viele am selben Ort, lässt sich kein Durchgang ziehen.
4. IDs sind eindeutig und folgen dem Muster; `lernziel` ist ein Lernziel des Levels; die Maximallängen sind eingehalten.

Ein guter Fehlalarm ist ein Risiko, das allgemein plausibel klingt, hier aber nicht zutrifft. Ein gutes übersehenes Risiko ist etwas, das nur der Betrieb wissen kann (Kalender, Personen, Altlasten).

```json
{
  "rundgang": {
    "einleitung": "Bevor du planst, gehst du durch den Betrieb. Die AI-Drohne hat schon Stellen markiert. Prüfe sie und halte die Augen offen für das, was sie nicht wissen kann.",
    "stellenProDurchgang": 8,
    "stellen": [
      {
        "id": "L1-R01",
        "ort": "lager",
        "beobachtung": "Im Lager läuft im November die Hochsaison. Genau dann ist der Start des neuen Systems geplant.",
        "istRisiko": true,
        "drohne": "nicht_markiert",
        "erklaerung": "Das weiss nur der Betrieb. Die AI kennt euren Kalender nicht, darum fehlt dieses Risiko in ihrer Liste.",
        "lernziel": "L1-Z1",
        "autor": "FM",
        "status": "entwurf"
      }
    ]
  }
}
```

### Format «Ereignisse»

Zwischen den Stockwerken kündigt sich ein Risiko an, mit Wahrscheinlichkeit und Auswirkung. Gewählt wird eine der vier Strategien. Anders als bei den Situationen sind Kosten und Wirkung **vor** der Wahl sichtbar: Die Aufgabe ist das Abwägen, nicht das Erraten.

| Feld | Pflicht | Inhalt |
|---|---|---|
| `ereignisseProDurchgang` | ja | Standard `3`, höchstens 3 |
| `pool` | ja | Mindestens `ereignisseProDurchgang + 2` Ereignisse |

Ereignis:

| Feld | Pflicht | Inhalt |
|---|---|---|
| `id` | ja | `L<Level>-E<zweistellige Nummer>`, z. B. `L3-E02` |
| `titel` | ja | max. 60 Zeichen |
| `meldung` | ja | Was droht, max. 300 Zeichen |
| `darstellung` | ja | Einer von: `sturm`, `lieferverzug`, `ausfall`, `defekt`, `behoerde`, `generisch` |
| `wahrscheinlichkeit` | ja | Die **tatsächliche** Wahrscheinlichkeit: `tief` (20 %), `mittel` (40 %) oder `hoch` (60 %) |
| `aiPrognose` | nein | Wenn die Wahrscheinlichkeit von einer AI stammt, siehe unten |
| `auswirkung` | ja | Was passiert, wenn das Ereignis eintritt: `budget`, `zeit`, `stabilitaet`, nur negative Stufen oder `"0"` |
| `strategien` | ja | Objekt mit genau `vermeiden`, `vermindern`, `uebertragen`, `akzeptieren` |
| `lernziel`, `autor`, `status` | ja | wie bei Situationen |

Strategie, wenn verfügbar: `verfuegbar: true`, `text` (max. 100), `kosten` (Stufen wie bei `wirkung`, nie positiv), `empfohlen` (`true` oder `false`), `erklaerung` (max. 300).

Strategie, wenn nicht verfügbar: `verfuegbar: false`, `text` (max. 100), `grund` (max. 120). `kosten`, `empfohlen` und `erklaerung` entfallen.

`aiPrognose`: `angezeigt` (was die AI behauptet), `verlaesslich` (`true` oder `false`), `begruendung` (auf welcher Datenbasis die AI steht, max. 200), `aufloesung` (was die Prüfung im Team ergibt, max. 250). Bei einer unzuverlässigen Prognose enthält die `begruendung` einen erkennbaren Hinweis, etwa eine dünne oder unpassende Datenbasis.

Was jede Strategie bewirkt, wenn das Ereignis eintritt, ist fest und steht nicht im Inhalt:

| Strategie | Wirkung |
|---|---|
| `vermeiden` | Keine Auswirkung |
| `vermindern` | Jede Auswirkung eine Stufe kleiner (gross wird mittel, mittel wird klein, klein entfällt) |
| `uebertragen` | Auswirkung auf das Budget entfällt; auf Zeit und Stabilität bleibt sie voll |
| `akzeptieren` | Volle Auswirkung |

Regeln, die geprüft werden:

1. Der Pool enthält mindestens `ereignisseProDurchgang + 2` Ereignisse.
2. `auswirkung` enthält nur negative Stufen oder `"0"`, mindestens eine ist negativ.
3. `akzeptieren` ist immer verfügbar und kostenlos. Mindestens zwei weitere Strategien sind verfügbar.
4. Kosten sind nie positiv. `vermeiden`, `vermindern` und `uebertragen` kosten mindestens etwas.
5. `uebertragen` ist nur verfügbar, wenn die Auswirkung auf das Budget negativ ist.
6. Mindestens eine und höchstens zwei Strategien sind empfohlen. Die Empfehlung bezieht sich auf die tatsächliche Wahrscheinlichkeit.
7. `aiPrognose.verlaesslich: true` verlangt `angezeigt` gleich `wahrscheinlichkeit`; `false` verlangt ungleich.
8. Pro Pool hat mindestens ein Drittel der Ereignisse eine `aiPrognose`, davon mindestens eine verlässliche und eine unzuverlässige.
9. Über den Pool verteilt ist jede der vier Strategien mindestens einmal empfohlen.
10. IDs sind eindeutig und folgen dem Muster; `lernziel` ist ein Lernziel des Levels; die Maximallängen sind eingehalten.

```json
{
  "ereignisse": {
    "ereignisseProDurchgang": 3,
    "pool": [
      {
        "id": "L3-E01",
        "titel": "Gewitter bei offenem Dach",
        "meldung": "In zwei Wochen ist das Dach von Haus B für fünf Tage offen. Zieht in dieser Zeit ein Gewitter durch, dringt Wasser in die oberen Wohnungen.",
        "darstellung": "sturm",
        "wahrscheinlichkeit": "hoch",
        "aiPrognose": {
          "angezeigt": "tief",
          "verlaesslich": false,
          "begruendung": "Die AI stützt sich auf Wetterdaten des ganzen Kantons über das ganze Jahr.",
          "aufloesung": "Der Polier weiss: Am Hang gewittert es im Juli fast jede Woche. Die Jahreswerte des Kantons sagen dazu wenig."
        },
        "auswirkung": { "budget": "-mittel", "zeit": "-klein", "stabilitaet": "-mittel" },
        "strategien": {
          "vermeiden": {
            "verfuegbar": true,
            "text": "Die Dacharbeiten in den September verschieben.",
            "kosten": { "budget": "0", "zeit": "-gross", "stabilitaet": "0" },
            "empfohlen": false,
            "erklaerung": "Das Risiko ist weg, aber der Preis ist hoch: Der ganze Terminplan verschiebt sich, und die Mieter warten länger."
          },
          "vermindern": {
            "verfuegbar": true,
            "text": "Ein Notdach bereitstellen und die Wetterlage täglich prüfen.",
            "kosten": { "budget": "-klein", "zeit": "0", "stabilitaet": "0" },
            "empfohlen": true,
            "erklaerung": "Für wenig Geld sinkt der Schaden deutlich. Bei hoher Wahrscheinlichkeit und spürbarer Auswirkung lohnt sich das."
          },
          "uebertragen": {
            "verfuegbar": true,
            "text": "Eine Bauwesenversicherung für Wasserschäden abschliessen.",
            "kosten": { "budget": "-klein", "zeit": "0", "stabilitaet": "0" },
            "empfohlen": false,
            "erklaerung": "Die Versicherung zahlt den Schaden, aber die Wohnungen sind trotzdem nass und die Arbeiten stehen. Übertragen deckt Geld, nicht Zeit."
          },
          "akzeptieren": {
            "verfuegbar": true,
            "text": "Nichts tun und das Risiko tragen.",
            "kosten": { "budget": "0", "zeit": "0", "stabilitaet": "0" },
            "empfohlen": false,
            "erklaerung": "Akzeptieren passt bei kleinen oder unwahrscheinlichen Risiken. Dieses ist beides nicht."
          }
        },
        "lernziel": "L3-Z1",
        "autor": "FM",
        "status": "entwurf"
      }
    ]
  }
}
```

Prüfe vor der Ausgabe eines Rundgangs oder von Ereignissen zusätzlich: Stimmen die vier Typen und ihre Anzahl? Ist jede Strategie vorhanden, `akzeptieren` kostenlos, sind ein bis zwei Strategien empfohlen? Passt `verlaesslich` zu `angezeigt` und `wahrscheinlichkeit`?

### Prüfe vor der Ausgabe

- Drei Optionen, jede mit mindestens einer negativen Wirkung?
- Mindestens eine gute und eine riskante Option?
- Gute Option kostet nur `-klein`, entweder Budget oder Zeit?
- Die drei Optionstexte etwa gleich lang?
- Alle Wirkungen als Stufe, keine Zahlen?
- Kein ß, keine echten Namen, kein HTML oder Markdown in den Feldern?
- Alle Texte innerhalb der Maximallängen?
- Gültiges JSON ohne Kommentare und ohne Komma nach dem letzten Element?
