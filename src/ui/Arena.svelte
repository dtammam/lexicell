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
  <div class="arena act-{act}" data-act={act} data-pattern={pattern}>
    <div class="bg" data-pattern={pattern} aria-hidden="true">
      <div class="layer a"></div>
      <div class="layer b"></div>
      <div class="layer c"></div>
    </div>
    <div class="row">
      <span>Act {act}</span>
      <span>Encounter {run.encounterIndex + 1} / 9</span>
      <span>Turn {enc.turn}</span>
    </div>
    <div class="stage">
      {#key run.stats.turns}
        <figure class="fighter you" class:shake={taken > 0}>
          <!-- You evolve per act: one cell, then more body, then limbs. -->
          <img src="{base}sprites/player-{act}.png" alt="You" onerror={fallback} />
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
    /* Earthbound palettes (Dean, 2026-09-08): saturated, two clashing hues per act, cycling. */
    --bg0: #0d2a3a;
    --bg1: #1fb5a8;
    --bg2: #ff4fa3;
    --bg3: #ffe66d;
    background: var(--bg0);
  }
  .act-2 {
    --bg0: #1e0f3a;
    --bg1: #7b3fff;
    --bg2: #ff7a00;
    --bg3: #6dfff0;
  }
  .act-3 {
    --bg0: #3a0a1a;
    --bg1: #ff3355;
    --bg2: #2fd67c;
    --bg3: #ffd166;
  }
  /* Three pattern layers behind everything, each looping on its own period so nothing ever
     visibly resets: a drifts by exactly one tile of its pattern, b and c alternate (breathe,
     wave) and never jump, and the whole stack cycles hue. Transform, opacity and filter only. */
  .bg {
    position: absolute;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    animation: hue 40s linear infinite;
  }
  .layer {
    position: absolute;
    inset: -40%;
    will-change: transform;
  }
  .layer.a {
    opacity: 0.75;
    animation: drift-a var(--period-time, 6s) linear infinite;
  }
  .layer.b {
    opacity: 0.55;
    mix-blend-mode: screen;
    animation: breathe 9s ease-in-out infinite alternate;
  }
  .layer.c {
    opacity: 0.35;
    mix-blend-mode: overlay;
    background: repeating-linear-gradient(0deg, transparent 0 14px, var(--bg3) 14px 17px);
    animation: wave 5s ease-in-out infinite alternate;
  }
  /* dots: period 56px in both axes */
  .bg[data-pattern='dots'] .layer.a {
    --dx: -56px;
    --dy: -56px;
    --period-time: 7s;
    background: radial-gradient(circle at 50% 50%, var(--bg2) 0 22%, transparent 24%) 0 0 / 56px 56px;
  }
  .bg[data-pattern='dots'] .layer.b {
    background: radial-gradient(circle at 50% 50%, var(--bg1) 0 30%, transparent 32%) 28px 28px / 84px 84px;
  }
  /* stripes: the pattern repeats every 40px along x; the layer is tilted as a whole, so the
     x-drift stays seamless. */
  .bg[data-pattern='stripes'] .layer.a {
    --dx: -40px;
    --dy: 0px;
    --period-time: 3s;
    --tilt: 25deg;
    background: repeating-linear-gradient(90deg, var(--bg1) 0 18px, var(--bg2) 18px 40px);
  }
  .bg[data-pattern='stripes'] .layer.b {
    background: repeating-linear-gradient(0deg, transparent 0 30px, var(--bg3) 30px 34px);
  }
  /* cells: period 70px */
  .bg[data-pattern='cells'] .layer.a {
    --dx: -70px;
    --dy: -70px;
    --period-time: 9s;
    background: radial-gradient(circle at 50% 50%, transparent 0 30%, var(--bg1) 31% 44%, transparent 45%) 0 0 / 70px 70px;
  }
  .bg[data-pattern='cells'] .layer.b {
    background: radial-gradient(circle at 50% 50%, var(--bg2) 0 12%, transparent 13%) 35px 35px / 70px 70px;
  }
  /* rings: concentric, so they pulse and spin rather than drift (no period to translate by). */
  .bg[data-pattern='rings'] .layer.a {
    --dx: 0px;
    --dy: 0px;
    animation: spin 30s linear infinite;
    background: repeating-radial-gradient(circle at 50% 50%, var(--bg1) 0 16px, var(--bg2) 16px 34px);
  }
  .bg[data-pattern='rings'] .layer.b {
    background: repeating-conic-gradient(from 0deg at 50% 50%, transparent 0 20deg, var(--bg3) 20deg 24deg);
    animation: breathe 7s ease-in-out infinite alternate-reverse;
  }
  @keyframes drift-a {
    from {
      transform: rotate(var(--tilt, 0deg)) translate3d(0, 0, 0);
    }
    to {
      transform: rotate(var(--tilt, 0deg)) translate3d(var(--dx), var(--dy), 0);
    }
  }
  @keyframes breathe {
    from {
      transform: scale(1) rotate(0deg);
    }
    to {
      transform: scale(1.22) rotate(-4deg);
    }
  }
  @keyframes wave {
    from {
      transform: skewX(-6deg) translateY(0);
    }
    to {
      transform: skewX(6deg) translateY(8px);
    }
  }
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes hue {
    from {
      filter: hue-rotate(0deg);
    }
    to {
      filter: hue-rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .layer,
    .bg {
      animation: none;
    }
  }
  /* Text sits on a scrim so the backdrop can be loud. */
  .row,
  .bars {
    background: rgba(8, 10, 24, 0.55);
    border-radius: 8px;
    padding: 0.15rem 0.5rem;
  }
  .row,
  .bar-label {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: #eaeaf4;
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
    filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.6));
  }
  .you img {
    animation: bob 2.4s ease-in-out infinite;
  }
  /* Each enemy floats its own way (Dean, 2026-09-08). */
  .arena[data-pattern='dots'] .enemy img {
    animation: squish 1.8s ease-in-out infinite alternate;
  }
  .arena[data-pattern='stripes'] .enemy img {
    animation: sway 1.4s ease-in-out infinite alternate;
  }
  .arena[data-pattern='cells'] .enemy img {
    animation: pulse 2.6s ease-in-out infinite;
  }
  .arena[data-pattern='rings'] .enemy img {
    animation: wobble 3.2s ease-in-out infinite;
  }
  figcaption {
    font-size: 0.8rem;
    color: #f4f4fa;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 8px rgba(0, 0, 0, 0.6);
  }
  .vs {
    align-self: center;
    color: rgba(255, 255, 255, 0.55);
    font-size: 0.8rem;
    letter-spacing: 0.2em;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
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
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  }
  .float.dealt {
    color: #ffd166;
  }
  .float.taken {
    color: #ff6b6b;
  }
  .bars {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .bar {
    height: 10px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.15);
    overflow: hidden;
    margin-bottom: 0.3rem;
  }
  .fill {
    height: 100%;
    transition: width 220ms ease-out;
  }
  .enemy .fill {
    background: #ff5f7a;
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
  @keyframes squish {
    from {
      transform: scale(1.08, 0.92) translateY(2px);
    }
    to {
      transform: scale(0.94, 1.06) translateY(-3px);
    }
  }
  @keyframes sway {
    from {
      transform: translateX(-5px) rotate(-6deg);
    }
    to {
      transform: translateX(5px) rotate(6deg);
    }
  }
  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.12);
    }
  }
  @keyframes wobble {
    0%,
    100% {
      transform: rotate(-4deg) translateY(0);
    }
    50% {
      transform: rotate(4deg) translateY(-5px);
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
