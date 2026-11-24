import type { EffectPoints } from './effects.ts';
import { effectSum, hasNegativeEffect } from './effects.ts';
import type { Level } from './schema.ts';
import { OPTION_IDS, PROCESS_STEPS, VIDEO_HOST_ALLOWLIST } from './schema.ts';
import { levelStats } from './stats.ts';

export interface RuleIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export const LIMITS = {
  learningGoals: { min: 2, max: 4 },
  theorySteps: { min: 3, max: 7 },
  /** A pool needs this many more situations than one run draws (IMPORT.md). */
  poolSurplus: 2,
  /** F-304: situations with an AI output per pool. */
  minAiSituations: 2,
  /** A2: above this share, "always pick the longest text" passes the level. */
  maxGoodLongestShare: 0.5,
  /** A1: below this share of options with a budget effect, budget never decides anything. */
  minBudgetShare: 0.4,
  /** A1: above this share on one gauge, the level punishes exactly those who decide well. */
  maxGoodCostShare: 0.6,
} as const;

function findDuplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

export function checkVideoUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a parseable URL at all; the caller reports it as a content error.
    return 'ist keine gültige Adresse';
  }
  if (parsed.protocol !== 'https:') return 'muss mit https beginnen';
  if (!VIDEO_HOST_ALLOWLIST.includes(parsed.hostname)) {
    return `Host «${parsed.hostname}» ist nicht erlaubt; erlaubt sind: ${VIDEO_HOST_ALLOWLIST.join(', ')}`;
  }
  return null;
}

