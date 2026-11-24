/**
 * Draw calls before the graphics update, quality step 1 (docs/PERFORMANCE.md).
 * The update may use at most 1.5 times as many.
 */
export const BASELINE = {
  start: { drawCalls: 7 },
  level: { drawCalls: 8 },
  finale: { drawCalls: 12 },
} as const;
