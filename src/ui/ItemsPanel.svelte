<script lang="ts">
  import { itemDef } from './lookup';

  // A tap on the item strip opens the sheet; every carried item with its name, rarity and text.
  let { items }: { items: readonly string[] } = $props();
  let open = $state.raw(false);
</script>

{#if items.length > 0}
  <div class="panel">
  <button class="strip" onclick={() => { open = !open; }} aria-expanded={open}>
    Items ({items.length}): {items.map((id) => itemDef(id).name).join(', ')}
  </button>
  {#if open}
    <ul class="sheet">
      {#each items as id, i (`${id}-${i}`)}
        {@const item = itemDef(id)}
        <li>
          <span class="name">{item.name} <small class={item.rarity}>{item.rarity}</small></span>
          <span class="desc">{item.description}</span>
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
    text-align: left;
    background: none;
    border: none;
    padding: 0.2rem 0;
    font-size: 0.85rem;
    color: #9a9ab5;
    touch-action: manipulation;
    text-decoration: underline dotted;
  }
  .sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 100%;
    z-index: 2;
    box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.5);
    list-style: none;
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: 12px;
    background: #26263f;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  li {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .name {
    font-weight: 700;
  }
  .desc {
    color: #b8b8d0;
    font-size: 0.9rem;
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
</style>
