import { describe, expect, it } from 'vitest';
import type { OptionId } from '../../src/content/schema.ts';
import { replay } from '../../src/core/game.ts';
import type { LogData, LogEntry, LogPersistence } from '../../src/logging/logger.ts';
import { createLogger, DEFAULT_CAPACITY, errorData } from '../../src/logging/logger.ts';
import type { ReportInput } from '../../src/logging/report.ts';
import {
  buildErrorReport,
  extractReplay,
  formatDuration,
  REPORT_TITLE,
} from '../../src/logging/report.ts';
import { makeLevel } from './fixtures.ts';

function memoryPersistence(
  initial: string | null = null,
): LogPersistence & { stored: string | null } {
  return {
    stored: initial,
    load() {
      return this.stored;
    },
    save(serialised: string) {
      this.stored = serialised;
    },
  };
}

describe('logger (L-01 to L-03)', () => {
  it('records level, event, time and data and forwards each entry to the sink', () => {
    let time = 100;
    const seen: LogEntry[] = [];
    const logger = createLogger({ now: () => time++, sink: (e) => seen.push(e) });
    logger.debug('a');
    logger.info('level.start', { levelId: 'level-1', seed: 5 });
    logger.warn('c');
    logger.error('d', { ok: false, nothing: null });
    expect(logger.entries()).toEqual([
      { t: 100, level: 'debug', event: 'a' },
      { t: 101, level: 'info', event: 'level.start', data: { levelId: 'level-1', seed: 5 } },
      { t: 102, level: 'warn', event: 'c' },
      { t: 103, level: 'error', event: 'd', data: { ok: false, nothing: null } },
    ]);
    expect(seen).toHaveLength(4);
  });

  it('keeps only the newest entries once the ring buffer is full', () => {
    const logger = createLogger({ now: () => 0 });
    for (let i = 0; i < DEFAULT_CAPACITY + 25; i++) logger.info('tick', { i });
    const entries = logger.entries();
    expect(entries).toHaveLength(300);
    expect(entries[0]?.data).toEqual({ i: 25 });
    expect(entries.at(-1)?.data).toEqual({ i: 324 });
  });

  it('honours a custom capacity', () => {
    const logger = createLogger({ now: () => 0, capacity: 2 });
    ['a', 'b', 'c'].forEach((e) => logger.info(e));
    expect(logger.entries().map((e) => e.event)).toEqual(['b', 'c']);
  });

  it('drops objects, undefined and non-finite numbers and shortens long strings', () => {
    const logger = createLogger({ now: () => 0 });
    logger.info('x', {
      person: { name: 'Anna' },
      missing: undefined,
      bad: Number.NaN,
      long: 'a'.repeat(1000),
    } as unknown as LogData);
    const data = logger.entries()[0]?.data ?? {};
    expect(Object.keys(data)).toEqual(['long']);
    expect(String(data.long)).toHaveLength(300);
    logger.info('y', { only: undefined });
    expect(logger.entries()[1]).toEqual({ t: 0, level: 'info', event: 'y' });
  });

  it('survives a reload through the persistence', () => {
    const persistence = memoryPersistence();
    const first = createLogger({ now: () => 1, persistence });
    first.info('before.reload', { step: 2 });
    const second = createLogger({ now: () => 2, persistence });
    second.info('after.reload');
    expect(second.entries().map((e) => e.event)).toEqual(['before.reload', 'after.reload']);
  });

  it('trims a restored log to the capacity', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ t: i, level: 'info', event: `e${i}` }));
    const logger = createLogger({
      now: () => 0,
      capacity: 3,
      persistence: memoryPersistence(JSON.stringify(many)),
    });
    expect(logger.entries().map((e) => e.event)).toEqual(['e7', 'e8', 'e9']);
  });

  it.each([
    ['broken JSON', '[{'],
    ['not a list', '{"t":1}'],
    ['an entry without event', '[{"t":1,"level":"info"}]'],
    ['an unknown level', '[{"t":1,"level":"loud","event":"x"}]'],
    ['nested data', '[{"t":1,"level":"info","event":"x","data":{"a":{"b":1}}}]'],
    ['data that is not an object', '[{"t":1,"level":"info","event":"x","data":"text"}]'],
    ['an entry that is null', '[null]'],
  ])('starts empty and says so if the stored log is %s', (_name, stored) => {
    const logger = createLogger({ now: () => 0, persistence: memoryPersistence(stored) });
    expect(logger.entries().map((e) => e.event)).toEqual(['log.restore.invalid']);
  });

  it('logs once and carries on if reading the stored log fails', () => {
    const persistence: LogPersistence = {
      load: () => {
        throw new Error('blocked');
      },
      save: () => {
        throw new Error('must not be called after a failed load');
      },
    };
    const logger = createLogger({ now: () => 0, persistence });
    logger.info('next');
    expect(logger.entries().map((e) => e.event)).toEqual(['log.restore.failed', 'next']);
  });

  it('stops persisting after the first failed write and records why', () => {
    let calls = 0;
    const persistence: LogPersistence = {
      load: () => null,
      save: () => {
        calls += 1;
        throw new Error('quota');
      },
    };
    const logger = createLogger({ now: () => 0, persistence });
    logger.info('one');
    logger.info('two');
    expect(calls).toBe(1);
    expect(logger.entries()).toMatchObject([
      { event: 'one' },
      { event: 'log.persist.failed', level: 'warn', data: { error: 'Error', message: 'quota' } },
      { event: 'two' },
    ]);
  });

  it('turns any thrown value into loggable fields', () => {
    expect(errorData(new TypeError('boom'))).toEqual({ error: 'TypeError', message: 'boom' });
    expect(errorData('plain')).toEqual({ error: 'NonError', message: 'plain' });
  });
});

