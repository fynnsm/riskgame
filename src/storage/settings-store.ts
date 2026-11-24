import { z } from 'zod';
import type { Logger } from '../logging/logger.ts';
import { errorData } from '../logging/logger.ts';
import type { StorageProvider } from './local-storage-store.ts';

/**
 * Settings that belong to the device, not to the progress in the game (F-802).
 * They have a key of their own, so changing them never touches a saved game.
 */
export interface Settings {
  muted: boolean;
}

export const SETTINGS_KEY = 'risk-tower.settings';
export const DEFAULT_SETTINGS: Settings = { muted: false };

const settingsSchema = z.strictObject({ muted: z.boolean() });

export interface SettingsStore {
  load(): Settings;
  /** Returns false if the settings could not be written. Never throws. */
  save(settings: Settings): boolean;
}

export function createSettingsStore(provider: StorageProvider, logger: Logger): SettingsStore {
  function save(settings: Settings): boolean {
    try {
      provider().setItem(SETTINGS_KEY, JSON.stringify(settings));
      return true;
    } catch (cause) {
      logger.warn('settings.save.failed', errorData(cause));
      return false;
    }
  }

  return {
    load(): Settings {
      let serialised: string | null;
      try {
        serialised = provider().getItem(SETTINGS_KEY);
      } catch (cause) {
        logger.warn('settings.load.unavailable', errorData(cause));
        return { ...DEFAULT_SETTINGS };
      }
      if (serialised === null) return { ...DEFAULT_SETTINGS };
      try {
        const parsed = settingsSchema.safeParse(JSON.parse(serialised));
        if (parsed.success) return parsed.data;
        logger.warn('settings.load.invalid', { reason: 'schema' });
      } catch (cause) {
        logger.warn('settings.load.invalid', { reason: 'json', ...errorData(cause) });
      }
      // Replace what could not be read, as with a broken progress (A4).
      save(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS };
    },
    save,
  };
}
