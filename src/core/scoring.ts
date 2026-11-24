import type { GaugeKey, Level } from '../content/schema.ts';
import { GAUGE_KEYS } from '../content/schema.ts';
import { BALANCE } from './balance.ts';
import type { ChoiceRecord, LevelRun } from './game.ts';
import type { Gauges } from './gauges.ts';
import { lowestValue } from './gauges.ts';
import { TOUR_MAX_POINTS } from './tour.ts';

export type Stars = 0 | 1 | 2 | 3;
export type GoalStatus = 'erreicht' | 'nicht-erreicht' | 'nicht-geprueft';

export interface GoalResult {
  id: string;
  text: string;
  status: GoalStatus;
}

export function scoreRatio(history: readonly ChoiceRecord[]): number {
  if (history.length === 0) return 0;
  const points = history.reduce((sum, c) => sum + BALANCE.ratingPoints[c.rating], 0);
  return points / (history.length * BALANCE.ratingPoints.gut);
}

export interface Acceptance {
  points: number;
  max: number;
  /** Points needed to pass the final inspection (F-211). */
  required: number;
}

/** What of a run counts for the final inspection. */
export type Scored = Pick<LevelRun, 'history' | 'situationIds' | 'tour'>;

/**
 * Points reached so far and needed at the end. The decisions count by their rating, the
 * site tour by how well it went (M-13); a level without a tour has fewer points to give.
 */
export function acceptance(run: Scored): Acceptance {
  const ratings = run.history.reduce((sum, c) => sum + BALANCE.ratingPoints[c.rating], 0);
  const max = run.situationIds.length * BALANCE.ratingPoints.gut + (run.tour ? TOUR_MAX_POINTS : 0);
  return {
    points: ratings + (run.tour?.result?.points ?? 0),
    max,
    required: Math.ceil(max * BALANCE.acceptance.minScoreRatio),
  };
}

/** F-211: whether a building that still stands passes its final inspection. */
export function isAccepted(run: Scored): boolean {
  const score = acceptance(run);
  return score.points >= score.required;
}

/** F-603: stars from ratings and final gauges. A collapsed or rejected building earns none. */
export function starsFor(run: Scored & Pick<LevelRun, 'outcome' | 'gauges'>): Stars {
  if (run.outcome !== 'completed') return 0;
  const score = acceptance(run);
  const ratio = score.max === 0 ? 0 : score.points / score.max;
  const lowest = lowestValue(run.gauges);
  const { three, two } = BALANCE.stars;
  if (ratio >= three.minScoreRatio && lowest >= three.minGauge) return 3;
  if (ratio >= two.minScoreRatio && lowest >= two.minGauge) return 2;
  return 1;
}

/** F-602: a goal counts as reached if the decisions on its situations were mostly good. */
export function goalResults(level: Level, history: readonly ChoiceRecord[]): GoalResult[] {
  return level.lernziele.map((goal) => {
    const choices = history.filter((c) => {
      const situation = level.situationen.find((s) => s.id === c.situationId);
      return situation?.lernziel === goal.id;
    });
    let status: GoalStatus = 'nicht-geprueft';
    if (choices.length > 0) {
      status = scoreRatio(choices) >= BALANCE.goalReachedRatio ? 'erreicht' : 'nicht-erreicht';
    }
    return { id: goal.id, text: goal.text, status };
  });
}

/** The gauges that hit zero, in fixed order. Empty if the building still stands. */
export function collapsedGauges(gauges: Gauges): GaugeKey[] {
  return GAUGE_KEYS.filter((key) => gauges[key] <= BALANCE.gauge.min);
}

/**
 * F-209: the decisions that pushed a collapsed gauge down, heaviest first.
 * Each entry names the gauge it hurt most among those that failed.
 */
export function collapseCauses(
  history: readonly ChoiceRecord[],
  failed: readonly GaugeKey[],
): { choice: ChoiceRecord; gauge: GaugeKey; loss: number }[] {
  const causes: { choice: ChoiceRecord; gauge: GaugeKey; loss: number }[] = [];
  for (const choice of history) {
    let worst: GaugeKey | null = null;
    for (const key of failed) {
      if (choice.delta[key] < 0 && (worst === null || choice.delta[key] < choice.delta[worst])) {
        worst = key;
      }
    }
    if (worst !== null) causes.push({ choice, gauge: worst, loss: -choice.delta[worst] });
  }
  return causes.sort((a, b) => b.loss - a.loss);
}
