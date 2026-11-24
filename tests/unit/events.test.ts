import { describe, expect, it } from 'vitest';
import type { Level, OptionId, StrategyId } from '../../src/content/schema.ts';
import { BALANCE } from '../../src/core/balance.ts';
import type { EventRound } from '../../src/core/events.ts';
import {
  eventCauses,
  eventRounds,
  measuresOf,
  threatOf,
  eventVerdict,
  findEvent,
  forecastOf,
  impactUnder,
  trustedUnreliable,
} from '../../src/core/events.ts';
import type { LevelRun } from '../../src/core/game.ts';
import {
  eventInputsOf,
  GameError,
  isRunConsistent,
  replay,
  startRun,
  step,
} from '../../src/core/game.ts';
import {
  clearRun,
  emptyProgress,
  finishRun,
  floorRecords,
  withRun,
} from '../../src/core/progress.ts';
import { sceneModel } from '../../src/core/scene.ts';
import { acceptance, starsFor } from '../../src/core/scoring.ts';
import { createLogger } from '../../src/logging/logger.ts';
import { buildErrorReport, extractReplay } from '../../src/logging/report.ts';
import { createLocalStorageStore } from '../../src/storage/local-storage-store.ts';
import { clone, makeEventLevel, makeLevel, makeMechanicsLevel, memoryStorage } from './fixtures.ts';

const level = makeEventLevel();
const START = BALANCE.gauge.start;
const { klein: KLEIN, mittel: MITTEL, gross: GROSS } = BALANCE.effectPoints;
const VERIFY = BALANCE.events.verifyCostTime;
const E = (n: number): string => `L3-E0${n}`;

function withoutEvents(of: Level): Level {
  const rest = { ...of };
  delete rest.ereignisse;
  return rest;
}

/**
 * A run in front of its first situation whose three rounds are the given events. The draw
 * itself is tested on its own; here the rounds are set, so each test says what it is about.
 */
function runWith(rounds: readonly [string, boolean][], of: Level = level, seed = 7): LevelRun {
  const run = step(startRun(of, seed, { canSkipTheory: true }), of, { type: 'skipTheory' });
  return {
    ...run,
    events: rounds.map(([eventId, occurs]): EventRound => ({
      eventId,
      occurs,
      verified: false,
      strategy: null,
      cost: null,
      resolution: null,
    })),
  };
}

/** Takes `count` decisions with the good option; stops in front of whatever comes next. */
function decide(
  run: LevelRun,
  count: number,
  optionId: OptionId = 'A',
  of: Level = level,
): LevelRun {
  let next = run;
  for (let i = 0; i < count; i++) {
    next = step(next, of, { type: 'choose', optionId });
    next = step(next, of, { type: 'continue' });
  }
  return next;
}

const choose = (run: LevelRun, strategyId: StrategyId, of: Level = level): LevelRun =>
  step(run, of, { type: 'chooseStrategy', strategyId });

/** Two decisions, the strategy, one more decision and its feedback: stands on the resolution. */
function resolved(eventId: string, occurs: boolean, strategyId: StrategyId): LevelRun {
  const announced = decide(runWith([[eventId, occurs]]), 2);
  return decide(choose(announced, strategyId), 1);
}

