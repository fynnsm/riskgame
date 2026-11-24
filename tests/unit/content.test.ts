import { describe, expect, it } from 'vitest';
import { effectSum, effectValue, hasNegativeEffect } from '../../src/content/effects.ts';
import { loadLevels, selectPlayable } from '../../src/content/load.ts';
import { checkVideoUrl } from '../../src/content/rules.ts';
import type { Level } from '../../src/content/schema.ts';
import { EFFECT_LEVELS } from '../../src/content/schema.ts';
import { contentReport, levelStats } from '../../src/content/stats.ts';
import { formatPath, validateLevel, validateLevelJson } from '../../src/content/validate.ts';
import { readLevelFiles } from '../../scripts/read-levels.ts';
import { clone, GOOD, makeLevel, makeMechanicsLevel, POINTS, RULES, RISKY } from './fixtures.ts';

function errorsFor(mutate: (level: Level) => void): string[] {
  const level = clone(makeLevel());
  mutate(level);
  const result = validateLevel(level, 'test.json', RULES);
  return result.ok ? [] : result.errors;
}

/** Applies a change the type system would refuse, as a broken file would. */
function raw(level: Level): Record<string, unknown> {
  return level as unknown as Record<string, unknown>;
}

describe('effects', () => {
  it('maps every step size to its points with the right sign', () => {
    expect(EFFECT_LEVELS.map((l) => effectValue(l, POINTS))).toEqual([-26, -14, -6, 0, 6, 14, 26]);
  });

  it('sums effects and detects a missing cost', () => {
    expect(effectSum(GOOD, POINTS)).toBe(2);
    expect(effectSum(RISKY, POINTS)).toBe(-20);
    expect(hasNegativeEffect(GOOD)).toBe(true);
    expect(hasNegativeEffect({ budget: '0', zeit: '+klein', stabilitaet: '+gross' })).toBe(false);
  });
});

describe('validateLevel: valid content', () => {
  it('accepts the fixture level without warnings', () => {
    const result = validateLevel(makeLevel(), 'test.json', RULES);
    expect(result).toMatchObject({ ok: true, warnings: [] });
  });

  it('accepts every level file shipped in content/levels', () => {
    const files = readLevelFiles();
    expect(Object.keys(files)).toHaveLength(5);
    for (const [name, json] of Object.entries(files)) {
      const result = validateLevelJson(json, name, RULES);
      expect(result.ok ? [] : result.errors, name).toEqual([]);
    }
  });

  it('accepts a video step from an allowed host', () => {
    const level = makeLevel();
    level.theorie.push({
      typ: 'video',
      id: 'L1-T4',
      titel: 'Video',
      url: 'https://www.youtube-nocookie.com/embed/abc',
      dauerSekunden: 120,
      transkript: 'Kurzfassung.',
    });
    expect(validateLevel(level, 'test.json', RULES).ok).toBe(true);
  });

  it('warns, but does not fail, if fewer than two situations show an AI output (F-304)', () => {
    const level = makeLevel();
    delete level.situationen[0]?.aiAusgabe;
    const result = validateLevel(level, 'test.json', RULES);
    expect(result.ok).toBe(true);
    expect(result.warnings.join()).toContain('aiAusgabe');
  });
});

