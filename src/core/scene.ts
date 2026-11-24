import type { BuildingKind, Level, TourPlace } from '../content/schema.ts';
import type { LevelRun } from './game.ts';
import type { BuildingModel } from './lean.ts';
import { buildingModel } from './lean.ts';
import type { Progress } from './progress.ts';
import { floorRecords, isUnlocked, levelProgress } from './progress.ts';
import type { Stars } from './scoring.ts';
import { starsFor } from './scoring.ts';
import { tourReview } from './tour.ts';

export type LotStatus = 'locked' | 'open' | 'active' | 'done';

/** One place of the site tour as the picture shows it (M-15). */
export interface TourMarker {
  siteId: string;
  ort: TourPlace;
  /** Whether the AI drone marked the place. */
  marked: boolean;
  /** Before the resolution a place only shows that it was judged, never how. */
  judged: boolean;
  /** Whether the judgement was right; null until the tour is resolved. */
  verdict: 'right' | 'wrong' | null;
  /** True for the place whose card is open. */
  selected: boolean;
}

/** Where a place of the tour lies on the canvas, in CSS pixels from its top left corner. */
export interface MarkerSpot {
  siteId: string;
  x: number;
  y: number;
}

export interface LotModel {
  levelId: string;
  /** Number of the level, 1 to 5; the view derives the time of day from it. */
  nummer: number;
  kind: BuildingKind;
  status: LotStatus;
  building: BuildingModel | null;
  collapsed: boolean;
  /** True while the level is still being played, i.e. while more floors will follow. */
  construction: boolean;
  /** True once the building has passed its inspection: it gets its roof and loses the cranes. */
  finished: boolean;
  /** True if the building stands but failed its inspection; the site is then taped off. */
  rejected: boolean;
  /** Stars of the finished building, 0 otherwise; decides how it is celebrated. */
  stars: Stars;
  /** The places of the site tour while it is walked or resolved; null at any other time. */
  tour: TourMarker[] | null;
}

/** What the 3D view should show. Declarative, so the renderer holds no game state. */
export interface SceneModel {
  /** 'finale' is the closing view after all levels; the interface decides when it is shown. */
  mode: 'city' | 'level' | 'finale';
  /** Index of the lot the camera follows in level mode. */
  focus: number | null;
  lots: LotModel[];
  /** True once every level has been completed; the city then shows its closing mood. */
  allCompleted: boolean;
  /** True while the player is reading a situation and choosing; nothing may distract then. */
  deciding: boolean;
}

/** Pixels of the canvas hidden behind HTML panels, per side. */
export interface SceneInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** What a view can tell about its own performance. All null where it does not draw. */
export interface RenderStats {
  fps: number | null;
  fpsAverage: number | null;
  fpsMinimum: number | null;
  drawCalls: number | null;
  triangles: number | null;
  quality: number | null;
}

/** The contract between the HTML app and any renderer, including the one that draws nothing. */
export interface SceneView {
  render(model: SceneModel): void;
  /** Tells the view which part of the canvas is covered by HTML, so it can frame the scene beside it. */
  setInsets(insets: SceneInsets): void;
  /** Frame rate of the last 30 seconds and the cost of the last frame (L-05, L-09). */
  stats(): RenderStats;
  /** Lets the player turn the camera round the city (G-54); off turns it back. */
  setFreeCamera(free: boolean): void;
  /** Turns the free camera by the given angle in radians; for keys, as dragging is for the pointer. */
  orbit(radians: number): void;
  /** The current picture as a PNG data URL, or null where nothing is drawn (G-54). */
  capture(): string | null;
  /**
   * True while the short sequence after a level plays (B5): the view may move the camera
   * and celebrate. False ends all of that at once, e.g. when the player skips.
   */
  setPresenting(presenting: boolean): void;
  /**
   * Reports where the places of the tour lie on the canvas, whenever that changes, so the
   * interface can put its buttons there (M-15). An empty list means: no tour in the picture.
   */
  onMarkers(listener: ((spots: readonly MarkerSpot[]) => void) | null): void;
  dispose(): void;
}

export interface SceneLevel {
  level: Level;
  available: boolean;
}

export function sceneModel(
  levels: readonly SceneLevel[],
  progress: Progress,
  run: LevelRun | null,
  options: { finale?: boolean; openSite?: string | null } = {},
): SceneModel {
  const order = levels.map((l) => l.level.id);
  let focus: number | null = null;
  const lots = levels.map(({ level, available }, index): LotModel => {
    const kind = level.projekt.gebaeude;
    if (run && run.levelId === level.id) {
      focus = index;
      const ended = run.phase === 'result';
      const touring = run.phase === 'tour' || run.phase === 'tourResult';
      const resolved = run.phase === 'tourResult';
      const tour =
        touring && run.tour
          ? tourReview(run.tour, level).map((item): TourMarker => ({
              siteId: item.site.id,
              ort: item.site.ort,
              marked: item.site.drohne === 'markiert',
              judged: item.judged,
              verdict: resolved ? (item.correct ? 'right' : 'wrong') : null,
              selected: !resolved && item.site.id === (options.openSite ?? null),
            }))
          : null;
      return {
        levelId: level.id,
        nummer: level.nummer,
        kind,
        status: 'active',
        building: buildingModel(kind, floorRecords(run)),
        // What the level ended in only shows once the player has moved on from the last
        // feedback: the collapse, the roof or the tape belong to the result, not to the choice.
        collapsed: ended && run.outcome === 'collapsed',
        construction: !ended,
        finished: ended && run.outcome === 'completed',
        rejected: ended && run.outcome === 'rejected',
        stars: ended ? starsFor(run) : 0,
        tour,
      };
    }
    const lp = levelProgress(progress, level.id);
    if (lp.completed && lp.best) {
      return {
        levelId: level.id,
        nummer: level.nummer,
        kind,
        status: 'done',
        building: buildingModel(kind, lp.best.floors),
        collapsed: false,
        construction: false,
        finished: true,
        rejected: false,
        stars: lp.best.stars,
        tour: null,
      };
    }
    const open = available && isUnlocked(progress, order, level.id);
    return {
      levelId: level.id,
      nummer: level.nummer,
      kind,
      status: open ? 'open' : 'locked',
      building: null,
      collapsed: false,
      construction: false,
      finished: false,
      rejected: false,
      stars: 0,
      tour: null,
    };
  });
  const allCompleted = lots.length > 0 && lots.every((lot) => lot.status === 'done');
  let mode: SceneModel['mode'] = 'city';
  if (focus !== null) mode = 'level';
  else if (options.finale && allCompleted) mode = 'finale';
  return {
    mode,
    focus,
    lots,
    allCompleted,
    // An event is weighed as calmly as a situation is read (M-04).
    deciding: run?.phase === 'situation' || run?.phase === 'event',
  };
}
