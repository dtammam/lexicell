<script lang="ts">
  import ItemIcon from './ItemIcon.svelte';
  import { itemDef } from './lookup';

  // A tap on the item strip opens the sheet; every carried item with its name, rarity and text.
  let { items }: { items: readonly string[] } = $props();
  let open = $state.raw(false);
</script>

{#if items.length > 0}
  <div class="panel">
  <button class="strip" onclick={() => { open = !open; }} aria-expanded={open}>
    <span class="icons">{#each items as id, i (`${id}-${i}`)}<ItemIcon {id} size={24} />{/each}</span>
    <span class="label">Items ({items.length}): {items.map((id) => itemDef(id).name).join(', ')}</span>
  </button>
  {#if open}
    <ul class="sheet">
      {#each items as id, i (`${id}-${i}`)}
        {@const item = itemDef(id)}
        <li>
          <ItemIcon {id} size={32} />
          <span class="text">
            <span class="name">{item.name} <small class={item.rarity}>{item.rarity}</small></span>
            <span class="desc">{item.description}</span>
            <span class="flavor">{item.flavor}</span>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
  </div>
{/if}

<style>
  .panel {
    position: relative;
    flex: none;
  }
  .strip {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--s2);
    text-align: left;
    background: none;
    border: none;
    padding: var(--s1) 0;
    font-family: var(--font-ui);
    font-size: var(--text);
    color: var(--muted);
    touch-action: manipulation;
    text-decoration: underline dotted;
  }
  .sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 100%;
    z-index: 2;
    list-style: none;
    margin: 0 0 var(--s2);
    padding: var(--s3);
    background: var(--panel);
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    /* Opens upward; a long build must not run past the top of the screen. */
    max-height: min(60dvh, 420px);
    overflow-y: auto;
    scrollbar-width: none;
  }
  li {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--s3);
  }
  .icons {
    display: flex;
    gap: var(--s1);
    flex: none;
  }
  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    display: flex;
    gap: var(--s2);
    align-items: baseline;
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
  small.mythic {
    color: var(--mythic);
    text-shadow: 0 0 6px var(--mythic);
  }
</style>
