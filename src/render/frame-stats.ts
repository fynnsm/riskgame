/**
 * Frame rate over the last seconds, for the debug overlay (L-09) and the error report (L-05).
 * Pure bookkeeping without Three.js, so it can be tested with made-up timestamps.
 */

export interface FrameSnapshot {
  /** Frames in the last full second, or null before one second has passed. */
  current: number | null;
  average: number | null;
  minimum: number | null;
}

export interface FrameStats {
  /** Call once per rendered frame with the time in seconds. */
  frame(seconds: number): void;
  snapshot(): FrameSnapshot;
  /** Call after a pause (hidden tab), so the gap does not read as a frame-rate drop. */
  reset(): void;
}

export function createFrameStats(windowSeconds = 30): FrameStats {
  let buckets: { second: number; frames: number }[] = [];

  return {
    frame(seconds: number): void {
      const second = Math.floor(seconds);
      const last = buckets[buckets.length - 1];
      if (last && last.second === second) {
        last.frames += 1;
        return;
      }
      buckets.push({ second, frames: 1 });
      // One bucket more than the window: the newest is still filling and does not count yet.
      if (buckets.length > windowSeconds + 1) buckets = buckets.slice(-(windowSeconds + 1));
    },

    snapshot(): FrameSnapshot {
      const complete = buckets.slice(0, -1).map((b) => b.frames);
      if (complete.length === 0) return { current: null, average: null, minimum: null };
      const sum = complete.reduce((a, b) => a + b, 0);
      return {
        current: complete[complete.length - 1] ?? null,
        average: Math.round(sum / complete.length),
        minimum: Math.min(...complete),
      };
    },

    reset(): void {
      buckets = [];
    },
  };
}
