import type { BuildingKind, Rating } from '../content/schema.ts';
import { BALANCE } from './balance.ts';
import type { Gauges } from './gauges.ts';
import { highestValue, lowestValue, weakestGauge } from './gauges.ts';

export interface Lean {
  /** 0 = upright, 1 = as crooked as it gets. */
  tilt: number;
  /** 0 = calm, 1 = shaking hard. */
  wobble: number;
  /** Unit direction the building leans towards. */
  dirX: number;
  dirZ: number;
}

export interface FloorModel {
  /** Sideways offset of this floor from the foundation, in floor widths. */
  offsetX: number;
  offsetZ: number;
  /** 0 = clean, 1 = badly battered. Shows which decisions were poor (F-408). */
  damage: number;
}

/** What one decision leaves behind in the building. */
export interface FloorRecord {
  gauges: Gauges;
  rating: Rating;
}

/** Everything the renderer needs to draw one building. It contains no rules, only results. */
export interface BuildingModel {
  kind: BuildingKind;
  floors: FloorModel[];
  tiltDegrees: number;
  dirX: number;
  dirZ: number;
  wobble: number;
}

function unit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * F-205: the lower the weakest gauge and the more lopsided the three gauges,
 * the stronger the tilt. There is deliberately no counting rule here (F-206).
 */
export function computeLean(gauges: Gauges): Lean {
  const cfg = BALANCE.lean;
  const lowest = lowestValue(gauges);
  const weakness = unit((cfg.tiltStartsBelow - lowest) / cfg.tiltStartsBelow);
  const imbalance = unit((highestValue(gauges) - lowest) / (BALANCE.gauge.max - BALANCE.gauge.min));
  const tilt = unit(cfg.weakestWeight * weakness + cfg.imbalanceWeight * imbalance);
  const wobble = unit((cfg.wobbleStartsBelow - lowest) / cfg.wobbleStartsBelow);
  const direction = cfg.directions[weakestGauge(gauges)];
  return { tilt, wobble, dirX: direction.x, dirZ: direction.z };
}

/**
 * One floor per decision (F-407). Each floor is set down shifted by the lean at that moment,
 * so the finished building shows where in the project things went crooked (F-408).
 */
export function buildingModel(kind: BuildingKind, records: readonly FloorRecord[]): BuildingModel {
  const floors: FloorModel[] = [];
  let offsetX = 0;
  let offsetZ = 0;
  let last: Lean = { tilt: 0, wobble: 0, dirX: 0, dirZ: 0 };
  for (const record of records) {
    last = computeLean(record.gauges);
    offsetX += last.dirX * last.tilt * BALANCE.lean.maxFloorShift;
    offsetZ += last.dirZ * last.tilt * BALANCE.lean.maxFloorShift;
    floors.push({ offsetX, offsetZ, damage: BALANCE.lean.damage[record.rating] });
  }
  return {
    kind,
    floors,
    tiltDegrees: last.tilt * BALANCE.lean.maxTiltDegrees,
    dirX: last.dirX,
    dirZ: last.dirZ,
    wobble: last.wobble,
  };
}
