<script lang="ts">
  import { CONTENT } from '../content/index';
  import type { ItemDef, Rarity } from '../engine/types';
  import ItemIcon from './ItemIcon.svelte';

  // Every organelle in the game, by rarity, with what it does (Dean, 2026-09-08).
  let { onBack }: { onBack: () => void } = $props();

  const ORDER: readonly Rarity[] = ['common', 'uncommon', 'rare', 'mythic'];
  // Curses (variety wave step 6) are never drafted as boons, so they stand apart from the rarity groups.
  const draftable = CONTENT.items.filter((i) => !i.curse);
  const curses = CONTENT.items.filter((i) => i.curse);
  const groups: readonly { rarity: Rarity; items: readonly ItemDef[] }[] = ORDER.map((rarity) => ({
    rarity,
    items: draftable.filter((i) => i.rarity === rarity),
  }));
</script>

<section class="compendium">
  <header>
    <h2>Organelles</h2>
    <button class="btn" onclick={onBack}>Back</button>
  </header>
  <p class="hint">{draftable.length} to find. Offers draw three you do not carry, weighted common 3, uncommon 2, rare 1, mythic 0.35, and never more than two commons at once. After act 1, an offer may come cursed.</p>
  <div class="list">
    {#each groups as group (group.rarity)}
      <h3 class={group.rarity}>{group.rarity} ({group.items.length})</h3>
      {#each group.items as item (item.id)}
        <div class="entry">
          <ItemIcon id={item.id} size={32} />
          <span class="text">
            <span class="name">{item.name}</span>
            <span class="desc">{item.description}</span>
            <span class="flavor">{item.flavor}</span>
          </span>
        </div>
      {/each}
    {/each}
    {#if curses.length > 0}
      <h3 class="curse">curses ({curses.length})</h3>
      {#each curses as item (item.id)}
        <div class="entry">
          <ItemIcon id={item.id} size={32} />
          <span class="text">
            <span class="name">{item.name}</span>
            <span class="desc">{item.description}</span>
            <span class="flavor">{item.flavor}</span>
          </span>
        </div>
      {/each}
    {/if}
  </div>
</section>

<style>
  .compendium {
    display: flex;
    flex-direction: column;
    gap: var(--s3);
    min-height: 0;
  }
  header {
    flex: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--head);
  }
  .hint {
    flex: none;
    margin: 0;
    color: var(--muted);
    font-size: var(--text);
  }
  /* The one screen allowed to scroll: it is a list, not the game. */
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    padding-right: var(--s1);
  }
  h3 {
    margin: var(--s2) 0 0;
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--muted);
  }
  h3.uncommon {
    color: var(--life);
  }
  h3.rare {
    color: var(--rare);
  }
  h3.mythic {
    color: var(--mythic);
    text-shadow: 0 0 6px var(--mythic);
  }
  h3.curse {
    color: var(--harm);
  }
  .entry {
    display: flex;
    align-items: center;
    gap: var(--s3);
    padding: var(--s2) var(--s3);
    background: var(--panel);
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: var(--s1);
    min-width: 0;
  }
  .name {
    font-family: var(--font-head);
    font-size: var(--name);
  }
  .flavor {
    color: var(--score);
    font-size: var(--text);
  }
  .desc {
    color: var(--muted);
    font-size: var(--text);
    line-height: 1.35;
  }
</style>
