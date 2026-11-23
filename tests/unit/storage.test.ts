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
    const { store, events } = setup(memoryStorage({ [PROGRESS_KEY]: '{"version":2,' }));
    expect(store.load()).toEqual({ status: 'invalid', progress: emptyProgress() });
    expect(events()).toContain('storage.load.invalid');
  });

  it.each([
    ['a gauge out of range', (p: Loose) => void (p.currentRun.gauges.budget = 250)],
    ['an unknown field', (p: Loose) => void (p.hacked = '<script>')],
    ['a wrong type', (p: Loose) => void (p.playTimeMs = 'lange')],
    ['an unknown option id', (p: Loose) => void (p.currentRun.history[0].optionId = 'Z')],
    ['a missing field', (p: Loose) => void delete p.levels['level-1'].attempts],
  ])('rejects a stored progress with %s', (_name, mutate) => {
    const data = JSON.parse(JSON.stringify(sampleProgress())) as Loose;
    mutate(data);
    const { store, logger } = setup(memoryStorage({ [PROGRESS_KEY]: JSON.stringify(data) }));
    expect(store.load()).toEqual({ status: 'invalid', progress: emptyProgress() });
    expect(logger.entries().at(-1)).toMatchObject({
      event: 'storage.load.invalid',
      data: { reason: 'schema' },
    });
  });

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
    expect(logger.entries().at(-1)?.data).toEqual({ found: 0, expected: 2 });
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
