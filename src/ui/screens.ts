import { checkVideoUrl } from '../content/rules.ts';
import type { GaugeKey, Level, Option, Rating, Situation, TheoryStep } from '../content/schema.ts';
import { GAUGE_KEYS } from '../content/schema.ts';
import { BALANCE } from '../core/balance.ts';
import type { ChoiceRecord, LevelRun } from '../core/game.ts';
import { findOption, findSituation } from '../core/game.ts';
import type { Gauges } from '../core/gauges.ts';
import type { Progress } from '../core/progress.ts';
import { isUnlocked, levelProgress } from '../core/progress.ts';
import type { RenderStats } from '../core/scene.ts';
import type { Stars } from '../core/scoring.ts';
import {
  acceptance,
  collapseCauses,
  collapsedGauges,
  goalResults,
  starsFor,
} from '../core/scoring.ts';
import { formatDuration } from '../logging/report.ts';
import { button, el } from './dom.ts';
import { theoryGraphic } from './graphics.ts';
import { T } from './texts.ts';

/** Below this value a gauge is also labelled in words, so colour is never the only signal (N-303). */
const CRITICAL_BELOW = BALANCE.gauge.criticalBelow;

export interface PlayableLevelView {
  level: Level;
  available: boolean;
}

function heading(text: string, level: 'h1' | 'h2' = 'h1'): HTMLElement {
  // tabindex -1 lets the app move focus here on every screen change (keyboard and screen readers).
  return el(level, {
    text,
    class: 'screen-title',
    attrs: { tabindex: '-1', 'data-focus': 'true' },
  });
}

function starText(stars: Stars): string {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}

/** `compact` shows the stars alone; the words stay for screen readers (N5). */
function starsBadge(stars: Stars, compact = false): HTMLElement {
  return el(
    'span',
    { class: 'stars', attrs: { 'data-testid': 'stars', 'data-stars': String(stars) } },
    [
      el('span', { text: starText(stars), attrs: { 'aria-hidden': 'true' } }),
      el('span', {
        class: compact ? 'stars-text sr-only' : 'stars-text',
        text: ` ${T.stars(stars)}`,
      }),
    ],
  );
}

function ratingBadge(rating: Rating): HTMLElement {
  return el('span', {
    class: `rating rating-${rating}`,
    text: `${T.ratingSymbols[rating]} ${T.ratings[rating]}`,
    attrs: { 'data-testid': 'rating', 'data-rating': rating },
  });
}