describe('events of a run (M-01, M-03, M-20)', () => {
  it('draws three different events and fixes at the start which of them happen', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const run = startRun(level, seed);
      expect(run.events).toHaveLength(3);
      expect(new Set(run.events?.map((r) => r.eventId)).size).toBe(3);
      expect(run.events?.every((r) => r.strategy === null && r.resolution === null)).toBe(true);
      expect(startRun(level, seed).events).toEqual(run.events);
    }
  });

  it('lets an event happen about as often as its probability says', () => {
    const seen = { hoch: [0, 0], mittel: [0, 0] };
    for (let seed = 1; seed <= 3000; seed++) {
      for (const round of startRun(level, seed).events ?? []) {
        const kind = findEvent(level, round.eventId).wahrscheinlichkeit as 'hoch' | 'mittel';
        seen[kind][0] = (seen[kind][0] ?? 0) + (round.occurs ? 1 : 0);
        seen[kind][1] = (seen[kind][1] ?? 0) + 1;
      }
    }
    const share = ([hits, total]: number[]) => (hits ?? 0) / (total ?? 1);
    expect(share(seen.hoch)).toBeGreaterThan(BALANCE.events.probability.hoch - 0.04);
    expect(share(seen.hoch)).toBeLessThan(BALANCE.events.probability.hoch + 0.04);
    expect(share(seen.mittel)).toBeGreaterThan(BALANCE.events.probability.mittel - 0.04);
    expect(share(seen.mittel)).toBeLessThan(BALANCE.events.probability.mittel + 0.04);
  });

  it('has no events in a level without the block and fewer if the run is short', () => {
    const plain = makeLevel();
    expect(startRun(plain, 7).events).toBeNull();
    expect(eventRounds(plain)).toBe(0);
    // Six decisions: an event after the sixth would have no floor to be resolved on.
    const short = makeMechanicsLevel();
    expect(eventRounds(short)).toBe(2);
    expect(startRun(short, 7).events).toHaveLength(2);
    expect(eventRounds(level)).toBe(3);
  });

  it('leaves situations and tour of a seed as they were before events existed', () => {
    const both = makeMechanicsLevel();
    const tourOnly = withoutEvents(both);
    const before = startRun(tourOnly, 20261124);
    const after = startRun(both, 20261124);
    expect(after.situationIds).toEqual(before.situationIds);
    expect(after.optionOrders).toEqual(before.optionOrders);
    expect(after.tour).toEqual(before.tour);
  });
});

describe('course of a round (M-20, M-24)', () => {
  it('announces an event after the second, fourth and sixth decision', () => {
    let run = runWith([
      [E(4), false],
      [E(5), false],
      [E(3), false],
    ]);
    const phases: string[] = [];
    for (let decision = 1; decision <= 8; decision++) {
      run = step(run, level, { type: 'choose', optionId: 'A' });
      run = step(run, level, { type: 'continue' });
      if (run.phase === 'eventResult') {
        phases.push(`${decision}:resolved`);
        run = step(run, level, { type: 'continue' });
      }
      if (run.phase === 'event') {
        phases.push(`${decision}:announced`);
        run = choose(run, 'akzeptieren');
      }
    }
    expect(phases).toEqual([
      '2:announced',
      '3:resolved',
      '4:announced',
      '5:resolved',
      '6:announced',
      '7:resolved',
    ]);
    expect(run).toMatchObject({ phase: 'result', outcome: 'completed' });
    expect(run.history).toHaveLength(8);
  });

  it('takes the cost of the strategy at once and leads on to the next situation', () => {
    const announced = decide(runWith([[E(1), true]]), 2);
    expect(announced).toMatchObject({ phase: 'event', step: 1 });
    const before = announced.gauges;
    const after = choose(announced, 'vermeiden');
    expect(after).toMatchObject({ phase: 'situation', step: 2 });
    expect(after.gauges).toEqual({ ...before, zeit: before.zeit - GROSS });
    expect(after.events?.[0]).toMatchObject({
      strategy: 'vermeiden',
      cost: { budget: 0, zeit: -GROSS, stabilitaet: 0 },
      resolution: null,
    });
  });

  it('resolves the event after the next floor, after the effect of that decision', () => {
    const announced = decide(runWith([[E(4), true]]), 2);
    const chosen = choose(announced, 'akzeptieren');
    const floor = step(chosen, level, { type: 'choose', optionId: 'A' });
    // The floor is set and shows the decision alone; nothing of the event yet.
    expect(floor.phase).toBe('feedback');
    expect(floor.events?.[0]?.resolution).toBeNull();
    const result = step(floor, level, { type: 'continue' });
    expect(result.phase).toBe('eventResult');
    expect(result.events?.[0]?.resolution).toEqual({
      occurred: true,
      delta: { budget: -MITTEL, zeit: -KLEIN, stabilitaet: -MITTEL },
      gaugesAfter: result.gauges,
    });
    expect(result.gauges.budget).toBe(floor.gauges.budget - MITTEL);
    // The floor keeps what the decision did; the building shows what the event took since.
    expect(result.history[2]?.gaugesAfter).toEqual(floor.gauges);
    expect(floorRecords(result)[2]?.gauges).toEqual(result.gauges);
    expect(floorRecords(result)[1]?.gauges).toEqual(result.history[1]?.gaugesAfter);
    expect(step(result, level, { type: 'continue' })).toMatchObject({
      phase: 'situation',
      step: 3,
    });
  });

  it('refuses a strategy that is not available or comes at the wrong time', () => {
    const locked = clone(level);
    const event = locked.ereignisse?.pool[0];
    if (!event) throw new Error('fixture has no event');
    event.strategien.uebertragen = { verfuegbar: false, text: 'Geht nicht.', grund: 'Darum.' };
    const announced = decide(runWith([[event.id, true]], locked), 2, 'A', locked);
    expect(() => choose(announced, 'uebertragen', locked)).toThrow(GameError);
    expect(choose(announced, 'vermindern', locked).phase).toBe('situation');

    const early = runWith([[E(1), true]]);
    expect(() => choose(early, 'akzeptieren')).toThrow(GameError);
    expect(() => step(early, level, { type: 'verifyForecast' })).toThrow(GameError);
    expect(() => step(announced, locked, { type: 'choose', optionId: 'A' })).toThrow(GameError);
    expect(() => step(announced, locked, { type: 'continue' })).toThrow(GameError);
  });
});

