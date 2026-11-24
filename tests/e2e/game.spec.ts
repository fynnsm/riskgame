import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import type { Level, OptionId } from '../../src/content/schema.ts';
import { replay } from '../../src/core/game.ts';
import { criticalGauges } from '../../src/core/gauges.ts';
import { starsFor } from '../../src/core/scoring.ts';
import type { LastStep } from './support/progress.ts';
import {
  longestSituation,
  oneBefore,
  openWith,
  progressAtSituation,
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
      '{"version":3,"levels":"<img onerror=alert(1)>"',
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
      JSON.stringify({
        version: 3,
        levels: { 'level-1': 'kaputt' },
        currentRun: null,
        playTimeMs: 0,
      }),
    );
  });
  await page.reload();
  await expect(page.getByTestId('notices')).toContainText('beschädigt');
});

test('carries finished levels over from the version before update 3 and says so once', async ({
  page,
}) => {
  // A real state as version 2 wrote it: two finished levels, a third in play.
  const old = readFileSync(
    join(import.meta.dirname, '..', 'unit', 'data', 'progress-v2.json'),
    'utf8',
  );
  await page.goto(SIMPLE);
  await page.evaluate((value) => window.localStorage.setItem('risk-tower.progress', value), old);
  await page.reload();
  await expect(screen(page, 'city')).toBeVisible();
  await expect(page.getByTestId('notices')).toContainText(
    'abgeschlossene Level und Sterne sind erhalten',
  );
  await expect(page.getByTestId('level-1')).toContainText('Abgeschlossen');
  await expect(page.getByTestId('level-2')).toContainText('Abgeschlossen');
  await expect(page.getByTestId('start-level-3')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('notices')).toHaveCount(0);
  await expect(page.getByTestId('level-2')).toContainText('Abgeschlossen');
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

test('gives each level its time of day and keeps the start page at noon (G-21)', async ({
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
});

test('opens the closing screen with its title, turns evening into night and saves a picture (G-53, G-54)', async ({
  page,
}) => {
  test.slow();
  await openWith(page, '/?quality=1', progressWithCompleted(5));
  // The start page stays at noon, also when every building stands.
  await expect(page.locator('.canvas-host')).toHaveAttribute('data-time-of-day', 'mittag');
  await expect(page.getByTestId('intro')).toHaveCount(0);
  await expect(page.getByTestId('play')).toHaveText('Schlussbild ansehen');
  await page.getByTestId('play').click();

  await expect(screen(page, 'finale')).toBeVisible();
  await expect(page.getByTestId('finale-title')).toHaveText('Goldene Stadt');
  await expect(page.getByTestId('finale-title')).toBeFocused();
  await expect(page.getByTestId('summary')).toContainText('15 von 15 Sternen');
  await expect(page.locator('.canvas-host')).toHaveAttribute('data-time-of-day', 'abend');
  // Night falls five seconds in; the generous limit is for machines that draw very slowly.
  await expect(page.locator('.canvas-host')).toHaveAttribute('data-time-of-day', 'nacht', {
    timeout: 45_000,
  });

  const download = page.waitForEvent('download');
  await page.getByTestId('save-picture').click();
  expect((await download).suggestedFilename()).toBe('risk-tower-stadt.png');
  await expect(page.getByTestId('save-status')).toContainText('gespeichert');

  // Looking at the city: the interface steps aside, arrow keys turn the camera, Escape returns.
  await page.getByTestId('look').click();
  await expect(screen(page, 'look')).toBeVisible();
  await expect(page.getByTestId('menu')).toBeHidden();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Escape');
  await expect(screen(page, 'finale')).toBeVisible();

  await page.getByTestId('again').click();
  await expect(screen(page, 'city')).toBeVisible();
  await expect(screen(page, 'error')).toHaveCount(0);
});

for (const [stars, title, ratings] of [
  [15, 'Goldene Stadt', ['gut', 'gut', 'gut', 'gut', 'gut', 'gut', 'gut', 'gut']],
  [
    10,
    'Stadt mit Baustellen',
    ['gut', 'gut', 'gut', 'gut', 'gut', 'vertretbar', 'vertretbar', 'vertretbar'],
  ],
] as const) {
  test(`shows the closing screen as text without 3D: «${title}» (G-06)`, async ({ page }) => {
    const progress = progressWithCompleted(5, ratings);
    const total = Object.values(progress.levels).reduce((sum, l) => sum + (l.best?.stars ?? 0), 0);
    expect(total).toBe(stars);
    await openWith(page, SIMPLE, progress);
    await page.getByTestId('play').click();
    await expect(page.getByTestId('finale-title')).toHaveText(title);
    await expect(page.getByTestId('summary')).toContainText(`${stars} von 15 Sternen`);
    // Nothing to look at and nothing to save without a picture.
    await expect(page.getByTestId('look')).toHaveCount(0);
    await expect(page.getByTestId('save-picture')).toHaveCount(0);
    await expect(page.getByTestId('again')).toBeVisible();
  });
}

test('leads from the last building straight to the closing screen (G-53)', async ({ page }) => {
  await playLastDecision(
    page,
    SIMPLE,
    oneBefore((run) => run.outcome === 'completed', 5),
  );
  await skipSequence(page);
  await page.getByTestId('to-city').click();
  await expect(screen(page, 'finale')).toBeVisible();
  await expect(page.getByTestId('finale-title')).toBeVisible();
});

test('offers one main button on the start page and drops the introduction once something is built (G-55)', async ({
  page,
}) => {
  await page.goto(SIMPLE);
  await expect(page.getByTestId('play')).toHaveText('Spielen');
  await expect(page.getByTestId('intro')).toBeVisible();
  await page.getByTestId('play').click();
  await expect(screen(page, 'briefing')).toContainText('Level 1');
  // «Weiterspielen» once the player has got as far as the first situation.
  await throughBriefingAndTheory(page);

  await page.getByTestId('menu').click();
  await page.getByTestId('abort').click();
  await expect(page.getByTestId('play')).toHaveText('Weiterspielen');

  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    ['risk-tower.progress', JSON.stringify(progressWithCompleted(1))],
  );
  await page.reload();
  await expect(page.getByTestId('intro')).toHaveCount(0);
  await page.getByTestId('play').click();
  await expect(screen(page, 'briefing')).toContainText('Level 2');
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

async function playLastDecision(page: Page, url: string, last: LastStep): Promise<void> {
  await openWith(page, url, last.progress);
  await expect(screen(page, 'situation')).toBeVisible();
  await page.locator('.option', { hasText: last.option }).click();
  await page.getByTestId('next').click();
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
  // N2: the banner comes before the button in the page, not after it.
  const order = await page
    .locator('[data-screen="sequence"]')
    .evaluate((node) =>
      [...node.querySelectorAll('[data-testid]')].map((n) => n.getAttribute('data-testid')),
    );
  expect(order.indexOf('banner')).toBeLessThan(order.indexOf('skip'));

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

/** What the page itself saw of a celebration, with its own clock. */
interface CelebrationRecord {
  clickAt: number;
  bannerAt: number;
  background: string;
  row: { x: number; width: number; height: number } | null;
  starsAt: number;
}

test('celebrates in the picture: banner at once, large stars within two seconds, no text panel (N2)', async ({
  page,
}) => {
  test.slow();
  const size = page.viewportSize();
  if (!size) throw new Error('No viewport');
  const last = oneBefore((run) => run.outcome === 'completed' && starsFor(run) === 3);
  await openWith(page, '/?quality=0', last.progress);
  await expect(screen(page, 'situation')).toBeVisible();
  await page.locator('.option', { hasText: last.option }).click();
  await expect(screen(page, 'feedback')).toBeVisible();

  // The sequence lasts four seconds. Asking the page question by question from outside loses
  // that race on a machine that draws 3D in software: every answer waits for a slow frame.
  // So the page watches itself, and the test reads what it saw once the stars are there.
  await page.evaluate(() => {
    const record: CelebrationRecord = {
      clickAt: 0,
      bannerAt: 0,
      background: '',
      row: null,
      starsAt: 0,
    };
    (window as unknown as { celebration: CelebrationRecord }).celebration = record;
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('[data-testid="next"]')) record.clickAt = performance.now();
      },
      true,
    );
    const timer = window.setInterval(() => {
      const banner = document.querySelector('[data-testid="banner"]');
      const panel = document.querySelector('.panel');
      if (record.bannerAt === 0 && banner && panel && banner.getBoundingClientRect().height > 0) {
        record.bannerAt = performance.now();
        record.background = getComputedStyle(panel).backgroundColor;
        const row = document.querySelector('[data-testid="banner-stars"]')?.getBoundingClientRect();
        record.row = row ? { x: row.x, width: row.width, height: row.height } : null;
      }
      const stars = [...document.querySelectorAll('.banner-star-on')];
      const arrived =
        stars.length === 3 && stars.every((star) => Number(getComputedStyle(star).opacity) > 0.9);
      if (record.bannerAt > 0 && arrived) {
        record.starsAt = performance.now();
        window.clearInterval(timer);
      }
    }, 30);
  });
  await page.getByTestId('next').click();
  const handle = await page.waitForFunction(
    () => {
      const record = (window as unknown as { celebration: CelebrationRecord }).celebration;
      return record.starsAt > 0 ? record : null;
    },
    undefined,
    { timeout: 20_000 },
  );
  const seen = (await handle.jsonValue()) as CelebrationRecord;

  // The banner is there at once.
  expect(seen.bannerAt - seen.clickAt).toBeLessThanOrEqual(1500);
  // The text panel is out of the way: nothing of it covers the picture.
  expect(seen.background).toBe('rgba(0, 0, 0, 0)');
  // Large and in the middle of the picture, not small inside a text field.
  if (!seen.row) throw new Error('Stars not rendered');
  expect(seen.row.height).toBeGreaterThan(56);
  expect(Math.abs(seen.row.x + seen.row.width / 2 - size.width / 2)).toBeLessThan(
    size.width * 0.12,
  );
  // All three stars have arrived two seconds in; a little room for a slow machine.
  expect(seen.starsAt - seen.bannerAt).toBeLessThanOrEqual(3200);
});

test('rains confetti across the whole width for two stars and none for three (N2)', async ({
  page,
}) => {
  test.slow();
  const size = page.viewportSize();
  if (!size) throw new Error('No viewport');
  await playLastDecision(
    page,
    '/?quality=0',
    oneBefore((run) => run.outcome === 'completed' && starsFor(run) === 2),
  );
  const pieces = page.locator('.confetti-piece');
  await expect(pieces).toHaveCount(60);
  const lefts = await pieces.evaluateAll((nodes) =>
    nodes.map((n) => n.getBoundingClientRect().left),
  );
  expect(Math.min(...lefts)).toBeLessThan(size.width * 0.1);
  expect(Math.max(...lefts)).toBeGreaterThan(size.width * 0.9);
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

test('keeps a mute switch in view and remembers the choice (F-802)', async ({ page }) => {
  await page.goto(SIMPLE);
  const mute = page.getByTestId('mute');
  await expect(mute).toBeVisible();
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect(mute).toContainText('Ton: an');
  await expect(mute).toHaveAttribute('aria-label', 'Ton stumm');
  // N6: a loudspeaker as embedded SVG, not a letter that could be read as «close».
  await expect(mute.locator('svg')).toHaveCount(1);

  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await expect(mute).toContainText('Ton: aus');
  await expect(mute).toHaveAttribute('data-muted', 'true');
  await page.reload();
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'true');

  // The switch stays in view inside a level as well.
  await startLevel1(page);
  await expect(page.getByTestId('mute')).toBeVisible();
  // Sound must never break the game: playing on with the switch in either position works.
  await page.getByTestId('mute').click();
  await throughBriefingAndTheory(page);
  await choose(page, 'gut');
  await expect(screen(page, 'error')).toHaveCount(0);
});

test('shows a symbol per gauge and counts to the new value after a choice (G-60)', async ({
  page,
}) => {
  await page.goto(SIMPLE);
  await startLevel1(page);
  await throughBriefingAndTheory(page);
  await expect(page.locator('.gauge-icon')).toHaveCount(3);
  await choose(page, 'riskant');
  const stability = gauge(page, 'stabilitaet');
  const value = await stability.getAttribute('data-value');
  // However the number gets there, it ends on the value the game holds.
  await expect(stability.locator('.gauge-number')).toHaveText(value ?? '');
  await expect(stability.locator('.gauge-delta')).toHaveCount(1);
});

test('lets the text panel be folded away and brought back (G-63, G-64)', async ({ page }) => {
  test.slow();
  await page.goto('/?quality=1');
  const toggle = page.getByTestId('sheet-toggle');
  const panel = page.locator('.panel');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const before = await panel.boundingBox();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveText('Text ausklappen');
  await expect
    .poll(async () => {
      const box = await panel.boundingBox();
      const size = page.viewportSize();
      if (!box || !before || !size) return false;
      // Phone: clearly lower. Laptop: moved out of the window.
      return box.height < before.height * 0.6 || box.x >= size.width;
    })
    .toBe(true);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('play')).toBeVisible();
});

test('has no fold button where there is no picture to uncover', async ({ page }) => {
  await page.goto(SIMPLE);
  await expect(page.getByTestId('sheet-toggle')).toBeHidden();
});

for (const width of [360, 390, 430]) {
  test(`shows gauges of equal height without a broken word at ${width}px (N4)`, async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width, height: 844 });
    // A critical gauge carries the longest text, so that is the state to check.
    const critical = progressWhere(
      1,
      (run) => run.phase === 'situation' && criticalGauges(run.gauges).length > 0,
    );
    await openWith(page, '/?quality=0', critical);
    const gauges = page.locator('[data-testid^="gauge-"]');
    await expect(gauges).toHaveCount(3);

    const boxes = await gauges.evaluateAll((nodes) =>
      nodes.map((n) => ({
        height: Math.round(n.getBoundingClientRect().height),
        clippedX: n.scrollWidth > n.clientWidth + 1,
        clippedY: n.scrollHeight > n.clientHeight + 1,
        label: n.getAttribute('aria-label'),
        // One line of text only: nothing in the gauge is taller than a line and a half.
        lines: [...n.querySelectorAll('.gauge-label, .gauge-value')].map((part) =>
          Math.round(part.getBoundingClientRect().height),
        ),
      })),
    );
    expect(new Set(boxes.map((b) => b.height)).size).toBe(1);
    expect(boxes.every((b) => !b.clippedX && !b.clippedY)).toBe(true);
    expect(boxes.map((b) => b.label)).toEqual(['Budget', 'Zeit', 'Stabilität']);
    for (const box of boxes) for (const line of box.lines) expect(line).toBeLessThan(30);
    // Below 430px the name is there for screen readers only; the value stays visible.
    await expect(gauges.first().locator('.gauge-number')).toBeVisible();
    const nameWidth = await gauges
      .first()
      .locator('.gauge-name')
      .evaluate((n) => n.getBoundingClientRect().width);
    expect(nameWidth).toBeLessThanOrEqual(1);
  });
}

