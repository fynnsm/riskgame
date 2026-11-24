import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import type { Level, OptionId } from '../../src/content/schema.ts';
import { replay } from '../../src/core/game.ts';
import type { LevelRun } from '../../src/core/game.ts';
import { step } from '../../src/core/game.ts';
import type { Progress } from '../../src/core/progress.ts';
import { starsFor } from '../../src/core/scoring.ts';
import {
  openWith,
  progressInLevel,
  progressWhere,
  progressWithCompleted,
} from './support/progress.ts';

type Rating = 'gut' | 'vertretbar' | 'riskant';

const level1 = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', '..', 'content', 'levels', 'level-1.json'), 'utf8'),
) as Level;
const STEPS = level1.situationenProDurchgang;

/** The simple mode is the basis of these tests (CLAUDE.md, rule 8). */
const SIMPLE = '/?renderer=none';

const screen = (page: Page, name: string) => page.locator(`[data-screen="${name}"]`);
const gauge = (page: Page, key: string) => page.getByTestId(`gauge-${key}`);

async function startLevel1(page: Page): Promise<void> {
  await page.getByTestId('start-level-1').click();
  await expect(screen(page, 'briefing')).toBeVisible();
}

async function throughBriefingAndTheory(page: Page): Promise<void> {
  await page.getByTestId('next').click();
  for (let i = 0; i < level1.theorie.length; i++) {
    await expect(screen(page, 'theory')).toBeVisible();
    await page.getByTestId('next').click();
  }
  await expect(screen(page, 'situation')).toBeVisible();
}

/** Picks the option with the wanted rating by its text; position and order are shuffled. */
async function choose(page: Page, rating: Rating): Promise<void> {
  const id = await screen(page, 'situation').getAttribute('data-situation');
  const situation = level1.situationen.find((s) => s.id === id);
  const option = situation?.optionen.find((o) => o.einstufung === rating);
  if (!option) throw new Error(`No ${rating} option in ${id}`);
  await page.locator('.option', { hasText: option.text }).click();
  await expect(screen(page, 'feedback')).toBeVisible();
  await expect(page.getByTestId('rating')).toHaveAttribute('data-rating', rating);
}

/**
 * The short sequence after the last decision; the tests that are not about it skip it.
 * The sequence also ends by itself after a few seconds. On a slow machine that can happen
 * before the click, so a missing button is fine as long as the evaluation is there afterwards.
 */
async function skipSequence(page: Page): Promise<void> {
  await page
    .getByTestId('skip')
    .click({ timeout: 2000 })
    .catch(() => undefined);
  await expect(screen(page, 'result')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => {
    throw error;
  });
});

test('plays a whole level and keeps the finished building', async ({ page }) => {
  await page.goto(SIMPLE);
  await expect(screen(page, 'city')).toBeVisible();
  await expect(page.getByTestId('start-level-2')).toHaveCount(0);

  await startLevel1(page);
  await expect(page.getByTestId('skip-theory')).toHaveCount(0);
  await throughBriefingAndTheory(page);
  await expect(gauge(page, 'budget')).toHaveAttribute('data-value', '76');
  await expect(page.getByTestId('stepper').locator('li')).toHaveCount(STEPS);

  for (let i = 0; i < STEPS; i++) {
    await expect(screen(page, 'situation')).toContainText(`Situation ${i + 1} von ${STEPS}`);
    await choose(page, 'gut');
    await expect(page.getByTestId('explanation')).not.toBeEmpty();
    await page.getByTestId('next').click();
  }
  await skipSequence(page);

  await expect(screen(page, 'result')).toHaveAttribute('data-outcome', 'completed');
  await expect(page.getByTestId('stars')).toHaveAttribute('data-stars', '3');
  await expect(page.getByTestId('decisions').locator('li')).toHaveCount(STEPS);
  await expect(page.getByTestId('goals')).toContainText('Erreicht');

  await page.getByTestId('to-city').click();
  await expect(page.getByTestId('level-1')).toContainText('Abgeschlossen');
  await expect(page.getByTestId('start-level-2')).toBeVisible();

  // F-505: on a repeat the theory may be skipped.
  await page.getByTestId('start-level-1').click();
  await page.getByTestId('skip-theory').click();
  await expect(screen(page, 'situation')).toBeVisible();
});

