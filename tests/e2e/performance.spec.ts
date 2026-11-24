import { expect, test } from '@playwright/test';
import { TUNING } from '../../src/render/tuning.ts';
import { BASELINE } from './support/performance-baseline.ts';
import {
  openWith,
  progressAtEvent,
  progressInLevel,
  progressInTour,
  progressWithCompleted,
} from './support/progress.ts';

/**
 * B0, N1: draw calls and triangles of the three reference scenes stay within their budgets.
 * The numbers come from the debug overlay (renderer.info). Frame rate is not asserted here:
 * a headless browser renders in software and says nothing about a phone.
 */
const SCENES = {
  start: () => progressWithCompleted(0),
  level: () => progressInLevel(1, ['gut', 'gut', 'gut', 'gut', 'gut', 'gut', 'gut', 'gut']),
  finale: () => progressWithCompleted(5),
  // M-15: the site tour with its props, pins and drone; it must cost no more than a level.
  tour: () => progressInTour(0),
  // M-28: an event that hangs over the site; drawn with the lot, like the tour.
  event: () => progressAtEvent(3, 'L3-E01', true),
} as const;

/** Which baseline each scene is held against. */
const BASELINE_OF: Record<keyof typeof SCENES, keyof typeof BASELINE> = {
  start: 'start',
  level: 'level',
  finale: 'finale',
  tour: 'level',
  event: 'level',
};

for (const quality of [0, 1, 2] as const) {
  for (const [name, build] of Object.entries(SCENES)) {
    test(`keeps the ${name} scene within its budget on quality step ${quality}`, async ({
      page,
    }, testInfo) => {
      test.slow();
      await openWith(page, `/?debug=1&quality=${quality}`, build());
      if (name === 'finale') await page.getByTestId('play').click();
      const debug = page.getByTestId('debug');
      await expect
        .poll(async () => Number(await debug.getAttribute('data-draw-calls')))
        .toBeGreaterThan(0);
      // Let the scene settle: the overlay refreshes twice a second.
      await page.waitForTimeout(1200);
      const drawCalls = Number(await debug.getAttribute('data-draw-calls'));
      const triangles = Number(await debug.getAttribute('data-triangles'));
      console.log(
        `MEASURE ${testInfo.project.name} q${quality} ${name} drawCalls=${drawCalls} triangles=${triangles}`,
      );

      const limit = TUNING.budget.triangles[quality];
      if (limit !== null) expect(triangles).toBeLessThanOrEqual(limit);
      // The draw-call budget was set against the baseline on step 1.
      if (quality === 1) {
        const calls = BASELINE[BASELINE_OF[name as keyof typeof SCENES]].drawCalls;
        expect(drawCalls).toBeLessThanOrEqual(Math.floor(calls * TUNING.budget.drawCallFactor));
      }
    });
  }
}
