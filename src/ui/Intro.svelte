<script lang="ts">
  // One screen of onboarding after New run (Dean, 2026-09-08, after a first-time player asked
  // "what am I doing here"). Six beats play on their own and a tap skips ahead; the button is
  // always there. Not a story screen: it says what the pick and the fight are, in the game's voice.
  let { onBegin, cell = 'balanced' }: { onBegin: () => void; cell?: string } = $props();

  const base = import.meta.env.BASE_URL;
  const BEATS = [
    'Your pond was quiet. It always had been.',
    'Something ate your pond.',
    'You fled. Strange symbols rose from the dark. Letters, even.',
    'A portal made of letters opened ahead. With nowhere else to go, you slipped in.',
    'You surfaced somewhere unfamiliar, surrounded by tiles.',
    'You combined a few. So this is how you touch the world. Long words hit hard.',
  ];
  const SYMBOLS = [
    { c: '?', l: '12%', t: '18px' }, { c: 'A', l: '30%', t: '96px' },
    { c: 'L', l: '46%', t: '38px' }, { c: '·', l: '20%', t: '124px' },
    { c: 'E', l: '70%', t: '28px' }, { c: 'X', l: '84%', t: '92px' },
    { c: 'O', l: '58%', t: '112px' }, { c: 'S', l: '38%', t: '14px' },
    { c: 'R', l: '78%', t: '134px' },
  ];
  const SCATTER = [
    { c: 'A', l: '16%', t: '16px', r: -12 }, { c: 'R', l: '64%', t: '10px', r: 8 },
    { c: 'T', l: '80%', t: '66px', r: -6 }, { c: 'E', l: '28%', t: '104px', r: 10 },
    { c: '?', l: '8%', t: '78px', r: 14 }, { c: 'S', l: '52%', t: '126px', r: -10 },
    { c: 'O', l: '84%', t: '124px', r: 6 }, { c: 'N', l: '70%', t: '96px', r: 12 },
  ];
  const RING = 'LEXICELL·WORDS·';
  // Sixteen letters, one per tile, the whole lesson in a grid. Four rows of four, so the phrase
  // has to split cleanly at every fourth letter (Dean, 2026-09-08: WORDS HIT read as WORD SHIT).
  const GRID = 'LONGWORDHITSHARD';

  let beat = $state.raw(0);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = beat < BEATS.length - 1 ? setTimeout(() => { beat += 1; schedule(); }, 3500) : null;
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
        <div class="pond calm">
          <img class="you" src="{base}sprites/cell-{cell}-1.png" alt="" />
          {#each [0, 1, 2, 3] as b (b)}<span class="bubble" style="--b: {b}"></span>{/each}
        </div>
      {:else if beat === 1}
        <div class="attack">
          <img class="predator" src="{base}sprites/amoeba.png" alt="" />
          <img class="you cower" src="{base}sprites/cell-{cell}-1.png" alt="" />
        </div>
      {:else if beat === 2}
        <div class="symbols">
          <img class="you flee" src="{base}sprites/cell-{cell}-1.png" alt="" />
          {#each SYMBOLS as s, i (i)}
            <span class="sym" style="left: {s.l}; top: {s.t}; --i: {i}">{s.c}</span>
          {/each}
        </div>
      {:else if beat === 3}
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
      {:else if beat === 4}
        <div class="scatter">
          <img class="you" src="{base}sprites/cell-{cell}-1.png" alt="" />
          {#each SCATTER as s, i (i)}
            <span class="chip" style="left: {s.l}; top: {s.t}; --r: {s.r}deg; --i: {i}">{s.c}</span>
          {/each}
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
    <li>Pick <strong>one</strong> mutation to start with. It changes how you fight.</li>
    <li>Tap tiles to spell a word, then <strong>Attack</strong>.</li>
    <li>The <strong>longest word you can find</strong> is how you deal damage, and how you evolve. Survive nine encounters; lose your HP and you are soup.</li>
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
    background: radial-gradient(circle at 50% 45%, #5a1030, #180612 65%); /* danger red */
  }
  .scene.beat-2 {
    background: radial-gradient(circle at 30% 40%, #12303a, #06131c 70%); /* dark water - keep */
  }
  .scene.beat-3 {
    background: radial-gradient(circle at 70% 50%, #7b3fff, #1e0f3a 60%); /* portal purple - keep */
  }
  .scene.beat-4 {
    background: radial-gradient(circle at 50% 60%, #123a44, #0a1f2e 70%); /* teal deep - scatter */
  }
  .scene.beat-5 {
    background: var(--panel-deep); /* word grid - keep */
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
  .pond .bubble {
    position: absolute;
    bottom: 12px;
    left: calc(18% + var(--b) * 20%);
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.22);
    animation: rise 3s ease-in infinite;
    animation-delay: calc(var(--b) * 0.6s);
  }
  .attack .predator {
    left: 50%;
    top: 50%;
    width: 150px;
    height: 150px;
    transform: translate(-50%, -50%);
    animation: chomp 1.6s ease-in-out both;
  }
  .attack .you.cower {
    left: 14%;
    top: 118px;
    width: 30px;
    height: 30px;
    animation: cower 1.4s ease-out both;
  }
  .scatter .you {
    left: 50%;
    top: 64px;
    width: 38px;
    height: 38px;
    transform: translateX(-50%);
    animation: bob 1.6s ease-in-out infinite;
  }
  .scatter .chip {
    position: absolute;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    box-shadow: 2px 2px 0 var(--shade);
    background: var(--tile);
    color: var(--ink);
    font-family: var(--font-tile);
    font-size: var(--hud-s);
    opacity: 0;
    animation: chipIn 460ms var(--ease-settle) both;
    animation-delay: calc(var(--i) * 70ms);
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
  .symbols .sym {
    position: absolute;
    font-family: var(--font-hud);
    font-size: var(--hud-m);
    color: var(--score);
    text-shadow: 0 0 6px var(--shade);
    opacity: 0;
    animation: floatUp 2.8s ease-out both;
    animation-delay: calc(var(--i) * 160ms);
  }
  .symbols .you.flee {
    left: 60%;
    top: 70px;
    width: 36px;
    height: 36px;
    animation: flee 3s ease-in both;
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
  @keyframes rise {
    from {
      transform: translateY(0);
      opacity: 0;
    }
    30% {
      opacity: 0.6;
    }
    to {
      transform: translateY(-120px);
      opacity: 0;
    }
  }
  @keyframes chomp {
    0% {
      transform: translate(-50%, -50%) scale(0.7);
    }
    50% {
      transform: translate(-50%, -50%) scale(1.08);
    }
    100% {
      transform: translate(-50%, -50%) scale(1);
    }
  }
  @keyframes cower {
    from {
      opacity: 1;
      transform: none;
    }
    to {
      opacity: 0.5;
      transform: translateY(6px) scale(0.85);
    }
  }
  @keyframes chipIn {
    from {
      opacity: 0;
      transform: translateY(-16px) rotate(var(--r));
    }
    to {
      opacity: 1;
      transform: translateY(0) rotate(var(--r));
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
  @keyframes floatUp {
    0% {
      opacity: 0;
      transform: translateY(10px);
    }
    35% {
      opacity: 0.8;
    }
    100% {
      opacity: 0.2;
      transform: translateY(-14px);
    }
  }
  @keyframes flee {
    from {
      transform: none;
    }
    to {
      transform: translateX(-120px) scale(0.85);
      opacity: 0.5;
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
    .pond .bubble,
    .attack .predator,
    .attack .you.cower,
    .symbols .sym,
    .symbols .you.flee,
    .portal .ring,
    .portal .you.dash,
    .scatter .you,
    .scatter .chip,
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
