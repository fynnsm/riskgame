import { describe, expect, it } from 'vitest';
import type { OptionId } from '../../src/content/schema.ts';
import { BALANCE } from '../../src/core/balance.ts';
import { drawSituations } from '../../src/core/draw.ts';
import type { LevelRun } from '../../src/core/game.ts';
import {
  currentOptions,
  currentSituation,
  findOption,
  findSituation,
  GameError,
  isRunConsistent,
  replay,
  startRun,
  step,
} from '../../src/core/game.ts';
import {
  applyEffects,
  criticalGauges,
  isCollapsed,
  lowestValue,
  startGauges,
  weakestGauge,
} from '../../src/core/gauges.ts';
import { buildingModel, computeLean } from '../../src/core/lean.ts';
import { createRng, shuffle } from '../../src/core/rng.ts';
import { clone, makeLevel } from './fixtures.ts';

const level = makeLevel();

/** Moves a fresh run to the first situation. */
function atFirstSituation(seed = 1): LevelRun {
  let run = startRun(level, seed);
  run = step(run, level, { type: 'continue' });
  for (let i = 0; i < level.theorie.length; i++) run = step(run, level, { type: 'continue' });
  return run;
}

function play(run: LevelRun, choices: readonly OptionId[]): LevelRun {
  let current = run;
  for (const optionId of choices) {
    current = step(current, level, { type: 'choose', optionId });
    current = step(current, level, { type: 'continue' });
  }
  return current;
}

describe('rng', () => {
  it('yields the same sequence for the same seed and values in [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const values = Array.from({ length: 200 }, () => a());
    expect(values).toEqual(Array.from({ length: 200 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('yields different sequences for different seeds', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });

  it('shuffles into a permutation without touching the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = shuffle(input, createRng(7));
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...result].sort()).toEqual(input);
    expect(result).not.toEqual(input);
  });
});

describe('drawSituations (F-105, F-106)', () => {
  it('draws the requested number without duplicates', () => {
    for (let seed = 0; seed < 50; seed++) {
      const ids = drawSituations(level.situationen, 6, createRng(seed)).map((s) => s.id);
      expect(new Set(ids).size).toBe(6);
    }
  });

  it('draws the same situations for the same seed and others for another seed', () => {
    const ids = (seed: number) =>
      drawSituations(level.situationen, 6, createRng(seed)).map((s) => s.id);
    expect(ids(5)).toEqual(ids(5));
    expect(ids(5)).not.toEqual(ids(6));
  });

  it('puts recently played situations last, the most recent one furthest back', () => {
    const recent = ['L1-S01', 'L1-S02', 'L1-S03', 'L1-S04', 'L1-S05', 'L1-S06'];
    for (let seed = 0; seed < 20; seed++) {
      const ids = drawSituations(level.situationen, 6, createRng(seed), recent).map((s) => s.id);
      expect(ids.slice(0, 2).sort()).toEqual(['L1-S07', 'L1-S08']);
      expect(ids.slice(2)).toEqual(['L1-S01', 'L1-S02', 'L1-S03', 'L1-S04']);
    }
  });

  it('refuses to draw more situations than the pool holds', () => {
    expect(() => drawSituations(level.situationen, 9, createRng(1))).toThrow(/Cannot draw 9/);
  });
});

describe('gauges (F-201, F-203, F-204)', () => {
  it('starts every gauge at the configured value', () => {
    expect(startGauges()).toEqual({ budget: 60, zeit: 60, stabilitaet: 60 });
  });

  it('applies step sizes as points', () => {
    const { gauges, delta } = applyEffects(startGauges(), {
      budget: '-klein',
      zeit: '-mittel',
      stabilitaet: '+gross',
    });
    expect(gauges).toEqual({ budget: 54, zeit: 46, stabilitaet: 86 });
    expect(delta).toEqual({ budget: -6, zeit: -14, stabilitaet: 26 });
  });

  it('never exceeds 100 and reports what really changed', () => {
    const { gauges, delta } = applyEffects(
      { budget: 95, zeit: 100, stabilitaet: 50 },
      { budget: '+gross', zeit: '+klein', stabilitaet: '0' },
    );
    expect(gauges).toEqual({ budget: 100, zeit: 100, stabilitaet: 50 });
    expect(delta).toEqual({ budget: 5, zeit: 0, stabilitaet: 0 });
  });

  it('never drops below 0', () => {
    const { gauges, delta } = applyEffects(
      { budget: 5, zeit: 50, stabilitaet: 50 },
      { budget: '-gross', zeit: '0', stabilitaet: '0' },
    );
    expect(gauges.budget).toBe(0);
    expect(delta.budget).toBe(-5);
  });

  it('collapses exactly at 0, not at 1', () => {
    expect(isCollapsed({ budget: 1, zeit: 1, stabilitaet: 1 })).toBe(false);
    expect(isCollapsed({ budget: 1, zeit: 0, stabilitaet: 1 })).toBe(true);
  });

  it('calls a gauge critical below 30, not at 30 (A6)', () => {
    expect(criticalGauges({ budget: 30, zeit: 29, stabilitaet: 100 })).toEqual(['zeit']);
    expect(criticalGauges({ budget: 0, zeit: 60, stabilitaet: 12 })).toEqual([
      'budget',
      'stabilitaet',
    ]);
    expect(criticalGauges({ budget: 54, zeit: 42, stabilitaet: 100 })).toEqual([]);
  });

  it('names the weakest gauge and resolves ties in a fixed order', () => {
    expect(weakestGauge({ budget: 50, zeit: 20, stabilitaet: 30 })).toBe('zeit');
    expect(weakestGauge({ budget: 40, zeit: 40, stabilitaet: 40 })).toBe('budget');
    expect(lowestValue({ budget: 50, zeit: 20, stabilitaet: 30 })).toBe(20);
  });
});