test('lists the levels of the closing screen in two columns, stars flush right (N5)', async ({
  page,
}) => {
  await openWith(page, SIMPLE, progressWithCompleted(5));
  await page.getByTestId('play').click();
  const rows = page.getByTestId('summary-row');
  await expect(rows).toHaveCount(5);
  const layout = await rows.evaluateAll((nodes) =>
    nodes.map((row) => {
      const name = row.querySelector('.summary-name')?.getBoundingClientRect();
      const stars = row.querySelector('.stars')?.getBoundingClientRect();
      return {
        sameLine: name && stars ? Math.abs(name.top - stars.top) < 8 : false,
        right: stars ? Math.round(stars.right) : -1,
        after: name && stars ? stars.left >= name.right - 1 : false,
      };
    }),
  );
  expect(layout.every((row) => row.sameLine && row.after)).toBe(true);
  expect(new Set(layout.map((row) => row.right)).size).toBe(1);
  // The words stay for screen readers.
  await expect(rows.first().locator('.stars-text')).toHaveText(' 3 von 3 Sternen');
});

for (const nummer of [1, 2, 3, 4, 5]) {
  test(`leads to the options with one tap on a phone, level ${nummer} (N7)`, async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 390, height: 844 });
    await openWith(page, '/?quality=0', progressAtSituation(nummer, longestSituation(nummer)));
    await expect(screen(page, 'situation')).toBeVisible();

    // The sheet glides to its height in a fifth of a second; measured once it has arrived.
    // A slow machine otherwise catches the height it starts from.
    const panel = page.locator('.panel');
    const share = async (): Promise<number> => ((await panel.boundingBox())?.height ?? 0) / 844;
    await expect.poll(share).toBeGreaterThan(0.6);
    expect(await share()).toBeLessThanOrEqual(0.66);

    const inView = () =>
      page.getByTestId('option-1').evaluate((option) => {
        const sheet = option.closest('.panel')?.getBoundingClientRect();
        const box = option.getBoundingClientRect();
        return sheet !== undefined && box.top >= sheet.top && box.top < sheet.bottom - 20;
      });
    if (!(await inView())) {
      const hint = page.getByTestId('to-options');
      await expect(hint).toBeVisible();
      await expect(hint).toHaveText('Was tust du? ↓');
      await hint.click();
    }
    await expect.poll(inView).toBe(true);
    // Once the options are in view the hint has done its job.
    await expect(page.getByTestId('to-options')).toBeHidden();
  });
}

test('shows a loading state that needs no script and gives way to the game (N8)', async ({
  page,
}) => {
  await page.route('**/*.js', (route) => route.abort());
  await page.goto(SIMPLE);
  await expect(page.locator('.boot')).toContainText('Risk Tower');
  await expect(page.locator('.boot')).toContainText('Wird geladen');

  await page.unroute('**/*.js');
  await page.reload();
  await expect(screen(page, 'city')).toBeVisible();
  await expect(page.locator('.boot')).toHaveCount(0);
});

test('ignores invalid URL parameters', async ({ page }) => {
  await page.goto('/?renderer=<script>&seed=abc');
  await expect(screen(page, 'city')).toBeVisible();
  await expect(screen(page, 'error')).toHaveCount(0);
});
