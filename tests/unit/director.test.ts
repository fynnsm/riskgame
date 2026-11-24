import { describe, expect, it } from 'vitest';
import { startRun } from '../../src/core/game.ts';
import type { Quality } from '../../src/render/director.ts';
import {
  celebrationFor,
  cloudVisibility,
  cityTitle,
  createDecorRandom,
  decorationFor,
  momentFor,
  nextPlaneDelay,
  planeLateralOffset,
  planeMayCrossCentre,
  resultSequence,
  timeOfDay,
} from '../../src/render/director.ts';
import { LIGHTING } from '../../src/render/palette.ts';
import { TUNING } from '../../src/render/tuning.ts';
import { makeLevel } from './fixtures.ts';

describe('time of day (B2)', () => {
  it('gives each level its own time, from morning to night', () => {
    expect([1, 2, 3, 4, 5].map((nummer) => timeOfDay({ kind: 'level', nummer }))).toEqual([
      'morgen',
      'mittag',
      'nachmittag',
      'abend',
      'nacht',
    ]);
  });

  it('shows the start screen at noon', () => {
    expect(timeOfDay({ kind: 'start' })).toBe('mittag');
  });

  it('turns the finale from evening into night halfway through', () => {
    expect(timeOfDay({ kind: 'finale', progress: 0 })).toBe('abend');
    expect(timeOfDay({ kind: 'finale', progress: 0.49 })).toBe('abend');
    expect(timeOfDay({ kind: 'finale', progress: 0.5 })).toBe('nacht');
    expect(timeOfDay({ kind: 'finale', progress: 1 })).toBe('nacht');
  });

  it('repeats the cycle for level numbers outside one to five instead of failing', () => {
    expect(timeOfDay({ kind: 'level', nummer: 6 })).toBe('morgen');
    expect(timeOfDay({ kind: 'level', nummer: 0 })).toBe('nacht');
  });

  it('reads the moment off the scene model: level, start page or finished city', () => {
    const lots = [{ nummer: 1 }, { nummer: 2 }, { nummer: 3 }] as never;
    expect(momentFor({ mode: 'level', focus: 2, lots, allCompleted: false })).toEqual({
      kind: 'level',
      nummer: 3,
    });
    expect(momentFor({ mode: 'city', focus: null, lots, allCompleted: false })).toEqual({
      kind: 'start',
    });
    expect(momentFor({ mode: 'city', focus: null, lots, allCompleted: true })).toEqual({
      kind: 'finale',
      progress: 0,
    });
  });

  it('falls back to the start page if the focused lot does not exist', () => {
    expect(momentFor({ mode: 'level', focus: 9, lots: [], allCompleted: false })).toEqual({
      kind: 'start',
    });
  });

  it('has a lighting for every time of day, with lights on only at night', () => {
    const times = ['morgen', 'mittag', 'nachmittag', 'abend', 'nacht'] as const;
    expect(times.filter((t) => LIGHTING[t].lightsOn)).toEqual(['nacht']);
    for (const time of times) expect(LIGHTING[time].sunIntensity).toBeGreaterThan(0);
  });
});

describe('celebration (B5)', () => {
  it('scales with the stars', () => {
    expect(celebrationFor(3)).toEqual({ effect: 'feuerwerk', flag: true, workers: 'jubeln' });
    expect(celebrationFor(2)).toEqual({ effect: 'konfetti', flag: true, workers: 'jubeln' });
    expect(celebrationFor(1)).toEqual({ effect: 'keine', flag: false, workers: 'nicken' });
  });

  it('stays quiet without a star', () => {
    expect(celebrationFor(0)).toEqual({ effect: 'keine', flag: false, workers: 'nicken' });
  });
});

describe('title of the closing screen (B5)', () => {
  it.each([
    [15, 'gold'],
    [14, 'solide'],
    [11, 'solide'],
    [10, 'baustellen'],
    [5, 'baustellen'],
  ] as const)('calls %i of 15 stars «%s»', (stars, title) => {
    expect(cityTitle(stars, 15)).toBe(title);
  });

  it('works for another number of levels', () => {
    expect(cityTitle(9, 9)).toBe('gold');
    expect(cityTitle(6, 9)).toBe('baustellen');
    expect(cityTitle(7, 9)).toBe('solide');
  });
});

describe('decoration per quality step (B3)', () => {
  it('shows nothing decorative but clouds on step 0', () => {
    expect(decorationFor(0)).toEqual({
      clouds: 6,
      planes: false,
      balloon: false,
      birds: false,
      richTraffic: false,
      pedestrians: false,
      ambience: false,
      nightLights: false,
      softShadows: false,
    });
  });

  it('adds planes, traffic and ambience on step 1, everything on step 2', () => {
    expect(decorationFor(1)).toMatchObject({
      clouds: 8,
      planes: true,
      balloon: false,
      softShadows: false,
    });
    expect(Object.values(decorationFor(2)).every((v) => v === true || v === 10)).toBe(true);
  });

  it('keeps the number of clouds between 6 and 10', () => {
    for (const quality of [0, 1, 2] as Quality[]) {
      expect(decorationFor(quality).clouds).toBeGreaterThanOrEqual(6);
      expect(decorationFor(quality).clouds).toBeLessThanOrEqual(10);
    }
  });
});