test('collapses, explains why and restarts the level, not the game', async ({ page }) => {
  await page.goto(SIMPLE);
  await startLevel1(page);
  await throughBriefingAndTheory(page);

  for (let i = 0; i < STEPS; i++) {
    await choose(page, 'riskant');
    const collapsed =
      (await page.getByTestId('gauge-stabilitaet').getAttribute('data-value')) === '0';
    await page.getByTestId('next').click();
    if (collapsed) break;
  }
  await skipSequence(page);

  await expect(screen(page, 'result')).toHaveAttribute('data-outcome', 'collapsed');
  await expect(page.getByTestId('collapse-reason')).toContainText('Stabilität');
  await expect(page.getByTestId('site-closed')).toHaveText('Baustopp');
  await expect(page.getByTestId('causes').locator('li').first()).toContainText('Riskant');

  await page.getByTestId('restart').click();
  await expect(screen(page, 'briefing')).toBeVisible();
  await expect(gauge(page, 'stabilitaet')).toHaveAttribute('data-value', '76');

  await page.getByTestId('menu').click();
  await page.getByTestId('abort').click();
  await expect(page.getByTestId('level-1')).toContainText('Offen');
  await expect(page.getByTestId('start-level-2')).toHaveCount(0);
});

test('fails the final inspection if the building stands on too many poor decisions', async ({
  page,
}) => {
  // The seed fixes the draw, so the same logic the game runs can search for a suitable path.
  const seed = 4242;
  const ids: OptionId[] = ['A', 'B', 'C'];
  let plan: OptionId[] | null = null;
  const search = (prefix: OptionId[]): void => {
    if (plan) return;
    if (prefix.length === STEPS) {
      if (replay(level1, seed, [], prefix).outcome === 'rejected') plan = prefix;
      return;
    }
    for (const id of ids) search([...prefix, id]);
  };
  search([]);
  if (!plan) throw new Error('No rejected path found for this seed');
  const expected = replay(level1, seed, [], plan);

  await page.goto(`${SIMPLE}&seed=${seed}`);
  await startLevel1(page);
  await expect(page.getByTestId('rules')).toContainText('11 von 16 Punkten');
  await throughBriefingAndTheory(page);
  for (let i = 0; i < STEPS; i++) {
    const id = await screen(page, 'situation').getAttribute('data-situation');
    expect(id).toBe(expected.situationIds[i]);
    const situation = level1.situationen.find((s) => s.id === id);
    const option = situation?.optionen.find((o) => o.id === (plan as OptionId[])[i]);
    await page.locator('.option', { hasText: option?.text ?? '' }).click();
    await page.getByTestId('next').click();
  }
  await expect(page.getByTestId('banner')).toHaveText('Nicht abgenommen');
  await expect(page.getByTestId('banner-stars')).toHaveCount(0);
  await skipSequence(page);
  await expect(page.getByTestId('not-accepted')).toHaveText('Nicht abgenommen');

  await expect(screen(page, 'result')).toHaveAttribute('data-outcome', 'rejected');
  await expect(page.getByTestId('rejected-reason')).toContainText('nötig sind 11');
  await expect(gauge(page, 'budget')).toHaveAttribute('data-value', String(expected.gauges.budget));
  await page.getByTestId('to-city').click();
  await expect(page.getByTestId('level-1')).toContainText('Offen');
  await expect(page.getByTestId('start-level-2')).toHaveCount(0);
});

test('continues at the same place after a reload in the middle of a level', async ({ page }) => {
  await page.goto(SIMPLE);
  await startLevel1(page);
  await throughBriefingAndTheory(page);
  await choose(page, 'gut');
  await page.getByTestId('next').click();
  await choose(page, 'vertretbar');
  await page.getByTestId('next').click();

  const situation = await screen(page, 'situation').getAttribute('data-situation');
  const options = await page.locator('.option-text').allTextContents();
  const values = await page
    .getByTestId('hud')
    .locator('[data-value]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-value')));

  await page.reload();

  await expect(screen(page, 'situation')).toHaveAttribute('data-situation', situation ?? '');
  await expect(screen(page, 'situation')).toContainText(`Situation 3 von ${STEPS}`);
  expect(await page.locator('.option-text').allTextContents()).toEqual(options);
  expect(
    await page
      .getByTestId('hud')
      .locator('[data-value]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-value'))),
  ).toEqual(values);
});

test('starts cleanly with a hint if the stored progress is damaged', async ({ page }) => {
  await page.goto(SIMPLE);
  await page.evaluate(() => {
    window.localStorage.setItem(
      'risk-tower.progress',
      '{"version":2,"levels":"<img onerror=alert(1)>"',
    );
  });
  await page.reload();
  await expect(screen(page, 'city')).toBeVisible();
  await expect(page.getByTestId('notices')).toContainText('beschädigt');
  await startLevel1(page);

  // A stored state of the right shape but with impossible values is rejected as well.
  await page.evaluate(() => {
    window.localStorage.setItem(
      'risk-tower.progress',
      JSON.stringify({ version: 2, levels: {}, currentRun: { levelId: 'level-1' }, playTimeMs: 0 }),
    );
  });
  await page.reload();
  await expect(page.getByTestId('notices')).toContainText('beschädigt');
});

