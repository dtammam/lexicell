<script lang="ts">
  import type { Action } from '../engine/reducer';
  import type { RunState } from '../engine/types';
  import { capabilityDef, traitDef } from './lookup';

  let { run, dispatch }: { run: RunState; dispatch: (action: Action) => void } = $props();

  // The screen serves two post-boss picks (v11): the trait (phase 'evolve') and then the capability
  // (phase 'capability'). Both draw from run.offer; the phase decides which vocabulary it holds.
  const capability = $derived(run.phase === 'capability');
  const offer = $derived(run.offer ?? []);
  const held = $derived(run.player.traits.map((id) => traitDef(id).name));
  const heldCaps = $derived(run.evolution.caps.map((id) => capabilityDef(id).name));
</script>

<!-- Evolution (variety wave step 3): a trait after a boss; then (v11) a capability, a new verb of play. -->
<section class="evolve">
  {#if capability}
    <h2>Evolve</h2>
    <p class="hint">Your body reaches for a new ability. Pick one capability. It is yours for the whole run.</p>
    {#each offer as id, i (id)}
      {@const c = capabilityDef(id)}
      <button class="offer" onclick={() => { dispatch({ type: 'pickCapability', index: i }); }}>
        <span class="text">
          <span class="name">{c.name}</span>
          <span class="desc">{c.description}</span>
          <span class="flavor">{c.flavor}</span>
        </span>
      </button>
    {/each}
    {#if heldCaps.length > 0}
      <p class="held">You can already: {heldCaps.join(', ')}</p>
    {/if}
  {:else}
    <h2>Evolve</h2>
    <p class="hint">The boss is down and your body wants to change. Pick one trait. It is yours for the whole run, and a capability pick follows.</p>
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
