import { describe, expect, it } from 'vitest';
import type { OptionId } from '../../src/content/schema.ts';
import type { ChoiceRecord, LevelRun } from '../../src/core/game.ts';
import { replay, startRun, step } from '../../src/core/game.ts';
import {
  addPlayTime,
  clearRun,
  emptyProgress,
  finishRun,
  isUnlocked,
  levelProgress,
  withRun,
} from '../../src/core/progress.ts';
import { sceneModel } from '../../src/core/scene.ts';
import { createRng } from '../../src/core/rng.ts';
import {
  acceptance,
  collapseCauses,
  collapsedGauges,
  goalResults,
  scoreRatio,
  starsFor,
} from '../../src/core/scoring.ts';
import type { BalanceProblem, BalanceReport } from '../../src/core/simulate.ts';
import {
  balanceProblems,
  combinations,
  isBalanced,
  playRandom,
  playStrategy,
  simulateLevel,
} from '../../src/core/simulate.ts';
import { validateLevelJson } from '../../src/content/validate.ts';
import { readLevelFiles } from '../../scripts/read-levels.ts';
import { clone, makeLevel, POINTS } from './fixtures.ts';

const level = makeLevel();
const finished = (choices: OptionId[], seed = 1): LevelRun => replay(level, seed, [], choices);
const ALL_GOOD: OptionId[] = ['A', 'A', 'A', 'A', 'A', 'A'];

function choice(rating: ChoiceRecord['rating'], situationId = 'L1-S01'): ChoiceRecord {
  const zero = { budget: 0, zeit: 0, stabilitaet: 0 };
  return { situationId, optionId: 'A', rating, delta: zero, gaugesAfter: zero };
}

describe('stars (F-603)', () => {
  const even = { budget: 50, zeit: 50, stabilitaet: 50 };

  it('gives three stars for good decisions and healthy gauges', () => {
    expect(starsFor(finished(ALL_GOOD))).toBe(3);
  });

  const rated = (ratings: string): ChoiceRecord[] =>
    [...ratings].map((r) => choice(r === 'g' ? 'gut' : r === 'v' ? 'vertretbar' : 'riskant'));

  it('gives two stars for a mostly good run', () => {
    expect(starsFor({ outcome: 'completed', history: rated('ggggvv'), gauges: even })).toBe(2);
  });

  it('gives one star for a level that was only just accepted', () => {
    expect(starsFor({ outcome: 'completed', history: rated('gggvvv'), gauges: even })).toBe(1);
  });

  it('caps the stars if a gauge ends too low, however good the decisions were', () => {
    const history = rated('gggggg');
    expect(starsFor({ outcome: 'completed', history, gauges: { ...even, zeit: 10 } })).toBe(3);
    expect(starsFor({ outcome: 'completed', history, gauges: { ...even, zeit: 9 } })).toBe(2);
    expect(starsFor({ outcome: 'completed', history, gauges: { ...even, zeit: 4 } })).toBe(1);
  });

  it('gives no star for a collapsed, rejected or unfinished level', () => {
    expect(starsFor(finished(['B', 'B', 'B']))).toBe(0);
    expect(starsFor({ outcome: 'rejected', history: rated('gggggg'), gauges: even })).toBe(0);
    expect(starsFor({ outcome: 'running', history: [], gauges: even })).toBe(0);
    expect(scoreRatio([])).toBe(0);
  });

  it('states the points reached and the points needed for the inspection (F-211)', () => {
    expect(acceptance(rated('ggvr'), 8)).toEqual({ points: 5, max: 16, required: 11 });
    expect(acceptance([], 6)).toEqual({ points: 0, max: 12, required: 8 });
  });
});

