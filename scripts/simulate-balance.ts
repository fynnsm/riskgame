/**
 * Plays every level with fixed strategies and at random and checks the balance rules
 * (F-907, F-909, F-910). Any broken rule stops the run.
 */
import { validateLevelJson } from '../src/content/validate.ts';
import { BALANCE, CONTENT_RULES } from '../src/core/balance.ts';
import type {
  BalanceProblem,
  EventBalanceOpen,
  EventBalanceProblem,
} from '../src/core/simulate.ts';
import {
  balanceProblems,
  eventBalanceOpen,
  eventBalanceProblems,
  simulateEvents,
  simulateLevel,
} from '../src/core/simulate.ts';
import { readLevelFiles } from './read-levels.ts';

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

const e = c.events;
const EXPLAIN_EVENTS: Record<EventBalanceProblem, string> = {
  'recommended-collapses':
    'empfohlene Strategien: das Gebäude stürzt in mindestens einem Durchgang ein',
  'recommended-fails':
    'empfohlene Strategien: die Bauabnahme wird in mindestens einem Durchgang nicht bestanden',
  'verified-collapses':
    'erst prüfen, dann empfohlen: das Gebäude stürzt in mindestens einem Durchgang ein',
  'avoid-cheap': `immer vermeiden: die Zeit fällt in weniger als ${percent(e.avoidShareMin)} der Durchgänge unter ${e.avoidTimeBelow}`,
  'mitigate-cheap': `immer vermindern: das Budget fällt in weniger als ${percent(e.lowBudgetShareMin)} der Durchgänge unter ${e.lowBudgetBelow}`,
  'transfer-cheap': `immer übertragen: das Budget fällt in weniger als ${percent(e.lowBudgetShareMin)} der Durchgänge unter ${e.lowBudgetBelow}`,
};
const EXPLAIN_OPEN: Record<EventBalanceOpen, string> = {
  'recommended-low': `empfohlene Strategien: eine Anzeige endet unter ${e.recommendedMinGauge} (Auftrag: nie)`,
  'accept-safe': `immer akzeptieren: weniger als ${percent(e.acceptFailMin)} der Durchgänge scheitern (Auftrag: mindestens so viele)`,
  'random-range': `zufällig mit Ereignissen: Scheitern liegt nicht zwischen ${percent(c.randomFailMin)} und ${percent(c.randomFailMax)}`,
};

let failed = false;
let undecided = false;

for (const [name, json] of Object.entries(readLevelFiles())) {
  const result = validateLevelJson(json, name, CONTENT_RULES);
  if (!result.ok) {
    console.error(
      `FEHLER  ${name}: Datei ist ungültig, zuerst «npm run validate:content» ausführen.`,
    );
    failed = true;
    continue;
  }
  const report = simulateLevel(result.level);
  const problems = balanceProblems(report);
  if (problems.length > 0) failed = true;

  const latest =
    report.risky.latestCollapse === null ? 'nie' : `${report.risky.latestCollapse}. Entscheid`;
  console.log(
    `${problems.length > 0 ? 'FEHLER' : 'OK    '}  ${name} (${report.runs} Ziehungen, ${c.randomRuns} Zufallsläufe)`,
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
    `          zufällig:       ${percent(report.random.failRate)} gescheitert (davon ${percent(report.random.collapseRate)} Einsturz), ${percent(report.random.passRate)} bestanden${result.level.ereignisse ? ' (nur Entscheide, ohne Ereignisse)' : ''}`,
  );
  for (const problem of problems) console.error(`          FEHLER: ${EXPLAIN[problem]}`);

  if (!result.level.ereignisse) continue;
  // M-29: the six ways of playing a level with events (brief of update 3, section 5).
  const events = simulateEvents(result.level);
  const eventProblems = eventBalanceProblems(events);
  const open = eventBalanceOpen(events);
  if (eventProblems.length > 0) failed = true;
  if (open.length > 0) undecided = true;
  console.log(
    `  ${eventProblems.length > 0 ? 'FEHLER' : 'OK    '}  mit Ereignissen (${events.runs} Durchgänge, gute Entscheide)`,
  );
  console.log(
    `          empfohlen, alle treten ein: ${events.recommended.collapses} Einstürze, ${events.recommended.failures} nicht bestanden, tiefste Anzeige ${events.recommended.lowest}`,
  );
  console.log(
    `          erst prüfen, dann empfohlen: ${events.verified.collapses} Einstürze, tiefste Anzeige ${events.verified.lowest}`,
  );
  console.log(
    `          immer akzeptieren:  ${percent(events.accept.failRate)} gescheitert, ${percent(events.accept.strainedRate)} gescheitert oder mit kritischer Anzeige`,
  );
  console.log(
    `          immer vermeiden:    Zeit unter ${e.avoidTimeBelow} in ${percent(events.avoid.lowTimeRate)}`,
  );
  console.log(
    `          immer vermindern:   Budget unter ${e.lowBudgetBelow} in ${percent(events.mitigate.lowBudgetRate)}; immer übertragen: in ${percent(events.transfer.lowBudgetRate)}`,
  );
  console.log(
    `          zufällig:           ${percent(events.random.failRate)} gescheitert (davon ${percent(events.random.collapseRate)} Einsturz)`,
  );
  for (const problem of eventProblems)
    console.error(`          FEHLER: ${EXPLAIN_EVENTS[problem]}`);
  for (const item of open) console.log(`          OFFEN:  ${EXPLAIN_OPEN[item]}`);
}

if (failed) {
  console.error('\nDie Balance stimmt nicht: Inhalte oder Werte in src/core/balance.ts anpassen.');
  process.exit(1);
}
console.log(
  undecided
    ? '\nBalance in Ordnung, bis auf die mit OFFEN markierten Bedingungen: siehe docs/REQUIREMENTS.md, M-29.'
    : '\nBalance in Ordnung.',
);
