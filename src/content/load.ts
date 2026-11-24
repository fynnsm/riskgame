import type { ContentRules } from './effects.ts';
import { canDrawTour } from './mechanics-rules.ts';
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

/** The level without its site tour. */
export function withoutTour(level: Level): Level {
  const rest = { ...level };
  delete rest.rundgang;
  return rest;
}

/**
 * F-906: the published build shows released content only, unless drafts are switched on.
 * A level with too few released situations is locked. A tour with too few released places
 * is left out instead: the level is complete without it (M-01).
 */
export function selectPlayable(
  level: Level,
  showDrafts: boolean,
  rules: Pick<ContentRules, 'tourDraw'>,
): PlayableLevel {
  if (showDrafts) {
    return { level, available: level.situationen.length >= level.situationenProDurchgang };
  }
  const situationen = level.situationen.filter((s) => s.status === 'freigegeben');
  const available = situationen.length >= level.situationenProDurchgang;
  const tour = level.rundgang;
  if (!tour) return { level: { ...level, situationen }, available };
  const stellen = tour.stellen.filter((s) => s.status === 'freigegeben');
  if (!canDrawTour(stellen, rules.tourDraw)) {
    return { level: { ...withoutTour(level), situationen }, available };
  }
  return { level: { ...level, situationen, rundgang: { ...tour, stellen } }, available };
}

/**
 * Validates every file and returns the valid levels in order.
 * A broken file is reported and skipped; it must not take the other levels down with it.
 */
export function loadLevels(
  files: Readonly<Record<string, unknown>>,
  rules: ContentRules,
  showDrafts: boolean,
): LoadResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byNumber = new Map<number, PlayableLevel>();

  for (const fileName of Object.keys(files).sort()) {
    const result = validateLevel(files[fileName], fileName, rules);
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
    byNumber.set(result.level.nummer, selectPlayable(result.level, showDrafts, rules));
  }

  const levels = [...byNumber.values()].sort((a, b) => a.level.nummer - b.level.nummer);
  return { levels, errors, warnings };
}