describe('lean (F-205, F-206)', () => {
  it('stands upright and calm at the start', () => {
    expect(computeLean(startGauges())).toMatchObject({ tilt: 0, wobble: 0 });
  });

  it('tilts more the lower the weakest gauge is', () => {
    const tilts = [60, 45, 30, 15, 0].map(
      (zeit) => computeLean({ budget: 70, zeit, stabilitaet: 70 }).tilt,
    );
    for (let i = 1; i < tilts.length; i++) expect(tilts[i]).toBeGreaterThan(tilts[i - 1] as number);
  });

  it('tilts more for one-sided gauges than for evenly low ones', () => {
    const even = computeLean({ budget: 40, zeit: 40, stabilitaet: 40 });
    const lopsided = computeLean({ budget: 100, zeit: 100, stabilitaet: 40 });
    expect(lopsided.tilt).toBeGreaterThan(even.tilt);
  });

  it('wobbles only below its own, lower threshold', () => {
    expect(computeLean({ budget: 50, zeit: 70, stabilitaet: 70 }).wobble).toBe(0);
    expect(computeLean({ budget: 20, zeit: 70, stabilitaet: 70 }).wobble).toBeGreaterThan(0);
  });

  it('keeps tilt and wobble within 0 and 1 at the extremes', () => {
    const lean = computeLean({ budget: 0, zeit: 100, stabilitaet: 100 });
    expect(lean.tilt).toBeLessThanOrEqual(1);
    expect(lean.wobble).toBe(1);
  });

  it('leans in the direction of the weakest gauge', () => {
    expect(computeLean({ budget: 10, zeit: 70, stabilitaet: 70 }).dirX).toBe(-1);
    expect(computeLean({ budget: 70, zeit: 10, stabilitaet: 70 }).dirX).toBe(1);
    expect(computeLean({ budget: 70, zeit: 70, stabilitaet: 10 }).dirZ).toBeGreaterThan(0);
  });

  it('depends on the gauges only, not on how often something was chosen', () => {
    const gauges = { budget: 30, zeit: 60, stabilitaet: 80 };
    expect(computeLean(gauges)).toEqual(computeLean({ ...gauges }));
  });

  it('builds one floor per decision and accumulates the shift', () => {
    const model = buildingModel('turm', [
      { gauges: { budget: 70, zeit: 70, stabilitaet: 70 }, rating: 'gut' },
      { gauges: { budget: 70, zeit: 30, stabilitaet: 70 }, rating: 'vertretbar' },
      { gauges: { budget: 70, zeit: 10, stabilitaet: 70 }, rating: 'riskant' },
    ]);
    expect(model.floors).toHaveLength(3);
    expect(model.floors[0]).toEqual({ offsetX: 0, offsetZ: 0, damage: 0 });
    // The poorer the decision, the more battered the floor it built.
    expect(model.floors.map((f) => f.damage)).toEqual([0, 0.4, 1]);
    expect(model.floors[2]?.offsetX).toBeGreaterThan(model.floors[1]?.offsetX as number);
    expect(model.tiltDegrees).toBeGreaterThan(0);
    expect(model.tiltDegrees).toBeLessThanOrEqual(BALANCE.lean.maxTiltDegrees);
  });

  it('warns exactly about the gauges that are critical after the last decision (A6)', () => {
    const calm = buildingModel('buero', [
      { gauges: { budget: 54, zeit: 42, stabilitaet: 100 }, rating: 'gut' },
    ]);
    expect(calm.warnings).toEqual([]);
    const alarmed = buildingModel('buero', [
      { gauges: { budget: 10, zeit: 80, stabilitaet: 80 }, rating: 'riskant' },
      { gauges: { budget: 40, zeit: 20, stabilitaet: 80 }, rating: 'gut' },
    ]);
    // Only the current state counts: budget has recovered, time is now short.
    expect(alarmed.warnings).toEqual(['zeit']);
    expect(buildingModel('buero', []).warnings).toEqual([]);
  });

  it('returns an upright, empty model for a building without floors', () => {
    expect(buildingModel('buero', [])).toMatchObject({ floors: [], tiltDegrees: 0, wobble: 0 });
  });
});

