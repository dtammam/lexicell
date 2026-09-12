<script lang="ts">
  import type { Action, EngineContext } from '../engine/reducer';
  import type { RunMode, RunState } from '../engine/types';
  import { loadContext } from './context';
  import Fight from './Fight.svelte';
  import Intro from './Intro.svelte';
  import { createPersist } from './persist';
  import Pick from './Pick.svelte';
  import { browserStorage } from './storage';
  import { createStore, type Store } from './store';
  import Summary from './Summary.svelte';
  import Title from './Title.svelte';
  import Compendium from './Compendium.svelte';
  import Help from './Help.svelte';
  import History from './History.svelte';
  import CellPick from './CellPick.svelte';
  import Event from './Event.svelte';
  import ReleaseNotes from './ReleaseNotes.svelte';
  import Evolve from './Evolve.svelte';
  import { appendRun, clearHistory, entryFrom, loadHistory, markRunStarted, runStartedAt, type HistoryEntry } from './history';
  import { loadSettings, saveSettings, type Settings } from './settings';
  import { audio } from './audio';
  import SettingsScreen from './Settings.svelte';
  import { RELEASE_NOTES } from './release-notes';
  import { sfxForTransition } from './audio-events';
  import { dailyPlayedDay, dailySeed, isDailyRun, markDailyPlayed } from './daily';
  import { dayNumber } from './definitions';
  import { DEFAULT_CELL } from '../content/cells';

  // The seed is the only wall-clock the game reads, and it is read here, never in the engine.
  const seed = () => Date.now() >>> 0;
  // The Vite base URL, so the header wordmark resolves under GitHub Pages' subpath too.
  const base = import.meta.env.BASE_URL;
  const storage = browserStorage();
  const persist = createPersist(storage);
  // Per-device settings (Dean, 2026-09-08): the Readable type toggle, and (2026-09-10) independent
  // sound-effects and music mute/volume, all reached from the always-available Settings page.
  let settings: Settings = $state.raw(loadSettings(storage));
  function toggleReadable() {
    settings = { ...settings, readable: !settings.readable };
    saveSettings(storage, settings);
  }
  function toggleSfxMuted() {
    settings = { ...settings, sfxMuted: !settings.sfxMuted };
    saveSettings(storage, settings);
    audio.unlock(); // the toggle click is a user gesture, so effects become audible at once
  }
  function onSetSfxVolume(v: number) {
    settings = { ...settings, sfxVolume: Math.min(1, Math.max(0, v)) };
    saveSettings(storage, settings);
  }
  function toggleMusicMuted() {
    settings = { ...settings, musicMuted: !settings.musicMuted };
    saveSettings(storage, settings);
    // The toggle click is a user gesture, so it may unlock audio and (re)start or stop the music.
    if (!settings.musicMuted) {
      audio.unlock();
      audio.startMusic();
    } else {
      audio.stopMusic();
    }
  }
  function onSetMusicVolume(v: number) {
    settings = { ...settings, musicVolume: Math.min(1, Math.max(0, v)) };
    saveSettings(storage, settings);
  }
  // A subtle click for a button press. Kept light: only the app-level navigation buttons use it.
  function tap() {
    audio.playSfx('tap');
  }
  // Music is decoded once (a 404 leaves it silently off); the mute/volume the engine applies follow
  // settings. The AudioContext itself waits for the first gesture below.
  void audio.loadMusic(`${base}audio/theme.mp3`);
  $effect(() => {
    audio.setSfxMuted(settings.sfxMuted);
    audio.setSfxVolume(settings.sfxVolume);
    audio.setMusicMuted(settings.musicMuted);
    audio.setMusicVolume(settings.musicVolume);
  });
  $effect(() => {
    // The first pointer/click anywhere unlocks the AudioContext (iOS Safari blocks audio before a
    // gesture) and, if sound is on, starts the music loop. Once is enough.
    let done = false;
    const onGesture = () => {
      if (done) return;
      done = true;
      audio.unlock();
      if (!settings.musicMuted) audio.startMusic();
    };
    window.addEventListener('pointerdown', onGesture, { once: true });
    window.addEventListener('click', onGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('click', onGesture);
    };
  });

  let ctx: EngineContext | null = $state.raw(null);
  let store: Store | null = $state.raw(null);
  let run: RunState | null = $state.raw(null);
  // The state before the latest action; Fight uses it to say what the grid held before a word was played.
  let prev: RunState | null = $state.raw(null);
  let error: string | null = $state.raw(null);
  type Screen = 'title' | 'cells' | 'intro' | 'run' | 'items' | 'help' | 'history' | 'notes' | 'settings';
  let screen: Screen = $state.raw('title');
  // Run history (Dean, 2026-09-08): finished and abandoned runs, per device, under their own key.
  let history: readonly HistoryEntry[] = $state.raw(loadHistory(storage));
  const BUILD = `${__BUILD_NUMBER__} · ${__BUILD_SHA__}`;
  const nowIso = () => new Date(Date.now()).toISOString();
  function record(state: RunState, outcome: 'won' | 'lost' | 'abandoned') {
    const startedAt = runStartedAt(storage, state.rng.seed);
    // A run is the daily when its seed is the daily seed of the day it started; that stamp survives a
    // reload, so a daily begun yesterday and finished today still records as daily.
    history = appendRun(storage, entryFrom(state, outcome, nowIso(), startedAt, BUILD, isDailyRun(state.rng.seed, startedAt)));
  }
  // The daily challenge (step 8): today's seed, the day it was last played (kept reactive so the
  // control flips to its done state after starting), and today's daily outcome if it finished.
  let dailyDay: number | null = $state.raw(dailyPlayedDay(storage));
  const todayDaily = $derived(dailySeed(new Date(Date.now())));
  const dailyOpen = $derived(dailyDay !== dayNumber(new Date(Date.now())));
  const dailyOutcome = $derived.by(() => {
    for (let i = history.length - 1; i >= 0; i--) {
      const r = history[i];
      if (r && r.daily && r.seed === todayDaily) return r.outcome;
    }
    return null;
  });
  // True when a run can be continued: a live in-memory run, or an unfinished save on disk before a
  // store exists. A run that reached its summary is not continuable, in memory or on disk (a title
  // visit after a win used to offer Continue and ask before New run; run-history wave).
  let savedOnDisk = $state.raw(false);
  const hasSave = $derived.by(() => (store && run ? run.phase !== 'summary' : savedOnDisk));
  let recoveries = 0;

  loadContext()
    .then((c) => {
      ctx = c;
      const saved = persist.load();
      savedOnDisk = saved !== null && saved.phase !== 'summary';
    })
    .catch((e: unknown) => {
      error = e instanceof Error ? e.message : String(e);
    });

  function openStore(c: EngineContext) {
    const s = createStore(c, persist, seed);
    s.subscribe((state) => {
      // A run that just reached its end is recorded once, at the transition into summary.
      if (state.phase === 'summary' && run && run.phase !== 'summary' && run.rng.seed === state.rng.seed && state.outcome) record(state, state.outcome);
      // A fresh run (seed changed, or the first state) gets its start time, once: a Continue after a
      // reload publishes with `run` null too and must not move it (gate W1).
      if ((!run || run.rng.seed !== state.rng.seed) && runStartedAt(storage, state.rng.seed) === null) markRunStarted(storage, state.rng.seed, nowIso());
      // Sound the state delta (playSfx no-ops when muted, so this respects the Sound toggle).
      for (const name of sfxForTransition(run, state)) audio.playSfx(name);
      prev = run;
      run = state;
    });
    store = s;
    screen = 'run';
  }

  /** Title: Continue. Resumes the in-memory run, or loads the save into a new store. */
  function onContinue() {
    if (!ctx) return;
    if (store) screen = 'run';
    else openStore(ctx);
  }

  /** Title: New run. Pick a starting cell first (Dean, 2026-09-08); nothing is abandoned until a cell is chosen. */
  function onPlay() {
    tap();
    if (!ctx) return;
    screen = 'cells';
  }
  /**
   * Cell chosen: replace whatever run existed (Title asked first when one did), then the intro.
   * A pasted seed (share card round-trip) is used verbatim; blank/invalid arrives as undefined and
   * the game rolls one from the clock, exactly as before.
   */
  function onCellPick(cellId: string, mode: RunMode, seedIn?: number) {
    if (!ctx) return;
    // Abandoning a live run records it as such (Dean, question 1); a run that already ended was recorded then.
    const live = store?.state ?? persist.load();
    if (live && live.phase !== 'summary') record(live, 'abandoned');
    persist.clear();
    if (!store) openStore(ctx);
    store?.dispatch({ type: 'newRun', seed: seedIn ?? seed(), cell: cellId, mode });
    screen = 'intro';
  }
  /**
   * Title: Today's challenge. Starts the daily run (today's seed, the default cell, normal mode) the
   * same way a cell pick does, so a live run is recorded as abandoned first. The day is stamped at the
   * start (not the finish), so abandoning the daily still counts as today's and it cannot be farmed.
   */
  function startDaily() {
    if (!ctx) return;
    const now = new Date(Date.now());
    markDailyPlayed(storage, now);
    dailyDay = dayNumber(now);
    onCellPick(DEFAULT_CELL, 'normal', dailySeed(now));
  }
  function onBegin() {
    screen = 'run';
  }

  function dispatch(action: Action) {
    store?.dispatch(action);
  }
  /** Summary: New run keeps the same cell for a quick retry; the title's New run goes through the picker. */
  function newRun() {
    dispatch(run ? { type: 'newRun', seed: seed(), cell: run.cell, mode: run.mode } : { type: 'newRun', seed: seed() });
  }
  /** Summary: Replay this seed starts the same run again (same seed, cell and mode), so a shared seed round-trips. */
  function replayRun() {
    if (run) dispatch({ type: 'newRun', seed: run.rng.seed, cell: run.cell, mode: run.mode });
  }
  function toTitle() {
    tap();
    screen = 'title';
  }
  function toItems() {
    tap();
    screen = 'items';
  }
  function toNotes() {
    tap();
    screen = 'notes';
  }
  function toHelp() {
    tap();
    screen = 'help';
  }
  // Settings is reachable from every screen via the top-bar gear; Back returns to wherever it opened.
  let settingsFrom: Screen = $state.raw('title');
  function toSettings() {
    tap();
    if (screen !== 'settings') settingsFrom = screen;
    screen = 'settings';
  }
  function fromSettings() {
    screen = settingsFrom;
  }
  // History remembers where it was opened from, so Back returns there (the summary, or the title).
  let historyFrom: 'title' | 'run' = $state.raw('title');
  function toHistory() {
    historyFrom = screen === 'run' ? 'run' : 'title';
    screen = 'history';
  }
  function fromHistory() {
    screen = historyFrom;
  }
  function onClearHistory() {
    clearHistory(storage);
    history = [];
  }

  /**
   * A saved run that passes persist's shape check but still breaks a screen would come
   * back on every reload. Drop it, start fresh, and re-render once; a second failure in
   * the same session is a real bug and stays on screen.
   */
  function recover(e: unknown, reset: () => void) {
    console.error('render failed', e);
    // A screen that is not the run (History, Mutations, How to play) must never cost the player
    // their run: go back to the title and keep the save (gate suggestion, run-history round).
    if (screen !== 'run' && recoveries++ < 1) {
      screen = 'title';
      setTimeout(reset, 0);
      return;
    }
    if (recoveries++ < 1 && store) {
      persist.clear();
      store.dispatch({ type: 'newRun', seed: seed() });
      // Svelte forbids reset() while the error is still being handled; re-render next tick.
      setTimeout(reset, 0);
    } else {
      error = e instanceof Error ? e.message : String(e);
    }
  }