describe('validateLevel: every rule of IMPORT.md rejects a broken file with a clear message', () => {
  const cases: [string, (level: Level) => void, string][] = [
    ['two options only', (l) => void l.situationen[0]?.optionen.pop(), 'genau drei Optionen'],
    [
      'duplicate option ids',
      (l) => {
        const options = l.situationen[0]?.optionen;
        if (options?.[2]) options[2].id = 'A';
      },
      'genau drei Optionen',
    ],
    [
      'option without any cost',
      (l) => {
        const option = l.situationen[1]?.optionen[0];
        if (option) option.wirkung = { budget: '0', zeit: '+klein', stabilitaet: '+gross' };
      },
      'mindestens eine negative Wirkung',
    ],
    [
      'no good option',
      (l) => {
        const option = l.situationen[2]?.optionen[0];
        if (option) option.einstufung = 'vertretbar';
      },
      'als «gut» eingestuft',
    ],
    [
      'no risky option',
      (l) => {
        const option = l.situationen[2]?.optionen[1];
        if (option) option.einstufung = 'vertretbar';
      },
      'als «riskant» eingestuft',
    ],
    [
      'good option not better than the risky one',
      (l) => {
        const option = l.situationen[3]?.optionen[0];
        if (option) option.wirkung = { budget: '-gross', zeit: '-gross', stabilitaet: '+klein' };
      },
      'in der Summe nicht besser',
    ],
    [
      'unknown learning goal',
      (l) => {
        const s = l.situationen[0];
        if (s) s.lernziel = 'L1-Z9';
      },
      'kein Lernziel dieses Levels',
    ],
    [
      'duplicate situation id',
      (l) => {
        const s = l.situationen[1];
        if (s) s.id = 'L1-S01';
      },
      'kommt mehrfach vor',
    ],
    [
      'situation id of another level',
      (l) => {
        const s = l.situationen[1];
        if (s) s.id = 'L2-S02';
      },
      'passt nicht zum Muster L1-S',
    ],
    [
      'title too long',
      (l) => {
        const s = l.situationen[0];
        if (s) s.titel = 'x'.repeat(61);
      },
      'ist zu lang (61 Zeichen, erlaubt sind 60)',
    ],
    [
      'sharp s',
      (l) => {
        const s = l.situationen[0];
        if (s) s.situation = 'Eine große Sache.';
      },
      'enthält ein ß',
    ],
    [
      'line break in a field',
      (l) => {
        const s = l.situationen[0];
        if (s) s.situation = 'Zeile eins\nZeile zwei';
      },
      'Zeilenumbruch',
    ],
    [
      'HTML in a field',
      (l) => {
        const o = l.situationen[0]?.optionen[0];
        if (o) o.erklaerung = 'Das ist <b>wichtig</b>.';
      },
      'enthält HTML',
    ],
    [
      'empty text',
      (l) => {
        const o = l.situationen[0]?.optionen[0];
        if (o) o.text = '  ';
      },
      'darf nicht leer sein',
    ],
    ['pool too small', (l) => void l.situationen.splice(7), 'der Pool ist zu klein'],
    ['id does not match number', (l) => void (l.id = 'level-3'), 'muss «level-1» sein'],
    [
      'wrong process step',
      (l) => void (l.prozessschritt = 'bewerten'),
      'muss für Level 1 «identifizieren» sein',
    ],
    ['too few learning goals', (l) => void l.lernziele.splice(1), 'braucht 2 bis 4 Einträge'],
    [
      'learning goal id of wrong pattern',
      (l) => {
        const g = l.lernziele[1];
        if (g) g.id = 'Ziel-2';
      },
      'passt nicht zum Muster L1-Z',
    ],
    [
      'duplicate learning goal id',
      (l) => {
        const g = l.lernziele[1];
        if (g) g.id = 'L1-Z1';
      },
      'kommt mehrfach vor',
    ],
    ['too few theory steps', (l) => void l.theorie.splice(1), 'braucht 3 bis 7 Schritte'],
    [
      'theory id of wrong pattern',
      (l) => {
        const t = l.theorie[0];
        if (t) t.id = 'T1';
      },
      'passt nicht zum Muster L1-T',
    ],
    [
      'duplicate theory id',
      (l) => {
        const t = l.theorie[1];
        if (t) t.id = 'L1-T1';
      },
      'kommt mehrfach vor',
    ],
    [
      'video over http',
      (l) =>
        void l.theorie.push({
          typ: 'video',
          id: 'L1-T4',
          titel: 'Video',
          url: 'http://www.youtube-nocookie.com/embed/abc',
          dauerSekunden: 60,
          transkript: 'Text.',
        }),
      'muss mit https beginnen',
    ],
    [
      'video from a host that is not allowed',
      (l) =>
        void l.theorie.push({
          typ: 'video',
          id: 'L1-T4',
          titel: 'Video',
          url: 'https://evil.example/embed/abc',
          dauerSekunden: 60,
          transkript: 'Text.',
        }),
      'ist nicht erlaubt',
    ],
    [
      'effect given as a number',
      (l) => {
        const o = l.situationen[0]?.optionen[0];
        if (o) (o.wirkung as Record<string, string>).budget = '-5';
      },
      'unerlaubten Wert',
    ],
    ['unknown extra field', (l) => void (raw(l).bonus = true), 'unbekannte Felder: bonus'],
    [
      'missing mandatory field',
      (l) => void delete raw(l).projekt,
      'fehlt oder hat den falschen Typ',
    ],
    ['level number too high', (l) => void (l.nummer = 6), 'ist zu gross (höchstens 5)'],
    ['level number too low', (l) => void (l.nummer = 0), 'ist zu klein (mindestens 1)'],
    ['unsupported schema version', (l) => void (raw(l).schemaVersion = 3), 'unerlaubten Wert'],
    [
      'the schema version before update 3',
      (l) => void (raw(l).schemaVersion = 1),
      'unerlaubten Wert',
    ],
  ];

  it.each(cases)('%s', (_name, mutate, expected) => {
    const errors = errorsFor(mutate);
    expect(errors.join('\n')).toContain(expected);
    // F-903: every message names the file and the field.
    for (const error of errors) expect(error).toMatch(/^test\.json, Feld «.+»: /);
  });

  it('names the exact field of a nested problem', () => {
    const errors = errorsFor((l) => {
      const s = l.situationen[4];
      if (s) s.titel = '';
    });
    expect(errors).toEqual(['test.json, Feld «situationen[4].titel»: darf nicht leer sein']);
  });
});

