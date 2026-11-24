import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { withoutEvents } from '../../../src/content/load.ts';
import type { Level, OptionId, Rating } from '../../../src/content/schema.ts';
import type { LevelRun } from '../../../src/core/game.ts';
import { startRun, step } from '../../../src/core/game.ts';
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
  // The app holds the events back until they have a screen; the tests play what the app plays.
  return withoutEvents(JSON.parse(readFileSync(file, 'utf8')) as Level);
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

/** How many places the tests judge rightly unless they say otherwise: a tour that changes nothing. */
export const TOUR_CORRECT = 6;

/**
 * Takes a run through its site tour, if the level has one: the first `correct` places in
 * the order shown are judged rightly, the rest wrongly. The page helper does the same.
 */
export function throughTour(run: LevelRun, level: Level, correct = TOUR_CORRECT): LevelRun {
  if (run.phase !== 'tour' || !run.tour) return run;
  let next = run;
  run.tour.siteIds.forEach((siteId, i) => {
    const truth = level.rundgang?.stellen.find((s) => s.id === siteId)?.istRisiko ?? false;
    next = step(next, level, { type: 'classify', siteId, risk: i < correct ? truth : !truth });
  });
  next = step(next, level, { type: 'finishTour' });
  return step(next, level, { type: 'continue' });
}

/** A run that stands in front of its first situation: theory skipped, tour done. */
export function started(level: Level, seed: number, correct = TOUR_CORRECT): LevelRun {
  const run = step(startRun(level, seed, { canSkipTheory: true }), level, { type: 'skipTheory' });
  return throughTour(run, level, correct);
}

/**
 * A run of level 1 in its site tour with the first `judged` places judged rightly; with
 * `finished` it stands on the resolution.
 */
export function progressInTour(judged: number, finished = false, seed = 77): Progress {
  const level = LEVELS[0] as Level;
  let run = step(startRun(level, seed, { canSkipTheory: true }), level, { type: 'skipTheory' });
  for (const siteId of (run.tour?.siteIds ?? []).slice(0, judged)) {
    const risk = level.rundgang?.stellen.find((s) => s.id === siteId)?.istRisiko ?? false;
    run = step(run, level, { type: 'classify', siteId, risk });
  }
  if (finished) run = step(run, level, { type: 'finishTour' });
  return withRun(emptyProgress(), run);
}

/** Plays the given options from the first situation on; stops when the level ends. */
export function played(
  level: Level,
  seed: number,
  choices: readonly OptionId[],
  correct = TOUR_CORRECT,
): LevelRun {
  let run = started(level, seed, correct);
  for (const optionId of choices) {
    if (run.phase !== 'situation') break;
    run = step(run, level, { type: 'choose', optionId });
    run = step(run, level, { type: 'continue' });
  }
  return run;
}

export function runWith(
  level: Level,
  seed: number,
  ratings: readonly Rating[],
  correct = TOUR_CORRECT,
): LevelRun {
  return played(level, seed, choicesFor(level, seed, ratings), correct);
}

const ALL_GOOD: Rating[] = Array.from({ length: 8 }, () => 'gut');

/**
 * Levels 1 to `count` completed, each with the given ratings (default: all good, three stars)
 * and, where a level has a site tour, that many places judged rightly.
 */
export function progressWithCompleted(
  count: number,
  ratings: readonly Rating[] = ALL_GOOD,
  correct = TOUR_CORRECT,
): Progress {
  let progress = emptyProgress();
  for (const level of LEVELS.slice(0, count)) {
    const run = runWith(level, 1000 + level.nummer, ratings, correct);
    if (run.outcome !== 'completed')
      throw new Error(`${level.id} did not complete with these ratings`);
    progress = clearRun(finishRun(progress, run, level));
  }
  return progress;
}

/** A run of the given level that stands in front of situation `decisions + 1`. */
export function progressInLevel(nummer: number, ratings: readonly Rating[], seed = 77): Progress {
  const level = LEVELS[nummer - 1] as Level;
  let run = started(level, seed);
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
  const base = started(level, seed);
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
    const run = started(level, seed);
    if (run.situationIds[0] !== situationId) continue;
    return withRun(progressWithCompleted(nummer - 1), run);
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

export interface LastStep {
  progress: Progress;
  /** Text of the option that ends the level in the wanted way. */
  option: string;
}

/** A state one decision before the level ends in the wanted way, and the option that does it. */
export function oneBefore(wanted: (run: LevelRun) => boolean, nummer = 1): LastStep {
  let option = '';
  const level = LEVELS[nummer - 1] as Level;
  const progress = progressWhere(nummer, (run) => {
    if (run.phase !== 'situation') return false;
    const situation = level.situationen.find((s) => s.id === run.situationIds[run.step]);
    const ending = situation?.optionen.find((candidate) => {
      let after = step(run, level, { type: 'choose', optionId: candidate.id });
      after = step(after, level, { type: 'continue' });
      return after.phase === 'result' && wanted(after);
    });
    if (ending) option = ending.text;
    return ending !== undefined;
  });
  return { progress, option };
}
