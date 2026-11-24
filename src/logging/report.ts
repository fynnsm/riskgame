import type { LogEntry } from './logger.ts';

/** Everything needed to rebuild a run as an automated test (L-07). */
export interface ReplayData {
  levelId: string;
  seed: number;
  recentIds: string[];
  choices: string[];
  /** Places put into the risk register on the site tour; null if no tour was finished. */
  tour: string[] | null;
}

export interface ReportRun extends ReplayData {
  phase: string;
  outcome: string;
  gauges: Record<string, number>;
}

export interface ReportLevel {
  id: string;
  completed: boolean;
  stars: number;
  attempts: number;
}

/**
 * The complete input of a report. The type is the privacy guarantee (L-06):
 * there is no field for names, free text or the page address.
 */
export interface ReportInput {
  version: string;
  commit: string;
  time: string;
  userAgent: string;
  viewport: { width: number; height: number };
  renderer: string;
  /** Frame rate of the last 30 seconds and quality step; all null without 3D. */
  render: { fpsAverage: number | null; fpsMinimum: number | null; quality: number | null };
  playTimeMs: number;
  levels: ReportLevel[];
  run: ReportRun | null;
  entries: LogEntry[];
}

export const REPORT_TITLE = 'Risk Tower Fehlerbericht';
const REPLAY_PREFIX = 'REPLAY: ';

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} min ${seconds} s`;
}

function describeFrameRate(render: ReportInput['render']): string {
  if (render.fpsAverage === null || render.fpsMinimum === null) return 'Bildrate: nicht gemessen';
  const quality = render.quality === null ? 'unbekannt' : String(render.quality);
  return `Bildrate (letzte 30 s): Durchschnitt ${render.fpsAverage}, Minimum ${render.fpsMinimum}, Qualitätsstufe ${quality}`;
}

export function buildErrorReport(input: ReportInput): string {
  const lines: string[] = [
    REPORT_TITLE,
    `Version: ${input.version} (${input.commit})`,
    `Zeitpunkt: ${input.time}`,
    `Browser: ${input.userAgent}`,
    `Fenster: ${input.viewport.width}x${input.viewport.height}`,
    `Grafikmodus: ${input.renderer}`,
    describeFrameRate(input.render),
    `Spielzeit: ${formatDuration(input.playTimeMs)}`,
    '',
    'Spielstand:',
  ];
  if (input.levels.length === 0) lines.push('  (noch nichts gespielt)');
  for (const level of input.levels) {
    lines.push(
      `  ${level.id}: ${level.completed ? 'abgeschlossen' : 'offen'}, Sterne ${level.stars}, Versuche ${level.attempts}`,
    );
  }
  lines.push('');
  if (input.run) {
    const { levelId, seed, recentIds, choices, tour, phase, outcome, gauges } = input.run;
    const gaugeText = Object.entries(gauges)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
    lines.push(`Aktueller Durchgang: ${levelId}, Phase ${phase}, Ergebnis ${outcome}`);
    lines.push(`Anzeigen: ${gaugeText}`);
    const replay: ReplayData = { levelId, seed, recentIds, choices, tour };
    lines.push(REPLAY_PREFIX + JSON.stringify(replay));
  } else {
    lines.push('Aktueller Durchgang: keiner');
  }
  lines.push('', `Letzte Log-Einträge (${input.entries.length}):`);
  for (const entry of input.entries) {
    const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    lines.push(`${entry.t} ${entry.level} ${entry.event}${data}`);
  }
  return lines.join('\n');
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

/** Reads seed and choices back out of a pasted report. Returns null if there is no usable run. */
export function extractReplay(report: string): ReplayData | null {
  const line = report.split('\n').find((l) => l.startsWith(REPLAY_PREFIX));
  if (!line) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.slice(REPLAY_PREFIX.length));
  } catch {
    // A truncated or hand-edited report: treated the same as "no replay data".
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const data = parsed as Record<string, unknown>;
  if (typeof data.levelId !== 'string' || typeof data.seed !== 'number') return null;
  if (!isStringArray(data.recentIds) || !isStringArray(data.choices)) return null;
  return {
    levelId: data.levelId,
    seed: data.seed,
    recentIds: data.recentIds,
    choices: data.choices,
    // Reports written before the tour existed have no such field.
    tour: isStringArray(data.tour) ? data.tour : null,
  };
}
