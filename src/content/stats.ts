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
  /** Per situation: the length of each option's text, so authors see what to even out. */
  lengths: SituationLengths[];
  /** Update 3: places of the site tour and events, with how many are still drafts. */
  tourSites: { total: number; drafts: number };
  events: { total: number; drafts: number };
  /**
   * Every piece of content written by Claude rather than by the group, by author code:
   * «CL» for the first version of the situations, «CC» for the contents of update 3.
   */
  byClaude: {
    id: string;
    kind: 'Situation' | 'Rundgang' | 'Ereignis';
    autor: string;
    status: string;
  }[];
}

/** Author codes that mark content as written by Claude and not yet checked by the group. */
export const CLAUDE_AUTHORS: readonly string[] = ['CL', 'CC'];

export interface SituationLengths {
  id: string;
  titel: string;
  /** Characters of the option texts by rating; null if the situation has no such option. */
  gut: number | null;
  vertretbar: number | null;
  riskant: number | null;
  goodIsLongest: boolean;
  uneven: boolean;
}

/** The longest option text may be this much longer than the shortest before it stands out. */
export const MAX_LENGTH_SPREAD = 1.3;

export function levelStats(level: Level, points: EffectPoints): LevelStats {
  const goodIsLongest: string[] = [];
  const unevenLength: string[] = [];
  let options = 0;
  let withBudget = 0;
  const cost: Record<GaugeKey, number> = { budget: 0, zeit: 0, stabilitaet: 0 };
  const rows: SituationLengths[] = [];

  for (const situation of level.situationen) {
    const lengths = situation.optionen.map((o) => o.text.length);
    const longest = Math.max(...lengths);
    const shortest = Math.min(...lengths);
    const longestOptions = situation.optionen.filter((o) => o.text.length === longest);
    // Only a clear case counts: one single longest text, and it belongs to a good option.
    if (longestOptions.length === 1 && longestOptions[0]?.einstufung === 'gut') {
      goodIsLongest.push(situation.id);
    }
    const uneven = longest > shortest * MAX_LENGTH_SPREAD;
    if (uneven) unevenLength.push(situation.id);
    // With several options of one rating the longest stands for it: that is the one that gives the pattern away.
    const lengthOf = (rating: string): number | null => {
      const texts = situation.optionen
        .filter((o) => o.einstufung === rating)
        .map((o) => o.text.length);
      return texts.length > 0 ? Math.max(...texts) : null;
    };
    rows.push({
      id: situation.id,
      titel: situation.titel,
      gut: lengthOf('gut'),
      vertretbar: lengthOf('vertretbar'),
      riskant: lengthOf('riskant'),
      goodIsLongest: goodIsLongest.includes(situation.id),
      uneven,
    });

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

  const tourSites = level.rundgang?.stellen ?? [];
  const events = level.ereignisse?.pool ?? [];
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
    lengths: rows,
    tourSites: {
      total: tourSites.length,
      drafts: tourSites.filter((site) => site.status === 'entwurf').length,
    },
    events: {
      total: events.length,
      drafts: events.filter((event) => event.status === 'entwurf').length,
    },
    byClaude: [
      ...level.situationen.map((item) => ({ ...item, kind: 'Situation' as const })),
      ...tourSites.map((item) => ({ ...item, kind: 'Rundgang' as const })),
      ...events.map((item) => ({ ...item, kind: 'Ereignis' as const })),
    ]
      .filter((item) => CLAUDE_AUTHORS.includes(item.autor))
      .map(({ id, kind, autor, status }) => ({ id, kind, autor, status })),
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
      s.tourSites.total === 0 ? '–' : `${s.tourSites.total} (${s.tourSites.drafts} Entwurf)`,
      s.events.total === 0 ? '–' : `${s.events.total} (${s.events.drafts} Entwurf)`,
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
    '| Level | Situationen | Entwurf | Freigegeben | Rundgang-Stellen | Ereignisse | Mit AI-Ausgabe | Gute Option ist die längste | Längenunterschied über 30 % | Optionen mit Budgetwirkung | Kosten der guten Optionen: Budget / Zeit / Stabilität |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((row) => `| ${row} |`),
    '',
    '## Was die Spalten bedeuten',
    '',
    '- **Gute Option ist die längste:** Ist das in mehr als der Hälfte der Situationen so, besteht man das Level, indem man immer den längsten Text wählt.',
    '- **Längenunterschied über 30 %:** Situationen, in denen der längste Optionstext mehr als 30 % länger ist als der kürzeste.',
    '- **Optionen mit Budgetwirkung:** Liegt der Anteil unter 40 %, spielt das Budget im Level kaum eine Rolle.',
    '- **Kosten der guten Optionen:** Entfallen mehr als 60 % auf eine Anzeige, bestraft das Level genau jene, die gut entscheiden.',
    '',
    '## Von Claude erstellt, fachlich zu prüfen',
    '',
    'Diese Inhalte hat nicht die Gruppe geschrieben. «CC» steht für die Beispielinhalte von Claude Code zu Rundgang und Ereignissen (Update 3), «CL» für die erste Fassung der Situationen. Alle brauchen eine fachliche Prüfung, bevor ihr Status auf `freigegeben` gesetzt wird.',
    '',
    ...stats.flatMap((s) => {
      const list = (autor: string, kind: string): string =>
        s.byClaude
          .filter((item) => item.autor === autor && item.kind === kind)
          .map((item) => (item.status === 'entwurf' ? item.id : `${item.id} (${item.status})`))
          .join(', ');
      const lines = [
        ['Von Claude Code (CC), Rundgang', list('CC', 'Rundgang')],
        ['Von Claude Code (CC), Ereignisse', list('CC', 'Ereignis')],
        ['Von Claude Code (CC), Situationen', list('CC', 'Situation')],
        ['Erste Fassung von Claude (CL), Situationen', list('CL', 'Situation')],
      ].filter(([, ids]) => ids !== '');
      return [
        `**Level ${s.nummer}**`,
        '',
        ...(lines.length === 0 ? ['- nichts'] : lines.map(([label, ids]) => `- ${label}: ${ids}`)),
        '',
      ];
    }),
    '## Betroffene Situationen',
    '',
    'Zeichenzahl der drei Optionstexte nebeneinander, für jede Situation, in der die gute Option die längste ist oder der längste Text mehr als 30 % länger ist als der kürzeste. Ziel für die Überarbeitung: die drei Zahlen einer Zeile etwa gleich gross, und die gute Option nicht regelmässig die grösste. Meist heisst das: riskante und vertretbare Optionen ausführlicher, gute knapper.',
    '',
    ...stats.flatMap((s) => {
      const affected = s.lengths.filter((l) => l.goodIsLongest || l.uneven);
      const count = (value: number | null): string => (value === null ? '–' : String(value));
      return [
        `### Level ${s.nummer}`,
        '',
        `${affected.length} von ${s.situations} Situationen betroffen; in ${s.goodIsLongest.length} ist die gute Option die längste.`,
        '',
        ...(affected.length === 0
          ? ['Keine.', '']
          : [
              '| Situation | Titel | Gut | Vertretbar | Riskant | Gute ist die längste | Über 30 % Unterschied |',
              '|---|---|---|---|---|---|---|',
              ...affected.map(
                (l) =>
                  `| ${l.id} | ${l.titel} | ${count(l.gut)} | ${count(l.vertretbar)} | ${count(l.riskant)} | ${l.goodIsLongest ? 'ja' : 'nein'} | ${l.uneven ? 'ja' : 'nein'} |`,
              ),
              '',
            ]),
      ];
    }),
  ];
  return lines.join('\n').trimEnd() + '\n';
}
