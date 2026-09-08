<script lang="ts">
  import type { RunState } from '../engine/types';
  import { enemyName } from './lookup';

  // You versus the thing: two sprites over a background band per act, HP bars, hit
  // flash and floating damage numbers keyed on the turn counter so they replay each turn.
  let { run }: { run: RunState } = $props();

  // Vite's base ("/" in production, "/absproxy/5173/" on the LAN dev route) prefixes every asset URL.
  const base = import.meta.env.BASE_URL;
  const unknown = `${base}sprites/unknown.png`;

  const enc = $derived(run.encounter);
  const act = $derived(Math.floor(run.encounterIndex / 3) + 1);
  /** Earthbound-style battle backdrop: a pattern per enemy, a palette per act, slow drift. */
  const PATTERNS: Readonly<Record<string, string>> = { amoeba: 'dots', flagellate: 'stripes', polyp: 'cells', colony: 'rings' };
  const pattern = $derived(PATTERNS[enc?.enemy.id ?? ''] ?? 'dots');
  const dealt = $derived(run.lastTurn?.damage ?? 0);
  const taken = $derived(run.lastTurn?.enemyDamage ?? 0);

  function fallback(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    if (!img.src.endsWith('sprites/unknown.png')) img.src = unknown;
  }
</script>

{#if enc}
  <div class="arena act-{act}" data-act={act}>
    <div class="bg" data-pattern={pattern} aria-hidden="true">
      <div class="layer a"></div>
      <div class="layer b"></div>
    </div>
    <div class="row">
      <span>Act {act}</span>
      <span>Encounter {run.encounterIndex + 1} / 9</span>
      <span>Turn {enc.turn}</span>
    </div>
    <div class="stage">
      {#key run.stats.turns}
        <figure class="fighter you" class:shake={taken > 0}>
          <img src="{base}sprites/player.png" alt="You" onerror={fallback} />
          {#if taken > 0}<span class="float taken">-{taken}</span>{/if}
          <figcaption>You</figcaption>
        </figure>
        <span class="vs">vs</span>
        <figure class="fighter enemy" class:hit={dealt > 0}>
          <img src="{base}sprites/{enc.enemy.id}.png" alt={enemyName(enc.enemy.id)} onerror={fallback} />
          {#if dealt > 0}<span class="float dealt">-{dealt}</span>{/if}
          <figcaption>{enemyName(enc.enemy.id)}</figcaption>
        </figure>
      {/key}
    </div>
    <div class="bars">
      <div class="bar-label">
        <strong>You</strong>
        <span>{run.player.hp} / {run.player.maxHp}</span>
      </div>
      <div class="bar player"><div class="fill" style="width: {(100 * run.player.hp) / run.player.maxHp}%"></div></div>
      <div class="bar-label">
        <strong>{enemyName(enc.enemy.id)}</strong>
        <span>{enc.enemy.hp} / {enc.enemy.maxHp}</span>
      </div>
      <div class="bar enemy"><div class="fill" style="width: {(100 * enc.enemy.hp) / enc.enemy.maxHp}%"></div></div>
    </div>
  </div>
{/if}

<style>
  .arena {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    flex: none;
    border-radius: 14px;
    padding: 0.4rem 0.8rem 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    /* Three acts, three palettes: pond, tide pool, deep. Cosmetic only (pack: theme is art). */
    --bg0: #16263a;
    --bg1: #1e4d5c;
    --bg2: #3fb8b0;
    --bg3: #a9e6c8;
    background: linear-gradient(180deg, var(--bg0) 0%, #0f1a2a 100%);
  }
  .act-2 {
    --bg0: #24183d;
    --bg1: #4a2a7a;
    --bg2: #9b6bff;
    --bg3: #ffb3f0;
  }
  .act-3 {
    --bg0: #3a1420;
    --bg1: #7a2a3a;
    --bg2: #ff6b6b;
    --bg3: #ffd166;
  }
  /* The backdrop: two oversized pattern layers that drift and breathe on the compositor
     (transform and opacity only), behind everything in the arena. Earthbound's trick was
     layered, palette-cycled patterns; this is the CSS-sized version of it. */
  .bg {
    position: absolute;
    inset: 0;
    z-index: -1;
    overflow: hidden;
  }
  .layer {
    position: absolute;
    inset: -30%;
    opacity: 0.55;
    will-change: transform;
  }
  .layer.a {
    animation: drift 24s linear infinite;
  }
  .layer.b {
    animation: breathe 11s ease-in-out infinite alternate;
    mix-blend-mode: screen;
    opacity: 0.35;
  }
  .bg[data-pattern='dots'] .layer.a {
    background: radial-gradient(circle at 30% 30%, var(--bg2) 0 9%, transparent 10%) 0 0 / 56px 56px;
  }
  .bg[data-pattern='dots'] .layer.b {
    background: radial-gradient(circle at 60% 60%, var(--bg1) 0 18%, transparent 19%) 0 0 / 90px 90px;
  }
  .bg[data-pattern='stripes'] .layer.a {
    background: repeating-linear-gradient(115deg, var(--bg1) 0 14px, transparent 14px 40px);
  }
  .bg[data-pattern='stripes'] .layer.b {
    background: repeating-linear-gradient(65deg, var(--bg2) 0 4px, transparent 4px 58px);
  }
  .bg[data-pattern='cells'] .layer.a {
    background: radial-gradient(circle at 50% 50%, transparent 0 34%, var(--bg1) 35% 40%, transparent 41%) 0 0 / 70px 70px;
  }
  .bg[data-pattern='cells'] .layer.b {
    background: radial-gradient(circle at 50% 50%, var(--bg2) 0 6%, transparent 7%) 20px 20px / 70px 70px;
  }
  .bg[data-pattern='rings'] .layer.a {
    background: repeating-radial-gradient(circle at 50% 50%, var(--bg1) 0 10px, transparent 10px 34px);
  }
  .bg[data-pattern='rings'] .layer.b {
    background: repeating-radial-gradient(circle at 50% 50%, transparent 0 20px, var(--bg3) 20px 22px, transparent 22px 60px);
  }
  @keyframes drift {
    from {
      transform: translate3d(0, 0, 0) rotate(0deg);
    }
    to {
      transform: translate3d(-56px, -56px, 0) rotate(2deg);
    }
  }
  @keyframes breathe {
    from {
      transform: scale(1) rotate(0deg);
    }
    to {
      transform: scale(1.18) rotate(-3deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .layer {
      animation: none;
    }
  }
  .row,
  .bar-label {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: #b8b8d0;
  }
  .stage {
    display: flex;
    justify-content: space-around;
    align-items: flex-end;
    min-height: 68px;
  }
  .fighter {
    position: relative;
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
  }
  .fighter img {
    width: 48px;
    height: 48px;
    image-rendering: pixelated;
    image-rendering: crisp-edges;
  }
  .you img {
    animation: bob 2.4s ease-in-out infinite;
  }
  .enemy img {
    animation: bob 2.4s ease-in-out infinite reverse;
  }
  figcaption {
    font-size: 0.8rem;
    color: #d8d8ea;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  }
  .row,
  .bar-label {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  }
  .vs {
    align-self: center;
    color: #55556f;
    font-size: 0.8rem;
    letter-spacing: 0.2em;
  }
  .enemy.hit img {
    animation: flash 320ms ease-out;
  }
  .you.shake {
    animation: shake 300ms ease-out;
  }
  .float {
    position: absolute;
    top: -0.2rem;
    font-weight: 800;
    font-size: 1.2rem;
    animation: rise 700ms ease-out forwards;
    pointer-events: none;
  }
  .float.dealt {
    color: #ffd166;
  }
  .float.taken {
    color: #e05a5a;
  }
  .bars {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .bar {
    height: 10px;
    border-radius: 5px;
    background: #2e2e48;
    overflow: hidden;
    margin-bottom: 0.3rem;
  }
  .fill {
    height: 100%;
    transition: width 220ms ease-out;
  }
  .enemy .fill {
    background: #e05a5a;
  }
  .player .fill {
    background: #5ac98a;
  }
  @keyframes bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-4px);
    }
  }
  @keyframes flash {
    0% {
      filter: brightness(3) saturate(0);
      transform: translateX(6px) scale(1.08);
    }
    100% {
      filter: none;
      transform: none;
    }
  }
  @keyframes shake {
    0% {
      transform: translateX(-5px);
    }
    40% {
      transform: translateX(5px);
    }
    100% {
      transform: none;
    }
  }
  @keyframes rise {
    from {
      transform: translateY(0);
      opacity: 1;
    }
    to {
      transform: translateY(-26px);
      opacity: 0;
    }
  }
</style>
