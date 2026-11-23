import type { Level, Option, OptionId, Rating, Situation } from '../content/schema.ts';
import { BALANCE } from './balance.ts';
import { drawSituations } from './draw.ts';
import type { Gauges } from './gauges.ts';
import { applyEffects, isCollapsed, startGauges } from './gauges.ts';
import { createRng, shuffle } from './rng.ts';
import { scoreRatio } from './scoring.ts';

export type Phase = 'briefing' | 'theory' | 'situation' | 'feedback' | 'result';
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
}

export type Action =
  { type: 'continue' } | { type: 'skipTheory' } | { type: 'choose'; optionId: OptionId };

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
      return toSituations(run);
    }
    case 'continue': {
      if (run.phase === 'briefing') {
        return level.theorie.length > 0 ? { ...run, phase: 'theory' } : toSituations(run);
      }
      if (run.phase === 'theory') {
        return run.theoryIndex + 1 < level.theorie.length
          ? { ...run, theoryIndex: run.theoryIndex + 1 }
          : toSituations(run);
      }
      if (run.phase === 'feedback') {
        return run.outcome === 'running'
          ? { ...run, phase: 'situation', step: run.step + 1 }
          : { ...run, phase: 'result' };
      }
      throw new GameError(`Cannot continue in phase ${run.phase}`);
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
      } else if (isLast) {
        const accepted = scoreRatio(history) >= BALANCE.acceptance.minScoreRatio;
        outcome = accepted ? 'completed' : 'rejected';
      }
      return { ...run, phase: 'feedback', gauges, outcome, history };
    }
  }
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
): LevelRun {
  let run = step(startRun(level, seed, { recentIds, canSkipTheory: true }), level, {
    type: 'skipTheory',
  });
  for (const optionId of choices) {
    if (run.phase !== 'situation') break;
    run = step(run, level, { type: 'choose', optionId });
    run = step(run, level, { type: 'continue' });
  }
  return run;
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
