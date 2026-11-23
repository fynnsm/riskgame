/**
 * F-907: whoever picks only good options survives every draw,
 * whoever picks only risky ones fails every draw.
 */
import { validateLevelJson } from '../src/content/validate.ts';
import { BALANCE } from '../src/core/balance.ts';
import { simulateLevel } from '../src/core/simulate.ts';
import { readLevelFiles } from './read-levels.ts';

const files = readLevelFiles();
let failed = false;

for (const [name, json] of Object.entries(files)) {
  const result = validateLevelJson(json, name, BALANCE.effectPoints);
  if (!result.ok) {
    console.error(
      `FEHLER  ${name}: Datei ist ungültig, zuerst «npm run validate:content» ausführen.`,
    );
    failed = true;
    continue;
  }
  const report = simulateLevel(result.level);
  const ok = report.goodCollapses === 0 && report.riskySurvivals === 0;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'OK    ' : 'FEHLER'}  ${name}: ${report.runs} Durchgänge je Strategie | nur gut: ${report.goodCollapses} Einstürze, tiefste Anzeige ${report.goodLowest}, mindestens ${report.goodMinStars} Sterne | nur riskant: ${report.riskySurvivals} überstanden`,
  );
}

if (failed) {
  console.error('\nDie Balance stimmt nicht: Inhalte oder Werte in src/core/balance.ts anpassen.');
  process.exit(1);
}
console.log('\nBalance in Ordnung.');
