import type { Situation } from '../content/schema.ts';
import type { Rng } from './rng.ts';
import { shuffle } from './rng.ts';

/**
 * F-105/F-106: draws `count` distinct situations. Situations from `recentIds`
 * (oldest first) are pushed to the back, the most recently played furthest,
 * so a repeat run shows fresh ones first.
 */
export function drawSituations(
  pool: readonly Situation[],
  count: number,
  rng: Rng,
  recentIds: readonly string[] = [],
): Situation[] {
  if (count > pool.length) {
    throw new Error(`Cannot draw ${count} situations from a pool of ${pool.length}`);
  }
  const shuffled = shuffle(pool, rng);
  const fresh = shuffled.filter((s) => !recentIds.includes(s.id));
  const stale = shuffled
    .filter((s) => recentIds.includes(s.id))
    .sort((a, b) => recentIds.lastIndexOf(a.id) - recentIds.lastIndexOf(b.id));
  return [...fresh, ...stale].slice(0, count);
}
