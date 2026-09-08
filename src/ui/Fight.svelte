<script lang="ts">
  import { selectedWord, type Action } from '../engine/reducer';
  import { LETTER_VALUE } from '../engine/scoring';
  import type { RunState } from '../engine/types';
  import Definition from './Definition.svelte';
  import { enemyName } from './lookup';

  let {
    run,
    dispatch,
    isWord,
  }: { run: RunState; dispatch: (action: Action) => void; isWord: (word: string) => boolean } = $props();

  const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

  const enc = $derived(run.encounter);
  const word = $derived(selectedWord(run));
  const encounterNo = $derived(run.encounterIndex + 1);
  // The same dictionary the reducer validates against, so green always means Attack will land.
  const valid = $derived(word.length >= 3 && isWord(word));
  const canAttack = $derived(word.length >= 3);

  function orderOf(index: number): number {
    return (enc?.selection.indexOf(index) ?? -1) + 1;
  }
</script>

{#if enc}
  <section class="fight">
    <header>
      <div class="row">
        <span>Encounter {encounterNo} / 9</span>
        <span>Turn {enc.turn}</span>
      </div>
      <div class="bar-label">
        <strong>{enemyName(enc.enemy.id)}</strong>
        <span>{enc.enemy.hp} / {enc.enemy.maxHp}</span>
      </div>
      <div class="bar enemy"><div class="fill" style="width: {(100 * enc.enemy.hp) / enc.enemy.maxHp}%"></div></div>
      <div class="bar-label">
        <strong>You</strong>
        <span>{run.player.hp} / {run.player.maxHp}</span>
      </div>
      <div class="bar player"><div class="fill" style="width: {(100 * run.player.hp) / run.player.maxHp}%"></div></div>
    </header>

    <div class="report">
      {#key run.stats.turns}
        {#if run.lastTurn && (run.lastTurn.word !== '' || run.lastTurn.damage > 0 || run.lastTurn.enemyDamage > 0)}
          <!-- An empty word is the turn-start report: item damage before any word was played. -->
          <span class="hit">{run.lastTurn.word === '' ? `Turn start: ${run.lastTurn.damage} damage` : `${run.lastTurn.word.toUpperCase()} hit for ${run.lastTurn.damage}`}</span>
          {#if run.lastTurn.enemyDamage > 0}<span class="taken">you took {run.lastTurn.enemyDamage}</span>{/if}
          {#if run.lastTurn.healed > 0}<span class="healed">healed {run.lastTurn.healed}</span>{/if}
          {#if run.lastTurn.scrambled}<span class="note">grid scrambled</span>{/if}
        {:else}
          <span class="note">Spell a word of 3+ letters</span>
        {/if}
      {/key}
      {#if run.rejected}<span class="rejected">{run.rejected}</span>{/if}
    </div>
    {#if run.lastTurn && run.lastTurn.word !== ''}
      <Definition word={run.lastTurn.word} />
    {/if}

    <div class="word" class:valid>{word.toUpperCase() || ' '}</div>

    <div class="grid">
      {#each enc.grid as tile, i (i)}
        {@const order = orderOf(i)}
        <button
          class="tile"
          class:selected={order > 0}
          class:valid={order > 0 && valid}
          class:vowel={VOWELS.has(tile.letter)}
          class:locked={tile.lockedTurns > 0}
          disabled={tile.lockedTurns > 0}
          onclick={() => { dispatch({ type: 'toggleTile', index: i }); }}
        >
          <span class="letter">{tile.letter.toUpperCase()}</span>
          <span class="value">{tile.lockedTurns > 0 ? `\u{1F512}${tile.lockedTurns}` : (LETTER_VALUE[tile.letter] ?? '')}</span>
          {#if order > 0}<span class="order">{order}</span>{/if}
        </button>
      {/each}
    </div>

    <div class="actions">
      <button class="secondary" disabled={enc.selection.length === 0} onclick={() => { dispatch({ type: 'clearSelection' }); }}>Clear</button>
      <button class="primary" class:ready={valid} disabled={!canAttack} onclick={() => { dispatch({ type: 'submitWord' }); }}>Attack</button>
    </div>

    {#if run.player.items.length > 0}
      <div class="items">Items: {run.player.items.join(', ')}</div>
    {/if}
  </section>
{/if}

<style>
  .fight {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .row,
  .bar-label {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
  }
  .bar {
    height: 10px;
    border-radius: 5px;
    background: #2e2e48;
    overflow: hidden;
    margin-bottom: 0.4rem;
  }
  .fill {
    height: 100%;
    transition: width 200ms ease-out;
  }
  .enemy .fill {
    background: #e05a5a;
  }
  .player .fill {
    background: #5ac98a;
  }
  .report {
    min-height: 1.4rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    font-size: 0.95rem;
  }
  .hit {
    color: #ffd166;
    font-weight: 600;
    animation: pop 250ms ease-out;
  }
  .taken {
    color: #e05a5a;
  }
  .healed {
    color: #5ac98a;
  }
  .note {
    color: #9a9ab5;
  }
  .rejected {
    color: #ff8fa3;
  }
  .word {
    text-align: center;
    font-size: 1.9rem;
    letter-spacing: 0.18em;
    min-height: 2.3rem;
    font-weight: 800;
    color: #eaeaea;
    transition: color 120ms;
  }
  .word.valid {
    color: #5ac98a;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  .tile {
    position: relative;
    aspect-ratio: 1;
    border: 2px solid #3d3d5c;
    border-radius: 12px;
    background: #2a2a45;
    color: #f4f4f8;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.1rem;
    font-weight: 800;
    line-height: 1;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    padding: 0;
    transition: background 100ms, border-color 100ms, transform 100ms;
  }
  .tile:active {
    transform: scale(0.95);
  }
  .tile.vowel {
    background: #33304f;
    border-color: #55507a;
  }
  .tile .value {
    position: absolute;
    right: 5px;
    bottom: 3px;
    font-size: 0.7rem;
    font-weight: 500;
    color: #9a9ab5;
  }
  .tile .order {
    position: absolute;
    left: 5px;
    top: 3px;
    font-size: 0.7rem;
    font-weight: 700;
    color: inherit;
    opacity: 0.8;
  }
  .tile.selected {
    background: #ffd166;
    border-color: #ffd166;
    color: #1a1a2e;
  }
  .tile.selected .value {
    color: #1a1a2e;
  }
  .tile.selected.valid {
    background: #5ac98a;
    border-color: #5ac98a;
  }
  .tile.locked {
    background: #1a1a2e;
    color: #55556f;
    border-style: dashed;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .actions button {
    flex: 1;
    padding: 1rem;
    font-size: 1.15rem;
    border-radius: 12px;
    border: none;
    touch-action: manipulation;
    transition: background 120ms;
  }
  .primary {
    background: #e05a5a;
    color: white;
    font-weight: 700;
  }
  .primary.ready {
    background: #5ac98a;
    color: #1a1a2e;
  }
  .primary:disabled {
    background: #4a3a3a;
    color: #8a7a7a;
  }
  .secondary {
    background: #3d3d5c;
    color: #eaeaea;
  }
  .secondary:disabled {
    color: #6a6a85;
  }
  .items {
    font-size: 0.85rem;
    color: #9a9ab5;
  }
  @keyframes pop {
    from {
      transform: scale(1.4);
      opacity: 0.4;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
