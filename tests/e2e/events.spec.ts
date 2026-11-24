import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import type { Level, StrategyId } from '../../src/content/schema.ts';
import { STRATEGY_IDS } from '../../src/content/schema.ts';
import { BALANCE } from '../../src/core/balance.ts';
import type { EventRound } from '../../src/core/events.ts';
import { eventVerdict } from '../../src/core/events.ts';
import type { LevelRun } from '../../src/core/game.ts';
import { step } from '../../src/core/game.ts';
import type { Progress } from '../../src/core/progress.ts';
import {
  LEVELS,
  oneBefore,
  openWith,
  progressAtEvent,
  progressBeforeEventCollapse,
  progressWithCompleted,
} from './support/progress.ts';

/**
 * M-20 to M-27 in the browser, in both window sizes. Everything runs in the simple mode
 * (`?renderer=none`), where the events are text; one test at the end checks the 3D view.
 */
const SIMPLE = '/?renderer=none';
const level3 = LEVELS[2] as Level;
const VERIFY = BALANCE.events.verifyCostTime;
const { klein: KLEIN, mittel: MITTEL, gross: GROSS } = BALANCE.effectPoints;

const screen = (page: Page, name: string) => page.locator(`[data-screen="${name}"]`);
const gauge = async (page: Page, key: string): Promise<number> =>
  Number(await page.getByTestId(`gauge-${key}`).getAttribute('data-value'));
const strategy = (page: Page, id: StrategyId) => page.getByTestId(`strategy-${id}`);

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

/** Takes the good option of the situation on screen and moves on from its feedback. */
async function goodDecision(page: Page, level: Level = level3): Promise<void> {
  await expect(screen(page, 'situation')).toBeVisible();
  const id = await screen(page, 'situation').getAttribute('data-situation');
  const option = level.situationen
    .find((s) => s.id === id)
    ?.optionen.find((o) => o.einstufung === 'gut');
  if (!option) throw new Error(`No good option in ${id}`);
  await page.locator('.option', { hasText: option.text }).click();
  await expect(screen(page, 'feedback')).toBeVisible();
  await page.getByTestId('next').click();
}

/** What the rules say happens from the stored state on: the strategy, then one good decision. */
function expected(progress: Progress, strategyId: StrategyId, verify = false): LevelRun {
  let run = progress.currentRun as LevelRun;
  if (verify) run = step(run, level3, { type: 'verifyForecast' });
  run = step(run, level3, { type: 'chooseStrategy', strategyId });
  const situation = level3.situationen.find((s) => s.id === run.situationIds[run.step]);
  const good = situation?.optionen.find((o) => o.einstufung === 'gut');
  if (!good) throw new Error('No good option');
  run = step(run, level3, { type: 'choose', optionId: good.id });
  return step(run, level3, { type: 'continue' });
}

test('announces an event with its forecast, its impact and four strategies with their price (M-20, M-21)', async ({
  page,
}) => {
  await openWith(page, SIMPLE, progressAtEvent(3, 'L3-E01', true));
  const event = screen(page, 'event');
  await expect(event).toHaveAttribute('data-event', 'L3-E01');
  await expect(event).toContainText('Ereignis 1 von 3');
  await expect(event).toContainText('Gewitter bei offenem Dach');

  // The source of the probability is part of the message.
  await expect(page.getByTestId('forecast')).toHaveAttribute('data-source', 'ai');
  await expect(page.getByTestId('forecast')).toContainText('AI-Prognose');
  await expect(page.getByTestId('forecast-shown')).toHaveAttribute('data-probability', 'tief');
  await expect(page.getByTestId('forecast-shown')).toContainText('tief, rund 20 %');
  await expect(page.getByTestId('impact')).toHaveText(
    `Budget −${MITTEL}, Zeit −${KLEIN}, Stabilität −${MITTEL}`,
  );

  // Always the same four, in the same order, each with cost and effect before the choice.
  const order = await page
    .getByTestId('strategies')
    .locator('button')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-strategy')));
  expect(order).toEqual([...STRATEGY_IDS]);
  await expect(strategy(page, 'vermeiden')).toContainText(`Kostet sofort: Zeit −${GROSS}`);
  await expect(strategy(page, 'vermeiden')).toContainText('Tritt es ein, bleibt nichts');
  await expect(strategy(page, 'vermindern')).toContainText(`Kostet sofort: Budget −${KLEIN}`);
  await expect(strategy(page, 'vermindern')).toContainText(
    `Tritt es ein, bleibt: Budget −${KLEIN}, Stabilität −${KLEIN}`,
  );
  await expect(strategy(page, 'uebertragen')).toContainText(
    `Tritt es ein, bleibt: Zeit −${KLEIN}, Stabilität −${MITTEL}`,
  );
  await expect(strategy(page, 'akzeptieren')).toContainText('Kostet nichts');
  await expect(strategy(page, 'akzeptieren')).toContainText(
    `Tritt es ein, bleibt: Budget −${MITTEL}, Zeit −${KLEIN}, Stabilität −${MITTEL}`,
  );
  // Nothing of the answer before the choice.
  await expect(event).not.toContainText('Empfohlen');

  // M-24: the strategy costs at once and the next situation follows.
  const budget = await gauge(page, 'budget');
  await strategy(page, 'vermindern').click();
  await expect(screen(page, 'situation')).toContainText('Situation 3 von 8');
  expect(await gauge(page, 'budget')).toBe(budget - KLEIN);

  // The event is resolved after the floor that followed, not before.
  await goodDecision(page);
  const result = screen(page, 'event-result');
  await expect(result).toHaveAttribute('data-occurred', 'true');
  await expect(result).toContainText('Ereignis 1 von 3 · Auflösung');
  await expect(page.getByTestId('verdict')).toHaveText('Gut entschieden, trotzdem Pech');
  await expect(page.getByTestId('event-points')).toContainText('1 Punkt');
  await expect(page.getByTestId('deltas')).toContainText(`Budget: −${KLEIN}`);
  // M-23: an unreliable forecast was trusted without a check, and the evaluation says so.
  await expect(page.getByTestId('trusted-forecast')).toContainText('«tief, rund 20 %»');
  await expect(page.getByTestId('trusted-forecast')).toContainText('«hoch, rund 60 %»');
  await page.getByTestId('next').click();
  await expect(screen(page, 'situation')).toContainText('Situation 4 von 8');
});

