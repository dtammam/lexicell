<script lang="ts">
  import type { RunState } from '../engine/types';
  import Definition from './Definition.svelte';
  import ItemIcon from './ItemIcon.svelte';
  import { CONTENT } from '../content/index';
  import { copyText, resultText, SHARE_TITLE } from './share';

  // A finished run as a card someone would screenshot (variety wave step 7). The card is tinted by
  // the act the run reached, wears the cell's body at that act, and shows the seed and items as
  // glyphs. Share is native where the browser has it, otherwise the same line goes to the clipboard.
  let { run, onNewRun, onHistory, onReplay }: {
    run: RunState;
    onNewRun: () => void;
    onHistory: () => void;
    onReplay: () => void;
  } = $props();

  const base = import.meta.env.BASE_URL;
  const won = $derived(run.outcome === 'won');
  const reached = $derived(run.stats.hpAtEncounterStart.length);
  const cellName = $derived(CONTENT.cells.find((c) => c.id === run.cell)?.name ?? run.cell);
  // The act the run reached (same formula as the arena); sprites and accents exist for three acts,
  // so Endless past act 3 keeps the act-3 look.
  const actLook = $derived(Math.min(3, Math.floor(run.encounterIndex / 3) + 1));

  // The cell's body at the act reached; a missing act sprite falls back to act 1, then the unknown blob.
  function cellFallback(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    const act1 = `${base}sprites/cell-${run.cell}-1.png`;
    if (!img.src.endsWith(`cell-${run.cell}-1.png`)) img.src = act1;
    else if (!img.src.endsWith('unknown.png')) img.src = `${base}sprites/unknown.png`;
  }

  let seedLabel = $state.raw('Copy');
  async function copySeed() {
    const ok = await copyText(String(run.rng.seed));
    seedLabel = ok ? 'Copied' : 'Failed';
    setTimeout(() => { seedLabel = 'Copy'; }, 1600);
  }

  let shareLabel = $state.raw('Share');
  async function share() {
    const text = resultText({
      won,
      mode: run.mode,
      cellName,
      reached,
      bestWord: run.stats.bestWord,
      bestWordDamage: run.stats.bestWordDamage,
      seed: run.rng.seed,
    });
    // Native share where the browser has it; a cancelled sheet throws, and we say nothing then.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: SHARE_TITLE, text });
        return;
      } catch {
        return;
      }
    }
    const ok = await copyText(text);
    shareLabel = ok ? 'Copied to clipboard' : 'Copy failed';
    setTimeout(() => { shareLabel = 'Share'; }, 1600);
  }
</script>

<section class="summary" style="--act: var(--act-{actLook})">
  <div class="card">
    <div class="banner" class:won>{won ? 'You won' : run.mode === 'endless' ? 'The deep took you' : 'You died'}</div>
    <div class="head">
      <img class="body" src="{base}sprites/cell-{run.cell}-{actLook}.png" alt="" width="56" height="56" onerror={cellFallback} />
      <div class="who">
        <span class="name">{cellName}</span>
        <span class="reach hud-s">{run.mode === 'endless' ? `Encounter ${reached}` : `Encounter ${reached} / 9`}</span>
      </div>
    </div>
    <div class="best">
      <span class="label hud-s">BEST WORD</span>
      <span class="word">{run.stats.bestWord ? run.stats.bestWord.toUpperCase() : 'NONE'}{#if run.stats.bestWord}<b> {run.stats.bestWordDamage}</b>{/if}</span>
    </div>
    {#if run.stats.bestWord}
      <Definition word={run.stats.bestWord} />
    {/if}
    <div class="glyphs" aria-label="Mutations carried">
      {#if run.player.items.length > 0}
        {#each run.player.items as id, i (`${id}-${i}`)}
          <ItemIcon {id} size={26} />
        {/each}
      {:else}
        <span class="none">no mutations</span>
      {/if}
    </div>
    <div class="seed">
      <span class="label hud-s">SEED</span>
      <code>{run.rng.seed}</code>
      <button class="chip" onclick={copySeed}>{seedLabel}</button>
    </div>
  </div>
  <div class="controls">
    <button class="btn life share" onclick={share}>{shareLabel}</button>
    <button class="btn" onclick={onReplay}>Replay this seed</button>
    <button class="btn" onclick={onNewRun}>New run</button>
    <button class="btn" onclick={onHistory}>History</button>
  </div>
</section>

<style>
  .summary {
    display: flex;
    flex-direction: column;
    gap: var(--s3);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--s2);
    padding: var(--s3);
    background: var(--panel);
    border: 2px solid var(--act);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    /* A whisper of the act's colour bled up from the bottom, so the card reads as belonging to it. */
    background-image: linear-gradient(0deg, color-mix(in srgb, var(--act) 22%, transparent), transparent 60%);
  }
  .banner {
    margin: calc(-1 * var(--s3)) calc(-1 * var(--s3)) 0;
    padding: var(--s2) var(--s3);
    border-radius: var(--radius) var(--radius) 0 0;
    /* The banner carries the OUTCOME (harm for a loss, life for a win); the act tints the card's
       border and body below, so the two signals never collide. */
    background: var(--harm);
    color: var(--ground);
    font-family: var(--font-head);
    font-size: var(--head);
    text-align: center;
  }
  .banner.won {
    background: var(--life);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--s3);
  }
  .body {
    flex: none;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    filter: drop-shadow(2px 2px 0 var(--shade));
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: var(--s1);
    min-width: 0;
  }
  .name {
    font-family: var(--font-head);
    font-size: var(--name);
  }
  .reach {
    color: var(--muted);
  }
  .best {
    display: flex;
    align-items: baseline;
    gap: var(--s3);
    flex-wrap: wrap;
  }
  .label {
    color: var(--muted);
    letter-spacing: 0.08em;
  }
  .word {
    font-family: var(--font-hud);
    font-size: var(--hud-m);
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .word b {
    color: var(--score);
  }
  .glyphs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2);
    min-height: 26px;
  }
  .none {
    color: var(--muted);
    font-size: var(--text);
  }
  .seed {
    display: flex;
    align-items: center;
    gap: var(--s2);
  }
  .seed code {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .chip {
    flex: none;
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    letter-spacing: 0.06em;
    background: var(--panel-deep);
    border: 2px solid var(--shade);
    box-shadow: var(--shadow-press);
    color: var(--ink);
    border-radius: var(--radius);
    padding: var(--s1) var(--s2);
    touch-action: manipulation;
  }
  .chip:active {
    transform: translate(1px, 1px);
    box-shadow: none;
  }
  .controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s2);
  }
  .share {
    grid-column: 1 / -1;
  }
</style>
