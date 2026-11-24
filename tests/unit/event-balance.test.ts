import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLevel } from '../../src/content/validate.ts';
import { BALANCE } from '../../src/core/balance.ts';
import type { EventBalanceReport } from '../../src/core/simulate.ts';
import {
  eventBalanceOpen,
  eventBalanceProblems,
  playEvents,
  simulateEvents,
} from '../../src/core/simulate.ts';
import { clone, makeEventLevel, makeMechanicsLevel, RULES } from './fixtures.ts';

const level = makeEventLevel();
const strategies = (run: ReturnType<typeof playEvents>) => run.events?.map((r) => r.strategy);

describe('simulated players and events (M-29)', () => {
  it('plays a whole run with the steps of the game, the same way every time', () => {
    const run = playEvents(level, 4242, 'recommended');
    expect(run.phase).toBe('result');
    expect(run.history).toHaveLength(8);
    expect(run.events?.every((r) => r.resolution !== null)).toBe(true);
    expect(playEvents(level, 4242, 'recommended')).toEqual(run);
    expect(playEvents(level, 4242, 'random')).toEqual(playEvents(level, 4242, 'random'));
  });

  it('takes the strategy its way of playing names', () => {
    expect(strategies(playEvents(level, 7, 'accept'))).toEqual([
      'akzeptieren',
      'akzeptieren',
      'akzeptieren',
    ]);
    expect(new Set(strategies(playEvents(level, 7, 'mitigate')))).toEqual(new Set(['vermindern']));
    expect(new Set(strategies(playEvents(level, 7, 'transfer')))).toEqual(new Set(['uebertragen']));
    // Avoiding everything in the fixture costs 78 points of time: the run ends on the way.
    const avoid = playEvents(level, 7, 'avoid');
    expect(avoid.outcome).toBe('collapsed');
    expect(
      avoid.events?.filter((r) => r.strategy !== null).every((r) => r.strategy === 'vermeiden'),
    ).toBe(true);
    // The recommended strategy earns every point there is.
    expect(playEvents(level, 7, 'recommended').eventPoints).toBe(3);
  });

  it('falls back when a strategy is not on offer', () => {
    const locked = clone(level);
    for (const event of locked.ereignisse?.pool ?? []) {
      event.strategien.vermindern = { verfuegbar: false, text: 'Geht nicht.', grund: 'Darum.' };
      // The fixture recommends mitigating for some events; keep every event valid.
      event.strategien.akzeptieren = {
        verfuegbar: true,
        text: 'Tragen.',
        kosten: { budget: '0', zeit: '0', stabilitaet: '0' },
        empfohlen: true,
        erklaerung: 'Darum.',
      };
    }
    expect(new Set(strategies(playEvents(locked, 7, 'mitigate')))).toEqual(
      new Set(['uebertragen']),
    );
    for (const event of locked.ereignisse?.pool ?? []) {
      event.strategien.uebertragen = { verfuegbar: false, text: 'Geht nicht.', grund: 'Darum.' };
      event.strategien.vermeiden = { verfuegbar: false, text: 'Geht nicht.', grund: 'Darum.' };
    }
    for (const policy of ['mitigate', 'transfer', 'avoid', 'random'] as const) {
      expect(new Set(strategies(playEvents(locked, 7, policy)))).toEqual(new Set(['akzeptieren']));
    }
  });

  it('has the forecast checked only where there is one, and lets every event happen on demand', () => {
    const run = playEvents(level, 7, 'verified', true);
    for (const round of run.events ?? []) {
      const event = level.ereignisse?.pool.find((e) => e.id === round.eventId);
      expect(round.verified).toBe(event?.aiPrognose !== undefined);
      expect(round.occurs).toBe(true);
      expect(round.resolution?.occurred).toBe(true);
    }
    expect(playEvents(level, 7, 'recommended').events?.some((r) => r.verified)).toBe(false);
  });

  it('walks the tour of a level that has one: rightly, or by the toss of a coin', () => {
    const both = makeMechanicsLevel();
    expect(playEvents(both, 7, 'recommended').tour?.result).toMatchObject({ correct: 8 });
    const coin = playEvents(both, 7, 'random').tour?.result?.correct ?? 8;
    expect(coin).toBeLessThan(8);
  });
});

