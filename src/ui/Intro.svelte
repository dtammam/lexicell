<script lang="ts">
  // One screen of onboarding after New run (Dean, 2026-09-08, after a first-time player asked
  // "what am I doing here"). Three beats play on their own and a tap skips ahead; the button is
  // always there. Not a story screen: it says what the pick and the fight are, in the game's voice.
  let { onBegin }: { onBegin: () => void } = $props();

  const base = import.meta.env.BASE_URL;
  const BEATS = ['Something ate your pond.', 'You escaped through the only door left: a portal made of letters.', 'In here, words are teeth.'];
  const RING = 'LEXICELL·WORDS·';
  const GRID = 'WORDSAREATEETHXX';

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
          <img class="you" src="{base}sprites/player-1.png" alt="" />
          <img class="predator" src="{base}sprites/amoeba.png" alt="" />
        </div>
      {:else if beat === 1}
        <div class="portal">
          <img class="you dash" src="{base}sprites/player-1.png" alt="" />
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
    <li>Tap tiles to spell a word, then <strong>Attack</strong>. Longer words bite harder.</li>
    <li>Win nine fights and you evolve. Lose your HP and you are soup.</li>
  </ol>
  <button class="primary" onclick={onBegin}>Divide and conquer</button>
</section>

<style>
  .intro {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding-top: 0.2rem;
  }
  .scene {
    position: relative;
    display: block;
    width: 100%;
    height: 170px;
    padding: 0;
    border: none;
    border-radius: 14px;
    overflow: hidden;
    color: inherit;
    text-align: left;
    background: linear-gradient(180deg, #16263a, #0d3a3a);
    touch-action: manipulation;
  }
  .scene.beat-1 {
    background: radial-gradient(circle at 70% 50%, #4a2a7a, #1e0f3a 60%);
  }
  .scene.beat-2 {
    background: linear-gradient(180deg, #1a1a2e, #26263f);
  }
  .caption {
    position: absolute;
    left: 0.8rem;
    right: 0.8rem;
    bottom: 1.1rem;
    margin: 0;
    font-family: ui-serif, 'New York', Georgia, serif;
    font-size: 1.05rem;
    color: #f4f4fa;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    animation: caption 600ms ease-out both;
  }
  .dots {
    position: absolute;
    right: 0.7rem;
    top: 0.6rem;
    display: flex;
    gap: 4px;
  }
  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
  }
  .dots i.on {
    background: #ffd166;
  }
  img {
    image-rendering: pixelated;
    position: absolute;
  }
  /* Beat 0: the pond. You bob on the left; the predator slides in from the right, mouth first. */
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
  /* Beat 1: the portal. The ring spins; you dash in and shrink to nothing. */
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
    stroke: #9b6bff;
    stroke-width: 2;
    stroke-dasharray: 6 4;
  }
  .portal .ring text {
    font-family: ui-serif, Georgia, serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    fill: #ffd166;
  }
  .portal .you.dash {
    left: 10%;
    top: 62px;
    width: 40px;
    height: 40px;
    animation: dash 2.2s ease-in both;
  }
  /* Beat 2: the arrival. Tiles drop in one after another. */
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
    border-radius: 6px;
    background: #ffd166;
    color: #1a1a2e;
    font-family: ui-serif, Georgia, serif;
    font-weight: 800;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: drop 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
    animation-delay: calc(var(--i) * 90ms);
  }
  .arrival .tile.filler {
    background: #2a2a45;
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
    font-size: 1.5rem;
    font-family: ui-serif, 'New York', Georgia, serif;
  }
  li {
    margin: 0;
    color: #d8d8ea;
    line-height: 1.4;
  }
  ol {
    margin: 0;
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  strong {
    color: #ffd166;
  }
  .primary {
    margin-top: 0.2rem;
    padding: 1rem;
    font-size: 1.1rem;
    border-radius: 12px;
    border: none;
    background: #5ac98a;
    color: #1a1a2e;
    font-weight: 700;
    touch-action: manipulation;
  }
</style>
