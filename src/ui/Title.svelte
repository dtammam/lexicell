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
    onDaily,
    dailySeed,
    dailyOpen,
    dailyOutcome,
  }: {
    hasSave: boolean;
    onPlay: () => void;
    onContinue: () => void;
    onItems: () => void;
    onHelp: () => void;
    onHistory: () => void;
    onNotes: () => void;
    onDaily: () => void;
    /** Today's daily seed, shown so a player sees it is the same run for everyone. */
    dailySeed: number;
    /** True when today's daily has not been started yet. */
    dailyOpen: boolean;
    /** Today's daily result if it finished (won/lost/abandoned), else null. */
    dailyOutcome: 'won' | 'lost' | 'abandoned' | null;
  } = $props();

  // Two-step abandon: with a save, starting a new or daily run first asks, then replaces it. Closes
  // tracker #4, and keeps the daily from silently discarding a live run when tapped by mistake.
  let confirming: 'new' | 'daily' | null = $state.raw(null);
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

  const outcomeWord = { won: 'won', lost: 'lost', abandoned: 'left' } as const;

  // A save asks before either start replaces it; without one, start straight away.
  function request(what: 'new' | 'daily') {
    if (hasSave) {
      confirming = what;
      return;
    }
    run(what);
  }
  function run(what: 'new' | 'daily') {
    confirming = null;
    if (what === 'new') onPlay();
    else onDaily();
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
      <p class="ask">Abandon the current run and start {confirming === 'daily' ? "today's challenge" : 'over'}?</p>
      <button class="btn harm" onclick={() => { run(confirming === 'daily' ? 'daily' : 'new'); }}>Yes, start over</button>
      <button class="btn life" onclick={() => { confirming = null; }}>Keep my run</button>
    {:else}
      {#if hasSave}
        <button class="btn life" onclick={onContinue}>Continue</button>
      {/if}
      {#if dailyOpen}
        <button class="btn daily" onclick={() => { request('daily'); }}>Today's challenge</button>
        <small class="daily-seed">Seed {dailySeed}</small>
      {:else}
        <div class="daily done">
          <span>Today's challenge {dailyOutcome ? outcomeWord[dailyOutcome] : 'played'}</span>
          <small class="seed">Seed {dailySeed} · back tomorrow</small>
        </div>
      {/if}
      <button class="btn" class:life={!hasSave} onclick={() => { request('new'); }}>New run</button>
      <button class="btn" onclick={onItems}>Compendium</button>
      <button class="btn" onclick={onHistory}>History</button>
      <button class="btn" onclick={onHelp}>How to play</button>
      <button class="btn" onclick={onNotes}>Release notes</button>
    {/if}
  </div>

  <p class="build">{buildLabel}{__BUILD_SHA__}</p>

  {#if wotd}
    <div class="wotd">
      <div class="wotd-head">
        <span class="label">Word of the day</span>
        <strong class="word">{wotd.word}</strong>
      </div>
      <span class="gloss">{wotd.gloss}</span>
    </div>
  {/if}
</section>

<style>
  .title {
    display: flex;
    flex-direction: column;
    /* Tight rhythm so the whole title, build line and word-of-the-day card fit one phone screen
       without an internal scroll, even under Safari's toolbar (Dean, 2026-09-13: WOTD was clipping). */
    gap: var(--s2);
    padding-top: var(--s3);
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
    width: min(74vw, 360px);
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
    gap: var(--s1);
  }
  /* The daily is the headline action: the select accent sets it apart from New run, and its seed
     rides a second line so a player sees it is the same run for everyone. */
  .daily {
    display: flex;
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: baseline;
    justify-content: center;
    gap: var(--s2);
  }
  /* The played-state card carries more text and may wrap to two lines; the live button stays one. */
  .daily.done {
    flex-wrap: wrap;
  }
  button.daily {
    background: var(--select);
    color: var(--ground);
  }
  .daily .seed {
    font-family: var(--font-hud);
    font-size: 0.66em;
    letter-spacing: 0.03em;
    white-space: nowrap;
    opacity: 0.85;
  }
  /* Today's seed rides as a small caption under the one-line daily button (Dean, 2026-09-13):
     the ten-digit seed will not fit one readable line beside the label, and it must stay visible
     so a player can see the run is the same for everyone. */
  .daily-seed {
    margin: 0;
    text-align: center;
    font-family: var(--font-hud);
    font-size: 0.72em;
    color: var(--muted);
    letter-spacing: 0.04em;
  }
  .daily.done {
    padding: var(--s3) var(--s2);
    border: 2px dashed var(--shade);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--muted);
    font-family: var(--font-hud);
    font-size: var(--hud-m);
    line-height: 1.25;
    text-align: center;
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
    padding: var(--s2) var(--s3);
    background: var(--panel);
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  /* Label and the word share a line so the card is three lines, not four (Dean, 2026-09-13). */
  .wotd-head {
    display: flex;
    align-items: baseline;
    gap: var(--s2);
    flex-wrap: wrap;
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
