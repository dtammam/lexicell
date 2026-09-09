<script lang="ts">
  // One screen of onboarding after New run (Dean, 2026-09-08, after a first-time player asked
  // "what am I doing here"). Three beats play on their own and a tap skips ahead; the button is
  // always there. Not a story screen: it says what the pick and the fight are, in the game's voice.
  let { onBegin, cell = 'balanced' }: { onBegin: () => void; cell?: string } = $props();

  const base = import.meta.env.BASE_URL;
  const BEATS = ['Something ate your pond.', 'You escaped through the only door left: a portal made of letters.', 'A long word hits hard.'];
  const RING = 'LEXICELL·WORDS·';
  // Sixteen letters, one per tile, the whole lesson in a grid. Four rows of four, so the phrase
  // has to split cleanly at every fourth letter (Dean, 2026-09-08: WORDS HIT read as WORD SHIT).
  const GRID = 'LONGWORDHITSHARD';

  let beat = $state.raw(0);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = beat < BEATS.length - 1 ? setTimeout(() => { beat += 1; schedule(); }, 2600) : null;
  }
  function skip() {
    if (beat < BEATS.length - 1) {
      beat += 1;
      schedule();
    }
  }
  $effect(() => {
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  });
</script>

<section class="intro">
  <button class="scene beat-{beat}" onclick={skip} aria-label="Skip ahead">
    {#key beat}
      {#if beat === 0}
        <div class="pond">
          <img class="you" src="{base}sprites/cell-{cell}-1.png" alt="" />
          <img class="predator" src="{base}sprites/amoeba.png" alt="" />
        </div>
      {:else if beat === 1}
        <div class="portal">
          <img class="you dash" src="{base}sprites/cell-{cell}-1.png" alt="" />
          <svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <path id="ring-path" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
            </defs>
            <circle cx="60" cy="60" r="44" />
            <text><textPath href="#ring-path">{RING.repeat(2)}</textPath></text>
          </svg>
        </div>
      {:else}
        <div class="arrival">
          {#each GRID.split('') as letter, i (i)}
            <span class="tile" class:filler={letter === 'X'} style="--i: {i}">{letter === 'X' ? '' : letter}</span>
          {/each}
        </div>
      {/if}
    {/key}
    <p class="caption">{BEATS[beat]}</p>
    <span class="dots" aria-hidden="true">{#each BEATS, i (i)}<i class:on={i === beat}></i>{/each}</span>
  </button>

  <h2>You are a cell.</h2>
  <ol>
    <li>Pick <strong>one</strong> organelle to start with. It changes how you fight.</li>
    <li>Tap tiles to spell a word, then <strong>Attack</strong>.</li>
    <li>The <strong>longest word you can find</strong> is how you deal damage, and how you evolve. Win nine fights; lose your HP and you are soup.</li>
  </ol>
  <button class="btn life" onclick={onBegin}>Divide and conquer</button>
</section>

<style>
  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--s3);
    padding-top: var(--s1);
  }
  .scene {
    position: relative;
    display: block;
    width: 100%;
    height: 170px;
    padding: 0;
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
    color: inherit;
    text-align: left;
    background: linear-gradient(180deg, #0d2a3a, #0d3a3a);
    touch-action: manipulation;
  }
  .scene.beat-1 {
    background: radial-gradient(circle at 70% 50%, #7b3fff, #1e0f3a 60%);
  }
  .scene.beat-2 {
    background: var(--panel-deep);
  }
  .caption {
    position: absolute;
    left: var(--s3);
    right: var(--s3);
    bottom: var(--s4);
    margin: 0;
    font-family: var(--font-ui);
    font-weight: 500;
    font-size: var(--text);
    color: var(--ink);
    text-shadow: 1px 1px 0 var(--shade), 0 0 6px var(--shade);
    animation: caption var(--dur-settle) var(--ease-settle) both;
  }
  .dots {
    position: absolute;
    right: var(--s3);
    top: var(--s2);
    display: flex;
    gap: var(--s1);
  }
  .dots i {
    width: 6px;
    height: 6px;
    background: var(--line);
  }
  .dots i.on {
    background: var(--score);
  }
  img {
    image-rendering: pixelated;
    position: absolute;
  }
  .pond .you {
    left: 22%;
    top: 62px;
    width: 40px;
    height: 40px;
    animation: bob 1.6s ease-in-out infinite;
  }
  .pond .predator {
    right: -10%;
    top: 10px;
    width: 150px;
    height: 150px;
    animation: loom 2.4s ease-in both;
  }
  .portal .ring {
    position: absolute;
    right: 8%;
    top: 5px;
    width: 160px;
    height: 160px;
    animation: spin 8s linear infinite;
  }
  .portal .ring circle {
    fill: none;
    stroke: var(--rare);
    stroke-width: 2;
    stroke-dasharray: 6 4;
  }
  .portal .ring text {
    font-family: var(--font-hud);
    font-size: 8px;
    letter-spacing: 2px;
    fill: var(--score);
  }
  .portal .you.dash {
    left: 10%;
    top: 62px;
    width: 40px;
    height: 40px;
    animation: dash 2.2s ease-in both;
  }
  .arrival {
    position: absolute;
    left: 50%;
    top: 12px;
    transform: translateX(-50%);
    display: grid;
    grid-template-columns: repeat(4, 30px);
    gap: 5px;
  }
  .arrival .tile {
    width: 30px;
    height: 30px;
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    box-shadow: 2px 2px 0 var(--shade);
    background: var(--score);
    color: var(--ground);
    font-family: var(--font-tile);
    font-weight: 400;
    font-size: var(--hud-m);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: drop 500ms var(--ease-settle) both;
    animation-delay: calc(var(--i) * 90ms);
  }
  .arrival .tile.filler {
    background: var(--tile);
  }
  @keyframes bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-6px);
    }
  }
  @keyframes loom {
    from {
      transform: translateX(120px) scale(0.6) rotate(-10deg);
      opacity: 0;
    }
    to {
      transform: translateX(0) scale(1) rotate(0deg);
      opacity: 1;
    }
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes dash {
    0% {
      transform: translateX(0) scale(1);
    }
    60% {
      transform: translateX(150px) scale(0.9);
    }
    100% {
      transform: translateX(210px) scale(0);
    }
  }
  @keyframes drop {
    from {
      transform: translateY(-40px);
      opacity: 0;
    }
    to {
      transform: none;
      opacity: 1;
    }
  }
  @keyframes caption {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .pond .you,
    .pond .predator,
    .portal .ring,
    .portal .you.dash,
    .arrival .tile,
    .caption {
      animation: none;
    }
  }
  h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--head);
  }
  li {
    margin: 0;
    color: var(--ink);
    font-size: var(--text);
    line-height: 1.4;
  }
  ol {
    margin: 0;
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: var(--s2);
  }
  strong {
    color: var(--score);
  }
</style>
