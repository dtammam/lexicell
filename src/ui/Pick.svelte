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
  <p class="hint">{run.pendingPicks > 0 ? 'Tap one. You keep it for the whole run, and your first fight starts right after.' : 'Tap one to add it to your cell. The next fight starts right after.'}</p>
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
    gap: var(--s3);
  }
  h2 {
    margin: 0;
    font-family: var(--font-hud);
    font-size: var(--hud-m);
  }
  .hint {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
  }
  .offer {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--s1);
    text-align: left;
    padding: var(--s3);
    border: 2px solid var(--shade);
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
  .name {
    font-family: var(--font-hud);
    font-size: var(--hud-m);
    display: flex;
    gap: var(--s2);
    align-items: baseline;
  }
  .desc {
    color: var(--muted);
    font-size: 14px;
    line-height: 1.35;
  }
  small {
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    color: var(--muted);
  }
  small.uncommon {
    color: var(--life);
  }
  small.rare {
    color: var(--rare);
  }
  .owned {
    color: var(--muted);
    font-size: 13px;
  }
</style>