describe('the four strategies (M-21)', () => {
  const full = { budget: -MITTEL, zeit: -KLEIN, stabilitaet: -MITTEL };

  it.each([
    ['vermeiden', { budget: 0, zeit: 0, stabilitaet: 0 }],
    ['vermindern', { budget: -KLEIN, zeit: 0, stabilitaet: -KLEIN }],
    ['uebertragen', { budget: 0, zeit: -KLEIN, stabilitaet: -MITTEL }],
    ['akzeptieren', full],
  ] as const)('%s: what is left of the impact when the event happens', (strategyId, delta) => {
    const run = resolved(E(1), true, strategyId);
    expect(run.events?.[0]?.resolution).toMatchObject({ occurred: true, delta });
  });

  it.each(['vermeiden', 'vermindern', 'uebertragen', 'akzeptieren'] as const)(
    '%s: nothing happens if the event does not',
    (strategyId) => {
      const run = resolved(E(1), false, strategyId);
      expect(run.events?.[0]?.resolution).toMatchObject({
        occurred: false,
        delta: { budget: 0, zeit: 0, stabilitaet: 0 },
      });
    },
  );

  it('makes every impact one step smaller when mitigating', () => {
    expect(
      impactUnder({ budget: '-gross', zeit: '-mittel', stabilitaet: '-klein' }, 'vermindern'),
    ).toEqual({ budget: '-mittel', zeit: '-klein', stabilitaet: '0' });
    expect(impactUnder({ budget: '0', zeit: '0', stabilitaet: '-gross' }, 'vermindern')).toEqual({
      budget: '0',
      zeit: '0',
      stabilitaet: '-mittel',
    });
  });

  it('drops only the budget when transferring', () => {
    const impact = { budget: '-gross', zeit: '-mittel', stabilitaet: '-klein' } as const;
    expect(impactUnder(impact, 'uebertragen')).toEqual({ ...impact, budget: '0' });
    expect(impactUnder(impact, 'akzeptieren')).toEqual(impact);
    expect(impactUnder(impact, 'vermeiden')).toEqual({ budget: '0', zeit: '0', stabilitaet: '0' });
  });
});

