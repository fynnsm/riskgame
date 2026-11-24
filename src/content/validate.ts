import type { z } from 'zod';
import type { ContentRules } from './effects.ts';
import { checkMechanicsRules } from './mechanics-rules.ts';
import { checkLevelRules } from './rules.ts';
import type { Level } from './schema.ts';
import { levelSchema } from './schema.ts';

export type ValidationResult =
  | { ok: true; level: Level; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

type Issue = z.core.$ZodIssue;

export function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return '(Datei)';
  return path
    .map((part, i) =>
      typeof part === 'number' ? `[${part}]` : `${i > 0 ? '.' : ''}${String(part)}`,
    )
    .join('');
}

/** Translates Zod's issue codes into German, so authors without Zod knowledge can fix a file. */
export function describeIssue(issue: Issue): string {
  switch (issue.code) {
    case 'invalid_type':
      return `fehlt oder hat den falschen Typ (erwartet: ${issue.expected})`;
    case 'invalid_value':
      return `hat einen unerlaubten Wert; erlaubt sind: ${issue.values.map(String).join(', ')}`;
    case 'unrecognized_keys':
      return `enthält unbekannte Felder: ${issue.keys.join(', ')}`;
    case 'too_small':
      return `ist zu klein (mindestens ${String(issue.minimum)})`;
    case 'too_big':
      return `ist zu gross (höchstens ${String(issue.maximum)})`;
    default:
      return issue.message;
  }
}

function line(fileName: string, path: string, message: string): string {
  return `${fileName}, Feld «${path}»: ${message}`;
}

export function validateLevel(
  raw: unknown,
  fileName: string,
  rules: ContentRules,
): ValidationResult {
  const parsed = levelSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) =>
        line(fileName, formatPath(issue.path), describeIssue(issue)),
      ),
      warnings: [],
    };
  }
  const issues = [
    ...checkLevelRules(parsed.data, rules.effectPoints),
    ...checkMechanicsRules(parsed.data, rules),
  ];
  const errors = issues
    .filter((i) => i.severity === 'error')
    .map((i) => line(fileName, i.path, i.message));
  const warnings = issues
    .filter((i) => i.severity === 'warning')
    .map((i) => line(fileName, i.path, i.message));
  if (errors.length > 0) return { ok: false, errors, warnings };
  return { ok: true, level: parsed.data, warnings };
}

export function validateLevelJson(
  json: string,
  fileName: string,
  rules: ContentRules,
): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return {
      ok: false,
      errors: [line(fileName, '(Datei)', `ist kein gültiges JSON (${detail})`)],
      warnings: [],
    };
  }
  return validateLevel(raw, fileName, rules);
}