for (const strategyId of STRATEGY_IDS) {
  test(`plays the strategy «${strategyId}» to the result the rules give (M-21)`, async ({
    page,
  }) => {
    const progress = progressAtEvent(3, 'L3-E01', true);
    const after = expected(progress, strategyId);
    await openWith(page, SIMPLE, progress);
    await strategy(page, strategyId).click();
    await goodDecision(page);
    await expect(screen(page, 'event-result')).toHaveAttribute('data-occurred', 'true');
    for (const key of ['budget', 'zeit', 'stabilitaet'] as const) {
      expect(await gauge(page, key), key).toBe(after.gauges[key]);
    }
    const verdict = eventVerdict(after.events?.[0] as EventRound, level3);
    await expect(page.getByTestId('verdict')).toHaveAttribute('data-verdict', verdict ?? '');
    // Only a strategy that is not the recommended one is told what was.
    await expect(page.getByTestId('recommended')).toHaveCount(strategyId === 'vermindern' ? 0 : 1);
    if (strategyId === 'vermeiden') await expect(page.getByTestId('no-harm')).toBeVisible();
  });
}

test('has the AI forecast checked by the team: costs time, shows the truth (M-23)', async ({
  page,
}) => {
  const progress = progressAtEvent(3, 'L3-E01', true);
  await openWith(page, SIMPLE, progress);
  const time = await gauge(page, 'zeit');
  await expect(page.getByTestId('forecast-truth')).toHaveCount(0);
  await expect(page.getByTestId('verify')).toHaveText(`Im Team prüfen (Zeit −${VERIFY})`);
  await page.getByTestId('verify').click();

  expect(await gauge(page, 'zeit')).toBe(time - VERIFY);
  await expect(page.getByTestId('forecast-truth')).toHaveAttribute('data-probability', 'hoch');
  await expect(page.getByTestId('forecast')).toContainText('Am Hang gewittert es');
  await expect(page.getByTestId('verify')).toHaveCount(0);
  await expect(screen(page, 'event')).toBeVisible();

  // F-702: a reload keeps the check; it is not paid twice and not forgotten.
  await page.reload();
  await expect(page.getByTestId('forecast-truth')).toHaveAttribute('data-probability', 'hoch');
  expect(await gauge(page, 'zeit')).toBe(time - VERIFY);

  await strategy(page, 'vermindern').click();
  await goodDecision(page);
  await expect(page.getByTestId('checked-forecast')).toBeVisible();
  await expect(page.getByTestId('trusted-forecast')).toHaveCount(0);
  expect(await gauge(page, 'zeit')).toBe(expected(progress, 'vermindern', true).gauges.zeit);

  // M-08: the error report holds the events and what a replay needs.
  await page.getByTestId('menu').click();
  const report = await page.getByTestId('report').inputValue();
  for (const event of ['event.verify', 'event.strategy', 'event.resolve']) {
    expect(report).toContain(event);
  }
  expect(report).toMatch(/REPLAY: .*"events":\[\{"verified":true,"strategy":"vermindern"\}\]/);
});

