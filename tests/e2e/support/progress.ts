import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { Level, OptionId, Rating } from '../../../src/content/schema.ts';
import type { LevelRun } from '../../../src/core/game.ts';
import { replay, startRun, step } from '../../../src/core/game.ts';
import type { Progress } from '../../../src/core/progress.ts';
import { clearRun, emptyProgress, finishRun, withRun } from '../../../src/core/progress.ts';

/**
 * Test access to any game state without clicking through it (B8.2): the tests build a
 * progress with the same logic the game uses and put it into the browser's storage.
 */

export const STORAGE_KEY = 'risk-tower.progress';

export function readLevel(nummer: number): Level {
  const file = join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'content',
    'levels',
    `level-${nummer}.json`,
  );
  return JSON.parse(readFileSync(file, 'utf8')) as Level;
}

export const LEVELS: Level[] = [1, 2, 3, 4, 5].map(readLevel);

/** The option IDs that follow the given ratings for a run with this seed. */
export function choicesFor(level: Level, seed: number, ratings: readonly Rating[]): OptionId[] {
  const run = startRun(level, seed);
  return ratings.map((rating, i) => {
    const situation = level.situationen.find((s) => s.id === run.situationIds[i]);
    const option = situation?.optionen.find((o) => o.einstufung === rating);
    if (!option) throw new Error(`No ${rating} option in situation ${i} of ${level.id}`);
    return option.id;
  });
}

export function runWith(level: Level, seed: number, ratings: readonly Rating[]): LevelRun {
  return replay(level, seed, [], choicesFor(level, seed, ratings));
}

const ALL_GOOD: Rating[] = Array.from({ length: 8 }, () => 'gut');

/** Levels 1 to `count` completed, each with the given ratings (default: all good, three stars). */
export function progressWithCompleted(
  count: number,
  ratings: readonly Rating[] = ALL_GOOD,
): Progress {
  let progress = emptyProgress();
  for (const level of LEVELS.slice(0, count)) {
    const run = runWith(level, 1000 + level.nummer, ratings);
    if (run.outcome !== 'completed')
      throw new Error(`${level.id} did not complete with these ratings`);
    progress = clearRun(finishRun(progress, run, level));
  }
  return progress;
}

/** A run of the given level that stands in front of situation `decisions + 1`. */
export function progressInLevel(nummer: number, ratings: readonly Rating[], seed = 77): Progress {
  const level = LEVELS[nummer - 1] as Level;
  let run = startRun(level, seed, { canSkipTheory: true });
  run = step(run, level, { type: 'skipTheory' });
  const choices = choicesFor(level, seed, ratings);
  choices.forEach((optionId, i) => {
    run = step(run, level, { type: 'choose', optionId });
    if (i < choices.length - 1 || run.outcome === 'running')
      run = step(run, level, { type: 'continue' });
  });
  return withRun(progressWithCompleted(nummer - 1), run);
}

/** Stores the progress before the app starts and opens the page. */
export async function openWith(page: Page, url: string, progress: Progress): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      // Only on the first load of the test: a reload must see what the game saved meanwhile.
      if (window.sessionStorage.getItem('test-seeded')) return;
      window.sessionStorage.setItem('test-seeded', '1');
      window.localStorage.setItem(key as string, value as string);
    },
    [STORAGE_KEY, JSON.stringify(progress)],
  );
  await page.goto(url);
}

const RATINGS: readonly Rating[] = ['gut', 'vertretbar', 'riskant'];

/**
 * The shortest sequence of decisions in the given level after which `wanted` holds.
 * Finished runs are taken on to the result screen. Searching instead of hard-coding
 * keeps these tests valid when the content or the balance changes.
 */
export function progressWhere(
  nummer: number,
  wanted: (run: LevelRun) => boolean,
  seed = 77,
): Progress {
  const level = LEVELS[nummer - 1] as Level;
  const base = step(startRun(level, seed, { canSkipTheory: true }), level, { type: 'skipTheory' });
  let frontier: { run: LevelRun; ratings: Rating[] }[] = [{ run: base, ratings: [] }];
  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const { run, ratings } of frontier) {
      if (wanted(run)) return withRun(progressWithCompleted(nummer - 1), run);
      if (run.phase !== 'situation') continue;
      for (const rating of RATINGS) {
        const situation = level.situationen.find((s) => s.id === run.situationIds[run.step]);
        const option = situation?.optionen.find((o) => o.einstufung === rating);
        if (!option) continue;
        let after = step(run, level, { type: 'choose', optionId: option.id });
        after = step(after, level, { type: 'continue' });
        next.push({ run: after, ratings: [...ratings, rating] });
      }
    }
    frontier = next;
  }
  throw new Error(`No sequence of decisions in level ${nummer} leads to the wanted state`);
}

/** A run of the given level that stands in front of the wanted situation as its first one. */
export function progressAtSituation(nummer: number, situationId: string): Progress {
  const level = LEVELS[nummer - 1] as Level;
  for (let seed = 1; seed < 2000; seed++) {
    const run = startRun(level, seed, { canSkipTheory: true });
    if (run.situationIds[0] !== situationId) continue;
    return withRun(progressWithCompleted(nummer - 1), step(run, level, { type: 'skipTheory' }));
  }
  throw new Error(`No seed puts ${situationId} first`);
}

/** The situation with the most text above its options: situation, prompt and answer. */
export function longestSituation(nummer: number): string {
  const level = LEVELS[nummer - 1] as Level;
  const length = (s: Level['situationen'][number]): number =>
    s.situation.length + (s.aiAusgabe ? s.aiAusgabe.prompt.length + s.aiAusgabe.antwort.length : 0);
  return [...level.situationen].sort((a, b) => length(b) - length(a))[0]?.id ?? '';
}
