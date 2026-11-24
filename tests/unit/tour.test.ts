import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectPlayable, withoutTour } from '../../src/content/load.ts';
import { tourType } from '../../src/content/mechanics-rules.ts';
import type { Level, OptionId } from '../../src/content/schema.ts';
import { validateLevel } from '../../src/content/validate.ts';
import { BALANCE } from '../../src/core/balance.ts';
import type { LevelRun } from '../../src/core/game.ts';
import { GameError, isRunConsistent, replay, startRun, step } from '../../src/core/game.ts';
import { createRng } from '../../src/core/rng.ts';
import { sceneModel } from '../../src/core/scene.ts';
import { acceptance, isAccepted, starsFor } from '../../src/core/scoring.ts';
import { playRandom, playStrategy, simulateLevel } from '../../src/core/simulate.ts';
import {
  drawTour,
  judgedCount,
  registeredRisks,
  tourGrade,
  tourReview,
} from '../../src/core/tour.ts';
import { buildErrorReport, extractReplay } from '../../src/logging/report.ts';
import { createLogger } from '../../src/logging/logger.ts';
import { createLocalStorageStore } from '../../src/storage/local-storage-store.ts';
import { emptyProgress, withRun } from '../../src/core/progress.ts';
import { clone, makeLevel, makeMechanicsLevel, memoryStorage, RULES } from './fixtures.ts';

const level = makeMechanicsLevel();
const pool = level.rundgang?.stellen ?? [];
const START = BALANCE.gauge.start;
const KLEIN = BALANCE.effectPoints.klein;

/** A run that stands at the start of the tour. */
function atTour(seed = 7, of: Level = level): LevelRun {
  return step(startRun(of, seed, { canSkipTheory: true }), of, { type: 'skipTheory' });
}

/** Judges every place of the tour, the first `correct` ones rightly and the rest wrongly. */
function judge(run: LevelRun, correct: number, of: Level = level): LevelRun {
  let next = run;
  (run.tour?.siteIds ?? []).forEach((siteId, i) => {
    const truth = of.rundgang?.stellen.find((s) => s.id === siteId)?.istRisiko ?? false;
    next = step(next, of, { type: 'classify', siteId, risk: i < correct ? truth : !truth });
  });
  return next;
}

function finished(correct: number, seed = 7): LevelRun {
  return step(judge(atTour(seed), correct), level, { type: 'finishTour' });
}

function playAll(run: LevelRun, choices: readonly OptionId[]): LevelRun {
  let next = run;
  for (const optionId of choices) {
    next = step(next, level, { type: 'choose', optionId });
    next = step(next, level, { type: 'continue' });
  }
  return next;
}

describe('drawTour (M-11)', () => {
  it('draws three found risks, two false alarms, two missed risks and one plain place', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const drawn = drawTour(pool, BALANCE.tour.draw, createRng(seed));
      const types = drawn.map(tourType);
      expect(drawn).toHaveLength(8);
      expect(types.filter((t) => t === 'gefunden')).toHaveLength(3);
      expect(types.filter((t) => t === 'fehlalarm')).toHaveLength(2);
      expect(types.filter((t) => t === 'uebersehen')).toHaveLength(2);
      expect(types.filter((t) => t === 'unauffaellig')).toHaveLength(1);
      expect(new Set(drawn.map((s) => s.ort)).size).toBe(8);
      expect(new Set(drawn.map((s) => s.id)).size).toBe(8);
    }
  });

  it('gives the same tour for the same seed and different tours for different seeds', () => {
    const ids = (seed: number) =>
      drawTour(pool, BALANCE.tour.draw, createRng(seed)).map((s) => s.id);
    expect(ids(42)).toEqual(ids(42));
    const distinct = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => ids(seed).join()));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('refuses a pool from which no tour can be drawn', () => {
    const samePlace = pool.map((s) => ({ ...s, ort: 'lager' as const }));
    expect(() => drawTour(samePlace, BALANCE.tour.draw, createRng(1))).toThrow(/Cannot draw/);
    expect(() => drawTour(pool.slice(0, 5), BALANCE.tour.draw, createRng(1))).toThrow();
  });

  it('can be drawn from the real level 1 for many seeds', () => {
    const file = join(import.meta.dirname, '..', '..', 'content', 'levels', 'level-1.json');
    const result = validateLevel(JSON.parse(readFileSync(file, 'utf8')), 'level-1.json', RULES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const real = result.level;
    expect(real.rundgang?.stellen).toHaveLength(12);
    for (let seed = 1; seed <= 500; seed++) {
      expect(startRun(real, seed).tour?.siteIds).toHaveLength(8);
    }
  });
});

