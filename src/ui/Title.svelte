<script lang="ts">
  import { wordOfTheDay } from './definitions';

  let {
    hasSave,
    onPlay,
    onContinue,
    onItems,
    onHelp,
    onHistory,
  }: { hasSave: boolean; onPlay: () => void; onContinue: () => void; onItems: () => void; onHelp: () => void; onHistory: () => void } = $props();

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
    {#if confirming}
      <!-- Two plain choices and nothing else (Dean, 2026-09-08: a tester read the red button as a
           message and "Continue" as "continue to a new game"). -->
      <p class="ask">Abandon the current run and start over?</p>
      <button class="btn harm" onclick={newRun}>Yes, start over</button>
      <button class="btn life" onclick={() => { confirming = false; }}>Keep my run</button>
    {:else}
      {#if hasSave}
        <button class="btn life" onclick={onContinue}>Continue</button>
      {/if}
      <button class="btn" class:life={!hasSave} onclick={newRun}>New run</button>
      <button class="btn" onclick={onItems}>Organelles</button>
      <button class="btn" onclick={onHistory}>History</button>
      <button class="btn" onclick={onHelp}>How to play</button>
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
    font-family: var(--font-tile);
    font-size: var(--hud-xl);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--head);
  }
  .tag {
    margin: 0;
    color: var(--muted);
    font-size: var(--text);
  }
  .ask {
    margin: 0;
    font-size: var(--text);
    color: var(--harm);
    text-align: center;
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
