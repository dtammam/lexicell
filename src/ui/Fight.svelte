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
      <button class="secondary" disabled={enc.selection.length === 0} onclick={() => { dispatch({ type: 'clearSelection' }); }}>Clear</button>
      <button class="secondary shuffle" class:armed={shuffleArmed} onclick={onShuffle}>{shuffleArmed ? 'Shuffle? Costs a turn' : 'Shuffle'}</button>
      <button class="primary" class:ready={valid} disabled={!canAttack} onclick={() => { dispatch({ type: 'submitWord' }); }}>
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
    gap: 0.4rem;
  }
  .report {
    flex: none;
    min-height: 1.3rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    font-size: 0.9rem;
    line-height: 1.3;
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
  .missed {
    flex: none;
    margin: 0;
    font-size: 0.85rem;
    color: #9a9ab5;
  }
  .missed strong {
    color: #ffd166;
    letter-spacing: 0.05em;
  }
  .missed.best {
    color: #5ac98a;
  }
  .word {
    flex: none;
    font-family: ui-serif, 'New York', Georgia, 'Times New Roman', serif;
    text-align: center;
    font-size: 1.7rem;
    letter-spacing: 0.18em;
    min-height: 2rem;
    line-height: 2rem;
    font-weight: 800;
    color: #eaeaea;
    transition: color 120ms;
  }
  .word.valid {
    color: #5ac98a;
  }
  .preview {
    margin-left: 0.6rem;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 1.1rem;
    letter-spacing: 0;
    color: #ffd166;
    vertical-align: middle;
  }
  /* The grid is a square no larger than the space left between the word line and the
     buttons, and no wider than the screen: min(width, height) of its box, read through
     container query units. No aspect-ratio anywhere (iOS Safari mishandled it on buttons
     after a rotation), and rows are explicit, so nothing depends on content size. */
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
    gap: 8px;
  }
  .tile {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    border: 2px solid #3d3d5c;
    border-radius: 12px;
    background: #2a2a45;
    color: #f4f4f8;
    display: flex;
    align-items: center;
    justify-content: center;
    /* Serif capitals (Dean, 2026-09-08: Wordle-like, not cartoony; I and L must be obvious).
       ui-serif is New York on iOS; Georgia everywhere else. No font file shipped. */
    font-family: ui-serif, 'New York', Georgia, 'Times New Roman', serif;
    /* Letter scales with the tile: a quarter of the grid's side, less padding. */
    font-size: min(2.1rem, calc(min(100cqw, 100cqh) / 4 * 0.5));
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
  /* --dy is in rows; a row is the tile's own height plus the grid gap. */
  .tile.moved {
    animation: settle 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .tile.fresh {
    animation: settle 300ms cubic-bezier(0.2, 0.8, 0.2, 1) both, appear 300ms ease-out both;
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
    background: #f1e3c0;
    border-color: #e6d19c;
    color: #2a2417;
  }
  .tile[data-tier='mid'] {
    border-color: #3fb8b0;
  }
  .tile[data-tier='rare'] {
    border-color: #d95fd0;
    box-shadow: 0 0 10px rgba(217, 95, 208, 0.45), inset 0 0 6px rgba(217, 95, 208, 0.25);
  }
  .tile[data-tier='vowel'] .order {
    color: #2a2417;
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
  /* Venom: it bites every turn until you spend the tile. Loud on purpose. */
  .tile.venomous {
    border-color: #7dff5a;
    box-shadow: 0 0 10px rgba(125, 255, 90, 0.5), inset 0 0 8px rgba(125, 255, 90, 0.3);
  }
  .tile .value.venom {
    color: #7dff5a;
    font-weight: 700;
  }
  .actions {
    flex: none;
    display: flex;
    gap: 8px;
  }
  .actions button {
    flex: 1;
    padding: 0.8rem 0.5rem;
    font-size: 1.05rem;
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
  .shuffle.armed {
    background: #e05a5a;
    color: white;
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
