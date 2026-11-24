import { TUNING } from './tuning.ts';

/**
 * Traffic (B3): cars, vans, buses and a tram that follow one rule set, so they do not
 * drive into each other. Pure simulation without Three.js; the scene only draws the result.
 *
 * Roads form a grid. All crossings share one signal: first the roads along x have green,
 * then all are red for a moment, then the roads along z, then all red again. A vehicle
 * enters a crossing only if the green lasts long enough for it to clear it.
 */

export type VehicleKind = 'auto' | 'lieferwagen' | 'bus' | 'tram';

export interface Vehicle {
  kind: VehicleKind;
  /** The axis the vehicle drives along. */
  axis: 'x' | 'z';
  /** Coordinate of the road's centre line on the other axis. */
  line: number;
  dir: 1 | -1;
  /** Position of the vehicle's centre along its axis. */
  s: number;
  speed: number;
  cruise: number;
}

export interface TrafficGrid {
  /** Distance between two parallel roads. */
  pitch: number;
  /** Blocks from the centre to the edge. */
  reach: number;
  /** Sideways shift of the roads along z (see city.ts). */
  shift: number;
}

export const VEHICLE_SIZE: Record<VehicleKind, { length: number; width: number; height: number }> =
  {
    auto: { length: 1.9, width: 1, height: 0.55 },
    lieferwagen: { length: 2.5, width: 1.05, height: 0.95 },
    bus: { length: 4.4, width: 1.1, height: 1.1 },
    tram: { length: 6.2, width: 1.1, height: 1.15 },
  };

const T = TUNING.traffic;

function span(grid: TrafficGrid): number {
  return (grid.reach * 2 + 1) * grid.pitch;
}

/** Whether the roads along `axis` have green, and for how many more seconds. */
export function signalFor(axis: 'x' | 'z', time: number): { green: boolean; remaining: number } {
  const cycle = 2 * (T.greenSeconds + T.allRedSeconds);
  const phase = ((time % cycle) + cycle) % cycle;
  const start = axis === 'x' ? 0 : T.greenSeconds + T.allRedSeconds;
  const into = phase - start;
  const green = into >= 0 && into < T.greenSeconds;
  return { green, remaining: green ? T.greenSeconds - into : 0 };
}

/** World position of the vehicle's centre; it keeps to the right of the centre line. */
export function vehiclePosition(v: Vehicle, grid: TrafficGrid): { x: number; z: number } {
  const lane = v.dir * T.laneOffset;
  return v.axis === 'x' ? { x: v.s, z: v.line + lane } : { x: v.line + grid.shift - lane, z: v.s };
}

/** Footprint of the vehicle on the ground. */
export function vehicleRect(
  v: Vehicle,
  grid: TrafficGrid,
): { x0: number; x1: number; z0: number; z1: number } {
  const { length, width } = VEHICLE_SIZE[v.kind];
  const { x, z } = vehiclePosition(v, grid);
  const alongX = v.axis === 'x';
  const hx = (alongX ? length : width) / 2;
  const hz = (alongX ? width : length) / 2;
  return { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz };
}

/** Centre of the next crossing in driving direction, measured along the vehicle's axis. */
function nextCrossing(v: Vehicle, grid: TrafficGrid, from: number): number {
  const offset = grid.pitch / 2 + (v.axis === 'x' ? grid.shift : 0);
  const index = (from - offset) / grid.pitch;
  const next = v.dir > 0 ? Math.ceil(index - 1e-9) : Math.floor(index + 1e-9);
  return next * grid.pitch + offset;
}

/**
 * Places the vehicles. `random` must be the decoration generator, never the game's (B0.4).
 * With `rich` there are vans, a bus and a tram besides cars (quality steps 1 and 2).
 */
