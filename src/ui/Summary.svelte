<script lang="ts">
  import type { RunState } from '../engine/types';
  import Definition from './Definition.svelte';
  import { itemDef } from './lookup';

  let { run, onNewRun }: { run: RunState; onNewRun: () => void } = $props();

  const won = $derived(run.outcome === 'won');
  const reached = $derived(run.stats.hpAtEncounterStart.length);
</script>

<section class="summary">
  <h2 class:won>{won ? 'You won' : 'You died'}</h2>
  <dl>
    <dt>Encounters reached</dt>
    <dd>{reached} / 9</dd>
    <dt>Turns</dt>
    <dd>{run.stats.turns}</dd>
    <dt>Best word</dt>
    <dd>{run.stats.bestWord ? `${run.stats.bestWord.toUpperCase()} (${run.stats.bestWordDamage})` : 'none'}</dd>
    <dt>Damage dealt / taken</dt>
    <dd>{run.stats.damageDealt} / {run.stats.damageTaken}</dd>
    <dt>Items</dt>
    <dd>{run.player.items.length > 0 ? run.player.items.map((id) => itemDef(id).name).join(', ') : 'none'}</dd>
    <dt>Seed</dt>
    <dd><code>{run.rng.seed}</code></dd>
  </dl>
  {#if run.stats.bestWord}
    <Definition word={run.stats.bestWord} />
  {/if}
  <button class="primary" onclick={onNewRun}>New run</button>
</section>

<style>
  .summary {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  h2 {
    margin: 0;
    font-size: 1.8rem;
    color: #e05a5a;
  }
  h2.won {
    color: #5ac98a;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.4rem 1rem;
    margin: 0;
  }
  dt {
    color: #9a9ab5;
  }
  dd {
    margin: 0;
  }
  .primary {
    padding: 0.9rem;
    font-size: 1.1rem;
    border-radius: 10px;
    border: none;
    background: #e05a5a;
    color: white;
    font-weight: 700;
    touch-action: manipulation;
  }
</style>
