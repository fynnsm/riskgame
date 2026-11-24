import { describe, expect, it } from 'vitest';
import type { SoundName } from '../../src/audio/sound.ts';
import { AMBIENCE_GAIN, createSound, RECIPES } from '../../src/audio/sound.ts';
import { createLogger } from '../../src/logging/logger.ts';
import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
} from '../../src/storage/settings-store.ts';
import { memoryStorage } from './fixtures.ts';

/** Counts what a sound asks of the audio system, without making any noise. */
function fakeContext() {
  const made = { oscillators: 0, sources: 0, started: 0, stopped: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
  });
  const node = () => ({ connect: () => undefined, disconnect: () => undefined });
  const context = {
    currentTime: 0,
    sampleRate: 100,
    destination: {},
    createOscillator: () => {
      made.oscillators += 1;
      return {
        ...node(),
        type: 'sine',
        frequency: param(),
        start: () => undefined,
        stop: () => undefined,
      };
    },
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => ({ ...node(), type: 'lowpass', frequency: param() }),
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => {
      made.sources += 1;
      return {
        ...node(),
        buffer: null,
        loop: false,
        start: () => void (made.started += 1),
        stop: () => void (made.stopped += 1),
      };
    },
  };
  return { context: context as unknown as AudioContext, made };
}

function setup(muted = false, available = true) {
  const fake = fakeContext();
  const events: string[] = [];
  const sound = createSound({
    createContext: () => (available ? fake.context : null),
    muted,
    log: (event) => events.push(event),
  });
  return { sound, made: fake.made, events };
}

describe('sound (F-801 to F-805, B7)', () => {
  it('stays silent until the player has done something (F-804)', () => {
    const { sound, made } = setup();
    sound.play('choice');
    expect(made.oscillators).toBe(0);
    sound.unlock();
    sound.play('choice');
    expect(made.oscillators).toBe(1);
  });

  it('plays nothing while muted, and again once the mute is lifted (F-802)', () => {
    const { sound, made, events } = setup(true);
    sound.unlock();
    sound.play('success');
    expect(made.oscillators).toBe(0);
    expect(sound.isMuted()).toBe(true);
    sound.setMuted(false);
    sound.play('success');
    expect(made.oscillators).toBe(3);
    expect(events).toContain('sound.muted');
  });

  it('keeps the game running where the browser has no audio', () => {
    const { sound, events } = setup(false, false);
    sound.unlock();
    expect(() => sound.play('collapse')).not.toThrow();
    sound.setAmbience(true);
    expect(events).toContain('sound.unlocked');
  });

  it('runs the city atmosphere only when wanted, unlocked and not muted', () => {
    const { sound, made } = setup();
    sound.setAmbience(true);
    expect(made.started).toBe(0);
    sound.unlock();
    expect(made.started).toBe(1);
    sound.setAmbience(true);
    expect(made.started).toBe(1);
    sound.setMuted(true);
    expect(made.stopped).toBe(1);
    sound.setMuted(false);
    expect(made.started).toBe(2);
    sound.setAmbience(false);
    expect(made.stopped).toBe(2);
  });

  it('unlocks once, however often it is asked', () => {
    let created = 0;
    const sound = createSound({
      createContext: () => {
        created += 1;
        return fakeContext().context;
      },
      muted: false,
      log: () => undefined,
    });
    sound.unlock();
    sound.unlock();
    expect(created).toBe(1);
  });

  it('keeps every sound short and quiet', () => {
    for (const name of Object.keys(RECIPES) as SoundName[]) {
      const recipe = RECIPES[name];
      const parts = [...recipe.tones, ...recipe.noise];
      expect(parts.length, name).toBeGreaterThan(0);
      for (const part of parts) {
        expect(part.gain, name).toBeLessThanOrEqual(0.25);
        expect(part.at + part.seconds, name).toBeLessThanOrEqual(4);
      }
    }
    expect(AMBIENCE_GAIN).toBeLessThan(0.05);
  });

  it('builds tones and noise as the recipe says', () => {
    const { sound, made } = setup();
    sound.unlock();
    sound.play('collapse');
    expect(made.oscillators).toBe(RECIPES.collapse.tones.length);
    expect(made.sources).toBe(RECIPES.collapse.noise.length);
  });
});

describe('settings store (F-802)', () => {
  const setupStore = (storage: Storage) => {
    const logger = createLogger({ now: () => 0 });
    return { store: createSettingsStore(() => storage, logger), logger };
  };

  it('starts with the defaults and remembers the mute', () => {
    const storage = memoryStorage();
    const { store } = setupStore(storage);
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
    expect(store.save({ muted: true })).toBe(true);
    expect(setupStore(storage).store.load()).toEqual({ muted: true });
  });

  it.each([
    ['broken JSON', '{"muted":'],
    ['a wrong type', '{"muted":"ja"}'],
    ['an unknown field', '{"muted":true,"volume":11}'],
  ])('falls back to the defaults and replaces %s', (_name, stored) => {
    const storage = memoryStorage({ [SETTINGS_KEY]: stored });
    const { store, logger } = setupStore(storage);
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
    expect(logger.entries().map((e) => e.event)).toEqual(['settings.load.invalid']);
    expect(JSON.parse(storage.getItem(SETTINGS_KEY) ?? '')).toEqual(DEFAULT_SETTINGS);
  });

  it('works without storage: defaults on load, false on save', () => {
    const logger = createLogger({ now: () => 0 });
    const store = createSettingsStore(() => {
      throw new DOMException('blocked', 'SecurityError');
    }, logger);
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
    expect(store.save({ muted: true })).toBe(false);
    expect(logger.entries().map((e) => e.event)).toEqual([
      'settings.load.unavailable',
      'settings.save.failed',
    ]);
  });
});
