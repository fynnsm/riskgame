import { describe, expect, it } from 'vitest';
import { canDrawTour, tourType } from '../../src/content/mechanics-rules.ts';
import type { Level, RiskEvent, Tour } from '../../src/content/schema.ts';
import { validateLevel } from '../../src/content/validate.ts';
import { clone, makeLevel, makeMechanicsLevel, RULES } from './fixtures.ts';

function errorsFor(mutate: (level: Level) => void): string {
  const level = clone(makeMechanicsLevel());
  mutate(level);
  const result = validateLevel(level, 'test.json', RULES);
  return result.ok ? '' : result.errors.join('\n');
}

const tour = (l: Level): Tour => l.rundgang as Tour;
const event = (l: Level, i = 0): RiskEvent => l.ereignisse?.pool[i] as RiskEvent;
/** Lets a test write what the types forbid, as a broken file would. */
const loose = (value: unknown): Record<string, any> => value as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('content of update 3: valid files', () => {
  it('accepts a level with site tour and events', () => {
    const result = validateLevel(makeMechanicsLevel(), 'test.json', RULES);
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it('still accepts a level without the new blocks', () => {
    expect(validateLevel(makeLevel(), 'test.json', RULES).ok).toBe(true);
  });

  it('accepts a strategy that is not available, with its reason', () => {
    const level = makeMechanicsLevel();
    // Transfer makes no sense where the budget is not hit, so it must be locked there.
    const e = event(level, 4);
    e.auswirkung = { budget: '0', zeit: '-mittel', stabilitaet: '-klein' };
    e.strategien.uebertragen = {
      verfuegbar: false,
      text: 'Versichern.',
      grund: 'Es gibt keinen Geldschaden.',
    };
    expect(validateLevel(level, 'test.json', RULES).ok).toBe(true);
  });
});

describe('site tour: every rule rejects a broken file with a clear message (1.3, 1.5)', () => {
  it.each<[string, (l: Level) => void, string]>([
    [
      'wrong number of places per run',
      (l) => void (tour(l).stellenProDurchgang = 6),
      'muss 8 sein',
    ],
    [
      'id of the wrong pattern',
      (l) => void (tour(l).stellen[0]!.id = 'R1'),
      'passt nicht zum Muster L1-R',
    ],
    ['duplicate id', (l) => void (tour(l).stellen[1]!.id = 'L1-R01'), 'kommt mehrfach vor'],
    [
      'unknown learning goal',
      (l) => void (tour(l).stellen[0]!.lernziel = 'L1-Z9'),
      'kein Lernziel dieses Levels',
    ],
    ['unknown place', (l) => void (loose(tour(l).stellen[0]).ort = 'keller'), 'unerlaubten Wert'],
    [
      'unknown drone value',
      (l) => void (loose(tour(l).stellen[0]).drohne = 'vielleicht'),
      'unerlaubten Wert',
    ],
    [
      'observation too long',
      (l) => void (tour(l).stellen[0]!.beobachtung = 'x'.repeat(201)),
      'ist zu lang (201 Zeichen, erlaubt sind 200)',
    ],
    [
      'explanation too long',
      (l) => void (tour(l).stellen[0]!.erklaerung = 'x'.repeat(301)),
      'erlaubt sind 300',
    ],
    [
      'introduction too long',
      (l) => void (tour(l).einleitung = 'x'.repeat(301)),
      'erlaubt sind 300',
    ],
    [
      'sharp s',
      (l) => void (tour(l).stellen[0]!.beobachtung = 'Eine große Sache.'),
      'enthält ein ß',
    ],
    [
      'missing field',
      (l) => void delete loose(tour(l).stellen[0]).istRisiko,
      'fehlt oder hat den falschen Typ',
    ],
    ['unknown field', (l) => void (loose(tour(l)).bonus = 1), 'unbekannte Felder: bonus'],
    [
      'too few found risks in the pool',
      (l) => void tour(l).stellen.splice(0, 1),
      'vom Typ «echtes Risiko, von der AI markiert» braucht es mindestens 4 Stellen, vorhanden sind 3',
    ],
    [
      'too few false alarms',
      (l) => void tour(l).stellen.splice(4, 1),
      'vom Typ «Fehlalarm der AI» braucht es mindestens 3',
    ],
    [
      'too few missed risks',
      (l) => void tour(l).stellen.splice(7, 1),
      'vom Typ «echtes Risiko, von der AI übersehen» braucht es mindestens 3',
    ],
    [
      'too few plain places',
      (l) => void tour(l).stellen.splice(10, 1),
      'vom Typ «kein Risiko, nicht markiert» braucht es mindestens 2',
    ],
    [
      'places that cannot be drawn without a repeat',
      (l) => {
        // Everything happens at two places: eight different ones cannot be found.
        tour(l).stellen.forEach((site, i) => void (site.ort = i % 2 === 0 ? 'lager' : 'kran'));
      },
      'jeder Ort höchstens einmal vorkommt',
    ],
  ])('%s', (_name, mutate, expected) => {
    const errors = errorsFor(mutate);
    expect(errors).toContain(expected);
    for (const line of errors.split('\n')) expect(line).toMatch(/^test\.json, Feld «.+»: /);
  });

  it('tells the four kinds of place apart', () => {
    expect(tourType({ istRisiko: true, drohne: 'markiert' })).toBe('gefunden');
    expect(tourType({ istRisiko: false, drohne: 'markiert' })).toBe('fehlalarm');
    expect(tourType({ istRisiko: true, drohne: 'nicht_markiert' })).toBe('uebersehen');
    expect(tourType({ istRisiko: false, drohne: 'nicht_markiert' })).toBe('unauffaellig');
  });

  it('knows whether a run can be drawn with every place at most once', () => {
    const sites = makeMechanicsLevel().rundgang?.stellen ?? [];
    expect(canDrawTour(sites, RULES.tourDraw)).toBe(true);
    expect(canDrawTour(sites.slice(0, 5), RULES.tourDraw)).toBe(false);
    expect(canDrawTour([], { gefunden: 0, fehlalarm: 0, uebersehen: 0, unauffaellig: 0 })).toBe(
      true,
    );
  });
});

describe('events: every rule of 2.6 rejects a broken file with a clear message', () => {
  const strategy = (l: Level, id: string, i = 0) => loose(event(l, i).strategien)[id];

  it.each<[string, (l: Level) => void, string]>([
    [
      '1 pool too small',
      (l) => void l.ereignisse?.pool.splice(4),
      'der Pool ist zu klein: 4 Ereignisse, nötig sind mindestens 5',
    ],
    [
      'more events per run than rounds',
      (l) => void (l.ereignisse!.ereignisseProDurchgang = 4),
      'höchstens 3',
    ],
    [
      '2 positive impact',
      (l) => void (event(l).auswirkung.zeit = '+klein'),
      'darf nur negative Stufen oder «0» enthalten',
    ],
    [
      '2 no impact at all',
      (l) => void (event(l, 3).auswirkung = { budget: '0', zeit: '0', stabilitaet: '0' }),
      'braucht mindestens eine negative Wirkung',
    ],
    [
      '3 accepting not available',
      (l) =>
        void (event(l).strategien.akzeptieren = {
          verfuegbar: false,
          text: 'Nichts tun.',
          grund: 'Geht nicht.',
        }),
      'muss immer verfügbar sein',
    ],
    [
      '3 accepting costs something',
      (l) => void (strategy(l, 'akzeptieren').kosten.zeit = '-klein'),
      'Akzeptieren ist kostenlos',
    ],
    [
      '3 only one further strategy',
      (l) => {
        const e = event(l, 3);
        e.strategien.vermeiden = { verfuegbar: false, text: 'x', grund: 'Geht nicht.' };
        e.strategien.vermindern = { verfuegbar: false, text: 'x', grund: 'Geht nicht.' };
      },
      'mindestens zwei weitere Strategien verfügbar',
    ],
    [
      '4 positive costs',
      (l) => void (strategy(l, 'vermindern').kosten.zeit = '+klein'),
      'Kosten sind nie positiv',
    ],
    [
      '4 a strategy that costs nothing',
      (l) => void (strategy(l, 'vermeiden').kosten = { budget: '0', zeit: '0', stabilitaet: '0' }),
      'diese Strategie muss mindestens etwas kosten',
    ],
    [
      '5 transfer without a hit on the budget',
      (l) => void (event(l).auswirkung.budget = '0'),
      'Übertragen ist nur sinnvoll, wenn das Ereignis das Budget trifft',
    ],
    [
      '6 nothing recommended',
      (l) => void (strategy(l, 'vermeiden').empfohlen = false),
      'hier sind es 0',
    ],
    [
      '6 three recommended',
      (l) => {
        strategy(l, 'vermindern').empfohlen = true;
        strategy(l, 'uebertragen').empfohlen = true;
      },
      'hier sind es 3',
    ],
    [
      '7 reliable forecast that differs',
      (l) => void (event(l).aiPrognose!.angezeigt = 'hoch'),
      '«angezeigt» muss gleich «wahrscheinlichkeit» sein',
    ],
    [
      '7 unreliable forecast that agrees',
      (l) => void (event(l, 1).aiPrognose!.angezeigt = 'hoch'),
      '«angezeigt» muss ungleich «wahrscheinlichkeit» sein',
    ],
    [
      '8 too few forecasts',
      (l) => void delete event(l).aiPrognose,
      'mindestens ein Drittel der Ereignisse braucht eine aiPrognose, hier sind es 1 von 5',
    ],
    [
      '8 no reliable forecast',
      (l) => {
        const first = event(l).aiPrognose!;
        first.verlaesslich = false;
        first.angezeigt = 'hoch';
      },
      'mindestens eine aiPrognose muss verlässlich sein',
    ],
    [
      '8 no unreliable forecast',
      (l) => {
        const second = event(l, 1).aiPrognose!;
        second.verlaesslich = true;
        second.angezeigt = 'hoch';
      },
      'mindestens eine aiPrognose muss unzuverlässig sein',
    ],
    [
      '9 a strategy that is never the recommended one',
      (l) => {
        strategy(l, 'akzeptieren', 3).empfohlen = false;
        strategy(l, 'vermindern', 3).empfohlen = true;
      },
      'die Strategie «akzeptieren» ist in keinem Ereignis empfohlen',
    ],
    ['id of the wrong pattern', (l) => void (event(l).id = 'E1'), 'passt nicht zum Muster L1-E'],
    ['duplicate id', (l) => void (event(l, 1).id = 'L1-E01'), 'kommt mehrfach vor'],
    [
      'unknown learning goal',
      (l) => void (event(l).lernziel = 'L1-Z9'),
      'kein Lernziel dieses Levels',
    ],
    ['unknown look', (l) => void (loose(event(l)).darstellung = 'meteor'), 'unerlaubten Wert'],
    [
      'unknown probability',
      (l) => void (loose(event(l)).wahrscheinlichkeit = 'sicher'),
      'unerlaubten Wert',
    ],
    ['message too long', (l) => void (event(l).meldung = 'x'.repeat(301)), 'erlaubt sind 300'],
    [
      'strategy text too long',
      (l) => void (strategy(l, 'vermeiden').text = 'x'.repeat(101)),
      'erlaubt sind 100',
    ],
    [
      'reasoning of the forecast too long',
      (l) => void (event(l).aiPrognose!.begruendung = 'x'.repeat(201)),
      'erlaubt sind 200',
    ],
    [
      'resolution of the forecast too long',
      (l) => void (event(l).aiPrognose!.aufloesung = 'x'.repeat(251)),
      'erlaubt sind 250',
    ],
    [
      'locked strategy without a reason',
      (l) => void (loose(event(l, 3).strategien).vermeiden = { verfuegbar: false, text: 'x' }),
      'fehlt oder hat den falschen Typ',
    ],
    [
      'locked strategy that still names costs',
      (l) =>
        void (loose(event(l, 3).strategien).vermeiden = {
          verfuegbar: false,
          text: 'x',
          grund: 'Geht nicht.',
          kosten: { budget: '0', zeit: '0', stabilitaet: '0' },
        }),
      'unbekannte Felder: kosten',
    ],
    [
      'a missing strategy',
      (l) => void delete loose(event(l).strategien).uebertragen,
      'fehlt oder hat den falschen Typ',
    ],
  ])('%s', (_name, mutate, expected) => {
    expect(errorsFor(mutate)).toContain(expected);
  });
});