export function createTraffic(random: () => number, grid: TrafficGrid, rich: boolean): Vehicle[] {
  const vehicles: Vehicle[] = [];
  // The road just behind the building lots belongs to the tram alone.
  const tramLine = -grid.pitch / 2;
  const lines: number[] = [];
  for (let k = -3; k <= 2; k++) lines.push((k + 0.5) * grid.pitch);

  /**
   * Every vehicle starts in the middle part of a block, never inside a crossing: there it
   * could stand in the way of cross traffic before the rules had a chance to apply.
   */
  const add = (
    kind: VehicleKind,
    axis: 'x' | 'z',
    line: number,
    dir: 1 | -1,
    block: number,
  ): void => {
    const cruise = T.cruise[kind] * (0.85 + random() * 0.3);
    const slack = grid.pitch / 2 - T.stopBefore - VEHICLE_SIZE[kind].length / 2 - 0.3;
    const centre = block * grid.pitch + (axis === 'x' ? grid.shift : 0);
    const s = centre + (random() - 0.5) * 2 * Math.max(0, slack);
    vehicles.push({ kind, axis, line, dir, s, speed: cruise, cruise });
  };

  const blocks = grid.reach * 2 + 1;
  for (const axis of ['x', 'z'] as const) {
    for (const line of lines) {
      if (axis === 'x' && line === tramLine) continue;
      for (const dir of [1, -1] as const) {
        // The vehicles of a lane start in different parts of the city, so a queue never
        // reaches back into a crossing.
        for (let n = 0; n < T.perLane; n++) {
          const roll = random();
          const kind: VehicleKind =
            !rich || roll < 0.7 ? 'auto' : roll < 0.9 ? 'lieferwagen' : 'bus';
          // Each vehicle of the lane gets a stretch of blocks of its own.
          const stretch = Math.floor(blocks / T.perLane);
          const block = -grid.reach + n * stretch + Math.floor(random() * stretch);
          add(kind, axis, line, dir, Math.min(grid.reach, block));
        }
      }
    }
  }
  if (rich) {
    add('tram', 'x', tramLine, 1, -Math.ceil(grid.reach / 2));
    add('tram', 'x', tramLine, -1, Math.ceil(grid.reach / 2));
  }
  return vehicles;
}

/** Advances all vehicles by `dt` seconds. `time` is the time at the start of the step. */
export function stepTraffic(
  vehicles: Vehicle[],
  time: number,
  dt: number,
  grid: TrafficGrid,
): void {
  const total = span(grid);
  const half = total / 2;

  for (const v of vehicles) {
    const size = VEHICLE_SIZE[v.kind];
    const front = v.s + v.dir * (size.length / 2);
    let free = Infinity;

    // The vehicle ahead in the same lane, also across the wrap-around at the city's edge.
    for (const other of vehicles) {
      if (other === v || other.axis !== v.axis || other.line !== v.line || other.dir !== v.dir)
        continue;
      let ahead = (other.s - v.s) * v.dir;
      if (ahead <= 0) ahead += total;
      const gap = ahead - size.length / 2 - VEHICLE_SIZE[other.kind].length / 2;
      free = Math.min(free, gap - T.minGap);
    }

    // The stop line of the next crossing, unless the vehicle has already passed it.
    const crossing = nextCrossing(v, grid, front - v.dir * T.stopBefore);
    const toLine = (crossing - v.dir * T.stopBefore - front) * v.dir;
    if (toLine >= -1e-6) {
      const signal = signalFor(v.axis, time);
      // Clearing means: the rear has left the far side of the crossing.
      const clearSeconds = (2 * T.stopBefore + size.length + Math.max(0, toLine)) / v.cruise;
      if (!signal.green || signal.remaining < clearSeconds)
        free = Math.min(free, Math.max(0, toLine));
    }

    // The fastest speed from which the vehicle can still stop within the free distance.
    const safe = Math.sqrt(2 * T.braking * Math.max(0, free));
    v.speed = Math.min(v.cruise, safe, v.speed + T.acceleration * dt);
    // Never move further in one step than there is room for, whatever the step length.
    const move = Math.min(v.speed * dt, Math.max(0, free));
    v.s += v.dir * move;
    if (v.s > half) v.s -= total;
    if (v.s < -half) v.s += total;
  }
}

/**
 * Advances the traffic over a whole frame, however long it was. The rules only hold for
 * short steps (the signal is read once per step), so a long frame is walked in small ones.
 */
export function advanceTraffic(
  vehicles: Vehicle[],
  time: number,
  dt: number,
  grid: TrafficGrid,
): void {
  const steps = Math.max(1, Math.ceil(dt / T.maxStepSeconds));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) stepTraffic(vehicles, time + i * h, h, grid);
}