function signed(value: number): string {
  if (value === 0) return '±0';
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

/** Colour band of a gauge. The number and the word «kritisch» carry the same information (N-303). */
function gaugeBand(value: number): string {
  if (value < CRITICAL_BELOW) return 'low';
  return value < 50 ? 'mid' : 'high';
}

/** One chip per decision, like a site plan: done, current, still to come. */
function stepper(run: LevelRun): HTMLElement {
  const total = run.situationIds.length;
  const current = Math.min(run.history.length + (run.phase === 'situation' ? 1 : 0), total);
  return el(
    'ol',
    {
      class: 'stepper',
      attrs: { 'aria-label': T.stepper(Math.max(1, current), total), 'data-testid': 'stepper' },
    },
    run.situationIds.map((_, index) => {
      const choice = run.history[index];
      if (choice) {
        const fresh = run.phase === 'feedback' && index === run.history.length - 1;
        return el('li', {
          class: `step step-done step-${choice.rating}${fresh ? ' step-new' : ''}`,
          text: T.ratingSymbols[choice.rating],
          attrs: { title: T.ratings[choice.rating] },
        });
      }
      const isCurrent = run.phase === 'situation' && index === run.step;
      return el('li', {
        class: `step${isCurrent ? ' step-current' : ''}`,
        text: String(index + 1),
      });
    }),
  );
}

/** The three gauges as HTML above the canvas (N-301), each with label and number (N-303). */
export function hud(run: LevelRun): HTMLElement {
  const gauges = run.gauges;
  const last = run.history[run.history.length - 1];
  const delta = run.phase === 'feedback' && last ? last.delta : null;
  const started = run.phase !== 'briefing' && run.phase !== 'theory';
  return el('div', { class: 'hud', attrs: { 'data-testid': 'hud' } }, [
    el(
      'div',
      { class: 'gauges' },
      GAUGE_KEYS.map((key) => {
        const value = gauges[key];
        const critical = value < CRITICAL_BELOW;
        const fill = el('div', { class: `gauge-fill gauge-${gaugeBand(value)}` });
        fill.style.width = `${value}%`;
        const change = delta ? delta[key] : 0;
        return el(
          'div',
          {
            class: `gauge${critical ? ' gauge-critical' : ''}`,
            attrs: {
              role: 'meter',
              'aria-label': T.gauges[key],
              'aria-valuemin': '0',
              'aria-valuemax': '100',
              'aria-valuenow': String(value),
              'data-testid': `gauge-${key}`,
              'data-value': String(value),
              // Where the number comes from; the app counts from here to the value (G-60).
              'data-from': String(value - change),
            },
          },
          [
            el('span', { class: 'gauge-label' }, [
              el('span', {
                class: `gauge-icon gauge-icon-${key}`,
                attrs: { 'aria-hidden': 'true' },
              }),
              // N4: hidden to the eye on narrow phones; the meter keeps its name as aria-label.
              el('span', { class: 'gauge-name', text: T.gauges[key] }),
            ]),
            el('div', { class: 'gauge-bar', attrs: { 'aria-hidden': 'true' } }, [fill]),
            el('span', { class: 'gauge-value' }, [
              el('span', { class: 'gauge-number', text: String(value) }),
              critical
                ? el('span', { class: 'gauge-critical-word', text: ` · ${T.gaugeCritical}` })
                : null,
              // On narrow phones the word gives way to a mark; frame and bar say the same.
              critical
                ? el('span', {
                    class: 'gauge-critical-mark',
                    text: ` ${T.gaugeCriticalMark}`,
                    attrs: { 'aria-hidden': 'true' },
                  })
                : null,
            ]),
            // The change floats beside the gauge for a moment; the feedback text lists it as well.
            change !== 0
              ? el('span', {
                  class: `gauge-delta ${change > 0 ? 'gauge-delta-up' : 'gauge-delta-down'}`,
                  text: signed(change),
                  attrs: { 'aria-hidden': 'true' },
                })
              : null,
          ],
        );
      }),
    ),
    started ? stepper(run) : null,
  ]);
}

function notices(messages: readonly string[]): HTMLElement | null {
  if (messages.length === 0) return null;
  return el(
    'div',
    { class: 'notices', attrs: { role: 'status', 'data-testid': 'notices' } },
    messages.map((message) => el('p', { class: 'notice', text: message })),
  );
}

export interface CityHandlers {
  startLevel(levelId: string): void;
  showFinale(): void;
}

function summarySection(levels: readonly PlayableLevelView[], progress: Progress): HTMLElement[] {
  let total = 0;
  const rows = levels.map(({ level }) => {
    const best = levelProgress(progress, level.id).best;
    const stars = best?.stars ?? 0;
    total += stars;
    // N5: a grid of two columns, the name on the left and the stars flush right.
    return el('li', { class: 'summary-row', attrs: { 'data-testid': 'summary-row' } }, [
      el('span', { class: 'summary-name', text: `${T.city.level(level.nummer)}: ${level.titel}` }),
      starsBadge(stars, true),
    ]);
  });
  const goals = levels.flatMap(({ level }) => {
    const reached = levelProgress(progress, level.id).best?.goalsReached ?? [];
    return level.lernziele.map((goal) => {
      const ok = reached.includes(goal.id);
      return el('li', { class: ok ? 'goal-reached' : 'goal-open' }, [
        el('strong', {
          text: `${ok ? '✓' : '○'} ${ok ? T.summary.goalReached : T.summary.goalOpen}: `,
        }),
        el('span', { text: goal.text }),
      ]);
    });
  });
  return [
    el('p', { class: 'summary-total', attrs: { 'data-testid': 'summary' } }, [
      el('strong', { text: T.summary.totalStars(total, levels.length * 3) }),
      el('span', { text: ` · ${T.summary.playTime}: ${formatDuration(progress.playTimeMs)}` }),
    ]),
    el('ul', { class: 'plain-list summary-list' }, rows),
    el('h2', { text: T.summary.goalsHeading }),
    el('ul', { class: 'plain-list goals' }, goals),
  ];
}

export function totalStars(levels: readonly PlayableLevelView[], progress: Progress): number {
  return levels.reduce((sum, l) => sum + (levelProgress(progress, l.level.id).best?.stars ?? 0), 0);
}

/**
 * G-55: the start page. One main button, the state of every building, and the introduction
 * only as long as nothing has been built.
 */
export function cityScreen(
  levels: readonly PlayableLevelView[],
  progress: Progress,
  messages: readonly string[],
  contentErrors: readonly string[],
  handlers: CityHandlers,
): HTMLElement {
  const order = levels.map((l) => l.level.id);
  const states = levels.map(({ level, available }) => ({
    level,
    available,
    lp: levelProgress(progress, level.id),
    unlocked: isUnlocked(progress, order, level.id),
  }));
  const allDone = states.length > 0 && states.every((s) => s.lp.completed);
  const anyDone = states.some((s) => s.lp.completed);
  const started = states.some((s) => s.lp.attempts > 0 || s.lp.theorySeen);
  const next = states.find((s) => s.available && s.unlocked && !s.lp.completed);

  const main = allDone
    ? button(T.city.showFinale, handlers.showFinale, { primary: true, testId: 'play' })
    : next
      ? button(started ? T.city.resume : T.city.play, () => handlers.startLevel(next.level.id), {
          primary: true,
          testId: 'play',
        })
      : null;

  const cards = states.map(({ level, available, lp, unlocked }, index) => {
    const playable = available && unlocked;
    const children: (HTMLElement | null)[] = [
      el('h3', { text: `${T.city.level(level.nummer)} · ${level.titel}` }),
      el('p', { class: 'muted', text: level.projekt.titel }),
    ];
    if (!available) {
      children.push(el('p', { class: 'status', text: T.city.unavailable }));
    } else if (!unlocked) {
      const previous = levels[index - 1]?.level.nummer ?? level.nummer - 1;
      children.push(el('p', { class: 'status', text: T.city.locked(previous) }));
    } else if (lp.completed && lp.best) {
      children.push(el('p', { class: 'status' }, [`${T.city.done} · `, starsBadge(lp.best.stars)]));
    } else {
      children.push(el('p', { class: 'status', text: T.city.open }));
    }
    if (playable) {
      children.push(
        button(lp.completed ? T.city.repeat : T.city.start, () => handlers.startLevel(level.id), {
          testId: `start-${level.id}`,
        }),
      );
    }
    return el(
      'li',
      {
        class: `card level-card${playable ? '' : ' level-locked'}`,
        attrs: { 'data-testid': `level-${level.nummer}` },
      },
      children,
    );
  });

  return el('div', { class: 'screen screen-city', attrs: { 'data-screen': 'city' } }, [
    el('h1', {
      class: 'screen-title wordmark',
      text: T.appTitle,
      attrs: { tabindex: '-1', 'data-focus': 'true' },
    }),
    anyDone
      ? null
      : el('p', { class: 'lead', attrs: { 'data-testid': 'intro' }, text: T.city.intro }),
    notices(messages),
    contentErrors.length > 0
      ? el('div', { class: 'notices', attrs: { role: 'alert' } }, [
          el('p', { class: 'notice', text: T.city.contentErrors }),
          el(
            'ul',
            { class: 'error-list' },
            contentErrors.map((error) => el('li', { text: error })),
          ),
        ])
      : null,
    main ? el('div', { class: 'actions actions-main' }, [main]) : null,
    el('h2', { text: T.city.levelsHeading }),
    levels.length > 0
      ? el('ul', { class: 'plain-list level-list' }, cards)
      : el('p', { text: T.city.noLevels }),
    el('p', { class: 'muted small', text: T.city.deviceHint }),
  ]);
}

export interface FinaleHandlers {
  /** Null where there is no 3D view to look at or to save. */
  look: (() => void) | null;
  save: ((status: HTMLElement) => void) | null;
  again(): void;
}

/** G-53: the closing screen with its title by stars and the overall evaluation. */
export function finaleScreen(
  levels: readonly PlayableLevelView[],
  progress: Progress,
  title: string,
  handlers: FinaleHandlers,
): HTMLElement {
  const status = el('p', {
    class: 'muted small',
    attrs: { role: 'status', 'data-testid': 'save-status' },
  });
  return el('div', { class: 'screen screen-finale', attrs: { 'data-screen': 'finale' } }, [
    el('p', { class: 'eyebrow', text: T.summary.heading }),
    el('h1', {
      class: 'screen-title wordmark',
      text: title,
      attrs: { tabindex: '-1', 'data-focus': 'true', 'data-testid': 'finale-title' },
    }),
    el('p', { class: 'lead', text: T.finale.lead }),
    ...summarySection(levels, progress),
    el('div', { class: 'actions' }, [
      handlers.look
        ? button(T.finale.look, handlers.look, { primary: true, testId: 'look' })
        : null,
      handlers.save
        ? button(T.finale.save, () => handlers.save?.(status), { testId: 'save-picture' })
        : null,
      button(T.finale.again, handlers.again, { primary: !handlers.look, testId: 'again' }),
    ]),
    status,
  ]);
}

/** G-54: only the city, and the way back. */
export function lookScreen(back: () => void): HTMLElement {
  return el('div', { class: 'screen screen-look', attrs: { 'data-screen': 'look' } }, [
    el('p', { class: 'muted small', text: T.finale.lookHint }),
    el('div', { class: 'actions' }, [
      button(T.finale.backFromLook, back, { primary: true, testId: 'look-back' }),
    ]),
  ]);
}

export interface RunHandlers {
  next(): void;
  skipTheory(): void;
  choose(option: Option): void;
}

function eyebrow(level: Level, extra?: string): HTMLElement {
  const base = T.briefing.eyebrow(level.nummer, level.titel);
  return el('p', { class: 'eyebrow', text: extra ? `${base} · ${extra}` : base });
}

export function briefingScreen(level: Level, run: LevelRun, handlers: RunHandlers): HTMLElement {
  const rules = acceptance([], run.situationIds.length);
  return el('div', { class: 'screen', attrs: { 'data-screen': 'briefing' } }, [
    eyebrow(level),
    heading(level.projekt.titel),
    el('h2', { text: T.briefing.project }),
    el('p', { text: level.projekt.beschreibung }),
    el('h2', { text: T.briefing.goals }),
    el(
      'ul',
      {},
      level.lernziele.map((goal) => el('li', { text: goal.text })),
    ),
    el('h2', { text: T.briefing.rulesHeading }),
    el('p', {
      attrs: { 'data-testid': 'rules' },
      text: T.briefing.rules(rules.max / 2, rules.required, rules.max),
    }),
    el('div', { class: 'actions' }, [
      button(T.briefing.start, handlers.next, { primary: true, testId: 'next' }),
      run.canSkipTheory
        ? button(T.theory.skip, handlers.skipTheory, { testId: 'skip-theory' })
        : null,
    ]),
  ]);
}

/** F-504, S-06: nothing is requested from the video host until the player clicks. */
function videoBlock(step: Extract<TheoryStep, { typ: 'video' }>): HTMLElement {
  const frame = el('div', { class: 'video-frame' });
  const problem = checkVideoUrl(step.url);
  if (problem) {
    frame.append(el('p', { class: 'notice', text: T.theory.videoBlocked }));
  } else {
    const load = button(
      T.theory.videoLoad,
      () => {
        const iframe = el('iframe', {
          attrs: {
            src: step.url,
            title: step.titel,
            sandbox: 'allow-scripts allow-same-origin allow-presentation',
            referrerpolicy: 'no-referrer',
            loading: 'lazy',
            allow: 'fullscreen',
          },
        });
        frame.replaceChildren(iframe);
      },
      { testId: 'video-load' },
    );
    frame.append(el('p', { class: 'muted small', text: T.theory.videoHint }), load);
  }
  return el('div', { class: 'video' }, [
    frame,
    el('p', {
      class: 'muted small',
      text: T.theory.videoDuration(Math.max(1, Math.round(step.dauerSekunden / 60))),
    }),
    el('h2', { text: T.theory.videoTranscript }),
    el('p', { text: step.transkript }),
  ]);
}

export function theoryScreen(level: Level, run: LevelRun, handlers: RunHandlers): HTMLElement {
  const step = level.theorie[run.theoryIndex];
  const position = T.theory.progress(run.theoryIndex + 1, level.theorie.length);
  const body: (HTMLElement | null)[] = [];
  if (step?.typ === 'karte') {
    body.push(el('p', { text: step.text }));
    if (step.grafik) body.push(theoryGraphic(step.grafik));
  } else if (step?.typ === 'video') {
    body.push(videoBlock(step));
  }
  return el('div', { class: 'screen', attrs: { 'data-screen': 'theory' } }, [
    eyebrow(level, position),
    heading(step?.titel ?? ''),
    ...body,
    el('div', { class: 'actions' }, [
      button(T.next, handlers.next, { primary: true, testId: 'next' }),
      run.canSkipTheory
        ? button(T.theory.skip, handlers.skipTheory, { testId: 'skip-theory' })
        : null,
    ]),
  ]);
}

function aiOutput(situation: Situation): HTMLElement | null {
  if (!situation.aiAusgabe) return null;
  return el('section', { class: 'ai-output', attrs: { 'aria-label': T.situation.aiHeading } }, [
    el('h2', { text: T.situation.aiHeading }),
    el('p', { class: 'ai-prompt' }, [
      el('strong', { text: `${T.situation.prompt}: ` }),
      el('span', { text: situation.aiAusgabe.prompt }),
    ]),
    el('p', { class: 'ai-answer' }, [
      el('strong', { text: `${T.situation.answer}: ` }),
      el('span', { text: situation.aiAusgabe.antwort }),
    ]),
  ]);
}

export function situationScreen(
  level: Level,
  run: LevelRun,
  situation: Situation,
  options: readonly Option[],
  handlers: RunHandlers,
  showDraftLabel: boolean,
): HTMLElement {
  const position = T.situation.progress(run.step + 1, run.situationIds.length);
  return el(
    'div',
    { class: 'screen', attrs: { 'data-screen': 'situation', 'data-situation': situation.id } },
    [
      eyebrow(level, position),
      showDraftLabel && situation.status === 'entwurf'
        ? el('p', {
            class: 'draft-badge',
            text: T.situation.draft,
            attrs: { 'data-testid': 'draft' },
          })
        : null,
      heading(situation.titel),
      el('p', { text: situation.situation }),
      aiOutput(situation),
      el('h2', { text: T.situation.optionsHeading, attrs: { 'data-options-heading': 'true' } }),
      el(
        'div',
        { class: 'options' },
        // F-207: numbered by position, all in the same neutral style; the content ID stays hidden.
        options.map((option, index) => {
          const node = button('', () => handlers.choose(option), {
            class: 'option',
            testId: `option-${index + 1}`,
          });
          node.dataset.key = String(index + 1);
          node.append(
            el('span', {
              class: 'option-key',
              text: String(index + 1),
              attrs: { 'aria-hidden': 'true' },
            }),
            el('span', { class: 'option-text', text: option.text }),
          );
          return node;
        }),
      ),
      el('p', { class: 'muted small keyboard-hint', text: T.situation.keyboardHint }),
    ],
  );
}

function deltaList(delta: Gauges, after: Gauges): HTMLElement {
  return el(
    'ul',
    { class: 'plain-list deltas', attrs: { 'data-testid': 'deltas' } },
    GAUGE_KEYS.map((key) =>
      el('li', {
        text:
          delta[key] === 0
            ? `${T.gauges[key]}: ${T.feedback.noChange} (${after[key]})`
            : `${T.gauges[key]}: ${signed(delta[key])} → ${after[key]}`,
      }),
    ),
  );
}

export function feedbackScreen(level: Level, run: LevelRun, handlers: RunHandlers): HTMLElement {
  const choice = run.history[run.history.length - 1] as ChoiceRecord;
  const situation = findSituation(level, choice.situationId);
  const option = findOption(situation, choice.optionId);
  const collapsed = run.outcome === 'collapsed';
  const done = run.outcome !== 'running';
  return el('div', { class: 'screen', attrs: { 'data-screen': 'feedback' } }, [
    eyebrow(level, T.situation.progress(run.step + 1, run.situationIds.length)),
    heading(situation.titel),
    el('h2', { text: T.feedback.yourChoice }),
    el('p', { class: 'chosen', text: option.text }),
    el('p', {}, [ratingBadge(choice.rating)]),
    el('p', { attrs: { 'data-testid': 'explanation' }, text: option.erklaerung }),
    el('h2', { text: T.feedback.changes }),
    deltaList(choice.delta, choice.gaugesAfter),
    collapsed
      ? el('p', {
          class: 'notice notice-strong',
          text: T.feedback.collapse,
          attrs: { role: 'alert' },
        })
      : null,
    run.outcome === 'rejected'
      ? el('p', {
          class: 'notice notice-strong',
          text: T.feedback.rejected,
          attrs: { role: 'alert' },
        })
      : null,
    el('div', { class: 'actions' }, [
      button(done ? T.feedback.toResult : T.next, handlers.next, { primary: true, testId: 'next' }),
    ]),
  ]);
}

function decisionList(level: Level, history: readonly ChoiceRecord[]): HTMLElement {
  return el(
    'ol',
    { class: 'decisions', attrs: { 'data-testid': 'decisions' } },
    history.map((choice) => {
      const situation = findSituation(level, choice.situationId);
      const option = findOption(situation, choice.optionId);
      return el('li', {}, [
        el('h3', { text: situation.titel }),
        el('p', { class: 'chosen', text: option.text }),
        el('p', {}, [ratingBadge(choice.rating)]),
        el('p', { text: option.erklaerung }),
      ]);
    }),
  );
}

export interface ResultHandlers {
  restart(): void;
  toCity(): void;
  /** Null if there is no further level to go to. */
  nextLevel: (() => void) | null;
}

export type EndOutcome = 'completed' | 'rejected' | 'collapsed';

const SEQUENCE_LEAD: Record<EndOutcome, string> = {
  completed: T.sequence.completedLead,
  rejected: T.sequence.rejectedLead,
  collapsed: T.sequence.collapsedLead,
};

/**
 * B5: the short moment between the last decision and the evaluation. With 3D it frames
 * what happens on the site; without, it says the same in words. `starDelays` gives the
 * second at which each star appears, or null to show everything at once.
 */
export function sequenceScreen(
  outcome: EndOutcome,
  stars: Stars,
  starDelays: readonly number[] | null,
  bannerDelay: number,
  skip: () => void,
): HTMLElement {
  const banner = el('h1', {
    class: `screen-title banner banner-${outcome}`,
    text: T.sequence[outcome],
    attrs: { tabindex: '-1', 'data-focus': 'true', 'data-testid': 'banner' },
  });
  const animated = starDelays !== null;
  if (animated) banner.style.animationDelay = `${bannerDelay}s`;
  const starRow =
    outcome === 'completed'
      ? el(
          'p',
          {
            class: 'banner-stars',
            attrs: {
              'data-testid': 'banner-stars',
              'data-stars': String(stars),
              'aria-label': T.stars(stars),
            },
          },
          [0, 1, 2].map((i) => {
            const star = el('span', {
              class: `banner-star${i < stars ? ' banner-star-on' : ''}`,
              text: i < stars ? '★' : '☆',
              attrs: { 'aria-hidden': 'true' },
            });
            const delay = starDelays?.[i];
            if (animated && delay !== undefined) star.style.animationDelay = `${delay}s`;
            return star;
          }),
        )
      : null;
  return el(
    'div',
    {
      class: `screen screen-sequence${animated ? ' sequence-animated' : ''}`,
      attrs: { 'data-screen': 'sequence', 'data-outcome': outcome },
    },
    [
      banner,
      starRow,
      el('p', { class: 'lead', text: SEQUENCE_LEAD[outcome] }),
      el('div', { class: 'actions' }, [
        button(T.sequence.skip, skip, { primary: true, testId: 'skip' }),
      ]),
    ],
  );
}

function causeItem(level: Level, choice: ChoiceRecord, note: string): HTMLElement {
  const situation = findSituation(level, choice.situationId);
  const option = findOption(situation, choice.optionId);
  return el('li', {}, [
    el('h3', { text: situation.titel }),
    el('p', { class: 'chosen', text: option.text }),
    el('p', {}, [
      ratingBadge(choice.rating),
      el('span', { class: 'cause-loss', text: ` ${note}` }),
    ]),
    el('p', { text: option.erklaerung }),
  ]);
}

export function resultScreen(level: Level, run: LevelRun, handlers: ResultHandlers): HTMLElement {
  const failed = run.outcome !== 'completed';
  const score = acceptance(run.history, run.situationIds.length);
  const children: (HTMLElement | null)[] = [eyebrow(level)];

  if (run.outcome === 'collapsed') {
    const gauges: GaugeKey[] = collapsedGauges(run.gauges);
    children.push(
      heading(T.result.collapsed),
      el('p', {
        class: 'stamp',
        text: T.result.siteClosed,
        attrs: { 'data-testid': 'site-closed' },
      }),
      el('p', {
        class: 'lead',
        attrs: { 'data-testid': 'collapse-reason' },
        text: T.result.collapsedLead(gauges.map((key) => T.gauges[key]).join(', ')),
      }),
      el('h2', { text: T.result.causes }),
      el(
        'ol',
        { class: 'decisions', attrs: { 'data-testid': 'causes' } },
        collapseCauses(run.history, gauges).map(({ choice, gauge, loss }) =>
          causeItem(level, choice, T.result.causeLoss(T.gauges[gauge], loss)),
        ),
      ),
    );
  } else if (run.outcome === 'rejected') {
    children.push(
      heading(T.result.rejected),
      el('p', {
        class: 'stamp',
        text: T.sequence.rejected,
        attrs: { 'data-testid': 'not-accepted' },
      }),
      el('p', {
        class: 'lead',
        attrs: { 'data-testid': 'rejected-reason' },
        text: T.result.rejectedLead(score.points, score.required, score.max),
      }),
      el('h2', { text: T.result.rejectedCauses }),
      el(
        'ol',
        { class: 'decisions', attrs: { 'data-testid': 'causes' } },
        run.history.filter((c) => c.rating !== 'gut').map((choice) => causeItem(level, choice, '')),
      ),
    );
  } else {
    children.push(
      heading(T.result.completed),
      el('p', {
        class: 'stamp stamp-good',
        text: T.sequence.completed,
        attrs: { 'data-testid': 'accepted' },
      }),
      el('p', { class: 'lead', text: T.result.completedLead }),
      el('p', { class: 'result-stars' }, [
        starsBadge(starsFor(run)),
        el('span', { class: 'muted', text: ` · ${T.result.points(score.points, score.max)}` }),
      ]),
    );
  }

  children.push(
    el('h2', { text: T.result.goals }),
    el(
      'ul',
      { class: 'plain-list goals', attrs: { 'data-testid': 'goals' } },
      goalResults(level, run.history).map((goal) =>
        el('li', { class: `goal-${goal.status}` }, [
          el('strong', { text: `${T.goalStatus[goal.status]}: ` }),
          el('span', { text: goal.text }),
        ]),
      ),
    ),
    el('h2', { text: T.result.decisions }),
    decisionList(level, run.history),
  );

  const actions = failed
    ? [
        button(T.result.restart, handlers.restart, { primary: true, testId: 'restart' }),
        button(T.result.toCity, handlers.toCity, { testId: 'to-city' }),
      ]
    : [
        handlers.nextLevel
          ? button(T.result.nextLevel, handlers.nextLevel, { primary: true, testId: 'next-level' })
          : null,
        button(T.result.toCity, handlers.toCity, {
          primary: !handlers.nextLevel,
          testId: 'to-city',
        }),
        button(T.result.repeat, handlers.restart, { testId: 'restart' }),
      ];
  children.push(el('div', { class: 'actions' }, actions));

  return el(
    'div',
    { class: 'screen', attrs: { 'data-screen': 'result', 'data-outcome': run.outcome } },
    children,
  );
}

export interface ReportHandlers {
  copy(text: string, status: HTMLElement): void;
}

/** L-04, L-06: the report is always visible before it is copied, and doubles as the fallback. */
function reportBlock(report: string, handlers: ReportHandlers): HTMLElement {
  const area = el('textarea', {
    class: 'report',
    attrs: {
      readonly: 'true',
      rows: '8',
      'aria-label': T.menuScreen.reportLabel,
      'data-testid': 'report',
      spellcheck: 'false',
    },
  });
  area.value = report;
  const status = el('p', {
    class: 'muted small',
    attrs: { role: 'status', 'data-testid': 'copy-status' },
  });
  return el('div', { class: 'report-block' }, [
    area,
    button(T.menuScreen.copy, () => handlers.copy(report, status), { testId: 'copy-report' }),
    status,
  ]);
}

export interface MenuHandlers extends ReportHandlers {
  back(): void;
  abort: (() => void) | null;
  askReset(): void;
}

export function menuScreen(
  report: string,
  build: { version: string; commit: string },
  messages: readonly string[],
  handlers: MenuHandlers,
): HTMLElement {
  return el('div', { class: 'screen', attrs: { 'data-screen': 'menu' } }, [
    heading(T.menuScreen.heading),
    notices(messages),
    el('div', { class: 'actions' }, [
      button(T.back, handlers.back, { primary: true, testId: 'menu-back' }),
      handlers.abort ? button(T.menuScreen.abort, handlers.abort, { testId: 'abort' }) : null,
    ]),
    el('h2', { text: T.menuScreen.reportHeading }),
    el('p', { text: T.menuScreen.reportLead }),
    reportBlock(report, handlers),
    el('h2', { text: T.menuScreen.resetHeading }),
    el('p', { class: 'muted', text: T.city.deviceHint }),
    el('div', { class: 'actions' }, [
      button(T.menuScreen.reset, handlers.askReset, { testId: 'reset' }),
    ]),
    el('p', {
      class: 'muted small',
      attrs: { 'data-testid': 'version' },
      text: T.menuScreen.version(build.version, build.commit),
    }),
  ]);
}

export function confirmResetScreen(handlers: { yes(): void; no(): void }): HTMLElement {
  return el('div', { class: 'screen', attrs: { 'data-screen': 'confirm-reset' } }, [
    heading(T.confirmReset.heading),
    el('p', { text: T.confirmReset.lead }),
    el('div', { class: 'actions' }, [
      button(T.confirmReset.no, handlers.no, { primary: true, testId: 'reset-no' }),
      button(T.confirmReset.yes, handlers.yes, { class: 'btn-danger', testId: 'reset-yes' }),
    ]),
  ]);
}

export interface DebugInfo {
  stats: RenderStats;
  run: LevelRun | null;
  levels: readonly { id: string; nummer: number }[];
}

function shown(value: number | null): string {
  return value === null ? '–' : String(value);
}

/** L-09: the values of the debug overlay. Rebuilt often, so it holds nothing clickable. */
export function debugValues(info: DebugInfo): HTMLElement {
  const { stats, run } = info;
  const rows: [string, string][] = [
    [
      T.debug.fps,
      `${shown(stats.fps)} (Ø ${shown(stats.fpsAverage)}, min ${shown(stats.fpsMinimum)})`,
    ],
    [T.debug.drawCalls, shown(stats.drawCalls)],
    [T.debug.triangles, shown(stats.triangles)],
    [T.debug.quality, shown(stats.quality)],
    [T.debug.level, run ? `${run.levelId} · ${run.phase} · ${run.step + 1}` : '–'],
    [T.debug.seed, run ? String(run.seed) : '–'],
    [
      T.debug.gauges,
      run ? GAUGE_KEYS.map((key) => `${T.gauges[key]} ${run.gauges[key]}`).join(' · ') : '–',
    ],
  ];
  return el(
    'dl',
    {},
    rows.flatMap(([label, value]) => [el('dt', { text: label }), el('dd', { text: value })]),
  );
}

/**
 * L-09: the frame of the debug overlay with the level jump. Built once: buttons that were
 * replaced twice a second could not be clicked reliably.
 */
export function debugFrame(
  levels: DebugInfo['levels'],
  values: HTMLElement,
  jump: (levelId: string) => void,
): HTMLElement {
  return el(
    'aside',
    { class: 'debug', attrs: { 'data-testid': 'debug', 'aria-label': T.debug.heading } },
    [
      el('strong', { text: T.debug.heading }),
      values,
      el(
        'div',
        { class: 'debug-jump' },
        levels.map((level) =>
          button(T.debug.jump(level.nummer), () => jump(level.id), {
            class: 'btn-debug',
            testId: `jump-${level.id}`,
          }),
        ),
      ),
    ],
  );
}

export function debugAttributes(info: DebugInfo): Record<string, string> {
  return {
    'data-draw-calls': shown(info.stats.drawCalls),
    'data-triangles': shown(info.stats.triangles),
    'data-seed': info.run ? String(info.run.seed) : '',
  };
}

/** L-08: what the player sees instead of a white page. */
export function errorScreen(
  report: string,
  handlers: ReportHandlers & { reload(): void },
): HTMLElement {
  return el('div', { class: 'screen', attrs: { 'data-screen': 'error', role: 'alert' } }, [
    heading(T.error.heading),
    el('p', { text: T.error.lead }),
    el('div', { class: 'actions' }, [
      button(T.error.reload, handlers.reload, { primary: true, testId: 'reload' }),
    ]),
    el('h2', { text: T.menuScreen.reportHeading }),
    el('p', { text: T.menuScreen.reportLead }),
    reportBlock(report, handlers),
  ]);
}
