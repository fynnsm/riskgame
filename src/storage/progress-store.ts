import type { Progress } from '../core/progress.ts';

export type LoadStatus =
  /** Nothing stored yet. */
  | 'empty'
  | 'ok'
  /** Stored data is damaged or does not match the schema (F-704). */
  | 'invalid'
  /** Stored by a different version of the game. */
  | 'outdated'
  /**
   * Carried over from an older version, or saved from a state whose level in play could
   * no longer be read: completed levels and stars are kept, the level in play is not.
   */
  | 'migrated'
  /** The browser refuses access, e.g. in a locked-down private mode. */
  | 'unavailable';

export interface LoadOutcome {
  status: LoadStatus;
  /** Always usable: a fresh progress unless status is 'ok' or 'migrated'. */
  progress: Progress;
  /** With 'migrated': true if a level in play had to be given up. The player is told once. */
  droppedRun?: boolean;
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
