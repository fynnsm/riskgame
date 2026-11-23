/**
 * Every number that shapes the balance lives here and nowhere else (CLAUDE.md, rule 5).
 * Values are starting points from REQUIREMENTS.md chapter 4.2 and are meant to be tuned.
 */
export const BALANCE = {
  gauge: { min: 0, max: 100, start: 70 },

  /** F-203: content states step sizes, this table turns them into points. */
  effectPoints: { klein: 6, mittel: 12, gross: 20 },

  /** F-603: points per rating, basis for stars and learning goals. */
  ratingPoints: { gut: 2, vertretbar: 1, riskant: 0 },

  /** F-603: a level survived always earns one star; these bars earn the second and third. */
  stars: {
    three: { minScoreRatio: 0.8, minGauge: 30 },
    two: { minScoreRatio: 0.5, minGauge: 15 },
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
    /** Which way each gauge pulls the building when it is the weakest (x = right, z = towards the viewer). */
    directions: {
      budget: { x: -1, z: 0 },
      zeit: { x: 1, z: 0 },
      stabilitaet: { x: 0.5, z: 0.866 },
    },
  },
} as const;
