import type { ContentRules } from './effects.ts';
import type { RuleIssue } from './rules.ts';
import type { Level, RiskEvent, Strategy, TourSite } from './schema.ts';
import { GAUGE_KEYS, STRATEGY_IDS } from './schema.ts';

/**
 * Rules for the two mechanics of update 3: the site tour (brief 1.3, 1.5) and the events
 * with their strategies (brief 2.6). As in rules.ts, each returns a message a person
 * without knowledge of the code can act on.
 */

export type TourType = 'gefunden' | 'fehlalarm' | 'uebersehen' | 'unauffaellig';

/** Which of the four kinds a place of the tour is. */
export function tourType(site: Pick<TourSite, 'istRisiko' | 'drohne'>): TourType {
  if (site.drohne === 'markiert') return site.istRisiko ? 'gefunden' : 'fehlalarm';
  return site.istRisiko ? 'uebersehen' : 'unauffaellig';
}

const TOUR_TYPE_LABEL: Record<TourType, string> = {
  gefunden: 'echtes Risiko, von der AI markiert',
  fehlalarm: 'Fehlalarm der AI',
  uebersehen: 'echtes Risiko, von der AI übersehen',
  unauffaellig: 'kein Risiko, nicht markiert',
};

/**
 * Whether the wanted number of each type can be drawn with every place (`ort`) used at most
 * once. A plain search: the pools are small.
 */
export function canDrawTour(
  sites: readonly Pick<TourSite, 'ort' | 'istRisiko' | 'drohne'>[],
  draw: Readonly<Record<TourType, number>>,
): boolean {
  const need = { ...draw };
  const used = new Set<string>();
  const search = (from: number): boolean => {
    if (Object.values(need).every((n) => n === 0)) return true;
    for (let i = from; i < sites.length; i++) {
      const site = sites[i] as (typeof sites)[number];
      const type = tourType(site);
      if (need[type] === 0 || used.has(site.ort)) continue;
      need[type] -= 1;
      used.add(site.ort);
      if (search(i + 1)) return true;
      need[type] += 1;
      used.delete(site.ort);
    }
    return false;
  };
  return search(0);
}

function duplicates(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
}

function available(strategy: Strategy): strategy is Extract<Strategy, { verfuegbar: true }> {
  return strategy.verfuegbar;
}

function checkEvent(
  event: RiskEvent,
  base: string,
  goalIds: ReadonlySet<string>,
  error: (path: string, message: string) => void,
): void {
  if (!goalIds.has(event.lernziel)) {
    error(`${base}.lernziel`, `«${event.lernziel}» ist kein Lernziel dieses Levels`);
  }
  // 2.6 rule 2
  const impact = GAUGE_KEYS.map((key) => event.auswirkung[key]);
  if (impact.some((level) => level.startsWith('+'))) {
    error(`${base}.auswirkung`, 'darf nur negative Stufen oder «0» enthalten');
  }
  if (!impact.some((level) => level.startsWith('-'))) {
    error(`${base}.auswirkung`, 'braucht mindestens eine negative Wirkung');
  }
  // 2.6 rule 3
  const accept = event.strategien.akzeptieren;
  if (!available(accept)) {
    error(`${base}.strategien.akzeptieren`, 'muss immer verfügbar sein');
  } else if (GAUGE_KEYS.some((key) => accept.kosten[key] !== '0')) {
    error(
      `${base}.strategien.akzeptieren.kosten`,
      'Akzeptieren ist kostenlos: alle Kosten müssen «0» sein',
    );
  }
  const others = (['vermeiden', 'vermindern', 'uebertragen'] as const).filter((id) =>
    available(event.strategien[id]),
  );
  if (others.length < 2) {
    error(
      `${base}.strategien`,
      'neben Akzeptieren müssen mindestens zwei weitere Strategien verfügbar sein',
    );
  }
  // 2.6 rule 4
  for (const id of STRATEGY_IDS) {
    const strategy = event.strategien[id];
    if (!available(strategy)) continue;
    const costs = GAUGE_KEYS.map((key) => strategy.kosten[key]);
    if (costs.some((level) => level.startsWith('+'))) {
      error(`${base}.strategien.${id}.kosten`, 'Kosten sind nie positiv');
    }
    if (id !== 'akzeptieren' && !costs.some((level) => level.startsWith('-'))) {
      error(`${base}.strategien.${id}.kosten`, 'diese Strategie muss mindestens etwas kosten');
    }
  }
  // 2.6 rule 5
  if (available(event.strategien.uebertragen) && !event.auswirkung.budget.startsWith('-')) {
    error(
      `${base}.strategien.uebertragen`,
      'Übertragen ist nur sinnvoll, wenn das Ereignis das Budget trifft; sonst «verfuegbar: false» mit Grund',
    );
  }
  // 2.6 rule 6
  const recommended = STRATEGY_IDS.filter((id) => {
    const strategy = event.strategien[id];
    return available(strategy) && strategy.empfohlen;
  });
  if (recommended.length < 1 || recommended.length > 2) {
    error(
      `${base}.strategien`,
      `mindestens eine und höchstens zwei Strategien sind empfohlen, hier sind es ${recommended.length}`,
    );
  }
  // 2.6 rule 7
  const forecast = event.aiPrognose;
  if (forecast) {
    const same = forecast.angezeigt === event.wahrscheinlichkeit;
    if (forecast.verlaesslich && !same) {
      error(
        `${base}.aiPrognose`,
        'eine verlässliche Prognose zeigt die tatsächliche Wahrscheinlichkeit: «angezeigt» muss gleich «wahrscheinlichkeit» sein',
      );
    }
    if (!forecast.verlaesslich && same) {
      error(
        `${base}.aiPrognose`,
        'eine unzuverlässige Prognose weicht ab: «angezeigt» muss ungleich «wahrscheinlichkeit» sein',
      );
    }
  }
}