describe('learning goals (F-602)', () => {
  it('marks a goal as reached, missed or not tested', () => {
    const history = [choice('gut', 'L1-S01'), choice('vertretbar', 'L1-S03')];
    expect(goalResults(level, history).map((g) => g.status)).toEqual([
      'erreicht',
      'nicht-geprueft',
    ]);
    const poor = [choice('riskant', 'L1-S02'), choice('gut', 'L1-S04')];
    expect(goalResults(level, poor).map((g) => g.status)).toEqual([
      'nicht-geprueft',
      'nicht-erreicht',
    ]);
  });

  it('ignores decisions on situations the level no longer contains', () => {
    expect(goalResults(level, [choice('gut', 'L1-S99')]).map((g) => g.status)).toEqual([
      'nicht-geprueft',
      'nicht-geprueft',
    ]);
  });
});

describe('collapse analysis (F-209)', () => {
  it('names the failed gauge and the decisions that lowered it, heaviest first', () => {
    const run = finished(['C', 'B', 'B', 'B', 'B', 'A']);
    expect(run.outcome).toBe('collapsed');
    const failed = collapsedGauges(run.gauges);
    expect(failed).toEqual(['stabilitaet']);
    const causes = collapseCauses(run.history, failed);
    expect(causes.every((c) => c.choice.rating === 'riskant' && c.gauge === 'stabilitaet')).toBe(
      true,
    );
    expect(causes.map((c) => c.loss)).toEqual([...causes.map((c) => c.loss)].sort((a, b) => b - a));
    expect(causes.map((c) => c.loss)).toEqual([26, 26, 26, 4]);
  });

  it('picks the harder hit gauge if two failed at once and finds nothing for a standing building', () => {
    const both = collapseCauses(
      [
        {
          ...choice('riskant'),
          delta: { budget: -6, zeit: -20, stabilitaet: 0 },
        },
      ],
      ['budget', 'zeit'],
    );
    expect(both[0]).toMatchObject({ gauge: 'zeit', loss: 20 });
    expect(collapsedGauges({ budget: 1, zeit: 50, stabilitaet: 50 })).toEqual([]);
    expect(collapseCauses(finished(ALL_GOOD).history, [])).toEqual([]);
  });
});