/** Rules that span several fields and therefore cannot live in the Zod schema. */
export function checkLevelRules(level: Level, points: EffectPoints): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const error = (path: string, message: string) =>
    issues.push({ path, message, severity: 'error' });
  const n = level.nummer;

  if (level.id !== `level-${n}`) {
    error('id', `muss «level-${n}» sein, weil nummer ${n} ist`);
  }
  const expectedStep = PROCESS_STEPS[n - 1];
  if (level.prozessschritt !== expectedStep) {
    error('prozessschritt', `muss für Level ${n} «${expectedStep}» sein`);
  }

  const goals = level.lernziele;
  if (goals.length < LIMITS.learningGoals.min || goals.length > LIMITS.learningGoals.max) {
    error(
      'lernziele',
      `braucht ${LIMITS.learningGoals.min} bis ${LIMITS.learningGoals.max} Einträge, hat aber ${goals.length}`,
    );
  }
  const goalPattern = new RegExp(`^L${n}-Z\\d+$`);
  goals.forEach((goal, i) => {
    if (!goalPattern.test(goal.id)) {
      error(`lernziele[${i}].id`, `«${goal.id}» passt nicht zum Muster L${n}-Z<Nummer>`);
    }
  });
  for (const id of findDuplicates(goals.map((g) => g.id))) {
    error('lernziele', `die ID «${id}» kommt mehrfach vor`);
  }
  const goalIds = new Set(goals.map((g) => g.id));

  const steps = level.theorie;
  if (steps.length < LIMITS.theorySteps.min || steps.length > LIMITS.theorySteps.max) {
    error(
      'theorie',
      `braucht ${LIMITS.theorySteps.min} bis ${LIMITS.theorySteps.max} Schritte, hat aber ${steps.length}`,
    );
  }
  const theoryPattern = new RegExp(`^L${n}-T\\d+$`);
  steps.forEach((step, i) => {
    if (!theoryPattern.test(step.id)) {
      error(`theorie[${i}].id`, `«${step.id}» passt nicht zum Muster L${n}-T<Nummer>`);
    }
    if (step.typ === 'video') {
      const problem = checkVideoUrl(step.url);
      if (problem) error(`theorie[${i}].url`, problem);
    }
  });
  for (const id of findDuplicates(steps.map((s) => s.id))) {
    error('theorie', `die ID «${id}» kommt mehrfach vor`);
  }

  const pool = level.situationen;
  const minPool = level.situationenProDurchgang + LIMITS.poolSurplus;
  if (pool.length < minPool) {
    error(
      'situationen',
      `der Pool ist zu klein: ${pool.length} Situationen, nötig sind mindestens ${minPool} (situationenProDurchgang + ${LIMITS.poolSurplus})`,
    );
  }
  for (const id of findDuplicates(pool.map((s) => s.id))) {
    error('situationen', `die ID «${id}» kommt mehrfach vor`);
  }

  const situationPattern = new RegExp(`^L${n}-S\\d{2}$`);
  pool.forEach((situation, i) => {
    const base = `situationen[${i}] (${situation.id})`;
    if (!situationPattern.test(situation.id)) {
      error(`${base}.id`, `passt nicht zum Muster L${n}-S<zweistellige Nummer>`);
    }
    if (!goalIds.has(situation.lernziel)) {
      error(`${base}.lernziel`, `«${situation.lernziel}» ist kein Lernziel dieses Levels`);
    }

    const options = situation.optionen;
    const ids = options.map((o) => o.id).sort();
    if (options.length !== OPTION_IDS.length || ids.join() !== OPTION_IDS.join()) {
      error(`${base}.optionen`, 'braucht genau drei Optionen mit den IDs A, B und C');
    }
    options.forEach((option) => {
      if (!hasNegativeEffect(option.wirkung)) {
        error(
          `${base}.optionen[${option.id}].wirkung`,
          'jede Option braucht mindestens eine negative Wirkung',
        );
      }
    });

    const good = options.filter((o) => o.einstufung === 'gut');
    const risky = options.filter((o) => o.einstufung === 'riskant');
    if (good.length === 0) {
      error(`${base}.optionen`, 'mindestens eine Option muss als «gut» eingestuft sein');
    }
    if (risky.length === 0) {
      error(`${base}.optionen`, 'mindestens eine Option muss als «riskant» eingestuft sein');
    }
    for (const g of good) {
      for (const r of risky) {
        if (effectSum(g.wirkung, points) <= effectSum(r.wirkung, points)) {
          error(
            `${base}.optionen[${g.id}].wirkung`,
            `die gute Option ${g.id} ist in der Summe nicht besser als die riskante Option ${r.id}`,
          );
        }
      }
    }
  });

  const withAi = pool.filter((s) => s.aiAusgabe !== undefined).length;
  if (withAi < LIMITS.minAiSituations) {
    issues.push({
      path: 'situationen',
      message: `nur ${withAi} Situation(en) mit aiAusgabe; empfohlen sind mindestens ${LIMITS.minAiSituations} (F-304)`,
      severity: 'warning',
    });
  }

  // Patterns in the content (A1, A2). Text lengths only warn, because the texts belong to the
  // group. The spread of the effects is binding, because it decides whether the balance works.
  const warn = (path: string, message: string) =>
    issues.push({ path, message, severity: 'warning' });
  const stats = levelStats(level, points);
  const percent = (share: number) => `${Math.round(share * 100)} %`;
  if (pool.length > 0) {
    const share = stats.goodIsLongest.length / pool.length;
    if (share > LIMITS.maxGoodLongestShare) {
      warn(
        'situationen',
        `in ${stats.goodIsLongest.length} von ${pool.length} Situationen ist die gute Option der längste Text (erlaubt höchstens ${percent(LIMITS.maxGoodLongestShare)}): ${stats.goodIsLongest.join(', ')}`,
      );
    } else if (stats.goodIsLongest.length > 0) {
      warn(
        'situationen',
        `die gute Option ist der längste Text in: ${stats.goodIsLongest.join(', ')}`,
      );
    }
    if (stats.unevenLength.length > 0) {
      warn(
        'situationen',
        `der längste Optionstext ist mehr als 30 % länger als der kürzeste in: ${stats.unevenLength.join(', ')}`,
      );
    }
    if (stats.budgetShare < LIMITS.minBudgetShare) {
      error(
        'situationen',
        `nur ${percent(stats.budgetShare)} der Optionen haben eine Budgetwirkung (nötig mindestens ${percent(LIMITS.minBudgetShare)})`,
      );
    }
    for (const [gauge, costShare] of Object.entries(stats.goodCostShare)) {
      if (costShare > LIMITS.maxGoodCostShare) {
        error(
          'situationen',
          `${percent(costShare)} der Kosten der guten Optionen entfallen auf «${gauge}» (erlaubt höchstens ${percent(LIMITS.maxGoodCostShare)})`,
        );
      }
    }
  }

  return issues;
}
