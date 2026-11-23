import { z } from 'zod';

export const SCHEMA_VERSION = 1;

export const GAUGE_KEYS = ['budget', 'zeit', 'stabilitaet'] as const;
export const EFFECT_LEVELS = [
  '-gross',
  '-mittel',
  '-klein',
  '0',
  '+klein',
  '+mittel',
  '+gross',
] as const;
export const RATINGS = ['gut', 'vertretbar', 'riskant'] as const;
export const OPTION_IDS = ['A', 'B', 'C'] as const;
export const PROCESS_STEPS = [
  'identifizieren',
  'bewerten',
  'massnahmen',
  'ueberwachen',
  'grenzen',
] as const;
export const BUILDING_KINDS = ['wohnhaus', 'buero', 'schule', 'spital', 'turm'] as const;
export const GRAPHICS = ['risikomatrix', 'prozess', 'strategien', 'register'] as const;
export const STATUSES = ['entwurf', 'freigegeben'] as const;

/** Hosts a video step may embed from. Must match frame-src in the CSP of index.html. */
export const VIDEO_HOST_ALLOWLIST: readonly string[] = [
  'www.youtube-nocookie.com',
  'player.vimeo.com',
];

export const MAX_LENGTH = {
  titel: 60,
  situation: 450,
  prompt: 200,
  antwort: 600,
  optionText: 100,
  erklaerung: 400,
  karteText: 600,
  lernzielText: 160,
  beschreibung: 400,
  transkript: 600,
  levelTitel: 80,
  quelle: 200,
  autor: 10,
} as const;

/** Plain text field as IMPORT.md demands it: bounded, Swiss spelling, no markup, single line. */
function text(max: number) {
  return z.string().superRefine((value, ctx) => {
    if (value.trim().length === 0) {
      ctx.addIssue({ code: 'custom', message: 'darf nicht leer sein' });
    }
    if (value.length > max) {
      ctx.addIssue({
        code: 'custom',
        message: `ist zu lang (${value.length} Zeichen, erlaubt sind ${max})`,
      });
    }
    if (value.includes('ß')) {
      ctx.addIssue({ code: 'custom', message: 'enthält ein ß; in Schweizer Schreibweise «ss»' });
    }
    if (/[\r\n]/.test(value)) {
      ctx.addIssue({ code: 'custom', message: 'enthält einen Zeilenumbruch' });
    }
    if (/<\/?[a-zA-Z][^>]*>/.test(value)) {
      ctx.addIssue({ code: 'custom', message: 'enthält HTML; erlaubt ist nur reiner Text' });
    }
  });
}

const effectSchema = z.enum(EFFECT_LEVELS);

const effectsSchema = z.strictObject({
  budget: effectSchema,
  zeit: effectSchema,
  stabilitaet: effectSchema,
});

const optionSchema = z.strictObject({
  id: z.enum(OPTION_IDS),
  text: text(MAX_LENGTH.optionText),
  wirkung: effectsSchema,
  einstufung: z.enum(RATINGS),
  erklaerung: text(MAX_LENGTH.erklaerung),
});

const situationSchema = z.strictObject({
  id: z.string(),
  lernziel: z.string(),
  titel: text(MAX_LENGTH.titel),
  situation: text(MAX_LENGTH.situation),
  aiAusgabe: z
    .strictObject({
      prompt: text(MAX_LENGTH.prompt),
      antwort: text(MAX_LENGTH.antwort),
    })
    .optional(),
  optionen: z.array(optionSchema),
  quelle: text(MAX_LENGTH.quelle).optional(),
  autor: text(MAX_LENGTH.autor),
  status: z.enum(STATUSES),
});

const cardSchema = z.strictObject({
  typ: z.literal('karte'),
  id: z.string(),
  titel: text(MAX_LENGTH.titel),
  text: text(MAX_LENGTH.karteText),
  grafik: z.enum(GRAPHICS).optional(),
});

const videoSchema = z.strictObject({
  typ: z.literal('video'),
  id: z.string(),
  titel: text(MAX_LENGTH.titel),
  url: z.string(),
  dauerSekunden: z.number().int().positive(),
  transkript: text(MAX_LENGTH.transkript),
});

export const levelSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  nummer: z.number().int().min(1).max(5),
  titel: text(MAX_LENGTH.levelTitel),
  prozessschritt: z.enum(PROCESS_STEPS),
  projekt: z.strictObject({
    titel: text(MAX_LENGTH.levelTitel),
    beschreibung: text(MAX_LENGTH.beschreibung),
    gebaeude: z.enum(BUILDING_KINDS),
  }),
  lernziele: z.array(z.strictObject({ id: z.string(), text: text(MAX_LENGTH.lernzielText) })),
  theorie: z.array(z.discriminatedUnion('typ', [cardSchema, videoSchema])),
  situationenProDurchgang: z.number().int().min(1),
  situationen: z.array(situationSchema),
});

export type GaugeKey = (typeof GAUGE_KEYS)[number];
export type EffectLevel = (typeof EFFECT_LEVELS)[number];
export type Rating = (typeof RATINGS)[number];
export type OptionId = (typeof OPTION_IDS)[number];
export type BuildingKind = (typeof BUILDING_KINDS)[number];
export type GraphicKind = (typeof GRAPHICS)[number];
export type Level = z.infer<typeof levelSchema>;
export type Situation = Level['situationen'][number];
export type Option = Situation['optionen'][number];
export type Effects = Option['wirkung'];
export type TheoryStep = Level['theorie'][number];
export type LearningGoal = Level['lernziele'][number];
