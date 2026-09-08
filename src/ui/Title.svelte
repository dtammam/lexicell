<script lang="ts">
  import { wordOfTheDay } from './definitions';

  let {
    hasSave,
    onPlay,
    onContinue,
    onItems,
  }: { hasSave: boolean; onPlay: () => void; onContinue: () => void; onItems: () => void } = $props();

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
      <button class="btn life" onclick={onContinue}>Continue</button>
    {/if}
    <button class="btn" class:life={!hasSave} class:harm={confirming} onclick={newRun}>
      {confirming ? 'Abandon the current run and start over?' : 'New run'}
    </button>
    {#if confirming}
      <button class="btn" onclick={() => { confirming = false; }}>Keep it</button>
    {/if}
    <button class="btn" onclick={onItems}>Organelles</button>
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
    gap: var(--s5);
    padding-top: var(--s5);
  }
  .mark {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s2);
  }
  .cell {
    width: 72px;
    height: 72px;
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    background: var(--score);
    color: var(--ground);
    font-family: var(--font-hud);
    font-size: var(--hud-xl);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  h2 {
    margin: 0;
    font-family: var(--font-letter);
    font-weight: 400;
    font-size: var(--hud-l);
  }
  .tag {
    margin: 0;
    color: var(--muted);
    font-size: var(--text);
  }
  .buttons {
    display: flex;
    flex-direction: column;
    gap: var(--s2);
  }
  .build {
    margin: 0;
    text-align: center;
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    color: var(--muted);
  }
  .wotd {
    display: flex;
    flex-direction: column;
    gap: var(--s1);
    padding: var(--s3);
    background: var(--panel);
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .label {
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    letter-spacing: 0.1em;
    color: var(--muted);
  }
  .word {
    font-family: var(--font-letter);
    font-weight: 400;
    font-size: var(--hud-l);
    color: var(--score);
  }
  .gloss {
    color: var(--muted);
    font-size: var(--text);
    line-height: 1.35;
  }
</style>