describe('AI forecast (M-23)', () => {
  it('shows the estimate of the team where no AI is involved', () => {
    const event = findEvent(level, E(3));
    expect(forecastOf(event, { verified: false })).toEqual({
      source: 'team',
      shown: 'mittel',
      truth: 'mittel',
      canVerify: false,
    });
    const announced = decide(runWith([[E(3), true]]), 2);
    expect(() => step(announced, level, { type: 'verifyForecast' })).toThrow(GameError);
  });

  it('shows what the AI claims and reveals the truth only after the check, for time', () => {
    const event = findEvent(level, E(2));
    expect(forecastOf(event, { verified: false })).toEqual({
      source: 'ai',
      shown: 'tief',
      truth: null,
      canVerify: true,
    });
    const announced = decide(runWith([[E(2), true]]), 2);
    const checked = step(announced, level, { type: 'verifyForecast' });
    expect(checked.phase).toBe('event');
    expect(checked.gauges).toEqual({ ...announced.gauges, zeit: announced.gauges.zeit - VERIFY });
    const round = checked.events?.[0] as EventRound;
    expect(forecastOf(event, round)).toEqual({
      source: 'ai',
      shown: 'tief',
      truth: 'hoch',
      canVerify: false,
    });
    expect(() => step(checked, level, { type: 'verifyForecast' })).toThrow(GameError);
  });

  it('notes an unreliable forecast that was trusted unchecked, and only that', () => {
    const unreliable = findEvent(level, E(2));
    const reliable = findEvent(level, E(1));
    const trusted = choose(decide(runWith([[E(2), true]]), 2), 'akzeptieren');
    expect(trustedUnreliable(unreliable, trusted.events?.[0] as EventRound)).toBe(true);

    const announced = decide(runWith([[E(2), true]]), 2);
    const checked = choose(step(announced, level, { type: 'verifyForecast' }), 'vermindern');
    expect(trustedUnreliable(unreliable, checked.events?.[0] as EventRound)).toBe(false);

    const fine = choose(decide(runWith([[E(1), true]]), 2), 'vermeiden');
    expect(trustedUnreliable(reliable, fine.events?.[0] as EventRound)).toBe(false);
    // Nothing is noted while the event is still open.
    expect(trustedUnreliable(unreliable, announced.events?.[0] as EventRound)).toBe(false);
  });
});

describe('points and final inspection (M-25, M-26)', () => {
  it('gives a point for the recommended strategy whatever the outcome', () => {
    for (const occurs of [true, false]) {
      const good = choose(decide(runWith([[E(1), occurs]]), 2), 'vermeiden');
      const other = choose(decide(runWith([[E(1), occurs]]), 2), 'akzeptieren');
      expect(good.eventPoints).toBe(1);
      expect(other.eventPoints).toBe(0);
    }
  });

  it('needs 69 % of the points, rounded to the nearest whole point', () => {
    // Eight decisions and three events: 19 points, of which 13.11 round to 13.
    expect(
      acceptance(
        runWith([
          [E(1), true],
          [E(2), true],
          [E(3), true],
        ]),
      ),
    ).toEqual({
      points: 0,
      max: 19,
      required: 13,
    });
    const scored = (situations: number, tour: boolean) =>
      acceptance({
        history: [],
        situationIds: Array.from({ length: situations }, (_, i) => String(i)),
        tour: tour ? { siteIds: [], judgements: {}, result: null } : null,
        events: null,
        eventPoints: 0,
      });
    // Unchanged for a level of decisions alone and for the tour: 11 of 16, 12 of 18.
    expect(scored(8, false)).toMatchObject({ max: 16, required: 11 });
    expect(scored(8, true)).toMatchObject({ max: 18, required: 12 });
    // 6.9 rounds up, 3.45 rounds down.
    expect(scored(5, false)).toMatchObject({ max: 10, required: 7 });
    expect(scored(2, true)).toMatchObject({ max: 6, required: 4 });
    expect(scored(0, false)).toMatchObject({ max: 0, required: 0 });
  });

  it('lets the events decide a close inspection and counts them for the stars', () => {
    const rounds: [string, boolean][] = [
      [E(4), false],
      [E(5), false],
      [E(3), false],
    ];
    const play = (strategies: readonly StrategyId[], options: readonly OptionId[]): LevelRun => {
      let run = runWith(rounds);
      options.forEach((optionId, i) => {
        run = step(run, level, { type: 'choose', optionId });
        run = step(run, level, { type: 'continue' });
        if (run.phase === 'eventResult') run = step(run, level, { type: 'continue' });
        if (run.phase === 'event') run = choose(run, strategies[(i - 1) / 2] ?? 'akzeptieren');
      });
      return run;
    };
    const recommended: StrategyId[] = ['akzeptieren', 'vermindern', 'uebertragen'];
    // Each of these is a strategy its event does not recommend.
    const never: StrategyId[] = ['vermindern', 'akzeptieren', 'akzeptieren'];
    // Five good and three «vertretbar» decisions give 13 points on their own.
    const mixed: OptionId[] = ['A', 'A', 'A', 'A', 'A', 'C', 'C', 'C'];
    expect(acceptance(play(recommended, mixed))).toMatchObject({ points: 16, required: 13 });
    // Six good and two risky decisions: 12 points pass only with a recommended strategy.
    const close: OptionId[] = ['A', 'A', 'A', 'A', 'A', 'A', 'B', 'B'];
    expect(play(recommended, close).outcome).toBe('completed');
    expect(play(never, close)).toMatchObject({ outcome: 'rejected', eventPoints: 0 });

    const allGood: OptionId[] = ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A'];
    expect(starsFor(play(recommended, allGood))).toBe(3);
    // 16 of 19 points are below the bar of 90 %.
    expect(starsFor(play(never, allGood))).toBe(2);
  });
});

