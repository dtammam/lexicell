<script lang="ts">
  import type { Action, EngineContext } from '../engine/reducer';
  import type { RunState } from '../engine/types';
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

  // The seed is the only wall-clock the game reads, and it is read here, never in the engine.
  const seed = () => Date.now() >>> 0;
  const storage = browserStorage();
  const persist = createPersist(storage);
  // Per-device settings (Dean, 2026-09-08): a Readable type toggle for players the pixel faces cost letters.
  let settings: Settings = $state.raw(loadSettings(storage));
  function toggleReadable() {
    settings = { ...settings, readable: !settings.readable };
    saveSettings(storage, settings);
  }

  let ctx: EngineContext | null = $state.raw(null);
  let store: Store | null = $state.raw(null);
  let run: RunState | null = $state.raw(null);
  // The state before the latest action; Fight uses it to say what the grid held before a word was played.
  let prev: RunState | null = $state.raw(null);
  let error: string | null = $state.raw(null);
  let screen: 'title' | 'cells' | 'intro' | 'run' | 'items' | 'help' | 'history' | 'notes' = $state.raw('title');
  // Run history (Dean, 2026-09-08): finished and abandoned runs, per device, under their own key.
  let history: readonly HistoryEntry[] = $state.raw(loadHistory(storage));
  const BUILD = `${__BUILD_NUMBER__} · ${__BUILD_SHA__}`;
  const nowIso = () => new Date(Date.now()).toISOString();
  function record(state: RunState, outcome: 'won' | 'lost' | 'abandoned') {
    history = appendRun(storage, entryFrom(state, outcome, nowIso(), runStartedAt(storage, state.rng.seed), BUILD));
  }
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

  const isWord = $derived((word: string) => ctx?.dictionary.has(word) ?? false);

  function openStore(c: EngineContext) {
    const s = createStore(c, persist, seed);
    s.subscribe((state) => {
      // A run that just reached its end is recorded once, at the transition into summary.
      if (state.phase === 'summary' && run && run.phase !== 'summary' && run.rng.seed === state.rng.seed && state.outcome) record(state, state.outcome);
      // A fresh run (seed changed, or the first state) gets its start time, once: a Continue after a
      // reload publishes with `run` null too and must not move it (gate W1).
      if ((!run || run.rng.seed !== state.rng.seed) && runStartedAt(storage, state.rng.seed) === null) markRunStarted(storage, state.rng.seed, nowIso());
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
    if (!ctx) return;
    screen = 'cells';
  }
  /** Cell chosen: replace whatever run existed (Title asked first when one did), then the intro. */
  function onCellPick(cellId: string) {
    if (!ctx) return;
    // Abandoning a live run records it as such (Dean, question 1); a run that already ended was recorded then.
    const live = store?.state ?? persist.load();
    if (live && live.phase !== 'summary') record(live, 'abandoned');
    persist.clear();
    if (!store) openStore(ctx);
    store?.dispatch({ type: 'newRun', seed: seed(), cell: cellId });
    screen = 'intro';
  }
  function onBegin() {
    screen = 'run';
  }

  function dispatch(action: Action) {
    store?.dispatch(action);
  }
  /** Summary: New run keeps the same cell for a quick retry; the title's New run goes through the picker. */
  function newRun() {
    dispatch(run ? { type: 'newRun', seed: seed(), cell: run.cell } : { type: 'newRun', seed: seed() });
  }
  function toTitle() {
    screen = 'title';
  }
  function toItems() {
    screen = 'items';
  }
  function toNotes() {
    screen = 'notes';
  }
  function toHelp() {
    screen = 'help';
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
    // A screen that is not the run (History, Organelles, How to play) must never cost the player
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
    <h1>Lexicell</h1>
    {#if screen === 'run'}
      <button class="menu" onclick={toTitle}>Menu</button>
    {/if}
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
      <Help onBack={toTitle} readable={settings.readable} onToggleReadable={toggleReadable} />
    {:else if screen === 'notes'}
      <ReleaseNotes onBack={toTitle} />
    {:else if screen === 'history'}
      <History runs={history} onBack={fromHistory} onClear={onClearHistory} />
    {:else if screen === 'cells'}
      <CellPick onPick={onCellPick} onBack={toTitle} />
    {:else if screen === 'title' || !run}
      <Title {hasSave} {onPlay} {onContinue} onItems={toItems} onHelp={toHelp} onHistory={toHistory} onNotes={toNotes} />
    {:else if screen === 'intro'}
      <Intro {onBegin} cell={run?.cell ?? 'balanced'} />
    {:else if run.phase === 'fight'}
      <Fight {run} {prev} {dispatch} {isWord} {ctx} />
    {:else if run.phase === 'pick' || run.phase === 'rest'}
      <Pick {run} {dispatch} />
    {:else if run.phase === 'event'}
      <Event {run} {dispatch} />
    {:else if run.phase === 'evolve'}
      <Evolve {run} {dispatch} />
    {:else}
      <Summary {run} onNewRun={newRun} onHistory={toHistory} />
    {/if}
    {#snippet failed()}
      <p class="error">The saved run could not be drawn. Starting a new one.</p>
    {/snippet}
  </svelte:boundary>
  </div>
</main>

<style>
  /* Dean's rule (2026-09-08): the game never scrolls. The page is exactly one viewport tall. */
  main {
    box-sizing: border-box;
    height: 100dvh;
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
    margin: 0 0 var(--s2);
  }
  h1 {
    font-family: var(--font-hud);
    font-size: var(--hud-m);
    letter-spacing: 0.1em;
    color: var(--muted);
    margin: 0;
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