test('shows the hint about a damaged progress exactly once (A4)', async ({ page }) => {
  await page.goto(SIMPLE);
  await page.evaluate(() => window.localStorage.setItem('risk-tower.progress', 'kaputt'));
  await page.reload();
  await expect(page.getByTestId('notices')).toContainText('beschädigt');
  await page.reload();
  await expect(screen(page, 'city')).toBeVisible();
  await expect(page.getByTestId('notices')).toHaveCount(0);
});

for (const width of [360, 390, 430]) {
  for (const mode of ['/', SIMPLE]) {
    test(`keeps menu button and all three gauges inside a ${width}px window (${mode}) (A5)`, async ({
      page,
    }) => {
      // The 3D view renders in software on CI machines; that alone can take most of the default time.
      if (mode === '/') test.slow();
      await page.setViewportSize({ width, height: 800 });
      await page.goto(mode);
      await startLevel1(page);
      await throughBriefingAndTheory(page);
      // Feedback after a risky choice shows the longest gauge texts: value, change and «kritisch».
      for (let i = 0; i < 2; i++) {
        await choose(page, 'riskant');
        if (i === 0) await page.getByTestId('next').click();
      }
      const boxes = [
        page.getByTestId('menu'),
        gauge(page, 'budget'),
        gauge(page, 'zeit'),
        gauge(page, 'stabilitaet'),
      ];
      for (const locator of boxes) {
        const box = await locator.boundingBox();
        if (!box) throw new Error('Element not rendered');
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      // The box may fit while its text spills out of it; that is what was seen on the phone.
      const spilling = await page
        .locator('[data-testid^="gauge-"], [data-testid="menu"]')
        .evaluateAll((nodes) =>
          nodes.filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent),
        );
      expect(spilling).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    });
  }
}

test('shows the error report and copies it to the clipboard', async ({ page }) => {
  await page.goto(SIMPLE);
  await startLevel1(page);
  await throughBriefingAndTheory(page);
  await choose(page, 'gut');

  await page.getByTestId('menu').click();
  const report = page.getByTestId('report');
  await expect(report).toBeVisible();
  const text = await report.inputValue();
  expect(text).toContain('Risk Tower Fehlerbericht');
  expect(text).toMatch(/Version: \d+\.\d+\.\d+ \(\w+\)/);
  expect(text).toContain('Grafikmodus: none');
  expect(text).toMatch(/REPLAY: \{"levelId":"level-1","seed":\d+/);
  expect(text).toContain('choice.made');

  await page.getByTestId('copy-report').click();
  await expect(page.getByTestId('copy-status')).toContainText('Zwischenablage');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);

  await page.getByTestId('menu-back').click();
  await expect(screen(page, 'feedback')).toBeVisible();
});

test('is playable with the keyboard alone', async ({ page }) => {
  await page.goto(SIMPLE);
  await page.keyboard.press('Enter');
  await expect(screen(page, 'briefing')).toBeVisible();
  for (let i = 0; i <= level1.theorie.length; i++) await page.keyboard.press('Enter');
  await expect(screen(page, 'situation')).toBeVisible();

  const second = await page.getByTestId('option-2').locator('.option-text').textContent();
  await page.keyboard.press('2');
  await expect(screen(page, 'feedback')).toBeVisible();
  await expect(page.locator('.chosen')).toHaveText(second ?? '');
  await page.keyboard.press('Enter');
  await expect(screen(page, 'situation')).toContainText(`Situation 2 von ${STEPS}`);

  // Tab reaches the options, and Enter on a focused button must not fire twice.
  await page.getByTestId('option-1').focus();
  await page.keyboard.press('Enter');
  await expect(screen(page, 'feedback')).toBeVisible();
  await expect(screen(page, 'feedback')).toContainText(`Situation 2 von ${STEPS}`);
});

test('deletes the progress only after a confirmation', async ({ page }) => {
  await page.goto(SIMPLE);
  await startLevel1(page);
  await page.getByTestId('menu').click();
  await page.getByTestId('reset').click();
  await page.getByTestId('reset-no').click();
  await expect(screen(page, 'menu')).toBeVisible();

  await page.getByTestId('reset').click();
  await page.getByTestId('reset-yes').click();
  await expect(screen(page, 'city')).toBeVisible();
  await expect(page.getByTestId('notices')).toContainText('gelöscht');
  expect(await page.evaluate(() => window.localStorage.getItem('risk-tower.progress'))).toBeNull();
});

