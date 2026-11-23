/**
 * F-907: whoever picks only good options passes every draw, whoever picks only risky ones
 * fails every draw. F-909: whoever clicks blindly passes only rarely.
 */
import { validateLevelJson } from '../src/content/validate.ts';
import { BALANCE } from '../src/core/balance.ts';
import { isBalanced, simulateLevel } from '../src/core/simulate.ts';
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
  const ok = isBalanced(report);
  if (!ok) failed = true;
  const percent = (share: number) => `${Math.round(share * 100)} %`;
  console.log(
    `${ok ? 'OK    ' : 'FEHLER'}  ${name}: ${report.runs} Ziehungen | nur gut: ${report.goodFailures} nicht bestanden, tiefste Anzeige ${report.goodLowest}, mindestens ${report.goodMinStars} Sterne | nur riskant: ${report.riskyPasses} bestanden | blind geklickt: ${percent(report.randomPassRate)} bestanden, ${percent(report.randomCollapseRate)} Einsturz (erlaubt höchstens ${percent(BALANCE.checks.maxRandomPassRate)} bestanden)`,
  );
}

if (failed) {
  console.error('\nDie Balance stimmt nicht: Inhalte oder Werte in src/core/balance.ts anpassen.');
  process.exit(1);
}
console.log('\nBalance in Ordnung.');