</script>

<main data-readable={settings.readable ? '' : undefined}>
  <header class="top">
    <h1><img class="brand" src="{base}logo/bookends-wordmark.svg" alt="Lexicell" /></h1>
    <div class="bar-actions">
      {#if screen === 'run'}
        <button class="menu" onclick={toTitle}>Menu</button>
      {/if}
      {#if screen !== 'settings'}
        <button
          class="menu icon-toggle"
          class:is-muted={settings.sfxMuted}
          aria-pressed={settings.sfxMuted}
          aria-label={settings.sfxMuted ? 'Unmute sound effects' : 'Mute sound effects'}
          title={settings.sfxMuted ? 'Unmute sound effects' : 'Mute sound effects'}
          onclick={toggleSfxMuted}
        >
          <svg class="glyph" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
            <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" />
            <path d="M16.5 8.5 A5 5 0 0 1 16.5 15.5" />
          </svg>
        </button>
        <button
          class="menu icon-toggle"
          class:is-muted={settings.musicMuted}
          aria-pressed={settings.musicMuted}
          aria-label={settings.musicMuted ? 'Unmute music' : 'Mute music'}
          title={settings.musicMuted ? 'Unmute music' : 'Mute music'}
          onclick={toggleMusicMuted}
        >
          <svg class="glyph" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
            <circle cx="7.5" cy="17.5" r="3" />
            <path d="M10.5 17.5 V5 L18 3 V13" />
            <circle cx="15" cy="13" r="3" />
          </svg>
        </button>
        <button class="menu gear" aria-label="Settings" title="Settings" onclick={toSettings}>&#9881;</button>
      {/if}
    </div>
  </header>
  <div class="screen">
  <svelte:boundary onerror={recover}>
    {#if error}
      <p class="error">Something broke: {error}</p>
    {:else if !ctx}
      <p class="loading">Loading words...</p>
    {:else if screen === 'items'}
      <Compendium onBack={toTitle} />
    {:else if screen === 'help'}
      <Help onBack={toTitle} />
    {:else if screen === 'notes'}
      <ReleaseNotes onBack={toTitle} />
    {:else if screen === 'settings'}
      <SettingsScreen onBack={fromSettings} readable={settings.readable} onToggleReadable={toggleReadable} sfxMuted={settings.sfxMuted} sfxVolume={settings.sfxVolume} musicMuted={settings.musicMuted} musicVolume={settings.musicVolume} onToggleSfxMuted={toggleSfxMuted} {onSetSfxVolume} onToggleMusicMuted={toggleMusicMuted} {onSetMusicVolume} build={RELEASE_NOTES[0]?.build ?? null} sha={__BUILD_SHA__} />
    {:else if screen === 'history'}
      <History runs={history} onBack={fromHistory} onClear={onClearHistory} />
    {:else if screen === 'cells'}
      <CellPick onPick={onCellPick} onBack={toTitle} />
    {:else if screen === 'title' || !run}
      <Title {hasSave} {onPlay} {onContinue} onItems={toItems} onHelp={toHelp} onHistory={toHistory} onNotes={toNotes} onDaily={startDaily} dailySeed={todayDaily} dailyOpen={dailyOpen} dailyOutcome={dailyOutcome} />
    {:else if screen === 'intro'}
      <Intro {onBegin} cell={run?.cell ?? 'balanced'} />
    {:else if run.phase === 'fight'}
      <Fight {run} {prev} {dispatch} {ctx} />
    {:else if run.phase === 'pick' || run.phase === 'rest'}
      <Pick {run} {dispatch} />
    {:else if run.phase === 'event'}
      <Event {run} {dispatch} />
    {:else if run.phase === 'evolve' || run.phase === 'capability'}
      <Evolve {run} {dispatch} />
    {:else}
      <Summary {run} onNewRun={newRun} onHistory={toHistory} onReplay={replayRun} />
    {/if}
    {#snippet failed()}
      <p class="error">The saved run could not be drawn. Starting a new one.</p>
    {/snippet}
  </svelte:boundary>
  </div>
</main>

<style>
  /* Dean's rule (2026-09-08): the game never scrolls. The page is exactly one viewport tall.
     svh, not dvh (2026-09-10): on iOS Safari with the address bar and toolbar shown, dvh tracks
     the dynamic viewport, so the fight spilled behind the bottom toolbar. svh is the SMALL
     viewport (chrome visible), the height that is always on screen; the layout fits inside it. */
  main {
    box-sizing: border-box;
    height: 100svh;
    max-width: 480px;
    margin: 0 auto;
    padding: var(--s2) var(--s3);
    padding-top: max(var(--s2), env(safe-area-inset-top));
    padding-bottom: max(var(--s2), env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
  }
  .top {
    flex: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0 0 var(--s1);
  }
  h1 {
    /* line-height 0 so the image sets the header height, not a text line box. */
    margin: 0;
    line-height: 0;
  }
  /* The Bookends wordmark stands in for the app name: sized to the height of the HUD text it
     replaced (~20px) so the header footprint and the Menu button's position do not move. */
  .brand {
    display: block;
    height: 20px;
    width: auto;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
  }
  .menu {
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    letter-spacing: 0.1em;
    background: var(--panel);
    border: 2px solid var(--shade);
    box-shadow: 2px 2px 0 var(--shade);
    color: var(--ink);
    border-radius: var(--radius);
    padding: var(--s2) var(--s3);
    touch-action: manipulation;
  }
  /* The right-hand controls sit in a row: Menu (run only) beside the always-present Settings gear.
     Both share the .menu box, so the header footprint on the run screen never grows. */
  .bar-actions {
    display: flex;
    align-items: center;
    gap: var(--s2);
  }
  /* The gear is a square .menu: system font so the glyph renders, the same height as Menu. */
  .gear {
    font-family: system-ui, sans-serif;
    letter-spacing: 0;
    padding-left: var(--s2);
    padding-right: var(--s2);
  }
  /* The sfx and music toggles are square .menu buttons sized to match the gear, each centering an
     inline SVG. position:relative anchors the muted slash. */
  .icon-toggle {
    position: relative;
    display: grid;
    place-items: center;
    padding-left: var(--s2);
    padding-right: var(--s2);
    line-height: 0;
  }
  /* The glyph inherits the button colour via currentColor; ~1.1em reads at the gear glyph's weight. */
  .icon-toggle .glyph {
    display: block;
    width: 1.1em;
    height: 1.1em;
  }
  /* Off is unmistakable: dim the glyph and draw one diagonal slash across the icon. Both toggles
     share the treatment, so the on/off language is uniform; the speaker vs note shapes distinguish them. */
  .icon-toggle.is-muted {
    color: var(--muted);
  }
  .icon-toggle.is-muted::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 1.4em;
    height: 2px;
    background: var(--muted);
    transform: translate(-50%, -50%) rotate(45deg);
    pointer-events: none;
  }
  .screen {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    /* Never a scrollbar (Dean saw one flicker on desktop when the report grew a line): the
       fight's grid absorbs a report line, so a screen that fits never scrolls. A viewport the
       screen cannot fit (a phone in landscape, a zoomed page: playtester on an iPhone 17,
       2026-09-08, lost the top in portrait and the actions in landscape) must still reach
       every control, so overflow scrolls with the scrollbar hidden instead of clipping. */
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    overscroll-behavior: contain;
  }
  .screen::-webkit-scrollbar {
    display: none;
  }
  .screen > :global(*) {
    flex: 1 0 auto;
    min-height: 100%;
  }
  /* Landscape on a phone: the fight lays out in two columns (Fight.svelte), so the page widens. */
  @media (orientation: landscape) and (max-height: 560px) {
    main {
      max-width: 960px;
    }
  }
  .error {
    color: var(--harm);
  }
  .loading {
    color: var(--muted);
    font-family: var(--font-hud);
    font-size: var(--hud-m);
  }
</style>
