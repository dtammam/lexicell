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

  // The seed is the only wall-clock the game reads, and it is read here, never in the engine.
  const seed = () => Date.now() >>> 0;
  const persist = createPersist(browserStorage());

  let ctx: EngineContext | null = $state.raw(null);
  let store: Store | null = $state.raw(null);
  let run: RunState | null = $state.raw(null);
  // The state before the latest action; Fight uses it to say what the grid held before a word was played.
  let prev: RunState | null = $state.raw(null);
  let error: string | null = $state.raw(null);
  let screen: 'title' | 'intro' | 'run' = $state.raw('title');
  // True when a run can be continued: an in-memory store, or a save on disk before one exists.
  let hasSave = $state.raw(false);
  let recoveries = 0;

  loadContext()
    .then((c) => {
      ctx = c;
      const saved = persist.load();
      hasSave = saved !== null && saved.phase !== 'summary';
    })
    .catch((e: unknown) => {
      error = e instanceof Error ? e.message : String(e);
    });

  const isWord = $derived((word: string) => ctx?.dictionary.has(word) ?? false);

  function openStore(c: EngineContext) {
    const s = createStore(c, persist, seed);
    s.subscribe((state) => {
      prev = run;
      run = state;
    });
    store = s;
    hasSave = true;
    screen = 'run';
  }

  /** Title: Continue. Resumes the in-memory run, or loads the save into a new store. */
  function onContinue() {
    if (!ctx) return;
    if (store) screen = 'run';
    else openStore(ctx);
  }

  /** Title: New run. Replaces whatever run existed (Title asks first when one does), then the intro. */
  function onPlay() {
    if (!ctx) return;
    persist.clear();
    if (store) store.dispatch({ type: 'newRun', seed: seed() });
    else openStore(ctx);
    screen = 'intro';
  }
  function onBegin() {
    screen = 'run';
  }

  function dispatch(action: Action) {
    store?.dispatch(action);
  }
  function newRun() {
    dispatch({ type: 'newRun', seed: seed() });
  }
  function toTitle() {
    screen = 'title';
  }

  /**
   * A saved run that passes persist's shape check but still breaks a screen would come
   * back on every reload. Drop it, start fresh, and re-render once; a second failure in
   * the same session is a real bug and stays on screen.
   */
  function recover(e: unknown, reset: () => void) {
    console.error('render failed', e);
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

<main>
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
    {:else if screen === 'title' || !run}
      <Title {hasSave} {onPlay} {onContinue} />
    {:else if screen === 'intro'}
      <Intro {onBegin} />
    {:else if run.phase === 'fight'}
      <Fight {run} {prev} {dispatch} {isWord} {ctx} />
    {:else if run.phase === 'pick'}
      <Pick {run} {dispatch} />
    {:else}
      <Summary {run} onNewRun={newRun} />
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
    overflow-y: auto;
  }
  .screen > :global(*) {
    flex: 1;
    min-height: 0;
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
