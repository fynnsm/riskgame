import type { BuildingKind, Level } from '../content/schema.ts';
import type { LevelRun } from './game.ts';
import type { BuildingModel } from './lean.ts';
import { buildingModel } from './lean.ts';
import type { Progress } from './progress.ts';
import { floorRecords, isUnlocked, levelProgress } from './progress.ts';

export type LotStatus = 'locked' | 'open' | 'active' | 'done';

export interface LotModel {
  levelId: string;
  kind: BuildingKind;
  status: LotStatus;
  building: BuildingModel | null;
  collapsed: boolean;
  /** True while the level is still being played, i.e. while more floors will follow. */
  construction: boolean;
}

/** What the 3D view should show. Declarative, so the renderer holds no game state. */
export interface SceneModel {
  mode: 'city' | 'level';
  /** Index of the lot the camera follows in level mode. */
  focus: number | null;
  lots: LotModel[];
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
): SceneModel {
  const order = levels.map((l) => l.level.id);
  let focus: number | null = null;
  const lots = levels.map(({ level, available }, index): LotModel => {
    const kind = level.projekt.gebaeude;
    if (run && run.levelId === level.id) {
      focus = index;
      return {
        levelId: level.id,
        kind,
        status: 'active',
        building: buildingModel(kind, floorRecords(run)),
        collapsed: run.outcome === 'collapsed',
        construction: run.outcome === 'running',
      };
    }
    const lp = levelProgress(progress, level.id);
    if (lp.completed && lp.best) {
      return {
        levelId: level.id,
        kind,
        status: 'done',
        building: buildingModel(kind, lp.best.floors),
        collapsed: false,
        construction: false,
      };
    }
    const open = available && isUnlocked(progress, order, level.id);
    return {
      levelId: level.id,
      kind,
      status: open ? 'open' : 'locked',
      building: null,
      collapsed: false,
      construction: false,
    };
  });
  return { mode: focus === null ? 'city' : 'level', focus, lots };
}
