import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { replay, startRun, step } from '../../src/core/game.ts';
import { emptyProgress, finishRun, withRun } from '../../src/core/progress.ts';
import { createLogger } from '../../src/logging/logger.ts';
import {
  createLocalStorageStore,
  createLogPersistence,
  LOG_KEY,
  PROGRESS_KEY,
} from '../../src/storage/local-storage-store.ts';
import { makeLevel, memoryStorage } from './fixtures.ts';

const level = makeLevel();

// Stored data is untyped by nature; these tests break it in ways the types would forbid.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

function setup(storage: Storage) {
  const logger = createLogger({ now: () => 0 });
  const store = createLocalStorageStore(() => storage, logger);
  const events = () => logger.entries().map((e) => e.event);
  return { store, events, logger };
}

function sampleProgress() {
  const done = replay(level, 4, [], ['A', 'A', 'A', 'A', 'A', 'A']);
  let run = startRun(level, 77, { recentIds: done.situationIds, canSkipTheory: true });
  run = step(run, level, { type: 'skipTheory' });
  run = step(run, level, { type: 'choose', optionId: 'B' });
  return withRun(finishRun(emptyProgress(), done, level), run);
}

describe('LocalStorageStore (F-701 to F-704)', () => {
  it('starts fresh when nothing is stored', () => {
    const { store, events } = setup(memoryStorage());
    expect(store.load()).toEqual({ status: 'empty', progress: emptyProgress() });
    expect(events()).toContain('storage.load.empty');
  });

  it('loads exactly what was saved, including a run in the middle of a level', () => {
    const { store } = setup(memoryStorage());
    const progress = sampleProgress();
    expect(store.save(progress)).toBe(true);
    expect(store.load()).toEqual({ status: 'ok', progress });
  });

  it('starts fresh with a hint if the stored text is not JSON', () => {
    const { store, events } = setup(memoryStorage({ [PROGRESS_KEY]: '{"version":3,' }));
    expect(store.load()).toEqual({ status: 'invalid', progress: emptyProgress() });
    expect(events()).toContain('storage.load.invalid');
  });

  it.each([
    ['a gauge out of range', (p: Loose) => void (p.levels['level-1'].best.gauges.budget = 250)],
    ['an unknown field', (p: Loose) => void (p.hacked = '<script>')],
    ['a wrong type', (p: Loose) => void (p.playTimeMs = 'lange')],
    ['an unknown rating', (p: Loose) => void (p.levels['level-1'].best.floors[0].rating = 'super')],
    ['a missing field', (p: Loose) => void delete p.levels['level-1'].attempts],
  ])('rejects a stored progress with %s', (_name, mutate) => {
    const data = JSON.parse(JSON.stringify(sampleProgress())) as Loose;
    mutate(data);
    const { store, logger } = setup(memoryStorage({ [PROGRESS_KEY]: JSON.stringify(data) }));
    expect(store.load()).toEqual({ status: 'invalid', progress: emptyProgress() });
    // The warning is followed by the entry about the replacement (A4), so look it up by name.
    expect(logger.entries().find((e) => e.event === 'storage.load.invalid')).toMatchObject({
      level: 'warn',
      data: { reason: 'schema' },
    });
  });

  it.each([
    ['a gauge out of range', (p: Loose) => void (p.currentRun.gauges.budget = 250)],
    ['an unknown option id', (p: Loose) => void (p.currentRun.history[0].optionId = 'Z')],
  ])(
    'gives up only the level in play if it holds %s, and keeps what was finished',
    (_name, mutate) => {
      const good = sampleProgress();
      const data = JSON.parse(JSON.stringify(good)) as Loose;
      mutate(data);
      const { store } = setup(memoryStorage({ [PROGRESS_KEY]: JSON.stringify(data) }));
      expect(store.load()).toEqual({
        status: 'migrated',
        droppedRun: true,
        progress: { ...good, currentRun: null },
      });
    },
  );

  it('rejects stored values that are not an object at all', () => {
    for (const stored of ['null', '"text"', '[]', '42']) {
      const { store } = setup(memoryStorage({ [PROGRESS_KEY]: stored }));
      expect(store.load().status).toBe('invalid');
    }
  });

  it('recognises a progress from another version and starts fresh', () => {
    const old = JSON.stringify({ version: 0, levels: {}, done: [1, 2] });
    const { store, logger } = setup(memoryStorage({ [PROGRESS_KEY]: old }));
    expect(store.load()).toEqual({ status: 'outdated', progress: emptyProgress() });
    expect(logger.entries().find((e) => e.event === 'storage.load.outdated')?.data).toEqual({
      found: 0,
      expected: 3,
    });
  });

  it('treats a progress saved before the balance change as outdated', () => {
    const old = JSON.stringify({ version: 1, levels: {}, currentRun: null, playTimeMs: 0 });
    const { store } = setup(memoryStorage({ [PROGRESS_KEY]: old }));
    expect(store.load().status).toBe('outdated');
  });

  it('keeps the game running if the browser blocks storage (private mode)', () => {
    const logger = createLogger({ now: () => 0 });
    const store = createLocalStorageStore(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    }, logger);
    expect(store.load()).toEqual({ status: 'unavailable', progress: emptyProgress() });
    expect(store.save(emptyProgress())).toBe(false);
    expect(store.clear()).toBe(false);
    expect(logger.entries().map((e) => e.event)).toEqual([
      'storage.load.unavailable',
      'storage.save.failed',
      'storage.clear.failed',
    ]);
  });

  it('reports a full storage instead of throwing', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
    const { store, logger } = setup(storage);
    expect(store.save(sampleProgress())).toBe(false);
    expect(logger.entries().at(-1)).toMatchObject({
      level: 'warn',
      event: 'storage.save.failed',
      data: { error: 'QuotaExceededError' },
    });
  });

  it('clears the stored progress (F-705)', () => {
    const storage = memoryStorage();
    const { store } = setup(storage);
    store.save(sampleProgress());
    expect(store.clear()).toBe(true);
    expect(storage.getItem(PROGRESS_KEY)).toBeNull();
    expect(store.load().status).toBe('empty');
  });
});