describe('game flow (F-104, F-202, F-207, F-208)', () => {
  it('walks through briefing, theory, situations and result', () => {
    let run = startRun(level, 3);
    expect(run.phase).toBe('briefing');
    expect(run.situationIds).toHaveLength(6);
    run = step(run, level, { type: 'continue' });
    expect(run).toMatchObject({ phase: 'theory', theoryIndex: 0 });
    run = step(run, level, { type: 'continue' });
    run = step(run, level, { type: 'continue' });
    expect(run).toMatchObject({ phase: 'theory', theoryIndex: 2 });
    run = step(run, level, { type: 'continue' });
    expect(run).toMatchObject({ phase: 'situation', step: 0 });

    for (let i = 0; i < 6; i++) {
      expect(currentSituation(run, level).id).toBe(run.situationIds[i]);
      run = step(run, level, { type: 'choose', optionId: 'A' });
      expect(run.phase).toBe('feedback');
      expect(run.history).toHaveLength(i + 1);
      run = step(run, level, { type: 'continue' });
    }
    expect(run).toMatchObject({ phase: 'result', outcome: 'completed' });
    expect(run.gauges).toEqual({ budget: 24, zeit: 24, stabilitaet: 100 });
  });

  it('records rating, real change and gauges for each choice', () => {
    const run = step(atFirstSituation(), level, { type: 'choose', optionId: 'B' });
    expect(run.history[0]).toMatchObject({
      optionId: 'B',
      rating: 'riskant',
      delta: { budget: 0, zeit: 6, stabilitaet: -26 },
      gaugesAfter: { budget: 60, zeit: 66, stabilitaet: 34 },
    });
  });

  it('shows the options in a shuffled order that is fixed by the seed', () => {
    const run = atFirstSituation(11);
    const again = atFirstSituation(11);
    expect(run.optionOrders).toEqual(again.optionOrders);
    for (const order of run.optionOrders) expect([...order].sort()).toEqual(['A', 'B', 'C']);
    expect(currentOptions(run, level).map((o) => o.id)).toEqual(run.optionOrders[0]);
    // Across many seeds the good option must not sit in the same place every time.
    const firstPositions = new Set(
      Array.from({ length: 30 }, (_, seed) => atFirstSituation(seed).optionOrders[0]?.indexOf('A')),
    );
    expect(firstPositions.size).toBe(3);
  });

  it('collapses the moment a gauge reaches zero and ends the level early (F-204)', () => {
    let run = atFirstSituation();
    run = play(run, ['B', 'B']);
    expect(run).toMatchObject({ phase: 'situation', outcome: 'running' });
    expect(run.gauges.stabilitaet).toBe(8);
    run = step(run, level, { type: 'choose', optionId: 'B' });
    expect(run).toMatchObject({ phase: 'feedback', outcome: 'collapsed' });
    expect(run.gauges.stabilitaet).toBe(0);
    run = step(run, level, { type: 'continue' });
    expect(run.phase).toBe('result');
    expect(run.history).toHaveLength(3);
  });

  it('rejects a building that stands but was built on too many poor decisions (F-211)', () => {
    // 6 of 12 points: below the 65 % the final inspection asks for, and no gauge at zero.
    const run = play(atFirstSituation(), ['B', 'C', 'B', 'C', 'A', 'A']);
    expect(run).toMatchObject({ phase: 'result', outcome: 'rejected' });
    expect(run.gauges).toEqual({ budget: 36, zeit: 32, stabilitaet: 48 });
  });

  it('accepts a building at exactly the required share of points', () => {
    // 8 of 12 points is 66.7 %; one point less (7 of 12) fails.
    expect(play(atFirstSituation(), ['A', 'A', 'A', 'C', 'C', 'B']).outcome).toBe('completed');
    expect(play(atFirstSituation(), ['A', 'A', 'A', 'C', 'B', 'B']).outcome).toBe('rejected');
  });

  it('skips the theory only when the run allows it (F-505)', () => {
    const first = startRun(level, 1);
    expect(() => step(first, level, { type: 'skipTheory' })).toThrow(GameError);
    const repeat = startRun(level, 1, { canSkipTheory: true });
    expect(step(repeat, level, { type: 'skipTheory' })).toMatchObject({
      phase: 'situation',
      step: 0,
    });
    const inTheory = step(repeat, level, { type: 'continue' });
    expect(step(inTheory, level, { type: 'skipTheory' }).phase).toBe('situation');
  });

  it('goes straight to the situations if a level has no theory', () => {
    const bare = { ...level, theorie: [] };
    expect(step(startRun(bare, 1), bare, { type: 'continue' }).phase).toBe('situation');
  });

  it('rejects actions that do not fit the phase', () => {
    const briefing = startRun(level, 1);
    const situation = atFirstSituation();
    const result = play(situation, ['A', 'A', 'A', 'A', 'A', 'A']);
    expect(() => step(briefing, level, { type: 'choose', optionId: 'A' })).toThrow(/Cannot choose/);
    expect(() => step(situation, level, { type: 'continue' })).toThrow(/Cannot continue/);
    expect(() => step(situation, level, { type: 'skipTheory' })).toThrow(/Cannot skip/);
    expect(() => step(result, level, { type: 'continue' })).toThrow(/Cannot continue/);
    expect(() => step(briefing, makeLevel(2), { type: 'continue' })).toThrow(/belongs to level-1/);
  });

  it('fails loudly on unknown situations and options', () => {
    expect(() => findSituation(level, 'L1-S99')).toThrow(GameError);
    const situation = findSituation(level, 'L1-S01');
    const broken = { ...situation, optionen: situation.optionen.slice(0, 2) };
    expect(() => findOption(broken, 'C')).toThrow(GameError);
    expect(() => currentSituation({ ...atFirstSituation(), step: 99 }, level)).toThrow(GameError);
  });
});

