<script lang="ts">
  import { wordOfTheDay } from './definitions';
  import { RELEASE_NOTES } from './release-notes';

  // The build number the title shows is the latest release note's build, so it always matches the
  // Release notes page and is identical on the Docker and Pages deploys. The CI env var __BUILD_NUMBER__
  // used different run counters per workflow, so the two builds disagreed. Guard a null build defensively.
  const buildLabel = RELEASE_NOTES[0]?.build != null ? `build ${RELEASE_NOTES[0].build} · ` : '';

  // The mark (Dean's pick, 2026-09-08): the Bookends wordmark, drawn by scripts/logo.py.
  const base = import.meta.env.BASE_URL;

  let {
    hasSave,
    onPlay,
    onContinue,
    onItems,
    onHelp,
    onHistory,
    onNotes,
  }: { hasSave: boolean; onPlay: () => void; onContinue: () => void; onItems: () => void; onHelp: () => void; onHistory: () => void; onNotes: () => void } = $props();

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
    <h2><img class="wordmark" src="{base}logo/bookends-wordmark.svg" alt="Lexicell" width="312" height="78" /></h2>
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
      <button class="btn" onclick={onNotes}>Release notes</button>
    {/if}
  </div>

  <p class="build">{buildLabel}{__BUILD_SHA__}</p>

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
  h2 {
    margin: 0;
    line-height: 0;
  }
  .wordmark {
    display: block;
    /* min(100%, ...) collapsed against the shrink-wrapped centered parent and rendered tiny on a
       phone; a viewport-relative width makes the wordmark a reliable hero (about 331px on a 390px
       screen) without reintroducing vertical overflow. */
    width: min(85vw, 420px);
    height: auto;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    filter: drop-shadow(4px 4px 0 var(--shade));
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
