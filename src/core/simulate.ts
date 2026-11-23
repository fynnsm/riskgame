import type { Level, Option, Rating, Situation } from '../content/schema.ts';
import { BALANCE } from './balance.ts';
import type { ChoiceRecord, Outcome } from './game.ts';
import { applyEffects, isCollapsed, lowestValue, startGauges } from './gauges.ts';
import type { Rng } from './rng.ts';
import { createRng, shuffle } from './rng.ts';
import type { Stars } from './scoring.ts';
import { scoreRatio, starsFor } from './scoring.ts';

export interface StrategyResult {
  outcome: Exclude<Outcome, 'running'>;
  lowest: number;
  stars: Stars;
}

export interface BalanceReport {
  levelId: string;
  /** Number of draws checked for the two fixed strategies. */
  runs: number;
  /** Draws in which choosing only good options did not pass. Must be 0 (F-907). */
  goodFailures: number;
  /** Draws in which choosing only risky options passed. Must be 0 (F-907). */
  riskyPasses: number;
  /** Lowest gauge value any all-good run ended with. */
  goodLowest: number;
  /** Fewest stars any all-good run earned. */
  goodMinStars: Stars;
  /** Share of runs a player passes who picks at random. Must stay low (F-909). */
  randomPassRate: number;
  /** Share of random runs that end in a collapse. */
  randomCollapseRate: number;
}

/** Plays the given situations in order with the option the chooser returns. */
export function playRun(
  situations: readonly Situation[],
  choose: (situation: Situation) => Option,
): StrategyResult {
  let gauges = startGauges();
  const history: ChoiceRecord[] = [];
  for (const situation of situations) {
    const option = choose(situation);
    const applied = applyEffects(gauges, option.wirkung);
    gauges = applied.gauges;
    history.push({
      situationId: situation.id,
      optionId: option.id,
      rating: option.einstufung,
      delta: applied.delta,
      gaugesAfter: gauges,
    });
    if (isCollapsed(gauges)) return { outcome: 'collapsed', lowest: 0, stars: 0 };
  }
  const accepted = scoreRatio(history) >= BALANCE.acceptance.minScoreRatio;
  const outcome = accepted ? 'completed' : 'rejected';
  return { outcome, lowest: lowestValue(gauges), stars: starsFor({ outcome, history, gauges }) };
}

/** Always takes the first option with the given rating. */
export function playStrategy(situations: readonly Situation[], rating: Rating): StrategyResult {
  return playRun(situations, (situation) => {
    const option = situation.optionen.find((o) => o.einstufung === rating);
    if (!option) throw new Error(`${situation.id} has no option rated ${rating}`);
    return option;
  });
}

/** Every way to pick `size` items, keeping their order. */
export function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (size > items.length) return [];
  const [first, ...rest] = items as [T, ...T[]];
  const withFirst = combinations(rest, size - 1).map((combo) => [first, ...combo]);
  return [...withFirst, ...combinations(rest, size)];
}

/** A player who does not read: random draw, random option each time. */
export function playRandom(level: Level, rng: Rng): StrategyResult {
  const drawn = shuffle(level.situationen, rng).slice(0, level.situationenProDurchgang);
  return playRun(drawn, (situation) => {
    const index = Math.floor(rng() * situation.optionen.length);
    return situation.optionen[index] as Option;
  });
}

/**
 * F-907: checks every possible draw, each in pool order and reversed, because clamping
 * at 100 makes the result depend on the order. F-909: estimates how a random player fares.
 */
export function simulateLevel(level: Level): BalanceReport {
  const report: BalanceReport = {
    levelId: level.id,
    runs: 0,
    goodFailures: 0,
    riskyPasses: 0,
    goodLowest: 100,
    goodMinStars: 3,
    randomPassRate: 0,
    randomCollapseRate: 0,
  };
  for (const draw of combinations(level.situationen, level.situationenProDurchgang)) {
    for (const order of [draw, [...draw].reverse()]) {
      report.runs += 1;
      const good = playStrategy(order, 'gut');
      if (good.outcome !== 'completed') report.goodFailures += 1;
      report.goodLowest = Math.min(report.goodLowest, good.lowest);
      if (good.stars < report.goodMinStars) report.goodMinStars = good.stars;
      if (playStrategy(order, 'riskant').outcome === 'completed') report.riskyPasses += 1;
    }
  }

  const { randomRuns, randomSeed } = BALANCE.checks;
  const rng = createRng(randomSeed);
  let passes = 0;
  let collapses = 0;
  for (let i = 0; i < randomRuns; i++) {
    const result = playRandom(level, rng);
    if (result.outcome === 'completed') passes += 1;
    if (result.outcome === 'collapsed') collapses += 1;
  }
  report.randomPassRate = passes / randomRuns;
  report.randomCollapseRate = collapses / randomRuns;
  return report;
}

/** The balance holds if careful play always passes and careless play almost never does. */
export function isBalanced(report: BalanceReport): boolean {
  return (
    report.runs > 0 &&
    report.goodFailures === 0 &&
    report.riskyPasses === 0 &&
    report.randomPassRate <= BALANCE.checks.maxRandomPassRate
  );
}
