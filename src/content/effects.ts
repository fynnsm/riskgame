import type { EffectLevel, Effects } from './schema.ts';
import { GAUGE_KEYS } from './schema.ts';

/** Point values per step size. The numbers themselves live in src/core/balance.ts. */
export interface EffectPoints {
  readonly klein: number;
  readonly mittel: number;
  readonly gross: number;
}

/**
 * Everything the validation of content needs to know of the balance. The numbers live in
 * src/core/balance.ts and are handed in, so they exist in one place only.
 */
export interface ContentRules {
  readonly effectPoints: EffectPoints;
  /** How many places of each type a site tour draws. */
  readonly tourDraw: Readonly<
    Record<'gefunden' | 'fehlalarm' | 'uebersehen' | 'unauffaellig', number>
  >;
  /** How many rounds of events a run has. */
  readonly eventRounds: number;
}

export function effectValue(level: EffectLevel, points: EffectPoints): number {
  if (level === '0') return 0;
  const sign = level.startsWith('-') ? -1 : 1;
  const size = level.slice(1) as keyof EffectPoints;
  return sign * points[size];
}

export function effectSum(effects: Effects, points: EffectPoints): number {
  return GAUGE_KEYS.reduce((sum, key) => sum + effectValue(effects[key], points), 0);
}

export function hasNegativeEffect(effects: Effects): boolean {
  return GAUGE_KEYS.some((key) => effects[key].startsWith('-'));
}
