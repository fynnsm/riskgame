import type {
  EffectLevel,
  Effects,
  GaugeKey,
  Level,
  Probability,
  RiskEvent,
  Strategy,
  StrategyId,
} from '../content/schema.ts';
import { GAUGE_KEYS, STRATEGY_IDS } from '../content/schema.ts';
import { BALANCE } from './balance.ts';
import type { Gauges } from './gauges.ts';
import type { Rng } from './rng.ts';
import { shuffle } from './rng.ts';

/** What an event did once it was resolved. */
export interface EventResolution {
  /** Whether the event happened; fixed at the start of the run. */
  occurred: boolean;
  /** What it changed on the gauges, after the strategy and after clamping. */
  delta: Gauges;
  gaugesAfter: Gauges;
}

/** One event of a run with everything the player did about it. Serialisable. */
export interface EventRound {
  eventId: string;
  /** M-03: decided from the seed when the run starts, not when the event is resolved. */
  occurs: boolean;
  /** True once the player had the forecast checked by the team (M-23). */
  verified: boolean;
  strategy: StrategyId | null;
  /** What the strategy cost, after clamping; null until one is chosen. */
  cost: Gauges | null;
  resolution: EventResolution | null;
}

export type AvailableStrategy = Extract<Strategy, { verfuegbar: true }>;

/** How a decision on an event is judged afterwards (M-27). */
export type EventVerdict =
  /** Recommended strategy, and no harm came of the event. */
  | 'gut'
  /** Recommended strategy, and the event still did harm. */
  | 'pech'
  /** Too little protection, but the event did not happen. */
  | 'glueck'
  /** Too little protection, and the event happened. */
  | 'vorsorge'
  /** More protection than the risk was worth. */
  | 'teuer';

/** How many rounds of events a run of this level has (M-20). */
export function eventRounds(level: Level): number {
  if (!level.ereignisse) return 0;
  // An event needs a floor after it to be resolved on, so none is announced after the last decision.
  const slots = BALANCE.events.afterDecisions.filter(
    (decisions) => decisions < level.situationenProDurchgang,
  ).length;
  return Math.min(level.ereignisse.ereignisseProDurchgang, slots);
}

/**
 * Draws the events of a run and decides, here and now, which of them will happen. Everything
 * later in the run only reads that, so seed and inputs repeat the run exactly (M-03).
 */
export function startEvents(level: Level, rng: Rng): EventRound[] | null {
  const rounds = eventRounds(level);
  if (!level.ereignisse || rounds === 0) return null;
  return shuffle(level.ereignisse.pool, rng)
    .slice(0, rounds)
    .map((event) => ({
      eventId: event.id,
      occurs: rng() < BALANCE.events.probability[event.wahrscheinlichkeit],
      verified: false,
      strategy: null,
      cost: null,
      resolution: null,
    }));
}

export function findEvent(level: Level, id: string): RiskEvent {
  const event = level.ereignisse?.pool.find((e) => e.id === id);
  if (!event) throw new Error(`Unknown event ${id} in ${level.id}`);
  return event;
}

/** The round to announce once `decisions` decisions are taken, or null. */
export function dueRound(rounds: readonly EventRound[] | null, decisions: number): number | null {
  if (!rounds) return null;
  const index = BALANCE.events.afterDecisions.indexOf(decisions as never);
  const round = rounds[index];
  return round && round.strategy === null ? index : null;
}

/** The round whose strategy is chosen and which waits for the next floor, or null. */
export function pendingRound(rounds: readonly EventRound[] | null): number | null {
  if (!rounds) return null;
  const index = rounds.findIndex((r) => r.strategy !== null && r.resolution === null);
  return index < 0 ? null : index;
}

const ONE_STEP_SMALLER: Record<EffectLevel, EffectLevel> = {
  '-gross': '-mittel',
  '-mittel': '-klein',
  '-klein': '0',
  '0': '0',
  '+klein': '0',
  '+mittel': '+klein',
  '+gross': '+mittel',
};

const NO_EFFECT: Effects = { budget: '0', zeit: '0', stabilitaet: '0' };

/** M-21: what is left of an event's impact under each strategy. */
export function impactUnder(impact: Effects, strategy: StrategyId): Effects {
  switch (strategy) {
    case 'vermeiden':
      return NO_EFFECT;
    case 'vermindern':
      return {
        budget: ONE_STEP_SMALLER[impact.budget],
        zeit: ONE_STEP_SMALLER[impact.zeit],
        stabilitaet: ONE_STEP_SMALLER[impact.stabilitaet],
      };
    case 'uebertragen':
      return { ...impact, budget: '0' };
    case 'akzeptieren':
      return impact;
  }
}