describe('tour in the run (M-01, M-03, M-10)', () => {
  it('has no tour in a level without the block', () => {
    const plain = makeLevel();
    const run = step(startRun(plain, 7, { canSkipTheory: true }), plain, { type: 'skipTheory' });
    expect(run.tour).toBeNull();
    expect(run.phase).toBe('situation');
  });

  it('leaves the situations of a seed as they were before the tour existed', () => {
    const plain = startRun(withoutTour(level), 20261124);
    const toured = startRun(level, 20261124);
    expect(toured.situationIds).toEqual(plain.situationIds);
    expect(toured.optionOrders).toEqual(plain.optionOrders);
    expect(toured.tour?.siteIds).toHaveLength(8);
  });

  it('comes after the theory and before the first situation', () => {
    let run = startRun(level, 7);
    run = step(run, level, { type: 'continue' });
    expect(run.phase).toBe('theory');
    for (let i = 0; i < level.theorie.length; i++) run = step(run, level, { type: 'continue' });
    expect(run.phase).toBe('tour');
    run = step(run, level, { type: 'finishTour' });
    expect(run.phase).toBe('tourResult');
    run = step(run, level, { type: 'continue' });
    expect(run).toMatchObject({ phase: 'situation', step: 0 });
  });

  it('also comes when the theory is skipped or the level has none', () => {
    expect(atTour().phase).toBe('tour');
    const bare = { ...level, theorie: [] };
    expect(step(startRun(bare, 7), bare, { type: 'continue' }).phase).toBe('tour');
  });
});

describe('judging the places (M-12)', () => {
  it('records a judgement and lets the player change it until the tour is finished', () => {
    const start = atTour();
    const [first, second] = start.tour?.siteIds ?? [];
    if (!first || !second) throw new Error('fixture has no tour');
    let run = step(start, level, { type: 'classify', siteId: first, risk: true });
    expect(run.tour?.judgements).toEqual({ [first]: true });
    expect(judgedCount(run.tour ?? start.tour!)).toBe(1);
    run = step(run, level, { type: 'classify', siteId: first, risk: false });
    run = step(run, level, { type: 'classify', siteId: second, risk: true });
    expect(run.tour?.judgements).toEqual({ [first]: false, [second]: true });
    expect(judgedCount(run.tour!)).toBe(2);
    // The original state is untouched: the step is pure.
    expect(start.tour?.judgements).toEqual({});
  });

  it('refuses a place that is not part of the tour and any judgement outside the tour', () => {
    const run = atTour();
    expect(() => step(run, level, { type: 'classify', siteId: 'L9-R99', risk: true })).toThrow(
      GameError,
    );
    const siteId = run.tour?.siteIds[0] ?? '';
    const done = step(run, level, { type: 'finishTour' });
    expect(() => step(done, level, { type: 'classify', siteId, risk: true })).toThrow(GameError);
    expect(() => step(done, level, { type: 'finishTour' })).toThrow(GameError);
    expect(() => step(startRun(level, 7), level, { type: 'finishTour' })).toThrow(GameError);
    expect(() => step(run, level, { type: 'choose', optionId: 'A' })).toThrow(GameError);
  });

  it('counts places left open as «Kein Risiko» when the tour is finished at once', () => {
    const run = step(atTour(), level, { type: 'finishTour' });
    // Three of the eight drawn places are no risk; only those are right.
    expect(run.tour?.result).toMatchObject({ correct: 3, grade: 'poor', points: 0 });
    expect(registeredRisks(run.tour)).toEqual([]);
    expect(tourReview(run.tour!, level).every((item) => !item.judged && !item.judgedRisk)).toBe(
      true,
    );
  });
});

