import { describe, expect, it } from 'vitest';
import { createFrameStats } from '../../src/render/frame-stats.ts';

/** Feeds `fps` evenly spaced frames for each of the given seconds. */
function feed(stats: ReturnType<typeof createFrameStats>, start: number, rates: number[]): void {
  rates.forEach((fps, i) => {
    for (let f = 0; f < fps; f++) stats.frame(start + i + f / fps);
  });
}

describe('frame statistics (A8, L-09)', () => {
  it('reports nothing before a full second has passed', () => {
    const stats = createFrameStats();
    expect(stats.snapshot()).toEqual({ current: null, average: null, minimum: null });
    feed(stats, 10, [60]);
    expect(stats.snapshot()).toEqual({ current: null, average: null, minimum: null });
  });

  it('reports current, average and minimum over the completed seconds', () => {
    const stats = createFrameStats();
    feed(stats, 10, [60, 30, 45, 5]);
    // The last second is still filling and does not count yet.
    expect(stats.snapshot()).toEqual({ current: 45, average: 45, minimum: 30 });
  });

  it('forgets seconds older than the window', () => {
    const stats = createFrameStats(3);
    feed(stats, 0, [10, 60, 60, 60, 1]);
    expect(stats.snapshot()).toEqual({ current: 60, average: 60, minimum: 60 });
  });

  it('starts over after a reset, so a hidden tab does not count as a drop', () => {
    const stats = createFrameStats();
    feed(stats, 0, [60, 60]);
    stats.reset();
    expect(stats.snapshot().average).toBeNull();
    feed(stats, 500, [50, 50]);
    expect(stats.snapshot()).toEqual({ current: 50, average: 50, minimum: 50 });
  });
});