describe('content statistics and pattern warnings (A1, A2)', () => {
  const warningsFor = (mutate: (level: Level) => void): string => {
    const level = clone(makeLevel());
    mutate(level);
    const result = validateLevel(level, 'test.json', RULES);
    expect(result.ok).toBe(true);
    return result.warnings.join('\n');
  };
  const lengthen = (level: Level, count: number, rating: string, factor = 1.2): void => {
    for (const s of level.situationen.slice(0, count)) {
      const option = s.optionen.find((o) => o.einstufung === rating);
      if (option) option.text = option.text.padEnd(Math.ceil(option.text.length * factor), '.');
    }
  };

  it('counts drafts, AI outputs and the spread of costs', () => {
    const level = makeLevel();
    for (const s of level.situationen.slice(0, 3)) s.status = 'entwurf';
    expect(levelStats(level, POINTS)).toEqual({
      levelId: 'level-1',
      nummer: 1,
      situations: 8,
      drafts: 3,
      released: 5,
      withAi: 2,
      goodIsLongest: [],
      unevenLength: [],
      budgetShare: 2 / 3,
      goodCostShare: { budget: 0.5, zeit: 0.5, stabilitaet: 0 },
      tourSites: { total: 0, drafts: 0 },
      events: { total: 0, drafts: 0 },
      byClaude: [],
      lengths: level.situationen.map((situation) => ({
        id: situation.id,
        titel: situation.titel,
        gut: 8,
        vertretbar: 8,
        riskant: 8,
        goodIsLongest: false,
        uneven: false,
      })),
    });
  });

  it('counts a good option as longest only if it clearly is', () => {
    const level = makeLevel();
    lengthen(level, 2, 'gut');
    lengthen(level, 1, 'riskant');
    // In the first situation good and risky are now equally long: no clear case.
    expect(levelStats(level, POINTS).goodIsLongest).toEqual(['L1-S02']);
  });

  it('handles a level without situations or costs without dividing by zero', () => {
    const empty = { ...makeLevel(), situationen: [] };
    expect(levelStats(empty, POINTS)).toMatchObject({
      situations: 0,
      budgetShare: 0,
      goodCostShare: { budget: 0, zeit: 0, stabilitaet: 0 },
    });
  });

  it('warns softly while the good option is the longest in a few situations', () => {
    const text = warningsFor((l) => lengthen(l, 4, 'gut'));
    expect(text).toContain(
      'die gute Option ist der längste Text in: L1-S01, L1-S02, L1-S03, L1-S04',
    );
    expect(text).not.toContain('erlaubt höchstens');
  });

  it('warns with the limit once the good option is the longest in more than half', () => {
    expect(warningsFor((l) => lengthen(l, 5, 'gut'))).toContain(
      'in 5 von 8 Situationen ist die gute Option der längste Text (erlaubt höchstens 50 %)',
    );
  });

  it('warns if the longest option text is more than 30 % longer than the shortest', () => {
    expect(warningsFor((l) => lengthen(l, 1, 'riskant', 1.5))).toContain(
      'mehr als 30 % länger als der kürzeste in: L1-S01',
    );
    expect(warningsFor((l) => lengthen(l, 1, 'riskant', 1.25))).not.toContain('30 %');
  });

  it('rejects a level in which too few options touch the budget', () => {
    const errors = errorsFor((l) => {
      for (const s of l.situationen) {
        for (const o of s.optionen) if (o.einstufung !== 'gut') o.wirkung.budget = '0';
      }
    });
    expect(errors.join('\n')).toContain(
      'nur 33 % der Optionen haben eine Budgetwirkung (nötig mindestens 40 %)',
    );
  });

  it('rejects a level whose good options cost almost only one gauge', () => {
    const errors = errorsFor((l) => {
      for (const s of l.situationen) {
        const good = s.optionen.find((o) => o.einstufung === 'gut');
        if (good) good.wirkung = { budget: '0', zeit: '-klein', stabilitaet: '+mittel' };
      }
    });
    expect(errors.join('\n')).toContain('100 % der Kosten der guten Optionen entfallen auf «zeit»');
  });

  it('lists the length of each rating, a dash where a situation has none, the longest of several', () => {
    const level = makeLevel();
    const first = level.situationen[0];
    if (!first) throw new Error('fixture');
    first.optionen = first.optionen.filter((o) => o.einstufung !== 'vertretbar');
    first.optionen.push({ ...first.optionen[0]!, id: 'C', text: 'Eine zweite gute Wahl, länger.' });
    const row = levelStats(level, POINTS).lengths[0];
    expect(row).toMatchObject({ gut: 30, vertretbar: null, riskant: 8, uneven: true });
    expect(contentReport([levelStats(level, POINTS)])).toContain('| 30 | – | 8 |');
  });

  it('counts tour places and events and lists what Claude wrote for the group to check', () => {
    const level = makeMechanicsLevel(3);
    const tour = level.rundgang?.stellen ?? [];
    const events = level.ereignisse?.pool ?? [];
    for (const site of tour.slice(0, 2)) Object.assign(site, { autor: 'CC', status: 'entwurf' });
    Object.assign(events[0] ?? {}, { autor: 'CC', status: 'entwurf' });
    Object.assign(events[1] ?? {}, { autor: 'CC' });
    Object.assign(level.situationen[0] ?? {}, { autor: 'CL', status: 'entwurf' });

    const stats = levelStats(level, POINTS);
    expect(stats.tourSites).toEqual({ total: 12, drafts: 2 });
    expect(stats.events).toEqual({ total: 5, drafts: 1 });
    expect(stats.byClaude.map((item) => `${item.kind} ${item.id} ${item.autor}`)).toEqual([
      'Situation L3-S01 CL',
      'Rundgang L3-R01 CC',
      'Rundgang L3-R02 CC',
      'Ereignis L3-E01 CC',
      'Ereignis L3-E02 CC',
    ]);

    const report = contentReport([stats, levelStats(makeLevel(1), POINTS)]);
    expect(report).toContain('| Level 3 | 8 | 1 | 7 | 12 (2 Entwurf) | 5 (1 Entwurf) |');
    expect(report).toContain('| Level 1 | 8 | 0 | 8 | – | – |');
    expect(report).toContain('- Von Claude Code (CC), Rundgang: L3-R01, L3-R02');
    // Released content keeps its place in the list, marked as such.
    expect(report).toContain('- Von Claude Code (CC), Ereignisse: L3-E01, L3-E02 (freigegeben)');
    expect(report).toContain('- Erste Fassung von Claude (CL), Situationen: L3-S01');
    expect(report).toContain('**Level 1**\n\n- nichts');
  });

  it('writes a report with one row per level and the affected situations', () => {
    const level = makeLevel();
    lengthen(level, 1, 'gut');
    const report = contentReport([levelStats(level, POINTS), levelStats(makeLevel(2), POINTS)]);
    expect(report).toContain(
      'Stand: 16 Situationen in 2 Leveln, davon 0 im Entwurf und 16 freigegeben.',
    );
    expect(report).toContain(
      '| Level 1 | 8 | 0 | 8 | – | – | 2 (25 %) | 1 (13 %) | 0 | 67 % | 50 % / 50 % / 0 % |',
    );
    // The three lengths side by side, for the situations that give the answer away.
    expect(report).toContain(
      '1 von 8 Situationen betroffen; in 1 ist die gute Option die längste.',
    );
    expect(report).toContain('| L1-S01 | Situation 1 | 10 | 8 | 8 | ja | nein |');
    expect(report).not.toContain('| L1-S02 |');
    // A level with nothing to fix says so instead of showing an empty table.
    expect(report).toContain('### Level 2\n\n0 von 8 Situationen betroffen');
    expect(report).toContain('Keine.');
    expect(contentReport([])).toContain('Stand: 0 Situationen in 0 Leveln');
  });
});