describe('effect of the tour (M-13)', () => {
  it.each([
    [8, 'good', 2, KLEIN],
    [7, 'good', 2, KLEIN],
    [6, 'fair', 1, 0],
    [5, 'fair', 1, 0],
    [4, 'poor', 0, -KLEIN],
    [0, 'poor', 0, -KLEIN],
  ] as const)('%i correct: %s, %i points, stability %i', (correct, grade, points, change) => {
    const run = finished(correct);
    expect(run.tour?.result).toEqual({
      correct,
      grade,
      points,
      delta: { budget: 0, zeit: 0, stabilitaet: change },
    });
    expect(run.gauges).toEqual({ budget: START, zeit: START, stabilitaet: START + change });
    expect(tourGrade(correct)).toBe(grade);
  });

  it('gives a poor result to whoever simply trusts the drone', () => {
    let run = atTour();
    for (const siteId of run.tour?.siteIds ?? []) {
      const marked = pool.find((s) => s.id === siteId)?.drohne === 'markiert';
      run = step(run, level, { type: 'classify', siteId, risk: marked });
    }
    run = step(run, level, { type: 'finishTour' });
    // Right on the three found risks and the plain place, wrong on alarms and missed risks.
    expect(run.tour?.result).toMatchObject({ correct: 4, grade: 'poor' });
  });

  it('shows in the resolution what was right and whether the drone was right (M-14)', () => {
    const run = finished(8);
    const review = tourReview(run.tour!, level);
    expect(review).toHaveLength(8);
    expect(review.every((item) => item.correct && item.judged)).toBe(true);
    for (const item of review) {
      const type = tourType(item.site);
      expect(item.droneRight).toBe(type === 'gefunden' || type === 'unauffaellig');
      expect(item.judgedRisk).toBe(item.site.istRisiko);
    }
    expect(review.filter((item) => !item.droneRight)).toHaveLength(4);
  });
});

describe('tour and final inspection (M-13, F-211)', () => {
  it('adds the points of the tour to those of the decisions', () => {
    // Six decisions and a tour: 12 + 2 points, of which 65 % rounded up are needed.
    expect(acceptance(atTour())).toEqual({ points: 0, max: 14, required: 10 });
    expect(acceptance(finished(8))).toEqual({ points: 2, max: 14, required: 10 });
    expect(acceptance(finished(5))).toEqual({ points: 1, max: 14, required: 10 });
    expect(acceptance(finished(2))).toEqual({ points: 0, max: 14, required: 10 });
  });

  it('lets a good tour decide a close inspection', () => {
    // Four good and two risky decisions give 8 points: enough only with the 2 of a good tour.
    const choices: OptionId[] = ['A', 'A', 'A', 'A', 'B', 'B'];
    const play = (correct: number) =>
      playAll(step(finished(correct), level, { type: 'continue' }), choices);
    // The fixture's option A is good and B is risky whatever the order shown.
    const good = play(8);
    const poor = play(0);
    expect(acceptance(good).points).toBe(10);
    expect(good.outcome).toBe('completed');
    expect(isAccepted(good)).toBe(true);
    expect(acceptance(poor).points).toBe(8);
    expect(poor.outcome).toBe('rejected');
    expect(starsFor(poor)).toBe(0);
  });

  it('counts the tour for the stars', () => {
    const allGood: OptionId[] = ['A', 'A', 'A', 'A', 'A', 'A'];
    const play = (correct: number) =>
      playAll(step(finished(correct), level, { type: 'continue' }), allGood);
    // 14 of 14 points give three stars; 12 of 14 are below the bar of 90 %.
    expect(starsFor(play(8))).toBe(3);
    expect(starsFor(play(0))).toBe(2);
  });
});

