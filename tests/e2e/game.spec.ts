import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

type Rating = 'gut' | 'vertretbar' | 'riskant';
interface LevelFile {
  theorie: unknown[];
  situationen: { id: string; optionen: { text: string; einstufung: Rating }[] }[];
}

const level1 = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', '..', 'content', 'levels', 'level-1.json'), 'utf8'),
) as LevelFile;

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
  await expect(gauge(page, 'budget')).toHaveAttribute('data-value', '70');

  for (let i = 0; i < 6; i++) {
    await expect(screen(page, 'situation')).toContainText(`Situation ${i + 1} von 6`);
    await choose(page, 'gut');
    await expect(page.getByTestId('explanation')).not.toBeEmpty();
    await page.getByTestId('next').click();
  }

  await expect(screen(page, 'result')).toHaveAttribute('data-outcome', 'completed');
  await expect(page.getByTestId('stars')).toHaveAttribute('data-stars', '3');
  await expect(page.getByTestId('decisions').locator('li')).toHaveCount(6);
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

  for (let i = 0; i < 6; i++) {
    await choose(page, 'riskant');
    const collapsed =
      (await page.getByTestId('gauge-stabilitaet').getAttribute('data-value')) === '0';
    await page.getByTestId('next').click();
    if (collapsed) break;
  }

  await expect(screen(page, 'result')).toHaveAttribute('data-outcome', 'collapsed');
  await expect(page.getByTestId('collapse-reason')).toContainText('Stabilität');
  await expect(page.getByTestId('causes').locator('li').first()).toContainText('Riskant');

  await page.getByTestId('restart').click();
  await expect(screen(page, 'briefing')).toBeVisible();
  await expect(gauge(page, 'stabilitaet')).toHaveAttribute('data-value', '70');

  await page.getByTestId('menu').click();
  await page.getByTestId('abort').click();
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
  await expect(screen(page, 'situation')).toContainText('Situation 3 von 6');
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
      '{"version":1,"levels":"<img onerror=alert(1)>"',
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
      JSON.stringify({ version: 1, levels: {}, currentRun: { levelId: 'level-1' }, playTimeMs: 0 }),
    );
  });
  await page.reload();
  await expect(page.getByTestId('notices')).toContainText('beschädigt');
});

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
  await expect(screen(page, 'situation')).toContainText('Situation 2 von 6');

  // Tab reaches the options, and Enter on a focused button must not fire twice.
  await page.getByTestId('option-1').focus();
  await page.keyboard.press('Enter');
  await expect(screen(page, 'feedback')).toBeVisible();
  await expect(screen(page, 'feedback')).toContainText('Situation 2 von 6');
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
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-renderer', '3d');
  await expect(page.locator('.canvas-host canvas')).toBeVisible();
  await startLevel1(page);
  await throughBriefingAndTheory(page);
  await choose(page, 'riskant');
  await page.getByTestId('next').click();
  await expect(screen(page, 'situation')).toContainText('Situation 2 von 6');
  await expect(screen(page, 'error')).toHaveCount(0);
});

test('ignores invalid URL parameters', async ({ page }) => {
  await page.goto('/?renderer=<script>&seed=abc');
  await expect(screen(page, 'city')).toBeVisible();
  await expect(screen(page, 'error')).toHaveCount(0);
});
