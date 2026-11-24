import type { TourType } from '../content/mechanics-rules.ts';
import { tourType } from '../content/mechanics-rules.ts';
import type { EffectLevel, Level, TourSite } from '../content/schema.ts';
import { BALANCE } from './balance.ts';
import type { Gauges } from './gauges.ts';
import type { Rng } from './rng.ts';
import { shuffle } from './rng.ts';

/** How well the tour went: decides the start of the building and the points (M-13). */
export type TourGrade = 'good' | 'fair' | 'poor';

export interface TourResult {
  correct: number;
  grade: TourGrade;
  /** Points for the final inspection. */
  points: number;
  /** What the tour changed on the gauges, after clamping. */
  delta: Gauges;
}

/** The tour of one run. Serialisable, part of the stored run. */
export interface TourState {
  /** The drawn places in the order the player meets them. */
  siteIds: string[];
  /** true: «Ins Risikoregister», false: «Kein Risiko». A place without an entry is not judged yet. */
  judgements: Record<string, boolean>;
  /** Set once the tour is finished; from then on nothing can be changed. */
  result: TourResult | null;
}

/** One place as the resolution shows it (M-14). */
export interface TourReviewItem {
  site: TourSite;
  /** False if the player left the place open; it then counts as «Kein Risiko». */
  judged: boolean;
  judgedRisk: boolean;
  correct: boolean;
  /** Whether the drone was right: it marked a real risk or left a harmless place alone. */
  droneRight: boolean;
}

const TOUR_TYPES: readonly TourType[] = ['gefunden', 'fehlalarm', 'uebersehen', 'unauffaellig'];

/**
 * M-11: draws the wanted number of each type, every place (`ort`) at most once. The pool is
 * shuffled first, then searched in that order, so the same seed gives the same tour.
 */
export function drawTour(
  pool: readonly TourSite[],
  draw: Readonly<Record<TourType, number>>,
  rng: Rng,
): TourSite[] {
  const candidates = shuffle(pool, rng);
  const need = { ...draw };
  const used = new Set<string>();
  const picked: TourSite[] = [];
  const search = (from: number): boolean => {
    if (TOUR_TYPES.every((type) => need[type] === 0)) return true;
    for (let i = from; i < candidates.length; i++) {
      const site = candidates[i] as TourSite;
      const type = tourType(site);
      if (need[type] === 0 || used.has(site.ort)) continue;
      need[type] -= 1;
      used.add(site.ort);
      picked.push(site);
      if (search(i + 1)) return true;
      need[type] += 1;
      used.delete(site.ort);
      picked.pop();
    }
    return false;
  };
  if (!search(0)) {
    throw new Error('Cannot draw a tour: too few places of one type or too many at one place');
  }
  // The search finds places in pool order of the shuffle; a second shuffle keeps the types mixed.
  return shuffle(picked, rng);
}

export function startTour(level: Level, rng: Rng): TourState | null {
  if (!level.rundgang) return null;
  const sites = drawTour(level.rundgang.stellen, BALANCE.tour.draw, rng);
  return { siteIds: sites.map((s) => s.id), judgements: {}, result: null };
}

export function tourGrade(correct: number): TourGrade {
  if (correct >= BALANCE.tour.goodFrom) return 'good';
  if (correct >= BALANCE.tour.fairFrom) return 'fair';
  return 'poor';
}

/** What a grade does to the stability the building starts with. */
export function tourEffect(grade: TourGrade): EffectLevel {
  return BALANCE.tour.stability[grade];
}

export function tourPoints(grade: TourGrade): number {
  return BALANCE.tour.points[grade];
}

/** The most points a tour can add to the final inspection. */
export const TOUR_MAX_POINTS: number = BALANCE.tour.points.good;

function findSite(level: Level, id: string): TourSite {
  const site = level.rundgang?.stellen.find((s) => s.id === id);
  if (!site) throw new Error(`Unknown tour place ${id} in ${level.id}`);
  return site;
}

/** Every drawn place with the player's judgement. A place left open counts as «Kein Risiko» (M-12). */
export function tourReview(tour: TourState, level: Level): TourReviewItem[] {
  return tour.siteIds.map((id) => {
    const site = findSite(level, id);
    const judged = Object.hasOwn(tour.judgements, id);
    const judgedRisk = judged && tour.judgements[id] === true;
    return {
      site,
      judged,
      judgedRisk,
      correct: judgedRisk === site.istRisiko,
      droneRight: (site.drohne === 'markiert') === site.istRisiko,
    };
  });
}

export function countCorrect(tour: TourState, level: Level): number {
  return tourReview(tour, level).filter((item) => item.correct).length;
}

/**
 * The places put into the risk register, once the tour is finished; null before that. With
 * the seed this is all a replay needs to repeat the tour (L-07).
 */
export function registeredRisks(tour: TourState | null): string[] | null {
  if (!tour || tour.result === null) return null;
  return tour.siteIds.filter((id) => tour.judgements[id] === true);
}

/** How many of the drawn places have been judged; for the counter «x von 8 beurteilt». */
export function judgedCount(tour: TourState): number {
  return tour.siteIds.filter((id) => Object.hasOwn(tour.judgements, id)).length;
}
