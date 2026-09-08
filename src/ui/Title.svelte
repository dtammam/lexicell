<script lang="ts">
  import { wordOfTheDay } from './definitions';

  let {
    hasSave,
    onPlay,
    onContinue,
  }: { hasSave: boolean; onPlay: () => void; onContinue: () => void } = $props();

  // Two-step abandon: with a save, "New run" first asks, then replaces it. Closes tracker #4.
  let confirming = $state.raw(false);
  let wotd: { word: string; gloss: string } | null = $state.raw(null);

  $effect(() => {
    let live = true;
    // Date.now rather than new Date() so the day is the same clock the seed uses (and tests pin).
    wordOfTheDay(new Date(Date.now()))
      .then((w) => {
        if (live) wotd = w;
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  });

  function newRun() {
    if (hasSave && !confirming) {
      confirming = true;
      return;
    }
    confirming = false;
    onPlay();
  }
</script>

<section class="title">
  <div class="mark">
    <span class="cell">L</span>
    <h2>Lexicell</h2>
    <p class="tag">Spell words. Hit things. Evolve.</p>
  </div>

  <div class="buttons">
    {#if hasSave}
      <button class="primary" onclick={onContinue}>Continue</button>
    {/if}
    <button class={hasSave ? 'secondary' : 'primary'} class:danger={confirming} onclick={newRun}>
      {confirming ? 'Abandon the current run and start over?' : 'New run'}
    </button>
    {#if confirming}
      <button class="secondary" onclick={() => { confirming = false; }}>Keep it</button>
    {/if}
  </div>

  <p class="build">build {__BUILD_NUMBER__} · {__BUILD_SHA__}</p>

  {#if wotd}
    <div class="wotd">
      <span class="label">Word of the day</span>
      <strong class="word">{wotd.word}</strong>
      <span class="gloss">{wotd.gloss}</span>
    </div>
  {/if}
</section>

<style>
  .title {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding-top: 2rem;
  }
  .mark {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }
  .cell {
    width: 72px;
    height: 72px;
    border-radius: 16px;
    background: #ffd166;
    color: #1a1a2e;
    font-size: 2.6rem;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  h2 {
    margin: 0;
    font-size: 2rem;
    letter-spacing: 0.08em;
  }
  .tag {
    margin: 0;
    color: #9a9ab5;
  }
  .buttons {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .buttons button {
    padding: 1rem;
    font-size: 1.1rem;
    border-radius: 12px;
    border: none;
    touch-action: manipulation;
  }
  .primary {
    background: #5ac98a;
    color: #1a1a2e;
    font-weight: 700;
  }
  .secondary {
    background: #3d3d5c;
    color: #eaeaea;
  }
  .secondary.danger {
    background: #e05a5a;
    color: white;
  }
  .build {
    margin: 0;
    text-align: center;
    font-size: 0.75rem;
    color: #55556f;
    font-family: ui-monospace, monospace;
  }
  .wotd {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.9rem;
    border-radius: 12px;
    background: #26263f;
  }
  .label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #9a9ab5;
  }
  .word {
    font-size: 1.4rem;
  }
  .gloss {
    color: #b8b8d0;
    line-height: 1.3;
  }
</style>
