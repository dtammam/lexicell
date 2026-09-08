<script lang="ts">
  import type { Action } from '../engine/reducer';
  import type { RunState } from '../engine/types';
  import { itemDef } from './lookup';

  let { run, dispatch }: { run: RunState; dispatch: (action: Action) => void } = $props();

  const offer = $derived(run.offer ?? []);
  const owned = $derived(run.player.items.map((id) => itemDef(id).name));
</script>

<section class="pick">
  <h2>{run.pendingPicks > 0 ? 'Choose a starting item' : 'Choose an item'}</h2>
  {#each offer as id, i (id)}
    {@const item = itemDef(id)}
    <button class="offer" onclick={() => { dispatch({ type: 'pickItem', index: i }); }}>
      <span class="name">{item.name} <small class={item.rarity}>{item.rarity}</small></span>
      <span class="desc">{item.description}</span>
    </button>
  {/each}
  {#if owned.length > 0}
    <p class="owned">You carry: {owned.join(', ')}</p>
  {/if}
</section>

<style>
  .pick {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  h2 {
    margin: 0;
    font-size: 1.2rem;
  }
  .offer {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.3rem;
    text-align: left;
    padding: 0.9rem;
    border-radius: 10px;
    border: 2px solid #3d3d5c;
    background: #26263f;
    color: #eaeaea;
    touch-action: manipulation;
  }
  .name {
    font-size: 1.1rem;
    font-weight: 700;
  }
  .desc {
    color: #b8b8d0;
    font-size: 0.95rem;
  }
  small {
    font-weight: 400;
    text-transform: uppercase;
    font-size: 0.7rem;
    color: #9a9ab5;
  }
  small.uncommon {
    color: #5ac98a;
  }
  small.rare {
    color: #ffd166;
  }
  .owned {
    color: #9a9ab5;
    font-size: 0.85rem;
  }
</style>