describe('balance of the levels with events (M-29)', () => {
  const zero: EventBalanceReport = {
    levelId: 'level-9',
    runs: 100,
    recommended: { collapses: 0, failures: 0, lowest: 40 },
    verified: { collapses: 0, lowest: 40 },
    accept: { failRate: 0.5, strainedRate: 0.6 },
    avoid: { lowTimeRate: 0.6 },
    mitigate: { lowBudgetRate: 0.6 },
    transfer: { lowBudgetRate: 0.6 },
    random: { passRate: 0.2, collapseRate: 0.3, failRate: 0.8 },
  };

  it('finds nothing wrong with a report that holds every condition', () => {
    expect(eventBalanceProblems(zero)).toEqual([]);
    expect(eventBalanceOpen(zero)).toEqual([]);
  });

  it('names each enforced condition that is broken', () => {
    expect(
      eventBalanceProblems({ ...zero, recommended: { collapses: 2, failures: 2, lowest: 0 } }),
    ).toEqual(['recommended-collapses']);
    expect(
      eventBalanceProblems({ ...zero, recommended: { collapses: 0, failures: 3, lowest: 35 } }),
    ).toEqual(['recommended-fails']);
    expect(eventBalanceProblems({ ...zero, verified: { collapses: 1, lowest: 0 } })).toEqual([
      'verified-collapses',
    ]);
    expect(eventBalanceProblems({ ...zero, avoid: { lowTimeRate: 0.49 } })).toEqual([
      'avoid-cheap',
    ]);
    expect(eventBalanceProblems({ ...zero, mitigate: { lowBudgetRate: 0.49 } })).toEqual([
      'mitigate-cheap',
    ]);
    expect(eventBalanceProblems({ ...zero, transfer: { lowBudgetRate: 0.1 } })).toEqual([
      'transfer-cheap',
    ]);
    expect(eventBalanceProblems({ ...zero, avoid: { lowTimeRate: 0.5 } })).toEqual([]);
  });

  it('names each condition of the brief that is measured but not yet decided', () => {
    const c = BALANCE.checks;
    expect(
      eventBalanceOpen({
        ...zero,
        recommended: { collapses: 0, failures: 0, lowest: c.events.recommendedMinGauge - 1 },
      }),
    ).toEqual(['recommended-low']);
    expect(eventBalanceOpen({ ...zero, accept: { failRate: 0.39, strainedRate: 0.6 } })).toEqual([
      'accept-safe',
    ]);
    const tooHard = { passRate: 0.05, collapseRate: 0.3, failRate: 0.95 };
    const tooEasy = { passRate: 0.5, collapseRate: 0.1, failRate: 0.5 };
    expect(eventBalanceOpen({ ...zero, random: tooHard })).toEqual(['random-range']);
    expect(eventBalanceOpen({ ...zero, random: tooEasy })).toEqual(['random-range']);
  });

  it('gives shares between nought and one and the same report every time', () => {
    const report = simulateEvents(level, 200);
    expect(report.runs).toBe(200);
    for (const share of [
      report.accept.failRate,
      report.accept.strainedRate,
      report.avoid.lowTimeRate,
      report.mitigate.lowBudgetRate,
      report.transfer.lowBudgetRate,
      report.random.failRate,
      report.random.collapseRate,
    ]) {
      expect(share).toBeGreaterThanOrEqual(0);
      expect(share).toBeLessThanOrEqual(1);
    }
    expect(report.accept.strainedRate).toBeGreaterThanOrEqual(report.accept.failRate);
    expect(report.random.failRate + report.random.passRate).toBeCloseTo(1);
    expect(simulateEvents(level, 200)).toEqual(report);
  });

  it('holds every enforced condition in every level that ships with events', () => {
    for (const nummer of [3, 4, 5]) {
      const name = `level-${nummer}.json`;
      const file = join(import.meta.dirname, '..', '..', 'content', 'levels', name);
      const result = validateLevel(JSON.parse(readFileSync(file, 'utf8')), name, RULES);
      expect(result.ok, name).toBe(true);
      if (!result.ok) continue;
      expect(result.level.ereignisse?.pool).toHaveLength(5);
      const report = simulateEvents(result.level, 1500);
      expect(eventBalanceProblems(report), name).toEqual([]);
      // Good decisions and recommended strategies always end in an accepted building.
      expect(report.recommended, name).toMatchObject({ collapses: 0, failures: 0 });
    }
  }, 60_000);
});
