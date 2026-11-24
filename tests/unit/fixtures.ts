import type { Effects, Level, RiskEvent, Situation, Tour } from '../../src/content/schema.ts';
import { TOUR_PLACES } from '../../src/content/schema.ts';
import { BALANCE, CONTENT_RULES } from '../../src/core/balance.ts';

export const POINTS = BALANCE.effectPoints;
export const RULES = CONTENT_RULES;

export const GOOD: Effects = { budget: '-klein', zeit: '-klein', stabilitaet: '+mittel' };
export const RISKY: Effects = { budget: '0', zeit: '+klein', stabilitaet: '-gross' };
export const OKAY: Effects = { budget: '-klein', zeit: '-mittel', stabilitaet: '+klein' };

export function makeSituation(level: number, index: number, goal = 1): Situation {
  return {
    id: `L${level}-S${String(index).padStart(2, '0')}`,
    lernziel: `L${level}-Z${goal}`,
    titel: `Situation ${index}`,
    situation: `Ausgangslage ${index}. Was tust du?`,
    optionen: [
      {
        id: 'A',
        text: `Wahl G ${index}`,
        wirkung: GOOD,
        einstufung: 'gut',
        erklaerung: 'Gut, weil.',
      },
      {
        id: 'B',
        text: `Wahl R ${index}`,
        wirkung: RISKY,
        einstufung: 'riskant',
        erklaerung: 'Riskant, weil.',
      },
      {
        id: 'C',
        text: `Wahl V ${index}`,
        wirkung: OKAY,
        einstufung: 'vertretbar',
        erklaerung: 'Vertretbar, weil.',
      },
    ],
    autor: 'XX',
    status: 'freigegeben',
  };
}

/** A small but fully valid level: 8 situations, 2 goals, 3 cards, two AI outputs. */
export function makeLevel(nummer = 1): Level {
  const steps = ['identifizieren', 'bewerten', 'massnahmen', 'ueberwachen', 'grenzen'] as const;
  const situationen = Array.from({ length: 8 }, (_, i) =>
    makeSituation(nummer, i + 1, (i % 2) + 1),
  );
  for (const situation of situationen.slice(0, 2)) {
    situation.aiAusgabe = { prompt: 'Frage?', antwort: 'Antwort.' };
  }
  return {
    schemaVersion: 2,
    id: `level-${nummer}`,
    nummer,
    titel: `Level ${nummer}`,
    prozessschritt: steps[nummer - 1] ?? 'identifizieren',
    projekt: { titel: 'Projekt', beschreibung: 'Ein Projekt.', gebaeude: 'buero' },
    lernziele: [
      { id: `L${nummer}-Z1`, text: 'Erstes Ziel.' },
      { id: `L${nummer}-Z2`, text: 'Zweites Ziel.' },
    ],
    theorie: [1, 2, 3].map((i) => ({
      typ: 'karte' as const,
      id: `L${nummer}-T${i}`,
      titel: `Karte ${i}`,
      text: `Text ${i}.`,
    })),
    situationenProDurchgang: 6,
    situationen,
  };
}

/**
 * A valid site tour of twelve places: four real risks the drone found, three false alarms,
 * three real risks it missed, two plain places. Ten different places, so a run of eight
 * with every place at most once can always be drawn.
 */
export function makeTour(nummer = 1): Tour {
  const kinds: [boolean, 'markiert' | 'nicht_markiert'][] = [
    ...Array.from({ length: 4 }, (): [boolean, 'markiert'] => [true, 'markiert']),
    ...Array.from({ length: 3 }, (): [boolean, 'markiert'] => [false, 'markiert']),
    ...Array.from({ length: 3 }, (): [boolean, 'nicht_markiert'] => [true, 'nicht_markiert']),
    ...Array.from({ length: 2 }, (): [boolean, 'nicht_markiert'] => [false, 'nicht_markiert']),
  ];
  return {
    einleitung: 'Geh über die Baustelle.',
    stellenProDurchgang: 8,
    stellen: kinds.map(([istRisiko, drohne], i) => ({
      id: `L${nummer}-R${String(i + 1).padStart(2, '0')}`,
      ort: TOUR_PLACES[i % TOUR_PLACES.length] ?? 'lager',
      beobachtung: `Beobachtung ${i + 1}.`,
      istRisiko,
      drohne,
      erklaerung: `Erklärung ${i + 1}.`,
      lernziel: `L${nummer}-Z1`,
      autor: 'XX',
      status: 'freigegeben' as const,
    })),
  };
}

export function makeEvent(nummer: number, index: number): RiskEvent {
  const recommended = ['vermeiden', 'vermindern', 'uebertragen', 'akzeptieren', 'vermindern'][
    (index - 1) % 5
  ];
  const strategy = (id: string, kosten: Effects) => ({
    verfuegbar: true as const,
    text: `Strategie ${id}.`,
    kosten,
    empfohlen: id === recommended,
    erklaerung: `Erklärung zu ${id}.`,
  });
  const event: RiskEvent = {
    id: `L${nummer}-E${String(index).padStart(2, '0')}`,
    titel: `Ereignis ${index}`,
    meldung: `Meldung ${index}.`,
    darstellung: 'generisch',
    wahrscheinlichkeit: index === 2 ? 'hoch' : 'mittel',
    auswirkung: { budget: '-mittel', zeit: '-klein', stabilitaet: '-mittel' },
    strategien: {
      vermeiden: strategy('vermeiden', { budget: '0', zeit: '-gross', stabilitaet: '0' }),
      vermindern: strategy('vermindern', { budget: '-klein', zeit: '0', stabilitaet: '0' }),
      uebertragen: strategy('uebertragen', { budget: '-klein', zeit: '0', stabilitaet: '0' }),
      akzeptieren: strategy('akzeptieren', { budget: '0', zeit: '0', stabilitaet: '0' }),
    },
    lernziel: `L${nummer}-Z1`,
    autor: 'XX',
    status: 'freigegeben',
  };
  // The first forecast is reliable, the second is not: it shows «tief» where «hoch» is true.
  if (index === 1) {
    event.aiPrognose = {
      angezeigt: 'mittel',
      verlaesslich: true,
      begruendung: 'Gute Daten.',
      aufloesung: 'Stimmt.',
    };
  }
  if (index === 2) {
    event.aiPrognose = {
      angezeigt: 'tief',
      verlaesslich: false,
      begruendung: 'Dünne Daten.',
      aufloesung: 'Stimmt nicht.',
    };
  }
  return event;
}

/** A level with the site tour and no events. */
export function makeTourLevel(nummer = 1): Level {
  return { ...makeLevel(nummer), rundgang: makeTour(nummer) };
}

/** A level with events and no tour: eight decisions, so all three rounds are played. */
export function makeEventLevel(nummer = 3): Level {
  const base = makeLevel(nummer);
  return {
    ...base,
    situationenProDurchgang: 8,
    ereignisse: {
      ereignisseProDurchgang: 3,
      pool: [1, 2, 3, 4, 5].map((i) => makeEvent(nummer, i)),
    },
  };
}

/** A level with both mechanics of update 3. */
export function makeMechanicsLevel(nummer = 1): Level {
  return {
    ...makeLevel(nummer),
    rundgang: makeTour(nummer),
    ereignisse: {
      ereignisseProDurchgang: 3,
      pool: [1, 2, 3, 4, 5].map((i) => makeEvent(nummer, i)),
    },
  };
}

/** Deep copy, so a test can break one thing without touching the shared fixture. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** In-memory stand-in for the browser's Storage. */
export function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}
