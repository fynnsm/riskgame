import type { Outcome } from '../core/game.ts';
import type { SceneModel } from '../core/scene.ts';
import type { Stars } from '../core/scoring.ts';
import type { TimeOfDay } from './palette.ts';
import { TUNING } from './tuning.ts';

/**
 * The director (B1): pure functions that turn game state into instructions for the scene.
 * No Three.js and no DOM in here, so every mapping can be unit-tested. The scene classes
 * only carry out what these functions decide.
 */

export type Quality = 0 | 1 | 2;

export type SceneMoment =
  | { kind: 'start' }
  | { kind: 'level'; nummer: number }
  /** `progress` runs from 0 to 1 over the closing sequence. */
  | { kind: 'finale'; progress: number };

/**
 * Which moment of the game a scene model shows. `finaleProgress` runs from 0 to 1 over the
 * closing sequence; the view counts it, because only the view knows how long it has played.
 */
export function momentFor(
  model: Pick<SceneModel, 'mode' | 'focus' | 'lots'>,
  finaleProgress = 0,
): SceneMoment {
  const focused = model.focus === null ? undefined : model.lots[model.focus];
  if (model.mode === 'level' && focused) return { kind: 'level', nummer: focused.nummer };
  if (model.mode === 'finale') return { kind: 'finale', progress: finaleProgress };
  // The start page is always at noon, also once every building stands.
  return { kind: 'start' };
}

/** B5: where the camera looks during the flight past the buildings, as a share of the row, 0 to 1. */
export function finaleFlight(
  seconds: number,
  reducedMotion: boolean,
): { along: number; flying: boolean } {
  const total = TUNING.finale.flightSeconds;
  if (reducedMotion || seconds >= total) return { along: 0.5, flying: false };
  const t = Math.max(0, seconds) / total;
  // Ease in and out, so the flight starts and ends gently.
  return { along: t * t * (3 - 2 * t), flying: true };
}

/** B5: progress of the closing sequence for the time of day; night falls halfway through. */
export function finaleProgress(seconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  return Math.min(1, Math.max(0, seconds) / TUNING.finale.duskSeconds);
}

const LEVEL_TIMES: readonly TimeOfDay[] = ['morgen', 'mittag', 'nachmittag', 'abend', 'nacht'];

/** B2: each level has its own time of day; the finale turns from evening into night. */
export function timeOfDay(moment: SceneMoment): TimeOfDay {
  if (moment.kind === 'start') return 'mittag';
  if (moment.kind === 'finale') return moment.progress < 0.5 ? 'abend' : 'nacht';
  // Levels beyond the fifth repeat the cycle rather than fail.
  const index =
    (((moment.nummer - 1) % LEVEL_TIMES.length) + LEVEL_TIMES.length) % LEVEL_TIMES.length;
  return LEVEL_TIMES[index] as TimeOfDay;
}

export interface Celebration {
  effect: 'feuerwerk' | 'konfetti' | 'keine';
  flag: boolean;
  workers: 'jubeln' | 'nicken';
}

/** B5: how a passed level is celebrated, by stars. */
export function celebrationFor(stars: Stars): Celebration {
  if (stars >= 3) return { effect: 'feuerwerk', flag: true, workers: 'jubeln' };
  if (stars === 2) return { effect: 'konfetti', flag: true, workers: 'jubeln' };
  return { effect: 'keine', flag: false, workers: 'nicken' };
}

export type CityTitle = 'gold' | 'solide' | 'baustellen';

/** B5: title of the closing screen. `maxStars` is three per level. */
export function cityTitle(totalStars: number, maxStars: number): CityTitle {
  if (totalStars >= maxStars) return 'gold';
  // 11 of 15: more than two stars per level on average.
  return totalStars > (maxStars * 2) / 3 ? 'solide' : 'baustellen';
}

/**
 * N1: the quality step a device starts on. A phone (coarse pointer) starts without real
 * shadows; from there the view only ever steps down, when frames come too slowly.
 */
export function startQuality(coarsePointer: boolean): Quality {
  return coarsePointer ? 1 : 2;
}

export interface Decoration {
  clouds: number;
  planes: boolean;
  balloon: boolean;
  birds: boolean;
  /** Bus, van and tram in addition to cars. */
  richTraffic: boolean;
  pedestrians: boolean;
  /** Swaying trees, shimmering water, chimney smoke. */
  ambience: boolean;
  /** Lit windows and headlights, where the time of day asks for them. */
  nightLights: boolean;
  softShadows: boolean;
}

/** B3: what each quality step shows. Step 0 shows nothing decorative except clouds. */
export function decorationFor(quality: Quality): Decoration {
  return {
    clouds: TUNING.decoration.clouds[quality],
    planes: quality >= 1,
    balloon: quality >= 2,
    birds: quality >= 2,
    richTraffic: quality >= 1,
    pedestrians: quality >= 2,
    ambience: quality >= 1,
    nightLights: quality >= 1,
    softShadows: quality >= 2,
  };
}

export type SequenceStep =
  | 'fertigstellung'
  | 'banner'
  | 'sterne'
  | 'kameraschwenk'
  | 'feier'
  | 'pruefer'
  | 'stempel'
  | 'einsturz'
  | 'endbild';

