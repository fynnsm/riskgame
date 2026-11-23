import type { EffectPoints } from './effects.ts';
import type { Level } from './schema.ts';
import { validateLevel } from './validate.ts';

export interface PlayableLevel {
  /** The level with only the situations this build is allowed to show (F-906). */
  level: Level;
  /** False if too few situations remain after filtering; the level is then listed but locked. */
  available: boolean;
}

export interface LoadResult {
  levels: PlayableLevel[];
  errors: string[];
  warnings: string[];
}

/** F-906: the published build shows released situations only, unless drafts are switched on. */
export function selectPlayable(level: Level, showDrafts: boolean): PlayableLevel {
  const situationen = showDrafts
    ? level.situationen
    : level.situationen.filter((s) => s.status === 'freigegeben');
  return {
    level: { ...level, situationen },
    available: situationen.length >= level.situationenProDurchgang,
  };
}

/**
 * Validates every file and returns the valid levels in order.
 * A broken file is reported and skipped; it must not take the other levels down with it.
 */
export function loadLevels(
  files: Readonly<Record<string, unknown>>,
  points: EffectPoints,
  showDrafts: boolean,
): LoadResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byNumber = new Map<number, PlayableLevel>();

  for (const fileName of Object.keys(files).sort()) {
    const result = validateLevel(files[fileName], fileName, points);
    warnings.push(...result.warnings);
    if (!result.ok) {
      errors.push(...result.errors);
      continue;
    }
    if (byNumber.has(result.level.nummer)) {
      errors.push(
        `${fileName}, Feld «nummer»: Level ${result.level.nummer} ist bereits in einer anderen Datei definiert`,
      );
      continue;
    }
    byNumber.set(result.level.nummer, selectPlayable(result.level, showDrafts));
  }

  const levels = [...byNumber.values()].sort((a, b) => a.level.nummer - b.level.nummer);
  return { levels, errors, warnings };
}
