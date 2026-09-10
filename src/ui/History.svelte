<script lang="ts">
  import ItemIcon from './ItemIcon.svelte';
  import { exportCsv, exportJson, type HistoryEntry } from './history';
  import { itemDef } from './lookup';
  import { CONTENT } from '../content/index';
  const cellName = (id: string) => CONTENT.cells.find((c) => c.id === id)?.name ?? id;

  let { runs, onBack, onClear }: { runs: readonly HistoryEntry[]; onBack: () => void; onClear: () => void } = $props();

  const newestFirst = $derived([...runs].reverse());
  let confirming = $state.raw(false);
  let open: number | null = $state.raw(null);
  let saved: string | null = $state.raw(null);

  /** Hand the browser a file. A blocked download (or a test DOM without object URLs) says so instead of failing silently. */
  function download(name: string, text: string, type: string) {
    if (typeof URL.createObjectURL !== 'function') {
      saved = 'Download is not available here.';
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
    saved = `Saved ${name}`;
  }
  const stamp = () => new Date(Date.now()).toISOString().slice(0, 10);
  function when(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function clear() {
    if (!confirming) {
      confirming = true;
      return;
    }
    confirming = false;
    onClear();
  }
</script>

<section class="history">
  <header>
    <h2>History</h2>
    <button class="btn" onclick={onBack}>Back</button>
  </header>
  <p class="hint">{runs.length === 0 ? 'No finished runs on this device yet.' : `${runs.length} run${runs.length === 1 ? '' : 's'} on this device, newest first. Tap one for its build.`}</p>
  {#if runs.length > 0}
    <div class="tools">
      <button class="btn" onclick={() => { download(`lexicell-runs-${stamp()}.json`, exportJson(runs), 'application/json'); }}>Export JSON</button>
      <button class="btn" onclick={() => { download(`lexicell-runs-${stamp()}.csv`, exportCsv(runs), 'text/csv'); }}>Export CSV</button>
      <button class="btn" class:harm={confirming} onclick={clear}>{confirming ? 'Delete all history?' : 'Clear'}</button>
      {#if confirming}<button class="btn" onclick={() => { confirming = false; }}>Keep it</button>{/if}
    </div>
    {#if saved}<p class="hint saved">{saved}</p>{/if}
  {/if}
  <ol class="list">
    <!-- Keyed by position: two runs can share a seed and an end time (a device whose clock is pinned, or two quick abandons). -->
    {#each newestFirst as r, i (i)}
      <li class={r.outcome}>
        <button class="row" onclick={() => { open = open === i ? null : i; }}>
          <span class="hud outcome">{r.outcome === 'won' ? 'WON' : r.outcome === 'lost' ? 'LOST' : 'LEFT'}</span>
          <span class="meta">
            <span class="line">{when(r.endedAt)} <span class="hud">E{r.encounterReached}</span> <span class="hud">{r.turns}t</span>{#if r.daily}<span class="hud daily">DAILY</span>{/if}</span>
            <span class="line best">{r.bestWord ? `${r.bestWord.toUpperCase()} for ${r.bestWordDamage}` : 'no word played'}</span>
          </span>
          <span class="icons">
            {#each r.items.slice(0, 6) as id, j (`${id}-${j}`)}<ItemIcon {id} size={16} />{/each}
            {#if r.items.length > 6}<span class="more">+{r.items.length - 6}</span>{/if}
          </span>
        </button>
        {#if open === i}
          <p class="detail">
            Seed <code>{r.seed}</code>, build {r.build}{r.cell ? `, ${cellName(r.cell)}` : ''}. Dealt {r.damageDealt}, took {r.damageTaken}.
            {r.items.length > 0 ? r.items.map((id) => itemDef(id).name).join(', ') : 'No organelles.'}
          </p>
        {/if}
      </li>
    {/each}
  </ol>
</section>

<style>
  .history {
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: var(--s2);
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
  .saved {
    color: var(--life);
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
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
  .row {
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
  .outcome {
    flex: none;
    width: 4.2em;
  }
  li.won .outcome {
    color: var(--life);
  }
  li.lost .outcome {
    color: var(--harm);
  }
  li.abandoned .outcome {
    color: var(--muted);
  }
  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s1);
  }
  .line {
    display: flex;
    gap: var(--s2);
    align-items: baseline;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .best {
    color: var(--score);
  }
  .daily {
    color: var(--select);
  }
  .icons {
    flex: none;
    display: flex;
    gap: 2px;
    align-items: center;
  }
  .more {
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    color: var(--muted);
  }
  .detail {
    margin: var(--s1) 0 0;
    padding: 0 var(--s3);
    color: var(--muted);
    font-size: var(--text);
  }
  code {
    font-family: var(--font-hud);
    font-size: var(--hud-s);
  }
</style>
