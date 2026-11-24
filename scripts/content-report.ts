/**
 * A2.3: prints numbers about the content per level and writes docs/CONTENT-REPORT.md.
 * `--check` only compares and fails if the file is out of date, so the CI catches a stale report.
 * `--drafts` prints nothing but the number of draft situations, for the CI warning (A3).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LevelStats } from '../src/content/stats.ts';
import { contentReport, levelStats } from '../src/content/stats.ts';
import { validateLevelJson } from '../src/content/validate.ts';
import { BALANCE, CONTENT_RULES } from '../src/core/balance.ts';
import { readLevelFiles } from './read-levels.ts';

const target = join(import.meta.dirname, '..', 'docs', 'CONTENT-REPORT.md');
const stats: LevelStats[] = [];

for (const [name, json] of Object.entries(readLevelFiles())) {
  const result = validateLevelJson(json, name, CONTENT_RULES);
  if (!result.ok) {
    console.error(
      `FEHLER  ${name}: Datei ist ungültig, zuerst «npm run validate:content» ausführen.`,
    );
    process.exit(1);
  }
  stats.push(levelStats(result.level, BALANCE.effectPoints));
}
stats.sort((a, b) => a.nummer - b.nummer);

if (process.argv.includes('--drafts')) {
  console.log(String(stats.reduce((sum, s) => sum + s.drafts, 0)));
  process.exit(0);
}

const report = contentReport(stats);

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // A missing file is simply "out of date"; the message below says how to create it.
  }
  if (current !== report) {
    console.error(
      'docs/CONTENT-REPORT.md ist nicht aktuell. Bitte «npm run content:report» ausführen.',
    );
    process.exit(1);
  }
  console.log('docs/CONTENT-REPORT.md ist aktuell.');
  process.exit(0);
}

writeFileSync(target, report);
console.log(report);
