export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogValue = string | number | boolean | null;
export type LogData = Record<string, LogValue | undefined>;

export interface LogEntry {
  t: number;
  level: LogLevel;
  event: string;
  data?: Record<string, LogValue>;
}

/** Where the ring buffer survives a reload (L-03). Implemented in src/storage. */
export interface LogPersistence {
  load(): string | null;
  save(serialised: string): void;
}

export interface LoggerOptions {
  /** Time is injected so tests never depend on a real clock. */
  now: () => number;
  capacity?: number;
  persistence?: LogPersistence;
  /** Receives every entry as it is written, e.g. to mirror it to the console. */
  sink?: (entry: LogEntry) => void;
}

export interface Logger {
  debug(event: string, data?: LogData): void;
  info(event: string, data?: LogData): void;
  warn(event: string, data?: LogData): void;
  error(event: string, data?: LogData): void;
  entries(): LogEntry[];
}

export const DEFAULT_CAPACITY = 300;
const MAX_STRING_LENGTH = 300;
const LEVELS: readonly string[] = ['debug', 'info', 'warn', 'error'];

function isLogValue(value: unknown): value is LogValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

/** Only flat primitives get into the log: no objects, so nothing personal slips in by accident. */
function clean(data: LogData | undefined): Record<string, LogValue> | undefined {
  if (!data) return undefined;
  const result: Record<string, LogValue> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!isLogValue(value)) continue;
    result[key] = typeof value === 'string' ? value.slice(0, MAX_STRING_LENGTH) : value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function isEntry(value: unknown): value is LogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.t !== 'number' || typeof entry.event !== 'string') return false;
  if (typeof entry.level !== 'string' || !LEVELS.includes(entry.level)) return false;
  if (entry.data === undefined) return true;
  if (typeof entry.data !== 'object' || entry.data === null) return false;
  return Object.values(entry.data).every(isLogValue);
}

/** Turns a caught value into loggable fields, so no `catch` has to drop its cause. */
export function errorData(cause: unknown): { error: string; message: string } {
  if (cause instanceof Error) return { error: cause.name, message: cause.message };
  return { error: 'NonError', message: String(cause) };
}

export function createLogger(options: LoggerOptions): Logger {
  const capacity = options.capacity ?? DEFAULT_CAPACITY;
  let persistence = options.persistence;
  let buffer: LogEntry[] = [];

  function write(level: LogLevel, event: string, data?: LogData): void {
    const entry: LogEntry = { t: options.now(), level, event };
    const cleaned = clean(data);
    if (cleaned) entry.data = cleaned;
    buffer.push(entry);
    if (buffer.length > capacity) buffer = buffer.slice(buffer.length - capacity);
    options.sink?.(entry);
    if (!persistence) return;
    try {
      persistence.save(JSON.stringify(buffer));
    } catch (cause) {
      // Stop trying after the first failure (e.g. storage full), but leave a trace of why.
      persistence = undefined;
      write('warn', 'log.persist.failed', errorData(cause));
    }
  }

  function restore(): void {
    if (!persistence) return;
    let serialised: string | null;
    try {
      serialised = persistence.load();
    } catch (cause) {
      persistence = undefined;
      write('warn', 'log.restore.failed', errorData(cause));
      return;
    }
    if (serialised === null) return;
    try {
      const parsed: unknown = JSON.parse(serialised);
      if (!Array.isArray(parsed) || !parsed.every(isEntry)) {
        write('warn', 'log.restore.invalid', { reason: 'shape' });
        return;
      }
      buffer = parsed.slice(-capacity);
    } catch (cause) {
      write('warn', 'log.restore.invalid', errorData(cause));
    }
  }

  restore();

  return {
    debug: (event, data) => write('debug', event, data),
    info: (event, data) => write('info', event, data),
    warn: (event, data) => write('warn', event, data),
    error: (event, data) => write('error', event, data),
    entries: () => [...buffer],
  };
}
