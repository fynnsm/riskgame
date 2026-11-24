import { z } from 'zod';
import { OPTION_IDS, RATINGS, STRATEGY_IDS } from '../content/schema.ts';
import { BALANCE } from '../core/balance.ts';
import { PROGRESS_VERSION } from '../core/progress.ts';

const gaugeValue = z.number().min(BALANCE.gauge.min).max(BALANCE.gauge.max);
const gaugesSchema = z.strictObject({
  budget: gaugeValue,
  zeit: gaugeValue,
  stabilitaet: gaugeValue,
});
// Deltas are differences between two gauge values, so they may be negative.
const deltaValue = z.number().min(-BALANCE.gauge.max).max(BALANCE.gauge.max);
const deltaSchema = z.strictObject({
  budget: deltaValue,
  zeit: deltaValue,
  stabilitaet: deltaValue,
});

const id = z.string().min(1).max(40);
const optionId = z.enum(OPTION_IDS);
const MAX_LIST = 200;

const choiceSchema = z.strictObject({
  situationId: id,
  optionId,
  rating: z.enum(RATINGS),
  delta: deltaSchema,
  gaugesAfter: gaugesSchema,
});

const tourSchema = z.strictObject({
  siteIds: z.array(id).max(MAX_LIST),
  judgements: z.record(id, z.boolean()),
  result: z
    .strictObject({
      correct: z.number().int().min(0).max(MAX_LIST),
      grade: z.enum(['good', 'fair', 'poor']),
      points: z.number().int().min(0).max(MAX_LIST),
      delta: deltaSchema,
    })
    .nullable(),
});

const eventRoundSchema = z.strictObject({
  eventId: id,
  occurs: z.boolean(),
  verified: z.boolean(),
  strategy: z.enum(STRATEGY_IDS).nullable(),
  cost: deltaSchema.nullable(),
  resolution: z
    .strictObject({ occurred: z.boolean(), delta: deltaSchema, gaugesAfter: gaugesSchema })
    .nullable(),
});

export const runSchema = z.strictObject({
  levelId: id,
  seed: z.number().int().min(0).max(0xffffffff),
  recentIds: z.array(id).max(MAX_LIST),
  canSkipTheory: z.boolean(),
  phase: z.enum([
    'briefing',
    'theory',
    'tour',
    'tourResult',
    'situation',
    'feedback',
    'event',
    'eventResult',
    'result',
  ]),
  theoryIndex: z.number().int().min(0).max(MAX_LIST),
  situationIds: z.array(id).max(MAX_LIST),
  optionOrders: z.array(z.array(optionId).max(OPTION_IDS.length)).max(MAX_LIST),
  step: z.number().int().min(0).max(MAX_LIST),
  gauges: gaugesSchema,
  history: z.array(choiceSchema).max(MAX_LIST),
  outcome: z.enum(['running', 'completed', 'collapsed', 'rejected']),
  tour: tourSchema.nullable(),
  events: z.array(eventRoundSchema).max(MAX_LIST).nullable(),
  eventPoints: z.number().int().min(0).max(MAX_LIST),
});

const bestSchema = z.strictObject({
  stars: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  gauges: gaugesSchema,
  floors: z.array(z.strictObject({ gauges: gaugesSchema, rating: z.enum(RATINGS) })).max(MAX_LIST),
  goalsReached: z.array(id).max(MAX_LIST),
  // Buildings finished before the events existed have no measures; they load as they are.
  measures: z
    .array(
      z.strictObject({
        floor: z.number().int().min(0).max(MAX_LIST),
        strategy: z.enum(['vermeiden', 'vermindern', 'uebertragen']),
      }),
    )
    .max(MAX_LIST)
    .default([]),
});

const levelProgressSchema = z.strictObject({
  completed: z.boolean(),
  theorySeen: z.boolean(),
  attempts: z.number().int().min(0),
  best: bestSchema.nullable(),
  recentIds: z.array(id).max(MAX_LIST),
});

export const progressSchema = z.strictObject({
  version: z.literal(PROGRESS_VERSION),
  levels: z.record(id, levelProgressSchema),
  currentRun: runSchema.nullable(),
  playTimeMs: z.number().min(0),
});
