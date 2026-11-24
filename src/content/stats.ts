import type { EffectPoints } from './effects.ts';
import { effectValue } from './effects.ts';
import type { GaugeKey, Level } from './schema.ts';
import { GAUGE_KEYS } from './schema.ts';

/**
 * Numbers about a level's content that reveal patterns a player could exploit
 * (A2: "always pick the longest text") or that skew the balance (A1: "good options
 * only ever cost time"). Used by the validation, the report and the tests.
 */
export interface LevelStats {
  levelId: string;
  nummer: number;
  situations: number;
  drafts: number;
  released: number;
  withAi: number;
  /** IDs of situations whose good option is the longest of the three texts. */
  goodIsLongest: string[];
  /** IDs of situations whose longest option text exceeds the shortest by more than the allowed spread. */
  unevenLength: string[];
  /** Share of all options whose budget effect is not zero. */
  budgetShare: number;
  /** How the costs of the good options spread over the gauges; the shares add up to 1. */
  goodCostShare: Record<GaugeKey, number>;
}

/** The longest option text may be this much longer than the shortest before it stands out. */
export const MAX_LENGTH_SPREAD = 1.3;

export function levelStats(level: Level, points: EffectPoints): LevelStats {
  const goodIsLongest: string[] = [];
  const unevenLength: string[] = [];
  let options = 0;
  let withBudget = 0;
  const cost: Record<GaugeKey, number> = { budget: 0, zeit: 0, stabilitaet: 0 };

  for (const situation of level.situationen) {
    const lengths = situation.optionen.map((o) => o.text.length);
    const longest = Math.max(...lengths);
    const shortest = Math.min(...lengths);
    const longestOptions = situation.optionen.filter((o) => o.text.length === longest);
    // Only a clear case counts: one single longest text, and it belongs to a good option.
    if (longestOptions.length === 1 && longestOptions[0]?.einstufung === 'gut') {
      goodIsLongest.push(situation.id);
    }
    if (longest > shortest * MAX_LENGTH_SPREAD) unevenLength.push(situation.id);

    for (const option of situation.optionen) {
      options += 1;
      if (option.wirkung.budget !== '0') withBudget += 1;
      if (option.einstufung !== 'gut') continue;
      for (const key of GAUGE_KEYS) {
        const value = effectValue(option.wirkung[key], points);
        if (value < 0) cost[key] -= value;
      }
    }
  }

  const totalCost = cost.budget + cost.zeit + cost.stabilitaet;
  const share = (value: number) => (totalCost === 0 ? 0 : value / totalCost);
  const drafts = level.situationen.filter((s) => s.status === 'entwurf').length;
  return {
    levelId: level.id,
    nummer: level.nummer,
    situations: level.situationen.length,
    drafts,
    released: level.situationen.length - drafts,
    withAi: level.situationen.filter((s) => s.aiAusgabe !== undefined).length,
    goodIsLongest,
    unevenLength,
    budgetShare: options === 0 ? 0 : withBudget / options,
    goodCostShare: {
      budget: share(cost.budget),
      zeit: share(cost.zeit),
      stabilitaet: share(cost.stabilitaet),
    },
  };
}

function percent(share: number): string {
  return `${Math.round(share * 100)} %`;
}

/** The report as Markdown (A2.3), one row per level plus a line of totals. */
export function contentReport(stats: readonly LevelStats[]): string {
  const total = (pick: (s: LevelStats) => number) => stats.reduce((sum, s) => sum + pick(s), 0);
  const rows = stats.map((s) =>
    [
      `Level ${s.nummer}`,
      s.situations,
      s.drafts,
      s.released,
      `${s.withAi} (${percent(s.withAi / Math.max(1, s.situations))})`,
      `${s.goodIsLongest.length} (${percent(s.goodIsLongest.length / Math.max(1, s.situations))})`,
      s.unevenLength.length,
      percent(s.budgetShare),
      `${percent(s.goodCostShare.budget)} / ${percent(s.goodCostShare.zeit)} / ${percent(s.goodCostShare.stabilitaet)}`,
    ].join(' | '),
  );
  const situations = total((s) => s.situations);
  const lines = [
    '# Inhaltsbericht',
    '',
    'Erzeugt mit `npm run content:report`. Nicht von Hand ändern.',
    '',
    `Stand: ${situations} Situationen in ${stats.length} Leveln, davon ${total((s) => s.drafts)} im Entwurf und ${total((s) => s.released)} freigegeben.`,
    '',
    '| Level | Situationen | Entwurf | Freigegeben | Mit AI-Ausgabe | Gute Option ist die längste | Längenunterschied über 30 % | Optionen mit Budgetwirkung | Kosten der guten Optionen: Budget / Zeit / Stabilität |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map((row) => `| ${row} |`),
    '',
    '## Was die Spalten bedeuten',
    '',
    '- **Gute Option ist die längste:** Ist das in mehr als der Hälfte der Situationen so, besteht man das Level, indem man immer den längsten Text wählt.',
    '- **Längenunterschied über 30 %:** Situationen, in denen der längste Optionstext mehr als 30 % länger ist als der kürzeste.',
    '- **Optionen mit Budgetwirkung:** Liegt der Anteil unter 40 %, spielt das Budget im Level kaum eine Rolle.',
    '- **Kosten der guten Optionen:** Entfallen mehr als 60 % auf eine Anzeige, bestraft das Level genau jene, die gut entscheiden.',
    '',
    '## Betroffene Situationen',
    '',
    ...stats.flatMap((s) => [
      `**Level ${s.nummer}**`,
      '',
      `- Gute Option ist die längste: ${s.goodIsLongest.join(', ') || 'keine'}`,
      `- Längenunterschied über 30 %: ${s.unevenLength.join(', ') || 'keine'}`,
      '',
    ]),
  ];
  return lines.join('\n').trimEnd() + '\n';
}
