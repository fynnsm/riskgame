import { z } from 'zod';
import { OPTION_IDS, RATINGS } from '../content/schema.ts';
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

export const runSchema = z.strictObject({
  levelId: id,
  seed: z.number().int().min(0).max(0xffffffff),
  recentIds: z.array(id).max(MAX_LIST),
  canSkipTheory: z.boolean(),
  phase: z.enum(['briefing', 'theory', 'situation', 'feedback', 'result']),
  theoryIndex: z.number().int().min(0).max(MAX_LIST),
  situationIds: z.array(id).max(MAX_LIST),
  optionOrders: z.array(z.array(optionId).max(OPTION_IDS.length)).max(MAX_LIST),
  step: z.number().int().min(0).max(MAX_LIST),
  gauges: gaugesSchema,
  history: z.array(choiceSchema).max(MAX_LIST),
  outcome: z.enum(['running', 'completed', 'collapsed']),
});

const bestSchema = z.strictObject({
  stars: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  gauges: gaugesSchema,
  gaugeHistory: z.array(gaugesSchema).max(MAX_LIST),
  goalsReached: z.array(id).max(MAX_LIST),
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
