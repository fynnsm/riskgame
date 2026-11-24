/**
 * Plays every level with fixed strategies and at random and checks the balance rules
 * (F-907, F-909, F-910). Rules added with finding A1 are reported but only stop the run
 * with `--strict`, until the effect values of the content have been corrected.
 */
import { validateLevelJson } from '../src/content/validate.ts';
import { BALANCE } from '../src/core/balance.ts';
import type { BalanceProblem } from '../src/core/simulate.ts';
import { balanceProblems, BINDING_PROBLEMS, simulateLevel } from '../src/core/simulate.ts';
import { readLevelFiles } from './read-levels.ts';

const strict = process.argv.includes('--strict');
const c = BALANCE.checks;
const percent = (share: number) => `${Math.round(share * 100)} %`;

const EXPLAIN: Record<BalanceProblem, string> = {
  'good-fails': 'nur gute Optionen: nicht jede Ziehung wird bestanden',
  'good-low': `nur gute Optionen: eine Anzeige endet unter ${c.goodMinGauge}`,
  'good-tilt': `nur gute Optionen: das Gebäude neigt sich am Schluss mehr als ${percent(c.goodMaxTilt)} des Maximums`,
  'okay-collapses': 'nur vertretbare Optionen: das Gebäude stürzt in mindestens einer Ziehung ein',
  'okay-passes':
    'nur vertretbare Optionen: die Bauabnahme wird in mindestens einer Ziehung bestanden',
  'risky-passes': 'nur riskante Optionen: mindestens eine Ziehung wird bestanden',
  'risky-late': `nur riskante Optionen: der Einsturz kommt nicht in jeder Ziehung bis zum ${c.riskyCollapseBy}. Entscheid`,
  'random-passes': `zufällige Wahl: mehr als ${percent(c.maxRandomPassRate)} der Durchgänge werden bestanden`,
  'random-range': `zufällige Wahl: Scheitern liegt nicht zwischen ${percent(c.randomFailMin)} und ${percent(c.randomFailMax)}`,
};

let failed = false;
let pending = 0;

for (const [name, json] of Object.entries(readLevelFiles())) {
  const result = validateLevelJson(json, name, BALANCE.effectPoints);
  if (!result.ok) {
    console.error(
      `FEHLER  ${name}: Datei ist ungültig, zuerst «npm run validate:content» ausführen.`,
    );
    failed = true;
    continue;
  }
  const report = simulateLevel(result.level);
  const problems = balanceProblems(report);
  const binding = problems.filter((p) => strict || BINDING_PROBLEMS.includes(p));
  const open = problems.filter((p) => !binding.includes(p));
  if (binding.length > 0) failed = true;
  pending += open.length;

  const latest =
    report.risky.latestCollapse === null ? 'nie' : `${report.risky.latestCollapse}. Entscheid`;
  console.log(
    `${binding.length > 0 ? 'FEHLER' : 'OK    '}  ${name} (${report.runs} Ziehungen, ${c.randomRuns} Zufallsläufe)`,
  );
  console.log(
    `          nur gut:        ${report.good.failures} nicht bestanden, tiefste Anzeige ${report.good.lowest}, Neigung bis ${percent(report.good.maxTilt)}, mindestens ${report.good.minStars} Sterne`,
  );
  console.log(
    `          nur vertretbar: ${report.okay.collapses} Einstürze, ${report.okay.passes} bestanden`,
  );
  console.log(
    `          nur riskant:    ${report.risky.passes} bestanden, spätester Einsturz: ${latest}`,
  );
  console.log(
    `          zufällig:       ${percent(report.random.failRate)} gescheitert (davon ${percent(report.random.collapseRate)} Einsturz), ${percent(report.random.passRate)} bestanden`,
  );
  for (const problem of binding) console.error(`          FEHLER: ${EXPLAIN[problem]}`);
  for (const problem of open) console.warn(`          OFFEN:  ${EXPLAIN[problem]}`);
}

if (failed) {
  console.error('\nDie Balance stimmt nicht: Inhalte oder Werte in src/core/balance.ts anpassen.');
  process.exit(1);
}
console.log(
  pending > 0
    ? `\nBalance in Ordnung, aber ${pending} Regel(n) aus Befund A1 sind noch offen. Mit «--strict» zählen sie als Fehler.`
    : '\nBalance in Ordnung.',
);
