<script lang="ts">
  import { candidateWords, type Candidate } from '../engine/candidates';
  import { selectedWord, type Action, type EngineContext } from '../engine/reducer';
  import { LETTER_VALUE } from '../engine/scoring';
  import type { RunState } from '../engine/types';
  import Arena from './Arena.svelte';
  import Definition from './Definition.svelte';
  import ItemsPanel from './ItemsPanel.svelte';

  let {
    run,
    prev = null,
    dispatch,
    isWord,
    ctx,
  }: { run: RunState; prev?: RunState | null; dispatch: (action: Action) => void; isWord: (word: string) => boolean; ctx: EngineContext } = $props();

  const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
  /**
   * Colour carries what the corner number used to (Dean, 2026-09-08: tiles must read at a
   * glance): vowels warm, common consonants plain, mid-value consonants teal-edged, rare
   * ones (K J X Q Z) magenta with a glow. Selection colours override all of it.
   */
  function tier(letter: string): 'vowel' | 'common' | 'mid' | 'rare' {
    if (VOWELS.has(letter)) return 'vowel';
    const v = LETTER_VALUE[letter] ?? 1;
    return v >= 5 ? 'rare' : v >= 3 ? 'mid' : 'common';
  }

  const enc = $derived(run.encounter);
  const word = $derived(selectedWord(run));
  // The same dictionary the reducer validates against, so green always means Attack will land.
  const valid = $derived(word.length >= 3 && isWord(word));
  const canAttack = $derived(word.length >= 3);

  // Every word on this grid with its damage under the current items, from the engine's own
  // scorer, so the preview matches what Attack will do. Memoised on the grid: a tap changes
  // the selection, not the grid, and solving ~1000 words per tap would be wasteful.
  let candCache: { grid: readonly unknown[] | null; hp: number; items: number; list: Candidate[] } = { grid: null, hp: 0, items: 0, list: [] };
  const candidates = $derived.by(() => {
    const grid = enc?.grid ?? null;
    if (candCache.grid === grid && candCache.hp === run.player.hp && candCache.items === run.player.items.length) return candCache.list;
    const list = grid ? candidateWords(run, ctx) : [];
    candCache = { grid, hp: run.player.hp, items: run.player.items.length, list };
    return list;
  });
  /**
   * The word you missed (Dean, 2026-09-08): after a word is played, the best word that was on
   * that grid. Captured once per turn from `prev`, the state before the action, at the moment
   * the turn changes; later taps move `prev` but not this.
   */
  let missed = $state.raw<Candidate | null>(null);
  let missedTurn = -1;
  $effect(() => {
    const t = run.stats.turns;
    const p = prev;
    if (t === missedTurn) return;
    missedTurn = t;
    if (!p?.encounter || !run.lastTurn || run.lastTurn.word === '') {
      missed = null;
      return;
    }
    let best: Candidate | null = null;
    for (const c of candidateWords(p, ctx)) if (!best || c.damage > best.damage) best = c;
    missed = best;
  });
  const beatable = $derived(missed !== null && run.lastTurn !== null && run.lastTurn.word !== '' && missed.damage > run.lastTurn.damage && missed.word !== run.lastTurn.word);
  const wasBest = $derived(missed !== null && run.lastTurn !== null && run.lastTurn.word !== '' && !beatable);

  /** Damage the selected word would deal, shown before Attack (Dean, 2026-09-08: make me want to hunt). */
  const preview = $derived(valid ? (candidates.find((c) => c.word === word)?.damage ?? null) : null);

  // Shuffle costs the turn (Dean, 2026-09-08). The first tap arms it, the second fires;
  // the arm drops on any other action so a stray tap never spends a turn.
  let armedAt: string | null = $state.raw(null);
  const armKey = $derived(`${run.stats.turns}:${enc?.selection.length ?? 0}:${run.rejected ?? ''}`);
  const shuffleArmed = $derived(armedAt === armKey);
  // Once the key moves (a tap, a clear, a turn), the arm is dropped for good rather than
  // coming back if the selection returns to the same length.
  $effect(() => {
    if (armedAt !== null && armedAt !== armKey) armedAt = null;
  });
  function onShuffle() {
    if (!shuffleArmed) {
      armedAt = armKey;
      return;
    }
    armedAt = null;
    dispatch({ type: 'shuffle' });
  }

  // Gravity animation. lastTurn.used names the tiles consumed before the column settled; from
  // it each tile's start offset in rows is derived: survivors slide down from where they were,
  // fresh tiles rise in from below the grid. Older saves lack `used`; then nothing animates.
  const used = $derived(new Set(run.lastTurn?.used ?? []));
  function entry(index: number): { dy: number; fresh: boolean } | null {
    if (used.size === 0) return null;
    const col = index % 4;
    const row = Math.floor(index / 4);
    const survivorRows = [0, 1, 2, 3].filter((r) => !used.has(r * 4 + col));
    if (row < survivorRows.length) {
      const from = survivorRows[row] ?? row;
      return from === row ? null : { dy: from - row, fresh: false };
    }
    return { dy: 4 - row, fresh: true };
  }

  function orderOf(index: number): number {
    return (enc?.selection.indexOf(index) ?? -1) + 1;
  }
