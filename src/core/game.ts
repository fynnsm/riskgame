import type { Level, Option, OptionId, Rating, Situation, StrategyId } from '../content/schema.ts';
import { BALANCE } from './balance.ts';
import { drawSituations } from './draw.ts';
import type { Gauges } from './gauges.ts';
import type { EventRound } from './events.ts';
import {
  availableStrategy,
  dueRound,
  eventRounds,
  findEvent,
  impactUnder,
  pendingRound,
  roundPoints,
  startEvents,
} from './events.ts';
import { applyEffects, applyPoints, isCollapsed, startGauges } from './gauges.ts';
import { createRng, shuffle } from './rng.ts';
import { isAccepted } from './scoring.ts';
import type { TourState } from './tour.ts';
import { countCorrect, startTour, tourEffect, tourGrade, tourPoints } from './tour.ts';

export type Phase =
  | 'briefing'
  | 'theory'
  | 'tour'
  | 'tourResult'
  | 'situation'
  | 'feedback'
  /** M-20: an event is announced and waits for a strategy. */
  | 'event'
  /** M-20: the event of the round before is resolved, after the floor that followed it. */
  | 'eventResult'
  | 'result';
/**
 * 'collapsed': a gauge hit zero (F-204). 'rejected': the building stands, but too many
 * decisions were poor for it to pass the final inspection (F-211).
 */
export type Outcome = 'running' | 'completed' | 'collapsed' | 'rejected';

export interface ChoiceRecord {
  situationId: string;
  optionId: OptionId;
  rating: Rating;
  delta: Gauges;
  gaugesAfter: Gauges;
}

/** Complete, serialisable state of one attempt at a level. */
export interface LevelRun {
  levelId: string;
  seed: number;
  /** Kept so the run can be replayed from seed and choices alone (L-07). */
  recentIds: string[];
  canSkipTheory: boolean;
  phase: Phase;
  theoryIndex: number;
  situationIds: string[];
  /** Display order of the options per drawn situation (F-207). */
  optionOrders: OptionId[][];
  step: number;
  gauges: Gauges;
  history: ChoiceRecord[];
  outcome: Outcome;
  /** The site tour before the first situation (M-10); null if the level has none. */
  tour: TourState | null;
  /** The events of this run in the order they are announced (M-20); null if the level has none. */
  events: EventRound[] | null;
  /** Points the chosen strategies have earned so far (M-25). */
  eventPoints: number;
}

export type Action =
  | { type: 'continue' }
  | { type: 'skipTheory' }
  | { type: 'choose'; optionId: OptionId }
  /** M-12: puts a place into the risk register (`risk: true`) or marks it as no risk. */
  | { type: 'classify'; siteId: string; risk: boolean }
  | { type: 'finishTour' }
  /** M-23: has the team check the AI forecast of the announced event; costs time. */
  | { type: 'verifyForecast' }
  /** M-21: answers the announced event with one of the four strategies. */
  | { type: 'chooseStrategy'; strategyId: StrategyId };

export class GameError extends Error {
  override name = 'GameError';
}

export interface StartOptions {
  recentIds?: readonly string[];
  /** F-505: only true once the theory has been seen in an earlier run. */
  canSkipTheory?: boolean;
}

export function startRun(level: Level, seed: number, options: StartOptions = {}): LevelRun {
  const recentIds = [...(options.recentIds ?? [])];
  const rng = createRng(seed);
  const drawn = drawSituations(level.situationen, level.situationenProDurchgang, rng, recentIds);
  return {
    levelId: level.id,
    seed,
    recentIds,
    canSkipTheory: options.canSkipTheory ?? false,
    phase: 'briefing',
    theoryIndex: 0,
    situationIds: drawn.map((s) => s.id),
    optionOrders: drawn.map((s) =>
      shuffle(
        s.optionen.map((o) => o.id),
        rng,
      ),
    ),
    step: 0,
    gauges: startGauges(),
    history: [],
    outcome: 'running',
    // Drawn after the situations, from the same generator: a seed keeps the situations it
    // had before the tour existed, and the whole run stays repeatable from the seed (M-03).
    tour: startTour(level, rng),
    // After the tour, again from the same generator: which events come and which of them happen.
    events: startEvents(level, rng),
    eventPoints: 0,
  };
}

export function findSituation(level: Level, id: string): Situation {
  const situation = level.situationen.find((s) => s.id === id);
  if (!situation) throw new GameError(`Unknown situation ${id} in ${level.id}`);
  return situation;
}