describe('replacing a broken progress (A4)', () => {
  it.each([
    ['damaged', '{"version":3,'],
    ['of the wrong shape', '{"version":3,"levels":"x","currentRun":null,"playTimeMs":0}'],
    ['outdated', '{"version":1,"levels":{},"currentRun":null,"playTimeMs":0}'],
  ])('writes a fresh progress at once when the stored one is %s', (_name, stored) => {
    const storage = memoryStorage({ [PROGRESS_KEY]: stored });
    const { store, events } = setup(storage);
    expect(store.load().status).not.toBe('ok');
    expect(JSON.parse(storage.getItem(PROGRESS_KEY) ?? '')).toEqual(emptyProgress());
    // The next visit finds a valid state: no second hint, no second warning in the log.
    expect(store.load()).toEqual({ status: 'ok', progress: emptyProgress() });
    expect(
      events()
        .filter((e) => e.startsWith('storage.load.'))
        .slice(-1),
    ).toEqual(['storage.load.ok']);
    expect(events()).toContain('storage.load.replaced');
  });

  it('still reports the broken state if the replacement cannot be written', () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: 'kaputt' });
    storage.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
    const { store, events } = setup(storage);
    expect(store.load()).toEqual({ status: 'invalid', progress: emptyProgress() });
    expect(events()).toContain('storage.save.failed');
    expect(events()).not.toContain('storage.load.replaced');
  });

  it('leaves an untouched storage untouched', () => {
    const storage = memoryStorage();
    setup(storage).store.load();
    expect(storage.getItem(PROGRESS_KEY)).toBeNull();
  });
});

describe('migration to version 3 (update 3)', () => {
  // A real state as version 2 of the game wrote it: two finished levels, a third in play.
  const v2 = readFileSync(join(import.meta.dirname, 'data', 'progress-v2.json'), 'utf8');

  it('keeps finished levels, stars and play time and gives up the level in play, saying so', () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: v2 });
    const { store, events } = setup(storage);
    const outcome = store.load();
    expect(outcome.status).toBe('migrated');
    expect(outcome.droppedRun).toBe(true);
    expect(outcome.progress.version).toBe(3);
    expect(outcome.progress.currentRun).toBeNull();
    expect(outcome.progress.playTimeMs).toBe(754000);
    expect(outcome.progress.levels['level-1']).toMatchObject({
      completed: true,
      best: { stars: 3 },
    });
    expect(outcome.progress.levels['level-2']?.best?.floors).toHaveLength(8);
    expect(outcome.progress.levels['level-3']).toMatchObject({
      completed: false,
      theorySeen: true,
    });
    expect(events()).toContain('storage.load.migrated');

    // The migrated state is written at once: the next visit loads it without another hint.
    expect(JSON.parse(storage.getItem(PROGRESS_KEY) ?? '').version).toBe(3);
    expect(store.load()).toEqual({ status: 'ok', progress: outcome.progress });
  });

  it('migrates silently when no level was in play', () => {
    const state = JSON.parse(v2) as Loose;
    state.currentRun = null;
    const { store } = setup(memoryStorage({ [PROGRESS_KEY]: JSON.stringify(state) }));
    expect(store.load()).toMatchObject({ status: 'migrated', droppedRun: false });
  });

  it('starts fresh if the old state is damaged beyond its level in play', () => {
    const state = JSON.parse(v2) as Loose;
    state.levels['level-1'].best.stars = 9;
    const { store } = setup(memoryStorage({ [PROGRESS_KEY]: JSON.stringify(state) }));
    expect(store.load()).toEqual({ status: 'outdated', progress: emptyProgress() });
  });

  it('salvages the finished levels of a current state whose level in play cannot be read', () => {
    const state = JSON.parse(v2) as Loose;
    state.version = 3;
    state.currentRun.phase = 'somewhere';
    const { store, events } = setup(memoryStorage({ [PROGRESS_KEY]: JSON.stringify(state) }));
    const outcome = store.load();
    expect(outcome).toMatchObject({ status: 'migrated', droppedRun: true });
    expect(outcome.progress.levels['level-2']?.completed).toBe(true);
    expect(events()).toContain('storage.load.salvaged');
  });

  it('does not salvage a state that is broken elsewhere', () => {
    const state = JSON.parse(v2) as Loose;
    state.version = 3;
    state.currentRun = null;
    state.playTimeMs = -5;
    const { store } = setup(memoryStorage({ [PROGRESS_KEY]: JSON.stringify(state) }));
    expect(store.load().status).toBe('invalid');
  });
});

describe('log persistence', () => {
  it('reads and writes the log under its own key', () => {
    const storage = memoryStorage();
    const persistence = createLogPersistence(() => storage);
    expect(persistence.load()).toBeNull();
    persistence.save('[]');
    expect(storage.getItem(LOG_KEY)).toBe('[]');
    expect(persistence.load()).toBe('[]');
  });
});