describe('validateLevelJson', () => {
  it('rejects text that is not JSON with a readable message', () => {
    const result = validateLevelJson('{ "id": ', 'kaputt.json', RULES);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.errors[0]).toContain(
      'kaputt.json, Feld «(Datei)»: ist kein gültiges JSON',
    );
  });

  it('rejects JSON of the wrong shape', () => {
    const result = validateLevelJson('[]', 'liste.json', RULES);
    expect(result.ok ? '' : result.errors[0]).toContain('Feld «(Datei)»');
    expect(formatPath([])).toBe('(Datei)');
  });
});

describe('checkVideoUrl', () => {
  it('accepts https links to allowed hosts', () => {
    expect(checkVideoUrl('https://player.vimeo.com/video/1')).toBeNull();
  });

  it('rejects anything that is not an address', () => {
    expect(checkVideoUrl('kein link')).toBe('ist keine gültige Adresse');
  });
});

describe('selectPlayable and loadLevels', () => {
  it('hides drafts in a published build and shows them when switched on (F-906)', () => {
    const level = makeLevel();
    for (const s of level.situationen.slice(0, 2)) s.status = 'entwurf';
    expect(selectPlayable(level, false, RULES).level.situationen).toHaveLength(6);
    expect(selectPlayable(level, false, RULES).available).toBe(true);
    expect(selectPlayable(level, true, RULES).level.situationen).toHaveLength(8);
  });

  it('marks a level as unavailable if too few released situations remain', () => {
    const level = makeLevel();
    for (const s of level.situationen.slice(0, 3)) s.status = 'entwurf';
    expect(selectPlayable(level, false, RULES).available).toBe(false);
  });

  it('returns valid levels in order and reports a broken file without dropping the others', () => {
    const broken = clone(makeLevel(3));
    broken.situationen.splice(2);
    const result = loadLevels(
      { 'level-2.json': makeLevel(2), 'level-1.json': makeLevel(1), 'level-3.json': broken },
      RULES,
      true,
    );
    expect(result.levels.map((l) => l.level.nummer)).toEqual([1, 2]);
    expect(result.errors.join()).toContain('level-3.json');
  });

  it('rejects a second file that claims the same level number', () => {
    const result = loadLevels({ 'a.json': makeLevel(1), 'b.json': makeLevel(1) }, RULES, true);
    expect(result.levels).toHaveLength(1);
    expect(result.errors.join()).toContain('b.json, Feld «nummer»');
  });

  it('collects warnings from all files', () => {
    const level = makeLevel();
    for (const s of level.situationen) delete s.aiAusgabe;
    expect(loadLevels({ 'level-1.json': level }, RULES, true).warnings).toHaveLength(1);
  });
});