describe('replay with a tour (L-07, M-03)', () => {
  it('repeats tour and decisions from seed, register and choices alone', () => {
    const choices: OptionId[] = ['A', 'C', 'B', 'A', 'C', 'A'];
    let original = judge(atTour(31337), 6);
    original = step(original, level, { type: 'finishTour' });
    const risks = registeredRisks(original.tour);
    original = playAll(step(original, level, { type: 'continue' }), choices);

    const replayed = replay(level, 31337, [], choices, risks);
    expect(replayed.gauges).toEqual(original.gauges);
    expect(replayed.history).toEqual(original.history);
    expect(replayed.tour?.result).toEqual(original.tour?.result);
    expect(replayed.tour?.siteIds).toEqual(original.tour?.siteIds);
    expect(replayed.outcome).toBe(original.outcome);
  });

  it('stops in the tour if the report holds no finished tour', () => {
    const run = replay(level, 31337, [], ['A', 'A']);
    expect(run.phase).toBe('tour');
    expect(run.history).toEqual([]);
    expect(registeredRisks(run.tour)).toBeNull();
    expect(registeredRisks(null)).toBeNull();
  });

  it('carries the register through the error report', () => {
    const run = finished(8, 99);
    const risks = registeredRisks(run.tour);
    const report = buildErrorReport({
      version: '0.1.0',
      commit: 'abc1234',
      time: '2026-11-24T20:00:00.000Z',
      userAgent: 'TestBrowser/1.0',
      viewport: { width: 390, height: 844 },
      renderer: 'none',
      render: { fpsAverage: null, fpsMinimum: null, quality: null },
      playTimeMs: 0,
      levels: [],
      run: {
        levelId: run.levelId,
        seed: run.seed,
        recentIds: run.recentIds,
        choices: [],
        tour: risks,
        phase: run.phase,
        outcome: run.outcome,
        gauges: { ...run.gauges },
      },
      entries: [],
    });
    const data = extractReplay(report);
    expect(data?.tour).toEqual(risks);
    expect(risks).toHaveLength(5);
    const again = replay(level, 99, [], [], data?.tour ?? null);
    expect(again.tour?.result).toEqual(run.tour?.result);
    expect(again.phase).toBe('situation');
  });

  it('reads a report written before the tour existed', () => {
    const old = 'REPLAY: {"levelId":"level-1","seed":5,"recentIds":[],"choices":["A"]}';
    expect(extractReplay(old)).toEqual({
      levelId: 'level-1',
      seed: 5,
      recentIds: [],
      choices: ['A'],
      tour: null,
    });
  });
});

describe('stored run with a tour (F-704, M-06)', () => {
  it('accepts a run in every phase of the tour', () => {
    expect(isRunConsistent(startRun(level, 7), level)).toBe(true);
    expect(isRunConsistent(judge(atTour(), 3), level)).toBe(true);
    expect(isRunConsistent(finished(6), level)).toBe(true);
    expect(isRunConsistent(step(finished(6), level, { type: 'continue' }), level)).toBe(true);
  });

  const broken: [string, (run: LevelRun) => void][] = [
    ['a place that no longer exists', (run) => void (run.tour!.siteIds[0] = 'L1-R99')],
    ['a place drawn twice', (run) => void (run.tour!.siteIds[1] = run.tour!.siteIds[0]!)],
    ['too few places', (run) => void run.tour!.siteIds.pop()],
    ['a judgement of a place not drawn', (run) => void (run.tour!.judgements['L1-R99'] = true)],
    ['a result before the tour is finished', (run) => void (run.phase = 'tour')],
    ['no tour while in the tour', (run) => void ((run.phase = 'tour'), (run.tour = null))],
  ];
  it.each(broken)('rejects %s', (_name, damage) => {
    const run = clone(finished(6));
    damage(run);
    expect(isRunConsistent(run, level)).toBe(false);
  });

  it('rejects a missing result after the tour and a tour the level does not have', () => {
    const open = clone(atTour());
    open.phase = 'situation';
    expect(isRunConsistent(open, level)).toBe(false);
    expect(isRunConsistent(finished(6), withoutTour(level))).toBe(false);
  });

  it('saves and loads a run in the tour, and drops a run whose tour is damaged', () => {
    const logger = createLogger({ now: () => 0 });
    const storage = memoryStorage();
    const store = createLocalStorageStore(() => storage, logger);
    const run = finished(7);
    store.save(withRun(emptyProgress(), run));
    expect(store.load().progress.currentRun).toEqual(run);

    const key = storage.key(0) ?? '';
    const raw = JSON.parse(storage.getItem(key) ?? '{}');
    raw.currentRun.tour.result.grade = 'brilliant';
    storage.setItem(key, JSON.stringify(raw));
    const outcome = store.load();
    expect(outcome.status).toBe('migrated');
    expect(outcome.droppedRun).toBe(true);
    expect(outcome.progress.currentRun).toBeNull();
  });
});