export function availableStrategy(event: RiskEvent, id: StrategyId): AvailableStrategy | null {
  const strategy = event.strategien[id];
  return strategy.verfuegbar ? strategy : null;
}

export function isRecommended(event: RiskEvent, id: StrategyId): boolean {
  return availableStrategy(event, id)?.empfohlen ?? false;
}

/** Points a round adds to the final inspection: the recommended strategy counts, the outcome does not (M-25). */
export function roundPoints(round: EventRound, level: Level): number {
  if (round.strategy === null) return 0;
  return isRecommended(findEvent(level, round.eventId), round.strategy)
    ? BALANCE.events.recommendedPoints
    : 0;
}

/** The most points the events of a run can add. */
export function eventMaxPoints(rounds: readonly EventRound[] | null): number {
  return (rounds?.length ?? 0) * BALANCE.events.recommendedPoints;
}

export interface Forecast {
  /** Who says so: an AI forecast or the team's own estimate (M-23). */
  source: 'ai' | 'team';
  /** The probability the card shows before any check. */
  shown: Probability;
  /** The actual probability; null while an AI forecast is unchecked. */
  truth: Probability | null;
  /** True if the forecast can be checked and has not been yet. */
  canVerify: boolean;
}

export function forecastOf(event: RiskEvent, round: Pick<EventRound, 'verified'>): Forecast {
  if (!event.aiPrognose) {
    return {
      source: 'team',
      shown: event.wahrscheinlichkeit,
      truth: event.wahrscheinlichkeit,
      canVerify: false,
    };
  }
  return {
    source: 'ai',
    shown: event.aiPrognose.angezeigt,
    truth: round.verified ? event.wahrscheinlichkeit : null,
    canVerify: !round.verified,
  };
}

/** M-23: an unreliable AI forecast was acted on without having it checked. */
export function trustedUnreliable(event: RiskEvent, round: EventRound): boolean {
  return (
    round.strategy !== null &&
    event.aiPrognose !== undefined &&
    !event.aiPrognose.verlaesslich &&
    !round.verified
  );
}

/** How much a strategy protects; used to tell too little protection from too much. */
const PROTECTION: Record<StrategyId, number> = {
  akzeptieren: 0,
  vermindern: 1,
  uebertragen: 1,
  vermeiden: 2,
};

function didHarm(resolution: EventResolution): boolean {
  return GAUGE_KEYS.some((key) => resolution.delta[key] < 0);
}

/** M-27: the judgement on a resolved round; null while it is open. */
export function eventVerdict(round: EventRound, level: Level): EventVerdict | null {
  if (round.strategy === null || round.resolution === null) return null;
  const event = findEvent(level, round.eventId);
  if (isRecommended(event, round.strategy)) {
    return didHarm(round.resolution) ? 'pech' : 'gut';
  }
  const recommended = STRATEGY_IDS.filter((id) => isRecommended(event, id));
  const most = Math.max(...recommended.map((id) => PROTECTION[id]));
  if (PROTECTION[round.strategy] > most) return 'teuer';
  return round.resolution.occurred ? 'vorsorge' : 'glueck';
}

export interface EventCause {
  eventId: string;
  /** What cost the points: the strategy, the check by the team or the event itself. */
  part: 'strategie' | 'pruefung' | 'ereignis';
  gauge: GaugeKey;
  loss: number;
}

function worstLoss(
  delta: Gauges | null,
  failed: readonly GaugeKey[],
): { gauge: GaugeKey; loss: number } | null {
  if (!delta) return null;
  let worst: GaugeKey | null = null;
  for (const key of failed) {
    if (delta[key] < 0 && (worst === null || delta[key] < delta[worst])) worst = key;
  }
  return worst === null ? null : { gauge: worst, loss: -delta[worst] };
}

/**
 * M-27: what the events took from the gauges that hit zero, heaviest first. Complements
 * `collapseCauses`, which lists the decisions.
 */
export function eventCauses(
  rounds: readonly EventRound[] | null,
  failed: readonly GaugeKey[],
): EventCause[] {
  const causes: EventCause[] = [];
  for (const round of rounds ?? []) {
    const cost = worstLoss(round.cost, failed);
    if (cost) causes.push({ eventId: round.eventId, part: 'strategie', ...cost });
    const impact = worstLoss(round.resolution?.delta ?? null, failed);
    if (impact) causes.push({ eventId: round.eventId, part: 'ereignis', ...impact });
    if (round.verified && failed.includes('zeit')) {
      causes.push({
        eventId: round.eventId,
        part: 'pruefung',
        gauge: 'zeit',
        loss: BALANCE.events.verifyCostTime,
      });
    }
  }
  return causes.sort((a, b) => b.loss - a.loss);
}
