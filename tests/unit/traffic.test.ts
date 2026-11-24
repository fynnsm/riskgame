import { describe, expect, it } from 'vitest';
import { createDecorRandom } from '../../src/render/director.ts';
import type { TrafficGrid, Vehicle } from '../../src/render/traffic.ts';
import {
  createTraffic,
  signalFor,
  stepTraffic,
  vehiclePosition,
  vehicleRect,
} from '../../src/render/traffic.ts';
import { TUNING } from '../../src/render/tuning.ts';

const grid: TrafficGrid = { pitch: 16, reach: 7, shift: 0 };

function firstOverlap(vehicles: Vehicle[], g: TrafficGrid): string | null {
  // One footprint per vehicle and step; computing it per pair made this check ten times slower.
  const rects = vehicles.map((v) => vehicleRect(v, g));
  for (let i = 0; i < vehicles.length; i++) {
    const p = rects[i] as (typeof rects)[number];
    for (let j = i + 1; j < vehicles.length; j++) {
      const q = rects[j] as (typeof rects)[number];
      if (p.x0 < q.x1 && q.x0 < p.x1 && p.z0 < q.z1 && q.z0 < p.z1) {
        const a = vehicles[i] as Vehicle;
        const b = vehicles[j] as Vehicle;
        return `${a.kind}(${a.axis}) and ${b.kind}(${b.axis})`;
      }
    }
  }
  return null;
}

describe('traffic signal (B3)', () => {
  it('never gives both directions green at once and leaves a gap between them', () => {
    const cycle = 2 * (TUNING.traffic.greenSeconds + TUNING.traffic.allRedSeconds);
    let sawX = false;
    let sawZ = false;
    let sawAllRed = false;
    for (let t = 0; t < cycle * 2; t += 0.05) {
      const x = signalFor('x', t).green;
      const z = signalFor('z', t).green;
      expect(x && z).toBe(false);
      sawX ||= x;
      sawZ ||= z;
      sawAllRed ||= !x && !z;
    }
    expect([sawX, sawZ, sawAllRed]).toEqual([true, true, true]);
  });

  it('counts down the remaining green and reports none on red', () => {
    expect(signalFor('x', 0)).toEqual({ green: true, remaining: 7 });
    expect(signalFor('x', 6)).toEqual({ green: true, remaining: 1 });
    expect(signalFor('x', 7.5)).toEqual({ green: false, remaining: 0 });
    expect(signalFor('z', 8)).toEqual({ green: true, remaining: 7 });
    expect(signalFor('z', -1).green).toBe(false);
  });
});

describe('traffic layout (B3)', () => {
  it('uses only cars on the lowest quality and adds vans, buses and a tram above it', () => {
    const plain = createTraffic(createDecorRandom(1), grid, false);
    expect(new Set(plain.map((v) => v.kind))).toEqual(new Set(['auto']));
    const rich = createTraffic(createDecorRandom(1), grid, true);
    expect(new Set(rich.map((v) => v.kind))).toEqual(
      new Set(['auto', 'lieferwagen', 'bus', 'tram']),
    );
    expect(rich.filter((v) => v.kind === 'tram')).toHaveLength(2);
  });

  it('gives the tram a road of its own', () => {
    const rich = createTraffic(createDecorRandom(5), grid, true);
    const tramLine = rich.find((v) => v.kind === 'tram')?.line;
    expect(
      rich.filter((v) => v.axis === 'x' && v.line === tramLine).every((v) => v.kind === 'tram'),
    ).toBe(true);
  });

  it('places the same traffic for the same seed and starts without overlaps', () => {
    const a = createTraffic(createDecorRandom(9), grid, true);
    expect(createTraffic(createDecorRandom(9), grid, true)).toEqual(a);
    expect(firstOverlap(a, grid)).toBeNull();
  });

  it('keeps vehicles to the right of the centre line', () => {
    const east: Vehicle = { kind: 'auto', axis: 'x', line: 8, dir: 1, s: 3, speed: 0, cruise: 5 };
    expect(vehiclePosition(east, grid)).toEqual({ x: 3, z: 8.95 });
    expect(vehiclePosition({ ...east, dir: -1 }, grid)).toEqual({ x: 3, z: 7.05 });
    const south: Vehicle = { ...east, axis: 'z' };
    expect(vehiclePosition(south, { ...grid, shift: 8 })).toEqual({ x: 15.05, z: 3 });
  });
});