describe('collapse through an event (M-24, M-27)', () => {
  /** A run in front of the first event with the given gauges. */
  const announcedWith = (gauges: Partial<LevelRun['gauges']>, eventId = E(4)): LevelRun => {
    const run = decide(runWith([[eventId, true]]), 2);
    return { ...run, gauges: { ...run.gauges, ...gauges } };
  };

  it('collapses at the resolution if the event takes a gauge to zero', () => {
    // The good decision costs 6 of the budget, the accepted event another 14.
    const chosen = choose(announcedWith({ budget: 20 }), 'akzeptieren');
    const floor = step(chosen, level, { type: 'choose', optionId: 'A' });
    expect(floor).toMatchObject({ phase: 'feedback', outcome: 'running' });
    const result = step(floor, level, { type: 'continue' });
    expect(result).toMatchObject({ phase: 'eventResult', outcome: 'collapsed' });
    expect(result.gauges.budget).toBe(0);
    expect(step(result, level, { type: 'continue' })).toMatchObject({
      phase: 'result',
      outcome: 'collapsed',
    });
    expect(starsFor(result)).toBe(0);
    expect(eventCauses(result.events, ['budget'])).toEqual([
      { eventId: E(4), part: 'ereignis', gauge: 'budget', loss: MITTEL },
    ]);
  });

  it('stands at exactly one point and collapses at exactly zero', () => {
    const play = (budget: number): LevelRun => {
      const floor = step(choose(announcedWith({ budget }), 'akzeptieren'), level, {
        type: 'choose',
        optionId: 'A',
      });
      return step(floor, level, { type: 'continue' });
    };
    expect(play(KLEIN + MITTEL + 1)).toMatchObject({ outcome: 'running', gauges: { budget: 1 } });
    expect(play(KLEIN + MITTEL)).toMatchObject({ outcome: 'collapsed', gauges: { budget: 0 } });
  });

  it('collapses at once if the cost of the strategy takes a gauge to zero', () => {
    const run = choose(announcedWith({ zeit: GROSS }, E(1)), 'vermeiden');
    expect(run).toMatchObject({ phase: 'result', outcome: 'collapsed' });
    expect(run.gauges.zeit).toBe(0);
    expect(eventCauses(run.events, ['zeit'])).toEqual([
      { eventId: E(1), part: 'strategie', gauge: 'zeit', loss: GROSS },
    ]);
  });

  it('collapses if the check by the team takes the last of the time', () => {
    const run = step(announcedWith({ zeit: VERIFY }, E(2)), level, { type: 'verifyForecast' });
    expect(run).toMatchObject({ phase: 'result', outcome: 'collapsed' });
    expect(eventCauses(run.events, ['zeit'])).toEqual([
      { eventId: E(2), part: 'pruefung', gauge: 'zeit', loss: VERIFY },
    ]);
    expect(eventCauses(run.events, ['budget'])).toEqual([]);
    expect(eventCauses(null, ['zeit'])).toEqual([]);
  });

  it('decides the level after the resolution if an event follows the last floor but one', () => {
    // Seven decisions: the third event is announced after the sixth and resolved after the last.
    const seven = { ...level, situationenProDurchgang: 7 };
    expect(eventRounds(seven)).toBe(3);
    let run = runWith(
      [
        [E(4), false],
        [E(5), false],
        [E(3), true],
      ],
      seven,
    );
    run = decide(run, 2, 'A', seven);
    run = choose(run, 'akzeptieren', seven);
    run = decide(run, 1, 'A', seven);
    run = decide(step(run, seven, { type: 'continue' }), 1, 'A', seven);
    run = choose(run, 'vermindern', seven);
    run = decide(run, 1, 'A', seven);
    run = decide(step(run, seven, { type: 'continue' }), 1, 'A', seven);
    run = choose(run, 'uebertragen', seven);
    const last = step(run, seven, { type: 'choose', optionId: 'A' });
    // The last floor is set, but the level is not decided while an event is open.
    expect(last).toMatchObject({ phase: 'feedback', outcome: 'running' });
    const result = step(last, seven, { type: 'continue' });
    expect(result).toMatchObject({ phase: 'eventResult', outcome: 'running' });
    expect(step(result, seven, { type: 'continue' })).toMatchObject({
      phase: 'result',
      outcome: 'completed',
    });
  });
});

