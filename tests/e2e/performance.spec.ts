import { expect, test } from '@playwright/test';
import { TUNING } from '../../src/render/tuning.ts';
import { openWith, progressInLevel, progressWithCompleted } from './support/progress.ts';
import { BASELINE } from './support/performance-baseline.ts';

/**
 * B0, B8.2: draw calls of the three reference scenes stay within the budget, measured on
 * quality step 1 as the brief asks. The numbers come from the debug overlay (renderer.info).
 * Frame rate is not asserted here: a headless browser renders in software and says nothing
 * about a phone.
 */
const SCENES = {
  start: () => progressWithCompleted(0),
  level: () => progressInLevel(1, ['gut', 'gut', 'gut', 'gut', 'gut', 'gut', 'gut', 'gut']),
  finale: () => progressWithCompleted(5),
} as const;

for (const [name, build] of Object.entries(SCENES)) {
  test(`keeps the draw calls of the ${name} scene within the budget`, async ({
    page,
  }, testInfo) => {
    await openWith(page, '/?debug=1&quality=1', build());
    if (name === 'finale') await page.getByTestId('play').click();
    const debug = page.getByTestId('debug');
    await expect
      .poll(async () => Number(await debug.getAttribute('data-draw-calls')))
      .toBeGreaterThan(0);
    // Let the scene settle: the overlay refreshes twice a second.
    await page.waitForTimeout(1200);
    const drawCalls = Number(await debug.getAttribute('data-draw-calls'));
    const triangles = Number(await debug.getAttribute('data-triangles'));
    testInfo.annotations.push({
      type: 'measurement',
      description: `${name}: ${drawCalls} draw calls, ${triangles} triangles`,
    });
    console.log(
      `MEASURE ${testInfo.project.name} ${name} drawCalls=${drawCalls} triangles=${triangles}`,
    );

    const limit = Math.floor(
      BASELINE[name as keyof typeof BASELINE].drawCalls * TUNING.budget.drawCallFactor,
    );
    expect(drawCalls).toBeLessThanOrEqual(limit);
  });
}