describe('traffic rules (B3): vehicles do not drive into each other', () => {
  it.each([
    ['rich traffic, odd number of lots', 20261124, 0, true],
    ['rich traffic, shifted grid', 7, 8, true],
    ['cars only', 3, 0, false],
  ])(
    'never overlaps over ten minutes: %s',
    (_name, seed, shift, rich) => {
      const g = { ...grid, shift };
      const vehicles = createTraffic(createDecorRandom(seed), g, rich);
      const dt = 1 / 30;
      for (let step = 0; step < 600 * 30; step++) {
        stepTraffic(vehicles, step * dt, dt, g);
        const hit = firstOverlap(vehicles, g);
        if (hit) throw new Error(`Overlap after ${(step * dt).toFixed(1)} s: ${hit}`);
      }
      // 18,000 steps with every pair checked: seconds on a slow CI machine under coverage, so the
      // default limit of five seconds is too tight for this one.
    },
    60_000,
  );

  it('stays safe when frames are long and uneven, as on a slow phone', () => {
    const vehicles = createTraffic(createDecorRandom(11), grid, true);
    let time = 0;
    for (let step = 0; step < 4000; step++) {
      const dt = step % 7 === 0 ? 0.1 : step % 3 === 0 ? 0.05 : 0.02;
      stepTraffic(vehicles, time, dt, grid);
      time += dt;
      expect(firstOverlap(vehicles, grid)).toBeNull();
    }
  });

  it('stops at a red signal and drives on when it turns green', () => {
    // A car just before the crossing at x = 8, with the roads along x on red.
    const car: Vehicle = { kind: 'auto', axis: 'x', line: 8, dir: 1, s: 2, speed: 5, cruise: 5 };
    const red = 8;
    for (let i = 0; i < 90; i++) stepTraffic([car], red, 1 / 30, grid);
    expect(car.speed).toBe(0);
    expect(car.s + 0.95).toBeCloseTo(8 - TUNING.traffic.stopBefore, 1);

    for (let i = 0; i < 90; i++) stepTraffic([car], i / 30, 1 / 30, grid);
    expect(car.s).toBeGreaterThan(10);
  });

  it('does not enter a crossing it could not clear before the signal changes', () => {
    const tram: Vehicle = {
      kind: 'tram',
      axis: 'x',
      line: 8,
      dir: 1,
      s: 1,
      speed: 3.8,
      cruise: 3.8,
    };
    // Half a second of green left: far too little for six metres of tram.
    for (let i = 0; i < 12; i++) stepTraffic([tram], 6.5 + i / 30, 1 / 30, grid);
    expect(tram.s + 3.1).toBeLessThanOrEqual(8 - TUNING.traffic.stopBefore + 1e-6);
  });

  it('keeps its distance to the vehicle ahead', () => {
    const lead: Vehicle = { kind: 'bus', axis: 'x', line: 40, dir: 1, s: 30, speed: 0, cruise: 0 };
    const follower: Vehicle = {
      kind: 'auto',
      axis: 'x',
      line: 40,
      dir: 1,
      s: 20,
      speed: 5,
      cruise: 5,
    };
    for (let i = 0; i < 300; i++) stepTraffic([lead, follower], 0, 1 / 30, grid);
    const gap = lead.s - 2.2 - (follower.s + 0.95);
    expect(gap).toBeGreaterThanOrEqual(TUNING.traffic.minGap - 1e-6);
    expect(gap).toBeLessThan(TUNING.traffic.minGap + 0.2);
  });

  it('wraps around at the edge of the city', () => {
    const car: Vehicle = {
      kind: 'auto',
      axis: 'z',
      line: 8,
      dir: -1,
      s: -119.9,
      speed: 5,
      cruise: 5,
    };
    stepTraffic([car], 8, 0.1, grid);
    expect(car.s).toBeGreaterThan(100);
  });
});