test('shows a strategy that is not possible as locked, with the reason, also for the keyboard (M-21)', async ({
  page,
}) => {
  await openWith(page, SIMPLE, progressAtEvent(3, 'L3-E04', false));
  await expect(screen(page, 'event')).toHaveAttribute('data-event', 'L3-E04');
  // The team's own estimate: nothing to verify.
  await expect(page.getByTestId('forecast')).toHaveAttribute('data-source', 'team');
  await expect(page.getByTestId('forecast')).toContainText('Einschätzung des Teams');
  await expect(page.getByTestId('verify')).toHaveCount(0);

  const locked = strategy(page, 'uebertragen');
  await expect(locked).toBeVisible();
  await expect(locked).toBeDisabled();
  await expect(locked.getByTestId('strategy-locked')).toHaveText(
    'Nicht möglich: Es gibt keinen Geldschaden, den jemand übernehmen könnte.',
  );
  await expect(locked.getByTestId('strategy-cost')).toHaveCount(0);

  // Key 3 belongs to the locked strategy and does nothing; key 4 accepts.
  await page.keyboard.press('3');
  await expect(screen(page, 'event')).toBeVisible();
  await page.keyboard.press('4');
  await expect(screen(page, 'situation')).toContainText('Situation 3 von 8');

  await goodDecision(page);
  const result = screen(page, 'event-result');
  await expect(result).toHaveAttribute('data-occurred', 'false');
  await expect(page.getByTestId('verdict')).toHaveText('Gut entschieden');
  await expect(page.getByTestId('no-harm')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(screen(page, 'situation')).toContainText('Situation 4 von 8');
});

test('calls it luck when a large risk was accepted and did not happen (M-27)', async ({ page }) => {
  await openWith(page, SIMPLE, progressAtEvent(3, 'L3-E01', false));
  await strategy(page, 'akzeptieren').click();
  await goodDecision(page);
  await expect(screen(page, 'event-result')).toHaveAttribute('data-occurred', 'false');
  await expect(page.getByTestId('verdict')).toHaveText('Glück gehabt');
  await expect(page.getByTestId('recommended')).toHaveText('Empfohlen war: Vermindern.');
  await expect(page.getByTestId('event-points')).toContainText('keinen Punkt');
});

test('collapses through an event and names it among the causes (M-24, M-27)', async ({ page }) => {
  await openWith(page, SIMPLE, progressBeforeEventCollapse(3));
  // The floor after the event stands; the building is still up.
  await expect(screen(page, 'feedback')).toBeVisible();
  await page.getByTestId('next').click();

  const result = screen(page, 'event-result');
  await expect(result).toHaveAttribute('data-occurred', 'true');
  await expect(result.getByRole('alert')).toContainText('stürzt ein');
  await expect(page.getByTestId('next')).toHaveText('Zur Auswertung');
  await page.getByTestId('next').click();
  await page
    .getByTestId('skip')
    .click({ timeout: 2000 })
    .catch(() => undefined);

  await expect(screen(page, 'result')).toHaveAttribute('data-outcome', 'collapsed');
  const causes = page.getByTestId('causes');
  await expect(causes.locator('li[data-cause="event"]').first()).toContainText(
    'Ereignis eingetreten',
  );
  await expect(page.getByTestId('events').locator('li').first()).toContainText('Akzeptieren');
});

test('names the events in the briefing and lists them in the evaluation (M-25, M-26, M-27)', async ({
  page,
}) => {
  await openWith(page, SIMPLE, progressWithCompleted(2));
  await page.getByTestId('start-level-3').click();
  await expect(page.getByTestId('rules')).toContainText('13 von 19 Punkten');
  await expect(page.getByTestId('rules-events')).toContainText('melden sich 3 Ereignisse');
  // Level 3 has no site tour, and its briefing does not promise one.
  await expect(page.getByTestId('rules-tour')).toHaveCount(0);
});

test('lists every event with strategy and judgement at the end of the level (M-27)', async ({
  page,
}) => {
  const last = oneBefore((run) => run.outcome === 'completed', 3);
  await openWith(page, SIMPLE, last.progress);
  await page.locator('.option', { hasText: last.option }).click();
  await page.getByTestId('next').click();
  await page
    .getByTestId('skip')
    .click({ timeout: 2000 })
    .catch(() => undefined);
  await expect(screen(page, 'result')).toHaveAttribute('data-outcome', 'completed');
  const events = page.getByTestId('events').locator('li');
  await expect(events).toHaveCount(3);
  await expect(page.getByTestId('events').getByTestId('verdict')).toHaveCount(3);
  // The states the tests build take the recommended strategy every time.
  await expect(page.getByTestId('events').getByTestId('event-points')).toHaveText([
    /1 Punkt/,
    /1 Punkt/,
    /1 Punkt/,
  ]);
});

test('plays an event in the 3D view without an error', async ({ page }) => {
  test.slow();
  await openWith(page, '/?quality=0', progressAtEvent(3, 'L3-E01', true));
  await expect(page.locator('.canvas-host canvas')).toBeVisible();
  await expect(screen(page, 'event')).toBeVisible();
  await strategy(page, 'vermindern').click();
  await goodDecision(page);
  await expect(screen(page, 'event-result')).toBeVisible();
  await page.getByTestId('next').click();
  await expect(screen(page, 'situation')).toBeVisible();
  await expect(screen(page, 'error')).toHaveCount(0);
});
