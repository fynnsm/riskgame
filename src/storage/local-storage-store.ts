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

export function createLocalStorageStore(provider: StorageProvider, logger: Logger): ProgressStore {
  function fresh(status: LoadOutcome['status']): LoadOutcome {
    return { status, progress: emptyProgress() };
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
        return fresh('invalid');
      }
      const version =
        typeof raw === 'object' && raw !== null
          ? (raw as { version?: unknown }).version
          : undefined;
      if (typeof version === 'number' && version !== PROGRESS_VERSION) {
        logger.warn('storage.load.outdated', { found: version, expected: PROGRESS_VERSION });
        return fresh('outdated');
      }
      const parsed = progressSchema.safeParse(raw);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        logger.warn('storage.load.invalid', {
          reason: 'schema',
          issues: parsed.error.issues.length,
          path: first ? first.path.map(String).join('.') : '',
          code: first ? first.code : '',
        });
        return fresh('invalid');
      }
      const progress: Progress = parsed.data;
      logger.info('storage.load.ok', { levels: Object.keys(progress.levels).length });
      return { status: 'ok', progress };
    },

    save(progress: Progress): boolean {
      try {
        provider().setItem(PROGRESS_KEY, JSON.stringify(progress));
        return true;
      } catch (cause) {
        logger.warn('storage.save.failed', errorData(cause));
        return false;
      }
    },

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
