/**
 * Every number that shapes the balance lives here and nowhere else (CLAUDE.md, rule 5).
 * Values are starting points from REQUIREMENTS.md chapter 4.2 and are meant to be tuned.
 */
export const BALANCE = {
  gauge: {
    min: 0,
    max: 100,
    start: 60,
    /** Below this a gauge counts as critical: the label says so and the site shows a warning sign. */
    criticalBelow: 30,
  },

  /** F-203: content states step sizes, this table turns them into points. */
  effectPoints: { klein: 6, mittel: 14, gross: 26 },

  /** F-603: points per rating, basis for stars and learning goals. */
  ratingPoints: { gut: 2, vertretbar: 1, riskant: 0 },

  /**
   * F-211: a building that still stands is only accepted if this share of the possible
   * rating points was reached. This is what stops blind clicking from passing a level.
   */
  acceptance: { minScoreRatio: 0.65 },

  /** F-603: an accepted level always earns one star; these bars earn the second and third. */
  stars: {
    three: { minScoreRatio: 0.9, minGauge: 10 },
    two: { minScoreRatio: 0.8, minGauge: 5 },
  },

  /**
   * What `npm run simulate:balance` demands of every level (F-907, F-909, F-910).
   * Careful play must be rewarded with a building that stands straight, careless play must fail.
   */
  checks: {
    /** F-909: how often a player who picks at random may pass a level, at most. */
    maxRandomPassRate: 0.2,
    randomRuns: 5000,
    randomSeed: 20261123,
    /** Only good options: every gauge ends at least here ... */
    goodMinGauge: 40,
    /** ... and the building leans at most this share of the maximum. */
    goodMaxTilt: 0.1,
    /** Only risky options: the building has collapsed by this decision at the latest. */
    riskyCollapseBy: 5,
    /** Random choice: share of runs that must end in a collapse or a failed inspection. */
    randomFailMin: 0.6,
    randomFailMax: 0.9,
  },

  /** F-602: share of the possible rating points needed for a learning goal to count as reached. */
  goalReachedRatio: 0.75,

  /** F-205: how gauges turn into tilt and wobble. */
  lean: {
    /** The weakest gauge starts to tilt the building below this value. */
    tiltStartsBelow: 60,
    /** Wobble sets in later than tilt, as a warning that collapse is close. */
    wobbleStartsBelow: 45,
    weakestWeight: 0.7,
    imbalanceWeight: 0.3,
    maxTiltDegrees: 11,
    /** Sideways shift of a new floor at full tilt, in floor widths. */
    maxFloorShift: 0.16,
    /** How battered a floor looks, by the rating of the decision that built it (0 = clean, 1 = badly). */
    damage: { gut: 0, vertretbar: 0.4, riskant: 1 },
    /** Which way each gauge pulls the building when it is the weakest (x = right, z = towards the viewer). */
    directions: {
      budget: { x: -1, z: 0 },
      zeit: { x: 1, z: 0 },
      stabilitaet: { x: 0.5, z: 0.866 },
    },
  },
} as const;
