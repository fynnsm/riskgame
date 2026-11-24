/**
 * Every duration and amount of the 3D presentation (B0.9). Nothing here changes a rule
 * of the game; those numbers live in src/core/balance.ts.
 */
export const TUNING = {
  city: {
    /** Blocks from the centre to the edge of the city. */
    reach: 7,
    cars: 26,
  },

  tower: {
    /** Seconds a new floor takes to settle. */
    dropSeconds: 0.45,
    /** Height at which the next module hangs above the tower. */
    hangHeight: 3.4,
    /** Rotation in radians at full wobble. */
    wobbleAmplitude: 0.02,
    collapseGravity: 15,
    collapseMaxSeconds: 12,
  },

  /** B2: haze towards the edge of the city, as distance from the camera along its line of sight. */
  haze: { cameraDistance: 200, near: 236, far: 372 },

  /** B2: share of windows that glow at night. */
  litWindowShare: 0.4,

  camera: {
    /** Higher is snappier; share of the remaining way covered per second, as a rate. */
    easeRate: 4,
    /** How fast light and sky change when the time of day does. */
    lightEaseRate: 1.6,
  },

  quality: {
    /** A sample this long decides whether the quality step drops (N-203). */
    sampleSeconds: 3,
    minFps: 28,
    /** Pixel ratio is capped here (N-205). */
    maxPixelRatio: 2,
    shadowMapSize: 2048,
  },

  /** B0.5: no animation holds up the player longer than this, and each can be skipped. */
  sequence: {
    maxSeconds: 4,
    floorSetSeconds: 1.2,
    starIntervalSeconds: 0.35,
    transitionMs: 200,
  },

  /** B3: purely decorative life, per quality step 0, 1, 2. */
  decoration: {
    clouds: [6, 8, 10],
    planeEverySeconds: { min: 20, max: 40 },
    birds: 7,
    pedestrians: 24,
    chimneys: 8,
  },

  /** B0: limits measured against docs/PERFORMANCE.md. */
  budget: {
    drawCallFactor: 1.5,
    extraTransferKb: 80,
    minFps: 30,
  },
} as const;
