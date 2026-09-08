<script lang="ts">
  import { CONTENT } from '../content/index';
  import type { CellDef } from '../engine/types';

  // Pick a starting cell (Dean, 2026-09-08). Every cell is available from the first run: no unlocks.
  let { onPick, onBack }: { onPick: (cellId: string) => void; onBack: () => void } = $props();

  const base = import.meta.env.BASE_URL;
  const cells: readonly CellDef[] = CONTENT.cells;
  /** Until each cell has its own sprite, the three evolution stages stand in, cycling. */
  const sprite = (i: number) => `${base}sprites/player-${(i % 3) + 1}.png`;
</script>

<section class="cells">
  <header>
    <h2>Choose your cell</h2>
    <button class="btn" onclick={onBack}>Back</button>
  </header>
  <p class="hint">Every cell can win. Pick the one whose trade you like; it holds for the whole run.</p>
  <ul class="list">
    {#each cells as cell, i (cell.id)}
      <li>
        <button class="cell" onclick={() => { onPick(cell.id); }}>
          <img src={sprite(i)} alt="" width="40" height="40" />
          <span class="text">
            <span class="name">{cell.name} <span class="hud hp">{cell.maxHp} HP</span></span>
            <span class="desc">{cell.description}</span>
            <span class="flavor">{cell.flavor}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .cells {
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: var(--s3);
  }
  header {
    flex: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--s3);
  }
  h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--head);
  }
  .hint {
    margin: 0;
    color: var(--muted);
    font-size: var(--text);
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s2);
  }
  .cell {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--s3);
    text-align: left;
    background: var(--panel);
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: var(--s2) var(--s3);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--text);
    touch-action: manipulation;
  }
  .cell:active {
    transform: translate(3px, 3px);
    box-shadow: var(--shadow-press);
  }
  img {
    flex: none;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    filter: drop-shadow(2px 2px 0 var(--shade));
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
    display: flex;
    gap: var(--s2);
    align-items: baseline;
  }
  .hp {
    color: var(--life);
  }
  .desc {
    color: var(--ink);
  }
  .flavor {
    color: var(--muted);
    font-style: italic;
  }
</style>
