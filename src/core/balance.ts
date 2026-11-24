/**
 * Every number that shapes the balance lives here and nowhere else (CLAUDE.md, rule 5).
 * Values are starting points from REQUIREMENTS.md chapter 4.2 and are meant to be tuned.
 */
export const BALANCE = {
  gauge: {
    min: 0,
    max: 100,
    start: 76,
    /** Below this a gauge counts as critical: the label says so and the site shows a warning sign. */
    criticalBelow: 30,
  },

  /** F-203: content states step sizes, this table turns them into points. */
  effectPoints: { klein: 6, mittel: 14, gross: 26 },

  /** F-603: points per rating, basis for stars and learning goals. */
  ratingPoints: { gut: 2, vertretbar: 1, riskant: 0 },

  /**
   * F-211, M-26: a building that still stands is only accepted if this share of the possible
   * points was reached, rounded to the nearest whole point. This is what stops blind clicking
   * from passing a level. The share gives 11 of 16 points for a level of decisions alone and
   * grows with the points of the site tour and of the events.
   */
  acceptance: { minScoreRatio: 0.69 },

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

  /**
   * M-10 to M-13: the site tour. Eight places per run: three real risks the AI drone found,
   * two false alarms, two real risks it missed, one place that is no risk and not marked.
   */
  tour: {
    draw: { gefunden: 3, fehlalarm: 2, uebersehen: 2, unauffaellig: 1 },
    /** Correct judgements needed for the better outcomes. */
    goodFrom: 7,
    fairFrom: 5,
    /** Points for the final inspection: good, fair, poor. */
    points: { good: 2, fair: 1, poor: 0 },
    /** M-13: what the tour does to the stability the building starts with. */
    stability: { good: '+klein', fair: '0', poor: '-klein' },
  },

  /** M-20 to M-28: events and the four strategies. */
  events: {
    /** After which decisions an event is announced. */
    afterDecisions: [2, 4, 6],
    probability: { tief: 0.2, mittel: 0.4, hoch: 0.6 },
    /** What «Im Team prüfen» costs, in points of time. */
    verifyCostTime: 3,
    /** Points for a recommended strategy, whatever the outcome. */
    recommendedPoints: 1,
  },

  /** F-205: how gauges turn into tilt and wobble. */
  lean: {
    /** The weakest gauge starts to tilt the building below this value. */
    tiltStartsBelow: 40,
    /** Wobble sets in later than tilt, as a warning that collapse is close. */
    wobbleStartsBelow: 30,
    weakestWeight: 0.85,
    imbalanceWeight: 0.15,
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

/** What the validation of content needs to know of the balance; handed in, never copied. */
export const CONTENT_RULES = {
  effectPoints: BALANCE.effectPoints,
  tourDraw: BALANCE.tour.draw,
  eventRounds: BALANCE.events.afterDecisions.length,
} as const;