describe('tour content in a published build (F-906)', () => {
  it('shows only released places and keeps the tour if it can still be drawn', () => {
    const draft = clone(level);
    // One of four found risks may be a draft: three are drawn.
    draft.rundgang!.stellen[0]!.status = 'entwurf';
    expect(selectPlayable(draft, false, RULES).level.rundgang?.stellen).toHaveLength(11);
    expect(selectPlayable(draft, true, RULES).level.rundgang?.stellen).toHaveLength(12);
  });

  it('leaves the tour out, not the level, if too few released places remain', () => {
    const draft = clone(level);
    for (const site of draft.rundgang!.stellen.slice(0, 2)) site.status = 'entwurf';
    const playable = selectPlayable(draft, false, RULES);
    expect(playable.level.rundgang).toBeUndefined();
    expect(playable.available).toBe(true);
    expect(startRun(playable.level, 7).tour).toBeNull();
  });
});

describe('tour in the balance simulation', () => {
  const situations = level.situationen.slice(0, 6);

  it('starts the building by the grade of the tour and counts its points', () => {
    const none = playStrategy(situations, 'gut');
    const good = playStrategy(situations, 'gut', 'good');
    const poor = playStrategy(situations, 'gut', 'poor');
    expect(good.outcome).toBe('completed');
    expect(poor.outcome).toBe('completed');
    expect(good.stars).toBe(3);
    expect(poor.stars).toBeLessThan(3);
    expect(none.stars).toBe(3);
  });

  it('plays a level with a tour to the same result every time', () => {
    expect(simulateLevel(level)).toEqual(simulateLevel(level));
    const a = playRandom(level, createRng(5));
    const b = playRandom(level, createRng(5));
    expect(a).toEqual(b);
  });
});

describe('tour in the scene model (M-15)', () => {
  const levels = [{ level, available: true }];
  const lotOf = (run: LevelRun, openSite: string | null = null) =>
    sceneModel(levels, withRun(emptyProgress(), run), run, { openSite }).lots[0];

  it('shows the eight places while the tour is walked, judged or not, but never how', () => {
    let run = atTour();
    for (const siteId of (run.tour?.siteIds ?? []).slice(0, 3)) {
      run = step(run, level, { type: 'classify', siteId, risk: true });
    }
    const open = run.tour?.siteIds[5] ?? '';
    const markers = lotOf(run, open)?.tour ?? [];
    expect(markers.map((m) => m.siteId)).toEqual(run.tour?.siteIds);
    expect(markers.filter((m) => m.judged)).toHaveLength(3);
    expect(markers.every((m) => m.verdict === null)).toBe(true);
    expect(markers.filter((m) => m.selected).map((m) => m.siteId)).toEqual([open]);
    // Five of the eight are marked by the drone: three found risks and two false alarms.
    expect(markers.filter((m) => m.marked)).toHaveLength(5);
    for (const marker of markers) {
      expect(marker.ort).toBe(pool.find((s) => s.id === marker.siteId)?.ort);
    }
  });

  it('shows right and wrong in the resolution and selects nothing any more', () => {
    const run = finished(6);
    const markers = lotOf(run, run.tour?.siteIds[0] ?? null)?.tour ?? [];
    expect(markers.filter((m) => m.verdict === 'right')).toHaveLength(6);
    expect(markers.filter((m) => m.verdict === 'wrong')).toHaveLength(2);
    expect(markers.some((m) => m.selected)).toBe(false);
  });

  it('shows no places before the tour, after it or in a level without one', () => {
    expect(lotOf(startRun(level, 7))?.tour).toBeNull();
    expect(lotOf(step(finished(6), level, { type: 'continue' }))?.tour).toBeNull();
    const plain = makeLevel();
    const run = startRun(plain, 7);
    const model = sceneModel([{ level: plain, available: true }], emptyProgress(), run);
    expect(model.lots[0]?.tour).toBeNull();
    expect(sceneModel(levels, emptyProgress(), null).lots[0]?.tour).toBeNull();
  });
});
