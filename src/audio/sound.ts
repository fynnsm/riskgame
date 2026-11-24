/**
 * Sound (F-801 to F-805, B7). Everything is synthesised in the browser: no audio files,
 * nothing loaded from anywhere. No information is carried by sound alone; every sound
 * accompanies something that is also shown.
 */

export type SoundName =
  'choice' | 'floor' | 'warning' | 'collapse' | 'success' | 'star' | 'firework' | 'stamp' | 'plane';

interface Tone {
  wave: OscillatorType;
  /** Frequency in hertz at the start, and where it glides to. */
  from: number;
  to?: number;
  /** Seconds after the sound starts. */
  at: number;
  seconds: number;
  gain: number;
}

interface Noise {
  at: number;
  seconds: number;
  gain: number;
  /** Cut-off of the low-pass filter in hertz; lower is duller. */
  cutoff: number;
}

export interface Recipe {
  tones: Tone[];
  noise: Noise[];
}

/** What each sound is made of. Plain data, so its limits can be tested. */
export const RECIPES: Record<SoundName, Recipe> = {
  choice: { tones: [{ wave: 'triangle', from: 520, at: 0, seconds: 0.07, gain: 0.12 }], noise: [] },
  floor: {
    tones: [{ wave: 'sine', from: 150, to: 70, at: 0.36, seconds: 0.22, gain: 0.22 }],
    noise: [{ at: 0.36, seconds: 0.18, gain: 0.1, cutoff: 900 }],
  },
  warning: {
    tones: [
      { wave: 'square', from: 330, at: 0, seconds: 0.09, gain: 0.07 },
      { wave: 'square', from: 330, at: 0.16, seconds: 0.09, gain: 0.07 },
    ],
    noise: [],
  },
  collapse: {
    tones: [{ wave: 'sawtooth', from: 110, to: 40, at: 0, seconds: 1.2, gain: 0.14 }],
    noise: [
      { at: 0, seconds: 1.4, gain: 0.2, cutoff: 500 },
      { at: 0.5, seconds: 0.9, gain: 0.14, cutoff: 1400 },
    ],
  },
  success: {
    tones: [
      { wave: 'triangle', from: 523, at: 0, seconds: 0.14, gain: 0.14 },
      { wave: 'triangle', from: 659, at: 0.13, seconds: 0.14, gain: 0.14 },
      { wave: 'triangle', from: 784, at: 0.26, seconds: 0.3, gain: 0.14 },
    ],
    noise: [],
  },
  star: {
    tones: [{ wave: 'sine', from: 880, to: 1320, at: 0, seconds: 0.16, gain: 0.12 }],
    noise: [],
  },
  firework: {
    tones: [{ wave: 'sine', from: 300, to: 900, at: 0, seconds: 0.3, gain: 0.05 }],
    noise: [{ at: 0.3, seconds: 0.5, gain: 0.14, cutoff: 2600 }],
  },
  stamp: {
    tones: [{ wave: 'sine', from: 120, to: 60, at: 0, seconds: 0.14, gain: 0.24 }],
    noise: [{ at: 0, seconds: 0.08, gain: 0.12, cutoff: 700 }],
  },
  plane: {
    tones: [{ wave: 'sawtooth', from: 95, to: 80, at: 0, seconds: 3.5, gain: 0.035 }],
    noise: [{ at: 0, seconds: 3.5, gain: 0.03, cutoff: 400 }],
  },
};

/** Loudness of the city in the background; meant to be barely there. */
export const AMBIENCE_GAIN = 0.018;

export interface Sound {
  play(name: SoundName): void;
  /** F-804: browsers allow sound only after a first action of the user. */
  unlock(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  /** Switches the quiet city atmosphere on or off. */
  setAmbience(on: boolean): void;
}

export interface SoundOptions {
  /** Returns null where the browser has no Web Audio; the game is then simply silent. */
  createContext(): AudioContext | null;
  muted: boolean;
  log(event: string, data?: Record<string, string | number | boolean>): void;
}

export function createSound(options: SoundOptions): Sound {
  let muted = options.muted;
  let context: AudioContext | null = null;
  let unlocked = false;
  let wantAmbience = false;
  let ambience: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  let noiseBuffer: AudioBuffer | null = null;

  function noise(ctx: AudioContext): AudioBuffer {
    if (noiseBuffer) return noiseBuffer;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // A fixed pseudo-random sequence: the same hiss every time, and no Math.random needed.
    let state = 22222;
    for (let i = 0; i < data.length; i++) {
      state = (state * 16807) % 2147483647;
      data[i] = (state / 2147483647) * 2 - 1;
    }
    noiseBuffer = buffer;
    return buffer;
  }

  function stopAmbience(): void {
    if (!ambience) return;
    ambience.source.stop();
    ambience.source.disconnect();
    ambience.gain.disconnect();
    ambience = null;
  }

  function syncAmbience(): void {
    const ctx = context;
    const on = wantAmbience && !muted && ctx !== null;
    if (!on) {
      stopAmbience();
      return;
    }
    if (ambience) return;
    const source = ctx.createBufferSource();
    source.buffer = noise(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.value = AMBIENCE_GAIN;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    ambience = { source, gain };
  }

  return {
    play(name: SoundName): void {
      const ctx = context;
      if (muted || !unlocked || !ctx) return;
      const recipe = RECIPES[name];
      const start = ctx.currentTime;
      for (const tone of recipe.tones) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = tone.wave;
        oscillator.frequency.setValueAtTime(tone.from, start + tone.at);
        if (tone.to !== undefined) {
          oscillator.frequency.linearRampToValueAtTime(tone.to, start + tone.at + tone.seconds);
        }
        // A short fade at both ends keeps the tone from clicking.
        gain.gain.setValueAtTime(0, start + tone.at);
        gain.gain.linearRampToValueAtTime(tone.gain, start + tone.at + 0.01);
        gain.gain.linearRampToValueAtTime(0, start + tone.at + tone.seconds);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(start + tone.at);
        oscillator.stop(start + tone.at + tone.seconds + 0.02);
      }
      for (const burst of recipe.noise) {
        const source = ctx.createBufferSource();
        source.buffer = noise(ctx);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = burst.cutoff;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(burst.gain, start + burst.at);
        gain.gain.linearRampToValueAtTime(0, start + burst.at + burst.seconds);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        source.start(start + burst.at);
        source.stop(start + burst.at + burst.seconds + 0.02);
      }
      options.log('sound.played', { name });
    },

    unlock(): void {
      if (unlocked) return;
      unlocked = true;
      context = options.createContext();
      options.log('sound.unlocked', { available: context !== null });
      syncAmbience();
    },

    setMuted(next: boolean): void {
      muted = next;
      options.log('sound.muted', { muted });
      syncAmbience();
    },

    isMuted: () => muted,

    setAmbience(on: boolean): void {
      wantAmbience = on;
      syncAmbience();
    },
  };
}