export function checkMechanicsRules(level: Level, rules: ContentRules): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const error = (path: string, message: string) =>
    issues.push({ path, message, severity: 'error' });
  const n = level.nummer;
  const goalIds = new Set(level.lernziele.map((g) => g.id));

  const tour = level.rundgang;
  if (tour) {
    const wanted = Object.values(rules.tourDraw).reduce((sum, count) => sum + count, 0);
    if (tour.stellenProDurchgang !== wanted) {
      error('rundgang.stellenProDurchgang', `muss ${wanted} sein (Summe der vier Typen)`);
    }
    const pattern = new RegExp(`^L${n}-R\\d{2}$`);
    tour.stellen.forEach((site, i) => {
      const base = `rundgang.stellen[${i}] (${site.id})`;
      if (!pattern.test(site.id)) {
        error(`${base}.id`, `passt nicht zum Muster L${n}-R<zweistellige Nummer>`);
      }
      if (!goalIds.has(site.lernziel)) {
        error(`${base}.lernziel`, `«${site.lernziel}» ist kein Lernziel dieses Levels`);
      }
    });
    for (const id of duplicates(tour.stellen.map((s) => s.id))) {
      error('rundgang.stellen', `die ID «${id}» kommt mehrfach vor`);
    }
    // 1.3: one more of each type than a run draws, so runs differ.
    for (const type of Object.keys(rules.tourDraw) as TourType[]) {
      const have = tour.stellen.filter((site) => tourType(site) === type).length;
      const need = rules.tourDraw[type] + 1;
      if (have < need) {
        error(
          'rundgang.stellen',
          `vom Typ «${TOUR_TYPE_LABEL[type]}» braucht es mindestens ${need} Stellen, vorhanden sind ${have}`,
        );
      }
    }
    // 1.5: every place at most once per run.
    if (!canDrawTour(tour.stellen, rules.tourDraw)) {
      error(
        'rundgang.stellen',
        'aus diesen Stellen lässt sich kein Durchgang ziehen, in dem jeder Ort höchstens einmal vorkommt; verteile die Typen auf mehr verschiedene Orte',
      );
    }
  }

  const events = level.ereignisse;
  if (events) {
    const pool = events.pool;
    if (events.ereignisseProDurchgang > rules.eventRounds) {
      error(
        'ereignisse.ereignisseProDurchgang',
        `höchstens ${rules.eventRounds}, weil ein Durchgang so viele Ereignis-Runden hat`,
      );
    }
    // 2.6 rule 1
    const minPool = events.ereignisseProDurchgang + 2;
    if (pool.length < minPool) {
      error(
        'ereignisse.pool',
        `der Pool ist zu klein: ${pool.length} Ereignisse, nötig sind mindestens ${minPool}`,
      );
    }
    const pattern = new RegExp(`^L${n}-E\\d{2}$`);
    pool.forEach((event, i) => {
      const base = `ereignisse.pool[${i}] (${event.id})`;
      if (!pattern.test(event.id)) {
        error(`${base}.id`, `passt nicht zum Muster L${n}-E<zweistellige Nummer>`);
      }
      checkEvent(event, base, goalIds, error);
    });
    for (const id of duplicates(pool.map((e) => e.id))) {
      error('ereignisse.pool', `die ID «${id}» kommt mehrfach vor`);
    }
    // 2.6 rule 8
    const forecasts = pool.filter((e) => e.aiPrognose !== undefined);
    if (forecasts.length * 3 < pool.length) {
      error(
        'ereignisse.pool',
        `mindestens ein Drittel der Ereignisse braucht eine aiPrognose, hier sind es ${forecasts.length} von ${pool.length}`,
      );
    }
    if (!forecasts.some((e) => e.aiPrognose?.verlaesslich)) {
      error('ereignisse.pool', 'mindestens eine aiPrognose muss verlässlich sein');
    }
    if (!forecasts.some((e) => e.aiPrognose && !e.aiPrognose.verlaesslich)) {
      error('ereignisse.pool', 'mindestens eine aiPrognose muss unzuverlässig sein');
    }
    // 2.6 rule 9
    for (const id of STRATEGY_IDS) {
      const somewhere = pool.some((event) => {
        const strategy = event.strategien[id];
        return available(strategy) && strategy.empfohlen;
      });
      if (!somewhere) {
        error(
          'ereignisse.pool',
          `die Strategie «${id}» ist in keinem Ereignis empfohlen; jede der vier muss mindestens einmal die empfohlene sein`,
        );
      }
    }
  }

  return issues;
}
