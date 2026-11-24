import type { PlayableLevel } from '../content/load.ts';
import type { Level, Option } from '../content/schema.ts';
import type { Action, LevelRun } from '../core/game.ts';
import { currentOptions, currentSituation, isRunConsistent, startRun, step } from '../core/game.ts';
import type { Progress } from '../core/progress.ts';
import {
  addPlayTime,
  clearRun,
  emptyProgress,
  finishRun,
  isUnlocked,
  levelProgress,
  withRun,
} from '../core/progress.ts';
import type { RenderStats, SceneView } from '../core/scene.ts';
import { sceneModel } from '../core/scene.ts';
import { starsFor } from '../core/scoring.ts';
import { judgedCount, registeredRisks } from '../core/tour.ts';
import type { Logger } from '../logging/logger.ts';
import { errorData } from '../logging/logger.ts';
import { buildErrorReport } from '../logging/report.ts';
import { celebrationFor, cityTitle, resultSequence } from '../render/director.ts';
import { TUNING } from '../render/tuning.ts';
import type { ProgressStore } from '../storage/progress-store.ts';
import type { SettingsStore } from '../storage/settings-store.ts';
import type { Sound } from '../audio/sound.ts';
import { criticalGauges } from '../core/gauges.ts';
import { clear, button, el, icon } from './dom.ts';
import {
  briefingScreen,
  cityScreen,
  confirmResetScreen,
  finaleScreen,
  lookScreen,
  totalStars,
  debugAttributes,
  debugFrame,
  debugValues,
  errorScreen,
  feedbackScreen,
  hud,
  menuScreen,
  resultScreen,
  sequenceScreen,
  tourResultScreen,
  tourScreen,
  situationScreen,
  theoryScreen,
} from './screens.ts';
import { T } from './texts.ts';

/** Longer pauses between two actions do not count as active play time (F-108). */
const IDLE_CAP_MS = 120_000;

export interface AppEnvironment {
  /** Monotonic clock in milliseconds, used for play time only. */
  now(): number;
  /** Wall-clock time as ISO string, for the error report. */
  timestamp(): string;
  userAgent: string;
  viewport(): { width: number; height: number };
  copyText(text: string): Promise<void>;
  /** Hands a picture to the browser as a download; nothing leaves the device (G-54). */
  downloadPng(fileName: string, dataUrl: string): void;
  reload(): void;
  /** A fresh 32-bit seed per run. Comes from outside core so core stays deterministic. */
  nextSeed(): number;
  /** The system setting «reduce motion» (N-304). */
  reducedMotion: boolean;
}

export interface AppOptions {
  root: HTMLElement;
  levels: PlayableLevel[];
  contentErrors: string[];
  store: ProgressStore;
  logger: Logger;
  env: AppEnvironment;
  build: { version: string; commit: string };
  rendererName: string;
  /** Called once with the element the 3D canvas goes into. */
  createView(host: HTMLElement): SceneView;
  startupNotices?: string[];
  /** L-09: `?debug=1` shows the overlay and allows jumping to any level. */
  debug?: boolean;
  /** A3: the label «Entwurf» is for authors, not for players. */
  showDraftLabels?: boolean;
  sound: Sound;
  settings: SettingsStore;
}

export interface App {
  start(): void;
  /** L-08: switches to the error page. Safe to call at any time, even repeatedly. */
  showFatal(cause: unknown): void;
}

type Overlay = 'none' | 'menu' | 'confirm-reset' | 'error';

