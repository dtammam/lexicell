<script lang="ts">
  import type { Action } from '../engine/reducer';
  import type { RunState } from '../engine/types';
  import { loadContext } from './context';
  import Fight from './Fight.svelte';
  import { createPersist } from './persist';
  import Pick from './Pick.svelte';
  import { browserStorage } from './storage';
  import { createStore, type Store } from './store';
  import Summary from './Summary.svelte';

  // The seed is the only wall-clock the game reads, and it is read here, never in the engine.
  const seed = () => Date.now() >>> 0;

  const persist = createPersist(browserStorage());

  let store: Store | null = $state.raw(null);
  let run: RunState | null = $state.raw(null);
  let error: string | null = $state.raw(null);
  let recoveries = 0;

  loadContext()
    .then((ctx) => {
      const s = createStore(ctx, persist, seed);
      s.subscribe((state) => {
        run = state;
      });
      store = s;
    })
    .catch((e: unknown) => {
      error = e instanceof Error ? e.message : String(e);
    });

  function dispatch(action: Action) {
    store?.dispatch(action);
  }
  function newRun() {
    dispatch({ type: 'newRun', seed: seed() });
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
  <h1>Lexicell</h1>
  <svelte:boundary onerror={recover}>
    {#if error}
      <p class="error">Something broke: {error}</p>
    {:else if !run}
      <p class="loading">Loading words...</p>
    {:else if run.phase === 'fight'}
      <Fight {run} {dispatch} />
    {:else if run.phase === 'pick'}
      <Pick {run} {dispatch} />
    {:else}
      <Summary {run} onNewRun={newRun} />
    {/if}
    {#snippet failed()}
      <p class="error">The saved run could not be drawn. Starting a new one.</p>
    {/snippet}
  </svelte:boundary>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #1a1a2e;
    color: #eaeaea;
    font-family: system-ui, -apple-system, sans-serif;
    -webkit-tap-highlight-color: transparent;
  }
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 0.75rem;
    padding-top: max(0.75rem, env(safe-area-inset-top));
    padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
  }
  h1 {
    font-size: 1rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #9a9ab5;
    margin: 0 0 0.75rem;
  }
  .error {
    color: #ff8fa3;
  }
  .loading {
    color: #9a9ab5;
  }
</style>