</script>

{#if enc}
  <section class="fight">
    <Arena {run} />

    <div class="report">
      {#key run.stats.turns}
        {#if run.lastTurn && (run.lastTurn.word !== '' || run.lastTurn.scrambled || run.lastTurn.damage > 0 || run.lastTurn.enemyDamage > 0)}
          <!-- Empty word + scrambled is a shuffle; empty word alone is the turn-start report (item damage before a word). -->
          {#if run.lastTurn.word !== ''}
            <span class="hit">{run.lastTurn.word.toUpperCase()} hit for {run.lastTurn.damage}</span>
            {#if run.lastTurn.scrambled}<span class="note">grid scrambled</span>{/if}
          {:else if run.lastTurn.scrambled}
            <span class="hit">Shuffled the grid</span>
            {#if run.lastTurn.damage > 0}<span class="note">turn start: {run.lastTurn.damage} damage</span>{/if}
          {:else}
            <span class="hit">Turn start: {run.lastTurn.damage} damage</span>
          {/if}
          {#if run.lastTurn.enemyDamage > 0}<span class="taken">you took {run.lastTurn.enemyDamage}</span>{/if}
          {#if run.lastTurn.venom > 0}<span class="taken">venom bit for {run.lastTurn.venom}</span>{/if}
          {#if run.lastTurn.healed > 0}<span class="healed">healed {run.lastTurn.healed}</span>{/if}
        {:else}
          <span class="note">Spell a word of 3+ letters</span>
        {/if}
      {/key}
      {#if run.rejected}<span class="rejected">{run.rejected}</span>{/if}
    </div>
    {#if run.lastTurn && run.lastTurn.word !== ''}
      <Definition word={run.lastTurn.word} />
      {#if beatable && missed}
        <p class="missed">Best there: <strong>{missed.word.toUpperCase()}</strong> for {missed.damage}</p>
      {:else if wasBest}
        <p class="missed best">Best word on that grid.</p>
      {/if}
    {/if}

    <div class="word" class:valid>
      <span class="word-text">{word.toUpperCase() || ' '}</span>{#if preview !== null}<span class="preview">{preview}</span>{/if}
    </div>

    <div class="grid-box">
    <div class="grid">
      {#key run.stats.turns}
      {#each enc.grid as tile, i (i)}
        {@const order = orderOf(i)}
        {@const move = entry(i)}
        <button
          class="tile"
          class:moved={move !== null}
          class:fresh={move?.fresh ?? false}
          style={move ? `--dy: ${move.dy}` : undefined}
          class:selected={order > 0}
          class:valid={order > 0 && valid}
          data-tier={tier(tile.letter)}
          class:locked={tile.lockedTurns > 0}
          class:venomous={tile.venom > 0}
          disabled={tile.lockedTurns > 0}
          onclick={() => { dispatch({ type: 'toggleTile', index: i }); }}
        >
          <span class="letter">{tile.letter.toUpperCase()}</span>
          {#if tile.lockedTurns > 0}<span class="value">{`\u{1F512}${tile.lockedTurns}`}</span>{:else if tile.venom > 0}<span class="value venom">{`\u2623${tile.venom}`}</span>{/if}
          {#if order > 0}<span class="order">{order}</span>{/if}
        </button>
      {/each}
      {/key}
    </div>
    </div>

    <div class="actions">
      <button class="btn" disabled={enc.selection.length === 0} onclick={() => { dispatch({ type: 'clearSelection' }); }}>Clear</button>
      <button class="btn shuffle" class:armed={shuffleArmed} onclick={onShuffle}>{shuffleArmed ? 'Shuffle? Costs a turn' : 'Shuffle'}</button>
      <button class="btn primary harm" class:ready={valid} class:life={valid} disabled={!canAttack} onclick={() => { dispatch({ type: 'submitWord' }); }}>
        {preview !== null ? `Attack for ${preview}` : 'Attack'}
      </button>
    </div>

    <ItemsPanel items={run.player.items} />
  </section>
{/if}

<style>
  .fight {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--s2);
  }
  .report {
    flex: none;
    min-height: 1.3rem;
    display: flex;
    flex-wrap: wrap;
    gap: var(--s2) var(--s3);
    font-size: 14px;
    line-height: 1.3;
  }
  .hit {
    color: var(--score);
    font-family: var(--font-hud);
    font-size: var(--hud-m);
    animation: pop var(--dur-settle) var(--ease-settle);
  }
  .taken {
    color: var(--harm);
  }
  .healed {
    color: var(--life);
  }
  .note {
    color: var(--muted);
  }
  .rejected {
    color: var(--harm);
  }
  .missed {
    flex: none;
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }
  .missed strong {
    color: var(--score);
    font-family: var(--font-hud);
    font-size: var(--hud-m);
  }
  .missed.best {
    color: var(--life);
  }
  .word {
    flex: none;
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: var(--s3);
    font-family: var(--font-hud);
    font-size: var(--hud-l);
    letter-spacing: 0.1em;
    min-height: 2rem;
    line-height: 2rem;
    color: var(--ink);
  }
  .word.valid {
    color: var(--life);
  }
  .preview {
    font-family: var(--font-hud);
    font-size: var(--hud-m);
    letter-spacing: 0;
    color: var(--score);
  }
  /* The grid is a square no larger than the space left, read through container query units. */
  .grid-box {
    flex: 1;
    min-height: 0;
    container-type: size;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .grid {
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: repeat(4, minmax(0, 1fr));
    gap: var(--s2);
  }
  .tile {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    border: 2px solid var(--tile-line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-tile);
    background: var(--tile);
    color: var(--tile-ink);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-hud);
    /* Silkscreen wants multiples of 8px: round the tile-scaled size down to one. */
    font-size: 24px;
    font-size: round(down, calc(min(100cqw, 100cqh) / 4 * 0.45), 8px);
    font-weight: 700;
    line-height: 1;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    padding: 0;
    transition: background var(--dur-state) var(--ease-step), border-color var(--dur-state) var(--ease-step), transform var(--dur-state) var(--ease-step), box-shadow var(--dur-state) var(--ease-step);
  }
  .tile:active {
    transform: translate(2px, 2px);
    box-shadow: var(--shadow-press);
  }
  .tile.moved {
    animation: settle var(--dur-settle) var(--ease-settle) both;
  }
  .tile.fresh {
    animation: settle var(--dur-settle) var(--ease-settle) both, appear var(--dur-settle) var(--ease-step) both;
  }
  @keyframes settle {
    from {
      transform: translateY(calc(var(--dy) * (100% + 8px)));
    }
    to {
      transform: none;
    }
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  .tile[data-tier='vowel'] {
    background: var(--tile-vowel);
    border-color: var(--tile-vowel);
    color: var(--tile-vowel-ink);
  }
  .tile[data-tier='mid'] {
    border-color: var(--mid);
  }
  .tile[data-tier='rare'] {
    border-color: var(--rare);
    box-shadow: 0 0 8px rgba(255, 79, 163, 0.55), var(--shadow-tile);
  }
  .tile .value {
    position: absolute;
    right: 4px;
    bottom: 3px;
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    color: var(--muted);
  }
  .tile .order {
    position: absolute;
    left: 4px;
    top: 3px;
    font-family: var(--font-hud);
    font-size: var(--hud-s);
    color: inherit;
    opacity: 0.85;
  }
  .tile.selected {
    background: var(--tile-select);
    border-color: var(--tile-select);
    color: var(--tile-select-ink);
  }
  .tile.selected .value,
  .tile[data-tier='vowel'] .order {
    color: var(--ground);
  }
  .tile.selected.valid {
    background: var(--tile-valid);
    border-color: var(--tile-valid);
    color: var(--tile-valid-ink);
  }
  .tile.locked {
    background: var(--ground);
    color: var(--tile-locked-ink);
    border-style: dashed;
    box-shadow: none;
  }
  .tile.venomous {
    border-color: var(--venom);
    box-shadow: 0 0 8px rgba(125, 255, 90, 0.5), var(--shadow-tile);
  }
  .tile .value.venom {
    color: var(--venom);
  }
  .actions {
    flex: none;
    display: flex;
    gap: var(--s2);
  }
  .actions .btn {
    flex: 1;
  }
  .actions .btn.primary {
    flex: 1.4;
  }
  .shuffle.armed {
    background: var(--harm);
    color: var(--ground);
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
