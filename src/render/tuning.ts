/**
 * Every duration and amount of the 3D presentation (B0.9). Nothing here changes a rule
 * of the game; those numbers live in src/core/balance.ts.
 */
export const TUNING = {
  city: {
    /**
     * Blocks from the centre to the edge of the city, per quality step 0, 1, 2 (N1).
     * A smaller city is the main lever on the number of triangles.
     */
    reach: [4, 5, 7],
    /** Street lamps and shadow patches only stand within this many blocks of the centre, per step. */
    detailReach: [2, 3, 7],
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
    /** Delay between one floor starting to fall and the one below it (G-45). */
    collapseStagger: 0.12,
    /** After landing, the new floor gives way a little and comes back (G-41). */
    bounceSeconds: 0.25,
    dustSeconds: 0.5,
    /** How fast the lean follows a change of the gauges; no jumping between states (G-43). */
    tiltEaseRate: 5,
    roofSeconds: 0.6,
    shakeSeconds: 0.6,
    shakeAmplitude: 0.35,
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
    /** A frame slower than this is followed by a pause of the same length, at most the second value. */
    /** Longest step of the scene's clock for one frame. */
    maxFrameSeconds: 0.5,
    slowFrameMs: 50,
    maxBreatherMs: 250,
    /** Pixel ratio is capped here (N-205). */
    maxPixelRatio: 2,
    shadowMapSize: 2048,
  },

  /** B3: one shared signal for all crossings keeps vehicles from driving into each other. */
  traffic: {
    greenSeconds: 7,
    allRedSeconds: 1,
    laneOffset: 0.95,
    /** Distance of the stop line from the centre of a crossing. */
    stopBefore: 2.4,
    minGap: 1.2,
    braking: 7,
    acceleration: 4,
    perLane: 2,
    /** Longest step the traffic rules are walked in; longer frames are split. */
    maxStepSeconds: 0.05,
    cruise: { auto: 5, lieferwagen: 4.2, bus: 3.6, tram: 3.8 },
  },

  /** B0.5: no animation holds up the player longer than this, and each can be skipped. */
  sequence: {
    maxSeconds: 4,
    floorSetSeconds: 1.2,
    starIntervalSeconds: 0.35,
    /** The camera swings past the building and back in this time. */
    panSeconds: 1.2,
    transitionMs: 200,
  },

  /** B5: the closing view after all five levels. */
  finale: {
    /** The camera flies past the five buildings in this time. */
    flightSeconds: 9,
    /** Evening turns into night halfway through this time. */
    duskSeconds: 10,
    fireworkSparks: 48,
  },

  /** B5: the start page drifts slowly along the row of lots. */
  start: { driftSeconds: 46, driftDistance: 10 },

  /** B3: purely decorative life, per quality step 0, 1, 2. */
  decoration: {
    clouds: [6, 8, 10],
    /** Clouds fade out near the building in focus, so they never cover it. */
    cloud: { hideWithin: 13, fullBeyond: 22, heights: [17, 23], speed: 0.55, range: 150 },
    plane: { clearance: 24, spread: 22, height: 27, seconds: 16, range: 190 },
    shadowOpacity: 0.14,
    planeEverySeconds: { min: 20, max: 40 },
    birds: 7,
    pedestrians: 24,
    chimneys: 8,
  },

  /** B0: limits measured against docs/PERFORMANCE.md. */
  budget: {
    drawCallFactor: 1.5,
    /** N1: most triangles a scene may draw, per quality step 0, 1, 2. Step 2 is for strong devices and has no limit. */
    triangles: [80_000, 150_000, null],
    extraTransferKb: 80,
    minFps: 30,
  },
} as const;
