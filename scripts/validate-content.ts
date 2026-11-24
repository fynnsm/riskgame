/**
 * Checks every level file against schema and content rules (F-903, F-905).
 * Exit code 1 if any file is invalid, so the CI stops before a broken file ships.
 */
import { validateLevelJson } from '../src/content/validate.ts';
import { CONTENT_RULES } from '../src/core/balance.ts';
import { readLevelFiles } from './read-levels.ts';

const files = readLevelFiles();
const names = Object.keys(files);
let errorCount = 0;
let warningCount = 0;

if (names.length === 0) {
  console.error('Keine Inhaltsdateien in content/levels gefunden.');
  process.exit(1);
}

for (const name of names) {
  const result = validateLevelJson(files[name] ?? '', name, CONTENT_RULES);
  for (const warning of result.warnings) console.warn(`Hinweis: ${warning}`);
  warningCount += result.warnings.length;
  if (result.ok) {
    const drafts = result.level.situationen.filter((s) => s.status === 'entwurf').length;
    console.log(
      `OK      ${name}: ${result.level.situationen.length} Situationen (${drafts} im Entwurf), ${result.level.theorie.length} Theorie-Schritte`,
    );
  } else {
    for (const error of result.errors) console.error(`FEHLER  ${error}`);
    errorCount += result.errors.length;
  }
}

console.log(
  `\n${names.length} Datei(en) geprüft: ${errorCount} Fehler, ${warningCount} Hinweis(e).`,
);
process.exit(errorCount > 0 ? 1 : 0);