describe('progress (F-103, F-106, F-107, F-108, F-702)', () => {
  const order = ['level-1', 'level-2', 'level-3'];

  it('opens level 1 only, then each level after the previous one is completed', () => {
    let progress = emptyProgress();
    expect(order.map((id) => isUnlocked(progress, order, id))).toEqual([true, false, false]);
    progress = finishRun(progress, finished(ALL_GOOD), level);
    expect(order.map((id) => isUnlocked(progress, order, id))).toEqual([true, true, false]);
    expect(isUnlocked(progress, order, 'level-9')).toBe(false);
  });

  it('does not unlock the next level after a collapse or a failed inspection', () => {
    for (const choices of [
      ['B', 'B', 'B'],
      ['B', 'C', 'B', 'C', 'A', 'A'],
    ] as OptionId[][]) {
      const run = finished(choices);
      expect(run.outcome).not.toBe('completed');
      const progress = finishRun(emptyProgress(), run, level);
      expect(isUnlocked(progress, order, 'level-2')).toBe(false);
      expect(levelProgress(progress, 'level-1')).toMatchObject({
        completed: false,
        attempts: 1,
        best: null,
      });
    }
  });

  it('stores the run after every step and remembers that the theory was seen', () => {
    let run = startRun(level, 1);
    let progress = withRun(emptyProgress(), run);
    expect(progress.currentRun).toBe(run);
    expect(levelProgress(progress, 'level-1').theorySeen).toBe(false);
    for (let i = 0; i < 4; i++) run = step(run, level, { type: 'continue' });
    progress = withRun(progress, run);
    expect(levelProgress(progress, 'level-1').theorySeen).toBe(true);
    expect(clearRun(progress).currentRun).toBeNull();
  });

  it('keeps the best result when a repeat goes worse (F-107)', () => {
    let progress = finishRun(emptyProgress(), finished(ALL_GOOD), level);
    const best = levelProgress(progress, 'level-1').best;
    expect(best).toMatchObject({ stars: 3, goalsReached: ['L1-Z1', 'L1-Z2'] });
    expect(best?.floors).toHaveLength(6);
    expect(best?.floors[0]).toMatchObject({ rating: 'gut' });

    // Same stars, but a lower weakest gauge: not better, so the first result stays.
    progress = finishRun(progress, finished(['C', 'A', 'A', 'A', 'A', 'A'], 2), level);
    expect(levelProgress(progress, 'level-1').best).toEqual(best);
    progress = finishRun(progress, finished(['B', 'B', 'B'], 3), level);
    expect(levelProgress(progress, 'level-1')).toMatchObject({
      completed: true,
      attempts: 3,
      best,
    });
  });

  it('replaces the best result by a better one, also at equal stars with healthier gauges', () => {
    let progress = finishRun(emptyProgress(), finished(['C', 'C', 'A', 'A', 'A', 'A']), level);
    expect(levelProgress(progress, 'level-1').best?.stars).toBe(2);
    progress = finishRun(progress, finished(ALL_GOOD), level);
    expect(levelProgress(progress, 'level-1').best?.stars).toBe(3);

    const weaker = clone(finished(ALL_GOOD));
    weaker.gauges = { budget: 12, zeit: 12, stabilitaet: 100 };
    let other = finishRun(emptyProgress(), weaker, level);
    other = finishRun(other, finished(ALL_GOOD), level);
    expect(levelProgress(other, 'level-1').best?.gauges.budget).toBe(40);
  });

  it('remembers played situations oldest first, so the next draw prefers fresh ones (F-106)', () => {
    const first = finished(ALL_GOOD, 1);
    let progress = finishRun(emptyProgress(), first, level);
    expect(levelProgress(progress, 'level-1').recentIds).toEqual(first.situationIds);

    const second = replay(level, 2, levelProgress(progress, 'level-1').recentIds, ALL_GOOD);
    const unseen = level.situationen
      .map((s) => s.id)
      .filter((id) => !first.situationIds.includes(id));
    expect(second.situationIds.slice(0, 2).sort()).toEqual(unseen.sort());
    progress = finishRun(progress, second, level);
    const recent = levelProgress(progress, 'level-1').recentIds;
    expect(new Set(recent).size).toBe(recent.length);
    expect(recent.slice(-6)).toEqual(second.situationIds);
  });

  it('adds play time and ignores nonsense values', () => {
    let progress = addPlayTime(emptyProgress(), 1500.4);
    expect(progress.playTimeMs).toBe(1500);
    progress = addPlayTime(progress, -5);
    progress = addPlayTime(progress, Number.NaN);
    progress = addPlayTime(progress, 0);
    expect(progress.playTimeMs).toBe(1500);
  });
});

