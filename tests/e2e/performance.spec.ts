import { expect, test } from '@playwright/test';
import { TUNING } from '../../src/render/tuning.ts';
import { BASELINE } from './support/performance-baseline.ts';
import { openWith, progressInLevel, progressWithCompleted } from './support/progress.ts';

/**
 * B0, N1: draw calls and triangles of the three reference scenes stay within their budgets.
 * The numbers come from the debug overlay (renderer.info). Frame rate is not asserted here:
 * a headless browser renders in software and says nothing about a phone.
 */
const SCENES = {
  start: () => progressWithCompleted(0),
  level: () => progressInLevel(1, ['gut', 'gut', 'gut', 'gut', 'gut', 'gut', 'gut', 'gut']),
  finale: () => progressWithCompleted(5),
} as const;

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
        const calls = BASELINE[name as keyof typeof BASELINE].drawCalls;
        expect(drawCalls).toBeLessThanOrEqual(Math.floor(calls * TUNING.budget.drawCallFactor));
      }
    });
  }
}
