<script lang="ts">
  import type { Action } from '../engine/reducer';
  import type { RunState } from '../engine/types';
  import { traitDef } from './lookup';

  let { run, dispatch }: { run: RunState; dispatch: (action: Action) => void } = $props();

  const offer = $derived(run.offer ?? []);
  const held = $derived(run.player.traits.map((id) => traitDef(id).name));
</script>

<!-- Evolution (variety wave step 3): three traits after a boss, one kept for the run. -->
<section class="evolve">
  <h2>Evolve</h2>
  <p class="hint">The boss is down and your body wants to change. Pick one trait. It is yours for the whole run, and a mutation pick follows.</p>
  {#each offer as id, i (id)}
    {@const t = traitDef(id)}
    <button class="offer" onclick={() => { dispatch({ type: 'pickTrait', index: i }); }}>
      <span class="text">
        <span class="name">{t.name}</span>
        <span class="desc">{t.description}</span>
        <span class="flavor">{t.flavor}</span>
      </span>
    </button>
  {/each}
  {#if held.length > 0}
    <p class="held">You already are: {held.join(', ')}</p>
  {/if}
</section>

<style>
  .evolve {
    display: flex;
    flex-direction: column;
    gap: var(--s3);
  }
  h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--name);
  }
  .hint,
  .held {
    margin: 0;
    color: var(--muted);
    font-size: var(--text);
  }
  .offer {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--s3);
    text-align: left;
    padding: var(--s3);
    border: 2px solid var(--score);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    background: var(--panel);
    color: var(--ink);
    font-family: var(--font-ui);
    touch-action: manipulation;
    transition: transform var(--dur-state) var(--ease-step), box-shadow var(--dur-state) var(--ease-step);
  }
  .offer:active {
    transform: translate(3px, 3px);
    box-shadow: var(--shadow-press);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: var(--s1);
    min-width: 0;
  }
  .name {
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--name);
    color: var(--score);
  }
  .desc {
    color: var(--ink);
    font-size: var(--text);
    line-height: 1.35;
  }
  .flavor {
    color: var(--muted);
    font-size: var(--text);
  }
</style>