export function findOption(situation: Situation, id: OptionId): Option {
  const option = situation.optionen.find((o) => o.id === id);
  if (!option) throw new GameError(`Unknown option ${id} in ${situation.id}`);
  return option;
}

export function currentSituation(run: LevelRun, level: Level): Situation {
  const id = run.situationIds[run.step];
  if (id === undefined) throw new GameError(`No situation at step ${run.step}`);
  return findSituation(level, id);
}

/** Options of the current situation in the shuffled order the player sees. */
export function currentOptions(run: LevelRun, level: Level): Option[] {
  const situation = currentSituation(run, level);
  const order = run.optionOrders[run.step] ?? [];
  return order.map((id) => findOption(situation, id));
}

function toSituations(run: LevelRun): LevelRun {
  return { ...run, phase: 'situation', theoryIndex: 0, step: 0 };
}

/** M-10: the tour comes after the theory and before the first situation. */
function afterTheory(run: LevelRun): LevelRun {
  return run.tour ? { ...run, phase: 'tour', theoryIndex: 0 } : toSituations(run);
}

/** The outcome of a run whose last decision is taken and whose events are all resolved. */
function finalOutcome(run: LevelRun): Outcome {
  if (isCollapsed(run.gauges)) return 'collapsed';
  return isAccepted(run) ? 'completed' : 'rejected';
}

/**
 * Where a run goes once a floor and everything that followed it is seen: to the event that
 * is due now, to the next situation, or to its end.
 */
function onwards(run: LevelRun): LevelRun {
  if (run.outcome !== 'running') return { ...run, phase: 'result' };
  if (dueRound(run.events, run.history.length) !== null) return { ...run, phase: 'event' };
  if (run.step + 1 >= run.situationIds.length) {
    // Only reached if an event was resolved after the last floor.
    return { ...run, phase: 'result', outcome: finalOutcome(run) };
  }
  return { ...run, phase: 'situation', step: run.step + 1 };
}

/** M-24: the event chosen for in the round before takes effect, after the floor that followed. */
function resolveEvent(run: LevelRun, level: Level, index: number): LevelRun {
  const round = (run.events ?? [])[index] as EventRound;
  const event = findEvent(level, round.eventId);
  const impact = impactUnder(
    event.auswirkung,
    round.occurs ? (round.strategy as StrategyId) : 'vermeiden',
  );
  const { gauges, delta } = applyEffects(run.gauges, impact);
  const events = (run.events ?? []).map((r, i) =>
    i === index ? { ...r, resolution: { occurred: r.occurs, delta, gaugesAfter: gauges } } : r,
  );
  const outcome: Outcome = isCollapsed(gauges) ? 'collapsed' : run.outcome;
  return { ...run, phase: 'eventResult', gauges, events, outcome };
}

/** The round that is announced right now; throws outside the event phase. */
function announcedRound(run: LevelRun): { index: number; round: EventRound } {
  const index = run.phase === 'event' ? dueRound(run.events, run.history.length) : null;
  const round = index === null ? undefined : (run.events ?? [])[index];
  if (index === null || !round) throw new GameError(`No event to answer in phase ${run.phase}`);
  return { index, round };
}

