import type { Level } from '../content/schema.ts';
import type { LevelRun } from './game.ts';
import type { Gauges } from './gauges.ts';
import { lowestValue } from './gauges.ts';
import type { FloorRecord } from './lean.ts';
import type { Stars } from './scoring.ts';
import { goalResults, starsFor } from './scoring.ts';

export const PROGRESS_VERSION = 3;

export interface LevelBest {
  stars: Stars;
  gauges: Gauges;
  /** Gauges and rating per decision; enough to rebuild the finished building (F-408). */
  floors: FloorRecord[];
  /** IDs of the learning goals reached in that run (F-604). */
  goalsReached: string[];
}

export interface LevelProgress {
  completed: boolean;
  theorySeen: boolean;
  attempts: number;
  best: LevelBest | null;
  /** Situations played so far, oldest first; feeds the next draw (F-106). */
  recentIds: string[];
}

export interface Progress {
  version: typeof PROGRESS_VERSION;
  levels: Record<string, LevelProgress>;
  currentRun: LevelRun | null;
  playTimeMs: number;
}

export function floorRecords(run: Pick<LevelRun, 'history'>): FloorRecord[] {
  return run.history.map((c) => ({ gauges: c.gaugesAfter, rating: c.rating }));
}

export function emptyProgress(): Progress {
  return { version: PROGRESS_VERSION, levels: {}, currentRun: null, playTimeMs: 0 };
}

export function levelProgress(progress: Progress, levelId: string): LevelProgress {
  return (
    progress.levels[levelId] ?? {
      completed: false,
      theorySeen: false,
      attempts: 0,
      best: null,
      recentIds: [],
    }
  );
}

/** F-103: a level opens once every level before it has been completed. */
export function isUnlocked(
  progress: Progress,
  orderedLevelIds: readonly string[],
  levelId: string,
): boolean {
  const index = orderedLevelIds.indexOf(levelId);
  if (index < 0) return false;
  return orderedLevelIds.slice(0, index).every((id) => levelProgress(progress, id).completed);
}

/** F-702: called after every step so a reload continues at the same place. */
export function withRun(progress: Progress, run: LevelRun): Progress {
  const lp = levelProgress(progress, run.levelId);
  const pastTheory = run.phase !== 'briefing' && run.phase !== 'theory';
  return {
    ...progress,
    currentRun: run,
    levels: {
      ...progress.levels,
      [run.levelId]: { ...lp, theorySeen: lp.theorySeen || pastTheory },
    },
  };
}

function isBetter(candidate: LevelBest, current: LevelBest | null): boolean {
  if (current === null) return true;
  if (candidate.stars !== current.stars) return candidate.stars > current.stars;
  return lowestValue(candidate.gauges) > lowestValue(current.gauges);
}

/**
 * Books a finished run exactly once, when it enters the result phase.
 * F-107: a worse repeat never overwrites the best result.
 */
export function finishRun(progress: Progress, run: LevelRun, level: Level): Progress {
  const lp = levelProgress(progress, run.levelId);
  const played = run.history.map((c) => c.situationId);
  const recentIds = [...lp.recentIds.filter((id) => !played.includes(id)), ...played];
  let best = lp.best;
  if (run.outcome === 'completed') {
    const candidate: LevelBest = {
      stars: starsFor(run),
      gauges: run.gauges,
      floors: floorRecords(run),
      goalsReached: goalResults(level, run.history)
        .filter((g) => g.status === 'erreicht')
        .map((g) => g.id),
    };
    if (isBetter(candidate, best)) best = candidate;
  }
  return {
    ...progress,
    currentRun: run,
    levels: {
      ...progress.levels,
      [run.levelId]: {
        completed: lp.completed || run.outcome === 'completed',
        theorySeen: true,
        attempts: lp.attempts + 1,
        best,
        recentIds,
      },
    },
  };
}

export function clearRun(progress: Progress): Progress {
  return { ...progress, currentRun: null };
}

export function addPlayTime(progress: Progress, elapsedMs: number): Progress {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return progress;
  return { ...progress, playTimeMs: progress.playTimeMs + Math.round(elapsedMs) };
}