describe('error report (L-05 to L-07)', () => {
  const level = makeLevel();
  const choices: OptionId[] = ['A', 'B', 'C', 'A'];
  const run = replay(level, 424242, ['L1-S02'], choices);

  const input: ReportInput = {
    version: '0.1.0',
    commit: 'abc1234',
    time: '2026-11-23T20:00:00.000Z',
    userAgent: 'TestBrowser/1.0 (Phone)',
    viewport: { width: 390, height: 844 },
    renderer: '3d',
    playTimeMs: 754_000,
    levels: [{ id: 'level-1', completed: true, stars: 2, attempts: 3 }],
    run: {
      levelId: run.levelId,
      seed: run.seed,
      recentIds: run.recentIds,
      choices: run.history.map((c) => c.optionId),
      phase: run.phase,
      outcome: run.outcome,
      gauges: { ...run.gauges },
    },
    entries: [
      { t: 1, level: 'info', event: 'level.start', data: { levelId: 'level-1', seed: 424242 } },
      { t: 2, level: 'error', event: 'app.fatal' },
    ],
  };

  it('contains version, commit, time, device, window, renderer, state and log', () => {
    const report = buildErrorReport(input);
    for (const expected of [
      REPORT_TITLE,
      'Version: 0.1.0 (abc1234)',
      'Zeitpunkt: 2026-11-23T20:00:00.000Z',
      'Browser: TestBrowser/1.0 (Phone)',
      'Fenster: 390x844',
      'Grafikmodus: 3d',
      'Spielzeit: 12 min 34 s',
      'level-1: abgeschlossen, Sterne 2, Versuche 3',
      'Aktueller Durchgang: level-1, Phase situation, Ergebnis running',
      `Anzeigen: budget=${run.gauges.budget}, zeit=${run.gauges.zeit}, stabilitaet=${run.gauges.stabilitaet}`,
      '"seed":424242',
      '"choices":["A","B","C","A"]',
      'Letzte Log-Einträge (2):',
      '1 info level.start {"levelId":"level-1","seed":424242}',
      '2 error app.fatal',
    ]) {
      expect(report).toContain(expected);
    }
  });

  it('lets the run be rebuilt from the report alone (L-07)', () => {
    const data = extractReplay(buildErrorReport(input));
    expect(data).toEqual({ levelId: 'level-1', seed: 424242, recentIds: ['L1-S02'], choices });
    const rebuilt = replay(level, data!.seed, data!.recentIds, data!.choices as OptionId[]);
    expect(rebuilt).toEqual(run);
  });

  it('handles a report without a run or any progress', () => {
    const report = buildErrorReport({ ...input, run: null, levels: [], entries: [] });
    expect(report).toContain('Aktueller Durchgang: keiner');
    expect(report).toContain('(noch nichts gespielt)');
    expect(report).toContain('Letzte Log-Einträge (0):');
    expect(extractReplay(report)).toBeNull();
  });

  it('marks an open level as open', () => {
    const report = buildErrorReport({
      ...input,
      levels: [{ id: 'level-2', completed: false, stars: 0, attempts: 1 }],
    });
    expect(report).toContain('level-2: offen, Sterne 0, Versuche 1');
  });

  it('contains no personal data: logged objects never reach the report (L-06)', () => {
    const logger = createLogger({ now: () => 0 });
    logger.info('form.submitted', {
      user: { name: 'Anna Muster', mail: 'anna@example.org' },
    } as unknown as LogData);
    const report = buildErrorReport({ ...input, entries: logger.entries() });
    expect(report).not.toContain('Anna');
    expect(report).not.toContain('example.org');
    expect(report).not.toMatch(/https?:\/\//);
  });

  it.each([
    ['cut-off JSON', 'REPLAY: {"levelId":"level-1","seed":'],
    ['a list instead of an object', 'REPLAY: [1,2]'],
    ['null', 'REPLAY: null'],
    [
      'a seed that is not a number',
      'REPLAY: {"levelId":"level-1","seed":"7","recentIds":[],"choices":[]}',
    ],
    ['a missing level', 'REPLAY: {"seed":7,"recentIds":[],"choices":[]}'],
    [
      'choices that are not text',
      'REPLAY: {"levelId":"level-1","seed":7,"recentIds":[],"choices":[1]}',
    ],
    [
      'recent ids that are no list',
      'REPLAY: {"levelId":"level-1","seed":7,"recentIds":"x","choices":[]}',
    ],
  ])('returns no replay data for %s', (_name, line) => {
    expect(extractReplay(`${REPORT_TITLE}\n${line}\n`)).toBeNull();
  });

  it('formats durations and never shows negative time', () => {
    expect(formatDuration(0)).toBe('0 min 0 s');
    expect(formatDuration(59_600)).toBe('1 min 0 s');
    expect(formatDuration(-500)).toBe('0 min 0 s');
  });
});
