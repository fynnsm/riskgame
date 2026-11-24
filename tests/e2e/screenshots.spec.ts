import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { criticalGauges } from '../../src/core/gauges.ts';
import type { Progress } from '../../src/core/progress.ts';
import { starsFor } from '../../src/core/scoring.ts';
import {
  oneBefore,
  openWith,
  progressInTour,
  progressWhere,
  progressWithCompleted,
} from './support/progress.ts';

/**
 * B8.3: saves pictures of the states a person should look at after every change to the
 * graphics. No pixel comparison; the pictures are uploaded by the CI as an artifact.
 */
const OUT = join(import.meta.dirname, '..', '..', 'test-results', 'screenshots');

function levelStates(nummer: number): [string, () => Progress][] {
  return [
    [
      'vier-stockwerke',
      () => progressWhere(nummer, (r) => r.phase === 'situation' && r.history.length === 4),
    ],
    [
      'kritisch',
      () =>
        progressWhere(
          nummer,
          (r) => r.phase === 'situation' && criticalGauges(r.gauges).length > 0,
        ),
    ],
    [
      'einsturz',
      () => progressWhere(nummer, (r) => r.phase === 'result' && r.outcome === 'collapsed'),
    ],
    [
      'nicht-bestanden',
      () => progressWhere(nummer, (r) => r.phase === 'result' && r.outcome === 'rejected'),
    ],
    ...([1, 2, 3] as const).map((stars): [string, () => Progress] => [
      `bestanden-${stars}-sterne`,
      () =>
        progressWhere(
          nummer,
          (r) => r.phase === 'result' && r.outcome === 'completed' && starsFor(r) === stars,
        ),
    ]),
  ];
}

const STATES: [string, () => Progress][] = [
  ['startseite', () => progressWithCompleted(0)],
  ['level-1-rundgang', () => progressInTour(3)],
  ['level-1-rundgang-aufloesung', () => progressInTour(5, true)],
  ...levelStates(1).map(([name, build]): [string, () => Progress] => [`level-1-${name}`, build]),
  ...levelStates(5).map(([name, build]): [string, () => Progress] => [`level-5-${name}`, build]),
  ['schlussansicht', () => progressWithCompleted(5)],
];

for (const [name, build] of STATES) {
  test(`screenshot: ${name}`, async ({ page }, testInfo) => {
    test.slow();
    await openWith(page, '/?quality=1', build());
    await expect(page.locator('.canvas-host canvas')).toBeVisible();
    // The closing screen is one click away from the start page once every building stands.
    if (name === 'schlussansicht') await page.getByTestId('play').click();
    // Camera and light glide into place; wait until the picture has settled.
    await page.waitForTimeout(2500);
    const directory = join(OUT, testInfo.project.name);
    mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: join(directory, `${name}.png`) });
  });
}

/**
 * N2.6: three pictures of every celebration, half a second, one and a half and two and a half
 * seconds in. A sequence only plays when a level ends, so these runs take the last decision.
 */
const CELEBRATIONS: [string, () => ReturnType<typeof oneBefore>][] = [
  ...([1, 2, 3] as const).map((stars): [string, () => ReturnType<typeof oneBefore>] => [
    `feier-${stars}-sterne`,
    () => oneBefore((run) => run.outcome === 'completed' && starsFor(run) === stars),
  ]),
  ['feier-nicht-abgenommen', () => oneBefore((run) => run.outcome === 'rejected')],
  ['feier-einsturz', () => oneBefore((run) => run.outcome === 'collapsed')],
];

async function threeShots(page: Page, directory: string, name: string): Promise<void> {
  // Waits are measured from the start of the sequence; a screenshot itself takes a moment.
  const started = Date.now();
  for (const at of [500, 1500, 2500]) {
    await page.waitForTimeout(Math.max(0, at - (Date.now() - started)));
    await page.screenshot({ path: join(directory, `${name}-${at}ms.png`) });
  }
}

for (const [name, build] of CELEBRATIONS) {
  test(`screenshots: ${name}`, async ({ page }, testInfo) => {
    test.slow();
    const last = build();
    await openWith(page, '/?quality=1', last.progress);
    await page.locator('.option', { hasText: last.option }).click();
    await page.waitForTimeout(1500);
    const directory = join(OUT, testInfo.project.name);
    mkdirSync(directory, { recursive: true });
    await page.getByTestId('next').click();
    await threeShots(page, directory, name);
  });
}

test('screenshots: feier-schlussbild', async ({ page }, testInfo) => {
  test.slow();
  await openWith(page, '/?quality=1', progressWithCompleted(5));
  await expect(page.getByTestId('play')).toBeVisible();
  const directory = join(OUT, testInfo.project.name);
  mkdirSync(directory, { recursive: true });
  await page.getByTestId('play').click();
  await threeShots(page, directory, 'feier-schlussbild');
});
