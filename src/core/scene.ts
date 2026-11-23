import type { BuildingKind, Level } from '../content/schema.ts';
import type { LevelRun } from './game.ts';
import type { BuildingModel } from './lean.ts';
import { buildingModel } from './lean.ts';
import type { Progress } from './progress.ts';
import { isUnlocked, levelProgress } from './progress.ts';

export type LotStatus = 'locked' | 'open' | 'active' | 'done';

export interface LotModel {
  levelId: string;
  kind: BuildingKind;
  status: LotStatus;
  building: BuildingModel | null;
  collapsed: boolean;
}

/** What the 3D view should show. Declarative, so the renderer holds no game state. */
export interface SceneModel {
  mode: 'city' | 'level';
  /** Index of the lot the camera follows in level mode. */
  focus: number | null;
  lots: LotModel[];
}

/** The contract between the HTML app and any renderer, including the one that draws nothing. */
export interface SceneView {
  render(model: SceneModel): void;
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
        building: buildingModel(
          kind,
          run.history.map((c) => c.gaugesAfter),
        ),
        collapsed: run.outcome === 'collapsed',
      };
    }
    const lp = levelProgress(progress, level.id);
    if (lp.completed && lp.best) {
      return {
        levelId: level.id,
        kind,
        status: 'done',
        building: buildingModel(kind, lp.best.gaugeHistory),
        collapsed: false,
      };
    }
    const open = available && isUnlocked(progress, order, level.id);
    return {
      levelId: level.id,
      kind,
      status: open ? 'open' : 'locked',
      building: null,
      collapsed: false,
    };
  });
  return { mode: focus === null ? 'city' : 'level', focus, lots };
}
