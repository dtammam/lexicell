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
  const dealt = $derived(run.lastTurn?.damage ?? 0);
  const taken = $derived(run.lastTurn?.enemyDamage ?? 0);

  function fallback(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    if (!img.src.endsWith('sprites/unknown.png')) img.src = unknown;
  }
</script>

{#if enc}
  <div class="arena act-{act}" data-act={act}>
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
    flex: none;
    border-radius: 14px;
    padding: 0.4rem 0.8rem 0.6rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    background: linear-gradient(180deg, #1f2b3a 0%, #142033 100%);
  }
  /* Three acts, three moods: pond, tide pool, deep. Cosmetic only (pack: theme is art). */
  .act-2 {
    background: linear-gradient(180deg, #2b2340 0%, #1a1530 100%);
  }
  .act-3 {
    background: linear-gradient(180deg, #3a1f2b 0%, #241420 100%);
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
    color: #9a9ab5;
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
