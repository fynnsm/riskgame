import type { Effects, Level, Situation } from '../../src/content/schema.ts';
import { BALANCE } from '../../src/core/balance.ts';

export const POINTS = BALANCE.effectPoints;

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
        text: `Gute Wahl ${index}`,
        wirkung: GOOD,
        einstufung: 'gut',
        erklaerung: 'Gut, weil.',
      },
      {
        id: 'B',
        text: `Riskante Wahl ${index}`,
        wirkung: RISKY,
        einstufung: 'riskant',
        erklaerung: 'Riskant, weil.',
      },
      {
        id: 'C',
        text: `Vertretbare Wahl ${index}`,
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
    schemaVersion: 1,
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
