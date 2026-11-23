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
import {
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
    const run = finished(['C', 'B', 'B', 'B', 'A', 'A']);
    expect(run.outcome).toBe('collapsed');
    const failed = collapsedGauges(run.gauges);
    expect(failed).toEqual(['stabilitaet']);
    const causes = collapseCauses(run.history, failed);
    expect(causes.every((c) => c.choice.rating === 'riskant' && c.gauge === 'stabilitaet')).toBe(
      true,
    );
    expect(causes.map((c) => c.loss)).toEqual([...causes.map((c) => c.loss)].sort((a, b) => b - a));
    expect(causes.map((c) => c.loss)).toEqual([26, 26, 14]);
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
    expect(levelProgress(other, 'level-1').best?.gauges.budget).toBe(24);
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
    expect(model).toMatchObject({ mode: 'city', focus: null });
    expect(model.lots.map((l) => l.status)).toEqual(['open', 'locked', 'locked']);
  });

  it('follows the active level and grows one floor per decision', () => {
    const run = replay(level, 1, [], ['A', 'A']);
    const model = sceneModel(levels, withRun(emptyProgress(), run), run);
    expect(model).toMatchObject({ mode: 'level', focus: 0 });
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
    });
  });

  it('keeps a completed building as it was finished and locks levels without content', () => {
    let progress = finishRun(emptyProgress(), finished(ALL_GOOD), level);
    progress = clearRun(progress);
    const done = sceneModel(levels, progress, null);
    expect(done.lots.map((l) => l.status)).toEqual(['done', 'open', 'locked']);
    expect(done.lots[0]?.building?.floors).toHaveLength(6);

    progress = finishRun(progress, replay(makeLevel(2), 1, [], ALL_GOOD), makeLevel(2));
    expect(sceneModel(levels, clearRun(progress), null).lots[2]?.status).toBe('locked');
  });
});

describe('balance simulation (F-907)', () => {
  it('lists every combination once', () => {
    expect(combinations([1, 2, 3, 4], 2)).toHaveLength(6);
    expect(combinations([1, 2], 0)).toEqual([[]]);
    expect(combinations([1, 2], 3)).toEqual([]);
  });

  it('confirms that only good choices always pass and only risky ones never do', () => {
    const report = simulateLevel(level);
    expect(report).toMatchObject({
      levelId: 'level-1',
      runs: 56,
      goodFailures: 0,
      riskyPasses: 0,
      goodLowest: 24,
      goodMinStars: 3,
    });
    expect(report.randomPassRate).toBeGreaterThan(0);
    expect(report.randomPassRate + report.randomCollapseRate).toBeLessThanOrEqual(1);
  });

  it('gives the same estimate for the random player on every run (Q-06)', () => {
    expect(simulateLevel(level)).toEqual(simulateLevel(level));
    expect(playRandom(level, createRng(3))).toEqual(playRandom(level, createRng(3)));
  });

  it('keeps blind clicking from passing in every level that ships (F-909)', () => {
    for (const [name, json] of Object.entries(readLevelFiles())) {
      const result = validateLevelJson(json, name, POINTS);
      if (!result.ok) throw new Error(result.errors.join('\n'));
      const report = simulateLevel(result.level);
      expect(isBalanced(report), name).toBe(true);
      expect(report.randomPassRate, name).toBeLessThanOrEqual(0.2);
    }
  });

  it('still fails a player whose risky options are harmless: the inspection catches it', () => {
    const soft = clone(level);
    for (const s of soft.situationen) {
      const risky = s.optionen.find((o) => o.einstufung === 'riskant');
      if (risky) risky.wirkung = { budget: '0', zeit: '0', stabilitaet: '-klein' };
    }
    expect(playStrategy(soft.situationen.slice(0, 6), 'riskant').outcome).toBe('rejected');
    expect(simulateLevel(soft).riskyPasses).toBe(0);
  });

  it('detects a level whose good options are too costly', () => {
    const harsh = clone(level);
    for (const s of harsh.situationen) {
      const good = s.optionen.find((o) => o.einstufung === 'gut');
      if (good) good.wirkung = { budget: '-gross', zeit: '0', stabilitaet: '+gross' };
    }
    const report = simulateLevel(harsh);
    expect(report.goodFailures).toBe(56);
    expect(report.goodMinStars).toBe(0);
    expect(isBalanced(report)).toBe(false);
  });

  it('calls a level unbalanced if blind clicking passes too often', () => {
    const report = simulateLevel(level);
    expect(isBalanced({ ...report, randomPassRate: 0.21 })).toBe(false);
    expect(isBalanced({ ...report, randomPassRate: 0.2 })).toBe(true);
    expect(isBalanced({ ...report, runs: 0 })).toBe(false);
  });

  it('refuses a situation that lacks the requested rating', () => {
    const situation = clone(level.situationen[0]!);
    situation.optionen = situation.optionen.filter((o) => o.einstufung !== 'riskant');
    expect(() => playStrategy([situation], 'riskant')).toThrow(/has no option rated riskant/);
  });
});
