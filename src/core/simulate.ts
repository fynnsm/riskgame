import type { Level, Option, Rating, Situation } from '../content/schema.ts';
import { BALANCE } from './balance.ts';
import type { ChoiceRecord, Outcome } from './game.ts';
import type { Gauges } from './gauges.ts';
import { applyEffects, isCollapsed, lowestValue, startGauges } from './gauges.ts';
import { computeLean } from './lean.ts';
import type { Rng } from './rng.ts';
import { createRng, shuffle } from './rng.ts';
import type { Stars } from './scoring.ts';
import { scoreRatio, starsFor } from './scoring.ts';

export interface StrategyResult {
  outcome: Exclude<Outcome, 'running'>;
  /** Number of decisions taken; smaller than the run length after a collapse. */
  steps: number;
  gauges: Gauges;
  lowest: number;
  /** Tilt of the building at the end, 0 to 1. */
  tilt: number;
  stars: Stars;
}

export interface BalanceReport {
  levelId: string;
  /** Number of draws checked for each fixed strategy. */
  runs: number;
  good: {
    /** Draws that did not end in an accepted building. */
    failures: number;
    /** Lowest gauge value any draw ended with. */
    lowest: number;
    /** Strongest final tilt of any draw, 0 to 1. */
    maxTilt: number;
    minStars: Stars;
  };
  /** Only "vertretbar" options. */
  okay: { collapses: number; passes: number };
  risky: {
    passes: number;
    /** The latest decision at which any draw collapsed; null if a draw never collapsed. */
    latestCollapse: number | null;
  };
  random: { passRate: number; collapseRate: number; failRate: number };
}

export type BalanceProblem =
  | 'good-fails'
  | 'good-low'
  | 'good-tilt'
  | 'okay-collapses'
  | 'okay-passes'
  | 'risky-passes'
  | 'risky-late'
  | 'random-passes'
  | 'random-range';

/**
 * Rules that already hold and stop the build. The others were added with finding A1 and
 * become binding once the effect values of the content have been corrected.
 */
export const BINDING_PROBLEMS: readonly BalanceProblem[] = [
  'good-fails',
  'risky-passes',
  'random-passes',
];

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
    if (isCollapsed(gauges)) {
      return { outcome: 'collapsed', steps: history.length, gauges, lowest: 0, tilt: 1, stars: 0 };
    }
  }
  const accepted = scoreRatio(history) >= BALANCE.acceptance.minScoreRatio;
  const outcome = accepted ? 'completed' : 'rejected';
  return {
    outcome,
    steps: history.length,
    gauges,
    lowest: lowestValue(gauges),
    tilt: computeLean(gauges).tilt,
    stars: starsFor({ outcome, history, gauges }),
  };
}

/**
 * Always takes the first option with the given rating. A situation need not have a
 * "vertretbar" option; the cautious player then takes the good one.
 */
export function playStrategy(situations: readonly Situation[], rating: Rating): StrategyResult {
  return playRun(situations, (situation) => {
    const wanted = situation.optionen.find((o) => o.einstufung === rating);
    const fallback =
      rating === 'vertretbar' ? situation.optionen.find((o) => o.einstufung === 'gut') : undefined;
    const option = wanted ?? fallback;
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
 * Checks every possible draw, each in pool order and reversed, because clamping at 100
 * makes the result depend on the order. The random player is estimated from seeded runs.
 */
export function simulateLevel(level: Level): BalanceReport {
  const report: BalanceReport = {
    levelId: level.id,
    runs: 0,
    good: { failures: 0, lowest: 100, maxTilt: 0, minStars: 3 },
    okay: { collapses: 0, passes: 0 },
    risky: { passes: 0, latestCollapse: 0 },
    random: { passRate: 0, collapseRate: 0, failRate: 0 },
  };
  for (const draw of combinations(level.situationen, level.situationenProDurchgang)) {
    for (const order of [draw, [...draw].reverse()]) {
      report.runs += 1;

      const good = playStrategy(order, 'gut');
      if (good.outcome !== 'completed') report.good.failures += 1;
      report.good.lowest = Math.min(report.good.lowest, good.lowest);
      report.good.maxTilt = Math.max(report.good.maxTilt, good.tilt);
      if (good.stars < report.good.minStars) report.good.minStars = good.stars;

      const okay = playStrategy(order, 'vertretbar');
      if (okay.outcome === 'collapsed') report.okay.collapses += 1;
      if (okay.outcome === 'completed') report.okay.passes += 1;

      const risky = playStrategy(order, 'riskant');
      if (risky.outcome === 'completed') report.risky.passes += 1;
      if (risky.outcome !== 'collapsed') report.risky.latestCollapse = null;
      else if (report.risky.latestCollapse !== null) {
        report.risky.latestCollapse = Math.max(report.risky.latestCollapse, risky.steps);
      }
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
  report.random = {
    passRate: passes / randomRuns,
    collapseRate: collapses / randomRuns,
    failRate: 1 - passes / randomRuns,
  };
  return report;
}

/** Every rule the level breaks. Empty means: the balance holds. */
export function balanceProblems(report: BalanceReport): BalanceProblem[] {
  const c = BALANCE.checks;
  const problems: BalanceProblem[] = [];
  if (report.runs === 0 || report.good.failures > 0) problems.push('good-fails');
  if (report.good.lowest < c.goodMinGauge) problems.push('good-low');
  if (report.good.maxTilt > c.goodMaxTilt) problems.push('good-tilt');
  if (report.okay.collapses > 0) problems.push('okay-collapses');
  if (report.okay.passes > 0) problems.push('okay-passes');
  if (report.risky.passes > 0) problems.push('risky-passes');
  if (report.risky.latestCollapse === null || report.risky.latestCollapse > c.riskyCollapseBy) {
    problems.push('risky-late');
  }
  if (report.random.passRate > c.maxRandomPassRate) problems.push('random-passes');
  if (report.random.failRate < c.randomFailMin || report.random.failRate > c.randomFailMax) {
    problems.push('random-range');
  }
  return problems;
}

/** True if no binding rule is broken; with `strict`, if no rule at all is broken. */
export function isBalanced(report: BalanceReport, strict = false): boolean {
  const problems = balanceProblems(report);
  return strict
    ? problems.length === 0
    : problems.every((problem) => !BINDING_PROBLEMS.includes(problem));
}
