import { z } from 'zod';
import { bundledLevelFiles } from './content/bundle.ts';
import { loadLevels, withoutTour } from './content/load.ts';
import { CONTENT_RULES } from './core/balance.ts';
import type { SceneView } from './core/scene.ts';
import { consoleSink } from './logging/console-sink.ts';
import type { LogEntry } from './logging/logger.ts';
import { createLogger, errorData } from './logging/logger.ts';
import { createNullView } from './render/null-view.ts';
import {
  browserLocalStorage,
  browserSessionStorage,
  createLocalStorageStore,
  createLogPersistence,
} from './storage/local-storage-store.ts';
import { createSound } from './audio/sound.ts';
import { createSettingsStore } from './storage/settings-store.ts';
import { createApp } from './ui/app.ts';
import { T } from './ui/texts.ts';

/** URL parameters are outside input and get the same treatment as any other (CLAUDE.md, security). */
const paramsSchema = z.object({
  renderer: z.enum(['none', '3d']).optional(),
  seed: z.coerce.number().int().min(0).max(0xffffffff).optional(),
  debug: z.literal('1').optional(),
  /** Pins the quality step of the 3D view; meant for measurements (docs/PERFORMANCE.md). */
  quality: z.enum(['0', '1', '2']).optional(),
});

function sink(entry: LogEntry): void {
  // In production only problems reach the console; everything stays in the ring buffer anyway.
  if (import.meta.env.DEV || entry.level === 'warn' || entry.level === 'error') consoleSink(entry);
}

const logger = createLogger({
  now: () => Date.now(),
  persistence: createLogPersistence(browserSessionStorage),
  sink,
});

function readParams(): z.infer<typeof paramsSchema> {
  const raw = Object.fromEntries(new URLSearchParams(window.location.search));
  const parsed = paramsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  logger.warn('params.invalid', { issues: parsed.error.issues.length });
  return {};
}

function hasWebGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch (cause) {
    logger.warn('render.webgl.probe.failed', errorData(cause));
    return false;
  }
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app element');

  logger.info('app.start', { version: __APP_VERSION__, commit: __APP_COMMIT__ });
  const params = readParams();

  const showDrafts = import.meta.env.DEV || import.meta.env.VITE_SHOW_DRAFTS === '1';
  const loaded = loadLevels(bundledLevelFiles(), CONTENT_RULES, showDrafts);
  // The site tour has its rules and contents, but no screen yet: held back until it has one.
  const content = {
    ...loaded,
    levels: loaded.levels.map((entry) => ({ ...entry, level: withoutTour(entry.level) })),
  };
  logger.info('content.loaded', {
    levels: content.levels.length,
    errors: content.errors.length,
    warnings: content.warnings.length,
    showDrafts,
  });
  content.errors.forEach((message) => logger.error('content.invalid', { message }));
  content.warnings.forEach((message) => logger.warn('content.warning', { message }));

  const startupNotices: string[] = [];
  let rendererName = 'none';
  let createView: (host: HTMLElement) => SceneView = () => createNullView();

  if (params.renderer !== 'none') {
    if (hasWebGl()) {
      try {
        // Loaded on demand so the simple mode never downloads Three.js.
        const { createThreeView } = await import('./render/three-view.ts');
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const fixedQuality =
          params.quality === undefined ? undefined : (Number(params.quality) as 0 | 1 | 2);
        createView = (host) => createThreeView(host, { logger, reducedMotion, fixedQuality });
        rendererName = '3d';
      } catch (cause) {
        logger.error('render.load.failed', errorData(cause));
        startupNotices.push(T.notices.noWebgl);
      }
    } else {
      logger.warn('render.webgl.unavailable');
      startupNotices.push(T.notices.noWebgl);
    }
  }
  logger.info('render.mode', { renderer: rendererName });

  const settingsStore = createSettingsStore(browserLocalStorage, logger);
  const sound = createSound({
    muted: settingsStore.load().muted,
    log: (event, data) => logger.info(event, data),
    createContext: () => {
      try {
        return typeof AudioContext === 'undefined' ? null : new AudioContext();
      } catch (cause) {
        // No audio device or a browser that refuses: the game stays silent and carries on.
        logger.warn('sound.context.failed', errorData(cause));
        return null;
      }
    },
  });

  let fixedSeed = params.seed;
  const app = createApp({
    root,
    levels: content.levels,
    contentErrors: content.errors,
    store: createLocalStorageStore(browserLocalStorage, logger),
    logger,
    build: { version: __APP_VERSION__, commit: __APP_COMMIT__ },
    rendererName,
    createView,
    startupNotices,
    sound,
    settings: settingsStore,
    debug: params.debug === '1',
    showDraftLabels: import.meta.env.DEV || params.debug === '1',
    env: {
      now: () => performance.now(),
      timestamp: () => new Date().toISOString(),
      userAgent: navigator.userAgent,
      viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
      copyText: (text) => navigator.clipboard.writeText(text),
      downloadPng: (fileName, dataUrl) => {
        // From data URL to a file in memory: no request leaves the page, nothing is uploaded.
        const bytes = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
        const buffer = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([buffer], { type: 'image/png' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      },
      reload: () => window.location.reload(),
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      nextSeed: () => {
        // `?seed=` pins the first run only, so a repeat still draws anew.
        if (fixedSeed !== undefined) {
          const seed = fixedSeed;
          fixedSeed = undefined;
          return seed;
        }
        return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
      },
    },
  });

  window.addEventListener('error', (event) => {
    logger.error('window.error', {
      message: event.message,
      line: event.lineno,
      column: event.colno,
    });
    app.showFatal(event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    logger.error('window.unhandledrejection', errorData(event.reason));
    app.showFatal(event.reason);
  });

  app.start();
}

boot().catch((cause: unknown) => {
  logger.error('app.boot.failed', errorData(cause));
  const root = document.getElementById('app');
  // No app instance exists yet, so there is no error page to show: fall back to plain text.
  if (root) root.textContent = `${T.error.heading}. ${T.error.lead}`;
});
