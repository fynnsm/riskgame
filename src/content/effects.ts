import type { EffectLevel, Effects } from './schema.ts';
import { GAUGE_KEYS } from './schema.ts';

/** Point values per step size. The numbers themselves live in src/core/balance.ts. */
export interface EffectPoints {
  readonly klein: number;
  readonly mittel: number;
  readonly gross: number;
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