export function createApp(options: AppOptions): App {
  const { root, levels, store, logger, env } = options;
  const levelOrder = levels.map((l) => l.level.id);

  let progress: Progress = emptyProgress();
  let overlay: Overlay = 'none';
  let notices: string[] = [...(options.startupNotices ?? [])];
  let lastActionAt = env.now();
  let view: SceneView | null = null;
  const { sound } = options;
  let soundTimers: number[] = [];
  /** B6: the text panel can be folded away so the building is seen; 'auto' folds it for a moment. */
  let sheet: 'open' | 'collapsed' = 'open';
  let sheetTimer = 0;

  /** B5: the short sequence between the last decision and the evaluation, while it plays. */
  let sequence: { timer: number } | null = null;

  /** True if there is a picture to stage, look at or save; false in the simple mode. */
  const hasPicture = (): boolean => view !== null && options.rendererName !== 'none';

  /** G-53: true while the closing screen is shown instead of the start page. */
  let finale = false;
  /** G-54: true while the interface is out of the way and the camera is free. */
  let looking = false;

  function allCompleted(): boolean {
    return levels.length > 0 && levels.every((l) => levelProgress(progress, l.level.id).completed);
  }

  function setLooking(on: boolean): void {
    looking = on;
    logger.info('finale.look', { on });
    view?.setFreeCamera(on);
    render();
  }

  function savePicture(status: HTMLElement): void {
    const picture = view?.capture() ?? null;
    if (!picture) {
      logger.warn('finale.save.failed');
      status.textContent = T.finale.saveFailed;
      return;
    }
    try {
      env.downloadPng(T.finale.fileName, picture);
      logger.info('finale.save.ok');
      status.textContent = T.finale.saved;
    } catch (cause) {
      logger.warn('finale.save.failed', errorData(cause));
      status.textContent = T.finale.saveFailed;
    }
  }

  /** Ends the sequence, whether its time is up or the player skips it (B0.5). */
  function endSequence(skipped: boolean): void {
    if (!sequence) return;
    window.clearTimeout(sequence.timer);
    soundTimers.forEach((timer) => window.clearTimeout(timer));
    soundTimers = [];
    sequence = null;
    view?.setPresenting(false);
    logger.info('sequence.ended', { skipped });
    render();
  }

  function startSequence(run: LevelRun): void {
    if (run.outcome === 'running') return;
    const plan = resultSequence(run.outcome, starsFor(run), env.reducedMotion);
    logger.info('sequence.started', { outcome: run.outcome, seconds: plan.seconds });
    sequence = { timer: window.setTimeout(() => endSequence(false), plan.seconds * 1000) };
    view?.setPresenting(true);
    // B7: every sound here goes with something that is also shown.
    const stars = starsFor(run);
    const later = (seconds: number, play: () => void): void => {
      soundTimers.push(window.setTimeout(play, seconds * 1000));
    };
    if (run.outcome === 'collapsed') sound.play('collapse');
    if (run.outcome === 'rejected') later(plan.bannerAt, () => sound.play('stamp'));
    if (run.outcome === 'completed') {
      later(plan.bannerAt, () => sound.play('success'));
      for (const at of plan.starsAt) later(at, () => sound.play('star'));
      if (stars === 3) later(TUNING.firework.firstAt, () => sound.play('firework'));
    }
  }

  const canvasHost = el('div', { class: 'canvas-host', attrs: { 'aria-hidden': 'true' } });
  const hudHost = el('div', { class: 'hud-host' });
  const panel = el('main', { class: 'panel' });
  const menuButton = button('', () => toggleMenu(), { class: 'btn-menu', testId: 'menu' });
  // On a narrow phone only the symbol is shown; the word stays for screen readers (A5).
  menuButton.append(
    el('span', { class: 'menu-symbol', text: T.menuSymbol, attrs: { 'aria-hidden': 'true' } }),
    el('span', { class: 'menu-word', text: T.menu }),
  );
  const debugHost = el('div', { class: 'debug-host' });
  const noStats: RenderStats = {
    fps: null,
    fpsAverage: null,
    fpsMinimum: null,
    drawCalls: null,
    triangles: null,
    quality: null,
  };

  const debugValuesHost = el('div');
  let debugBox: HTMLElement | null = null;

  function renderDebug(): void {
    if (!options.debug) return;
    const levelList = levels.map((l) => ({ id: l.level.id, nummer: l.level.nummer }));
    const info = { stats: view?.stats() ?? noStats, run: progress.currentRun, levels: levelList };
    if (!debugBox) {
      debugBox = debugFrame(levelList, debugValuesHost, (levelId) => {
        logger.info('debug.level.jump', { levelId });
        overlay = 'none';
        startLevel(levelId, true);
      });
      debugHost.append(debugBox);
    }
    clear(debugValuesHost);
    debugValuesHost.append(debugValues(info));
    for (const [name, value] of Object.entries(debugAttributes(info))) {
      debugBox.setAttribute(name, value);
    }
  }

  const muteButton = button('', () => toggleMute(), { class: 'btn-menu btn-mute', testId: 'mute' });
  const sheetButton = button('', () => setSheet(sheet === 'open' ? 'collapsed' : 'open'), {
    class: 'btn-sheet',
    testId: 'sheet-toggle',
  });
  const topBar = el('div', { class: 'top-bar' }, [menuButton, muteButton, hudHost]);

  /** F-802: always visible, and the choice is remembered. Says in words what it is, not only by a symbol. */
  function paintMute(): void {
    const muted = sound.isMuted();
    clear(muteButton);
    // N6: a loudspeaker, struck through while muted. An «×» looked like «close».
    const shapes = [
      { d: 'M3 9v6h4l5 4V5L7 9H3z', filled: true },
      muted ? { d: 'M4 3l17 18' } : { d: 'M16 8.5a5 5 0 0 1 0 7' },
    ];
    muteButton.append(
      icon(shapes, 'btn-icon'),
      el('span', { class: 'menu-word', text: muted ? T.sound.off : T.sound.on }),
    );
    muteButton.setAttribute('aria-label', T.sound.label);
    muteButton.setAttribute('aria-pressed', String(muted));
    muteButton.dataset.muted = String(muted);
  }

  /** N7: on a phone the options can lie below the fold; a hint at the foot of the panel leads there. */
  let optionsWatcher: IntersectionObserver | null = null;
  function watchOptions(): void {
    optionsWatcher?.disconnect();
    optionsWatcher = null;
    const heading = panel.querySelector<HTMLElement>('[data-options-heading]');
    const first = panel.querySelector<HTMLElement>('.option');
    if (!heading || !first || typeof IntersectionObserver === 'undefined') return;
    const hint = button(
      T.situation.toOptions,
      () => {
        logger.info('options.hint.used');
        heading.scrollIntoView({ block: 'start', behavior: env.reducedMotion ? 'auto' : 'smooth' });
      },
      { class: 'options-hint', testId: 'to-options' },
    );
    hint.hidden = true;
    panel.append(hint);
    optionsWatcher = new IntersectionObserver(
      (entries) => {
        // Gone as soon as the first option is in view.
        hint.hidden = entries.some((entry) => entry.isIntersecting);
      },
      { root: panel, threshold: 0.5 },
    );
    optionsWatcher.observe(first);
  }

  function toggleMute(): void {
    const muted = !sound.isMuted();
    sound.setMuted(muted);
    if (!options.settings.save({ muted })) addNotice(T.notices.saveFailed);
    paintMute();
  }

  function setSheet(next: 'open' | 'collapsed'): void {
    window.clearTimeout(sheetTimer);
    sheet = next;
    root.dataset.sheet = sheet;
    sheetButton.textContent = sheet === 'open' ? T.sheet.collapse : T.sheet.expand;
    sheetButton.setAttribute('aria-expanded', String(sheet === 'open'));
    logger.info('sheet.toggled', { open: sheet === 'open' });
    // The camera frames the building in what is free; wait for the layout to settle.
    window.setTimeout(updateInsets, 0);
    window.setTimeout(updateInsets, 260);
  }

  /** G-63: on a phone the sheet folds away by itself for a moment when a floor is set. */
  function glimpseBuilding(): void {
    const tall = !window.matchMedia('(min-width: 900px) and (min-aspect-ratio: 5/4)').matches;
    if (!tall || !hasPicture() || env.reducedMotion || sheet === 'collapsed') return;
    setSheet('collapsed');
    sheetTimer = window.setTimeout(() => setSheet('open'), TUNING.sequence.floorSetSeconds * 1000);
  }

  /** G-60: the numbers count from the old value to the new one instead of jumping. */
  function countGauges(): void {
    for (const gauge of hudHost.querySelectorAll<HTMLElement>('[data-from]')) {
      const number = gauge.querySelector<HTMLElement>('.gauge-number');
      const from = Number(gauge.dataset.from);
      const to = Number(gauge.dataset.value);
      if (!number || from === to || env.reducedMotion) continue;
      const started = env.now();
      const tick = (): void => {
        const share = Math.min(1, (env.now() - started) / 450);
        number.textContent = String(Math.round(from + (to - from) * share));
        if (share < 1 && number.isConnected) window.requestAnimationFrame(tick);
      };
      number.textContent = String(from);
      window.requestAnimationFrame(tick);
    }
  }

  /**
   * The canvas fills the window and the HTML floats above it. The view is told which
   * part is covered, so it frames the building in what remains visible.
   */
  function updateInsets(): void {
    if (!view) return;
    const host = canvasHost.getBoundingClientRect();
    const card = panel.getBoundingClientRect();
    const bar = topBar.getBoundingClientRect();
    const top = Math.max(0, bar.bottom - host.top);
    // N2: while the sequence plays the text is out of the way and the site has the whole stage.
    if (sequence) {
      view.setInsets({ top, right: 0, bottom: 0, left: 0 });
      return;
    }
    // A panel that leaves most of the width free sits at the side; otherwise it is the bottom sheet.
    const atSide = card.left - host.left > host.width * 0.35;
    view.setInsets(
      atSide
        ? { top, right: Math.max(0, host.right - card.left), bottom: 0, left: 0 }
        : { top, right: 0, bottom: Math.max(0, host.bottom - card.top), left: 0 },
    );
  }

  function findLevel(id: string): Level | null {
    return levels.find((l) => l.level.id === id)?.level ?? null;
  }

  function activeRun(): { run: LevelRun; level: Level } | null {
    const run = progress.currentRun;
    if (!run) return null;
    const level = findLevel(run.levelId);
    return level ? { run, level } : null;
  }

  function addNotice(message: string): void {
    if (!notices.includes(message)) notices.push(message);
  }

  function save(): void {
    if (!store.save(progress)) addNotice(T.notices.saveFailed);
  }

  /** Counts the time since the last action as play time, but only while a level is running. */
  function trackTime(): void {
    const now = env.now();
    if (progress.currentRun) {
      progress = addPlayTime(progress, Math.min(now - lastActionAt, IDLE_CAP_MS));
    }
    lastActionAt = now;
  }

  function report(): string {
    const run = progress.currentRun;
    return buildErrorReport({
      version: options.build.version,
      commit: options.build.commit,
      time: env.timestamp(),
      userAgent: env.userAgent,
      viewport: env.viewport(),
      renderer: options.rendererName,
      render: view?.stats() ?? noStats,
      playTimeMs: progress.playTimeMs,
      levels: Object.entries(progress.levels).map(([id, lp]) => ({
        id,
        completed: lp.completed,
        stars: lp.best?.stars ?? 0,
        attempts: lp.attempts,
      })),
      run: run
        ? {
            levelId: run.levelId,
            seed: run.seed,
            recentIds: run.recentIds,
            choices: run.history.map((c) => c.optionId),
            tour: registeredRisks(run.tour),
            phase: run.phase,
            outcome: run.outcome,
            gauges: { ...run.gauges },
          }
        : null,
      entries: logger.entries(),
    });
  }

  function copyReport(text: string, status: HTMLElement): void {
    logger.info('report.copy.requested');
    env.copyText(text).then(
      () => {
        logger.info('report.copy.ok');
        status.textContent = T.menuScreen.copied;
      },
      (cause: unknown) => {
        // No clipboard access (permissions, insecure context): the visible text field is the fallback.
        logger.warn('report.copy.failed', errorData(cause));
        status.textContent = T.menuScreen.copyFailed;
      },
    );
  }

  /** `force` skips the lock; only the debug overlay uses it. */
  function startLevel(levelId: string, force = false): void {
    const entry = levels.find((l) => l.level.id === levelId);
    const unlocked = force || isUnlocked(progress, levelOrder, levelId);
    if (!entry || !entry.available || !unlocked) {
      logger.warn('level.start.rejected', { levelId });
      return;
    }
    trackTime();
    const lp = levelProgress(progress, levelId);
    const seed = env.nextSeed();
    const run = startRun(entry.level, seed, {
      recentIds: lp.recentIds,
      canSkipTheory: lp.theorySeen,
    });
    logger.info('level.start', { levelId, seed, attempt: lp.attempts + 1 });
    progress = withRun(progress, run);
    lastActionAt = env.now();
    save();
    render();
  }

  /** Which place of the tour shows its card; not part of the game state, so a reload closes it. */
  let openSite: string | null = null;

  function openPlace(siteId: string | null): void {
    openSite = siteId;
    render();
  }

  /** The next place still to judge after the given one, so the tour reads like a walk. */
  function nextOpenPlace(run: LevelRun, after: string): string | null {
    const ids = run.tour?.siteIds ?? [];
    const from = ids.indexOf(after);
    const ahead = [...ids.slice(from + 1), ...ids.slice(0, from)];
    return ahead.find((id) => !Object.hasOwn(run.tour?.judgements ?? {}, id)) ?? null;
  }

  function dispatch(action: Action): void {
    const active = activeRun();
    if (!active) return;
    trackTime();
    const before = active.run;
    const after = step(before, active.level, action);
    if (action.type === 'choose') {
      sound.play('choice');
      sound.play('floor');
      if (criticalGauges(after.gauges).length > criticalGauges(before.gauges).length) {
        sound.play('warning');
      }
      glimpseBuilding();
      const choice = after.history[after.history.length - 1];
      logger.info('choice.made', {
        levelId: after.levelId,
        situationId: choice?.situationId,
        optionId: action.optionId,
        rating: choice?.rating,
        budget: after.gauges.budget,
        zeit: after.gauges.zeit,
        stabilitaet: after.gauges.stabilitaet,
        outcome: after.outcome,
      });
    } else if (action.type === 'classify') {
      sound.play('choice');
      openSite = nextOpenPlace(after, action.siteId);
      logger.info('tour.classify', {
        levelId: after.levelId,
        siteId: action.siteId,
        risk: action.risk,
        judged: after.tour ? judgedCount(after.tour) : 0,
      });
    } else if (action.type === 'finishTour') {
      openSite = null;
      logger.info('tour.finish', {
        levelId: after.levelId,
        correct: after.tour?.result?.correct,
        grade: after.tour?.result?.grade,
        points: after.tour?.result?.points,
        judged: after.tour ? judgedCount(after.tour) : 0,
        budget: after.gauges.budget,
        zeit: after.gauges.zeit,
        stabilitaet: after.gauges.stabilitaet,
      });
    } else {
      logger.info(action.type === 'skipTheory' ? 'theory.skipped' : 'phase.changed', {
        levelId: after.levelId,
        from: before.phase,
        to: after.phase,
        step: after.step,
        theoryIndex: after.theoryIndex,
      });
    }
    if (after.phase === 'tour' && before.phase !== 'tour') {
      openSite = null;
      logger.info('tour.start', {
        levelId: after.levelId,
        seed: after.seed,
        siteIds: after.tour?.siteIds.join(','),
      });
    }
    if (after.phase === 'result' && before.phase !== 'result') {
      progress = finishRun(progress, after, active.level);
      startSequence(after);
      logger.info(`level.${after.outcome}`, {
        levelId: after.levelId,
        stars: starsFor(after),
        budget: after.gauges.budget,
        zeit: after.gauges.zeit,
        stabilitaet: after.gauges.stabilitaet,
      });
    } else {
      progress = withRun(progress, after);
    }
    save();
    render();
  }

  function leaveRun(): void {
    if (sequence) endSequence(true);
    trackTime();
    logger.info('level.left', {
      levelId: progress.currentRun?.levelId,
      phase: progress.currentRun?.phase,
    });
    const finished = progress.currentRun?.outcome === 'completed';
    progress = clearRun(progress);
    overlay = 'none';
    // G-53: finishing the last building leads to the closing screen instead of the start page.
    if (finished && allCompleted()) {
      logger.info('finale.opened', { from: 'level' });
      sound.play('plane');
      finale = true;
    }
    save();
    render();
  }

  function toggleMenu(): void {
    if (overlay === 'error') return;
    if (sequence) endSequence(true);
    overlay = overlay === 'none' ? 'menu' : 'none';
    logger.info('menu.toggled', { open: overlay === 'menu' });
    render();
  }

  function resetProgress(): void {
    finale = false;
    logger.info('progress.reset');
    const cleared = store.clear();
    progress = emptyProgress();
    notices = [cleared ? T.notices.resetDone : T.notices.resetFailed];
    overlay = 'none';
    render();
  }

  function nextLevelAfter(level: Level): (() => void) | null {
    const next = levels[levelOrder.indexOf(level.id) + 1];
    if (!next || !next.available || !isUnlocked(progress, levelOrder, next.level.id)) return null;
    return () => startLevel(next.level.id);
  }

  function buildScreen(): HTMLElement {
    if (overlay === 'error') {
      return errorScreen(report(), { copy: copyReport, reload: () => env.reload() });
    }
    if (overlay === 'confirm-reset') {
      return confirmResetScreen({
        yes: resetProgress,
        no: () => {
          overlay = 'menu';
          render();
        },
      });
    }
    const active = activeRun();
    if (overlay === 'menu') {
      return menuScreen(report(), options.build, notices, {
        copy: copyReport,
        back: toggleMenu,
        abort: active ? leaveRun : null,
        askReset: () => {
          overlay = 'confirm-reset';
          render();
        },
      });
    }
    if (!active) {
      if (looking) return lookScreen(() => setLooking(false));
      if (finale && allCompleted()) {
        const stars = totalStars(levels, progress);
        const title = T.finale.titles[cityTitle(stars, levels.length * 3)];
        return finaleScreen(levels, progress, title, {
          look: hasPicture() ? () => setLooking(true) : null,
          save: hasPicture() ? savePicture : null,
          again: () => {
            logger.info('finale.closed');
            finale = false;
            render();
          },
        });
      }
      const screen = cityScreen(levels, progress, notices, options.contentErrors, {
        startLevel,
        showFinale: () => {
          logger.info('finale.opened', { from: 'start' });
          sound.play('plane');
          finale = true;
          render();
        },
      });
      // Notices are shown once; after that they would only be noise.
      notices = [];
      return screen;
    }
    const { run, level } = active;
    const handlers = {
      next: () => dispatch({ type: 'continue' }),
      skipTheory: () => dispatch({ type: 'skipTheory' }),
      choose: (option: Option) => dispatch({ type: 'choose', optionId: option.id }),
    };
    switch (run.phase) {
      case 'briefing':
        return briefingScreen(level, run, handlers);
      case 'theory':
        return theoryScreen(level, run, handlers);
      case 'tour':
        return tourScreen(
          level,
          run,
          openSite,
          {
            open: openPlace,
            classify: (siteId, risk) => dispatch({ type: 'classify', siteId, risk }),
            finish: () => dispatch({ type: 'finishTour' }),
            next: handlers.next,
          },
          options.showDraftLabels ?? false,
        );
      case 'tourResult':
        return tourResultScreen(level, run, handlers);
      case 'situation':
        return situationScreen(
          level,
          run,
          currentSituation(run, level),
          currentOptions(run, level),
          handlers,
          options.showDraftLabels ?? false,
        );
      case 'feedback':
        return feedbackScreen(level, run, handlers);
      case 'result':
        if (sequence && run.outcome !== 'running') {
          const stars = starsFor(run);
          const plan = resultSequence(run.outcome, stars, env.reducedMotion);
          // Without a picture to watch there is nothing to wait for: show banner and stars at once.
          const staged = hasPicture() && !env.reducedMotion;
          return sequenceScreen(
            run.outcome,
            stars,
            staged ? { bannerAt: plan.bannerAt, starsAt: plan.starsAt } : null,
            // N2: with two stars paper rains across the whole picture.
            staged && celebrationFor(stars).effect === 'konfetti',
            () => endSequence(true),
          );
        }
        return resultScreen(level, run, {
          restart: () => startLevel(level.id),
          toCity: leaveRun,
          nextLevel: run.outcome === 'completed' ? nextLevelAfter(level) : null,
        });
    }
  }

  function render(): void {
    try {
      const screen = buildScreen();
      clear(panel);
      panel.append(screen);
      panel.scrollTop = 0;

      clear(hudHost);
      const active = activeRun();
      if (active && overlay !== 'error') {
        hudHost.append(hud(active.run));
        countGauges();
      }
      root.dataset.mode = active ? 'level' : 'city';
      root.dataset.presenting = sequence ? 'true' : 'false';
      root.dataset.phase = active && overlay === 'none' ? active.run.phase : 'none';
      watchOptions();
      menuButton.hidden = overlay === 'error';

      view?.render(sceneModel(levels, progress, active?.run ?? null, { finale }));
      root.dataset.looking = looking ? 'true' : 'false';
      updateInsets();
      renderDebug();
      const focused = screen.querySelector<HTMLElement>('[data-focus]');
      focused?.focus({ preventScroll: true });
      // Every screen starts at its top, except the tour: there the place just opened must be
      // in view, wherever it is in the list.
      if (active?.run.phase === 'tour' && openSite !== null) {
        focused?.closest('li')?.scrollIntoView({ block: 'nearest' });
      }
    } catch (cause) {
      showFatal(cause);
    }
  }

  function showFatal(cause: unknown): void {
    logger.error('app.fatal', errorData(cause));
    if (overlay === 'error') return;
    overlay = 'error';
    try {
      clear(hudHost);
      clear(panel);
      panel.append(errorScreen(report(), { copy: copyReport, reload: () => env.reload() }));
      menuButton.hidden = true;
    } catch (inner) {
      // Last resort: even the error page failed. Leave a plain sentence rather than a white page.
      logger.error('app.fatal.render', errorData(inner));
      panel.textContent = `${T.error.heading}. ${T.error.lead}`;
    }
  }

  /** N-104: keys 1 to 3 choose an option, Enter triggers the primary button. */
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && sequence) {
      event.preventDefault();
      endSequence(true);
      return;
    }
    if (looking) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setLooking(false);
        return;
      }
      // The keyboard's way of turning the city; dragging does the same for the pointer.
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        view?.orbit(event.key === 'ArrowLeft' ? -0.2 : 0.2);
        return;
      }
    }
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName ?? '';
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;
    if (['1', '2', '3'].includes(event.key)) {
      const option = panel.querySelector<HTMLButtonElement>(`button[data-key="${event.key}"]`);
      if (option) {
        event.preventDefault();
        option.click();
      }
      return;
    }
    // On a focused button or link, Enter already does the right thing natively.
    if (event.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') {
      const primary = panel.querySelector<HTMLButtonElement>('button[data-primary]');
      if (primary) {
        event.preventDefault();
        primary.click();
      }
    }
  }

  function restore(): void {
    const outcome = store.load();
    progress = outcome.progress;
    if (outcome.status === 'invalid') addNotice(T.notices.invalid);
    if (outcome.status === 'outdated') addNotice(T.notices.outdated);
    if (outcome.status === 'migrated' && outcome.droppedRun) addNotice(T.notices.migrated);
    if (outcome.status === 'unavailable') addNotice(T.notices.unavailable);

    const run = progress.currentRun;
    if (!run) return;
    const entry = levels.find((l) => l.level.id === run.levelId);
    if (!entry || !entry.available || !isRunConsistent(run, entry.level)) {
      logger.warn('storage.run.stale', { levelId: run.levelId });
      progress = clearRun(progress);
      addNotice(T.notices.staleRun);
      save();
      return;
    }
    logger.info('level.resumed', { levelId: run.levelId, phase: run.phase, step: run.step });
  }

  return {
    start(): void {
      clear(root);
      root.append(canvasHost, topBar, panel, sheetButton, debugHost);
      root.dataset.sheet = sheet;
      sheetButton.textContent = T.sheet.collapse;
      sheetButton.setAttribute('aria-expanded', 'true');
      paintMute();
      // F-804: the first tap or key press is what allows the browser to make a sound at all.
      const unlock = (): void => {
        sound.unlock();
        sound.setAmbience(true);
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
      };
      document.addEventListener('pointerdown', unlock);
      document.addEventListener('keydown', unlock);
      restore();
      try {
        view = options.createView(canvasHost);
      } catch (cause) {
        // The game must stay playable without graphics (N-207).
        logger.error('render.init.failed', errorData(cause));
        addNotice(T.notices.noWebgl);
        view = null;
      }
      root.dataset.renderer = view ? options.rendererName : 'none';
      document.addEventListener('keydown', onKeyDown);
      window.addEventListener('resize', updateInsets);
      if (options.debug) {
        logger.info('debug.enabled');
        // The frame rate changes without any action of the player, so the overlay refreshes itself.
        window.setInterval(renderDebug, 500);
      }
      logger.info('app.ready', { levels: levels.length, renderer: options.rendererName });
      render();
    },
    showFatal,
  };
}
