import type { Level, Rating, Situation } from '../content/schema.ts';
import type { ChoiceRecord } from './game.ts';
import { applyEffects, isCollapsed, lowestValue, startGauges } from './gauges.ts';
import type { Stars } from './scoring.ts';
import { starsFor } from './scoring.ts';

export interface StrategyResult {
  survived: boolean;
  lowest: number;
  stars: Stars;
}

export interface BalanceReport {
  levelId: string;
  /** Number of simulated runs per strategy. */
  runs: number;
  /** Runs in which choosing only good options still collapsed. Must be 0 (F-907). */
  goodCollapses: number;
  /** Runs in which choosing only risky options survived. Must be 0 (F-907). */
  riskySurvivals: number;
  /** Lowest gauge value any all-good run ended with. */
  goodLowest: number;
  /** Fewest stars any all-good run earned. */
  goodMinStars: Stars;
}

/** Plays the given situations in order, always taking the first option with that rating. */
export function playStrategy(situations: readonly Situation[], rating: Rating): StrategyResult {
  let gauges = startGauges();
  const history: ChoiceRecord[] = [];
  for (const situation of situations) {
    const option = situation.optionen.find((o) => o.einstufung === rating);
    if (!option) throw new Error(`${situation.id} has no option rated ${rating}`);
    const applied = applyEffects(gauges, option.wirkung);
    gauges = applied.gauges;
    history.push({
      situationId: situation.id,
      optionId: option.id,
      rating,
      delta: applied.delta,
      gaugesAfter: gauges,
    });
    if (isCollapsed(gauges)) return { survived: false, lowest: 0, stars: 0 };
  }
  return {
    survived: true,
    lowest: lowestValue(gauges),
    stars: starsFor({ outcome: 'completed', history, gauges }),
  };
}

/** Every way to pick `size` items, keeping their order. */
export function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (size > items.length) return [];
  const [first, ...rest] = items as [T, ...T[]];
  const withFirst = combinations(rest, size - 1).map((combo) => [first, ...combo]);
  return [...withFirst, ...combinations(rest, size)];
}

/**
 * F-907: checks every possible draw, each in pool order and reversed,
 * because clamping at 100 makes the result depend on the order.
 */
export function simulateLevel(level: Level): BalanceReport {
  const report: BalanceReport = {
    levelId: level.id,
    runs: 0,
    goodCollapses: 0,
    riskySurvivals: 0,
    goodLowest: 100,
    goodMinStars: 3,
  };
  for (const draw of combinations(level.situationen, level.situationenProDurchgang)) {
    for (const order of [draw, [...draw].reverse()]) {
      report.runs += 1;
      const good = playStrategy(order, 'gut');
      if (!good.survived) report.goodCollapses += 1;
      report.goodLowest = Math.min(report.goodLowest, good.lowest);
      if (good.stars < report.goodMinStars) report.goodMinStars = good.stars;
      if (playStrategy(order, 'riskant').survived) report.riskySurvivals += 1;
    }
  }
  return report;
}
