<script lang="ts">
  // One screen of onboarding after New run (Dean, 2026-09-08, after a first-time player asked
  // "what am I doing here"). Not a story screen: it has one job, to say what the pick and the
  // fight are, in the game's own silly voice, and it never comes back mid-run.
  let { onBegin }: { onBegin: () => void } = $props();
</script>

<section class="intro">
  <div class="dish" aria-hidden="true">
    <span class="cell one"></span>
    <span class="cell two"></span>
  </div>
  <h2>You are a cell.</h2>
  <p>
    Something ate your pond. You escaped through the only door left: a portal made of letters.
    In here, <strong>words are teeth</strong>.
  </p>
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
    gap: 0.9rem;
    padding-top: 0.5rem;
  }
  .dish {
    position: relative;
    height: 96px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cell {
    position: absolute;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #c8ffdc, #5ac98a 55%, #1e5c3f);
    box-shadow: 0 0 18px rgba(90, 201, 138, 0.5);
  }
  /* Mitosis on loop: one cell stretches, pinches, and becomes two, then rejoins. */
  .cell.one {
    animation: split-left 3.2s ease-in-out infinite;
  }
  .cell.two {
    animation: split-right 3.2s ease-in-out infinite;
  }
  @keyframes split-left {
    0%,
    15% {
      transform: translateX(0) scale(1);
    }
    45% {
      transform: translateX(-18px) scale(1.15, 0.85);
    }
    65%,
    80% {
      transform: translateX(-38px) scale(0.9);
    }
    100% {
      transform: translateX(0) scale(1);
    }
  }
  @keyframes split-right {
    0%,
    15% {
      transform: translateX(0) scale(1);
    }
    45% {
      transform: translateX(18px) scale(1.15, 0.85);
    }
    65%,
    80% {
      transform: translateX(38px) scale(0.9);
    }
    100% {
      transform: translateX(0) scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .cell {
      animation: none;
    }
    .cell.two {
      transform: translateX(38px) scale(0.9);
    }
    .cell.one {
      transform: translateX(-38px) scale(0.9);
    }
  }
  h2 {
    margin: 0;
    font-size: 1.6rem;
    font-family: ui-serif, 'New York', Georgia, serif;
  }
  p,
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
    gap: 0.4rem;
  }
  strong {
    color: #ffd166;
  }
  .primary {
    margin-top: 0.4rem;
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