describe('judgement on a round (M-27)', () => {
  const verdict = (eventId: string, occurs: boolean, strategyId: StrategyId) =>
    eventVerdict(resolved(eventId, occurs, strategyId).events?.[0] as EventRound, level);

  it('tells a good decision from good luck, and bad luck from missing care', () => {
    // E2 recommends mitigating: some harm remains if the event happens.
    expect(verdict(E(2), false, 'vermindern')).toBe('gut');
    expect(verdict(E(2), true, 'vermindern')).toBe('pech');
    expect(verdict(E(2), false, 'akzeptieren')).toBe('glueck');
    expect(verdict(E(2), true, 'akzeptieren')).toBe('vorsorge');
  });

  it('calls a recommended strategy good if the event happened and did no harm', () => {
    expect(verdict(E(1), true, 'vermeiden')).toBe('gut');
  });

  it('names more protection than the risk was worth, whatever happened', () => {
    // E4 recommends accepting; E2 recommends mitigating.
    expect(verdict(E(4), true, 'vermeiden')).toBe('teuer');
    expect(verdict(E(4), false, 'vermindern')).toBe('teuer');
    expect(verdict(E(2), true, 'vermeiden')).toBe('teuer');
    // Transferring instead of mitigating is not more protection, only a different one.
    expect(verdict(E(2), true, 'uebertragen')).toBe('vorsorge');
    expect(verdict(E(2), false, 'uebertragen')).toBe('glueck');
  });

  it('gives no judgement while the round is open', () => {
    const announced = decide(runWith([[E(1), true]]), 2);
    expect(eventVerdict(announced.events?.[0] as EventRound, level)).toBeNull();
    const chosen = choose(announced, 'vermeiden');
    expect(eventVerdict(chosen.events?.[0] as EventRound, level)).toBeNull();
  });
});

describe('replay with events (L-07, M-03)', () => {
  const choices: OptionId[] = ['A', 'C', 'A', 'A', 'C', 'A', 'A', 'A'];
  const inputs = [
    { verified: false, strategy: 'akzeptieren' as const },
    { verified: false, strategy: 'vermindern' as const },
    { verified: false, strategy: 'akzeptieren' as const },
  ];

  it('repeats a run from seed, choices and what was done about each event', () => {
    for (const seed of [11, 4242, 20261124]) {
      const first = replay(level, seed, [], choices, null, inputs);
      expect(first.phase).toBe('result');
      expect(eventInputsOf(first)).toEqual(inputs);
      const again = replay(level, seed, [], choices, null, eventInputsOf(first));
      expect(again).toEqual(first);
    }
  });

  it('checks the forecast in the replay where the player did', () => {
    // A seed whose first event has an AI forecast.
    let seed = 1;
    while (!findEvent(level, startRun(level, seed).events?.[0]?.eventId ?? '').aiPrognose) seed++;
    const checked = [{ verified: true, strategy: 'akzeptieren' as const }, ...inputs.slice(1)];
    const run = replay(level, seed, [], choices, null, checked);
    const plain = replay(level, seed, [], choices, null, inputs);
    expect(run.events?.[0]?.verified).toBe(true);
    expect(run.gauges.zeit).toBe(plain.gauges.zeit - VERIFY);
  });

  it('stops at the event if the report does not say what was done about it', () => {
    const run = replay(level, 11, [], choices, null, inputs.slice(0, 1));
    expect(run.phase).toBe('event');
    expect(run.history).toHaveLength(4);
    expect(replay(level, 11, [], choices).phase).toBe('event');
  });

  it('carries the events through the error report and reads a report without them', () => {
    const run = replay(level, 11, [], choices, null, inputs);
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
        choices,
        tour: null,
        events: eventInputsOf(run),
        phase: run.phase,
        outcome: run.outcome,
        gauges: { ...run.gauges },
      },
      entries: [],
    });
    expect(extractReplay(report)?.events).toEqual(inputs);
    const old = 'REPLAY: {"levelId":"level-3","seed":5,"recentIds":[],"choices":[],"tour":null}';
    expect(extractReplay(old)?.events).toEqual([]);
    const broken = old.replace('"tour":null', '"tour":null,"events":[{"verified":"ja"}]');
    expect(extractReplay(broken)?.events).toEqual([]);
  });
});