describe('result sequences (B5, B0.5, B0.6)', () => {
  it('finishes the building, pans, shows the banner and one star after the other', () => {
    const sequence = resultSequence('completed', 3, false);
    expect(sequence.steps.map((s) => s.step)).toEqual([
      'fertigstellung',
      'kameraschwenk',
      'banner',
      'sterne',
    ]);
    expect(sequence.cameraShake).toBe(false);
  });

  it('sends the inspector round a rejected building, without cheering or collapse', () => {
    expect(resultSequence('rejected', 0, false).steps.map((s) => s.step)).toEqual([
      'pruefer',
      'stempel',
    ]);
  });

  it('shakes the camera only for a collapse', () => {
    expect(resultSequence('collapsed', 0, false)).toMatchObject({
      steps: [{ step: 'einsturz' }],
      cameraShake: true,
    });
  });

  it('shows the banner after the swing, the stamp after the round and «Baustopp» during the fall', () => {
    expect(resultSequence('completed', 3, false).bannerAt).toBeCloseTo(2.2);
    expect(resultSequence('rejected', 0, false).bannerAt).toBeCloseTo(2);
    expect(resultSequence('collapsed', 0, false).bannerAt).toBeCloseTo(1.2);
    for (const outcome of ['completed', 'rejected', 'collapsed'] as const) {
      const sequence = resultSequence(outcome, 3, false);
      expect(sequence.bannerAt).toBeLessThan(sequence.seconds);
    }
  });

  it('never holds the player up for more than four seconds', () => {
    for (const outcome of ['completed', 'rejected', 'collapsed'] as const) {
      for (const stars of [0, 1, 2, 3] as const) {
        const sequence = resultSequence(outcome, stars, false);
        expect(sequence.seconds).toBeLessThanOrEqual(TUNING.sequence.maxSeconds);
        expect(sequence.seconds).toBeCloseTo(sequence.steps.reduce((sum, s) => sum + s.seconds, 0));
      }
    }
  });

  it('shows only the final picture with reduced motion: no pan, no shake', () => {
    for (const outcome of ['completed', 'rejected', 'collapsed'] as const) {
      expect(resultSequence(outcome, 3, true)).toEqual({
        steps: [{ step: 'endbild', seconds: 0.2 }],
        seconds: 0.2,
        bannerAt: 0,
        cameraShake: false,
      });
    }
  });
});

describe('planes (B3)', () => {
  it('keeps planes out of the middle while the player decides', () => {
    expect(planeMayCrossCentre('situation')).toBe(false);
    expect(planeMayCrossCentre('feedback')).toBe(true);
    expect(planeMayCrossCentre(null)).toBe(true);
  });

  it('sends a plane every 20 to 40 seconds, also for values outside 0 to 1', () => {
    expect(nextPlaneDelay(0)).toBe(20);
    expect(nextPlaneDelay(0.5)).toBe(30);
    expect(nextPlaneDelay(1)).toBe(40);
    expect(nextPlaneDelay(-3)).toBe(20);
    expect(nextPlaneDelay(7)).toBe(40);
  });
});

describe('keeping the building in view (B3)', () => {
  it('routes a plane clear of the building while a level is played, on either side', () => {
    const { clearance, spread } = TUNING.decoration.plane;
    for (const r of [0, 0.1, 0.49, 0.5, 0.9, 0.999, 1, -2, 5]) {
      const offset = planeLateralOffset(r, false);
      expect(Math.abs(offset)).toBeGreaterThanOrEqual(clearance);
      expect(Math.abs(offset)).toBeLessThanOrEqual(clearance + spread);
    }
    expect(planeLateralOffset(0.2, false)).toBeLessThan(0);
    expect(planeLateralOffset(0.8, false)).toBeGreaterThan(0);
  });

  it('lets a plane fly anywhere, also straight over the middle, when nobody decides', () => {
    expect(planeLateralOffset(0.5, true)).toBe(0);
    expect(planeLateralOffset(0, true)).toBeLessThan(-TUNING.decoration.plane.clearance);
  });

  it('hides a cloud over the building, shows it fully far away and fades in between', () => {
    const { hideWithin, fullBeyond } = TUNING.decoration.cloud;
    expect(cloudVisibility(0)).toBe(0);
    expect(cloudVisibility(hideWithin)).toBe(0);
    expect(cloudVisibility(fullBeyond)).toBe(1);
    expect(cloudVisibility(1000)).toBe(1);
    const middle = cloudVisibility((hideWithin + fullBeyond) / 2);
    expect(middle).toBeCloseTo(0.5, 5);
  });

  it('shows every cloud when there is nothing to keep clear', () => {
    expect(cloudVisibility(null)).toBe(1);
  });
});

describe('decoration randomness (B0.4)', () => {
  it('is repeatable and stays in [0, 1)', () => {
    const a = createDecorRandom(7);
    const b = createDecorRandom(7);
    const values = Array.from({ length: 500 }, () => a());
    expect(values).toEqual(Array.from({ length: 500 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(490);
  });

  it('works with a seed of zero', () => {
    const random = createDecorRandom(0);
    expect(random()).not.toBe(random());
  });

  it('never moves the game: same seed, same draw, with and without decoration running', () => {
    const level = makeLevel();
    const quiet = startRun(level, 4711);

    const decoration = createDecorRandom(4711);
    for (let i = 0; i < 1000; i++) decoration();
    const busy = startRun(level, 4711);
    for (let i = 0; i < 1000; i++) decoration();

    expect(busy.situationIds).toEqual(quiet.situationIds);
    expect(busy.optionOrders).toEqual(quiet.optionOrders);
  });
});
