<script lang="ts">
  import type { Action } from '../engine/reducer';
  import type { RunState } from '../engine/types';
  import { CONTENT } from '../content/index';

  let { run, dispatch }: { run: RunState; dispatch: (action: Action) => void } = $props();

  const def = $derived(CONTENT.events.find((e) => e.id === run.event));
</script>

<!-- An event (variety wave step 2): a small forced trade. The first choice is the trade, the last walks away. -->
<section class="event">
  <h2>{def?.name ?? 'Something in the water'}</h2>
  <p class="text">{def?.text ?? ''}</p>
  <p class="hp">You: {run.player.hp} / {run.player.maxHp} HP</p>
  {#each def?.choices ?? [] as choice, i (choice.label)}
    <button class="choice" class:pass={i === (def?.choices.length ?? 1) - 1} onclick={() => { dispatch({ type: 'eventChoice', index: i }); }}>{choice.label}</button>
  {/each}
  {#if !def}
    <!-- A save carrying an event id that content no longer has (gate W1): the reducer treats any choice as the walk-away. -->
    <button class="choice pass" onclick={() => { dispatch({ type: 'eventChoice', index: 0 }); }}>Move on</button>
  {/if}
</section>

<style>
  .event {
    display: flex;
    flex-direction: column;
    gap: var(--s3);
  }
  h2 {
    margin: 0;
    font-family: var(--font-head);
    font-weight: 400;
    font-size: var(--name);
  }
  .text {
    margin: 0;
    color: var(--ink);
    font-size: var(--text);
    line-height: 1.5;
  }
  .hp {
    margin: 0;
    color: var(--muted);
    font-family: var(--font-hud);
    font-size: var(--hud-s);
  }
  .choice {
    text-align: left;
    padding: var(--s3);
    border: 2px solid var(--life);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    background: var(--panel);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--hud-s);
    line-height: 1.5;
    touch-action: manipulation;
    transition: transform var(--dur-state) var(--ease-step), box-shadow var(--dur-state) var(--ease-step);
  }
  .choice.pass {
    border-color: var(--shade);
    color: var(--muted);
  }
  .choice:active {
    transform: translate(3px, 3px);
    box-shadow: var(--shadow-press);
  }
</style>