describe('replay (L-07, Q-06)', () => {
  it('reaches the same end state as the original run from seed and choices alone', () => {
    const recent = ['L1-S03', 'L1-S04'];
    let original = startRun(level, 987654321, { recentIds: recent });
    original = step(original, level, { type: 'continue' });
    for (let i = 0; i < 3; i++) original = step(original, level, { type: 'continue' });
    const choices: OptionId[] = ['A', 'C', 'B', 'A', 'C', 'A'];
    original = play(original, choices);

    const replayed = replay(level, 987654321, recent, choices);
    expect(replayed.gauges).toEqual(original.gauges);
    expect(replayed.history).toEqual(original.history);
    expect(replayed.situationIds).toEqual(original.situationIds);
    expect(replayed.outcome).toBe(original.outcome);
    expect(replay(level, 987654321, recent, choices)).toEqual(replayed);
  });

  it('stops at the collapse even if more choices follow', () => {
    const run = replay(level, 5, [], ['B', 'B', 'B', 'B', 'A', 'A']);
    expect(run).toMatchObject({ phase: 'result', outcome: 'collapsed' });
    expect(run.history).toHaveLength(3);
  });

  it('stays in the open situation if the choices end early', () => {
    expect(replay(level, 5, [], ['A'])).toMatchObject({ phase: 'situation', step: 1 });
  });
});

describe('isRunConsistent (F-704)', () => {
  const run = atFirstSituation(9);

  it('accepts a run that matches the level', () => {
    expect(isRunConsistent(run, level)).toBe(true);
  });

  it.each<[string, (r: LevelRun) => void]>([
    ['another level', (r) => void (r.levelId = 'level-2')],
    ['a situation that no longer exists', (r) => void (r.situationIds[0] = 'L1-S99')],
    ['too few situations', (r) => void r.situationIds.pop()],
    ['option orders missing', (r) => void r.optionOrders.pop()],
    ['an option order with a missing option', (r) => void (r.optionOrders[0] = ['A', 'B'])],
    ['an option order with a duplicate', (r) => void (r.optionOrders[0] = ['A', 'A', 'B'])],
    ['a step beyond the end', (r) => void (r.step = 6)],
    ['a negative step', (r) => void (r.step = -1)],
    ['a theory index beyond the end', (r) => void (r.theoryIndex = 3)],
    [
      'more decisions than situations',
      (r) => void (r.history = Array.from({ length: 7 }, () => r.history[0]!)),
    ],
  ])('rejects %s', (_name, mutate) => {
    const broken = clone(run);
    mutate(broken);
    expect(isRunConsistent(broken, level)).toBe(false);
  });
});
