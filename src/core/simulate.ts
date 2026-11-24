import type { Level, Option, Rating, RiskEvent, Situation, StrategyId } from '../content/schema.ts';
import { STRATEGY_IDS } from '../content/schema.ts';
import { BALANCE } from './balance.ts';
import { availableStrategy, dueRound, findEvent, forecastOf, isRecommended } from './events.ts';
import type { ChoiceRecord, LevelRun, Outcome } from './game.ts';
import { currentOptions, startRun, step } from './game.ts';
import type { Gauges } from './gauges.ts';
import { applyEffects, criticalGauges, isCollapsed, lowestValue, startGauges } from './gauges.ts';
import { computeLean } from './lean.ts';
import type { Rng } from './rng.ts';
import { createRng, shuffle } from './rng.ts';
import type { Stars } from './scoring.ts';
import { isAccepted, starsFor } from './scoring.ts';
import type { TourGrade, TourState } from './tour.ts';
import { tourEffect, tourGrade, tourPoints } from './tour.ts';

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

/** A finished tour of the given grade, as far as scoring needs it. */
function tourOf(grade: TourGrade, gauges: Gauges): { tour: TourState; gauges: Gauges } {
  const applied = applyEffects(gauges, { budget: '0', zeit: '0', stabilitaet: tourEffect(grade) });
  return {
    gauges: applied.gauges,
    tour: {
      siteIds: [],
      judgements: {},
      result: { correct: 0, grade, points: tourPoints(grade), delta: applied.delta },
    },
  };
}

/**
 * Plays the given situations in order with the option the chooser returns. A level with a
 * site tour is played with the given grade of that tour; null means the level has none.
 */
export function playRun(
  situations: readonly Situation[],
  choose: (situation: Situation) => Option,
  grade: TourGrade | null = null,
): StrategyResult {
  const toured = grade === null ? null : tourOf(grade, startGauges());
  const tour = toured?.tour ?? null;
  let gauges = toured?.gauges ?? startGauges();
  const situationIds = situations.map((s) => s.id);
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
  const outcome = isAccepted({ history, situationIds, tour, events: null, eventPoints: 0 })
    ? 'completed'
    : 'rejected';
  return {
    outcome,
    steps: history.length,
    gauges,
    lowest: lowestValue(gauges),
    tilt: computeLean(gauges).tilt,
    stars: starsFor({
      outcome,
      history,
      gauges,
      situationIds,
      tour,
      events: null,
      eventPoints: 0,
    }),
  };
}

/**
 * Always takes the first option with the given rating. A situation need not have a
 * "vertretbar" option; the cautious player then takes the good one.
 */
export function playStrategy(
  situations: readonly Situation[],
  rating: Rating,
  grade: TourGrade | null = null,
): StrategyResult {
  return playRun(
    situations,
    (situation) => {
      const wanted = situation.optionen.find((o) => o.einstufung === rating);
      const fallback =
        rating === 'vertretbar'
          ? situation.optionen.find((o) => o.einstufung === 'gut')
          : undefined;
      const option = wanted ?? fallback;
      if (!option) throw new Error(`${situation.id} has no option rated ${rating}`);
      return option;
    },
    grade,
  );
}

/**
 * How each fixed player does on the tour: who reads carefully judges nearly every place
 * right, who clicks through carelessly gets most of them wrong.
 */
const TOUR_OF: Record<Rating, TourGrade> = { gut: 'good', vertretbar: 'fair', riskant: 'poor' };

