import type { Progress } from '../core/progress.ts';

export type LoadStatus =
  /** Nothing stored yet. */
  | 'empty'
  | 'ok'
  /** Stored data is damaged or does not match the schema (F-704). */
  | 'invalid'
  /** Stored by a different version of the game. */
  | 'outdated'
  /** The browser refuses access, e.g. in a locked-down private mode. */
  | 'unavailable';

export interface LoadOutcome {
  status: LoadStatus;
  /** Always usable: a fresh progress whenever status is not 'ok'. */
  progress: Progress;
}

/**
 * F-703: the only door to persisted progress. A backend could implement this
 * interface later without touching the game.
 */
export interface ProgressStore {
  load(): LoadOutcome;
  /** Returns false if the progress could not be written. Never throws. */
  save(progress: Progress): boolean;
  /** Returns false if the stored progress could not be removed. Never throws. */
  clear(): boolean;
}
