<script lang="ts">
  import { CONTENT } from '../content/index';
  import type { CellDef, RunMode } from '../engine/types';

  // Pick a starting cell (Dean, 2026-09-08). Every cell is available from the first run: no unlocks.
  // And a mode (Dean, 2026-09-09, "Normal, Endless?"): both from the first run, chosen here with the cell.
  let { onPick, onBack }: { onPick: (cellId: string, mode: RunMode) => void; onBack: () => void } = $props();
  let mode: RunMode = $state.raw('normal');

  const base = import.meta.env.BASE_URL;
  const cells: readonly CellDef[] = CONTENT.cells;
  /** Each cell's own body at act 1, drawn by scripts/sprites.py. */
  const sprite = (id: string) => `${base}sprites/cell-${id}-1.png`;
</script>

<section class="cells">
  <header>
    <h2>Choose your cell</h2>
    <button class="btn" onclick={onBack}>Back</button>
  </header>
  <p class="hint">Every cell can win. Pick the one whose trade you like; it holds for the whole run.</p>
  <div class="modes" role="radiogroup" aria-label="Mode">
    <button class="mode" class:on={mode === 'normal'} role="radio" aria-checked={mode === 'normal'} onclick={() => { mode = 'normal'; }}>Normal<small>Nine encounters, then a win.</small></button>
    <button class="mode" class:on={mode === 'endless'} role="radio" aria-checked={mode === 'endless'} onclick={() => { mode = 'endless'; }}>Endless<small>Past the ninth the deep goes on, harder each fight, until you fall.</small></button>
  </div>
  <ul class="list">
    {#each cells as cell (cell.id)}
      <li>
        <button class="cell" onclick={() => { onPick(cell.id, mode); }}>
          <img src={sprite(cell.id)} alt="" width="40" height="40" />
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
  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s2);
  }
  .mode {
    display: flex;
    flex-direction: column;
    gap: var(--s1);
    text-align: left;
    padding: var(--s2) var(--s3);
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--muted);
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    touch-action: manipulation;
  }
  .mode small {
    font-family: var(--font-ui);
    font-size: var(--text);
    color: var(--muted);
    line-height: 1.35;
  }
  .mode.on {
    border-color: var(--life);
    color: var(--ink);
    box-shadow: var(--shadow);
  }
</style>
