import type { LogEntry } from './logger.ts';

/** The one place in the app that writes to the console (L-01). */
export function consoleSink(entry: LogEntry): void {
  const line = `[${entry.level}] ${entry.event}`;
  const args = entry.data ? [line, entry.data] : [line];
  if (entry.level === 'error') console.error(...args);
  else if (entry.level === 'warn') console.warn(...args);
  else console.log(...args);
}