describe('stored run with events (F-704, M-06)', () => {
  const inPlay = (): LevelRun => resolved(E(2), true, 'vermindern');

  it('accepts a run in every phase of a round', () => {
    const announced = decide(
      runWith([
        [E(1), true],
        [E(2), false],
        [E(3), true],
      ]),
      2,
    );
    expect(isRunConsistent(startRun(level, 7), level)).toBe(true);
    expect(isRunConsistent(announced, level)).toBe(true);
    const chosen = choose(announced, 'vermeiden');
    expect(isRunConsistent(chosen, level)).toBe(true);
    expect(isRunConsistent(decide(chosen, 1), level)).toBe(true);
  });

  const full = (): LevelRun => {
    const announced = decide(
      runWith([
        [E(1), true],
        [E(2), false],
        [E(3), true],
      ]),
      2,
    );
    return decide(choose(announced, 'vermeiden'), 1);
  };
  const broken: [string, (run: LevelRun) => void][] = [
    ['an event that no longer exists', (run) => void (run.events![0]!.eventId = 'L3-E99')],
    ['an event drawn twice', (run) => void (run.events![1]!.eventId = run.events![0]!.eventId)],
    ['too few rounds', (run) => void run.events!.pop()],
    ['a strategy without its cost', (run) => void (run.events![0]!.cost = null)],
    ['a resolution without a strategy', (run) => void (run.events![0]!.strategy = null)],
    ['a check of a forecast that does not exist', (run) => void (run.events![2]!.verified = true)],
    ['the event phase with nothing due', (run) => void (run.phase = 'event')],
    ['events gone from a level that has them', (run) => void (run.events = null)],
  ];
  it.each(broken)('rejects %s', (_name, damage) => {
    const run = clone(full());
    damage(run);
    expect(isRunConsistent(run, level)).toBe(false);
  });

  it('rejects a strategy the event does not offer and events in a level without them', () => {
    const locked = clone(level);
    const event = locked.ereignisse?.pool.find((e) => e.id === E(2));
    if (!event) throw new Error('fixture has no event');
    event.strategien.vermindern = { verfuegbar: false, text: 'Geht nicht.', grund: 'Darum.' };
    expect(isRunConsistent(inPlay(), locked)).toBe(false);
    const plain = withoutEvents(level);
    expect(isRunConsistent(full(), plain)).toBe(false);
  });

  it('saves and loads a run with events, and drops a run whose events are damaged', () => {
    const storage = memoryStorage();
    const store = createLocalStorageStore(() => storage, createLogger({ now: () => 0 }));
    const run = inPlay();
    store.save(withRun(emptyProgress(), run));
    expect(store.load().progress.currentRun).toEqual(run);

    const key = storage.key(0) ?? '';
    const raw = JSON.parse(storage.getItem(key) ?? '{}');
    raw.currentRun.events[0].strategy = 'ignorieren';
    storage.setItem(key, JSON.stringify(raw));
    const outcome = store.load();
    expect(outcome.status).toBe('migrated');
    expect(outcome.droppedRun).toBe(true);
    expect(outcome.progress.currentRun).toBeNull();
  });
});

describe('start value', () => {
  it('starts every gauge of an event level where every level starts', () => {
    expect(startRun(level, 7).gauges).toEqual({ budget: START, zeit: START, stabilitaet: START });
  });
});

