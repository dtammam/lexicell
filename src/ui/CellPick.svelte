<script lang="ts">
  import { CONTENT } from '../content/index';
  import type { CellDef, RunMode } from '../engine/types';
  import { parseSeed } from './share';

  // Pick a starting cell (Dean, 2026-09-08). Every cell is available from the first run: no unlocks.
  // And a mode (Dean, 2026-09-09, "Normal, Endless?"): both from the first run, chosen here with the cell.
  // Seed (variety wave step 7): a pasted seed replays a shared run; blank or invalid rolls a random one.
  let { onPick, onBack }: { onPick: (cellId: string, mode: RunMode, seed?: number) => void; onBack: () => void } = $props();
  let mode: RunMode = $state.raw('normal');
  let seedText = $state.raw('');

  const base = import.meta.env.BASE_URL;
  const cells: readonly CellDef[] = CONTENT.cells;
  /** Each cell's own body at act 1, drawn by scripts/sprites.py. */
  const sprite = (id: string) => `${base}sprites/cell-${id}-1.png`;
  /** null (blank or invalid) becomes undefined so App falls back to its Date.now seed. */
  const pick = (id: string) => { onPick(id, mode, parseSeed(seedText) ?? undefined); };
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
  <label class="seed">
    <span class="hud-s">SEED</span>
    <input type="text" inputmode="numeric" placeholder="blank = random" bind:value={seedText} aria-label="Seed (blank for a random run)" />
  </label>
  <ul class="list">
    {#each cells as cell (cell.id)}
      <li>
        <button class="cell" onclick={() => { pick(cell.id); }}>
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
  /* section.cells (not bare .cells) to outrank App's `.screen > :global(*) { flex: 1 0 auto }`, which
     pins screen children to no-shrink and used to push a tall picker into the hidden-scrollbar
     fallback. Letting this screen shrink to the viewport hands the overflow to the cell list's own
     overflow-y:auto, so it scrolls internally while the header, modes and seed stay in view. */
  section.cells {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex-shrink: 1;
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
  .seed {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--s2);
  }
  .seed span {
    color: var(--muted);
    letter-spacing: 0.08em;
  }
  .seed input {
    flex: 1;
    min-width: 0;
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    font-variant-numeric: tabular-nums;
    background: var(--panel-deep);
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    color: var(--ink);
    padding: var(--s2);
  }
  .seed input::placeholder {
    color: var(--muted);
  }
</style>
