import { effectValue } from '../content/effects.ts';
import type { Effects, GaugeKey } from '../content/schema.ts';
import { GAUGE_KEYS } from '../content/schema.ts';
import { BALANCE } from './balance.ts';

export type Gauges = Readonly<Record<GaugeKey, number>>;

export function startGauges(): Gauges {
  const { start } = BALANCE.gauge;
  return { budget: start, zeit: start, stabilitaet: start };
}

function clamp(value: number): number {
  return Math.min(BALANCE.gauge.max, Math.max(BALANCE.gauge.min, value));
}

/**
 * Applies an option's effects. `delta` is what actually changed after clamping,
 * so the feedback never claims "+12" when the gauge was already at 96.
 */
export function applyEffects(gauges: Gauges, effects: Effects): { gauges: Gauges; delta: Gauges } {
  const next = { ...gauges };
  const delta = { budget: 0, zeit: 0, stabilitaet: 0 };
  for (const key of GAUGE_KEYS) {
    next[key] = clamp(gauges[key] + effectValue(effects[key], BALANCE.effectPoints));
    delta[key] = next[key] - gauges[key];
  }
  return { gauges: next, delta };
}

/** Changes one gauge by a number of points, with the same clamping as `applyEffects`. */
export function applyPoints(
  gauges: Gauges,
  key: GaugeKey,
  points: number,
): { gauges: Gauges; delta: Gauges } {
  const value = clamp(gauges[key] + points);
  const delta = { budget: 0, zeit: 0, stabilitaet: 0 };
  delta[key] = value - gauges[key];
  return { gauges: { ...gauges, [key]: value }, delta };
}

/** F-204: the project fails the moment any gauge reaches zero. */
export function isCollapsed(gauges: Gauges): boolean {
  return GAUGE_KEYS.some((key) => gauges[key] <= BALANCE.gauge.min);
}

/** The gauges that are in the critical range, in fixed order. Empty means: nothing to warn about. */
export function criticalGauges(gauges: Gauges): GaugeKey[] {
  return GAUGE_KEYS.filter((key) => gauges[key] < BALANCE.gauge.criticalBelow);
}

/** Ties resolve in the fixed order of GAUGE_KEYS so the result is deterministic. */
export function weakestGauge(gauges: Gauges): GaugeKey {
  let weakest: GaugeKey = GAUGE_KEYS[0];
  for (const key of GAUGE_KEYS) {
    if (gauges[key] < gauges[weakest]) weakest = key;
  }
  return weakest;
}

export function lowestValue(gauges: Gauges): number {
  return Math.min(...GAUGE_KEYS.map((key) => gauges[key]));
}

export function highestValue(gauges: Gauges): number {
  return Math.max(...GAUGE_KEYS.map((key) => gauges[key]));
}
