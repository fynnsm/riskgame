import type { GaugeKey, Rating } from '../content/schema.ts';
import type { GoalStatus } from '../core/scoring.ts';

/** Every string the player sees that does not come from a level file (CLAUDE.md, rule 6). */
export const T = {
  appTitle: 'Risk Tower',
  menu: 'Menü',
  menuSymbol: '☰',
  back: 'Zurück',
  next: 'Weiter',

  gauges: {
    budget: 'Budget',
    zeit: 'Zeit',
    stabilitaet: 'Stabilität',
  } satisfies Record<GaugeKey, string>,
  gaugeCritical: 'kritisch',
  stepper: (current: number, total: number) => `Entscheid ${current} von ${total}`,

  ratings: {
    gut: 'Gut',
    vertretbar: 'Vertretbar',
    riskant: 'Riskant',
  } satisfies Record<Rating, string>,
  ratingSymbols: {
    gut: '✓',
    vertretbar: '~',
    riskant: '!',
  } satisfies Record<Rating, string>,

  city: {
    intro:
      'Baue fünf Gebäude. Jedes ist ein Projekt, und deine Entscheide im Risikomanagement halten es stabil oder bringen es zum Einsturz.',
    levelsHeading: 'Deine Bauplätze',
    level: (n: number) => `Level ${n}`,
    open: 'Offen',
    start: 'Starten',
    repeat: 'Wiederholen',
    locked: (n: number) => `Gesperrt. Schliesse zuerst Level ${n} ab.`,
    unavailable: 'Die Inhalte für dieses Level sind noch nicht verfügbar.',
    done: 'Abgeschlossen',
    deviceHint: 'Dein Fortschritt wird nur auf diesem Gerät und in diesem Browser gespeichert.',
    noLevels: 'Es konnten keine Level geladen werden.',
    contentErrors: 'Einige Inhaltsdateien sind fehlerhaft und wurden übersprungen:',
  },

  stars: (n: number) => `${n} von 3 Sternen`,

  summary: {
    heading: 'Gesamtauswertung',
    lead: 'Du hast alle fünf Gebäude fertig gebaut.',
    totalStars: (n: number, max: number) => `${n} von ${max} Sternen`,
    playTime: 'Aktive Spielzeit',
    goalsHeading: 'Die wichtigsten Lernpunkte',
    goalReached: 'erreicht',
    goalOpen: 'noch offen',
  },

  briefing: {
    eyebrow: (n: number, title: string) => `Level ${n} · ${title}`,
    project: 'Dein Projekt',
    goals: 'Das lernst du',
    start: 'Los gehts',
    rulesHeading: 'So bestehst du',
    rules: (steps: number, required: number, max: number) =>
      `Du triffst ${steps} Entscheide. Fällt eine Anzeige auf null, stürzt das Gebäude ein. Bleibt es stehen, folgt die Bauabnahme: Du brauchst mindestens ${required} von ${max} Punkten. Ein guter Entscheid gibt 2 Punkte, ein vertretbarer 1, ein riskanter 0.`,
  },

  theory: {
    progress: (i: number, n: number) => `Theorie ${i} von ${n}`,
    skip: 'Theorie überspringen',
    videoLoad: 'Video laden',
    videoHint:
      'Das Video wird von einem externen Anbieter geladen. Erst nach deinem Klick wird eine Verbindung aufgebaut.',
    videoTranscript: 'Kurzfassung',
    videoBlocked: 'Dieses Video kann nicht eingebettet werden.',
    videoDuration: (minutes: number) => `Dauer: rund ${minutes} min`,
  },

  situation: {
    progress: (i: number, n: number) => `Situation ${i} von ${n}`,
    draft: 'Entwurf',
    aiHeading: 'Ausgabe der AI',
    prompt: 'Prompt',
    answer: 'Antwort',
    optionsHeading: 'Was tust du?',
    keyboardHint: 'Tipp: Mit den Tasten 1, 2 und 3 wählst du eine Option, mit Enter gehts weiter.',
  },

  feedback: {
    yourChoice: 'Deine Wahl',
    changes: 'Veränderung der Anzeigen',
    noChange: 'unverändert',
    collapse: 'Eine Anzeige ist auf null gefallen. Das Gebäude stürzt ein.',
    rejected: 'Das Gebäude steht, aber die Bauabnahme ist nicht bestanden.',
    toResult: 'Zur Auswertung',
  },

  result: {
    completed: 'Gebäude fertig',
    collapsed: 'Gebäude eingestürzt',
    siteClosed: 'Baustopp',
    completedLead: 'Das Projekt ist abgeschlossen. Dein Gebäude bleibt so in der Stadt stehen.',
    collapsedLead: (gauges: string) =>
      `Das Projekt ist gescheitert: ${gauges} ist auf null gefallen.`,
    rejected: 'Bauabnahme nicht bestanden',
    rejectedLead: (points: number, required: number, max: number) =>
      `Das Gebäude steht, aber zu viele Entscheide waren riskant oder nur vertretbar. Du hast ${points} von ${max} Punkten erreicht, nötig sind ${required}.`,
    rejectedCauses: 'Diese Entscheide haben Punkte gekostet',
    points: (points: number, max: number) => `${points} von ${max} Punkten`,
    causes: 'Diese Entscheide haben das Gebäude gekippt',
    causeLoss: (gauge: string, loss: number) => `${gauge} −${loss}`,
    finalGauges: 'Endstand',
    goals: 'Lernziele',
    decisions: 'Deine Entscheide',
    restart: 'Level neu starten',
    repeat: 'Level wiederholen',
    toCity: 'Zur Stadt',
    nextLevel: 'Nächstes Level',
  },

  goalStatus: {
    erreicht: 'Erreicht',
    'nicht-erreicht': 'Noch nicht erreicht',
    'nicht-geprueft': 'In diesem Durchgang nicht geprüft',
  } satisfies Record<GoalStatus, string>,

  menuScreen: {
    heading: 'Menü',
    abort: 'Level abbrechen und zur Stadt',
    reportHeading: 'Fehlerbericht',
    reportLead:
      'Etwas funktioniert nicht? Kopiere den Bericht und schick ihn der Gruppe. Er enthält technische Angaben und deinen Spielverlauf, aber keine persönlichen Daten. Er wird nie automatisch verschickt.',
    reportLabel: 'Inhalt des Fehlerberichts',
    copy: 'Fehlerbericht kopieren',
    copied: 'Der Bericht ist in der Zwischenablage.',
    copyFailed: 'Kopieren war nicht möglich. Markiere den Text im Feld und kopiere ihn von Hand.',
    resetHeading: 'Fortschritt',
    reset: 'Fortschritt löschen',
    version: (version: string, commit: string) => `Version ${version} (${commit})`,
  },

  confirmReset: {
    heading: 'Fortschritt wirklich löschen?',
    lead: 'Alle Gebäude, Sterne und die Spielzeit gehen verloren. Das lässt sich nicht rückgängig machen.',
    yes: 'Ja, alles löschen',
    no: 'Abbrechen',
  },

  notices: {
    invalid:
      'Dein gespeicherter Spielstand war beschädigt und konnte nicht gelesen werden. Das Spiel beginnt neu.',
    outdated:
      'Dein gespeicherter Spielstand stammt aus einer älteren Version. Das Spiel beginnt neu.',
    unavailable:
      'Dieser Browser erlaubt kein Speichern. Du kannst spielen, aber dein Fortschritt geht beim Schliessen verloren.',
    saveFailed:
      'Der Fortschritt konnte nicht gespeichert werden. Er geht beim Schliessen möglicherweise verloren.',
    staleRun:
      'Dein angefangenes Level passt nicht mehr zu den aktuellen Inhalten. Du startest es neu.',
    noWebgl:
      'Dein Gerät unterstützt die 3D-Ansicht nicht. Du spielst im Einfach-Modus ohne Grafik, alle Inhalte sind vorhanden.',
    resetDone: 'Dein Fortschritt wurde gelöscht.',
    resetFailed: 'Der Fortschritt konnte nicht gelöscht werden.',
  },

  debug: {
    heading: 'Debug',
    fps: 'Bildrate',
    drawCalls: 'Zeichenaufrufe',
    triangles: 'Dreiecke',
    quality: 'Qualitätsstufe',
    level: 'Level',
    seed: 'Seed',
    gauges: 'Anzeigen',
    jump: (n: number) => `Level ${n}`,
  },

  error: {
    heading: 'Da ist etwas schiefgelaufen',
    lead: 'Das Spiel ist auf einen Fehler gestossen. Dein Fortschritt ist gespeichert. Lade die Seite neu, um weiterzuspielen.',
    reload: 'Seite neu laden',
  },

  graphics: {
    prozess: {
      caption: 'Der Risikomanagement-Prozess',
      steps: ['Identifizieren', 'Bewerten', 'Massnahmen planen', 'Überwachen'],
    },
    risikomatrix: {
      caption: 'Risikomatrix: je weiter oben rechts, desto wichtiger',
      probability: 'Wahrscheinlichkeit',
      impact: 'Auswirkung',
      levels: ['tief', 'mittel', 'hoch'],
    },
    strategien: {
      caption: 'Vier Strategien im Umgang mit einem Risiko',
      items: [
        ['Vermeiden', 'Plan ändern, Risiko fällt weg'],
        ['Vermindern', 'Wahrscheinlichkeit oder Auswirkung senken'],
        ['Übertragen', 'Schaden trägt jemand anderes'],
        ['Akzeptieren', 'Bewusst in Kauf nehmen'],
      ],
    },
    register: {
      caption: 'So ist ein Eintrag im Risikoregister aufgebaut',
      rows: [
        ['Ursache', 'Warum kann es passieren?'],
        ['Ereignis', 'Was genau kann passieren?'],
        ['Auswirkung', 'Was bedeutet das für das Projekt?'],
        ['Bewertung', 'Wahrscheinlichkeit und Auswirkung'],
        ['Massnahme', 'Was tun wir, wer, bis wann?'],
      ],
    },
  },
} as const;