test('shows an error page with the report instead of a white page', async ({ page }) => {
  page.removeAllListeners('pageerror');
  await page.goto(SIMPLE);
  await expect(screen(page, 'city')).toBeVisible();
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('Simulated crash');
    }, 0);
  });
  await expect(screen(page, 'error')).toBeVisible();
  await expect(page.getByTestId('copy-report')).toBeVisible();
  expect(await page.getByTestId('report').inputValue()).toContain('Simulated crash');
  await expect(page.getByTestId('reload')).toBeVisible();
});

test('renders the 3D view without errors and stays playable', async ({ page }) => {
  test.slow();
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-renderer', '3d');
  await expect(page.locator('.canvas-host canvas')).toBeVisible();
  await startLevel1(page);
  await throughBriefingAndTheory(page);
  await choose(page, 'riskant');
  await page.getByTestId('next').click();
  await expect(screen(page, 'situation')).toContainText(`Situation 2 von ${STEPS}`);
  await expect(screen(page, 'error')).toHaveCount(0);
});

test('uses the whole window: panel at the side when wide, at the bottom when tall', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const size = page.viewportSize();
  if (!size) throw new Error('No viewport');
  const canvas = await page.locator('.canvas-host canvas').boundingBox();
  const panel = await page.locator('.panel').boundingBox();
  if (!canvas || !panel) throw new Error('Layout not found');
  expect(canvas.width).toBe(size.width);
  expect(canvas.height).toBe(size.height);
  if (testInfo.project.name === 'laptop') {
    expect(panel.x).toBeGreaterThan(size.width / 2);
    expect(panel.height).toBeGreaterThan(size.height * 0.9);
  } else {
    expect(panel.y).toBeGreaterThan(size.height * 0.35);
    expect(panel.width).toBeGreaterThan(size.width * 0.9);
  }
});

test('shows the debug overlay only with ?debug=1 and lets it jump to a locked level (A7)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('debug')).toHaveCount(0);

  test.slow();
  await page.goto('/?debug=1');
  const debug = page.getByTestId('debug');
  await expect(debug).toBeVisible();
  await expect(debug).toContainText('Zeichenaufrufe');
  await expect(debug).toContainText('Dreiecke');
  await expect
    .poll(async () => Number(await debug.getAttribute('data-draw-calls')))
    .toBeGreaterThan(0);
  expect(Number(await debug.getAttribute('data-triangles'))).toBeGreaterThan(1000);

  await expect(page.getByTestId('start-level-3')).toHaveCount(0);
  await page.getByTestId('jump-level-3').click();
  await expect(screen(page, 'briefing')).toContainText('Level 3');
  await expect(debug).toHaveAttribute('data-seed', /^\d+$/);
});

test('names the frame rate in the error report (A8)', async ({ page }) => {
  await page.goto(SIMPLE);
  await page.getByTestId('menu').click();
  expect(await page.getByTestId('report').inputValue()).toContain('Bildrate: nicht gemessen');

  await page.goto('/');
  // Two full seconds, so the view has at least one completed second to report.
  await page.waitForTimeout(2200);
  await page.getByTestId('menu').click();
  expect(await page.getByTestId('report').inputValue()).toMatch(
    /Bildrate \(letzte 30 s\): Durchschnitt \d+, Minimum \d+, Qualitätsstufe \d/,
  );
});

test('hides the label «Entwurf» from players and shows it in debug mode (A3)', async ({ page }) => {
  await page.goto(SIMPLE);
  await startLevel1(page);
  await throughBriefingAndTheory(page);
  await expect(page.getByTestId('draft')).toHaveCount(0);

  await page.goto(`${SIMPLE}&debug=1`);
  await expect(screen(page, 'situation')).toBeVisible();
  await expect(page.getByTestId('draft')).toHaveText('Entwurf');
});

test('gives each level its time of day, the start page noon and the finished city evening (G-21)', async ({
  page,
}) => {
  test.slow();
  const host = page.locator('.canvas-host');
  await page.goto('/?quality=1');
  await expect(host).toHaveAttribute('data-time-of-day', 'mittag');

  const times = ['morgen', 'mittag', 'nachmittag', 'abend', 'nacht'];
  for (const [index, time] of times.entries()) {
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key as string, value as string),
      ['risk-tower.progress', JSON.stringify(progressInLevel(index + 1, ['gut']))],
    );
    await page.reload();
    await expect(host).toHaveAttribute('data-time-of-day', time);
  }

  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    ['risk-tower.progress', JSON.stringify(progressWithCompleted(5))],
  );
  await page.reload();
  await expect(host).toHaveAttribute('data-time-of-day', 'abend');
});