export interface Sequence {
  /** What happens when; steps may overlap. */
  steps: { step: SequenceStep; at: number; seconds: number }[];
  /** When the last step ends; never more than the limit in TUNING. */
  seconds: number;
  /** Second at which the banner or stamp appears. */
  bannerAt: number;
  /** Second at which each earned star appears, one entry per star. */
  starsAt: number[];
  cameraShake: boolean;
}

/**
 * B5, N2: what plays when a level ends. A passed level opens with the banner; the stars
 * follow at once and are all there within two seconds, while the roof lands, the camera
 * swings and the celebration runs. With reduced motion there is no camera move and no
 * shake: the final picture simply fades in (B0.6).
 */
export function resultSequence(
  outcome: Exclude<Outcome, 'running'>,
  stars: Stars,
  reducedMotion: boolean,
): Sequence {
  const earned = outcome === 'completed' ? stars : 0;
  if (reducedMotion) {
    return {
      steps: [{ step: 'endbild', at: 0, seconds: 0.2 }],
      seconds: 0.2,
      bannerAt: 0,
      starsAt: Array.from({ length: earned }, () => 0),
      cameraShake: false,
    };
  }
  const T = TUNING.sequence;
  let steps: Sequence['steps'];
  let bannerAt = 0;
  let starsAt: number[] = [];
  if (outcome === 'completed') {
    starsAt = Array.from(
      { length: earned },
      (_, i) => T.firstStarSeconds + i * T.starIntervalSeconds,
    );
    steps = [
      { step: 'banner', at: 0, seconds: 0.4 },
      { step: 'fertigstellung', at: 0, seconds: 1 },
      { step: 'sterne', at: T.firstStarSeconds, seconds: earned * T.starIntervalSeconds },
      { step: 'kameraschwenk', at: T.firstStarSeconds, seconds: T.panSeconds },
      { step: 'feier', at: 0.3, seconds: T.celebrationSeconds },
    ];
  } else if (outcome === 'rejected') {
    // The stamp follows the inspector's round.
    bannerAt = 2;
    steps = [
      { step: 'pruefer', at: 0, seconds: 2 },
      { step: 'stempel', at: 2, seconds: 0.8 },
    ];
  } else {
    // «Baustopp» appears while the floors are still coming down.
    bannerAt = 1.2;
    steps = [{ step: 'einsturz', at: 0, seconds: 2.4 }];
  }
  const seconds = Math.max(...steps.map((s) => s.at + s.seconds));
  return { steps, seconds, bannerAt, starsAt, cameraShake: outcome === 'collapsed' };
}

/**
 * N2: where spark `index` of the fireworks is, `seconds` into the celebration. Three bursts
 * of the given size go off one after the other and repeat; null means the spark is not shown.
 */
export function fireworkSpark(
  index: number,
  seconds: number,
): { burst: number; age: number; angle: number; lift: number } | null {
  const F = TUNING.firework;
  const burst = Math.floor(index / F.sparksPerBurst) % F.bursts;
  const since = seconds - F.firstAt - burst * F.every;
  if (since < 0) return null;
  const age = since % F.repeatSeconds;
  if (age > F.lifeSeconds) return null;
  const k = index % F.sparksPerBurst;
  // Spread evenly round the circle, with every other spark thrown higher.
  return { burst, age, angle: (k / F.sparksPerBurst) * Math.PI * 2, lift: (k % 3) - 0.6 };
}

/** B3: a plane must not cross the middle of the picture while the player decides. */
export function planeMayCrossCentre(phase: string | null): boolean {
  return phase !== 'situation';
}

/**
 * How far to the side of the building a plane flies, in world units. While a level is
 * played it always keeps clear, so it can never be over the middle when a decision starts.
 */
export function planeLateralOffset(random: number, mayCrossCentre: boolean): number {
  const r = Math.min(Math.max(random, 0), 0.999999);
  const { clearance, spread } = TUNING.decoration.plane;
  if (mayCrossCentre) return (r - 0.5) * 2 * (clearance + spread);
  const side = r < 0.5 ? -1 : 1;
  const within = r < 0.5 ? r * 2 : (r - 0.5) * 2;
  return side * (clearance + within * spread);
}

/** How visible a cloud is, 0 to 1, by its distance on screen from the building in focus. */
export function cloudVisibility(distance: number | null): number {
  if (distance === null) return 1;
  const { hideWithin, fullBeyond } = TUNING.decoration.cloud;
  const t = Math.min(Math.max((distance - hideWithin) / (fullBeyond - hideWithin), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Seconds until the next plane, from a decoration random number in [0, 1). */
export function nextPlaneDelay(random: number): number {
  const { min, max } = TUNING.decoration.planeEverySeconds;
  return min + Math.min(Math.max(random, 0), 1) * (max - min);
}

/**
 * B0.4: randomness for decoration (clouds, traffic, confetti). Deliberately a separate
 * generator with its own state: the game's generator in core must never advance because
 * something decorative happened, or the draw of situations would change.
 */
export function createDecorRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}