describe('sceneModel (F-408, F-409)', () => {
  const levels = [1, 2, 3].map((n) => ({ level: makeLevel(n), available: n !== 3 }));

  it('shows the city with one open and the other lots locked at the start', () => {
    const model = sceneModel(levels, emptyProgress(), null);
    expect(model).toMatchObject({ mode: 'city', focus: null, allCompleted: false });
    expect(model.lots.map((l) => l.nummer)).toEqual([1, 2, 3]);
    expect(model.lots.map((l) => l.status)).toEqual(['open', 'locked', 'locked']);
  });

  it('follows the active level and grows one floor per decision', () => {
    const run = replay(level, 1, [], ['A', 'A']);
    const model = sceneModel(levels, withRun(emptyProgress(), run), run);
    expect(model).toMatchObject({ mode: 'level', focus: 0, deciding: true });
    const answered = step(run, level, { type: 'choose', optionId: 'A' });
    expect(sceneModel(levels, emptyProgress(), answered).deciding).toBe(false);
    expect(model.lots[0]).toMatchObject({
      status: 'active',
      collapsed: false,
      construction: true,
    });
    expect(model.lots[0]?.building?.floors).toHaveLength(2);
  });

  it('flags the collapse of the active building', () => {
    const run = finished(['B', 'B', 'B']);
    expect(sceneModel(levels, emptyProgress(), run).lots[0]).toMatchObject({
      collapsed: true,
      construction: false,
      finished: false,
    });
  });

  it('marks the building as finished once the level is passed, not while it is built or rejected', () => {
    const lot = (choices: OptionId[]) =>
      sceneModel(levels, emptyProgress(), finished(choices)).lots[0];
    expect(lot(ALL_GOOD)).toMatchObject({ status: 'active', finished: true, construction: false });
    expect(lot(['B', 'C', 'B', 'C', 'A', 'A'])).toMatchObject({
      finished: false,
      collapsed: false,
    });
    const building = replay(level, 1, [], ['A', 'A']);
    expect(sceneModel(levels, emptyProgress(), building).lots[0]).toMatchObject({
      finished: false,
      construction: true,
    });
  });

  it('keeps a completed building as it was finished and locks levels without content', () => {
    let progress = finishRun(emptyProgress(), finished(ALL_GOOD), level);
    progress = clearRun(progress);
    const done = sceneModel(levels, progress, null);
    expect(done.lots.map((l) => l.status)).toEqual(['done', 'open', 'locked']);
    expect(done.lots.map((l) => l.finished)).toEqual([true, false, false]);
    expect(done.lots[0]?.building?.floors).toHaveLength(6);

    progress = finishRun(progress, replay(makeLevel(2), 1, [], ALL_GOOD), makeLevel(2));
    expect(sceneModel(levels, clearRun(progress), null).lots[2]?.status).toBe('locked');
  });
});