test('runs the 3D view with reduced motion: no error, and the decoration stands still (B0.6)', async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?quality=1');
  await expect(page.locator('.canvas-host canvas')).toBeVisible();
  await startLevel1(page);
  await throughBriefingAndTheory(page);
  await choose(page, 'gut');
  await page.getByTestId('next').click();
  await expect(screen(page, 'situation')).toContainText(`Situation 2 von ${STEPS}`);
  await expect(screen(page, 'error')).toHaveCount(0);
  await page.getByTestId('menu').click();
  expect(await page.getByTestId('report').inputValue()).toContain('"reducedMotion":true');
});

interface LastStep {
  progress: Progress;
  /** Text of the option that ends the level in the wanted way. */
  option: string;
}

async function playLastDecision(page: Page, url: string, last: LastStep): Promise<void> {
  await openWith(page, url, last.progress);
  await expect(screen(page, 'situation')).toBeVisible();
  await page.locator('.option', { hasText: last.option }).click();
  await page.getByTestId('next').click();
}

/** A state one decision before the level ends in the wanted way, and the option that does it. */
function oneBefore(wanted: (run: LevelRun) => boolean): LastStep {
  let option = '';
  const progress = progressWhere(1, (run) => {
    if (run.phase !== 'situation') return false;
    const situation = level1.situationen.find((s) => s.id === run.situationIds[run.step]);
    const ending = situation?.optionen.find((candidate) => {
      let after = step(run, level1, { type: 'choose', optionId: candidate.id });
      after = step(after, level1, { type: 'continue' });
      return after.phase === 'result' && wanted(after);
    });
    if (ending) option = ending.text;
    return ending !== undefined;
  });
  return { progress, option };
}

test('shows «Bauabnahme bestanden» with the right number of stars, then the evaluation (B5)', async ({
  page,
}) => {
  const threeStars = oneBefore((run) => run.outcome === 'completed' && starsFor(run) === 3);
  await playLastDecision(page, SIMPLE, threeStars);

  await expect(screen(page, 'sequence')).toHaveAttribute('data-outcome', 'completed');
  await expect(page.getByTestId('banner')).toHaveText('Bauabnahme bestanden');
  await expect(page.getByTestId('banner')).toBeFocused();
  await expect(page.getByTestId('banner-stars')).toHaveAttribute('data-stars', '3');

  // Nothing holds the player up for more than four seconds: the evaluation comes by itself.
  await expect(screen(page, 'result')).toBeVisible({ timeout: 4500 });
  await expect(page.getByTestId('accepted')).toHaveText('Bauabnahme bestanden');
  await expect(page.getByTestId('stars')).toHaveAttribute('data-stars', '3');
});

for (const [how, act] of [
  ['Enter', (page: Page) => page.keyboard.press('Enter')],
  ['Escape', (page: Page) => page.keyboard.press('Escape')],
  ['a click', (page: Page) => page.getByTestId('skip').click()],
] as const) {
  test(`lets the sequence after a level be skipped with ${how} (B0.5)`, async ({ page }) => {
    await playLastDecision(
      page,
      SIMPLE,
      oneBefore((run) => run.outcome === 'completed'),
    );
    await expect(screen(page, 'sequence')).toBeVisible();
    await act(page);
    await expect(screen(page, 'result')).toBeVisible({ timeout: 600 });
  });
}

test('shows «Baustopp» after a collapse and tapes off a building that was not accepted, in 3D too (B5)', async ({
  page,
}) => {
  test.slow();
  await playLastDecision(
    page,
    '/?quality=1',
    oneBefore((run) => run.outcome === 'collapsed'),
  );
  await expect(page.getByTestId('banner')).toHaveText('Baustopp');
  await skipSequence(page);
  await expect(screen(page, 'result')).toHaveAttribute('data-outcome', 'collapsed');
  await expect(screen(page, 'error')).toHaveCount(0);
});

test('shows the final picture at once with reduced motion (B0.6)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await playLastDecision(
    page,
    SIMPLE,
    oneBefore((run) => run.outcome === 'completed'),
  );
  // No staging and nothing to skip: the evaluation is there within a moment.
  await expect(screen(page, 'result')).toBeVisible({ timeout: 1200 });
  await expect(page.getByTestId('accepted')).toBeVisible();
});

test('ignores invalid URL parameters', async ({ page }) => {
  await page.goto('/?renderer=<script>&seed=abc');
  await expect(screen(page, 'city')).toBeVisible();
  await expect(screen(page, 'error')).toHaveCount(0);
});