/** The single place where the game moves forward. Pure: same input, same output. */
export function step(run: LevelRun, level: Level, action: Action): LevelRun {
  if (run.levelId !== level.id) {
    throw new GameError(`Run belongs to ${run.levelId}, not ${level.id}`);
  }
  switch (action.type) {
    case 'skipTheory': {
      if (run.phase !== 'briefing' && run.phase !== 'theory') {
        throw new GameError(`Cannot skip theory in phase ${run.phase}`);
      }
      if (!run.canSkipTheory) {
        throw new GameError('Theory cannot be skipped on the first run');
      }
      return afterTheory(run);
    }
    case 'continue': {
      if (run.phase === 'briefing') {
        return level.theorie.length > 0 ? { ...run, phase: 'theory' } : afterTheory(run);
      }
      if (run.phase === 'theory') {
        return run.theoryIndex + 1 < level.theorie.length
          ? { ...run, theoryIndex: run.theoryIndex + 1 }
          : afterTheory(run);
      }
      if (run.phase === 'tourResult') return toSituations(run);
      if (run.phase === 'feedback') {
        const pending = run.outcome === 'running' ? pendingRound(run.events) : null;
        return pending === null ? onwards(run) : resolveEvent(run, level, pending);
      }
      if (run.phase === 'eventResult') return onwards(run);
      throw new GameError(`Cannot continue in phase ${run.phase}`);
    }
    case 'classify': {
      if (run.phase !== 'tour' || !run.tour) {
        throw new GameError(`Cannot classify in phase ${run.phase}`);
      }
      if (!run.tour.siteIds.includes(action.siteId)) {
        throw new GameError(`Place ${action.siteId} is not part of this tour`);
      }
      const judgements = { ...run.tour.judgements, [action.siteId]: action.risk };
      return { ...run, tour: { ...run.tour, judgements } };
    }
    case 'finishTour': {
      if (run.phase !== 'tour' || !run.tour) {
        throw new GameError(`Cannot finish the tour in phase ${run.phase}`);
      }
      const correct = countCorrect(run.tour, level);
      const grade = tourGrade(correct);
      const { gauges, delta } = applyEffects(run.gauges, {
        budget: '0',
        zeit: '0',
        stabilitaet: tourEffect(grade),
      });
      const result = { correct, grade, points: tourPoints(grade), delta };
      return { ...run, phase: 'tourResult', gauges, tour: { ...run.tour, result } };
    }
    case 'choose': {
      if (run.phase !== 'situation') {
        throw new GameError(`Cannot choose in phase ${run.phase}`);
      }
      const situation = currentSituation(run, level);
      const option = findOption(situation, action.optionId);
      const { gauges, delta } = applyEffects(run.gauges, option.wirkung);
      const history: ChoiceRecord[] = [
        ...run.history,
        {
          situationId: situation.id,
          optionId: option.id,
          rating: option.einstufung,
          delta,
          gaugesAfter: gauges,
        },
      ];
      const isLast = run.step + 1 >= run.situationIds.length;
      let outcome: Outcome = 'running';
      if (isCollapsed(gauges)) {
        outcome = 'collapsed';
      } else if (isLast && pendingRound(run.events) === null) {
        // With an event still to be resolved the level ends after that, not here.
        outcome = isAccepted({ ...run, history }) ? 'completed' : 'rejected';
      }
      return { ...run, phase: 'feedback', gauges, outcome, history };
    }
    case 'verifyForecast': {
      const { index, round } = announcedRound(run);
      const event = findEvent(level, round.eventId);
      if (!event.aiPrognose) throw new GameError(`${event.id} has no AI forecast to verify`);
      if (round.verified) throw new GameError(`The forecast of ${event.id} is already verified`);
      const { gauges } = applyPoints(run.gauges, 'zeit', -BALANCE.events.verifyCostTime);
      const events = (run.events ?? []).map((r, i) => (i === index ? { ...r, verified: true } : r));
      if (isCollapsed(gauges)) {
        return { ...run, phase: 'result', gauges, events, outcome: 'collapsed' };
      }
      return { ...run, gauges, events };
    }
    case 'chooseStrategy': {
      const { index, round } = announcedRound(run);
      const event = findEvent(level, round.eventId);
      const strategy = availableStrategy(event, action.strategyId);
      if (!strategy) {
        throw new GameError(`Strategy ${action.strategyId} is not available for ${event.id}`);
      }
      // M-24: the strategy costs at once; what the event does follows after the next floor.
      const { gauges, delta } = applyEffects(run.gauges, strategy.kosten);
      const chosen: EventRound = { ...round, strategy: action.strategyId, cost: delta };
      const events = (run.events ?? []).map((r, i) => (i === index ? chosen : r));
      const next = {
        ...run,
        gauges,
        events,
        eventPoints: run.eventPoints + roundPoints(chosen, level),
      };
      if (isCollapsed(gauges)) return { ...next, phase: 'result', outcome: 'collapsed' };
      return { ...next, phase: 'situation', step: run.step + 1 };
    }
  }
}

/** What a replay needs to know of one event: whether the forecast was checked, and the strategy. */
export interface EventInput {
  verified: boolean;
  strategy: StrategyId;
}

/** The inputs to all events answered so far; with seed and choices they repeat the run (L-07). */
export function eventInputsOf(run: Pick<LevelRun, 'events'>): EventInput[] {
  return (run.events ?? []).flatMap((round) =>
    round.strategy === null ? [] : [{ verified: round.verified, strategy: round.strategy }],
  );
}

/**
 * Re-plays a run from what an error report contains (L-07).
 * Stops early if the choices end or the building has collapsed.
 */