describe('balance simulation (F-907, F-909, F-910)', () => {
  /** A report in which every rule holds; each test breaks exactly one thing. */
  const clean: BalanceReport = {
    levelId: 'level-1',
    runs: 10,
    good: { failures: 0, lowest: 40, maxTilt: 0.1, minStars: 3 },
    okay: { collapses: 0, passes: 0 },
    risky: { passes: 0, latestCollapse: 5 },
    random: { passRate: 0.2, collapseRate: 0.3, failRate: 0.8 },
  };

  it('lists every combination once', () => {
    expect(combinations([1, 2, 3, 4], 2)).toHaveLength(6);
    expect(combinations([1, 2], 0)).toEqual([[]]);
    expect(combinations([1, 2], 3)).toEqual([]);
  });

  it('reports how each fixed strategy fares over all draws', () => {
    const report = simulateLevel(level);
    expect(report).toMatchObject({
      levelId: 'level-1',
      runs: 56,
      good: { failures: 0, lowest: 40, minStars: 3 },
      // Six times "-mittel" on time is more than the gauge holds: collapse in every draw.
      okay: { collapses: 56, passes: 0 },
      // Three times "-gross" on stability empties the gauge.
      risky: { passes: 0, latestCollapse: 3 },
    });
    // Budget and time at 40, stability at 100: no weakness, only a slight lean for one-sidedness.
    expect(report.good.maxTilt).toBeCloseTo(0.09, 5);
    expect(report.random.passRate + report.random.failRate).toBeCloseTo(1, 10);
    expect(report.random.collapseRate).toBeLessThanOrEqual(report.random.failRate);
  });

  it('gives the same estimate for the random player on every run (Q-06)', () => {
    expect(simulateLevel(level)).toEqual(simulateLevel(level));
    expect(playRandom(level, createRng(3))).toEqual(playRandom(level, createRng(3)));
  });

  it('finds nothing wrong with a report in which every rule holds exactly', () => {
    expect(balanceProblems(clean)).toEqual([]);
    expect(isBalanced(clean)).toBe(true);
  });

  it.each<[string, Partial<BalanceReport>, BalanceProblem]>([
    ['a good-only run fails', { good: { ...clean.good, failures: 1 } }, 'good-fails'],
    ['no draw was simulated', { runs: 0 }, 'good-fails'],
    ['a good-only run ends below 40', { good: { ...clean.good, lowest: 39 } }, 'good-low'],
    ['a good-only run leans too much', { good: { ...clean.good, maxTilt: 0.11 } }, 'good-tilt'],
    ['acceptable-only collapses', { okay: { collapses: 1, passes: 0 } }, 'okay-collapses'],
    ['acceptable-only passes', { okay: { collapses: 0, passes: 1 } }, 'okay-passes'],
    ['risky-only passes', { risky: { passes: 1, latestCollapse: 5 } }, 'risky-passes'],
    ['risky-only collapses too late', { risky: { passes: 0, latestCollapse: 6 } }, 'risky-late'],
    ['risky-only never collapses', { risky: { passes: 0, latestCollapse: null } }, 'risky-late'],
    [
      'random play passes too often',
      { random: { passRate: 0.21, collapseRate: 0.3, failRate: 0.79 } },
      'random-passes',
    ],
    [
      'random play fails too rarely',
      { random: { passRate: 0.1, collapseRate: 0.3, failRate: 0.59 } },
      'random-range',
    ],
    [
      'random play fails too often',
      { random: { passRate: 0.09, collapseRate: 0.3, failRate: 0.91 } },
      'random-range',
    ],
  ])('names the broken rule when %s', (_name, change, problem) => {
    expect(balanceProblems({ ...clean, ...change })).toContain(problem);
    expect(isBalanced({ ...clean, ...change })).toBe(false);
  });

  it('holds every rule in every level that ships', () => {
    for (const [name, json] of Object.entries(readLevelFiles())) {
      const result = validateLevelJson(json, name, POINTS);
      if (!result.ok) throw new Error(result.errors.join('\n'));
      const report = simulateLevel(result.level);
      expect(balanceProblems(report), name).toEqual([]);
      expect(report.good.lowest, name).toBeGreaterThanOrEqual(40);
      expect(report.random.passRate, name).toBeLessThanOrEqual(0.2);
    }
  });

  it('finds the fixture level wanting: its acceptable options alone bring the building down', () => {
    expect(balanceProblems(simulateLevel(level))).toContain('okay-collapses');
    expect(isBalanced(simulateLevel(level))).toBe(false);
  });

  it('notices risky options that are too harmless to bring the building down', () => {
    const soft = clone(level);
    for (const s of soft.situationen) {
      const risky = s.optionen.find((o) => o.einstufung === 'riskant');
      if (risky) risky.wirkung = { budget: '0', zeit: '0', stabilitaet: '-klein' };
    }
    expect(playStrategy(soft.situationen.slice(0, 6), 'riskant').outcome).toBe('rejected');
    const report = simulateLevel(soft);
    expect(report.risky).toEqual({ passes: 0, latestCollapse: null });
    expect(balanceProblems(report)).toContain('risky-late');
  });

  it('detects a level whose good options are too costly', () => {
    const harsh = clone(level);
    for (const s of harsh.situationen) {
      const good = s.optionen.find((o) => o.einstufung === 'gut');
      if (good) good.wirkung = { budget: '-gross', zeit: '0', stabilitaet: '+gross' };
    }
    const report = simulateLevel(harsh);
    expect(report.good).toMatchObject({ failures: 56, minStars: 0, lowest: 0, maxTilt: 1 });
    expect(isBalanced(report)).toBe(false);
  });

  it('lets the cautious player take the good option where no acceptable one exists', () => {
    const situation = clone(level.situationen[0]!);
    situation.optionen = situation.optionen.filter((o) => o.einstufung !== 'vertretbar');
    const result = playStrategy([situation], 'vertretbar');
    expect(result).toMatchObject({ steps: 1, gauges: { budget: 70, zeit: 70, stabilitaet: 90 } });
  });

  it('refuses a situation that lacks the requested rating', () => {
    const situation = clone(level.situationen[0]!);
    situation.optionen = situation.optionen.filter((o) => o.einstufung !== 'riskant');
    expect(() => playStrategy([situation], 'riskant')).toThrow(/has no option rated riskant/);
  });
});
