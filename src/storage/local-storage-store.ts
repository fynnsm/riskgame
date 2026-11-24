import type { Progress } from '../core/progress.ts';
import { emptyProgress, PROGRESS_VERSION } from '../core/progress.ts';
import type { Logger, LogPersistence } from '../logging/logger.ts';
import { errorData } from '../logging/logger.ts';
import type { LoadOutcome, ProgressStore } from './progress-store.ts';
import { progressSchema } from './schema.ts';

export const PROGRESS_KEY = 'risk-tower.progress';
export const LOG_KEY = 'risk-tower.log';

/** Deferred access: merely touching `window.localStorage` can throw in some privacy modes. */
export type StorageProvider = () => Storage;

export function browserLocalStorage(): Storage {
  return window.localStorage;
}

export function browserSessionStorage(): Storage {
  return window.sessionStorage;
}

/** The version whose finished levels have the same shape as today's. */
const CARRIED_OVER_FROM = 2;

/**
 * The stored state without its level in play, if the rest is valid. `droppedRun` says
 * whether there was a level in play to give up.
 */
function withoutRun(
  raw: unknown,
  version: number,
): { progress: Progress; droppedRun: boolean } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;
  const parsed = progressSchema.safeParse({ ...source, version, currentRun: null });
  if (!parsed.success) return null;
  return { progress: parsed.data, droppedRun: source.currentRun != null };
}

export function createLocalStorageStore(provider: StorageProvider, logger: Logger): ProgressStore {
  function fresh(status: LoadOutcome['status']): LoadOutcome {
    return { status, progress: emptyProgress() };
  }

  function save(progress: Progress): boolean {
    try {
      provider().setItem(PROGRESS_KEY, JSON.stringify(progress));
      return true;
    } catch (cause) {
      logger.warn('storage.save.failed', errorData(cause));
      return false;
    }
  }

  /**
   * A broken state is replaced at once (A4). Otherwise every visit would find it again
   * and repeat the hint until the player happened to trigger the first save.
   */
  function replaced(status: 'invalid' | 'outdated'): LoadOutcome {
    if (save(emptyProgress())) logger.info('storage.load.replaced', { reason: status });
    return fresh(status);
  }

  return {
    load(): LoadOutcome {
      let serialised: string | null;
      try {
        serialised = provider().getItem(PROGRESS_KEY);
      } catch (cause) {
        logger.warn('storage.load.unavailable', errorData(cause));
        return fresh('unavailable');
      }
      if (serialised === null) {
        logger.info('storage.load.empty');
        return fresh('empty');
      }
      let raw: unknown;
      try {
        raw = JSON.parse(serialised);
      } catch (cause) {
        logger.warn('storage.load.invalid', { reason: 'json', ...errorData(cause) });
        return replaced('invalid');
      }
      const version =
        typeof raw === 'object' && raw !== null
          ? (raw as { version?: unknown }).version
          : undefined;
      // Version 2 differs from 3 only in what a level in play looks like. Everything that was
      // finished is carried over; the level in play cannot be continued and is given up.
      if (version === CARRIED_OVER_FROM) {
        const carried = withoutRun(raw, PROGRESS_VERSION);
        if (carried) {
          logger.info('storage.load.migrated', {
            from: CARRIED_OVER_FROM,
            droppedRun: carried.droppedRun,
          });
          save(carried.progress);
          return { status: 'migrated', ...carried };
        }
      }
      if (typeof version === 'number' && version !== PROGRESS_VERSION) {
        logger.warn('storage.load.outdated', { found: version, expected: PROGRESS_VERSION });
        return replaced('outdated');
      }
      const parsed = progressSchema.safeParse(raw);
      if (!parsed.success) {
        // If only the level in play is unreadable, the finished levels are still worth keeping.
        const salvaged = withoutRun(raw, PROGRESS_VERSION);
        if (salvaged && salvaged.droppedRun) {
          logger.warn('storage.load.salvaged', { issues: parsed.error.issues.length });
          save(salvaged.progress);
          return { status: 'migrated', ...salvaged };
        }
        const first = parsed.error.issues[0];
        logger.warn('storage.load.invalid', {
          reason: 'schema',
          issues: parsed.error.issues.length,
          path: first ? first.path.map(String).join('.') : '',
          code: first ? first.code : '',
        });
        return replaced('invalid');
      }
      const progress: Progress = parsed.data;
      logger.info('storage.load.ok', { levels: Object.keys(progress.levels).length });
      return { status: 'ok', progress };
    },

    save,

    clear(): boolean {
      try {
        provider().removeItem(PROGRESS_KEY);
        logger.info('storage.clear.ok');
        return true;
      } catch (cause) {
        logger.warn('storage.clear.failed', errorData(cause));
        return false;
      }
    },
  };
}

/** Lets the logger keep its ring buffer across a reload without touching storage itself. */
export function createLogPersistence(provider: StorageProvider): LogPersistence {
  return {
    load: () => provider().getItem(LOG_KEY),
    save: (serialised) => provider().setItem(LOG_KEY, serialised),
  };
}