/** A player who does not read judges every place by the toss of a coin. */
function randomTourGrade(places: number, rng: Rng): TourGrade {
  let correct = 0;
  for (let i = 0; i < places; i++) if (rng() < 0.5) correct += 1;
  return tourGrade(correct);
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
  const grade = level.rundgang ? randomTourGrade(level.rundgang.stellenProDurchgang, rng) : null;
  return playRun(
    drawn,
    (situation) => {
      const index = Math.floor(rng() * situation.optionen.length);
      return situation.optionen[index] as Option;
    },
    grade,
  );
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
  const tourFor = (rating: Rating): TourGrade | null => (level.rundgang ? TOUR_OF[rating] : null);
  for (const draw of combinations(level.situationen, level.situationenProDurchgang)) {
    for (const order of [draw, [...draw].reverse()]) {
      report.runs += 1;

      const good = playStrategy(order, 'gut', tourFor('gut'));
      if (good.outcome !== 'completed') report.good.failures += 1;
      report.good.lowest = Math.min(report.good.lowest, good.lowest);
      report.good.maxTilt = Math.max(report.good.maxTilt, good.tilt);
      if (good.stars < report.good.minStars) report.good.minStars = good.stars;

      const okay = playStrategy(order, 'vertretbar', tourFor('vertretbar'));
      if (okay.outcome === 'collapsed') report.okay.collapses += 1;
      if (okay.outcome === 'completed') report.okay.passes += 1;

      const risky = playStrategy(order, 'riskant', tourFor('riskant'));
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

/** True if the level breaks none of the rules. */
export function isBalanced(report: BalanceReport): boolean {
  return balanceProblems(report).length === 0;
}

/** How a simulated player answers events (brief of update 3, section 5). */
export type EventPolicy =
  /** Always a recommended strategy. */
  | 'recommended'
  /** Has every AI forecast checked first, then takes a recommended strategy. */
  | 'verified'
  | 'accept'
  | 'avoid'
  | 'mitigate'
  | 'transfer'
  /** Any available strategy, and any option in the situations. */
  | 'random';

const FALLBACKS: Record<
  Exclude<EventPolicy, 'recommended' | 'verified' | 'random'>,
  StrategyId[]
> = {
  accept: ['akzeptieren'],
  avoid: ['vermeiden', 'akzeptieren'],
  // Who always mitigates transfers where mitigating is not on offer, and the other way round.
  mitigate: ['vermindern', 'uebertragen', 'akzeptieren'],
  transfer: ['uebertragen', 'vermindern', 'akzeptieren'],
};

function strategyFor(event: RiskEvent, policy: EventPolicy, rng: Rng): StrategyId {
  const available = STRATEGY_IDS.filter((id) => availableStrategy(event, id) !== null);
  if (policy === 'random') {
    return available[Math.floor(rng() * available.length)] ?? 'akzeptieren';
  }
  if (policy === 'recommended' || policy === 'verified') {
    return available.find((id) => isRecommended(event, id)) ?? 'akzeptieren';
  }
  return FALLBACKS[policy].find((id) => available.includes(id)) ?? 'akzeptieren';
}

/**
 * Plays one whole run through the same steps the game takes, so the simulation cannot
 * drift from the rules. `allOccur` forces every event to happen: the worst case.
 */
export function playEvents(
  level: Level,
  seed: number,
  policy: EventPolicy,
  allOccur = false,
): LevelRun {
  const rng = createRng(seed ^ 0x9e3779b9);
  let run = step(startRun(level, seed, { canSkipTheory: true }), level, { type: 'skipTheory' });
  if (allOccur && run.events) {
    run = { ...run, events: run.events.map((round) => ({ ...round, occurs: true })) };
  }
  for (let guard = 0; guard < 200 && run.phase !== 'result'; guard++) {
    if (run.phase === 'tour') {
      for (const siteId of run.tour?.siteIds ?? []) {
        const site = level.rundgang?.stellen.find((s) => s.id === siteId);
        const risk = policy === 'random' ? rng() < 0.5 : (site?.istRisiko ?? false);
        run = step(run, level, { type: 'classify', siteId, risk });
      }
      run = step(run, level, { type: 'finishTour' });
    } else if (run.phase === 'situation') {
      const options = currentOptions(run, level);
      const option =
        policy === 'random'
          ? options[Math.floor(rng() * options.length)]
          : options.find((o) => o.einstufung === 'gut');
      if (!option) throw new Error(`No option to choose in ${level.id}`);
      run = step(run, level, { type: 'choose', optionId: option.id });
    } else if (run.phase === 'event') {
      const index = dueRound(run.events, run.history.length);
      const round = index === null ? undefined : run.events?.[index];
      if (!round) throw new Error(`No event due in ${level.id}`);
      const event = findEvent(level, round.eventId);
      if (policy === 'verified' && forecastOf(event, round).canVerify) {
        run = step(run, level, { type: 'verifyForecast' });
        if (run.phase !== 'event') continue;
      }
      run = step(run, level, {
        type: 'chooseStrategy',
        strategyId: strategyFor(event, policy, rng),
      });
    } else {
      run = step(run, level, { type: 'continue' });
    }
  }
  return run;
}

export interface EventBalanceReport {
  levelId: string;
  runs: number;
  /** Good decisions and recommended strategies, every event happening. */
  recommended: { collapses: number; failures: number; lowest: number };
  /** The same after having every forecast checked. */
  verified: { collapses: number; lowest: number };
  /**
   * Accepting every event: the share of runs that end collapsed or not accepted, and the
   * share that end so or with a gauge in the critical range.
   */
  accept: { failRate: number; strainedRate: number };
  /** Share of runs in which avoiding everything leaves little or no time. */
  avoid: { lowTimeRate: number };
  /** Share of runs in which mitigating, or transferring, everything leaves little or no budget. */
  mitigate: { lowBudgetRate: number };
  transfer: { lowBudgetRate: number };
  random: { passRate: number; collapseRate: number; failRate: number };
}

/** Brief of update 3, section 5: the six ways of playing a level with events, over seeded draws. */
export function simulateEvents(
  level: Level,
  runs: number = BALANCE.checks.events.runs,
): EventBalanceReport {
  const c = BALANCE.checks.events;
  const report: EventBalanceReport = {
    levelId: level.id,
    runs,
    recommended: { collapses: 0, failures: 0, lowest: 100 },
    verified: { collapses: 0, lowest: 100 },
    accept: { failRate: 0, strainedRate: 0 },
    avoid: { lowTimeRate: 0 },
    mitigate: { lowBudgetRate: 0 },
    transfer: { lowBudgetRate: 0 },
    random: { passRate: 0, collapseRate: 0, failRate: 0 },
  };
  const count = {
    accept: 0,
    strained: 0,
    avoid: 0,
    mitigate: 0,
    transfer: 0,
    pass: 0,
    collapse: 0,
  };
  for (let i = 0; i < runs; i++) {
    const seed = c.seed + i;

    const recommended = playEvents(level, seed, 'recommended', true);
    if (recommended.outcome === 'collapsed') report.recommended.collapses += 1;
    if (recommended.outcome !== 'completed') report.recommended.failures += 1;
    report.recommended.lowest = Math.min(
      report.recommended.lowest,
      lowestValue(recommended.gauges),
    );

    const verified = playEvents(level, seed, 'verified', true);
    if (verified.outcome === 'collapsed') report.verified.collapses += 1;
    report.verified.lowest = Math.min(report.verified.lowest, lowestValue(verified.gauges));

    const accept = playEvents(level, seed, 'accept');
    const failed = accept.outcome !== 'completed';
    if (failed) count.accept += 1;
    if (failed || criticalGauges(accept.gauges).length > 0) count.strained += 1;
    if (playEvents(level, seed, 'avoid').gauges.zeit < c.avoidTimeBelow) count.avoid += 1;
    if (playEvents(level, seed, 'mitigate').gauges.budget < c.lowBudgetBelow) count.mitigate += 1;
    if (playEvents(level, seed, 'transfer').gauges.budget < c.lowBudgetBelow) count.transfer += 1;

    const random = playEvents(level, seed, 'random');
    if (random.outcome === 'completed') count.pass += 1;
    if (random.outcome === 'collapsed') count.collapse += 1;
  }
  report.accept = { failRate: count.accept / runs, strainedRate: count.strained / runs };
  report.avoid.lowTimeRate = count.avoid / runs;
  report.mitigate.lowBudgetRate = count.mitigate / runs;
  report.transfer.lowBudgetRate = count.transfer / runs;
  report.random = {
    passRate: count.pass / runs,
    collapseRate: count.collapse / runs,
    failRate: 1 - count.pass / runs,
  };
  return report;
}

/** Conditions of the brief that hold and are enforced: breaking one stops the check. */
export type EventBalanceProblem =
  | 'recommended-collapses'
  | 'recommended-fails'
  | 'verified-collapses'
  | 'avoid-cheap'
  | 'mitigate-cheap'
  | 'transfer-cheap';

/**
 * Conditions of the brief that cannot hold together with the others (REQUIREMENTS.md, M-29).
 * They are measured and shown, but do not stop the check until it is decided what replaces them.
 */
export type EventBalanceOpen = 'recommended-low' | 'accept-safe' | 'random-range';

export function eventBalanceProblems(report: EventBalanceReport): EventBalanceProblem[] {
  const c = BALANCE.checks.events;
  const problems: EventBalanceProblem[] = [];
  if (report.recommended.collapses > 0) problems.push('recommended-collapses');
  if (report.recommended.failures > report.recommended.collapses)
    problems.push('recommended-fails');
  if (report.verified.collapses > 0) problems.push('verified-collapses');
  if (report.avoid.lowTimeRate < c.avoidShareMin) problems.push('avoid-cheap');
  if (report.mitigate.lowBudgetRate < c.lowBudgetShareMin) problems.push('mitigate-cheap');
  if (report.transfer.lowBudgetRate < c.lowBudgetShareMin) problems.push('transfer-cheap');
  return problems;
}

export function eventBalanceOpen(report: EventBalanceReport): EventBalanceOpen[] {
  const c = BALANCE.checks;
  const open: EventBalanceOpen[] = [];
  if (report.recommended.lowest < c.events.recommendedMinGauge) open.push('recommended-low');
  if (report.accept.failRate < c.events.acceptFailMin) open.push('accept-safe');
  if (report.random.failRate < c.randomFailMin || report.random.failRate > c.randomFailMax) {
    open.push('random-range');
  }
  return open;
}
