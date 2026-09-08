<script lang="ts">
  import type { RunState } from '../engine/types';
  import Definition from './Definition.svelte';
  import { itemDef } from './lookup';

  let { run, onNewRun, onHistory }: { run: RunState; onNewRun: () => void; onHistory: () => void } = $props();

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
  <button class="btn life" onclick={onNewRun}>New run</button>
  <button class="btn" onclick={onHistory}>History</button>
</section>

<style>
  .summary {
    display: flex;
    flex-direction: column;
    gap: var(--s4);
  }
  h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--head);
    color: var(--harm);
  }
  h2.won {
    color: var(--life);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--s2) var(--s4);
    margin: 0;
    padding: var(--s3);
    background: var(--panel);
    border: 2px solid var(--shade);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  dt {
    color: var(--muted);
    font-size: var(--text);
  }
  dd {
    margin: 0;
    font-family: var(--font-hud);
    font-variant-numeric: tabular-nums;
    font-weight: 400;
    font-size: var(--hud-m);
  }
  dd code {
    font-family: var(--font-hud);
  }
</style>