describe('events in the picture (M-28)', () => {
  const levels = [{ level, available: true }];
  const lotOf = (run: LevelRun) => sceneModel(levels, withRun(emptyProgress(), run), run).lots[0];

  it('shows the event from its announcement until the floor after it, then how it ended', () => {
    const before = runWith([[E(1), true]]);
    expect(lotOf(before)?.threat).toBeNull();

    const announced = decide(before, 2);
    // E1 has no look of its own in the fixture; every event there is «generisch».
    expect(lotOf(announced)?.threat).toEqual({ look: 'generisch', state: 'announced' });
    const chosen = choose(announced, 'vermindern');
    expect(lotOf(chosen)?.threat).toEqual({ look: 'generisch', state: 'announced' });
    const floor = step(chosen, level, { type: 'choose', optionId: 'A' });
    expect(lotOf(floor)?.threat?.state).toBe('announced');

    const struck = step(floor, level, { type: 'continue' });
    expect(lotOf(struck)?.threat).toEqual({ look: 'generisch', state: 'struck' });
    expect(lotOf(step(struck, level, { type: 'continue' }))?.threat).toBeNull();

    const passed = resolved(E(1), false, 'vermindern');
    expect(lotOf(passed)?.threat?.state).toBe('passed');
    expect(threatOf(null, level, 'event', 2)).toBeNull();
  });

  it('takes the look from the content of the event', () => {
    const storm = clone(level);
    const event = storm.ereignisse?.pool.find((e) => e.id === E(3));
    if (event) event.darstellung = 'sturm';
    const run = decide(runWith([[E(3), true]], storm), 2, 'A', storm);
    const model = sceneModel([{ level: storm, available: true }], emptyProgress(), run);
    expect(model.lots[0]?.threat).toEqual({ look: 'sturm', state: 'announced' });
    // An event is weighed in peace: nothing in the picture may distract (M-04).
    expect(model.deciding).toBe(true);
  });

  it('puts each measure on the floor that stood when it was taken; accepting builds nothing', () => {
    let run = runWith([
      [E(1), false],
      [E(2), false],
      [E(4), false],
    ]);
    run = choose(decide(run, 2), 'vermeiden');
    expect(measuresOf(run.events)).toEqual([{ floor: 1, strategy: 'vermeiden' }]);
    run = decide(run, 1);
    run = decide(step(run, level, { type: 'continue' }), 1);
    run = choose(run, 'uebertragen');
    run = decide(run, 1);
    run = decide(step(run, level, { type: 'continue' }), 1);
    run = choose(run, 'akzeptieren');
    const measures = [
      { floor: 1, strategy: 'vermeiden' },
      { floor: 3, strategy: 'uebertragen' },
    ];
    expect(measuresOf(run.events)).toEqual(measures);
    expect(lotOf(run)?.measures).toEqual(measures);
    expect(measuresOf(null)).toEqual([]);
  });

  it('keeps the measures on the finished building and drops them with a collapsed one', () => {
    const choices: OptionId[] = ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A'];
    const inputs = [1, 2, 3].map(() => ({ verified: false, strategy: 'vermindern' as const }));
    const done = replay(level, 11, [], choices, null, inputs);
    expect(done.outcome).toBe('completed');
    const progress = clearRun(finishRun(emptyProgress(), done, level));
    const best = progress.levels[level.id]?.best;
    expect(best?.measures).toHaveLength(3);
    expect(best?.measures.every((m) => m.strategy === 'vermindern')).toBe(true);
    // The city shows the building as it was finished, measures included.
    expect(sceneModel(levels, progress, null).lots[0]?.measures).toEqual(best?.measures);

    const fallen = choose(
      {
        ...decide(runWith([[E(1), true]]), 2),
        gauges: { budget: 50, zeit: GROSS, stabilitaet: 50 },
      },
      'vermeiden',
    );
    expect(fallen.outcome).toBe('collapsed');
    expect(lotOf(fallen)?.measures).toEqual([]);
    expect(lotOf(fallen)?.threat).toBeNull();
  });

  it('loads a building finished before the events existed, without measures', () => {
    const storage = memoryStorage();
    const store = createLocalStorageStore(() => storage, createLogger({ now: () => 0 }));
    const plain = makeLevel(1);
    const done = replay(plain, 5, [], ['A', 'A', 'A', 'A', 'A', 'A']);
    store.save(clearRun(finishRun(emptyProgress(), done, plain)));
    const key = storage.key(0) ?? '';
    const raw = JSON.parse(storage.getItem(key) ?? '{}');
    delete raw.levels[plain.id].best.measures;
    storage.setItem(key, JSON.stringify(raw));
    const outcome = store.load();
    expect(outcome.status).toBe('ok');
    expect(outcome.progress.levels[plain.id]?.best?.measures).toEqual([]);
  });
});