export function replay(
  level: Level,
  seed: number,
  recentIds: readonly string[],
  choices: readonly OptionId[],
  /**
   * The places the player put into the risk register, once the tour was finished. Null: the
   * tour was not finished, or the run had none; the replay then stops in the tour.
   */
  tourRisks: readonly string[] | null = null,
  /** What the player did about each event, in the order the events came. */
  eventInputs: readonly EventInput[] = [],
): LevelRun {
  let run = step(startRun(level, seed, { recentIds, canSkipTheory: true }), level, {
    type: 'skipTheory',
  });
  if (run.phase === 'tour' && run.tour && tourRisks !== null) {
    for (const siteId of run.tour.siteIds) {
      run = step(run, level, { type: 'classify', siteId, risk: tourRisks.includes(siteId) });
    }
    run = step(run, level, { type: 'finishTour' });
    run = step(run, level, { type: 'continue' });
  }
  let answered = 0;
  /** Answers every event that is announced, as long as the report says how. */
  const throughEvents = (): void => {
    while (run.phase === 'event' || run.phase === 'eventResult') {
      if (run.phase === 'eventResult') {
        run = step(run, level, { type: 'continue' });
        continue;
      }
      const input = eventInputs[answered];
      if (!input) return;
      answered += 1;
      if (input.verified) run = step(run, level, { type: 'verifyForecast' });
      if (run.phase !== 'event') return;
      run = step(run, level, { type: 'chooseStrategy', strategyId: input.strategy });
    }
  };
  for (const optionId of choices) {
    if (run.phase !== 'situation') break;
    run = step(run, level, { type: 'choose', optionId });
    run = step(run, level, { type: 'continue' });
    throughEvents();
  }
  return run;
}

function areEventsConsistent(run: LevelRun, level: Level): boolean {
  const rounds = run.events;
  const expected = eventRounds(level);
  if (!rounds) return expected === 0 && run.phase !== 'event' && run.phase !== 'eventResult';
  const pool = level.ereignisse?.pool ?? [];
  if (rounds.length !== expected) return false;
  if (new Set(rounds.map((r) => r.eventId)).size !== rounds.length) return false;
  for (const round of rounds) {
    const event = pool.find((e) => e.id === round.eventId);
    if (!event) return false;
    if (round.strategy !== null && !event.strategien[round.strategy].verfuegbar) return false;
    // A cost belongs to a chosen strategy, a resolution to a round that has one.
    if ((round.strategy === null) !== (round.cost === null)) return false;
    if (round.resolution !== null && round.strategy === null) return false;
    if (round.verified && !event.aiPrognose) return false;
  }
  if (run.phase === 'event' && dueRound(rounds, run.history.length) === null) return false;
  return true;
}

function isTourConsistent(run: LevelRun, level: Level): boolean {
  const inTour = run.phase === 'tour' || run.phase === 'tourResult';
  if (!run.tour) return !inTour;
  const pool = level.rundgang;
  if (!pool) return false;
  const { siteIds, judgements, result } = run.tour;
  if (siteIds.length !== pool.stellenProDurchgang) return false;
  if (new Set(siteIds).size !== siteIds.length) return false;
  if (!siteIds.every((id) => pool.stellen.some((s) => s.id === id))) return false;
  if (!Object.keys(judgements).every((id) => siteIds.includes(id))) return false;
  // The result exists exactly from the moment the tour is finished.
  const beforeEnd = run.phase === 'briefing' || run.phase === 'theory' || run.phase === 'tour';
  return beforeEnd === (result === null);
}

/**
 * A stored run may refer to content that has changed since. Such a run must be
 * dropped instead of crashing halfway through a level (F-704).
 */
export function isRunConsistent(run: LevelRun, level: Level): boolean {
  if (run.levelId !== level.id) return false;
  if (run.situationIds.length !== level.situationenProDurchgang) return false;
  if (run.optionOrders.length !== run.situationIds.length) return false;
  if (run.step < 0 || run.step >= run.situationIds.length) return false;
  if (run.history.length > run.situationIds.length) return false;
  if (run.theoryIndex < 0 || run.theoryIndex >= Math.max(1, level.theorie.length)) return false;
  if (!isTourConsistent(run, level)) return false;
  if (!areEventsConsistent(run, level)) return false;
  return run.situationIds.every((id, i) => {
    const situation = level.situationen.find((s) => s.id === id);
    const order = run.optionOrders[i] ?? [];
    return (
      situation !== undefined &&
      order.length === situation.optionen.length &&
      situation.optionen.every((o) => order.includes(o.id))
    );
  });
}
